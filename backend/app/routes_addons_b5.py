"""VibeLoop add-ons, batch 5 (Glow) — each switchable in User App Settings (addons.glow.*).

  Collab Canvas       a board with up to N invited co-authors; authors add text tiles in turn order; owner locks → the final board goes public.
  Creator Office Hours creator opens weekly time slots; followers book one (no double booking); creator cancels → booker is notified.
  Fan Missions        creator posts missions; fans submit proof; creator approves → fan earns points on that creator's mission board.
  Moodboard Pins      named boards of your own uploaded media + notes; public or private.
  Time-Lock Polls     results stay sealed (even to the creator) until the reveal time; one vote each, voting closes at reveal.
  Thank-You Stories   a short public thank-you tagging someone; it shows publicly only after they approve it.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import String, Text, BigInteger, Boolean, Integer, JSON, ForeignKey, UniqueConstraint, select, func, update
from sqlalchemy.orm import Session, Mapped, mapped_column
from .db import get_db
from .models import Base, nid, now_ms
from . import models as M
from .security import current_user, require, audit
from .v2common import blocked_between, find_by_handle
from .routes_addons import on, need, push, who, DAY

router = APIRouter()
STAFF = require("owner", "admin", "moderator", "support")
UFK = lambda: ForeignKey("users.id", ondelete="CASCADE")  # noqa: E731

# ============================== models ==============================
class Canvas(Base):
    __tablename__ = "b5_canvases"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("cnv"))
    owner_id: Mapped[str] = mapped_column(UFK(), index=True); title: Mapped[str] = mapped_column(String(80))
    coauthors: Mapped[list | None] = mapped_column(JSON, nullable=True); tiles: Mapped[list | None] = mapped_column(JSON, nullable=True)
    locked: Mapped[bool] = mapped_column(Boolean, default=False); at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class OfficeSlot(Base):
    __tablename__ = "b5_office_slots"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("ofs"))
    creator_id: Mapped[str] = mapped_column(UFK(), index=True); starts_at: Mapped[int] = mapped_column(BigInteger, index=True)
    minutes: Mapped[int] = mapped_column(Integer); topic: Mapped[str] = mapped_column(String(120), default="")
    booked_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(10), default="open")  # open|booked|cancelled
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class Mission(Base):
    __tablename__ = "b5_missions"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("msn"))
    creator_id: Mapped[str] = mapped_column(UFK(), index=True); title: Mapped[str] = mapped_column(String(80))
    detail: Mapped[str] = mapped_column(String(500), default=""); points: Mapped[int] = mapped_column(Integer)
    active: Mapped[bool] = mapped_column(Boolean, default=True); at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class MissionClaim(Base):
    __tablename__ = "b5_mission_claims"
    __table_args__ = (UniqueConstraint("mission_id", "fan_id", name="uq_b5_claim_mission_fan"),)
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("mcl"))
    mission_id: Mapped[str] = mapped_column(ForeignKey("b5_missions.id", ondelete="CASCADE"), index=True)
    fan_id: Mapped[str] = mapped_column(UFK(), index=True); proof: Mapped[str] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(10), default="pending")  # pending|approved|rejected
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True); decided_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

class Moodboard(Base):
    __tablename__ = "b5_moodboards"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("mbd"))
    owner_id: Mapped[str] = mapped_column(UFK(), index=True); name: Mapped[str] = mapped_column(String(60))
    public: Mapped[bool] = mapped_column(Boolean, default=False); at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class MoodPin(Base):
    __tablename__ = "b5_moodboard_pins"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("mpn"))
    board_id: Mapped[str] = mapped_column(ForeignKey("b5_moodboards.id", ondelete="CASCADE"), index=True)
    media_url: Mapped[str | None] = mapped_column(String(200), nullable=True); note: Mapped[str] = mapped_column(String(300), default="")
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class LockPoll(Base):
    __tablename__ = "b5_polls"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("tlp"))
    creator_id: Mapped[str] = mapped_column(UFK(), index=True); question: Mapped[str] = mapped_column(String(200))
    options: Mapped[list] = mapped_column(JSON); reveal_at: Mapped[int] = mapped_column(BigInteger, index=True)
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class LockVote(Base):
    __tablename__ = "b5_poll_votes"
    poll_id: Mapped[str] = mapped_column(ForeignKey("b5_polls.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[str] = mapped_column(UFK(), primary_key=True); choice: Mapped[int] = mapped_column(Integer)
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class Thanks(Base):
    __tablename__ = "b5_thanks"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("thx"))
    author_id: Mapped[str] = mapped_column(UFK(), index=True); subject_id: Mapped[str] = mapped_column(UFK(), index=True)
    text: Mapped[str] = mapped_column(String(600)); context: Mapped[str] = mapped_column(String(20), default="help")  # collab|help
    status: Mapped[str] = mapped_column(String(10), default="pending", index=True)  # pending|approved|declined
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

# ============================== helpers ==============================
def person(db: Session, ref: str, me: M.User, verb: str) -> M.User:
    t = db.get(M.User, ref) or find_by_handle(db, ref)
    if not t or t.suspended: raise HTTPException(404, "No one with that @ID")
    if t.id == me.id: raise HTTPException(400, f"You can't {verb} yourself")
    if blocked_between(db, me.id, t.id): raise HTTPException(403, f"You can't {verb} this person")
    return t

def follows(db: Session, a: str, b: str) -> bool:
    return db.scalar(select(M.Edge.user_id).where(M.Edge.user_id == a, M.Edge.kind == "follow", M.Edge.target == b).limit(1)) is not None

def restricted_check(u: M.User):
    from .routes_trust import assert_not_restricted
    assert_not_restricted(u)

# ============================== Collab Canvas ==============================
F_CANVAS = "addons.glow.collabCanvas"
def authors(c: Canvas) -> list[str]: return [c.owner_id] + list(c.coauthors or [])
def canvas_json(db: Session, c: Canvas, me: M.User) -> dict:
    au = authors(c); tiles = c.tiles or []; nxt = None if c.locked else au[len(tiles) % len(au)]
    return {"id": c.id, "title": c.title, "locked": c.locked, "at": c.at, "owner": who(db, c.owner_id), "mine": c.owner_id == me.id,
            "authors": [who(db, x) for x in au], "isAuthor": me.id in au, "nextUp": who(db, nxt) if nxt else None, "myTurn": nxt == me.id,
            "tiles": [{**t, "by": who(db, t["by"])} for t in tiles]}

def canvas_get(db: Session, cid: str, me: M.User) -> Canvas:
    c = db.get(Canvas, cid)
    if not c or not (me.id in authors(c) or c.locked) or blocked_between(db, me.id, c.owner_id): raise HTTPException(404, "Canvas not found")
    return c

class CanvasIn(BaseModel): title: str = Field(min_length=1, max_length=80); coauthors: list[str] = Field(default_factory=list, max_length=20)
@router.post("/addons/b5/canvas")
def canvas_create(b: CanvasIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_CANVAS, "Collab Canvas"); restricted_check(u)
    mx = on(db, u, "addons.glow.collabCanvasMaxAuthors")
    ids = list(dict.fromkeys(person(db, r, u, "invite").id for r in b.coauthors))
    if len(ids) > mx: raise HTTPException(400, f"Invite up to {mx} co-authors")
    c = Canvas(owner_id=u.id, title=b.title.strip(), coauthors=ids, tiles=[]); db.add(c); db.commit()
    for x in ids: push(x, f"{u.name} invited you to a Collab Canvas", c.title, "CollabCanvas", {"id": c.id})
    return canvas_json(db, c, u)

@router.get("/addons/b5/canvas")
def canvas_list(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_CANVAS, "Collab Canvas")
    rows = db.scalars(select(Canvas).order_by(Canvas.at.desc()).limit(300)).all()
    mine = [c for c in rows if u.id in authors(c)]
    final = [c for c in rows if c.locked and u.id not in authors(c) and not blocked_between(db, u.id, c.owner_id)][:30]
    return {"mine": [canvas_json(db, c, u) for c in mine], "final": [canvas_json(db, c, u) for c in final]}

@router.get("/addons/b5/canvas/{cid}")
def canvas_one(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_CANVAS, "Collab Canvas"); return canvas_json(db, canvas_get(db, cid, u), u)

class TileIn(BaseModel): text: str = Field(min_length=1, max_length=280)
@router.post("/addons/b5/canvas/{cid}/tiles")
def canvas_tile(cid: str, b: TileIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_CANVAS, "Collab Canvas"); c = canvas_get(db, cid, u)
    au = authors(c)
    if u.id not in au: raise HTTPException(403, "Only co-authors can add tiles")
    if c.locked: raise HTTPException(409, "This canvas is locked")
    tiles = list(c.tiles or [])
    if len(tiles) >= 120: raise HTTPException(400, "A canvas holds up to 120 tiles")
    nxt = au[len(tiles) % len(au)]
    if nxt != u.id: raise HTTPException(409, "It's not your turn yet")
    tiles.append({"id": nid("tl"), "by": u.id, "text": b.text.strip(), "at": now_ms()}); c.tiles = tiles; db.commit()
    after = au[len(tiles) % len(au)]
    if after != u.id: push(after, "Your turn on the Collab Canvas", c.title, "CollabCanvas", {"id": c.id})
    return canvas_json(db, c, u)

class LockIn(BaseModel): locked: bool
@router.post("/addons/b5/canvas/{cid}/lock")
def canvas_lock(cid: str, b: LockIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_CANVAS, "Collab Canvas"); c = canvas_get(db, cid, u)
    if c.owner_id != u.id: raise HTTPException(403, "Only the owner can lock or unlock")
    c.locked = b.locked; db.commit()
    if b.locked:
        for x in c.coauthors or []: push(x, "Collab Canvas is final", c.title, "CollabCanvas", {"id": c.id})
    return canvas_json(db, c, u)

@router.delete("/addons/b5/canvas/{cid}")
def canvas_delete(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_CANVAS, "Collab Canvas")
    c = db.get(Canvas, cid)
    if not c or c.owner_id != u.id: raise HTTPException(404, "Canvas not found")
    db.delete(c); db.commit(); return {"ok": True}

# ============================== Creator Office Hours ==============================
F_OFFICE = "addons.glow.officeHours"
def slot_json(db: Session, s: OfficeSlot, me: M.User) -> dict:
    mine = s.creator_id == me.id
    return {"id": s.id, "startsAt": s.starts_at, "minutes": s.minutes, "topic": s.topic, "status": s.status, "creator": who(db, s.creator_id),
            "mine": mine, "bookedByMe": s.booked_by == me.id, "bookedBy": who(db, s.booked_by) if (mine and s.booked_by) else None}

class SlotIn(BaseModel):
    startsAt: int; minutes: int = Field(ge=10, le=120); topic: str = Field(default="", max_length=120); weeks: int = Field(default=1, ge=1, le=8)
@router.post("/addons/b5/office")
def office_open(b: SlotIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_OFFICE, "Creator Office Hours")
    now = now_ms()
    if not now + 5 * 60_000 <= b.startsAt <= now + 60 * DAY: raise HTTPException(400, "Pick a start time between 5 minutes and 60 days from now")
    mx = on(db, u, "addons.glow.officeHoursMaxOpen")
    have = db.scalar(select(func.count()).select_from(OfficeSlot).where(OfficeSlot.creator_id == u.id, OfficeSlot.status != "cancelled", OfficeSlot.starts_at > now)) or 0
    if have + b.weeks > mx: raise HTTPException(400, f"You can have up to {mx} upcoming slots")
    out = []
    for w in range(b.weeks):
        st = b.startsAt + w * 7 * DAY; en = st + b.minutes * 60_000
        clash = db.scalar(select(OfficeSlot.id).where(OfficeSlot.creator_id == u.id, OfficeSlot.status != "cancelled", OfficeSlot.starts_at < en,
                                                       OfficeSlot.starts_at + OfficeSlot.minutes * 60_000 > st).limit(1))
        if clash: raise HTTPException(409, "That overlaps a slot you already opened")
        s = OfficeSlot(creator_id=u.id, starts_at=st, minutes=b.minutes, topic=b.topic.strip()); db.add(s); db.flush(); out.append(s)
    db.commit(); return [slot_json(db, s, u) for s in out]

@router.get("/addons/b5/office")
def office_mine(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_OFFICE, "Creator Office Hours")
    since = now_ms() - DAY
    hosting = db.scalars(select(OfficeSlot).where(OfficeSlot.creator_id == u.id, OfficeSlot.starts_at > since).order_by(OfficeSlot.starts_at)).all()
    booked = db.scalars(select(OfficeSlot).where(OfficeSlot.booked_by == u.id, OfficeSlot.starts_at > since).order_by(OfficeSlot.starts_at)).all()
    following = list(db.scalars(select(M.Edge.target).where(M.Edge.user_id == u.id, M.Edge.kind == "follow")))
    hosts = db.execute(select(OfficeSlot.creator_id, func.count()).where(OfficeSlot.creator_id.in_(following or ["-"]), OfficeSlot.status == "open",
                                                                         OfficeSlot.starts_at > now_ms()).group_by(OfficeSlot.creator_id)).all()
    return {"hosting": [slot_json(db, s, u) for s in hosting], "booked": [slot_json(db, s, u) for s in booked],
            "hosts": [{"user": who(db, cid), "open": n} for cid, n in hosts]}

@router.get("/addons/b5/office/creator/{ref}")
def office_of(ref: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_OFFICE, "Creator Office Hours")
    c = db.get(M.User, ref) or find_by_handle(db, ref)
    if not c or blocked_between(db, u.id, c.id): raise HTTPException(404, "No one with that @ID")
    rows = db.scalars(select(OfficeSlot).where(OfficeSlot.creator_id == c.id, OfficeSlot.status != "cancelled", OfficeSlot.starts_at > now_ms()).order_by(OfficeSlot.starts_at)).all()
    return {"creator": who(db, c.id), "canBook": c.id == u.id or follows(db, u.id, c.id), "slots": [slot_json(db, s, u) for s in rows]}

@router.post("/addons/b5/office/{sid}/book")
def office_book(sid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_OFFICE, "Creator Office Hours")
    s = db.get(OfficeSlot, sid)
    if not s or s.status == "cancelled" or blocked_between(db, u.id, s.creator_id): raise HTTPException(404, "Slot not found")
    if s.creator_id == u.id: raise HTTPException(400, "You can't book your own slot")
    if not follows(db, u.id, s.creator_id): raise HTTPException(403, "Follow this creator to book their office hours")
    if s.starts_at <= now_ms(): raise HTTPException(400, "This slot has already started")
    # atomic claim — two fans tapping at once can't both get it
    r = db.execute(update(OfficeSlot).where(OfficeSlot.id == sid, OfficeSlot.status == "open", OfficeSlot.booked_by.is_(None)).values(booked_by=u.id, status="booked"))
    if r.rowcount != 1: db.rollback(); raise HTTPException(409, "Someone already booked this slot")
    db.commit(); db.refresh(s)
    push(s.creator_id, "Office hours booked", f"{u.name} booked your slot", "OfficeHours")
    return slot_json(db, s, u)

@router.post("/addons/b5/office/{sid}/release")
def office_release(sid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_OFFICE, "Creator Office Hours")
    s = db.get(OfficeSlot, sid)
    if not s or s.booked_by != u.id or s.status != "booked": raise HTTPException(404, "Booking not found")
    s.booked_by = None; s.status = "open"; db.commit()
    push(s.creator_id, "Office hours slot freed", f"{u.name} gave up their booking", "OfficeHours")
    return slot_json(db, s, u)

@router.post("/addons/b5/office/{sid}/cancel")
def office_cancel(sid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_OFFICE, "Creator Office Hours")
    s = db.get(OfficeSlot, sid)
    if not s or s.creator_id != u.id: raise HTTPException(404, "Slot not found")
    if s.status == "cancelled": raise HTTPException(409, "Already cancelled")
    if s.booked_by: push(s.booked_by, "Office hours cancelled", f"{u.name} cancelled your booked slot", "OfficeHours")
    s.status = "cancelled"; db.commit(); return slot_json(db, s, u)

# ============================== Fan Missions ==============================
F_MISSION = "addons.glow.fanMissions"
def mission_json(db: Session, m: Mission, me: M.User) -> dict:
    mine = db.scalar(select(MissionClaim).where(MissionClaim.mission_id == m.id, MissionClaim.fan_id == me.id))
    done = db.scalar(select(func.count()).select_from(MissionClaim).where(MissionClaim.mission_id == m.id, MissionClaim.status == "approved")) or 0
    return {"id": m.id, "title": m.title, "detail": m.detail, "points": m.points, "active": m.active, "at": m.at, "creator": who(db, m.creator_id),
            "mine": m.creator_id == me.id, "completed": done, "myClaim": {"id": mine.id, "status": mine.status, "proof": mine.proof} if mine else None}

def board(db: Session, cid: str) -> list:
    rows = db.execute(select(MissionClaim.fan_id, func.sum(Mission.points)).join(Mission, Mission.id == MissionClaim.mission_id)
                      .where(Mission.creator_id == cid, MissionClaim.status == "approved").group_by(MissionClaim.fan_id)
                      .order_by(func.sum(Mission.points).desc()).limit(20)).all()
    return [{"user": who(db, f), "points": int(p)} for f, p in rows]

class MissionIn(BaseModel): title: str = Field(min_length=3, max_length=80); detail: str = Field(default="", max_length=500); points: int = Field(ge=1, le=1000)
@router.post("/addons/b5/missions")
def mission_create(b: MissionIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_MISSION, "Fan Missions"); restricted_check(u)
    mx = on(db, u, "addons.glow.fanMissionsMaxActive")
    if (db.scalar(select(func.count()).select_from(Mission).where(Mission.creator_id == u.id, Mission.active)) or 0) >= mx:
        raise HTTPException(400, f"You can have up to {mx} active missions — close one first")
    m = Mission(creator_id=u.id, title=b.title.strip(), detail=b.detail.strip(), points=b.points); db.add(m); db.commit()
    return mission_json(db, m, u)

@router.get("/addons/b5/missions")
def mission_home(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_MISSION, "Fan Missions")
    mine = db.scalars(select(Mission).where(Mission.creator_id == u.id).order_by(Mission.at.desc())).all()
    pending = db.execute(select(MissionClaim, Mission).join(Mission, Mission.id == MissionClaim.mission_id)
                         .where(Mission.creator_id == u.id, MissionClaim.status == "pending").order_by(MissionClaim.at)).all()
    following = list(db.scalars(select(M.Edge.target).where(M.Edge.user_id == u.id, M.Edge.kind == "follow")))
    feed = db.scalars(select(Mission).where(Mission.creator_id.in_(following or ["-"]), Mission.active).order_by(Mission.at.desc()).limit(50)).all()
    return {"mine": [mission_json(db, m, u) for m in mine], "feed": [mission_json(db, m, u) for m in feed],
            "review": [{"id": c.id, "proof": c.proof, "at": c.at, "fan": who(db, c.fan_id), "mission": m.title, "points": m.points} for c, m in pending],
            "board": board(db, u.id)}

@router.get("/addons/b5/missions/creator/{ref}")
def mission_creator(ref: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_MISSION, "Fan Missions")
    c = db.get(M.User, ref) or find_by_handle(db, ref)
    if not c or blocked_between(db, u.id, c.id): raise HTTPException(404, "No one with that @ID")
    ms = db.scalars(select(Mission).where(Mission.creator_id == c.id, Mission.active).order_by(Mission.at.desc())).all()
    return {"creator": who(db, c.id), "missions": [mission_json(db, m, u) for m in ms], "board": board(db, c.id)}

class ClaimIn(BaseModel): proof: str = Field(min_length=3, max_length=500)
@router.post("/addons/b5/missions/{mid}/claim")
def mission_claim(mid: str, b: ClaimIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_MISSION, "Fan Missions")
    m = db.get(Mission, mid)
    if not m or blocked_between(db, u.id, m.creator_id): raise HTTPException(404, "Mission not found")
    if not m.active: raise HTTPException(409, "This mission is closed")
    if m.creator_id == u.id: raise HTTPException(400, "You can't do your own mission")
    c = db.scalar(select(MissionClaim).where(MissionClaim.mission_id == mid, MissionClaim.fan_id == u.id))
    if c and c.status == "approved": raise HTTPException(409, "Already approved")
    if c: c.proof = b.proof.strip(); c.status = "pending"; c.at = now_ms(); c.decided_at = None
    else: db.add(MissionClaim(mission_id=mid, fan_id=u.id, proof=b.proof.strip()))
    db.commit(); push(m.creator_id, "Mission proof to review", f"{u.name}: {m.title}", "FanMissions")
    return mission_json(db, m, u)

class DecideIn(BaseModel): approve: bool
@router.post("/addons/b5/missions/claims/{cid}")
def mission_decide(cid: str, b: DecideIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_MISSION, "Fan Missions")
    c = db.get(MissionClaim, cid); m = db.get(Mission, c.mission_id) if c else None
    if not c or not m or m.creator_id != u.id: raise HTTPException(404, "Claim not found")
    if c.status != "pending": raise HTTPException(409, "Already decided")
    c.status = "approved" if b.approve else "rejected"; c.decided_at = now_ms(); db.commit()
    push(c.fan_id, f"Mission {'approved' if b.approve else 'not approved'}", f"{m.title}{f' · +{m.points} pts' if b.approve else ''}", "FanMissions")
    return {"id": c.id, "status": c.status}

@router.post("/addons/b5/missions/{mid}/close")
def mission_close(mid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_MISSION, "Fan Missions")
    m = db.get(Mission, mid)
    if not m or m.creator_id != u.id: raise HTTPException(404, "Mission not found")
    m.active = False; db.commit(); return mission_json(db, m, u)

# ============================== Moodboard Pins ==============================
F_MOOD = "addons.glow.moodboards"
def mood_json(db: Session, b: Moodboard, me: M.User, pins=True) -> dict:
    ps = db.scalars(select(MoodPin).where(MoodPin.board_id == b.id).order_by(MoodPin.at.desc())).all()
    return {"id": b.id, "name": b.name, "public": b.public, "at": b.at, "owner": who(db, b.owner_id), "mine": b.owner_id == me.id, "count": len(ps),
            "cover": next((p.media_url for p in ps if p.media_url), None),
            "pins": [{"id": p.id, "mediaUrl": p.media_url, "note": p.note, "at": p.at} for p in ps] if pins else None}

def mood_get(db: Session, bid: str, me: M.User, owner=False) -> Moodboard:
    b = db.get(Moodboard, bid)
    if not b or not (b.owner_id == me.id or (b.public and not owner and not blocked_between(db, me.id, b.owner_id))): raise HTTPException(404, "Moodboard not found")
    return b

class BoardIn(BaseModel): name: str = Field(min_length=1, max_length=60); public: bool = False
@router.post("/addons/b5/moodboards")
def mood_create(b: BoardIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_MOOD, "Moodboard Pins")
    if (db.scalar(select(func.count()).select_from(Moodboard).where(Moodboard.owner_id == u.id)) or 0) >= 50: raise HTTPException(400, "Up to 50 moodboards")
    m = Moodboard(owner_id=u.id, name=b.name.strip(), public=b.public); db.add(m); db.commit(); return mood_json(db, m, u)

@router.get("/addons/b5/moodboards")
def mood_list(user: str | None = Query(None, max_length=60), u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_MOOD, "Moodboard Pins")
    if user:
        t = db.get(M.User, user) or find_by_handle(db, user)
        if not t or blocked_between(db, u.id, t.id): raise HTTPException(404, "No one with that @ID")
        q = select(Moodboard).where(Moodboard.owner_id == t.id)
        if t.id != u.id: q = q.where(Moodboard.public)
    else: q = select(Moodboard).where(Moodboard.owner_id == u.id)
    return [mood_json(db, b, u, pins=False) for b in db.scalars(q.order_by(Moodboard.at.desc()))]

@router.get("/addons/b5/moodboards/{bid}")
def mood_one(bid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_MOOD, "Moodboard Pins"); return mood_json(db, mood_get(db, bid, u), u)

class BoardPatch(BaseModel): name: str | None = Field(default=None, min_length=1, max_length=60); public: bool | None = None
@router.patch("/addons/b5/moodboards/{bid}")
def mood_patch(bid: str, b: BoardPatch, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_MOOD, "Moodboard Pins"); m = mood_get(db, bid, u, owner=True)
    if b.name: m.name = b.name.strip()
    if b.public is not None:
        m.public = b.public
        if b.public:
            from .routes_media import mark_public
            for p in db.scalars(select(MoodPin).where(MoodPin.board_id == m.id, MoodPin.media_url.is_not(None))): mark_public(db, p.media_url, u)
    db.commit(); return mood_json(db, m, u)

class PinIn(BaseModel): mediaUrl: str | None = Field(default=None, max_length=200); note: str = Field(default="", max_length=300)
@router.post("/addons/b5/moodboards/{bid}/pins")
def mood_pin(bid: str, b: PinIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_MOOD, "Moodboard Pins"); m = mood_get(db, bid, u, owner=True)
    if not b.mediaUrl and not b.note.strip(): raise HTTPException(400, "Add a photo or a note")
    if b.mediaUrl:
        mf = db.get(M.MediaFile, b.mediaUrl.split("/")[-1].split(".")[0].split("?")[0]) if b.mediaUrl.startswith("/media/") else None
        if not mf or mf.owner_id != u.id: raise HTTPException(400, "Pin only media you uploaded")
        if m.public:
            from .routes_media import mark_public
            mark_public(db, b.mediaUrl, u)
    if (db.scalar(select(func.count()).select_from(MoodPin).where(MoodPin.board_id == m.id)) or 0) >= on(db, u, "addons.glow.moodboardMaxPins"):
        raise HTTPException(400, "This moodboard is full")
    db.add(MoodPin(board_id=m.id, media_url=b.mediaUrl, note=b.note.strip())); db.commit(); return mood_json(db, m, u)

@router.delete("/addons/b5/moodboards/{bid}/pins/{pid}")
def mood_unpin(bid: str, pid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_MOOD, "Moodboard Pins"); m = mood_get(db, bid, u, owner=True)
    p = db.get(MoodPin, pid)
    if not p or p.board_id != m.id: raise HTTPException(404, "Pin not found")
    db.delete(p); db.commit(); return mood_json(db, m, u)

@router.delete("/addons/b5/moodboards/{bid}")
def mood_delete(bid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_MOOD, "Moodboard Pins")
    m = db.get(Moodboard, bid)
    if not m or m.owner_id != u.id: raise HTTPException(404, "Moodboard not found")
    db.delete(m); db.commit(); return {"ok": True}

# ============================== Time-Lock Polls ==============================
F_POLL = "addons.glow.timeLockPolls"
def poll_json(db: Session, p: LockPoll, me: M.User) -> dict:
    open_ = p.reveal_at <= now_ms()
    mine = db.get(LockVote, (p.id, me.id))
    total = db.scalar(select(func.count()).select_from(LockVote).where(LockVote.poll_id == p.id)) or 0
    res = None
    if open_:
        cnt = dict(db.execute(select(LockVote.choice, func.count()).where(LockVote.poll_id == p.id).group_by(LockVote.choice)).all())
        res = [cnt.get(i, 0) for i in range(len(p.options))]
    return {"id": p.id, "question": p.question, "options": p.options, "revealAt": p.reveal_at, "revealed": open_, "at": p.at,
            "creator": who(db, p.creator_id), "mine": p.creator_id == me.id, "myVote": mine.choice if mine else None, "votes": total, "results": res}

class PollIn(BaseModel): question: str = Field(min_length=3, max_length=200); options: list[str] = Field(min_length=2, max_length=6); revealAt: int
@router.post("/addons/b5/polls")
def poll_create(b: PollIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_POLL, "Time-Lock Polls"); restricted_check(u)
    opts = [o.strip()[:60] for o in b.options if o.strip()]
    if len(opts) < 2 or len(set(o.lower() for o in opts)) != len(opts): raise HTTPException(400, "Give at least 2 different options")
    now = now_ms(); mx = on(db, u, "addons.glow.timeLockMaxDays")
    if not now + 5 * 60_000 <= b.revealAt <= now + mx * DAY: raise HTTPException(400, f"Pick a reveal time between 5 minutes and {mx} days from now")
    p = LockPoll(creator_id=u.id, question=b.question.strip(), options=opts, reveal_at=b.revealAt); db.add(p); db.commit()
    return poll_json(db, p, u)

@router.get("/addons/b5/polls")
def poll_list(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_POLL, "Time-Lock Polls")
    following = list(db.scalars(select(M.Edge.target).where(M.Edge.user_id == u.id, M.Edge.kind == "follow")))
    rows = db.scalars(select(LockPoll).where(LockPoll.creator_id.in_(following + [u.id])).order_by(LockPoll.at.desc()).limit(60)).all()
    return [poll_json(db, p, u) for p in rows]

@router.get("/addons/b5/polls/{pid}")
def poll_one(pid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_POLL, "Time-Lock Polls")
    p = db.get(LockPoll, pid)
    if not p or blocked_between(db, u.id, p.creator_id): raise HTTPException(404, "Poll not found")
    return poll_json(db, p, u)

class VoteIn(BaseModel): choice: int = Field(ge=0, le=5)
@router.post("/addons/b5/polls/{pid}/vote")
def poll_vote(pid: str, b: VoteIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_POLL, "Time-Lock Polls")
    p = db.get(LockPoll, pid)
    if not p or blocked_between(db, u.id, p.creator_id): raise HTTPException(404, "Poll not found")
    if p.reveal_at <= now_ms(): raise HTTPException(409, "Voting closed — results are out")
    if b.choice >= len(p.options): raise HTTPException(400, "Pick one of the options")
    if db.get(LockVote, (p.id, u.id)): raise HTTPException(409, "You already voted")
    db.add(LockVote(poll_id=p.id, user_id=u.id, choice=b.choice)); db.commit(); return poll_json(db, p, u)

@router.delete("/addons/b5/polls/{pid}")
def poll_delete(pid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_POLL, "Time-Lock Polls")
    p = db.get(LockPoll, pid)
    if not p or p.creator_id != u.id: raise HTTPException(404, "Poll not found")
    db.delete(p); db.commit(); return {"ok": True}

# ============================== Thank-You Stories ==============================
F_THANKS = "addons.glow.thankYouStories"
def thanks_json(db: Session, t: Thanks) -> dict:
    return {"id": t.id, "text": t.text, "context": t.context, "status": t.status, "at": t.at, "author": who(db, t.author_id), "subject": who(db, t.subject_id)}

class ThanksIn(BaseModel): to: str = Field(min_length=1, max_length=60); text: str = Field(min_length=10, max_length=600); context: str = Field(default="help", pattern=r"^(collab|help)$")
@router.post("/addons/b5/thanks")
def thanks_write(b: ThanksIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_THANKS, "Thank-You Stories"); restricted_check(u)
    t = person(db, b.to, u, "thank")
    used = db.scalar(select(func.count()).select_from(Thanks).where(Thanks.author_id == u.id, Thanks.at > now_ms() - DAY)) or 0
    if used >= (cap := on(db, u, "addons.glow.thankYouPerDay")): raise HTTPException(429, f"You've written {cap} thank-you stories today — more tomorrow")
    x = Thanks(author_id=u.id, subject_id=t.id, text=b.text.strip(), context=b.context); db.add(x); db.commit()
    push(t.id, f"{u.name} wrote you a thank-you", "Approve it to show it on your profile", "ThankYouStories")
    return thanks_json(db, x)

@router.get("/addons/b5/thanks")
def thanks_home(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_THANKS, "Thank-You Stories")
    q = lambda *w: [thanks_json(db, t) for t in db.scalars(select(Thanks).where(*w).order_by(Thanks.at.desc()).limit(50))]  # noqa: E731
    return {"inbox": q(Thanks.subject_id == u.id, Thanks.status == "pending"), "aboutMe": q(Thanks.subject_id == u.id, Thanks.status == "approved"),
            "written": q(Thanks.author_id == u.id)}

@router.get("/addons/b5/thanks/user/{ref}")
def thanks_public(ref: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_THANKS, "Thank-You Stories")
    t = db.get(M.User, ref) or find_by_handle(db, ref)
    if not t or blocked_between(db, u.id, t.id): raise HTTPException(404, "No one with that @ID")
    rows = db.scalars(select(Thanks).where(Thanks.subject_id == t.id, Thanks.status == "approved").order_by(Thanks.at.desc()).limit(50)).all()
    rows = [x for x in rows if not blocked_between(db, u.id, x.author_id)]
    return {"user": who(db, t.id), "stories": [thanks_json(db, x) for x in rows]}

class ThanksDecide(BaseModel): approve: bool
@router.post("/addons/b5/thanks/{tid}/decide")
def thanks_decide(tid: str, b: ThanksDecide, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_THANKS, "Thank-You Stories")
    t = db.get(Thanks, tid)
    if not t or t.subject_id != u.id: raise HTTPException(404, "Story not found")
    t.status = "approved" if b.approve else "declined"; db.commit()
    if b.approve: push(t.author_id, "Your thank-you is live", f"{u.name} approved your story", "ThankYouStories")
    return thanks_json(db, t)

@router.delete("/addons/b5/thanks/{tid}")
def thanks_delete(tid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_THANKS, "Thank-You Stories")
    t = db.get(Thanks, tid)
    if not t or u.id not in (t.author_id, t.subject_id): raise HTTPException(404, "Story not found")
    db.delete(t); db.commit(); return {"ok": True}

# ============================== staff ==============================
ITEMS = [("Collab Canvas", "collabCanvas", Canvas), ("Creator Office Hours", "officeHours", OfficeSlot), ("Fan Missions", "fanMissions", Mission),
         ("Moodboard Pins", "moodboards", Moodboard), ("Time-Lock Polls", "timeLockPolls", LockPoll), ("Thank-You Stories", "thankYouStories", Thanks)]
@router.get("/admin/addons/b5")
def admin_b5(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    wk = now_ms() - 7 * DAY
    return {"title": "Batch 5 · Glow creator & community", "module": "glow",
            "items": [{"name": n, "flag": f"addons.glow.{k}", "on": bool(on(db, None, f"addons.glow.{k}")),
                       "week": db.scalar(select(func.count()).select_from(T).where(T.at > wk)) or 0} for n, k, T in ITEMS]}

@router.get("/admin/addons/b5/thanks")
def admin_thanks(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    return [thanks_json(db, t) for t in db.scalars(select(Thanks).where(Thanks.status == "approved").order_by(Thanks.at.desc()).limit(100))]

@router.delete("/admin/addons/b5/{kind}/{xid}")
def admin_remove(kind: str, xid: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    T = {"canvas": Canvas, "missions": Mission, "moodboards": Moodboard, "polls": LockPoll, "thanks": Thanks, "office": OfficeSlot}.get(kind)
    if not T: raise HTTPException(404, "Unknown kind")
    if x := db.get(T, xid): db.delete(x)
    audit(db, a.handle, "addons.b5_remove", f"{kind} {xid}"); db.commit(); return {"ok": True}
