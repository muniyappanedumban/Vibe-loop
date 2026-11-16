"""v4 micro-features: Mini Vote (post polls), Pin 3, Save Stack (collections), Love Trail (/me/likes), Friend Flame."""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .db import get_db
from . import models as M
from .security import current_user
from .serial import post_json, posts_json
from .v2common import DAY

router = APIRouter()
MAX_PINS = 3
MAX_COLLECTIONS = 50

def today() -> int: return M.now_ms() // DAY

# ---------- Friend Flame ----------
def flame_of(f: M.Friend) -> int:
    """Streak shows while it's alive: the last shared day is today or yesterday."""
    return f.flame if f.flame and f.flame_day is not None and f.flame_day >= today() - 1 else 0

def bump_flame(db: Session, sender: str, other: str):
    """Called on every 1:1 message. A day counts when both sides messaged; consecutive days extend the streak."""
    mine, theirs = db.get(M.Friend, (sender, other)), db.get(M.Friend, (other, sender))
    if not mine or not theirs: return
    d = today(); mine.last_msg_day = d
    if theirs.last_msg_day == d and mine.flame_day != d:
        n = (mine.flame + 1) if mine.flame_day == d - 1 else 1
        for f in (mine, theirs): f.flame, f.flame_day = n, d

# ---------- Mini Vote ----------
class VoteIn(BaseModel): option: int = Field(ge=0, le=3)
@router.post("/posts/{pid}/vote")
def vote(pid: str, b: VoteIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    from .routes_feed import viewable_post
    p = viewable_post(db, pid, u)
    if not p.poll: raise HTTPException(400, "This post has no poll")
    if b.option >= len(p.poll["options"]): raise HTTPException(400, "Unknown option")
    if u.id in (p.poll.get("voters") or {}): raise HTTPException(409, "You already voted")
    poll = {**p.poll, "options": [dict(o) for o in p.poll["options"]], "voters": {**(p.poll.get("voters") or {}), u.id: b.option}}
    poll["options"][b.option]["votes"] += 1; p.poll = poll; db.commit(); return post_json(db, p, u)

# ---------- Pin 3 ----------
@router.post("/posts/{pid}/pin")
def pin(pid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(M.Post, pid)
    if not p or p.hidden or p.author_id != u.id: raise HTTPException(404, "Post not found")
    if p.pinned_at: p.pinned_at = None
    else:
        n = db.scalar(select(func.count()).select_from(M.Post).where(M.Post.author_id == u.id, M.Post.pinned_at != None, M.Post.hidden == False))  # noqa: E711,E712
        if n >= MAX_PINS: raise HTTPException(409, f"You can pin up to {MAX_PINS} posts — unpin one first")
        p.pinned_at = M.now_ms()
    db.commit(); return post_json(db, p, u)

@router.get("/users/{uid}/pinned")
def pinned(uid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    uid = u.id if uid == "me" else uid
    from .routes_feed import can_see, blocked_ids
    if uid != u.id and uid in blocked_ids(db, u): return []
    rows = db.scalars(select(M.Post).where(M.Post.author_id == uid, M.Post.pinned_at != None, M.Post.hidden == False).order_by(M.Post.pinned_at.desc()).limit(10)).all()  # noqa: E711,E712
    return posts_json(db, [p for p in rows if can_see(db, p, u)], u)

# ---------- Save Stack ----------
def col_json(c: M.Collection) -> dict: return {"id": c.id, "name": c.name, "items": c.items or [], "count": len(c.items or []), "at": c.at}
@router.get("/collections")
def collections(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    return [col_json(c) for c in db.scalars(select(M.Collection).where(M.Collection.owner_id == u.id).order_by(M.Collection.at))]

class ColIn(BaseModel): id: str | None = Field(default=None, pattern=r"^[\w-]{3,40}$"); name: str = Field(min_length=1, max_length=40)
@router.post("/collections")
def new_collection(b: ColIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    if b.id and (ex := db.get(M.Collection, b.id)):
        if ex.owner_id != u.id: raise HTTPException(409, "Id in use")
        return col_json(ex)
    if db.scalar(select(func.count()).select_from(M.Collection).where(M.Collection.owner_id == u.id)) >= MAX_COLLECTIONS: raise HTTPException(409, "Too many collections")
    c = M.Collection(id=b.id or M.nid("col"), owner_id=u.id, name=b.name.strip()); db.add(c); db.commit(); return col_json(c)

class ItemIn(BaseModel): postId: str = Field(min_length=1, max_length=40)
@router.post("/collections/{cid}/items")
def add_item(cid: str, b: ItemIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    c = db.get(M.Collection, cid)
    if not c or c.owner_id != u.id: raise HTTPException(404, "Collection not found")
    from .routes_feed import viewable_post
    viewable_post(db, b.postId, u)
    if b.postId not in (c.items or []): c.items = [b.postId, *(c.items or [])][:500]
    db.commit(); return col_json(c)

@router.delete("/collections/{cid}/items/{pid}")
def remove_item(cid: str, pid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    c = db.get(M.Collection, cid)
    if not c or c.owner_id != u.id: raise HTTPException(404, "Collection not found")
    c.items = [x for x in (c.items or []) if x != pid]; db.commit(); return col_json(c)

# ---------- Love Trail ----------
@router.get("/me/likes")
def my_likes(cursor: int = Query(0, ge=0), u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(M.PostReaction, M.Post).join(M.Post, M.Post.id == M.PostReaction.post_id)
                      .where(M.PostReaction.user_id == u.id, M.Post.hidden == False).order_by(M.PostReaction.at.desc(), M.Post.at.desc())  # noqa: E712
                      .offset(max(0, cursor)).limit(21)).all()
    items = [{**pj, "myReact": r.key, "reactedAt": r.at} for (r, p), pj in zip(rows[:20], posts_json(db, [p for _, p in rows[:20]], u))]
    return {"items": items, "nextCursor": cursor + 20 if len(rows) > 20 else None}
