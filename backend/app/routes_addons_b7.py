"""Add-on batch 7 (Hush) — each one switchable in User App Settings (addons.hush.*).

  Chore Rotation  chores in a chat with a rotating order; the person on duty marks it done and it passes to the next; overdue flag.
  Watch Queue     shared watch list in a chat; members upvote; mark watched with a 1–5 rating (average shown).
  Secret Santa    organiser opens a draw in a group chat, members join, organiser draws; nobody gets themselves; you only see your own match.
  Lend Log        things lent between two members of a chat; due date, returned toggle, gentle reminders.
  Habit Buddies   two friends share a habit; each checks in daily; the shared streak counts only days both checked in.
  Trip Planner    itinerary per chat: days with ordered stops (time, title, note); members add, reorder and delete.
"""
import random
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import String, BigInteger, Integer, Boolean, JSON, ForeignKey, UniqueConstraint, select, func
from sqlalchemy.orm import Session, Mapped, mapped_column
from .db import get_db
from . import models as M
from .models import Base, nid, now_ms
from .security import current_user, require, audit
from .v2common import are_friends
from .routes_addons import on, need, push, who, conv_for, DAY

router = APIRouter()
STAFF = require("owner", "admin", "moderator", "support")
UID = lambda: mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)  # noqa: E731

# =====================================================================
# models
# =====================================================================
class B7Chore(Base):
    __tablename__ = "b7_chores"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("chr"))
    conv_id: Mapped[str] = mapped_column(String(40), index=True); created_by: Mapped[str] = UID()
    title: Mapped[str] = mapped_column(String(80)); rota: Mapped[list] = mapped_column(JSON, default=list); turn: Mapped[int] = mapped_column(Integer, default=0)
    every_days: Mapped[int] = mapped_column(Integer, default=7); due_at: Mapped[int] = mapped_column(BigInteger)
    last_by: Mapped[str | None] = mapped_column(String(40), nullable=True); last_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class B7Watch(Base):
    __tablename__ = "b7_watch_items"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("wq"))
    conv_id: Mapped[str] = mapped_column(String(40), index=True); added_by: Mapped[str] = UID()
    title: Mapped[str] = mapped_column(String(120)); kind: Mapped[str] = mapped_column(String(10), default="movie")
    votes: Mapped[list] = mapped_column(JSON, default=list); ratings: Mapped[dict] = mapped_column(JSON, default=dict)
    watched: Mapped[bool] = mapped_column(Boolean, default=False); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class B7Santa(Base):
    __tablename__ = "b7_santas"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("snt"))
    conv_id: Mapped[str] = mapped_column(String(40), index=True); organiser_id: Mapped[str] = UID()
    title: Mapped[str] = mapped_column(String(80)); budget: Mapped[str] = mapped_column(String(40), default="")
    status: Mapped[str] = mapped_column(String(10), default="open"); joined: Mapped[list] = mapped_column(JSON, default=list)
    pairs: Mapped[dict] = mapped_column(JSON, default=dict)  # giver -> receiver; never returned whole
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class B7Lend(Base):
    __tablename__ = "b7_lends"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("lnd"))
    conv_id: Mapped[str] = mapped_column(String(40), index=True); lender_id: Mapped[str] = UID(); borrower_id: Mapped[str] = UID()
    item: Mapped[str] = mapped_column(String(120)); due_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    returned: Mapped[bool] = mapped_column(Boolean, default=False); returned_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    reminded_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class B7Habit(Base):
    __tablename__ = "b7_habits"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("hab"))
    title: Mapped[str] = mapped_column(String(80)); owner_id: Mapped[str] = UID(); buddy_id: Mapped[str] = UID()
    status: Mapped[str] = mapped_column(String(10), default="pending"); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class B7HabitCheck(Base):
    __tablename__ = "b7_habit_checks"
    __table_args__ = (UniqueConstraint("habit_id", "user_id", "day", name="uq_b7_habit_check"),)
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("hck"))
    habit_id: Mapped[str] = mapped_column(ForeignKey("b7_habits.id", ondelete="CASCADE"), index=True); user_id: Mapped[str] = UID()
    day: Mapped[str] = mapped_column(String(10)); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class B7Trip(Base):
    __tablename__ = "b7_trips"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("trp"))
    conv_id: Mapped[str] = mapped_column(String(40), index=True); created_by: Mapped[str] = UID()
    title: Mapped[str] = mapped_column(String(80)); days: Mapped[list] = mapped_column(JSON, default=list)  # [{id,label,items:[{id,time,title,note,by}]}]
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

