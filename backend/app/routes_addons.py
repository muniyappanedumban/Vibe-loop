"""VibeLoop add-ons, batch 1 — each one switchable in User App Settings (addons.glow.* / addons.hush.*).

Glow
  Daily Spark   one question per day; everyone answers once; cheer answers you like. Staff set questions (else a pool rotates).
  Time Capsules seal a note (+ optional media) until a date; then it opens for you, or for your friends.
  Kudos         give a thank-you badge (Helpful / Made my day / Creative / Brave / Kind) — capped per day; weekly board.
Hush
  Pacts         shared checklist inside a chat; every member adds, ticks and un-ticks; optional due date.
  Hush Tab      log a shared expense in a chat, split equally or by amount; members mark their share settled. No money moves.
  Safe Arrival  "I'll be home by 10:30" — check in before then, or the watchers you picked get an alert.
"""
import threading, logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .db import get_db, SessionLocal
from . import models as M
from .security import current_user, require, audit
from .v2common import user_json, are_friends

log = logging.getLogger("vibeloop.addons")
router = APIRouter()
STAFF = require("owner", "admin", "moderator", "support")
DAY = 86_400_000

def on(db: Session, u: M.User | None, path: str):
    from .user_app import setting
    return setting(db, path, u)

def need(db: Session, u: M.User | None, path: str, name: str):
    if not on(db, u, path): raise HTTPException(403, f"{name} is turned off")

def push(uid: str, title: str, body: str, route: str, params: dict | None = None):
    try:
        from .push import queue
        queue(uid, "addon", title, body, {"route": route, "params": params or {}})
    except Exception: pass

def who(db: Session, uid: str) -> dict | None:
    u = db.get(M.User, uid); return user_json(u) if u else None

# =====================================================================
# Glow · Daily Spark
# =====================================================================
POOL = ["What's a small habit that changed your year?", "Which song is stuck in your head today?", "Best thing you ate this week?",
        "One place in your city everyone should see?", "What are you learning right now?", "A compliment you still remember?",
        "What would you do with a free Saturday?", "Your go-to comfort show?", "Something you're proud of this month?",
        "Which app could you never delete?", "A tiny thing that made you smile today?", "What's your hidden talent?",
        "Tea or coffee — and how?", "Best advice you've been given?"]

def today() -> str: return datetime.now(timezone.utc).strftime("%Y-%m-%d")

def question_for(db: Session, day: str) -> str:
    q = db.get(M.SparkQuestion, day)
    if q: return q.text
    n = (datetime.strptime(day, "%Y-%m-%d").date() - datetime(2026, 1, 1).date()).days
    return POOL[n % len(POOL)]

def answer_json(db: Session, a: M.SparkAnswer, me: M.User) -> dict:
    return {"id": a.id, "text": a.text, "at": a.at, "user": who(db, a.user_id), "mine": a.user_id == me.id,
            "cheers": len(a.cheers or []), "cheered": me.id in (a.cheers or [])}

@router.get("/addons/spark")
def spark_today(day: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"), cursor: int = Query(0, ge=0), u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.dailySpark", "Daily Spark")
    d = day or today()
    if d > today(): raise HTTPException(400, "That day hasn't happened yet")
    mine = db.scalar(select(M.SparkAnswer).where(M.SparkAnswer.day == d, M.SparkAnswer.user_id == u.id))
    total = db.scalar(select(func.count()).select_from(M.SparkAnswer).where(M.SparkAnswer.day == d)) or 0
    from .routes_trust import restricted
    blocked = set(db.scalars(select(M.Edge.target).where(M.Edge.user_id == u.id, M.Edge.kind == "block")))
    # answers are revealed once you've answered (no copying) — past days are always open
    rows = [] if (d == today() and not mine) else db.scalars(select(M.SparkAnswer).where(M.SparkAnswer.day == d).order_by(M.SparkAnswer.at.desc()).offset(cursor).limit(30)).all()
    rows = [a for a in rows if a.user_id not in blocked]
    return {"day": d, "question": question_for(db, d), "answered": bool(mine), "mine": answer_json(db, mine, u) if mine else None, "total": total,
            "answers": [answer_json(db, a, u) for a in rows], "nextCursor": cursor + 30 if len(rows) == 30 else None}

