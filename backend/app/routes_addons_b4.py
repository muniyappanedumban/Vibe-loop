"""VibeLoop add-ons, batch 4 (Glow) — each switchable in User App Settings (addons.glow.*).

  Photo Prompt   staff set a weekly photo theme; people enter one uploaded photo; gallery; a few votes per person per week.
  Mentor Match   list yourself as mentor or mentee by topic; request a mentor; mentor accepts up to a capacity; shared session notes.
  Hidden Gems    recommend a place (name, area, category, why); upvote; filter by area/category; top this month.
  Recipe Box     structured recipes (ingredients, steps, time, servings); save others' recipes; "cooked it" counter.
  Book Nook      reading log (want / reading / done, rating, short review); your Squad's recent reading.
  Meetup Board   small local meetups with capacity; RSVP or join the waitlist; host can cancel and everyone hears.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, String, Integer, Text, JSON, ForeignKey, BigInteger, UniqueConstraint
from sqlalchemy.orm import Session, Mapped, mapped_column
from .db import get_db, Base
from . import models as M
from .security import current_user, require, audit
from .v2common import user_json, blocked_between

router = APIRouter()
STAFF = require("owner", "admin", "moderator", "support")
DAY = 86_400_000
UFK = lambda: ForeignKey("users.id", ondelete="CASCADE")  # noqa: E731

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

def not_restricted(u: M.User):
    from .routes_trust import assert_not_restricted
    assert_not_restricted(u)

def friend_ids(db: Session, uid: str) -> list[str]:
    return list(db.scalars(select(M.Friend.friend_id).where(M.Friend.user_id == uid)))

# =====================================================================
# Models
# =====================================================================
class B4PhotoTheme(Base):
    __tablename__ = "b4_photo_themes"
    week: Mapped[str] = mapped_column(String(8), primary_key=True)  # ISO week, e.g. 2026-W47
    title: Mapped[str] = mapped_column(String(80)); hint: Mapped[str] = mapped_column(String(200), default="")
    set_by: Mapped[str] = mapped_column(String(60), default=""); at: Mapped[int] = mapped_column(BigInteger, default=M.now_ms)

class B4PhotoEntry(Base):
    __tablename__ = "b4_photo_entries"
    __table_args__ = (UniqueConstraint("week", "user_id", name="uq_b4_photo_entry_week_user"),)
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: M.nid("ppe"))
    week: Mapped[str] = mapped_column(String(8), index=True); user_id: Mapped[str] = mapped_column(UFK(), index=True)
    media_url: Mapped[str] = mapped_column(String(200)); caption: Mapped[str] = mapped_column(String(140), default="")
    at: Mapped[int] = mapped_column(BigInteger, default=M.now_ms, index=True)

class B4PhotoVote(Base):
    __tablename__ = "b4_photo_votes"
    __table_args__ = (UniqueConstraint("entry_id", "user_id", name="uq_b4_photo_vote"),)
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: M.nid("ppv"))
    entry_id: Mapped[str] = mapped_column(ForeignKey("b4_photo_entries.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(UFK(), index=True); week: Mapped[str] = mapped_column(String(8), index=True)
    at: Mapped[int] = mapped_column(BigInteger, default=M.now_ms)

class B4MentorProfile(Base):
    __tablename__ = "b4_mentor_profiles"
    __table_args__ = (UniqueConstraint("user_id", "role", "topic", name="uq_b4_mentor_profile"),)
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: M.nid("mp"))
    user_id: Mapped[str] = mapped_column(UFK(), index=True); role: Mapped[str] = mapped_column(String(10))
    topic: Mapped[str] = mapped_column(String(40), index=True); bio: Mapped[str] = mapped_column(String(280), default="")
    at: Mapped[int] = mapped_column(BigInteger, default=M.now_ms, index=True)

class B4Mentorship(Base):
    __tablename__ = "b4_mentorships"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: M.nid("ms"))
    mentor_id: Mapped[str] = mapped_column(UFK(), index=True); mentee_id: Mapped[str] = mapped_column(UFK(), index=True)
    topic: Mapped[str] = mapped_column(String(40)); note: Mapped[str] = mapped_column(String(280), default="")
    status: Mapped[str] = mapped_column(String(10), default="pending", index=True)  # pending|active|declined|ended
    at: Mapped[int] = mapped_column(BigInteger, default=M.now_ms, index=True); decided_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

class B4MentorNote(Base):
    __tablename__ = "b4_mentor_notes"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: M.nid("mn"))
    mentorship_id: Mapped[str] = mapped_column(ForeignKey("b4_mentorships.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(UFK(), index=True); text: Mapped[str] = mapped_column(Text)
    at: Mapped[int] = mapped_column(BigInteger, default=M.now_ms)

class B4Gem(Base):
    __tablename__ = "b4_gems"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: M.nid("gem"))
    user_id: Mapped[str] = mapped_column(UFK(), index=True); name: Mapped[str] = mapped_column(String(80))
    area: Mapped[str] = mapped_column(String(60), index=True); category: Mapped[str] = mapped_column(String(20), index=True)
    why: Mapped[str] = mapped_column(String(400)); upvotes: Mapped[list] = mapped_column(JSON, default=list)
    at: Mapped[int] = mapped_column(BigInteger, default=M.now_ms, index=True)

class B4Recipe(Base):
    __tablename__ = "b4_recipes"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: M.nid("rcp"))
    user_id: Mapped[str] = mapped_column(UFK(), index=True); title: Mapped[str] = mapped_column(String(80))
    ingredients: Mapped[list] = mapped_column(JSON, default=list); steps: Mapped[list] = mapped_column(JSON, default=list)
    minutes: Mapped[int] = mapped_column(Integer); servings: Mapped[int] = mapped_column(Integer)
    at: Mapped[int] = mapped_column(BigInteger, default=M.now_ms, index=True)

class B4RecipeSave(Base):
    __tablename__ = "b4_recipe_saves"
    recipe_id: Mapped[str] = mapped_column(ForeignKey("b4_recipes.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[str] = mapped_column(UFK(), primary_key=True, index=True); at: Mapped[int] = mapped_column(BigInteger, default=M.now_ms)

class B4RecipeCook(Base):
    __tablename__ = "b4_recipe_cooks"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: M.nid("rck"))
    recipe_id: Mapped[str] = mapped_column(ForeignKey("b4_recipes.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(UFK(), index=True); at: Mapped[int] = mapped_column(BigInteger, default=M.now_ms)

class B4Book(Base):
    __tablename__ = "b4_books"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: M.nid("bk"))
    user_id: Mapped[str] = mapped_column(UFK(), index=True); title: Mapped[str] = mapped_column(String(120))
    author: Mapped[str] = mapped_column(String(80), default=""); status: Mapped[str] = mapped_column(String(10), default="want")
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True); review: Mapped[str] = mapped_column(String(500), default="")
    at: Mapped[int] = mapped_column(BigInteger, default=M.now_ms, index=True); updated_at: Mapped[int] = mapped_column(BigInteger, default=M.now_ms, index=True)

class B4Meetup(Base):
    __tablename__ = "b4_meetups"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: M.nid("mtp"))
    host_id: Mapped[str] = mapped_column(UFK(), index=True); title: Mapped[str] = mapped_column(String(80))
    place: Mapped[str] = mapped_column(String(120)); starts_at: Mapped[int] = mapped_column(BigInteger, index=True)
    capacity: Mapped[int] = mapped_column(Integer); note: Mapped[str] = mapped_column(String(400), default="")
    status: Mapped[str] = mapped_column(String(10), default="open", index=True)  # open|cancelled
    at: Mapped[int] = mapped_column(BigInteger, default=M.now_ms, index=True)

class B4Rsvp(Base):
    __tablename__ = "b4_rsvps"
    __table_args__ = (UniqueConstraint("meetup_id", "user_id", name="uq_b4_rsvp"),)
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: M.nid("rsv"))
    meetup_id: Mapped[str] = mapped_column(ForeignKey("b4_meetups.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(UFK(), index=True); status: Mapped[str] = mapped_column(String(10))  # going|waitlist
    at: Mapped[int] = mapped_column(BigInteger, default=M.now_ms)

# =====================================================================
# Glow · Photo Prompt Weekly
# =====================================================================
def week_of(t_ms: int | None = None) -> str:
    d = datetime.fromtimestamp((t_ms or M.now_ms()) / 1000, timezone.utc).isocalendar()
    return f"{d[0]}-W{d[1]:02d}"

def entry_json(db: Session, e: B4PhotoEntry, me: M.User, votes: dict, mine: set) -> dict:
    return {"id": e.id, "week": e.week, "mediaUrl": e.media_url, "caption": e.caption, "at": e.at, "user": who(db, e.user_id),
            "mine": e.user_id == me.id, "votes": votes.get(e.id, 0), "voted": e.id in mine}

@router.get("/addons/b4/photo-prompt")
def photo_get(week: str | None = Query(None, pattern=r"^\d{4}-W\d{2}$"), u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.photoPrompt", "Photo Prompt")
    wk = week or week_of(); cur = week_of()
    if wk > cur: raise HTTPException(400, "That week hasn't started yet")
    th = db.get(B4PhotoTheme, wk)
    entries = db.scalars(select(B4PhotoEntry).where(B4PhotoEntry.week == wk)).all()
    votes = dict(db.execute(select(B4PhotoVote.entry_id, func.count()).where(B4PhotoVote.week == wk).group_by(B4PhotoVote.entry_id)).all())
    mine = set(db.scalars(select(B4PhotoVote.entry_id).where(B4PhotoVote.week == wk, B4PhotoVote.user_id == u.id)))
    blocked = set(db.scalars(select(M.Edge.target).where(M.Edge.user_id == u.id, M.Edge.kind == "block")))
    rows = sorted([e for e in entries if e.user_id not in blocked], key=lambda e: (-votes.get(e.id, 0), e.at))
    cap = on(db, u, "addons.glow.photoVotesPerWeek")
    return {"week": wk, "current": wk == cur, "theme": {"title": th.title, "hint": th.hint} if th else None,
            "votesLeft": max(0, cap - len(mine)) if wk == cur else 0, "votesPerWeek": cap,
            "myEntry": next((entry_json(db, e, u, votes, mine) for e in entries if e.user_id == u.id), None),
            "entries": [entry_json(db, e, u, votes, mine) for e in rows]}

class PhotoIn(BaseModel): mediaUrl: str = Field(min_length=8, max_length=200, pattern=r"^/media/"); caption: str = Field(default="", max_length=140)
@router.post("/addons/b4/photo-prompt/entries")
def photo_enter(b: PhotoIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.photoPrompt", "Photo Prompt"); not_restricted(u)
    wk = week_of()
    if not db.get(B4PhotoTheme, wk): raise HTTPException(409, "No theme has been set for this week yet")
    mf = db.get(M.MediaFile, b.mediaUrl.split("/")[-1].split(".")[0].split("?")[0])
    if not mf or mf.owner_id != u.id: raise HTTPException(400, "Upload the photo first")
    if mf.kind != "image": raise HTTPException(400, "Entries must be photos")
    from .routes_media import mark_public
    mark_public(db, b.mediaUrl, u)
    e = db.scalar(select(B4PhotoEntry).where(B4PhotoEntry.week == wk, B4PhotoEntry.user_id == u.id))
    if e:  # one entry a week — entering again replaces it (and its votes)
        for v in db.scalars(select(B4PhotoVote).where(B4PhotoVote.entry_id == e.id)): db.delete(v)
        e.media_url = b.mediaUrl; e.caption = b.caption.strip(); e.at = M.now_ms()
    else: e = B4PhotoEntry(week=wk, user_id=u.id, media_url=b.mediaUrl, caption=b.caption.strip()); db.add(e)
    db.commit(); return entry_json(db, e, u, {}, set())

@router.delete("/addons/b4/photo-prompt/entries/{eid}")
def photo_withdraw(eid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.photoPrompt", "Photo Prompt")
    e = db.get(B4PhotoEntry, eid)
    if not e or e.user_id != u.id: raise HTTPException(404, "Entry not found")
    db.delete(e); db.commit(); return {"ok": True}

@router.post("/addons/b4/photo-prompt/entries/{eid}/vote")
def photo_vote(eid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.photoPrompt", "Photo Prompt")
    e = db.get(B4PhotoEntry, eid)
    if not e: raise HTTPException(404, "Entry not found")
    if e.week != week_of(): raise HTTPException(409, "Voting for that week has closed")
    if e.user_id == u.id: raise HTTPException(400, "You can't vote for your own photo")
    if blocked_between(db, u.id, e.user_id): raise HTTPException(403, "You can't vote on this entry")
    v = db.scalar(select(B4PhotoVote).where(B4PhotoVote.entry_id == eid, B4PhotoVote.user_id == u.id))
    if v: db.delete(v); voted = False
    else:
        used = db.scalar(select(func.count()).select_from(B4PhotoVote).where(B4PhotoVote.week == e.week, B4PhotoVote.user_id == u.id)) or 0
        if used >= (cap := on(db, u, "addons.glow.photoVotesPerWeek")): raise HTTPException(429, f"You've used your {cap} votes this week — take one back to move it")
        db.add(B4PhotoVote(entry_id=eid, user_id=u.id, week=e.week)); voted = True
    db.commit()
    n = db.scalar(select(func.count()).select_from(B4PhotoVote).where(B4PhotoVote.entry_id == eid)) or 0
    if voted and n in (1, 10, 25): push(e.user_id, "Your Photo Prompt entry got votes", f"{n} vote{'s' if n > 1 else ''} this week", "PhotoPrompt")
    return {"id": eid, "voted": voted, "votes": n}

class ThemeIn(BaseModel): week: str = Field(pattern=r"^\d{4}-W\d{2}$"); title: str = Field(min_length=3, max_length=80); hint: str = Field(default="", max_length=200)
@router.get("/admin/addons/b4/photo-prompt")
def admin_photo_list(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    now = M.now_ms(); weeks = list(dict.fromkeys(week_of(now + i * 7 * DAY) for i in range(-4, 9)))
    counts = dict(db.execute(select(B4PhotoEntry.week, func.count()).where(B4PhotoEntry.week.in_(weeks)).group_by(B4PhotoEntry.week)).all())
    out = []
    for w in weeks:
        th = db.get(B4PhotoTheme, w)
        out.append({"week": w, "title": th.title if th else None, "hint": th.hint if th else "", "entries": counts.get(w, 0), "current": w == week_of(now)})
    return out
@router.put("/admin/addons/b4/photo-prompt")
def admin_photo_set(b: ThemeIn, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    th = db.get(B4PhotoTheme, b.week)
    if th: th.title = b.title.strip(); th.hint = b.hint.strip(); th.set_by = a.handle
    else: db.add(B4PhotoTheme(week=b.week, title=b.title.strip(), hint=b.hint.strip(), set_by=a.handle))
    audit(db, a.handle, "addons.photo_theme_set", f"{b.week} {b.title[:80]}"); db.commit(); return {"ok": True}
@router.delete("/admin/addons/b4/photo-prompt/entries/{eid}")
def admin_photo_remove(eid: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    if e := db.get(B4PhotoEntry, eid): db.delete(e)
    audit(db, a.handle, "addons.photo_entry_remove", eid); db.commit(); return {"ok": True}

# =====================================================================
# Glow · Mentor Match
# =====================================================================
def topic_norm(t: str) -> str: return " ".join(t.strip().lower().split())

def ms_json(db: Session, m: B4Mentorship, me: M.User) -> dict:
    return {"id": m.id, "topic": m.topic, "note": m.note, "status": m.status, "at": m.at, "mentor": who(db, m.mentor_id), "mentee": who(db, m.mentee_id),
            "iAmMentor": m.mentor_id == me.id}

def active_count(db: Session, uid: str) -> int:
    return db.scalar(select(func.count()).select_from(B4Mentorship).where(B4Mentorship.mentor_id == uid, B4Mentorship.status == "active")) or 0

@router.get("/addons/b4/mentors")
def mentor_list(topic: str | None = Query(None, max_length=40), u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.mentorMatch", "Mentor Match")
    cap = on(db, u, "addons.glow.mentorCapacity")
    q = select(B4MentorProfile).where(B4MentorProfile.role == "mentor", B4MentorProfile.user_id != u.id)
    if topic and topic.strip(): q = q.where(B4MentorProfile.topic == topic_norm(topic))
    blocked = set(db.scalars(select(M.Edge.target).where(M.Edge.user_id == u.id, M.Edge.kind == "block")))
    mentors = [p for p in db.scalars(q.order_by(B4MentorProfile.at.desc()).limit(100)) if p.user_id not in blocked]
    mine = db.scalars(select(B4MentorProfile).where(B4MentorProfile.user_id == u.id).order_by(B4MentorProfile.at)).all()
    ships = db.scalars(select(B4Mentorship).where((B4Mentorship.mentor_id == u.id) | (B4Mentorship.mentee_id == u.id), B4Mentorship.status.in_(["pending", "active"]))
                       .order_by(B4Mentorship.at.desc())).all()
    topics = [t for t, in db.execute(select(B4MentorProfile.topic).where(B4MentorProfile.role == "mentor").group_by(B4MentorProfile.topic).order_by(func.count().desc()).limit(20))]
    return {"capacity": cap, "topics": topics,
            "mentors": [{"id": p.id, "topic": p.topic, "bio": p.bio, "user": who(db, p.user_id), "openSlots": max(0, cap - active_count(db, p.user_id))} for p in mentors],
            "profiles": [{"id": p.id, "role": p.role, "topic": p.topic, "bio": p.bio} for p in mine],
            "mentorships": [ms_json(db, m, u) for m in ships]}

class MProfileIn(BaseModel): role: str = Field(pattern=r"^(mentor|mentee)$"); topic: str = Field(min_length=2, max_length=40); bio: str = Field(default="", max_length=280)
@router.post("/addons/b4/mentors/profile")
def mentor_profile(b: MProfileIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.mentorMatch", "Mentor Match"); not_restricted(u)
    t = topic_norm(b.topic)
    p = db.scalar(select(B4MentorProfile).where(B4MentorProfile.user_id == u.id, B4MentorProfile.role == b.role, B4MentorProfile.topic == t))
    if p: p.bio = b.bio.strip()
    else:
        if (db.scalar(select(func.count()).select_from(B4MentorProfile).where(B4MentorProfile.user_id == u.id)) or 0) >= 10: raise HTTPException(400, "Up to 10 topics")
        p = B4MentorProfile(user_id=u.id, role=b.role, topic=t, bio=b.bio.strip()); db.add(p)
    db.commit(); return {"id": p.id, "role": p.role, "topic": p.topic, "bio": p.bio}

@router.delete("/addons/b4/mentors/profile/{pid}")
def mentor_profile_delete(pid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.mentorMatch", "Mentor Match")
    p = db.get(B4MentorProfile, pid)
    if not p or p.user_id != u.id: raise HTTPException(404, "Profile not found")
    db.delete(p); db.commit(); return {"ok": True}

class MReqIn(BaseModel): profileId: str = Field(min_length=1, max_length=40); note: str = Field(default="", max_length=280)
@router.post("/addons/b4/mentors/request")
def mentor_request(b: MReqIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.mentorMatch", "Mentor Match"); not_restricted(u)
    p = db.get(B4MentorProfile, b.profileId)
    if not p or p.role != "mentor": raise HTTPException(404, "Mentor not found")
    if p.user_id == u.id: raise HTTPException(400, "You can't mentor yourself")
    if blocked_between(db, u.id, p.user_id): raise HTTPException(403, "You can't ask this person")
    if db.scalar(select(B4Mentorship).where(B4Mentorship.mentor_id == p.user_id, B4Mentorship.mentee_id == u.id, B4Mentorship.topic == p.topic,
                                            B4Mentorship.status.in_(["pending", "active"]))): raise HTTPException(409, "You already asked this mentor")
    if active_count(db, p.user_id) >= on(db, u, "addons.glow.mentorCapacity"): raise HTTPException(409, "This mentor is full right now")
    m = B4Mentorship(mentor_id=p.user_id, mentee_id=u.id, topic=p.topic, note=b.note.strip()); db.add(m); db.commit()
    push(p.user_id, f"{u.name} asked you to mentor them", f"Topic: {p.topic}", "MentorMatch")
    return ms_json(db, m, u)

class DecideIn(BaseModel): action: str = Field(pattern=r"^(accept|decline|end)$")
@router.post("/addons/b4/mentorships/{mid}")
def mentor_decide(mid: str, b: DecideIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.mentorMatch", "Mentor Match")
    m = db.get(B4Mentorship, mid)
    if not m or u.id not in (m.mentor_id, m.mentee_id): raise HTTPException(404, "Not found")
    if b.action == "end":
        if m.status not in ("pending", "active"): raise HTTPException(409, "Already closed")
        m.status = "ended"
    else:
        if u.id != m.mentor_id: raise HTTPException(403, "Only the mentor can answer a request")
        if m.status != "pending": raise HTTPException(409, "This request was already answered")
        if b.action == "accept" and active_count(db, u.id) >= (cap := on(db, u, "addons.glow.mentorCapacity")):
            raise HTTPException(409, f"You're at your limit of {cap} mentees — end one first")
        m.status = "active" if b.action == "accept" else "declined"
    m.decided_at = M.now_ms(); db.commit()
    other = m.mentee_id if u.id == m.mentor_id else m.mentor_id
    push(other, {"accept": "Mentorship accepted", "decline": "Mentorship request declined", "end": "Mentorship ended"}[b.action], f"{u.name} · {m.topic}", "MentorMatch")
    return ms_json(db, m, u)

def ms_member(db: Session, mid: str, u: M.User) -> B4Mentorship:
    m = db.get(B4Mentorship, mid)
    if not m or u.id not in (m.mentor_id, m.mentee_id): raise HTTPException(404, "Not found")
    return m

@router.get("/addons/b4/mentorships/{mid}/notes")
def mentor_notes(mid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.mentorMatch", "Mentor Match"); m = ms_member(db, mid, u)
    ns = db.scalars(select(B4MentorNote).where(B4MentorNote.mentorship_id == m.id).order_by(B4MentorNote.at.desc()).limit(200)).all()
    return {"mentorship": ms_json(db, m, u), "notes": [{"id": n.id, "text": n.text, "at": n.at, "user": who(db, n.user_id), "mine": n.user_id == u.id} for n in ns]}

class NoteIn(BaseModel): text: str = Field(min_length=1, max_length=2000)
@router.post("/addons/b4/mentorships/{mid}/notes")
def mentor_note_add(mid: str, b: NoteIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.mentorMatch", "Mentor Match"); m = ms_member(db, mid, u)
    if m.status != "active": raise HTTPException(409, "Notes can only be added to an active mentorship")
    n = B4MentorNote(mentorship_id=m.id, user_id=u.id, text=b.text.strip()); db.add(n); db.commit()
    push(m.mentee_id if u.id == m.mentor_id else m.mentor_id, "New session note", f"{u.name}: {n.text[:80]}", "MentorNotes", {"id": m.id})
    return {"id": n.id, "text": n.text, "at": n.at, "user": who(db, u.id), "mine": True}

# =====================================================================
# Glow · Hidden Gems
# =====================================================================
GEM_CATS = {"food": "Food", "cafe": "Café", "outdoors": "Outdoors", "culture": "Culture", "shopping": "Shopping", "nightlife": "Nightlife", "other": "Other"}
def area_norm(a: str) -> str: return " ".join(w.capitalize() for w in a.strip().split())

def gem_json(db: Session, g: B4Gem, me: M.User) -> dict:
    up = g.upvotes or []
    return {"id": g.id, "name": g.name, "area": g.area, "category": g.category, "categoryLabel": GEM_CATS.get(g.category, g.category), "why": g.why,
            "at": g.at, "user": who(db, g.user_id), "mine": g.user_id == me.id, "upvotes": len(up), "upvoted": me.id in up}

@router.get("/addons/b4/gems")
def gem_list(area: str | None = Query(None, max_length=60), category: str | None = Query(None, pattern=r"^(food|cafe|outdoors|culture|shopping|nightlife|other)$"),
             sort: str = Query("top", pattern=r"^(top|new)$"), u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.hiddenGems", "Hidden Gems")
    q = select(B4Gem)
    if area and area.strip(): q = q.where(B4Gem.area == area_norm(area))
    if category: q = q.where(B4Gem.category == category)
    blocked = set(db.scalars(select(M.Edge.target).where(M.Edge.user_id == u.id, M.Edge.kind == "block")))
    rows = [g for g in db.scalars(q.order_by(B4Gem.at.desc()).limit(500)) if g.user_id not in blocked]
    month = M.now_ms() - 30 * DAY
    top = sorted([g for g in rows if g.at > month], key=lambda g: (-len(g.upvotes or []), -g.at))[:5]
    if sort == "top": rows = sorted(rows, key=lambda g: (-len(g.upvotes or []), -g.at))
    areas = [a for a, in db.execute(select(B4Gem.area).group_by(B4Gem.area).order_by(func.count().desc()).limit(30))]
    return {"categories": GEM_CATS, "areas": areas, "topMonth": [gem_json(db, g, u) for g in top], "gems": [gem_json(db, g, u) for g in rows[:100]]}

class GemIn(BaseModel):
    name: str = Field(min_length=2, max_length=80); area: str = Field(min_length=2, max_length=60)
    category: str = Field(pattern=r"^(food|cafe|outdoors|culture|shopping|nightlife|other)$"); why: str = Field(min_length=10, max_length=400)
@router.post("/addons/b4/gems")
def gem_create(b: GemIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.hiddenGems", "Hidden Gems"); not_restricted(u)
    area = area_norm(b.area)
    if db.scalar(select(B4Gem).where(func.lower(B4Gem.name) == b.name.strip().lower(), B4Gem.area == area)): raise HTTPException(409, "That place is already on the list — upvote it instead")
    g = B4Gem(user_id=u.id, name=b.name.strip(), area=area, category=b.category, why=b.why.strip(), upvotes=[]); db.add(g); db.commit()
    return gem_json(db, g, u)

@router.post("/addons/b4/gems/{gid}/upvote")
def gem_upvote(gid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.hiddenGems", "Hidden Gems")
    g = db.get(B4Gem, gid)
    if not g: raise HTTPException(404, "Place not found")
    if g.user_id == u.id: raise HTTPException(400, "You can't upvote your own recommendation")
    up = list(g.upvotes or [])
    if u.id in up: up.remove(u.id)
    else:
        up.append(u.id)
        if len(up) in (1, 10, 50): push(g.user_id, "Your Hidden Gem got upvotes", f"{g.name}: {len(up)} upvote{'s' if len(up) > 1 else ''}", "HiddenGems")
    g.upvotes = up; db.commit(); return gem_json(db, g, u)

@router.delete("/addons/b4/gems/{gid}")
def gem_delete(gid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.hiddenGems", "Hidden Gems")
    g = db.get(B4Gem, gid)
    if not g or g.user_id != u.id: raise HTTPException(404, "Place not found")
    db.delete(g); db.commit(); return {"ok": True}

@router.delete("/admin/addons/b4/gems/{gid}")
def admin_gem_remove(gid: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    if g := db.get(B4Gem, gid): db.delete(g)
    audit(db, a.handle, "addons.gem_remove", gid); db.commit(); return {"ok": True}

# =====================================================================
# Glow · Recipe Box
# =====================================================================
def recipe_json(db: Session, r: B4Recipe, me: M.User, full: bool = False) -> dict:
    cooked = db.scalar(select(func.count()).select_from(B4RecipeCook).where(B4RecipeCook.recipe_id == r.id)) or 0
    saves = db.scalar(select(func.count()).select_from(B4RecipeSave).where(B4RecipeSave.recipe_id == r.id)) or 0
    out = {"id": r.id, "title": r.title, "minutes": r.minutes, "servings": r.servings, "at": r.at, "user": who(db, r.user_id), "mine": r.user_id == me.id,
           "cooked": cooked, "saves": saves, "saved": db.get(B4RecipeSave, (r.id, me.id)) is not None,
           "ingredientCount": len(r.ingredients or []), "stepCount": len(r.steps or [])}
    if full: out |= {"ingredients": r.ingredients or [], "steps": r.steps or []}
    return out

@router.get("/addons/b4/recipes")
def recipe_list(tab: str = Query("all", pattern=r"^(all|mine|saved)$"), q: str | None = Query(None, max_length=60), u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.recipeBox", "Recipe Box")
    s = select(B4Recipe)
    if tab == "mine": s = s.where(B4Recipe.user_id == u.id)
    if tab == "saved": s = s.where(B4Recipe.id.in_(select(B4RecipeSave.recipe_id).where(B4RecipeSave.user_id == u.id)))
    if q and q.strip(): s = s.where(B4Recipe.title.ilike(f"%{q.strip()}%"))
    blocked = set(db.scalars(select(M.Edge.target).where(M.Edge.user_id == u.id, M.Edge.kind == "block")))
    return [recipe_json(db, r, u) for r in db.scalars(s.order_by(B4Recipe.at.desc()).limit(60)) if r.user_id not in blocked]

@router.get("/addons/b4/recipes/{rid}")
def recipe_get(rid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.recipeBox", "Recipe Box")
    r = db.get(B4Recipe, rid)
    if not r or blocked_between(db, u.id, r.user_id): raise HTTPException(404, "Recipe not found")
    return recipe_json(db, r, u, True)

class RecipeIn(BaseModel):
    title: str = Field(min_length=2, max_length=80)
    ingredients: list[str] = Field(min_length=1, max_length=40); steps: list[str] = Field(min_length=1, max_length=30)
    minutes: int = Field(ge=1, le=24 * 60); servings: int = Field(ge=1, le=50)
@router.post("/addons/b4/recipes")
def recipe_create(b: RecipeIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.recipeBox", "Recipe Box"); not_restricted(u)
    ing = [i.strip()[:120] for i in b.ingredients if i.strip()]; st = [s.strip()[:500] for s in b.steps if s.strip()]
    if not ing or not st: raise HTTPException(400, "Add at least one ingredient and one step")
    r = B4Recipe(user_id=u.id, title=b.title.strip(), ingredients=ing, steps=st, minutes=b.minutes, servings=b.servings); db.add(r); db.commit()
    return recipe_json(db, r, u, True)

@router.delete("/addons/b4/recipes/{rid}")
def recipe_delete(rid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.recipeBox", "Recipe Box")
    r = db.get(B4Recipe, rid)
    if not r or r.user_id != u.id: raise HTTPException(404, "Recipe not found")
    db.delete(r); db.commit(); return {"ok": True}

@router.post("/addons/b4/recipes/{rid}/save")
def recipe_save(rid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.recipeBox", "Recipe Box")
    r = db.get(B4Recipe, rid)
    if not r or blocked_between(db, u.id, r.user_id): raise HTTPException(404, "Recipe not found")
    if r.user_id == u.id: raise HTTPException(400, "It's already in your box")
    if s := db.get(B4RecipeSave, (rid, u.id)): db.delete(s)
    else: db.add(B4RecipeSave(recipe_id=rid, user_id=u.id))
    db.commit(); return recipe_json(db, r, u, True)

@router.post("/addons/b4/recipes/{rid}/cooked")
def recipe_cooked(rid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.recipeBox", "Recipe Box")
    r = db.get(B4Recipe, rid)
    if not r or blocked_between(db, u.id, r.user_id): raise HTTPException(404, "Recipe not found")
    if db.scalar(select(B4RecipeCook).where(B4RecipeCook.recipe_id == rid, B4RecipeCook.user_id == u.id, B4RecipeCook.at > M.now_ms() - DAY)):
        raise HTTPException(429, "You already logged this one today")
    db.add(B4RecipeCook(recipe_id=rid, user_id=u.id)); db.commit()
    if r.user_id != u.id: push(r.user_id, f"{u.name} cooked your recipe", r.title, "RecipeBox")
    return recipe_json(db, r, u, True)

# =====================================================================
# Glow · Book Nook
# =====================================================================
def book_json(db: Session, b: B4Book, with_user: bool = False) -> dict:
    out = {"id": b.id, "title": b.title, "author": b.author, "status": b.status, "rating": b.rating, "review": b.review, "at": b.at, "updatedAt": b.updated_at}
    if with_user: out["user"] = who(db, b.user_id)
    return out

@router.get("/addons/b4/books")
def book_list(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.bookNook", "Book Nook")
    rows = db.scalars(select(B4Book).where(B4Book.user_id == u.id).order_by(B4Book.updated_at.desc())).all()
    return {"books": [book_json(db, b) for b in rows], "counts": {s: sum(1 for b in rows if b.status == s) for s in ("want", "reading", "done")}}

@router.get("/addons/b4/books/feed")
def book_feed(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.bookNook", "Book Nook")
    fr = friend_ids(db, u.id)
    if not fr: return []
    rows = db.scalars(select(B4Book).where(B4Book.user_id.in_(fr), B4Book.updated_at > M.now_ms() - 60 * DAY).order_by(B4Book.updated_at.desc()).limit(50)).all()
    return [book_json(db, b, True) for b in rows]

class BookIn(BaseModel):
    title: str = Field(min_length=1, max_length=120); author: str = Field(default="", max_length=80); status: str = Field(default="want", pattern=r"^(want|reading|done)$")
    rating: int | None = Field(default=None, ge=1, le=5); review: str = Field(default="", max_length=500)
class BookPatch(BaseModel):
    status: str | None = Field(default=None, pattern=r"^(want|reading|done)$"); rating: int | None = Field(default=None, ge=1, le=5); review: str | None = Field(default=None, max_length=500)

def check_rating(status: str, rating: int | None):
    if rating is not None and status != "done": raise HTTPException(400, "Rate a book once you've finished it")

@router.post("/addons/b4/books")
def book_add(b: BookIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.bookNook", "Book Nook"); check_rating(b.status, b.rating)
    if (db.scalar(select(func.count()).select_from(B4Book).where(B4Book.user_id == u.id)) or 0) >= 1000: raise HTTPException(400, "Your shelf is full")
    bk = B4Book(user_id=u.id, title=b.title.strip(), author=b.author.strip(), status=b.status, rating=b.rating, review=b.review.strip()); db.add(bk); db.commit()
    return book_json(db, bk)

@router.patch("/addons/b4/books/{bid}")
def book_update(bid: str, b: BookPatch, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.bookNook", "Book Nook")
    bk = db.get(B4Book, bid)
    if not bk or bk.user_id != u.id: raise HTTPException(404, "Book not found")
    if b.status: bk.status = b.status
    if b.rating is not None: check_rating(bk.status, b.rating); bk.rating = b.rating
    if bk.status != "done": bk.rating = None
    if b.review is not None: bk.review = b.review.strip()
    bk.updated_at = M.now_ms(); db.commit(); return book_json(db, bk)

@router.delete("/addons/b4/books/{bid}")
def book_delete(bid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.bookNook", "Book Nook")
    bk = db.get(B4Book, bid)
    if not bk or bk.user_id != u.id: raise HTTPException(404, "Book not found")
    db.delete(bk); db.commit(); return {"ok": True}

# =====================================================================
# Glow · Meetup Board
# =====================================================================
def meetup_json(db: Session, m: B4Meetup, me: M.User, full: bool = False) -> dict:
    rs = db.scalars(select(B4Rsvp).where(B4Rsvp.meetup_id == m.id).order_by(B4Rsvp.at)).all()
    going = [r for r in rs if r.status == "going"]; wait = [r for r in rs if r.status == "waitlist"]
    mine = next((r for r in rs if r.user_id == me.id), None)
    out = {"id": m.id, "title": m.title, "place": m.place, "startsAt": m.starts_at, "capacity": m.capacity, "note": m.note, "status": m.status,
           "host": who(db, m.host_id), "isHost": m.host_id == me.id, "going": len(going), "waitlist": len(wait),
           "my": mine.status if mine else None, "myWaitPos": next((i + 1 for i, r in enumerate(wait) if r.user_id == me.id), None)}
    if full: out |= {"attendees": [who(db, r.user_id) for r in going], "waiting": [who(db, r.user_id) for r in wait] if m.host_id == me.id else []}
    return out

def open_meetup(db: Session, mid: str, u: M.User) -> B4Meetup:
    m = db.get(B4Meetup, mid)
    if not m or (m.host_id != u.id and blocked_between(db, u.id, m.host_id)): raise HTTPException(404, "Meetup not found")
    return m

@router.get("/addons/b4/meetups")
def meetup_list(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.meetupBoard", "Meetup Board")
    now = M.now_ms()
    blocked = set(db.scalars(select(M.Edge.target).where(M.Edge.user_id == u.id, M.Edge.kind == "block")))
    up = [m for m in db.scalars(select(B4Meetup).where(B4Meetup.status == "open", B4Meetup.starts_at > now).order_by(B4Meetup.starts_at).limit(100)) if m.host_id not in blocked]
    mine_ids = set(db.scalars(select(B4Rsvp.meetup_id).where(B4Rsvp.user_id == u.id)))
    mine = db.scalars(select(B4Meetup).where((B4Meetup.host_id == u.id) | (B4Meetup.id.in_(mine_ids or {"-"})), B4Meetup.starts_at > now - DAY).order_by(B4Meetup.starts_at)).all()
    return {"upcoming": [meetup_json(db, m, u) for m in up], "mine": [meetup_json(db, m, u) for m in mine], "maxCapacity": on(db, u, "addons.glow.meetupMaxCapacity")}

@router.get("/addons/b4/meetups/{mid}")
def meetup_get(mid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.meetupBoard", "Meetup Board")
    return meetup_json(db, open_meetup(db, mid, u), u, True)

class MeetupIn(BaseModel):
    title: str = Field(min_length=3, max_length=80); place: str = Field(min_length=2, max_length=120); startsAt: int
    capacity: int = Field(ge=2, le=1000); note: str = Field(default="", max_length=400)
@router.post("/addons/b4/meetups")
def meetup_create(b: MeetupIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.meetupBoard", "Meetup Board"); not_restricted(u)
    now = M.now_ms()
    if not now + 30 * 60_000 <= b.startsAt <= now + 90 * DAY: raise HTTPException(400, "Pick a time between 30 minutes and 90 days from now")
    if b.capacity > (mx := on(db, u, "addons.glow.meetupMaxCapacity")): raise HTTPException(400, f"Meetups can hold up to {mx} people")
    if (db.scalar(select(func.count()).select_from(B4Meetup).where(B4Meetup.host_id == u.id, B4Meetup.status == "open", B4Meetup.starts_at > now)) or 0) >= 5:
        raise HTTPException(429, "You can host up to 5 upcoming meetups")
    m = B4Meetup(host_id=u.id, title=b.title.strip(), place=b.place.strip(), starts_at=b.startsAt, capacity=b.capacity, note=b.note.strip()); db.add(m); db.commit()
    return meetup_json(db, m, u, True)

@router.post("/addons/b4/meetups/{mid}/rsvp")
def meetup_rsvp(mid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.meetupBoard", "Meetup Board")
    m = open_meetup(db, mid, u)
    if m.status != "open" or m.starts_at <= M.now_ms(): raise HTTPException(409, "This meetup isn't taking RSVPs")
    if m.host_id == u.id: raise HTTPException(400, "You're the host")
    if db.scalar(select(B4Rsvp).where(B4Rsvp.meetup_id == mid, B4Rsvp.user_id == u.id)): raise HTTPException(409, "You've already RSVP'd")
    going = db.scalar(select(func.count()).select_from(B4Rsvp).where(B4Rsvp.meetup_id == mid, B4Rsvp.status == "going")) or 0
    st = "going" if going < m.capacity else "waitlist"
    db.add(B4Rsvp(meetup_id=mid, user_id=u.id, status=st)); db.commit()
    if st == "going": push(m.host_id, f"{u.name} is coming", m.title, "MeetupBoard")
    return meetup_json(db, m, u, True)

@router.delete("/addons/b4/meetups/{mid}/rsvp")
def meetup_leave(mid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.meetupBoard", "Meetup Board")
    m = open_meetup(db, mid, u)
    r = db.scalar(select(B4Rsvp).where(B4Rsvp.meetup_id == mid, B4Rsvp.user_id == u.id))
    if not r: raise HTTPException(404, "You haven't RSVP'd")
    was_going = r.status == "going"; db.delete(r); db.flush()
    if was_going and m.status == "open":  # first person on the waitlist moves up
        nxt = db.scalar(select(B4Rsvp).where(B4Rsvp.meetup_id == mid, B4Rsvp.status == "waitlist").order_by(B4Rsvp.at).limit(1))
        if nxt:
            nxt.status = "going"
            push(nxt.user_id, "You're in!", f"A spot opened up at {m.title}", "MeetupBoard")
    db.commit(); return meetup_json(db, m, u, True)

@router.post("/addons/b4/meetups/{mid}/cancel")
def meetup_cancel(mid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.meetupBoard", "Meetup Board")
    m = db.get(B4Meetup, mid)
    if not m or m.host_id != u.id: raise HTTPException(403, "Only the host can cancel this meetup")
    if m.status == "cancelled": raise HTTPException(409, "Already cancelled")
    m.status = "cancelled"; db.commit()
    for r in db.scalars(select(B4Rsvp).where(B4Rsvp.meetup_id == mid)):
        push(r.user_id, "Meetup cancelled", f"{u.name} cancelled {m.title}", "MeetupBoard")
    return meetup_json(db, m, u, True)

@router.post("/admin/addons/b4/meetups/{mid}/cancel")
def admin_meetup_cancel(mid: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    m = db.get(B4Meetup, mid)
    if not m: raise HTTPException(404, "Meetup not found")
    if m.status != "cancelled":
        m.status = "cancelled"
        for r in db.scalars(select(B4Rsvp).where(B4Rsvp.meetup_id == mid)): push(r.user_id, "Meetup cancelled", f"{m.title} was removed by VibeLoop staff", "MeetupBoard")
    audit(db, a.handle, "addons.meetup_cancel", mid); db.commit(); return {"ok": True}

# ---------- admin overview ----------
@router.get("/admin/addons/b4")
def admin_overview(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    wk = M.now_ms() - 7 * DAY
    c = lambda model: db.scalar(select(func.count()).select_from(model).where(model.at > wk)) or 0  # noqa: E731
    items = [("Photo Prompt Weekly", "photoPrompt", B4PhotoEntry), ("Mentor Match", "mentorMatch", B4Mentorship), ("Hidden Gems", "hiddenGems", B4Gem),
             ("Recipe Box", "recipeBox", B4Recipe), ("Book Nook", "bookNook", B4Book), ("Meetup Board", "meetupBoard", B4Meetup)]
    return {"title": "Glow Extras · Batch 4", "module": "glow",
            "items": [{"name": n, "flag": f"addons.glow.{k}", "on": bool(on(db, None, f"addons.glow.{k}")), "week": c(mdl)} for n, k, mdl in items]}