def _get(db: Session, model, oid: str, what: str):
    x = db.get(model, oid)
    if not x: raise HTTPException(404, f"{what} not found")
    return x

def _others(c: M.Conv, me: str): return [m for m in c.members if m != me]

# =====================================================================
# Chore Rotation
# =====================================================================
CH = ("addons.hush.choreRotation", "Chore Rotation")
def chore_json(db: Session, x: B7Chore, me: str) -> dict:
    rota = x.rota or []; cur = rota[x.turn % len(rota)] if rota else None
    return {"id": x.id, "convId": x.conv_id, "title": x.title, "everyDays": x.every_days, "dueAt": x.due_at, "overdue": x.due_at < now_ms(),
            "onDuty": who(db, cur) if cur else None, "myTurn": cur == me, "next": who(db, rota[(x.turn + 1) % len(rota)]) if len(rota) > 1 else None,
            "rota": [who(db, r) for r in rota], "lastBy": who(db, x.last_by) if x.last_by else None, "lastAt": x.last_at, "mine": x.created_by == me}

class ChoreIn(BaseModel):
    title: str = Field(min_length=1, max_length=80); everyDays: int = Field(default=7, ge=1, le=60); rota: list[str] | None = Field(default=None, max_length=50)
@router.post("/addons/b7/convs/{cid}/chores")
def chore_create(cid: str, b: ChoreIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *CH); c = conv_for(db, cid, u)
    rota = list(dict.fromkeys(b.rota or c.members))
    if not rota or not set(rota) <= set(c.members): raise HTTPException(400, "Everyone in the rotation must be in this chat")
    n = db.scalar(select(func.count()).select_from(B7Chore).where(B7Chore.conv_id == c.id)) or 0
    if n >= (mx := on(db, u, "addons.hush.choresPerChat")): raise HTTPException(400, f"A chat can hold up to {mx} chores")
    x = B7Chore(conv_id=c.id, created_by=u.id, title=b.title.strip(), rota=rota, turn=0, every_days=b.everyDays, due_at=now_ms() + b.everyDays * DAY)
    db.add(x); db.commit()
    if rota[0] != u.id: push(rota[0], f"You're first up: {x.title}", f"{u.name} started a chore rotation", "ChoreRotation", {"convId": c.id})
    return chore_json(db, x, u.id)

@router.get("/addons/b7/convs/{cid}/chores")
def chore_list(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *CH); c = conv_for(db, cid, u)
    return [chore_json(db, x, u.id) for x in db.scalars(select(B7Chore).where(B7Chore.conv_id == c.id).order_by(B7Chore.due_at))]

@router.post("/addons/b7/chores/{xid}/done")
def chore_done(xid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *CH); x = _get(db, B7Chore, xid, "Chore"); conv_for(db, x.conv_id, u)
    rota = x.rota or []
    if not rota or rota[x.turn % len(rota)] != u.id: raise HTTPException(403, "It's not your turn for this chore")
    x.turn = (x.turn + 1) % len(rota); x.last_by = u.id; x.last_at = now_ms(); x.due_at = now_ms() + x.every_days * DAY
    db.commit(); nxt = rota[x.turn]
    if nxt != u.id: push(nxt, f"Your turn: {x.title}", f"{u.name} just did it — you're up next", "ChoreRotation", {"convId": x.conv_id})
    return chore_json(db, x, u.id)

@router.delete("/addons/b7/chores/{xid}")
def chore_delete(xid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *CH); x = _get(db, B7Chore, xid, "Chore"); conv_for(db, x.conv_id, u)
    if x.created_by != u.id: raise HTTPException(403, "Only the person who set up this chore can delete it")
    db.delete(x); db.commit(); return {"ok": True}

