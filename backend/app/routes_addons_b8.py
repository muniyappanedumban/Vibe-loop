"""VibeLoop add-ons, batch 8 (Hush) — each switchable in User App Settings (addons.hush.*).

  Emergency Card   blood group, allergies, meds, contacts — visible only to the Squad friends you pick.
  Remind Them      schedule a ping to a friend at a time with a note; delivered by a background loop; they can snooze or mark done.
  Meeting Notes    notes inside a chat with action items assigned to members; only the assignee ticks their item.
  Memory Jar       save a favourite chat message (text snapshot + sender) into the chat's shared jar; remove what you saved.
  Kindness Streak  one kind note a day to a friend; streak per pair counts consecutive days with a note either way.
  Quiet Reply      away note with active hours; a 1:1 partner can fetch it while you're quiet.
"""
import os, sys, threading, logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, or_, and_, String, Integer, Boolean, JSON, BigInteger, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Session, Mapped, mapped_column
from .db import get_db, SessionLocal, Base
from . import models as M
from .models import nid, now_ms
from .security import current_user, require, audit
from .v2common import are_friends
from .routes_addons import on, need, push, who, DAY

log = logging.getLogger("vibeloop.addons.b8")
router = APIRouter()
STAFF = require("owner", "admin", "moderator", "support")

def _u(col="user_id", **kw): return mapped_column(col, String(40), ForeignKey("users.id", ondelete="CASCADE"), index=True, **kw)

# =====================================================================
# Models
# =====================================================================
class EmergencyCard(Base):
    __tablename__ = "b8_emergency_cards"
    user_id: Mapped[str] = mapped_column(String(40), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    blood: Mapped[str] = mapped_column(String(4), default=""); allergies: Mapped[str] = mapped_column(String(300), default="")
    meds: Mapped[str] = mapped_column(String(300), default=""); notes: Mapped[str] = mapped_column(String(500), default="")
    contacts: Mapped[list] = mapped_column(JSON, default=list); shared_with: Mapped[list] = mapped_column(JSON, default=list)
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms); updated_at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class Reminder(Base):
    __tablename__ = "b8_reminders"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("rm"))
    from_id: Mapped[str] = _u("from_id"); to_id: Mapped[str] = _u("to_id")
    note: Mapped[str] = mapped_column(String(200)); due_at: Mapped[int] = mapped_column(BigInteger, index=True)
    status: Mapped[str] = mapped_column(String(10), default="pending", index=True)  # pending|sent|done|cancelled
    snoozes: Mapped[int] = mapped_column(Integer, default=0)
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True); sent_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

