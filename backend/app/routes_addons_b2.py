"""VibeLoop add-ons, batch 2 (Glow) — each one switchable in User App Settings (addons.glow.*).

  Vibe Meter       viewers slide 0-100 "how did this make you feel" on a post; one vote each (changeable); average + distribution.
  Streak Garden    daily activity (post / Daily Spark / duel argument / challenge entry) waters a plant; freeze tokens cover missed days.
  Micro Challenges staff publish a weekly challenge; users submit one entry; others upvote; winners board after it ends.
  Spotlight Wall   staff curate featured creators with a reason; users browse and follow from the wall.
  Hot Take Duels   author posts a statement; people pick a side + one-line argument; top arguments per side.
  Gratitude Jar    private daily gratitude notes; monthly recap with counts and a random past note.
"""
import random
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import String, Integer, BigInteger, Text, JSON, ForeignKey, UniqueConstraint, Index, select, func
from sqlalchemy.orm import Session, Mapped, mapped_column
from .db import get_db
from . import models as M
from .models import Base, nid, now_ms
from .security import current_user, require, audit
from .routes_addons import on, need, push, who

router = APIRouter()
STAFF = require("owner", "admin", "moderator", "support")
DAY = 86_400_000
UID = lambda: mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)  # noqa: E731

# ============================== models ==============================
class VibeVote(Base):
    __tablename__ = "b2_vibe_votes"
    __table_args__ = (UniqueConstraint("post_id", "user_id", name="uq_b2_vibe_post_user"),)
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("vb"))
    post_id: Mapped[str] = mapped_column(String(40), index=True); user_id: Mapped[str] = UID()
    value: Mapped[int] = mapped_column(Integer); at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class StreakFreeze(Base):
    __tablename__ = "b2_streak_freezes"
    __table_args__ = (UniqueConstraint("user_id", "day", name="uq_b2_freeze_user_day"),)
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("sf"))
    user_id: Mapped[str] = UID(); day: Mapped[str] = mapped_column(String(10)); at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class Challenge(Base):
    __tablename__ = "b2_challenges"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("mc"))
    title: Mapped[str] = mapped_column(String(80)); rules: Mapped[str] = mapped_column(Text); ends_at: Mapped[int] = mapped_column(BigInteger, index=True)
    created_by: Mapped[str] = mapped_column(String(60), default=""); at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class ChallengeEntry(Base):
    __tablename__ = "b2_challenge_entries"
    __table_args__ = (UniqueConstraint("challenge_id", "user_id", name="uq_b2_entry_challenge_user"),)
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("mce"))
    challenge_id: Mapped[str] = mapped_column(ForeignKey("b2_challenges.id", ondelete="CASCADE"), index=True); user_id: Mapped[str] = UID()
    text: Mapped[str] = mapped_column(String(500)); media_url: Mapped[str | None] = mapped_column(String(200), nullable=True)
    votes: Mapped[list] = mapped_column(JSON, default=list); at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class Spotlight(Base):
    __tablename__ = "b2_spotlights"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("spl"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    reason: Mapped[str] = mapped_column(String(200)); position: Mapped[int] = mapped_column(Integer, default=0)
    added_by: Mapped[str] = mapped_column(String(60), default=""); at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class Duel(Base):
    __tablename__ = "b2_duels"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("dl"))
    author_id: Mapped[str] = UID(); statement: Mapped[str] = mapped_column(String(200))
    side_a: Mapped[str] = mapped_column(String(40)); side_b: Mapped[str] = mapped_column(String(40)); at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class DuelTake(Base):
    __tablename__ = "b2_duel_takes"
    __table_args__ = (UniqueConstraint("duel_id", "user_id", name="uq_b2_take_duel_user"),)
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("dt"))
    duel_id: Mapped[str] = mapped_column(ForeignKey("b2_duels.id", ondelete="CASCADE"), index=True); user_id: Mapped[str] = UID()
    side: Mapped[str] = mapped_column(String(1)); argument: Mapped[str] = mapped_column(String(140))
    backers: Mapped[list] = mapped_column(JSON, default=list); at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class GratitudeNote(Base):
    __tablename__ = "b2_gratitude_notes"
    __table_args__ = (Index("ix_b2_gratitude_user_day", "user_id", "day"),)
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("gn"))
    user_id: Mapped[str] = UID(); day: Mapped[str] = mapped_column(String(10)); text: Mapped[str] = mapped_column(String(300))
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