# =====================================================================
# Watch Queue
# =====================================================================
WQ = ("addons.hush.watchQueue", "Watch Queue")
def watch_json(db: Session, x: B7Watch, me: str) -> dict:
    r = x.ratings or {}
    return {"id": x.id, "title": x.title, "kind": x.kind, "addedBy": who(db, x.added_by), "votes": len(x.votes or []), "voted": me in (x.votes or []),
            "watched": x.watched, "avg": round(sum(r.values()) / len(r), 1) if r else None, "ratings": len(r), "myRating": r.get(me), "mine": x.added_by == me, "at": x.at}

class WatchIn(BaseModel): title: str = Field(min_length=1, max_length=120); kind: str = Field(default="movie", pattern=r"^(movie|show)$")
@router.post("/addons/b7/convs/{cid}/watch")
def watch_add(cid: str, b: WatchIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *WQ); c = conv_for(db, cid, u)
    if db.scalar(select(B7Watch).where(B7Watch.conv_id == c.id, func.lower(B7Watch.title) == b.title.strip().lower(), B7Watch.watched.is_(False))):
        raise HTTPException(409, "That's already in the queue")
    x = B7Watch(conv_id=c.id, added_by=u.id, title=b.title.strip(), kind=b.kind, votes=[u.id], ratings={}); db.add(x); db.commit()
    for m in _others(c, u.id): push(m, "Added to your Watch Queue", f"{u.name} added {x.title}", "WatchQueue", {"convId": c.id})
    return watch_json(db, x, u.id)

@router.get("/addons/b7/convs/{cid}/watch")
def watch_list(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *WQ); c = conv_for(db, cid, u)
    rows = [watch_json(db, x, u.id) for x in db.scalars(select(B7Watch).where(B7Watch.conv_id == c.id))]
    return {"queue": sorted([r for r in rows if not r["watched"]], key=lambda r: (-r["votes"], r["at"])),
            "watched": sorted([r for r in rows if r["watched"]], key=lambda r: -(r["avg"] or 0))}

@router.post("/addons/b7/watch/{wid}/vote")
def watch_vote(wid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *WQ); x = _get(db, B7Watch, wid, "Title"); conv_for(db, x.conv_id, u)
    if x.watched: raise HTTPException(409, "Already watched — rate it instead")
    v = list(x.votes or []); v.remove(u.id) if u.id in v else v.append(u.id); x.votes = v; db.commit(); return watch_json(db, x, u.id)

class RateIn(BaseModel): stars: int = Field(ge=1, le=5)
@router.post("/addons/b7/watch/{wid}/rate")
def watch_rate(wid: str, b: RateIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *WQ); x = _get(db, B7Watch, wid, "Title"); conv_for(db, x.conv_id, u)
    x.ratings = {**(x.ratings or {}), u.id: b.stars}; x.watched = True; db.commit(); return watch_json(db, x, u.id)

@router.delete("/addons/b7/watch/{wid}")
def watch_delete(wid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *WQ); x = _get(db, B7Watch, wid, "Title"); conv_for(db, x.conv_id, u)
    if x.added_by != u.id: raise HTTPException(403, "Only the person who added it can remove it")
    db.delete(x); db.commit(); return {"ok": True}

# =====================================================================
# Secret Santa
# =====================================================================
SS = ("addons.hush.secretSanta", "Secret Santa")
def santa_json(db: Session, x: B7Santa, me: str) -> dict:
    to = (x.pairs or {}).get(me)
    return {"id": x.id, "convId": x.conv_id, "title": x.title, "budget": x.budget, "status": x.status, "organiser": who(db, x.organiser_id),
            "isOrganiser": x.organiser_id == me, "joined": me in (x.joined or []), "members": [who(db, m) for m in (x.joined or [])],
            "myMatch": who(db, to) if to else None, "at": x.at}

class SantaIn(BaseModel): title: str = Field(min_length=1, max_length=80); budget: str = Field(default="", max_length=40)
@router.post("/addons/b7/convs/{cid}/santa")
def santa_create(cid: str, b: SantaIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *SS); c = conv_for(db, cid, u)
    if not c.group or len(c.members) < 3: raise HTTPException(400, "Secret Santa needs a group chat with at least 3 people")
    x = B7Santa(conv_id=c.id, organiser_id=u.id, title=b.title.strip(), budget=b.budget.strip(), joined=[u.id], pairs={}); db.add(x); db.commit()
    for m in _others(c, u.id): push(m, f"Secret Santa: {x.title}", f"{u.name} opened a draw — join before it's drawn", "SecretSanta", {"convId": c.id})
    return santa_json(db, x, u.id)