class MeetingNote(Base):
    __tablename__ = "b8_meeting_notes"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("mn"))
    conv_id: Mapped[str] = mapped_column(String(40), index=True); created_by: Mapped[str] = _u("created_by")
    title: Mapped[str] = mapped_column(String(100)); body: Mapped[str] = mapped_column(Text, default="")
    items: Mapped[list] = mapped_column(JSON, default=list)  # [{id, text, assignee, done, doneAt}]
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class JarItem(Base):
    __tablename__ = "b8_jar_items"
    __table_args__ = (UniqueConstraint("conv_id", "msg_id", name="uq_b8_jar_conv_msg"),)
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("jr"))
    conv_id: Mapped[str] = mapped_column(String(40), index=True); msg_id: Mapped[str] = mapped_column(String(40))
    saved_by: Mapped[str] = _u("saved_by"); sender_id: Mapped[str] = mapped_column(String(40), default="")
    text: Mapped[str] = mapped_column(Text, default=""); msg_at: Mapped[int] = mapped_column(BigInteger, default=0)
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class KindNote(Base):
    __tablename__ = "b8_kind_notes"
    __table_args__ = (UniqueConstraint("from_id", "to_id", "day", name="uq_b8_kind_day"),)
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("kn"))
    from_id: Mapped[str] = _u("from_id"); to_id: Mapped[str] = _u("to_id")
    day: Mapped[str] = mapped_column(String(10), index=True); text: Mapped[str] = mapped_column(String(280))
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class AwayNote(Base):
    __tablename__ = "b8_away_notes"
    user_id: Mapped[str] = mapped_column(String(40), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    text: Mapped[str] = mapped_column(String(280)); enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    start_min: Mapped[int] = mapped_column(Integer, default=22 * 60); end_min: Mapped[int] = mapped_column(Integer, default=7 * 60)
    tz_min: Mapped[int] = mapped_column(Integer, default=0)  # user's UTC offset in minutes
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

def today() -> str: return datetime.now(timezone.utc).strftime("%Y-%m-%d")
def conv_of(db: Session, cid: str, u: M.User) -> M.Conv:
    from .routes_chat import get_conv
    return get_conv(db, cid, u)
def friend_or_400(db: Session, u: M.User, other: str, what: str):
    if other == u.id or not db.get(M.User, other) or not are_friends(db, u.id, other): raise HTTPException(400, f"{what} must be in your Squad (friends)")

# =====================================================================
# Emergency Card
# =====================================================================
BLOOD = r"^(|A\+|A-|B\+|B-|AB\+|AB-|O\+|O-)$"
class Contact(BaseModel): name: str = Field(min_length=1, max_length=60); phone: str = Field(pattern=r"^\+?[0-9 ()-]{5,20}$"); relation: str = Field(default="", max_length=30)
class CardIn(BaseModel):
    blood: str = Field(default="", pattern=BLOOD); allergies: str = Field(default="", max_length=300); meds: str = Field(default="", max_length=300)
    notes: str = Field(default="", max_length=500); contacts: list[Contact] = Field(default_factory=list, max_length=5); sharedWith: list[str] = Field(default_factory=list, max_length=50)

def card_json(db: Session, c: EmergencyCard, me: M.User) -> dict:
    mine = c.user_id == me.id
    return {"user": who(db, c.user_id), "mine": mine, "blood": c.blood, "allergies": c.allergies, "meds": c.meds, "notes": c.notes,
            "contacts": c.contacts or [], "updatedAt": c.updated_at, "sharedWith": [who(db, x) for x in (c.shared_with or [])] if mine else None}

@router.get("/addons/b8/emergency")
def card_mine(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.emergencyCard", "Emergency Card")
    c = db.get(EmergencyCard, u.id)
    shared = db.scalars(select(EmergencyCard).where(EmergencyCard.user_id != u.id)).all()
    shared = [x for x in shared if u.id in (x.shared_with or []) and are_friends(db, u.id, x.user_id)]
    return {"card": card_json(db, c, u) if c else None, "sharedWithMe": [{"user": who(db, x.user_id), "updatedAt": x.updated_at} for x in shared]}

@router.put("/addons/b8/emergency")
def card_save(b: CardIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.emergencyCard", "Emergency Card")
    ids = list(dict.fromkeys(b.sharedWith))
    for x in ids: friend_or_400(db, u, x, "People you share with")
    c = db.get(EmergencyCard, u.id) or EmergencyCard(user_id=u.id)
    added = [x for x in ids if x not in (c.shared_with or [])]
    c.blood, c.allergies, c.meds, c.notes = b.blood, b.allergies.strip(), b.meds.strip(), b.notes.strip()
    c.contacts = [x.model_dump() for x in b.contacts]; c.shared_with = ids; c.updated_at = now_ms()
    db.add(c); db.commit()
    for x in added: push(x, f"{u.name} shared their Emergency Card", "You can view it if you ever need to help them.", "EmergencyCard", {"userId": u.id})
    return card_json(db, c, u)

@router.delete("/addons/b8/emergency")
def card_delete(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.emergencyCard", "Emergency Card")
    if c := db.get(EmergencyCard, u.id): db.delete(c); db.commit()
    return {"ok": True}

@router.get("/addons/b8/emergency/{uid}")
def card_view(uid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.emergencyCard", "Emergency Card")
    c = db.get(EmergencyCard, uid)
    if not c or not (uid == u.id or (u.id in (c.shared_with or []) and are_friends(db, u.id, uid))): raise HTTPException(404, "Emergency Card not found")
    return card_json(db, c, u)

# =====================================================================
# Remind Them
# =====================================================================
def rem_json(db: Session, r: Reminder, me: M.User) -> dict:
    return {"id": r.id, "note": r.note, "dueAt": r.due_at, "status": r.status, "snoozes": r.snoozes, "at": r.at, "sentAt": r.sent_at,
            "mine": r.from_id == me.id, "from": who(db, r.from_id), "to": who(db, r.to_id)}

class RemIn(BaseModel): to: str = Field(min_length=1, max_length=40); note: str = Field(min_length=1, max_length=200); dueAt: int
@router.post("/addons/b8/reminders")
def rem_create(b: RemIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.remindThem", "Remind Them")
    friend_or_400(db, u, b.to, "The person you remind")
    now = now_ms(); mx = on(db, u, "addons.hush.remindMaxDays")
    if not now + 60_000 <= b.dueAt <= now + mx * DAY: raise HTTPException(400, f"Pick a time between 1 minute and {mx} days from now")
    n = db.scalar(select(func.count()).select_from(Reminder).where(Reminder.from_id == u.id, Reminder.at > now - DAY)) or 0
    if n >= on(db, u, "addons.hush.remindPerDay"): raise HTTPException(429, "You've scheduled enough reminders for today")
    r = Reminder(from_id=u.id, to_id=b.to, note=b.note.strip(), due_at=b.dueAt); db.add(r); db.commit()
    return rem_json(db, r, u)

@router.get("/addons/b8/reminders")
def rem_list(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.remindThem", "Remind Them")
    now = now_ms()
    inbox = db.scalars(select(Reminder).where(Reminder.to_id == u.id, Reminder.status == "sent").order_by(Reminder.sent_at.desc()).limit(50)).all()
    sent = db.scalars(select(Reminder).where(Reminder.from_id == u.id, or_(Reminder.status == "pending", Reminder.at > now - 30 * DAY)).order_by(Reminder.due_at.desc()).limit(50)).all()
    return {"inbox": [rem_json(db, r, u) for r in inbox], "sent": [rem_json(db, r, u) for r in sent]}

class RemAct(BaseModel): action: str = Field(pattern=r"^(snooze|done|cancel)$"); minutes: int = Field(default=15, ge=5, le=24 * 60)
@router.post("/addons/b8/reminders/{rid}")
def rem_act(rid: str, b: RemAct, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.remindThem", "Remind Them")
    r = db.get(Reminder, rid)
    if not r or u.id not in (r.from_id, r.to_id): raise HTTPException(404, "Reminder not found")
    if b.action == "cancel":
        if r.from_id != u.id or r.status != "pending": raise HTTPException(400, "Only pending reminders you scheduled can be cancelled")
        r.status = "cancelled"
    else:
        if r.to_id != u.id or r.status != "sent": raise HTTPException(400, "Only reminders you've received can be snoozed or done")
        if b.action == "done": r.status = "done"
        else:
            if r.snoozes >= 10: raise HTTPException(400, "Snoozed too many times")
            r.status, r.due_at, r.snoozes = "pending", now_ms() + b.minutes * 60_000, r.snoozes + 1
    db.commit(); return rem_json(db, r, u)

def deliver_due(db: Session) -> int:
    rows = db.scalars(select(Reminder).where(Reminder.status == "pending", Reminder.due_at <= now_ms()).limit(500)).all()
    for r in rows:
        f = db.get(M.User, r.from_id)
        r.status, r.sent_at = "sent", now_ms()
        push(r.to_id, f"Reminder from {f.name if f else 'a friend'}" + (" (snoozed)" if r.snoozes else ""), r.note, "RemindThem", {"id": r.id})
    if rows: db.commit()
    return len(rows)

def b8_loop(stop: threading.Event, every_sec: int = 30):
    while not stop.wait(every_sec):
        db = SessionLocal()
        try: deliver_due(db)
        except Exception: log.exception("remind-them delivery failed"); db.rollback()
        finally: db.close()

_STOP = threading.Event()
if "pytest" not in sys.modules and not os.environ.get("VIBELOOP_NO_LOOPS"):
    threading.Thread(target=b8_loop, args=(_STOP,), daemon=True, name="addons-b8").start()

# =====================================================================
# Meeting Notes
# =====================================================================
def note_json(db: Session, n: MeetingNote, me: M.User) -> dict:
    items = n.items or []
    return {"id": n.id, "convId": n.conv_id, "title": n.title, "body": n.body, "at": n.at, "by": who(db, n.created_by), "mine": n.created_by == me.id,
            "items": [{**i, "assignee": who(db, i["assignee"]), "canTick": i["assignee"] == me.id} for i in items],
            "done": sum(1 for i in items if i["done"]), "total": len(items)}

class ItemIn(BaseModel): text: str = Field(min_length=1, max_length=140); assignee: str = Field(min_length=1, max_length=40)
class NoteIn(BaseModel): title: str = Field(min_length=1, max_length=100); body: str = Field(default="", max_length=5000); items: list[ItemIn] = Field(default_factory=list, max_length=30)
def mk_items(c: M.Conv, items: list[ItemIn]) -> list[dict]:
    for i in items:
        if i.assignee not in c.members: raise HTTPException(400, "Action items can only be assigned to chat members")
    return [{"id": nid("ai"), "text": i.text.strip(), "assignee": i.assignee, "done": False, "doneAt": None} for i in items]

@router.get("/addons/b8/convs/{cid}/notes")
def notes_list(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.meetingNotes", "Meeting Notes"); conv_of(db, cid, u)
    return [note_json(db, n, u) for n in db.scalars(select(MeetingNote).where(MeetingNote.conv_id == cid).order_by(MeetingNote.at.desc()).limit(100))]

@router.post("/addons/b8/convs/{cid}/notes")
def notes_create(cid: str, b: NoteIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.meetingNotes", "Meeting Notes"); c = conv_of(db, cid, u)
    n = MeetingNote(conv_id=cid, created_by=u.id, title=b.title.strip(), body=b.body.strip(), items=mk_items(c, b.items)); db.add(n); db.commit()
    for a in {i["assignee"] for i in n.items} - {u.id}: push(a, f"Action item for you: {n.title}", f"{u.name} assigned you a task", "MeetingNotes", {"convId": cid})
    return note_json(db, n, u)

class NotePatch(BaseModel): tick: str | None = None; add: ItemIn | None = None; body: str | None = Field(default=None, max_length=5000)
@router.patch("/addons/b8/notes/{nid_}")
def notes_patch(nid_: str, b: NotePatch, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.meetingNotes", "Meeting Notes")
    n = db.get(MeetingNote, nid_)
    if not n: raise HTTPException(404, "Note not found")
    c = conv_of(db, n.conv_id, u); items = [dict(i) for i in (n.items or [])]
    if b.tick:
        it = next((i for i in items if i["id"] == b.tick), None)
        if not it: raise HTTPException(404, "Action item not found")
        if it["assignee"] != u.id: raise HTTPException(403, "Only the assignee can tick this item")
        it["done"] = not it["done"]; it["doneAt"] = now_ms() if it["done"] else None
    if b.add:
        if len(items) >= 30: raise HTTPException(400, "Too many action items")
        items += mk_items(c, [b.add])
        if b.add.assignee != u.id: push(b.add.assignee, f"Action item for you: {n.title}", b.add.text, "MeetingNotes", {"convId": n.conv_id})
    if b.body is not None:
        if n.created_by != u.id: raise HTTPException(403, "Only the author can edit the notes")
        n.body = b.body.strip()
    n.items = items; db.commit(); return note_json(db, n, u)

@router.delete("/addons/b8/notes/{nid_}")
def notes_delete(nid_: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.meetingNotes", "Meeting Notes")
    n = db.get(MeetingNote, nid_)
    if not n: raise HTTPException(404, "Note not found")
    conv_of(db, n.conv_id, u)
    if n.created_by != u.id: raise HTTPException(403, "Only the author can delete these notes")
    db.delete(n); db.commit(); return {"ok": True}

# =====================================================================
# Memory Jar
# =====================================================================
def jar_json(db: Session, j: JarItem, me: M.User) -> dict:
    return {"id": j.id, "msgId": j.msg_id, "text": j.text, "msgAt": j.msg_at, "at": j.at, "sender": who(db, j.sender_id), "savedBy": who(db, j.saved_by), "mine": j.saved_by == me.id}

@router.get("/addons/b8/convs/{cid}/jar")
def jar_list(cid: str, cursor: int = Query(0, ge=0), u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.memoryJar", "Memory Jar"); conv_of(db, cid, u)
    rows = db.scalars(select(JarItem).where(JarItem.conv_id == cid).order_by(JarItem.at.desc()).offset(cursor).limit(30)).all()
    total = db.scalar(select(func.count()).select_from(JarItem).where(JarItem.conv_id == cid)) or 0
    return {"items": [jar_json(db, j, u) for j in rows], "total": total, "nextCursor": cursor + 30 if len(rows) == 30 else None}

@router.get("/addons/b8/convs/{cid}/jar/candidates")
def jar_candidates(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    """Recent text messages you can drop into the jar."""
    need(db, u, "addons.hush.memoryJar", "Memory Jar"); conv_of(db, cid, u)
    from .routes_chat import visible
    now = now_ms(); saved = set(db.scalars(select(JarItem.msg_id).where(JarItem.conv_id == cid)))
    msgs = db.scalars(select(M.ChatMsg).where(M.ChatMsg.conv_id == cid, M.ChatMsg.deleted == False, M.ChatMsg.kind == "text").order_by(M.ChatMsg.at.desc()).limit(40)).all()  # noqa: E712
    return [{"id": m.id, "text": m.text, "at": m.at, "sender": who(db, m.sender), "saved": m.id in saved} for m in msgs if m.text and visible(m, u, now)]

class JarIn(BaseModel): msgId: str = Field(min_length=1, max_length=40)
@router.post("/addons/b8/convs/{cid}/jar")
def jar_add(cid: str, b: JarIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.memoryJar", "Memory Jar"); conv_of(db, cid, u)
    from .routes_chat import visible
    m = db.get(M.ChatMsg, b.msgId)
    if not m or m.conv_id != cid or m.deleted or not visible(m, u, now_ms()): raise HTTPException(404, "Message not found")
    if not (m.text or "").strip(): raise HTTPException(400, "Only text messages can go in the jar")
    if db.scalar(select(JarItem).where(JarItem.conv_id == cid, JarItem.msg_id == m.id)): raise HTTPException(409, "Already in the jar")
    if (db.scalar(select(func.count()).select_from(JarItem).where(JarItem.conv_id == cid)) or 0) >= on(db, u, "addons.hush.memoryJarMax"): raise HTTPException(400, "This jar is full")
    j = JarItem(conv_id=cid, msg_id=m.id, saved_by=u.id, sender_id=m.sender, text=m.text[:4000], msg_at=m.at); db.add(j); db.commit()
    return jar_json(db, j, u)

@router.delete("/addons/b8/jar/{jid}")
def jar_remove(jid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.memoryJar", "Memory Jar")
    j = db.get(JarItem, jid)
    if not j: raise HTTPException(404, "Not in the jar")
    conv_of(db, j.conv_id, u)
    if j.saved_by != u.id: raise HTTPException(403, "You can only remove memories you saved")
    db.delete(j); db.commit(); return {"ok": True}

# =====================================================================
# Kindness Streak
# =====================================================================
def pair_streak(db: Session, a: str, b: str) -> int:
    days = set(db.scalars(select(KindNote.day).where(or_(and_(KindNote.from_id == a, KindNote.to_id == b), and_(KindNote.from_id == b, KindNote.to_id == a)))))
    d = datetime.now(timezone.utc).date()
    if d.isoformat() not in days: d -= timedelta(days=1)  # streak still alive until today ends
    n = 0
    while d.isoformat() in days: n += 1; d -= timedelta(days=1)
    return n

def kn_json(db: Session, k: KindNote, me: M.User) -> dict:
    return {"id": k.id, "text": k.text, "day": k.day, "at": k.at, "mine": k.from_id == me.id, "from": who(db, k.from_id), "to": who(db, k.to_id)}

class KindIn(BaseModel): to: str = Field(min_length=1, max_length=40); text: str = Field(min_length=3, max_length=280)
@router.post("/addons/b8/kindness")
def kind_send(b: KindIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.kindnessStreak", "Kindness Streak")
    friend_or_400(db, u, b.to, "The person you send kindness to")
    d = today()
    if db.scalar(select(KindNote).where(KindNote.from_id == u.id, KindNote.to_id == b.to, KindNote.day == d)): raise HTTPException(409, "You already sent them a kind note today")
    k = KindNote(from_id=u.id, to_id=b.to, day=d, text=b.text.strip()); db.add(k); db.commit()
    s = pair_streak(db, u.id, b.to)
    push(b.to, f"{u.name} sent you a kind note", b.text.strip()[:100] + (f" · {s}-day streak" if s > 1 else ""), "KindnessStreak")
    return {**kn_json(db, k, u), "streak": s}

@router.get("/addons/b8/kindness")
def kind_overview(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.kindnessStreak", "Kindness Streak")
    rows = db.execute(select(KindNote.from_id, KindNote.to_id).where(or_(KindNote.from_id == u.id, KindNote.to_id == u.id)).distinct()).all()
    others = {b if a == u.id else a for a, b in rows}; d = today()
    pairs = []
    for o in others:
        sent = db.scalar(select(KindNote.id).where(KindNote.from_id == u.id, KindNote.to_id == o, KindNote.day == d)) is not None
        pairs.append({"user": who(db, o), "streak": pair_streak(db, u.id, o), "sentToday": sent})
    pairs.sort(key=lambda p: -p["streak"])
    return {"pairs": pairs, "today": d}

@router.get("/addons/b8/kindness/{uid}")
def kind_history(uid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.kindnessStreak", "Kindness Streak")
    if not db.get(M.User, uid) or uid == u.id: raise HTTPException(404, "User not found")
    rows = db.scalars(select(KindNote).where(or_(and_(KindNote.from_id == u.id, KindNote.to_id == uid), and_(KindNote.from_id == uid, KindNote.to_id == u.id))).order_by(KindNote.at.desc()).limit(100)).all()
    return {"user": who(db, uid), "streak": pair_streak(db, u.id, uid), "notes": [kn_json(db, k, u) for k in rows]}

# =====================================================================
# Quiet Reply
# =====================================================================
def is_quiet(a: AwayNote, at_ms: int | None = None) -> bool:
    if not a.enabled: return False
    t = datetime.fromtimestamp((at_ms or now_ms()) / 1000, timezone.utc) + timedelta(minutes=a.tz_min)
    m = t.hour * 60 + t.minute
    if a.start_min == a.end_min: return True  # all day
    return a.start_min <= m < a.end_min if a.start_min < a.end_min else (m >= a.start_min or m < a.end_min)

def away_json(a: AwayNote) -> dict:
    return {"text": a.text, "enabled": a.enabled, "startMin": a.start_min, "endMin": a.end_min, "tzMin": a.tz_min, "quietNow": is_quiet(a)}

class AwayIn(BaseModel):
    text: str = Field(min_length=1, max_length=280); enabled: bool = True
    startMin: int = Field(ge=0, le=1439); endMin: int = Field(ge=0, le=1439); tzMin: int = Field(default=0, ge=-720, le=840)
@router.get("/addons/b8/away")
def away_mine(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.quietReply", "Quiet Reply")
    a = db.get(AwayNote, u.id); return away_json(a) if a else None

@router.put("/addons/b8/away")
def away_save(b: AwayIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.quietReply", "Quiet Reply")
    a = db.get(AwayNote, u.id) or AwayNote(user_id=u.id)
    a.text, a.enabled, a.start_min, a.end_min, a.tz_min = b.text.strip(), b.enabled, b.startMin, b.endMin, b.tzMin
    db.add(a); db.commit(); return away_json(a)

class AwayToggle(BaseModel): enabled: bool
@router.post("/addons/b8/away/toggle")
def away_toggle(b: AwayToggle, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.hush.quietReply", "Quiet Reply")
    a = db.get(AwayNote, u.id)
    if not a: raise HTTPException(404, "Set up your away note first")
    a.enabled = b.enabled; db.commit(); return away_json(a)

@router.get("/addons/b8/away/{uid}")
def away_for(uid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    """What the sender sees when messaging `uid` in a 1:1 — only people who share a 1:1 chat with them."""
    need(db, u, "addons.hush.quietReply", "Quiet Reply")
    if uid == u.id: raise HTTPException(400, "That's you")
    one = [c for c in db.scalars(select(M.Conv).where(M.Conv.group == False)).all() if set(c.members or []) == {u.id, uid}]  # noqa: E712
    if not one: raise HTTPException(404, "No 1:1 chat with this person")
    a = db.get(AwayNote, uid); target = db.get(M.User, uid)
    if not a or not on(db, target, "addons.hush.quietReply") or not is_quiet(a): return {"away": False, "text": None, "user": who(db, uid)}
    return {"away": True, "text": a.text, "until": a.end_min, "tzMin": a.tz_min, "user": who(db, uid)}

# =====================================================================
# Admin
# =====================================================================
@router.get("/admin/addons/b8")
def admin_b8(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    wk = now_ms() - 7 * DAY
    c = lambda model, col: db.scalar(select(func.count()).select_from(model).where(col > wk)) or 0  # noqa: E731
    rows = [("Emergency Card", "emergencyCard", EmergencyCard, EmergencyCard.at), ("Remind Them", "remindThem", Reminder, Reminder.at),
            ("Meeting Notes", "meetingNotes", MeetingNote, MeetingNote.at), ("Memory Jar", "memoryJar", JarItem, JarItem.at),
            ("Kindness Streak", "kindnessStreak", KindNote, KindNote.at), ("Quiet Reply", "quietReply", AwayNote, AwayNote.at)]
    return {"title": "Hush care kit", "module": "hush",
            "items": [{"name": n, "flag": f"addons.hush.{k}", "on": bool(on(db, None, f"addons.hush.{k}")), "week": c(m, col)} for n, k, m, col in rows],
            "pendingReminders": db.scalar(select(func.count()).select_from(Reminder).where(Reminder.status == "pending")) or 0}

@router.delete("/admin/addons/b8/kindness/{kid}")
def admin_kind_remove(kid: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    if x := db.get(KindNote, kid): db.delete(x)
    audit(db, a.handle, "addons.b8.kind_remove", kid); db.commit(); return {"ok": True}

@router.delete("/admin/addons/b8/jar/{jid}")
def admin_jar_remove(jid: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    if x := db.get(JarItem, jid): db.delete(x)
    audit(db, a.handle, "addons.b8.jar_remove", jid); db.commit(); return {"ok": True}