class SparkIn(BaseModel): text: str = Field(min_length=1, max_length=280)
@router.post("/addons/spark")
def spark_answer(b: SparkIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.dailySpark", "Daily Spark")
    from .routes_trust import assert_not_restricted
    assert_not_restricted(u)
    d = today(); a = db.scalar(select(M.SparkAnswer).where(M.SparkAnswer.day == d, M.SparkAnswer.user_id == u.id))
    if a: a.text = b.text.strip()  # one answer per day — answering again edits it
    else: a = M.SparkAnswer(day=d, user_id=u.id, text=b.text.strip()); db.add(a)
    db.commit(); return answer_json(db, a, u)

@router.post("/addons/spark/{aid}/cheer")
def spark_cheer(aid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.dailySpark", "Daily Spark")
    a = db.get(M.SparkAnswer, aid)
    if not a: raise HTTPException(404, "Answer not found")
    ch = list(a.cheers or [])
    if u.id in ch: ch.remove(u.id)
    else:
        ch.append(u.id)
        if a.user_id != u.id and len(ch) in (1, 10, 50): push(a.user_id, "Your Daily Spark got cheers", f"{len(ch)} cheer{'s' if len(ch) > 1 else ''} on your answer", "DailySpark")
    a.cheers = ch; db.commit(); return answer_json(db, a, u)

class SparkQIn(BaseModel): day: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$"); text: str = Field(min_length=5, max_length=200)
@router.get("/admin/addons/spark")
def admin_spark_list(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    base = datetime.now(timezone.utc).date()
    days = [(base + timedelta(days=i)).isoformat() for i in range(-7, 15)]
    counts = dict(db.execute(select(M.SparkAnswer.day, func.count()).where(M.SparkAnswer.day.in_(days)).group_by(M.SparkAnswer.day)).all())
    return [{"day": d, "question": question_for(db, d), "custom": db.get(M.SparkQuestion, d) is not None, "answers": counts.get(d, 0)} for d in days]
@router.put("/admin/addons/spark")
def admin_spark_set(b: SparkQIn, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    q = db.get(M.SparkQuestion, b.day)
    if q: q.text = b.text.strip(); q.set_by = a.handle
    else: db.add(M.SparkQuestion(day=b.day, text=b.text.strip(), set_by=a.handle))
    audit(db, a.handle, "addons.spark_set", f"{b.day} {b.text[:80]}"); db.commit(); return {"ok": True}
@router.delete("/admin/addons/spark/{day}")
def admin_spark_reset(day: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    if q := db.get(M.SparkQuestion, day): db.delete(q)
    audit(db, a.handle, "addons.spark_reset", day); db.commit(); return {"ok": True}
@router.delete("/admin/addons/spark/answers/{aid}")
def admin_spark_remove(aid: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    if x := db.get(M.SparkAnswer, aid): db.delete(x)
    audit(db, a.handle, "addons.spark_remove", aid); db.commit(); return {"ok": True}

# =====================================================================
# Glow · Time Capsules
# =====================================================================
def capsule_json(db: Session, c: M.Capsule, me: M.User) -> dict:
    sealed = c.unlock_at > M.now_ms()
    return {"id": c.id, "title": c.title, "audience": c.audience, "unlockAt": c.unlock_at, "at": c.at, "sealed": sealed, "mine": c.owner_id == me.id,
            "owner": who(db, c.owner_id), "text": None if sealed else c.text, "mediaUrl": None if sealed else c.media_url}

class CapsuleIn(BaseModel):
    title: str = Field(min_length=1, max_length=80); text: str = Field(min_length=1, max_length=5000); mediaUrl: str | None = Field(default=None, max_length=200)
    audience: str = Field(default="me", pattern=r"^(me|friends)$"); unlockAt: int
@router.post("/addons/capsules")
def capsule_create(b: CapsuleIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.capsules", "Time Capsules")
    now = M.now_ms(); mx = on(db, u, "addons.glow.capsuleMaxDays")
    if not now + 60_000 <= b.unlockAt <= now + mx * DAY: raise HTTPException(400, f"Pick an unlock time between 1 minute and {mx} days from now")
    if b.mediaUrl:
        from .routes_media import mark_public
        if b.audience == "friends": mark_public(db, b.mediaUrl, u)
        mf = db.get(M.MediaFile, b.mediaUrl.split("/")[-1].split(".")[0])
        if not mf or mf.owner_id != u.id: raise HTTPException(400, "Upload the file first")
    c = M.Capsule(owner_id=u.id, title=b.title.strip(), text=b.text.strip(), media_url=b.mediaUrl, audience=b.audience, unlock_at=b.unlockAt)
    db.add(c); db.commit(); return capsule_json(db, c, u)

@router.get("/addons/capsules")
def capsule_list(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.capsules", "Time Capsules")
    mine = db.scalars(select(M.Capsule).where(M.Capsule.owner_id == u.id).order_by(M.Capsule.unlock_at)).all()
    friend_ids = set(db.scalars(select(M.Friend.friend_id).where(M.Friend.user_id == u.id)))
    shared = db.scalars(select(M.Capsule).where(M.Capsule.owner_id.in_(friend_ids or {"-"}), M.Capsule.audience == "friends", M.Capsule.unlock_at <= M.now_ms())
                        .order_by(M.Capsule.unlock_at.desc()).limit(50)).all() if friend_ids else []
    return {"mine": [capsule_json(db, c, u) for c in mine], "opened": [capsule_json(db, c, u) for c in shared]}

@router.get("/addons/capsules/{cid}")
def capsule_get(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.capsules", "Time Capsules")
    c = db.get(M.Capsule, cid)
    if not c or not (c.owner_id == u.id or (c.audience == "friends" and are_friends(db, u.id, c.owner_id) and c.unlock_at <= M.now_ms())): raise HTTPException(404, "Capsule not found")
    return capsule_json(db, c, u)

@router.delete("/addons/capsules/{cid}")
def capsule_delete(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    c = db.get(M.Capsule, cid)
    if not c or c.owner_id != u.id: raise HTTPException(404, "Capsule not found")
    db.delete(c); db.commit(); return {"ok": True}

# =====================================================================
# Glow · Kudos
# =====================================================================
KUDOS = {"helpful": "Helpful", "madeMyDay": "Made my day", "creative": "Creative", "brave": "Brave", "kind": "Kind"}
class KudosIn(BaseModel): to: str = Field(min_length=1, max_length=60); kind: str = Field(pattern=r"^(helpful|madeMyDay|creative|brave|kind)$"); note: str = Field(default="", max_length=140)
@router.post("/addons/kudos")
def kudos_give(b: KudosIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.kudos", "Kudos")
    from .v2common import find_by_handle, blocked_between
    t = db.get(M.User, b.to) or find_by_handle(db, b.to)
    if not t or t.suspended: raise HTTPException(404, "No one with that @ID")
    if t.id == u.id: raise HTTPException(400, "You can't give kudos to yourself")
    if blocked_between(db, u.id, t.id): raise HTTPException(403, "You can't give kudos to this person")
    used = db.scalar(select(func.count()).select_from(M.Kudos).where(M.Kudos.from_id == u.id, M.Kudos.at > M.now_ms() - DAY)) or 0
    if used >= (cap := on(db, u, "addons.glow.kudosPerDay")): raise HTTPException(429, f"You've given your {cap} kudos for today — more tomorrow")
    k = M.Kudos(from_id=u.id, to_id=t.id, kind=b.kind, note=b.note.strip()); db.add(k); db.commit()
    push(t.id, f"{u.name} gave you kudos", f"{KUDOS[b.kind]}{' — ' + b.note.strip() if b.note.strip() else ''}", "Kudos")
    return {"id": k.id, "kind": k.kind, "left": cap - used - 1}

@router.get("/addons/kudos")
def kudos_board(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.kudos", "Kudos")
    week = M.now_ms() - 7 * DAY
    board = db.execute(select(M.Kudos.to_id, func.count()).where(M.Kudos.at > week).group_by(M.Kudos.to_id).order_by(func.count().desc()).limit(20)).all()
    got = db.scalars(select(M.Kudos).where(M.Kudos.to_id == u.id).order_by(M.Kudos.at.desc()).limit(50)).all()
    mine = dict(db.execute(select(M.Kudos.kind, func.count()).where(M.Kudos.to_id == u.id).group_by(M.Kudos.kind)).all())
    used = db.scalar(select(func.count()).select_from(M.Kudos).where(M.Kudos.from_id == u.id, M.Kudos.at > M.now_ms() - DAY)) or 0
    return {"kinds": KUDOS, "left": max(0, on(db, u, "addons.glow.kudosPerDay") - used),
            "board": [{"user": who(db, uid), "count": n} for uid, n in board],
            "received": [{"id": k.id, "kind": k.kind, "label": KUDOS.get(k.kind, k.kind), "note": k.note, "at": k.at, "from": who(db, k.from_id)} for k in got],
            "totals": {KUDOS[k]: mine.get(k, 0) for k in KUDOS}}

# =====================================================================
# Hush · Pacts
# =====================================================================
def conv_for(db: Session, cid: str, u: M.User) -> M.Conv:
    from .routes_chat import get_conv
    return get_conv(db, cid, u)

def pact_json(db: Session, p: M.Pact) -> dict:
    items = p.items or []
    return {"id": p.id, "convId": p.conv_id, "title": p.title, "dueAt": p.due_at, "at": p.at, "createdBy": who(db, p.created_by),
            "items": items, "done": sum(1 for i in items if i.get("done")), "total": len(items)}

class PactIn(BaseModel): title: str = Field(min_length=1, max_length=80); items: list[str] = Field(default_factory=list, max_length=50); dueAt: int | None = None
@router.post("/addons/convs/{cid}/pacts")
def pact_create(cid: str, b: PactIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.pacts", "Pacts"); c = conv_for(db, cid, u)
    if b.dueAt is not None and b.dueAt < M.now_ms(): raise HTTPException(400, "Due date is in the past")
    items = [{"id": M.nid("pi"), "text": t.strip()[:140], "done": False, "by": None, "at": None} for t in b.items if t.strip()]
    p = M.Pact(conv_id=c.id, created_by=u.id, title=b.title.strip(), items=items, due_at=b.dueAt); db.add(p); db.commit()
    for m in c.members:
        if m != u.id: push(m, f"New Pact: {p.title}", f"{u.name} started a shared checklist", "Pacts", {"convId": c.id})
    return pact_json(db, p)

@router.get("/addons/convs/{cid}/pacts")
def pact_list(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.pacts", "Pacts"); c = conv_for(db, cid, u)
    return [pact_json(db, p) for p in db.scalars(select(M.Pact).where(M.Pact.conv_id == c.id).order_by(M.Pact.at.desc()))]

class PactPatch(BaseModel):
    add: str | None = Field(default=None, max_length=140); toggle: str | None = None; remove: str | None = None; title: str | None = Field(default=None, max_length=80)
@router.patch("/addons/pacts/{pid}")
def pact_update(pid: str, b: PactPatch, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.pacts", "Pacts")
    p = db.get(M.Pact, pid)
    if not p: raise HTTPException(404, "Pact not found")
    conv_for(db, p.conv_id, u)  # members only
    items = [dict(i) for i in (p.items or [])]
    if b.add and b.add.strip():
        if len(items) >= 100: raise HTTPException(400, "A Pact holds up to 100 items")
        items.append({"id": M.nid("pi"), "text": b.add.strip(), "done": False, "by": None, "at": None})
    if b.toggle:
        it = next((i for i in items if i["id"] == b.toggle), None)
        if not it: raise HTTPException(404, "Item not found")
        it["done"] = not it["done"]; it["by"] = u.id if it["done"] else None; it["at"] = M.now_ms() if it["done"] else None
    if b.remove: items = [i for i in items if i["id"] != b.remove]
    if b.title and b.title.strip(): p.title = b.title.strip()
    p.items = items; db.commit(); return pact_json(db, p)

@router.delete("/addons/pacts/{pid}")
def pact_delete(pid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(M.Pact, pid)
    if not p: raise HTTPException(404, "Pact not found")
    conv_for(db, p.conv_id, u)
    if p.created_by != u.id: raise HTTPException(403, "Only the person who started this Pact can delete it")
    db.delete(p); db.commit(); return {"ok": True}

# =====================================================================
# Hush · Tab (split expenses)
# =====================================================================
def tab_json(db: Session, t: M.Tab) -> dict:
    return {"id": t.id, "convId": t.conv_id, "title": t.title, "amount": t.amount, "currency": t.currency, "at": t.at, "paidBy": who(db, t.paid_by),
            "split": [{"user": who(db, uid), "share": share, "settled": uid in (t.settled or []) or uid == t.paid_by} for uid, share in (t.split or {}).items()]}

class TabIn(BaseModel):
    title: str = Field(min_length=1, max_length=80); amount: int = Field(gt=0, le=100_000_000); currency: str = Field(default="INR", pattern=r"^[A-Z]{3}$")
    members: list[str] | None = None; shares: dict[str, int] | None = None
@router.post("/addons/convs/{cid}/tabs")
def tab_create(cid: str, b: TabIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.tab", "Hush Tab"); c = conv_for(db, cid, u)
    if b.shares:
        if not set(b.shares) <= set(c.members): raise HTTPException(400, "Everyone in the split must be in this chat")
        if sum(b.shares.values()) != b.amount or any(v < 0 for v in b.shares.values()): raise HTTPException(400, "Shares must add up to the total")
        split = dict(b.shares)
    else:
        people = b.members or list(c.members)
        if not set(people) <= set(c.members) or not people: raise HTTPException(400, "Everyone in the split must be in this chat")
        base, extra = divmod(b.amount, len(people))  # equal split; leftover paise go to the first people so it adds up exactly
        split = {uid: base + (1 if i < extra else 0) for i, uid in enumerate(people)}
    t = M.Tab(conv_id=c.id, paid_by=u.id, title=b.title.strip(), amount=b.amount, currency=b.currency, split=split, settled=[])
    db.add(t); db.commit()
    for m in split:
        if m != u.id: push(m, f"{u.name} added to the Tab", f"{t.title}: your share {split[m] / 100:.2f} {t.currency}", "HushTab", {"convId": c.id})
    return tab_json(db, t)

@router.get("/addons/convs/{cid}/tabs")
def tab_list(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.tab", "Hush Tab"); c = conv_for(db, cid, u)
    tabs = db.scalars(select(M.Tab).where(M.Tab.conv_id == c.id).order_by(M.Tab.at.desc())).all()
    # net balances: positive = others owe you
    bal: dict[str, int] = {}
    for t in tabs:
        for uid, share in (t.split or {}).items():
            if uid == t.paid_by or uid in (t.settled or []): continue
            bal[uid] = bal.get(uid, 0) - share; bal[t.paid_by] = bal.get(t.paid_by, 0) + share
    return {"tabs": [tab_json(db, t) for t in tabs], "balances": [{"user": who(db, uid), "net": n} for uid, n in sorted(bal.items(), key=lambda x: x[1]) if n],
            "myNet": bal.get(u.id, 0)}

@router.post("/addons/tabs/{tid}/settle")
def tab_settle(tid: str, uid: str | None = None, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    """Mark a share settled: by the person who owes (their own share), or by the payer (anyone's share)."""
    need(db, u, "addons.hush.tab", "Hush Tab")
    t = db.get(M.Tab, tid)
    if not t: raise HTTPException(404, "Tab not found")
    conv_for(db, t.conv_id, u)
    target = uid or u.id
    if target not in (t.split or {}): raise HTTPException(400, "Not part of this split")
    if target != u.id and u.id != t.paid_by: raise HTTPException(403, "Only the payer can settle someone else's share")
    st = list(t.settled or [])
    if target not in st: st.append(target)
    t.settled = st; db.commit()
    if u.id != t.paid_by: push(t.paid_by, "Tab settled", f"{u.name} settled {t.title}", "HushTab", {"convId": t.conv_id})
    return tab_json(db, t)

@router.delete("/addons/tabs/{tid}")
def tab_delete(tid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    t = db.get(M.Tab, tid)
    if not t: raise HTTPException(404, "Tab not found")
    conv_for(db, t.conv_id, u)
    if t.paid_by != u.id: raise HTTPException(403, "Only the payer can delete this")
    db.delete(t); db.commit(); return {"ok": True}

# =====================================================================
# Hush · Safe Arrival
# =====================================================================
def sa_json(db: Session, s: M.SafeArrival) -> dict:
    return {"id": s.id, "note": s.note, "dueAt": s.due_at, "status": s.status, "at": s.at, "closedAt": s.closed_at, "user": who(db, s.user_id),
            "watchers": [who(db, w) for w in (s.watchers or [])]}

class SafeIn(BaseModel): minutes: int = Field(ge=5, le=72 * 60); watchers: list[str] = Field(min_length=1, max_length=5); note: str = Field(default="", max_length=120)
@router.post("/addons/safe-arrival")
def safe_start(b: SafeIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.safeArrival", "Safe Arrival")
    if b.minutes > on(db, u, "addons.hush.safeArrivalMaxHours") * 60: raise HTTPException(400, "That timer is longer than allowed")
    if any(not are_friends(db, u.id, w) for w in b.watchers): raise HTTPException(400, "Watchers must be in your Squad (friends)")
    for old in db.scalars(select(M.SafeArrival).where(M.SafeArrival.user_id == u.id, M.SafeArrival.status == "active")): old.status = "cancelled"; old.closed_at = M.now_ms()
    s = M.SafeArrival(user_id=u.id, note=b.note.strip(), watchers=list(dict.fromkeys(b.watchers)), due_at=M.now_ms() + b.minutes * 60_000)
    db.add(s); db.commit()
    for w in s.watchers: push(w, f"{u.name} started Safe Arrival", f"Expected by {datetime.fromtimestamp(s.due_at / 1000, timezone.utc).strftime('%H:%M UTC')}. You'll hear if they don't check in.", "SafeArrival")
    return sa_json(db, s)

@router.get("/addons/safe-arrival")
def safe_get(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.safeArrival", "Safe Arrival")
    check_overdue(db)
    mine = db.scalar(select(M.SafeArrival).where(M.SafeArrival.user_id == u.id).order_by(M.SafeArrival.at.desc()).limit(1))
    watching = [s for s in db.scalars(select(M.SafeArrival).where(M.SafeArrival.status.in_(["active", "alerted"])).order_by(M.SafeArrival.due_at)) if u.id in (s.watchers or [])]
    return {"mine": sa_json(db, mine) if mine and mine.status in ("active", "alerted") else None, "watching": [sa_json(db, s) for s in watching]}

class SafeAct(BaseModel): action: str = Field(pattern=r"^(arrived|cancel|extend)$"); minutes: int = Field(default=15, ge=5, le=240)
@router.post("/addons/safe-arrival/{sid}")
def safe_act(sid: str, b: SafeAct, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    s = db.get(M.SafeArrival, sid)
    if not s or s.user_id != u.id: raise HTTPException(404, "Not found")
    if s.status not in ("active", "alerted"): raise HTTPException(409, "This check-in is already closed")
    if b.action == "extend": s.due_at = max(s.due_at, M.now_ms()) + b.minutes * 60_000; s.status = "active"
    else:
        was_alerted = s.status == "alerted"
        s.status = "arrived" if b.action == "arrived" else "cancelled"; s.closed_at = M.now_ms()
        if b.action == "arrived":
            for w in s.watchers or []: push(w, f"{u.name} arrived safely", s.note or "Checked in", "SafeArrival")
        elif was_alerted:
            for w in s.watchers or []: push(w, f"{u.name} is okay", "They cancelled the alert", "SafeArrival")
    db.commit(); return sa_json(db, s)

def check_overdue(db: Session) -> int:
    n = 0
    for s in db.scalars(select(M.SafeArrival).where(M.SafeArrival.status == "active", M.SafeArrival.due_at <= M.now_ms())):
        s.status = "alerted"; n += 1
        u = db.get(M.User, s.user_id)
        for w in s.watchers or []:
            push(w, f"{u.name if u else 'Your friend'} hasn't checked in", f"They expected to arrive by now{' — ' + s.note if s.note else ''}. Give them a call.", "SafeArrival")
    if n: db.commit()
    return n

def addons_loop(stop: threading.Event, every_sec: int = 60):
    while not stop.wait(every_sec):
        db = SessionLocal()
        try: check_overdue(db)
        except Exception: log.exception("safe-arrival check failed"); db.rollback()
        finally: db.close()

# ---------- admin overview ----------
@router.get("/admin/addons")
def admin_addons(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    wk = M.now_ms() - 7 * DAY
    c = lambda model, col: db.scalar(select(func.count()).select_from(model).where(col > wk)) or 0  # noqa: E731
    return {"glow": {"dailySpark": {"on": on(db, None, "addons.glow.dailySpark"), "week": c(M.SparkAnswer, M.SparkAnswer.at)},
                     "capsules": {"on": on(db, None, "addons.glow.capsules"), "week": c(M.Capsule, M.Capsule.at)},
                     "kudos": {"on": on(db, None, "addons.glow.kudos"), "week": c(M.Kudos, M.Kudos.at)}},
            "hush": {"pacts": {"on": on(db, None, "addons.hush.pacts"), "week": c(M.Pact, M.Pact.at)},
                     "tab": {"on": on(db, None, "addons.hush.tab"), "week": c(M.Tab, M.Tab.at)},
                     "safeArrival": {"on": on(db, None, "addons.hush.safeArrival"), "week": c(M.SafeArrival, M.SafeArrival.at),
                                     "alertedNow": db.scalar(select(func.count()).select_from(M.SafeArrival).where(M.SafeArrival.status == "alerted")) or 0}}}