@router.get("/addons/b7/convs/{cid}/santa")
def santa_list(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *SS); c = conv_for(db, cid, u)
    return [santa_json(db, x, u.id) for x in db.scalars(select(B7Santa).where(B7Santa.conv_id == c.id).order_by(B7Santa.at.desc()))]

class SantaAct(BaseModel): action: str = Field(pattern=r"^(join|leave|draw)$")
@router.post("/addons/b7/santa/{sid}")
def santa_act(sid: str, b: SantaAct, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *SS); x = _get(db, B7Santa, sid, "Draw"); c = conv_for(db, x.conv_id, u)
    if x.status != "open": raise HTTPException(409, "This draw has already happened")
    j = list(x.joined or [])
    if b.action == "join":
        if u.id not in j: j.append(u.id)
    elif b.action == "leave":
        if u.id == x.organiser_id: raise HTTPException(400, "The organiser can't leave — delete the draw instead")
        j = [m for m in j if m != u.id]
    else:
        if u.id != x.organiser_id: raise HTTPException(403, "Only the organiser can draw")
        j = [m for m in j if m in c.members]
        if len(j) < 3: raise HTTPException(400, "At least 3 people must join before the draw")
        order = j[:]; random.SystemRandom().shuffle(order)  # one big cycle: everyone gives to the next — never to themselves
        x.pairs = {order[i]: order[(i + 1) % len(order)] for i in range(len(order))}; x.status = "drawn"
        for m in j: push(m, f"Secret Santa drawn: {x.title}", "Open it to see who you're gifting", "SecretSanta", {"convId": x.conv_id})
    x.joined = j; db.commit(); return santa_json(db, x, u.id)

@router.delete("/addons/b7/santa/{sid}")
def santa_delete(sid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *SS); x = _get(db, B7Santa, sid, "Draw"); conv_for(db, x.conv_id, u)
    if x.organiser_id != u.id: raise HTTPException(403, "Only the organiser can delete this draw")
    db.delete(x); db.commit(); return {"ok": True}

# =====================================================================
# Lend Log
# =====================================================================
LL = ("addons.hush.lendLog", "Lend Log")
def lend_json(db: Session, x: B7Lend, me: str) -> dict:
    return {"id": x.id, "item": x.item, "dueAt": x.due_at, "returned": x.returned, "returnedAt": x.returned_at, "at": x.at,
            "overdue": bool(x.due_at and not x.returned and x.due_at < now_ms()), "lender": who(db, x.lender_id), "borrower": who(db, x.borrower_id),
            "iLent": x.lender_id == me, "remindedAt": x.reminded_at}

class LendIn(BaseModel):
    item: str = Field(min_length=1, max_length=120); other: str = Field(min_length=1, max_length=40)
    direction: str = Field(default="lent", pattern=r"^(lent|borrowed)$"); dueAt: int | None = None
@router.post("/addons/b7/convs/{cid}/lends")
def lend_create(cid: str, b: LendIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *LL); c = conv_for(db, cid, u)
    if b.other == u.id or b.other not in c.members: raise HTTPException(400, "Pick someone else in this chat")
    if b.dueAt is not None and b.dueAt < now_ms(): raise HTTPException(400, "Due date is in the past")
    lender, borrower = (u.id, b.other) if b.direction == "lent" else (b.other, u.id)
    x = B7Lend(conv_id=c.id, lender_id=lender, borrower_id=borrower, item=b.item.strip(), due_at=b.dueAt); db.add(x); db.commit()
    push(b.other, "Lend Log", f"{u.name} logged {x.item} ({'lent to you' if b.direction == 'lent' else 'borrowed from you'})", "LendLog", {"convId": c.id})
    return lend_json(db, x, u.id)

