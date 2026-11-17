"""VibeLoop add-ons, batch 3 (Glow) — each switchable in User App Settings (addons.glow.*).

  Local Pulse      short area-tagged updates ("Indiranagar"); browse by area; expire after admin-set hours; reports go to moderation.
  Skill Swap Board "I can teach X / I want to learn Y" listings; matches find complementary listings; swap requests accept/decline.
  Ask Box          ask a creator a question (optionally anonymous to them — never to staff); creator answers publicly or deletes.
  Memory Lane      your own posts from this day in previous years; pin a memory with a note.
  Goal Ladder      public goals with up to 10 milestones; tick them; friends cheer; completion celebrates.
  Wish Shelf       your wishlist; friends secretly claim an item to gift — the owner never sees claims.
"""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import String, Text, BigInteger, Integer, Boolean, JSON, ForeignKey, Index, UniqueConstraint, select, func, or_
from sqlalchemy.orm import Session, Mapped, mapped_column
from .db import get_db
from . import models as M
from .models import Base, nid, now_ms
from .security import current_user, require, audit
from .v2common import user_json, are_friends, blocked_between

router = APIRouter()
STAFF = require("owner", "admin", "moderator", "support")
HOUR, DAY = 3_600_000, 86_400_000
def _fk(): return ForeignKey("users.id", ondelete="CASCADE")

# ----------------------------------------------------------------- models
class PulseNote(Base):
    __tablename__ = "b3_pulse"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("pls"))
    user_id: Mapped[str] = mapped_column(_fk(), index=True)
    area: Mapped[str] = mapped_column(String(60)); area_key: Mapped[str] = mapped_column(String(60), index=True)
    text: Mapped[str] = mapped_column(String(280)); hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    reports: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[int] = mapped_column(BigInteger, index=True); at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class PulseReport(Base):
    __tablename__ = "b3_pulse_reports"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("plr"))
    pulse_id: Mapped[str] = mapped_column(ForeignKey("b3_pulse.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(_fk(), index=True); reason: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(12), default="open"); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)
    __table_args__ = (UniqueConstraint("pulse_id", "user_id", name="uq_b3_pulse_report"),)

class SkillListing(Base):
    __tablename__ = "b3_skills"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("skl"))
    user_id: Mapped[str] = mapped_column(_fk(), index=True)
    teach: Mapped[str] = mapped_column(String(60)); learn: Mapped[str] = mapped_column(String(60)); note: Mapped[str] = mapped_column(String(200), default="")
    open: Mapped[bool] = mapped_column(Boolean, default=True); at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class SwapRequest(Base):
    __tablename__ = "b3_swaps"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("swp"))
    listing_id: Mapped[str] = mapped_column(ForeignKey("b3_skills.id", ondelete="CASCADE"), index=True)
    from_id: Mapped[str] = mapped_column(_fk(), index=True); to_id: Mapped[str] = mapped_column(_fk(), index=True)
    message: Mapped[str] = mapped_column(String(200), default=""); status: Mapped[str] = mapped_column(String(12), default="pending")
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class AskQuestion(Base):
    __tablename__ = "b3_questions"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("ask"))
    owner_id: Mapped[str] = mapped_column(_fk(), index=True); asker_id: Mapped[str] = mapped_column(_fk(), index=True)
    anon: Mapped[bool] = mapped_column(Boolean, default=False); text: Mapped[str] = mapped_column(String(300))
    answer: Mapped[str | None] = mapped_column(Text, nullable=True); answered_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class MemoryPin(Base):
    __tablename__ = "b3_memories"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("mem"))
    user_id: Mapped[str] = mapped_column(_fk(), index=True)
    post_id: Mapped[str] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), index=True)
    note: Mapped[str] = mapped_column(String(200), default=""); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)
    __table_args__ = (UniqueConstraint("user_id", "post_id", name="uq_b3_memory"),)