def today() -> str: return datetime.now(timezone.utc).strftime("%Y-%m-%d")
def day_of(ms: int) -> str: return datetime.fromtimestamp(ms / 1000, timezone.utc).strftime("%Y-%m-%d")

# ============================== Vibe Meter ==============================
def vibe_json(db: Session, pid: str, me: M.User) -> dict:
    vals = list(db.scalars(select(VibeVote.value).where(VibeVote.post_id == pid)))
    mine = db.scalar(select(VibeVote.value).where(VibeVote.post_id == pid, VibeVote.user_id == me.id))
    dist = [0] * 5  # buckets 0-19, 20-39, 40-59, 60-79, 80-100
    for v in vals: dist[min(v // 20, 4)] += 1
    return {"postId": pid, "count": len(vals), "average": round(sum(vals) / len(vals), 1) if vals else None, "distribution": dist, "mine": mine}

def post_for(db: Session, pid: str, u: M.User) -> M.Post:
    from .routes_feed import viewable_post
    return viewable_post(db, pid, u)

class VibeIn(BaseModel): value: int = Field(ge=0, le=100)
@router.get("/addons/b2/vibe/{pid}")
def vibe_get(pid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.vibeMeter", "Vibe Meter"); post_for(db, pid, u); return vibe_json(db, pid, u)

@router.put("/addons/b2/vibe/{pid}")
def vibe_vote(pid: str, b: VibeIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.vibeMeter", "Vibe Meter"); p = post_for(db, pid, u)
    if p.author_id == u.id: raise HTTPException(400, "You can't rate your own post")
    v = db.scalar(select(VibeVote).where(VibeVote.post_id == pid, VibeVote.user_id == u.id))
    if v: v.value = b.value; v.at = now_ms()
    else: db.add(VibeVote(post_id=pid, user_id=u.id, value=b.value))
    db.commit(); return vibe_json(db, pid, u)

@router.delete("/addons/b2/vibe/{pid}")
def vibe_clear(pid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.vibeMeter", "Vibe Meter"); post_for(db, pid, u)
    if v := db.scalar(select(VibeVote).where(VibeVote.post_id == pid, VibeVote.user_id == u.id)): db.delete(v); db.commit()
    return vibe_json(db, pid, u)

@router.get("/addons/b2/vibe-posts")
def vibe_posts(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    """Recent posts you can rate (not yours) + your own posts with their meters."""
    need(db, u, "addons.glow.vibeMeter", "Vibe Meter")
    blocked = set(db.scalars(select(M.Edge.target).where(M.Edge.user_id == u.id, M.Edge.kind == "block")))
    rows = db.scalars(select(M.Post).where(M.Post.hidden == False).order_by(M.Post.at.desc()).limit(40)).all()  # noqa: E712
    out = []
    for p in rows:
        if p.author_id in blocked: continue
        try: post_for(db, p.id, u)
        except HTTPException: continue
        out.append({"id": p.id, "text": (p.text or "")[:140], "author": who(db, p.author_id), "mine": p.author_id == u.id, "vibe": vibe_json(db, p.id, u)})
    return out[:25]

# ============================== Streak Garden ==============================
STAGES = [(0, "Bare soil"), (1, "Seed"), (3, "Sprout"), (7, "Sapling"), (14, "Bloom"), (30, "Blossom tree"), (100, "Ancient grove")]
def active_days(db: Session, uid: str, since_ms: int) -> set[str]:
    ts = list(db.scalars(select(M.Post.at).where(M.Post.author_id == uid, M.Post.at >= since_ms)))
    ts += list(db.scalars(select(M.SparkAnswer.at).where(M.SparkAnswer.user_id == uid, M.SparkAnswer.at >= since_ms)))
    ts += list(db.scalars(select(DuelTake.at).where(DuelTake.user_id == uid, DuelTake.at >= since_ms)))
    ts += list(db.scalars(select(ChallengeEntry.at).where(ChallengeEntry.user_id == uid, ChallengeEntry.at >= since_ms)))
    return {day_of(t) for t in ts}

def freezes_left(db: Session, u: M.User) -> int:
    month = today()[:7]
    used = db.scalar(select(func.count()).select_from(StreakFreeze).where(StreakFreeze.user_id == u.id, StreakFreeze.day.like(f"{month}%"))) or 0
    return max(0, on(db, u, "addons.glow.streakFreezesPerMonth") - used)

def garden_json(db: Session, u: M.User) -> dict:
    days = active_days(db, u.id, now_ms() - 400 * DAY)
    frozen = set(db.scalars(select(StreakFreeze.day).where(StreakFreeze.user_id == u.id)))
    d = datetime.now(timezone.utc).date(); watered = d.isoformat() in days
    if not watered: d -= timedelta(days=1)  # today isn't over yet — the streak still counts until midnight UTC
    streak = 0
    while d.isoformat() in days or d.isoformat() in frozen: streak += 1; d -= timedelta(days=1)
    yday = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
    stage = max(i for i, (n, _) in enumerate(STAGES) if streak >= n); nxt = STAGES[stage + 1][0] if stage + 1 < len(STAGES) else None
    last14 = [(datetime.now(timezone.utc).date() - timedelta(days=i)).isoformat() for i in range(13, -1, -1)]
    return {"streak": streak, "wateredToday": watered, "stage": stage, "stageName": STAGES[stage][1], "nextStageAt": nxt, "stages": [n for _, n in STAGES],
            "freezesLeft": freezes_left(db, u), "canFreezeYesterday": yday not in days and yday not in frozen,
            "days": [{"day": x, "state": "watered" if x in days else "frozen" if x in frozen else "dry"} for x in last14]}

@router.get("/addons/b2/garden")
def garden_get(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.streakGarden", "Streak Garden"); return garden_json(db, u)

@router.post("/addons/b2/garden/freeze")
def garden_freeze(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    """Spend a freeze token to cover yesterday (if you missed it)."""
    need(db, u, "addons.glow.streakGarden", "Streak Garden")
    g = garden_json(db, u)
    if not g["canFreezeYesterday"]: raise HTTPException(409, "Yesterday doesn't need a freeze")
    if g["freezesLeft"] <= 0: raise HTTPException(429, "No freeze tokens left this month")
    db.add(StreakFreeze(user_id=u.id, day=(datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat())); db.commit()
    return garden_json(db, u)

# ============================== Micro Challenges ==============================
def entry_json(db: Session, e: ChallengeEntry, me: M.User) -> dict:
    return {"id": e.id, "text": e.text, "mediaUrl": e.media_url, "at": e.at, "user": who(db, e.user_id), "mine": e.user_id == me.id,
            "votes": len(e.votes or []), "voted": me.id in (e.votes or [])}

def challenge_json(db: Session, c: Challenge, me: M.User, entries: bool = False) -> dict:
    ended = c.ends_at <= now_ms()
    n = db.scalar(select(func.count()).select_from(ChallengeEntry).where(ChallengeEntry.challenge_id == c.id)) or 0
    out = {"id": c.id, "title": c.title, "rules": c.rules, "endsAt": c.ends_at, "at": c.at, "ended": ended, "entries": n}
    if entries:
        rows = db.scalars(select(ChallengeEntry).where(ChallengeEntry.challenge_id == c.id).order_by(ChallengeEntry.at.desc())).all()
        blocked = set(db.scalars(select(M.Edge.target).where(M.Edge.user_id == me.id, M.Edge.kind == "block")))
        ej = [entry_json(db, e, me) for e in rows if e.user_id not in blocked]
        out["list"] = ej; out["mine"] = next((e for e in ej if e["mine"]), None)
        out["winners"] = sorted(ej, key=lambda e: (-e["votes"], e["at"]))[:3] if ended else []
    return out

def get_challenge(db: Session, cid: str) -> Challenge:
    c = db.get(Challenge, cid)
    if not c: raise HTTPException(404, "Challenge not found")
    return c

@router.get("/addons/b2/challenges")
def challenges_list(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.microChallenges", "Micro Challenges")
    rows = db.scalars(select(Challenge).order_by(Challenge.ends_at.desc()).limit(30)).all()
    return {"live": [challenge_json(db, c, u) for c in rows if c.ends_at > now_ms()], "past": [challenge_json(db, c, u) for c in rows if c.ends_at <= now_ms()]}

@router.get("/addons/b2/challenges/{cid}")
def challenge_get(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.microChallenges", "Micro Challenges"); return challenge_json(db, get_challenge(db, cid), u, True)

class EntryIn(BaseModel): text: str = Field(min_length=1, max_length=500); mediaUrl: str | None = Field(default=None, max_length=200)
@router.post("/addons/b2/challenges/{cid}/entry")
def challenge_enter(cid: str, b: EntryIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.microChallenges", "Micro Challenges")
    from .routes_trust import assert_not_restricted
    assert_not_restricted(u)
    c = get_challenge(db, cid)
    if c.ends_at <= now_ms(): raise HTTPException(409, "This challenge has ended")
    if b.mediaUrl:
        mf = db.get(M.MediaFile, b.mediaUrl.split("/")[-1].split(".")[0])
        if not mf or mf.owner_id != u.id: raise HTTPException(400, "Upload the file first")
        from .routes_media import mark_public
        mark_public(db, b.mediaUrl, u)
    e = db.scalar(select(ChallengeEntry).where(ChallengeEntry.challenge_id == cid, ChallengeEntry.user_id == u.id))
    if e: e.text = b.text.strip(); e.media_url = b.mediaUrl  # one entry each — re-submitting edits it
    else: e = ChallengeEntry(challenge_id=cid, user_id=u.id, text=b.text.strip(), media_url=b.mediaUrl, votes=[]); db.add(e)
    db.commit(); return entry_json(db, e, u)

@router.post("/addons/b2/challenges/entries/{eid}/vote")
def challenge_vote(eid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.microChallenges", "Micro Challenges")
    e = db.get(ChallengeEntry, eid)
    if not e: raise HTTPException(404, "Entry not found")
    if e.user_id == u.id: raise HTTPException(400, "You can't upvote your own entry")
    if get_challenge(db, e.challenge_id).ends_at <= now_ms(): raise HTTPException(409, "Voting has closed")
    v = list(e.votes or [])
    if u.id in v: v.remove(u.id)
    else:
        v.append(u.id)
        if len(v) in (1, 10, 50): push(e.user_id, "Your challenge entry is getting upvotes", f"{len(v)} upvote{'s' if len(v) > 1 else ''}", "MicroChallenges")
    e.votes = v; db.commit(); return entry_json(db, e, u)

class ChallengeIn(BaseModel): title: str = Field(min_length=3, max_length=80); rules: str = Field(min_length=3, max_length=2000); endsAt: int
@router.post("/admin/addons/b2/challenges")
def admin_challenge_create(b: ChallengeIn, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    if not now_ms() + 3_600_000 <= b.endsAt <= now_ms() + 31 * DAY: raise HTTPException(400, "End date must be between 1 hour and 31 days away")
    c = Challenge(title=b.title.strip(), rules=b.rules.strip(), ends_at=b.endsAt, created_by=a.handle); db.add(c)
    audit(db, a.handle, "addons.challenge_create", b.title[:80]); db.commit(); return challenge_json(db, c, a)
@router.get("/admin/addons/b2/challenges")
def admin_challenges(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    return [challenge_json(db, c, a) for c in db.scalars(select(Challenge).order_by(Challenge.at.desc()).limit(50))]
@router.delete("/admin/addons/b2/challenges/{cid}")
def admin_challenge_delete(cid: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    if c := db.get(Challenge, cid): db.delete(c)
    audit(db, a.handle, "addons.challenge_delete", cid); db.commit(); return {"ok": True}
@router.delete("/admin/addons/b2/challenges/entries/{eid}")
def admin_entry_delete(eid: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    if e := db.get(ChallengeEntry, eid): db.delete(e)
    audit(db, a.handle, "addons.challenge_entry_remove", eid); db.commit(); return {"ok": True}

# ============================== Spotlight Wall ==============================
def spot_json(db: Session, s: Spotlight, me: M.User | None) -> dict:
    return {"id": s.id, "user": who(db, s.user_id), "reason": s.reason, "position": s.position, "at": s.at,
            "following": bool(me and db.get(M.Edge, (me.id, "follow", s.user_id))), "me": bool(me and me.id == s.user_id)}

def wall(db: Session) -> list[Spotlight]: return list(db.scalars(select(Spotlight).order_by(Spotlight.position, Spotlight.at)))

@router.get("/addons/b2/spotlight")
def spotlight_wall(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.spotlightWall", "Spotlight Wall")
    blocked = set(db.scalars(select(M.Edge.target).where(M.Edge.user_id == u.id, M.Edge.kind == "block")))
    out = []
    for s in wall(db):
        t = db.get(M.User, s.user_id)
        if t and not t.suspended and s.user_id not in blocked: out.append(spot_json(db, s, u))
    return out

class SpotIn(BaseModel): user: str = Field(min_length=1, max_length=60); reason: str = Field(min_length=3, max_length=200)
@router.get("/admin/addons/b2/spotlight")
def admin_spot_list(a: M.User = Depends(STAFF), db: Session = Depends(get_db)): return [spot_json(db, s, None) for s in wall(db)]
@router.post("/admin/addons/b2/spotlight")
def admin_spot_add(b: SpotIn, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    from .v2common import find_by_handle
    t = db.get(M.User, b.user) or find_by_handle(db, b.user)
    if not t or t.suspended: raise HTTPException(404, "No one with that @ID")
    if s := db.scalar(select(Spotlight).where(Spotlight.user_id == t.id)): s.reason = b.reason.strip()
    else:
        s = Spotlight(user_id=t.id, reason=b.reason.strip(), position=(db.scalar(select(func.max(Spotlight.position))) or 0) + 1, added_by=a.handle); db.add(s)
        push(t.id, "You're on the Spotlight Wall", b.reason.strip(), "SpotlightWall")
    audit(db, a.handle, "addons.spotlight_add", f"{t.handle} {b.reason[:80]}"); db.commit(); return spot_json(db, s, None)
class OrderIn(BaseModel): ids: list[str] = Field(min_length=1, max_length=200)
@router.put("/admin/addons/b2/spotlight/order")
def admin_spot_order(b: OrderIn, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    cur = {s.id: s for s in wall(db)}
    if set(b.ids) != set(cur): raise HTTPException(400, "Send every Spotlight id exactly once")
    for i, sid in enumerate(b.ids): cur[sid].position = i
    audit(db, a.handle, "addons.spotlight_order", ",".join(b.ids)[:200]); db.commit(); return [spot_json(db, s, None) for s in wall(db)]
@router.delete("/admin/addons/b2/spotlight/{sid}")
def admin_spot_remove(sid: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    if s := db.get(Spotlight, sid): db.delete(s)
    audit(db, a.handle, "addons.spotlight_remove", sid); db.commit(); return {"ok": True}

# ============================== Hot Take Duels ==============================
def take_json(db: Session, t: DuelTake, me: M.User) -> dict:
    return {"id": t.id, "side": t.side, "argument": t.argument, "at": t.at, "user": who(db, t.user_id), "mine": t.user_id == me.id,
            "backers": len(t.backers or []), "backed": me.id in (t.backers or [])}

def duel_json(db: Session, d: Duel, me: M.User, full: bool = False) -> dict:
    takes = db.scalars(select(DuelTake).where(DuelTake.duel_id == d.id)).all()
    blocked = set(db.scalars(select(M.Edge.target).where(M.Edge.user_id == me.id, M.Edge.kind == "block")))
    a = sum(1 for t in takes if t.side == "a"); mine = next((t for t in takes if t.user_id == me.id), None)
    out = {"id": d.id, "statement": d.statement, "sideA": d.side_a, "sideB": d.side_b, "at": d.at, "author": who(db, d.author_id), "mineDuel": d.author_id == me.id,
           "countA": a, "countB": len(takes) - a, "myTake": take_json(db, mine, me) if mine else None}
    if full:
        top = lambda s: [take_json(db, t, me) for t in sorted((t for t in takes if t.side == s and t.user_id not in blocked), key=lambda t: (-len(t.backers or []), t.at))[:10]]  # noqa: E731
        out["topA"] = top("a"); out["topB"] = top("b")
    return out

def get_duel(db: Session, did: str, u: M.User) -> Duel:
    from .v2common import blocked_between
    d = db.get(Duel, did)
    if not d or blocked_between(db, u.id, d.author_id): raise HTTPException(404, "Duel not found")
    return d

class DuelIn(BaseModel):
    statement: str = Field(min_length=5, max_length=200); sideA: str = Field(default="Agree", min_length=1, max_length=40); sideB: str = Field(default="Disagree", min_length=1, max_length=40)
@router.post("/addons/b2/duels")
def duel_create(b: DuelIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.hotTakeDuels", "Hot Take Duels")
    from .routes_trust import assert_not_restricted
    assert_not_restricted(u)
    if b.sideA.strip().lower() == b.sideB.strip().lower(): raise HTTPException(400, "The two sides need different names")
    d = Duel(author_id=u.id, statement=b.statement.strip(), side_a=b.sideA.strip(), side_b=b.sideB.strip()); db.add(d); db.commit()
    return duel_json(db, d, u, True)

@router.get("/addons/b2/duels")
def duel_list(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.hotTakeDuels", "Hot Take Duels")
    blocked = set(db.scalars(select(M.Edge.target).where(M.Edge.user_id == u.id, M.Edge.kind == "block")))
    return [duel_json(db, d, u) for d in db.scalars(select(Duel).order_by(Duel.at.desc()).limit(40)) if d.author_id not in blocked]

@router.get("/addons/b2/duels/{did}")
def duel_get(did: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.hotTakeDuels", "Hot Take Duels"); return duel_json(db, get_duel(db, did, u), u, True)

class TakeIn(BaseModel): side: str = Field(pattern=r"^(a|b)$"); argument: str = Field(min_length=2, max_length=140)
@router.post("/addons/b2/duels/{did}/take")
def duel_take(did: str, b: TakeIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.hotTakeDuels", "Hot Take Duels")
    from .routes_trust import assert_not_restricted
    assert_not_restricted(u)
    d = get_duel(db, did, u)
    t = db.scalar(select(DuelTake).where(DuelTake.duel_id == did, DuelTake.user_id == u.id))
    if t:
        if t.side != b.side: t.backers = []  # switching sides resets your backing
        t.side = b.side; t.argument = b.argument.strip()
    else:
        db.add(DuelTake(duel_id=did, user_id=u.id, side=b.side, argument=b.argument.strip(), backers=[]))
        if d.author_id != u.id: push(d.author_id, "Someone took a side on your Hot Take", b.argument.strip(), "HotTakeDuels")
    db.commit(); return duel_json(db, d, u, True)

@router.post("/addons/b2/duels/takes/{tid}/back")
def duel_back(tid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.hotTakeDuels", "Hot Take Duels")
    t = db.get(DuelTake, tid)
    if not t: raise HTTPException(404, "Argument not found")
    get_duel(db, t.duel_id, u)
    if t.user_id == u.id: raise HTTPException(400, "You can't back your own argument")
    bk = list(t.backers or [])
    if u.id in bk: bk.remove(u.id)
    else: bk.append(u.id)
    t.backers = bk; db.commit(); return take_json(db, t, u)

@router.delete("/addons/b2/duels/{did}")
def duel_delete(did: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.hotTakeDuels", "Hot Take Duels")
    d = db.get(Duel, did)
    if not d: raise HTTPException(404, "Duel not found")
    if d.author_id != u.id: raise HTTPException(403, "Only the author can delete this duel")
    db.delete(d); db.commit(); return {"ok": True}

@router.delete("/admin/addons/b2/duels/{did}")
def admin_duel_delete(did: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    if d := db.get(Duel, did): db.delete(d)
    audit(db, a.handle, "addons.duel_remove", did); db.commit(); return {"ok": True}

# ============================== Gratitude Jar ==============================
def note_json(n: GratitudeNote) -> dict: return {"id": n.id, "day": n.day, "text": n.text, "at": n.at}

class NoteIn(BaseModel): text: str = Field(min_length=1, max_length=300)
@router.post("/addons/b2/gratitude")
def gratitude_add(b: NoteIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.gratitudeJar", "Gratitude Jar")
    d = today(); n = db.scalar(select(func.count()).select_from(GratitudeNote).where(GratitudeNote.user_id == u.id, GratitudeNote.day == d)) or 0
    if n >= (cap := on(db, u, "addons.glow.gratitudePerDay")): raise HTTPException(429, f"Your jar takes {cap} notes a day — come back tomorrow")
    g = GratitudeNote(user_id=u.id, day=d, text=b.text.strip()); db.add(g); db.commit(); return note_json(g)

@router.get("/addons/b2/gratitude")
def gratitude_list(month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"), u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.gratitudeJar", "Gratitude Jar")
    m = month or today()[:7]
    rows = db.scalars(select(GratitudeNote).where(GratitudeNote.user_id == u.id, GratitudeNote.day.like(f"{m}%")).order_by(GratitudeNote.at.desc())).all()
    return {"month": m, "notes": [note_json(n) for n in rows]}

@router.get("/addons/b2/gratitude/recap")
def gratitude_recap(month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"), u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.gratitudeJar", "Gratitude Jar")
    m = month or today()[:7]
    rows = db.scalars(select(GratitudeNote).where(GratitudeNote.user_id == u.id, GratitudeNote.day.like(f"{m}%"))).all()
    past = db.scalars(select(GratitudeNote).where(GratitudeNote.user_id == u.id, GratitudeNote.day < f"{m}-01")).all()
    total = db.scalar(select(func.count()).select_from(GratitudeNote).where(GratitudeNote.user_id == u.id)) or 0
    pick = random.choice(past or rows) if (past or rows) else None
    return {"month": m, "notes": len(rows), "days": len({n.day for n in rows}), "allTime": total, "throwback": note_json(pick) if pick else None}

@router.delete("/addons/b2/gratitude/{nid_}")
def gratitude_delete(nid_: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "addons.glow.gratitudeJar", "Gratitude Jar")
    n = db.get(GratitudeNote, nid_)
    if not n or n.user_id != u.id: raise HTTPException(404, "Note not found")
    db.delete(n); db.commit(); return {"ok": True}

# ============================== admin overview ==============================
@router.get("/admin/addons/b2")
def admin_b2(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    wk = now_ms() - 7 * DAY
    c = lambda model: db.scalar(select(func.count()).select_from(model).where(model.at > wk)) or 0  # noqa: E731
    items = [("Vibe Meter", "vibeMeter", c(VibeVote)), ("Streak Garden", "streakGarden", c(StreakFreeze)),
             ("Micro Challenges", "microChallenges", c(ChallengeEntry) + c(Challenge)), ("Spotlight Wall", "spotlightWall", c(Spotlight)),
             ("Hot Take Duels", "hotTakeDuels", c(Duel) + c(DuelTake)), ("Gratitude Jar", "gratitudeJar", c(GratitudeNote))]
    return {"title": "Glow Extras · Batch 2", "module": "glow",
            "items": [{"name": n, "flag": f"addons.glow.{k}", "on": bool(on(db, None, f"addons.glow.{k}")), "week": w} for n, k, w in items]}