@router.get("/addons/b7/convs/{cid}/lends")
def lend_list(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *LL); c = conv_for(db, cid, u)
    rows = db.scalars(select(B7Lend).where(B7Lend.conv_id == c.id, (B7Lend.lender_id == u.id) | (B7Lend.borrower_id == u.id)).order_by(B7Lend.returned, B7Lend.at.desc()))
    return {"entries": [lend_json(db, x, u.id) for x in rows], "members": [who(db, m) for m in _others(c, u.id)]}

def _lend_mine(db: Session, lid: str, u: M.User) -> B7Lend:
    x = db.get(B7Lend, lid)
    if not x or u.id not in (x.lender_id, x.borrower_id): raise HTTPException(404, "Entry not found")
    conv_for(db, x.conv_id, u); return x

@router.post("/addons/b7/lends/{lid}/returned")
def lend_returned(lid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *LL); x = _lend_mine(db, lid, u)
    if u.id != x.lender_id: raise HTTPException(403, "Only the lender can confirm it came back")
    x.returned = not x.returned; x.returned_at = now_ms() if x.returned else None; db.commit()
    if x.returned: push(x.borrower_id, "Marked returned", f"{u.name} got {x.item} back — thanks!", "LendLog", {"convId": x.conv_id})
    return lend_json(db, x, u.id)

@router.post("/addons/b7/lends/{lid}/remind")
def lend_remind(lid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *LL); x = _lend_mine(db, lid, u)
    if u.id != x.lender_id: raise HTTPException(403, "Only the lender can send a reminder")
    if x.returned: raise HTTPException(409, "Already returned")
    if x.reminded_at and x.reminded_at > now_ms() - DAY: raise HTTPException(429, "You can send one reminder a day")
    x.reminded_at = now_ms(); db.commit()
    push(x.borrower_id, f"Reminder from {u.name}", f"Don't forget to return {x.item}", "LendLog", {"convId": x.conv_id})
    return lend_json(db, x, u.id)

@router.delete("/addons/b7/lends/{lid}")
def lend_delete(lid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *LL); x = _lend_mine(db, lid, u)
    if u.id != x.lender_id: raise HTTPException(403, "Only the lender can delete this entry")
    db.delete(x); db.commit(); return {"ok": True}

# =====================================================================
# Habit Buddies
# =====================================================================
HB = ("addons.hush.habitBuddies", "Habit Buddies")
def _day(d=None) -> str: return (d or datetime.now(timezone.utc).date()).isoformat()

def habit_json(db: Session, h: B7Habit, me: str) -> dict:
    other = h.buddy_id if h.owner_id == me else h.owner_id
    checks = db.execute(select(B7HabitCheck.user_id, B7HabitCheck.day).where(B7HabitCheck.habit_id == h.id)).all()
    mine = {d for uid, d in checks if uid == me}; theirs = {d for uid, d in checks if uid == other}; both = mine & theirs
    t = datetime.now(timezone.utc).date(); d = t if _day(t) in both else t - timedelta(days=1); streak = 0
    while _day(d) in both: streak += 1; d -= timedelta(days=1)  # today counts once you've both done it; until then yesterday's run stays alive
    return {"id": h.id, "title": h.title, "status": h.status, "buddy": who(db, other), "invitedMe": h.buddy_id == me and h.status == "pending",
            "meToday": _day(t) in mine, "buddyToday": _day(t) in theirs, "streak": streak, "bothDays": len(both),
            "week": [{"day": _day(t - timedelta(days=i)), "me": _day(t - timedelta(days=i)) in mine, "buddy": _day(t - timedelta(days=i)) in theirs} for i in range(6, -1, -1)]}

def _habit_mine(db: Session, hid: str, u: M.User) -> B7Habit:
    h = db.get(B7Habit, hid)
    if not h or u.id not in (h.owner_id, h.buddy_id): raise HTTPException(404, "Habit not found")
    return h