class Goal(Base):
    __tablename__ = "b3_goals"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("gol"))
    user_id: Mapped[str] = mapped_column(_fk(), index=True)
    title: Mapped[str] = mapped_column(String(100)); why: Mapped[str] = mapped_column(String(200), default="")
    steps: Mapped[list] = mapped_column(JSON, default=list); cheers: Mapped[list] = mapped_column(JSON, default=list)
    done_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True); at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class Wish(Base):
    __tablename__ = "b3_wishes"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("wsh"))
    owner_id: Mapped[str] = mapped_column(_fk(), index=True)
    title: Mapped[str] = mapped_column(String(100)); link: Mapped[str | None] = mapped_column(String(300), nullable=True)
    note: Mapped[str] = mapped_column(String(200), default=""); at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class WishClaim(Base):
    __tablename__ = "b3_wish_claims"
    wish_id: Mapped[str] = mapped_column(ForeignKey("b3_wishes.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[str] = mapped_column(_fk(), index=True); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

# ----------------------------------------------------------------- helpers
def on(db: Session, u, path: str):
    from .user_app import setting
    return setting(db, path, u)

def need(db: Session, u, key: str, name: str):
    if not on(db, u, f"addons.glow.{key}"): raise HTTPException(403, f"{name} is turned off")

def push(uid: str, title: str, body: str, route: str, params: dict | None = None):
    try:
        from .push import queue
        queue(uid, "addon", title, body, {"route": route, "params": params or {}})
    except Exception: pass

def who(db: Session, uid: str) -> dict | None:
    u = db.get(M.User, uid); return user_json(u) if u else None

def not_restricted(u: M.User):
    from .routes_trust import assert_not_restricted
    assert_not_restricted(u)

def find_user(db: Session, ref: str) -> M.User:
    u = db.get(M.User, ref) or db.scalar(select(M.User).where(M.User.handle == ref.lstrip("@")))
    if not u: raise HTTPException(404, "User not found")
    return u

def blocked_ids(db: Session, me: str) -> set[str]:
    rows = db.execute(select(M.Edge.user_id, M.Edge.target).where(M.Edge.kind == "block", or_(M.Edge.user_id == me, M.Edge.target == me))).all()
    return {b if a == me else a for a, b in rows}

def norm(s: str) -> str: return " ".join(s.lower().split())

# =====================================================================
# Local Pulse
# =====================================================================
def pulse_json(db, p: PulseNote, me: M.User) -> dict:
    return {"id": p.id, "area": p.area, "text": p.text, "at": p.at, "expiresAt": p.expires_at, "user": who(db, p.user_id), "mine": p.user_id == me.id}

class PulseIn(BaseModel):
    area: str = Field(min_length=2, max_length=60); text: str = Field(min_length=1, max_length=280)

@router.post("/addons/b3/pulse")
def pulse_post(b: PulseIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "localPulse", "Local Pulse"); not_restricted(u)
    area = " ".join(b.area.split()); text = b.text.strip()
    if not area or not text: raise HTTPException(400, "Add an area and some text")
    p = PulseNote(user_id=u.id, area=area, area_key=norm(area), text=text, expires_at=now_ms() + on(db, u, "addons.glow.localPulseHours") * HOUR)
    db.add(p); db.commit(); return pulse_json(db, p, u)

@router.get("/addons/b3/pulse")
def pulse_list(area: str | None = Query(None, max_length=60), cursor: int = Query(0, ge=0), u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "localPulse", "Local Pulse")
    q = select(PulseNote).where(PulseNote.expires_at > now_ms(), PulseNote.hidden == False)  # noqa: E712
    if area: q = q.where(PulseNote.area_key == norm(area))
    bl = blocked_ids(db, u.id)
    if bl: q = q.where(PulseNote.user_id.notin_(bl))
    rows = db.scalars(q.order_by(PulseNote.at.desc()).offset(cursor).limit(30)).all()
    return {"items": [pulse_json(db, p, u) for p in rows], "nextCursor": cursor + 30 if len(rows) == 30 else None}

@router.get("/addons/b3/pulse/areas")
def pulse_areas(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "localPulse", "Local Pulse")
    rows = db.execute(select(PulseNote.area_key, func.max(PulseNote.area), func.count()).where(PulseNote.expires_at > now_ms(), PulseNote.hidden == False)  # noqa: E712
                      .group_by(PulseNote.area_key).order_by(func.count().desc()).limit(30)).all()
    return [{"area": a, "count": n} for _, a, n in rows]

@router.delete("/addons/b3/pulse/{pid}")
def pulse_delete(pid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "localPulse", "Local Pulse")
    p = db.get(PulseNote, pid)
    if not p or p.user_id != u.id: raise HTTPException(404, "Update not found")
    db.delete(p); db.commit(); return {"ok": True}

class ReportIn(BaseModel): reason: str = Field(min_length=2, max_length=120)
@router.post("/addons/b3/pulse/{pid}/report")
def pulse_report(pid: str, b: ReportIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "localPulse", "Local Pulse")
    p = db.get(PulseNote, pid)
    if not p or p.hidden or p.expires_at <= now_ms(): raise HTTPException(404, "Update not found")
    if p.user_id == u.id: raise HTTPException(400, "You can't report your own update")
    if db.scalar(select(PulseReport).where(PulseReport.pulse_id == pid, PulseReport.user_id == u.id)): return {"ok": True, "already": True}
    db.add(PulseReport(pulse_id=pid, user_id=u.id, reason=b.reason.strip()))
    db.add(M.Report(reporter_id=u.id, target=f"pulse:{pid}", reason=b.reason.strip()[:120], reason_code="pulse"))
    p.reports += 1
    if p.reports >= on(db, u, "addons.glow.localPulseHideAt"): p.hidden = True
    db.commit(); return {"ok": True}

@router.get("/admin/addons/b3/pulse/reports")
def admin_pulse_reports(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    rows = db.scalars(select(PulseNote).where(PulseNote.reports > 0).order_by(PulseNote.at.desc()).limit(100)).all()
    out = []
    for p in rows:
        rs = db.scalars(select(PulseReport).where(PulseReport.pulse_id == p.id)).all()
        out.append({"id": p.id, "area": p.area, "text": p.text, "hidden": p.hidden, "user": who(db, p.user_id), "at": p.at,
                    "reports": [{"reason": r.reason, "by": who(db, r.user_id), "at": r.at, "status": r.status} for r in rs]})
    return out

class ModIn(BaseModel): action: str = Field(pattern=r"^(hide|restore)$")
@router.post("/admin/addons/b3/pulse/{pid}")
def admin_pulse_mod(pid: str, b: ModIn, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    p = db.get(PulseNote, pid)
    if not p: raise HTTPException(404, "Update not found")
    p.hidden = b.action == "hide"
    for r in db.scalars(select(PulseReport).where(PulseReport.pulse_id == pid)): r.status = "actioned" if p.hidden else "dismissed"
    audit(db, a.handle, f"addons.pulse_{b.action}", pid); db.commit(); return {"ok": True, "hidden": p.hidden}

# =====================================================================
# Skill Swap Board
# =====================================================================
def skill_json(db, s: SkillListing, me: M.User) -> dict:
    return {"id": s.id, "teach": s.teach, "learn": s.learn, "note": s.note, "open": s.open, "at": s.at, "user": who(db, s.user_id), "mine": s.user_id == me.id}

def swap_json(db, r: SwapRequest, me: M.User) -> dict:
    s = db.get(SkillListing, r.listing_id)
    return {"id": r.id, "status": r.status, "message": r.message, "at": r.at, "from": who(db, r.from_id), "to": who(db, r.to_id),
            "incoming": r.to_id == me.id, "listing": {"id": s.id, "teach": s.teach, "learn": s.learn} if s else None}

class SkillIn(BaseModel):
    teach: str = Field(min_length=2, max_length=60); learn: str = Field(min_length=2, max_length=60); note: str = Field(default="", max_length=200)

@router.post("/addons/b3/skills")
def skill_create(b: SkillIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "skillSwap", "Skill Swap Board"); not_restricted(u)
    if norm(b.teach) == norm(b.learn): raise HTTPException(400, "Teach and learn should be different skills")
    if (db.scalar(select(func.count()).select_from(SkillListing).where(SkillListing.user_id == u.id, SkillListing.open == True)) or 0) >= 10:  # noqa: E712
        raise HTTPException(400, "You can have up to 10 open listings")
    s = SkillListing(user_id=u.id, teach=b.teach.strip(), learn=b.learn.strip(), note=b.note.strip()); db.add(s); db.commit(); return skill_json(db, s, u)

@router.get("/addons/b3/skills")
def skill_list(q: str | None = Query(None, max_length=60), u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "skillSwap", "Skill Swap Board")
    st = select(SkillListing).where(SkillListing.open == True)  # noqa: E712
    if q: st = st.where(or_(SkillListing.teach.ilike(f"%{q.strip()}%"), SkillListing.learn.ilike(f"%{q.strip()}%")))
    bl = blocked_ids(db, u.id)
    rows = [s for s in db.scalars(st.order_by(SkillListing.at.desc()).limit(60)) if s.user_id not in bl]
    mine = db.scalars(select(SkillListing).where(SkillListing.user_id == u.id).order_by(SkillListing.at.desc())).all()
    return {"board": [skill_json(db, s, u) for s in rows if s.user_id != u.id], "mine": [skill_json(db, s, u) for s in mine]}

@router.delete("/addons/b3/skills/{sid}")
def skill_close(sid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "skillSwap", "Skill Swap Board")
    s = db.get(SkillListing, sid)
    if not s or s.user_id != u.id: raise HTTPException(404, "Listing not found")
    s.open = False; db.commit(); return {"ok": True}

def _like(a: str, b: str) -> bool:
    a, b = norm(a), norm(b); return a == b or a in b or b in a

@router.get("/addons/b3/skills/{sid}/matches")
def skill_matches(sid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "skillSwap", "Skill Swap Board")
    s = db.get(SkillListing, sid)
    if not s or s.user_id != u.id: raise HTTPException(404, "Listing not found")
    bl = blocked_ids(db, u.id); out = []
    for o in db.scalars(select(SkillListing).where(SkillListing.open == True, SkillListing.user_id != u.id).limit(1000)):  # noqa: E712
        if o.user_id in bl: continue
        gives, wants = _like(o.teach, s.learn), _like(o.learn, s.teach)
        if gives or wants: out.append({**skill_json(db, o, u), "score": int(gives) + int(wants), "perfect": gives and wants})
    out.sort(key=lambda x: (-x["score"], -x["at"]))
    return out[:30]

class SwapIn(BaseModel): message: str = Field(default="", max_length=200)
@router.post("/addons/b3/skills/{sid}/request")
def swap_request(sid: str, b: SwapIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "skillSwap", "Skill Swap Board"); not_restricted(u)
    s = db.get(SkillListing, sid)
    if not s or not s.open or blocked_between(db, u.id, s.user_id): raise HTTPException(404, "Listing not found")
    if s.user_id == u.id: raise HTTPException(400, "That's your own listing")
    if db.scalar(select(SwapRequest).where(SwapRequest.listing_id == sid, SwapRequest.from_id == u.id, SwapRequest.status == "pending")):
        raise HTTPException(409, "You already asked — wait for their reply")
    r = SwapRequest(listing_id=sid, from_id=u.id, to_id=s.user_id, message=b.message.strip()); db.add(r); db.commit()
    push(s.user_id, "New skill swap request", f"@{u.handle} wants to swap for {s.teach}", "SkillSwapBoard")
    return swap_json(db, r, u)

@router.get("/addons/b3/swaps")
def swap_list(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "skillSwap", "Skill Swap Board")
    rows = db.scalars(select(SwapRequest).where(or_(SwapRequest.from_id == u.id, SwapRequest.to_id == u.id)).order_by(SwapRequest.at.desc()).limit(100)).all()
    return [swap_json(db, r, u) for r in rows]

class SwapAct(BaseModel): action: str = Field(pattern=r"^(accept|decline)$")
@router.post("/addons/b3/swaps/{rid}")
def swap_answer(rid: str, b: SwapAct, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "skillSwap", "Skill Swap Board")
    r = db.get(SwapRequest, rid)
    if not r or u.id not in (r.from_id, r.to_id): raise HTTPException(404, "Request not found")
    if r.to_id != u.id: raise HTTPException(403, "Only the listing owner can answer")
    if r.status != "pending": raise HTTPException(409, "Already answered")
    r.status = "accepted" if b.action == "accept" else "declined"; db.commit()
    push(r.from_id, f"Skill swap {r.status}", f"@{u.handle} {r.status} your swap request", "SkillSwapBoard")
    return swap_json(db, r, u)

# =====================================================================
# Ask Box
# =====================================================================
def q_json(db, q: AskQuestion, me: M.User, staff=False) -> dict:
    show = staff or not q.anon or q.asker_id == me.id
    return {"id": q.id, "text": q.text, "anon": q.anon, "at": q.at, "answer": q.answer, "answeredAt": q.answered_at,
            "asker": who(db, q.asker_id) if show else None, "owner": who(db, q.owner_id), "mine": q.owner_id == me.id}

class AskIn(BaseModel): text: str = Field(min_length=3, max_length=300); anon: bool = False
@router.post("/addons/b3/ask/{ref}")
def ask_send(ref: str, b: AskIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "askBox", "Ask Box"); not_restricted(u)
    t = find_user(db, ref)
    if t.id == u.id: raise HTTPException(400, "You can't ask yourself")
    if blocked_between(db, u.id, t.id): raise HTTPException(404, "User not found")
    n = db.scalar(select(func.count()).select_from(AskQuestion).where(AskQuestion.asker_id == u.id, AskQuestion.at > now_ms() - DAY)) or 0
    if n >= on(db, u, "addons.glow.askBoxPerDay"): raise HTTPException(429, "You've asked enough questions today — try tomorrow")
    q = AskQuestion(owner_id=t.id, asker_id=u.id, anon=b.anon, text=b.text.strip()); db.add(q); db.commit()
    push(t.id, "New question in your Ask Box", q.text[:80], "AskBox")
    return q_json(db, q, u)

@router.get("/addons/b3/ask")
def ask_inbox(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "askBox", "Ask Box")
    rows = db.scalars(select(AskQuestion).where(AskQuestion.owner_id == u.id).order_by(AskQuestion.at.desc()).limit(200)).all()
    sent = db.scalars(select(AskQuestion).where(AskQuestion.asker_id == u.id).order_by(AskQuestion.at.desc()).limit(50)).all()
    return {"pending": [q_json(db, q, u) for q in rows if q.answer is None], "answered": [q_json(db, q, u) for q in rows if q.answer is not None],
            "sent": [q_json(db, q, u) for q in sent]}

@router.get("/addons/b3/ask/box/{ref}")
def ask_box(ref: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "askBox", "Ask Box")
    t = find_user(db, ref)
    if blocked_between(db, u.id, t.id): raise HTTPException(404, "User not found")
    rows = db.scalars(select(AskQuestion).where(AskQuestion.owner_id == t.id, AskQuestion.answer.isnot(None)).order_by(AskQuestion.answered_at.desc()).limit(100)).all()
    return {"owner": user_json(t), "answered": [q_json(db, q, u) for q in rows]}

class AnswerIn(BaseModel): text: str = Field(min_length=1, max_length=1000)
@router.post("/addons/b3/ask/q/{qid}/answer")
def ask_answer(qid: str, b: AnswerIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "askBox", "Ask Box")
    q = db.get(AskQuestion, qid)
    if not q or q.owner_id != u.id: raise HTTPException(404, "Question not found")
    first = q.answer is None
    q.answer = b.text.strip(); q.answered_at = now_ms(); db.commit()
    if first: push(q.asker_id, "Your question was answered", q.answer[:80], "AskBox", {"user": u.id})
    return q_json(db, q, u)

@router.delete("/addons/b3/ask/q/{qid}")
def ask_delete(qid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "askBox", "Ask Box")
    q = db.get(AskQuestion, qid)
    if not q or q.owner_id != u.id: raise HTTPException(404, "Question not found")
    db.delete(q); db.commit(); return {"ok": True}

@router.get("/admin/addons/b3/ask")
def admin_ask(user: str | None = None, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    st = select(AskQuestion)
    if user: st = st.where(or_(AskQuestion.owner_id == find_user(db, user).id, AskQuestion.asker_id == find_user(db, user).id))
    return [q_json(db, q, a, staff=True) for q in db.scalars(st.order_by(AskQuestion.at.desc()).limit(200))]

@router.delete("/admin/addons/b3/ask/{qid}")
def admin_ask_remove(qid: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    if q := db.get(AskQuestion, qid): db.delete(q)
    audit(db, a.handle, "addons.ask_remove", qid); db.commit(); return {"ok": True}

# =====================================================================
# Memory Lane
# =====================================================================
def post_json(p: M.Post) -> dict:
    return {"id": p.id, "text": p.text, "at": p.at, "mood": p.mood, "hue": p.hue, "mediaUrl": p.media_url, "place": p.place,
            "year": datetime.fromtimestamp(p.at / 1000, timezone.utc).year}

@router.get("/addons/b3/memories")
def memory_lane(day: str | None = Query(None, pattern=r"^\d{2}-\d{2}$"), tz: int = Query(0, ge=-840, le=840),
                u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    """`tz` = minutes east of UTC so "this day" matches the viewer's calendar."""
    need(db, u, "memoryLane", "Memory Lane")
    local = datetime.fromtimestamp((now_ms() + tz * 60_000) / 1000, timezone.utc)
    d = day or local.strftime("%m-%d")
    ts = func.to_timestamp((M.Post.at + tz * 60_000) / 1000.0)
    rows = db.scalars(select(M.Post).where(M.Post.author_id == u.id, M.Post.hidden == False,  # noqa: E712
                                           func.to_char(func.timezone("UTC", ts), "MM-DD") == d,
                                           func.extract("year", func.timezone("UTC", ts)) < local.year).order_by(M.Post.at.desc()).limit(50)).all()
    pins = db.scalars(select(MemoryPin).where(MemoryPin.user_id == u.id).order_by(MemoryPin.at.desc()).limit(100)).all()
    pinned = {m.post_id: m for m in pins}
    out_pins = []
    for m in pins:
        p = db.get(M.Post, m.post_id)
        if p and not p.hidden: out_pins.append({"id": m.id, "note": m.note, "at": m.at, "post": post_json(p)})
    return {"day": d, "onThisDay": [{**post_json(p), "pinId": pinned[p.id].id if p.id in pinned else None} for p in rows], "pinned": out_pins}

class PinIn(BaseModel): postId: str = Field(min_length=1, max_length=40); note: str = Field(default="", max_length=200)
@router.post("/addons/b3/memories")
def memory_pin(b: PinIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "memoryLane", "Memory Lane")
    p = db.get(M.Post, b.postId)
    if not p or p.author_id != u.id: raise HTTPException(404, "Post not found")
    m = db.scalar(select(MemoryPin).where(MemoryPin.user_id == u.id, MemoryPin.post_id == p.id))
    if m: m.note = b.note.strip()
    else: m = MemoryPin(user_id=u.id, post_id=p.id, note=b.note.strip()); db.add(m)
    db.commit(); return {"id": m.id, "note": m.note, "at": m.at, "post": post_json(p)}

@router.delete("/addons/b3/memories/{mid}")
def memory_unpin(mid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "memoryLane", "Memory Lane")
    m = db.get(MemoryPin, mid)
    if not m or m.user_id != u.id: raise HTTPException(404, "Memory not found")
    db.delete(m); db.commit(); return {"ok": True}

# =====================================================================
# Goal Ladder
# =====================================================================
def goal_json(db, g: Goal, me: M.User) -> dict:
    steps = g.steps or []; done = sum(1 for s in steps if s.get("done"))
    return {"id": g.id, "title": g.title, "why": g.why, "steps": steps, "done": done, "total": len(steps), "complete": g.done_at is not None,
            "doneAt": g.done_at, "at": g.at, "cheers": len(g.cheers or []), "cheered": me.id in (g.cheers or []),
            "user": who(db, g.user_id), "mine": g.user_id == me.id}

class GoalIn(BaseModel):
    title: str = Field(min_length=2, max_length=100); why: str = Field(default="", max_length=200)
    steps: list[str] = Field(min_length=1, max_length=10)

@router.post("/addons/b3/goals")
def goal_create(b: GoalIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "goalLadder", "Goal Ladder"); not_restricted(u)
    steps = [s.strip()[:80] for s in b.steps if s.strip()]
    if not steps: raise HTTPException(400, "Add at least one milestone")
    n = db.scalar(select(func.count()).select_from(Goal).where(Goal.user_id == u.id, Goal.done_at.is_(None))) or 0
    if n >= on(db, u, "addons.glow.goalLadderActive"): raise HTTPException(400, "Finish or remove an open goal first")
    g = Goal(user_id=u.id, title=b.title.strip(), why=b.why.strip(), steps=[{"id": uuid.uuid4().hex[:8], "text": s, "done": False, "at": None} for s in steps], cheers=[])
    db.add(g); db.commit(); return goal_json(db, g, u)

@router.get("/addons/b3/goals")
def goal_list(user: str | None = None, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "goalLadder", "Goal Ladder")
    if user:
        t = find_user(db, user)
        if blocked_between(db, u.id, t.id): raise HTTPException(404, "User not found")
        rows = db.scalars(select(Goal).where(Goal.user_id == t.id).order_by(Goal.at.desc()).limit(50)).all()
        return {"goals": [goal_json(db, g, u) for g in rows]}
    mine = db.scalars(select(Goal).where(Goal.user_id == u.id).order_by(Goal.at.desc()).limit(50)).all()
    fr = list(db.scalars(select(M.Friend.friend_id).where(M.Friend.user_id == u.id)))
    friends = db.scalars(select(Goal).where(Goal.user_id.in_(fr)).order_by(Goal.at.desc()).limit(50)).all() if fr else []
    return {"goals": [goal_json(db, g, u) for g in mine], "friends": [goal_json(db, g, u) for g in friends]}

class TickIn(BaseModel): step: str = Field(min_length=1, max_length=20)
@router.post("/addons/b3/goals/{gid}/tick")
def goal_tick(gid: str, b: TickIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "goalLadder", "Goal Ladder")
    g = db.get(Goal, gid)
    if not g: raise HTTPException(404, "Goal not found")
    if g.user_id != u.id: raise HTTPException(403, "Only the goal owner can tick milestones")
    steps = [dict(s) for s in g.steps or []]; s = next((x for x in steps if x["id"] == b.step), None)
    if not s: raise HTTPException(404, "Milestone not found")
    s["done"] = not s["done"]; s["at"] = now_ms() if s["done"] else None
    g.steps = steps; celebrate = False
    if all(x["done"] for x in steps):
        if g.done_at is None:
            g.done_at = now_ms(); celebrate = True
            for c in g.cheers or []: push(c, "A goal you cheered is complete!", f"@{u.handle} finished “{g.title}”", "GoalLadder")
    else: g.done_at = None
    db.commit(); return {**goal_json(db, g, u), "celebrate": celebrate}

@router.post("/addons/b3/goals/{gid}/cheer")
def goal_cheer(gid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "goalLadder", "Goal Ladder")
    g = db.get(Goal, gid)
    if not g: raise HTTPException(404, "Goal not found")
    if g.user_id == u.id: raise HTTPException(400, "Cheer someone else's goal")
    if not are_friends(db, u.id, g.user_id): raise HTTPException(403, "Only friends can cheer this goal")
    ch = list(g.cheers or [])
    if u.id in ch: ch.remove(u.id)
    else: ch.append(u.id); push(g.user_id, "Someone's cheering you on", f"@{u.handle} cheered “{g.title}”", "GoalLadder")
    g.cheers = ch; db.commit(); return goal_json(db, g, u)

@router.delete("/addons/b3/goals/{gid}")
def goal_delete(gid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "goalLadder", "Goal Ladder")
    g = db.get(Goal, gid)
    if not g or g.user_id != u.id: raise HTTPException(404, "Goal not found")
    db.delete(g); db.commit(); return {"ok": True}

# =====================================================================
# Wish Shelf
# =====================================================================
def wish_json(w: Wish, claim: WishClaim | None = None, me: M.User | None = None, owner_view=True) -> dict:
    d = {"id": w.id, "title": w.title, "link": w.link, "note": w.note, "at": w.at}
    if not owner_view: d |= {"claimed": claim is not None, "claimedByMe": bool(claim and me and claim.user_id == me.id)}
    return d

class WishIn(BaseModel):
    title: str = Field(min_length=2, max_length=100); note: str = Field(default="", max_length=200)
    link: str | None = Field(default=None, max_length=300, pattern=r"^https?://\S+$")

@router.get("/addons/b3/wishes")
def wish_mine(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "wishShelf", "Wish Shelf")
    rows = db.scalars(select(Wish).where(Wish.owner_id == u.id).order_by(Wish.at.desc())).all()
    fr = list(db.scalars(select(M.Friend.friend_id).where(M.Friend.user_id == u.id)))
    shelves = db.execute(select(Wish.owner_id, func.count()).where(Wish.owner_id.in_(fr)).group_by(Wish.owner_id)).all() if fr else []
    return {"items": [wish_json(w) for w in rows], "friends": [{"user": who(db, o), "count": n} for o, n in shelves]}

@router.post("/addons/b3/wishes")
def wish_add(b: WishIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "wishShelf", "Wish Shelf")
    if (db.scalar(select(func.count()).select_from(Wish).where(Wish.owner_id == u.id)) or 0) >= 100: raise HTTPException(400, "Your shelf is full (100 items)")
    w = Wish(owner_id=u.id, title=b.title.strip(), link=b.link, note=b.note.strip()); db.add(w); db.commit(); return wish_json(w)

@router.delete("/addons/b3/wishes/{wid}")
def wish_remove(wid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "wishShelf", "Wish Shelf")
    w = db.get(Wish, wid)
    if not w or w.owner_id != u.id: raise HTTPException(404, "Item not found")
    db.delete(w); db.commit(); return {"ok": True}

@router.get("/addons/b3/wishes/of/{ref}")
def wish_friend(ref: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "wishShelf", "Wish Shelf")
    t = find_user(db, ref)
    if t.id == u.id: return {"owner": user_json(t), "items": [wish_json(w) for w in db.scalars(select(Wish).where(Wish.owner_id == u.id).order_by(Wish.at.desc()))]}
    if not are_friends(db, u.id, t.id): raise HTTPException(403, "Only friends can see this Wish Shelf")
    rows = db.scalars(select(Wish).where(Wish.owner_id == t.id).order_by(Wish.at.desc())).all()
    claims = {c.wish_id: c for c in db.scalars(select(WishClaim).where(WishClaim.wish_id.in_([w.id for w in rows])))} if rows else {}
    return {"owner": user_json(t), "items": [wish_json(w, claims.get(w.id), u, owner_view=False) for w in rows]}

def _friend_wish(db, wid: str, u: M.User) -> Wish:
    w = db.get(Wish, wid)
    if not w: raise HTTPException(404, "Item not found")
    if w.owner_id == u.id: raise HTTPException(400, "You can't claim your own wish")
    if not are_friends(db, u.id, w.owner_id): raise HTTPException(403, "Only friends can claim")
    return w

@router.post("/addons/b3/wishes/{wid}/claim")
def wish_claim(wid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "wishShelf", "Wish Shelf")
    w = _friend_wish(db, wid, u); c = db.get(WishClaim, wid)
    if c and c.user_id != u.id: raise HTTPException(409, "Someone already claimed this one")
    if not c: c = WishClaim(wish_id=wid, user_id=u.id); db.add(c); db.commit()
    return wish_json(w, c, u, owner_view=False)

@router.delete("/addons/b3/wishes/{wid}/claim")
def wish_unclaim(wid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "wishShelf", "Wish Shelf")
    w = _friend_wish(db, wid, u); c = db.get(WishClaim, wid)
    if c and c.user_id == u.id: db.delete(c); db.commit(); c = None
    return wish_json(w, c, u, owner_view=False)

# =====================================================================
# Admin summary
# =====================================================================
ITEMS = [("Local Pulse", "localPulse", PulseNote), ("Skill Swap Board", "skillSwap", SkillListing), ("Ask Box", "askBox", AskQuestion),
         ("Memory Lane", "memoryLane", MemoryPin), ("Goal Ladder", "goalLadder", Goal), ("Wish Shelf", "wishShelf", Wish)]

@router.get("/admin/addons/b3")
def admin_summary(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    since = now_ms() - 7 * DAY
    return {"title": "Glow Extras · Batch 3", "module": "glow", "items": [
        {"name": n, "flag": f"addons.glow.{k}", "on": bool(on(db, None, f"addons.glow.{k}")),
         "week": db.scalar(select(func.count()).select_from(T).where(T.at >= since)) or 0} for n, k, T in ITEMS]}