class HabitIn(BaseModel): title: str = Field(min_length=1, max_length=80); buddy: str = Field(min_length=1, max_length=40)
@router.post("/addons/b7/habits")
def habit_create(b: HabitIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *HB)
    if b.buddy == u.id or not are_friends(db, u.id, b.buddy): raise HTTPException(400, "Your habit buddy must be in your Squad (friends)")
    n = db.scalar(select(func.count()).select_from(B7Habit).where((B7Habit.owner_id == u.id) | (B7Habit.buddy_id == u.id))) or 0
    if n >= (mx := on(db, u, "addons.hush.habitBuddiesMax")): raise HTTPException(400, f"You can share up to {mx} habits")
    h = B7Habit(title=b.title.strip(), owner_id=u.id, buddy_id=b.buddy, status="pending"); db.add(h); db.commit()
    push(b.buddy, f"{u.name} wants a habit buddy", f"\"{h.title}\" — accept to start a shared streak", "HabitBuddies")
    return habit_json(db, h, u.id)

@router.get("/addons/b7/habits")
def habit_list(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *HB)
    return [habit_json(db, h, u.id) for h in db.scalars(select(B7Habit).where((B7Habit.owner_id == u.id) | (B7Habit.buddy_id == u.id)).order_by(B7Habit.at.desc()))]

@router.post("/addons/b7/habits/{hid}/accept")
def habit_accept(hid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *HB); h = _habit_mine(db, hid, u)
    if h.buddy_id != u.id or h.status != "pending": raise HTTPException(403, "Only the invited buddy can accept")
    h.status = "active"; db.commit(); push(h.owner_id, "Habit buddy accepted", f"{u.name} is in: {h.title}", "HabitBuddies")
    return habit_json(db, h, u.id)

@router.post("/addons/b7/habits/{hid}/checkin")
def habit_checkin(hid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *HB); h = _habit_mine(db, hid, u)
    if h.status != "active": raise HTTPException(409, "Your buddy hasn't accepted yet")
    d = _day()
    if not db.scalar(select(B7HabitCheck).where(B7HabitCheck.habit_id == h.id, B7HabitCheck.user_id == u.id, B7HabitCheck.day == d)):
        db.add(B7HabitCheck(habit_id=h.id, user_id=u.id, day=d)); db.commit()
        other = h.buddy_id if h.owner_id == u.id else h.owner_id
        done = db.scalar(select(B7HabitCheck).where(B7HabitCheck.habit_id == h.id, B7HabitCheck.user_id == other, B7HabitCheck.day == d))
        push(other, f"{u.name} checked in: {h.title}", "Streak day locked in!" if done else "Your turn — keep the shared streak alive", "HabitBuddies")
    return habit_json(db, h, u.id)

@router.delete("/addons/b7/habits/{hid}")
def habit_delete(hid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *HB); h = _habit_mine(db, hid, u); db.delete(h); db.commit(); return {"ok": True}  # either buddy can end it

# =====================================================================
# Trip Planner
# =====================================================================
TP = ("addons.hush.tripPlanner", "Trip Planner")
def trip_json(db: Session, t: B7Trip, me: str | None = None) -> dict:
    return {"id": t.id, "mine": t.created_by == me, "convId": t.conv_id, "title": t.title, "createdBy": who(db, t.created_by), "at": t.at, "days": t.days or [],
            "stops": sum(len(d.get("items") or []) for d in (t.days or []))}

class TripIn(BaseModel): title: str = Field(min_length=1, max_length=80); days: int = Field(default=1, ge=1, le=60)
@router.post("/addons/b7/convs/{cid}/trips")
def trip_create(cid: str, b: TripIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *TP); c = conv_for(db, cid, u)
    if b.days > (mx := on(db, u, "addons.hush.tripMaxDays")): raise HTTPException(400, f"Trips can be up to {mx} days")
    t = B7Trip(conv_id=c.id, created_by=u.id, title=b.title.strip(), days=[{"id": nid("td"), "label": f"Day {i + 1}", "items": []} for i in range(b.days)])
    db.add(t); db.commit()
    for m in _others(c, u.id): push(m, f"Trip plan: {t.title}", f"{u.name} started an itinerary", "TripPlanner", {"convId": c.id})
    return trip_json(db, t, u.id)

@router.get("/addons/b7/convs/{cid}/trips")
def trip_list(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *TP); c = conv_for(db, cid, u)
    return [trip_json(db, t, u.id) for t in db.scalars(select(B7Trip).where(B7Trip.conv_id == c.id).order_by(B7Trip.at.desc()))]

class TripPatch(BaseModel):
    op: str = Field(pattern=r"^(addDay|removeDay|addItem|moveItem|deleteItem|rename)$")
    dayId: str | None = Field(default=None, max_length=40); itemId: str | None = Field(default=None, max_length=40); dir: int = Field(default=0, ge=-1, le=1)
    time: str = Field(default="", pattern=r"^$|^([01]\d|2[0-3]):[0-5]\d$"); title: str = Field(default="", max_length=100); note: str = Field(default="", max_length=300)
@router.patch("/addons/b7/trips/{tid}")
def trip_update(tid: str, b: TripPatch, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *TP); t = _get(db, B7Trip, tid, "Trip"); conv_for(db, t.conv_id, u)
    days = [{**d, "items": [dict(i) for i in d.get("items") or []]} for d in (t.days or [])]
    day = next((d for d in days if d["id"] == b.dayId), None)
    loc = next(((d, k) for d in days for k, i in enumerate(d["items"]) if i["id"] == b.itemId), None)
    if b.op == "rename":
        if not b.title.strip(): raise HTTPException(400, "Give the trip a name")
        t.title = b.title.strip()[:80]
    elif b.op == "addDay":
        if len(days) >= on(db, u, "addons.hush.tripMaxDays"): raise HTTPException(400, "This trip already has the most days allowed")
        days.append({"id": nid("td"), "label": f"Day {len(days) + 1}", "items": []})
    elif b.op == "removeDay":
        if not day: raise HTTPException(404, "Day not found")
        if len(days) == 1: raise HTTPException(400, "A trip needs at least one day")
        days = [d for d in days if d["id"] != b.dayId]
        for k, d in enumerate(days): d["label"] = f"Day {k + 1}"
    elif b.op == "addItem":
        if not day: raise HTTPException(404, "Day not found")
        if not b.title.strip(): raise HTTPException(400, "Give the stop a title")
        if len(day["items"]) >= 40: raise HTTPException(400, "A day holds up to 40 stops")
        day["items"].append({"id": nid("ti"), "time": b.time, "title": b.title.strip(), "note": b.note.strip(), "by": u.id})
    else:
        if not loc: raise HTTPException(404, "Stop not found")
        d, k = loc
        if b.op == "deleteItem": d["items"].pop(k)
        elif 0 <= k + b.dir < len(d["items"]): d["items"][k], d["items"][k + b.dir] = d["items"][k + b.dir], d["items"][k]
    t.days = days; db.commit(); return trip_json(db, t, u.id)

@router.delete("/addons/b7/trips/{tid}")
def trip_delete(tid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *TP); t = _get(db, B7Trip, tid, "Trip"); conv_for(db, t.conv_id, u)
    if t.created_by != u.id: raise HTTPException(403, "Only the person who started this trip can delete it")
    db.delete(t); db.commit(); return {"ok": True}

# =====================================================================
# admin
# =====================================================================
ITEMS = [("Chore Rotation", "choreRotation", B7Chore), ("Watch Queue", "watchQueue", B7Watch), ("Secret Santa", "secretSanta", B7Santa),
         ("Lend Log", "lendLog", B7Lend), ("Habit Buddies", "habitBuddies", B7Habit), ("Trip Planner", "tripPlanner", B7Trip)]
@router.get("/admin/addons/b7")
def admin_b7(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    wk = now_ms() - 7 * DAY
    return {"title": "Hush · Together Tools", "module": "hush",
            "items": [{"name": n, "flag": f"addons.hush.{k}", "on": bool(on(db, None, f"addons.hush.{k}")),
                       "week": db.scalar(select(func.count()).select_from(m).where(m.at > wk)) or 0} for n, k, m in ITEMS]}

@router.delete("/admin/addons/b7/santa/{sid}")
def admin_santa_remove(sid: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    if x := db.get(B7Santa, sid): db.delete(x)
    audit(db, a.handle, "addons.b7.santa_remove", sid); db.commit(); return {"ok": True}

@router.delete("/admin/addons/b7/trips/{tid}")
def admin_trip_remove(tid: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    if x := db.get(B7Trip, tid): db.delete(x)
    audit(db, a.handle, "addons.b7.trip_remove", tid); db.commit(); return {"ok": True}
