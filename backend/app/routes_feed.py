"""v4 paged feed + comments (paged list, delete, like). /bootstrap stays as is."""
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .db import get_db
from . import models as M
from .security import current_user
from .serial import post_json, posts_json, me_id
from .v2common import user_json

router = APIRouter()
PAGE = 20

def can_see(db: Session, p: M.Post, me: M.User, circles: set | None = None, hidden: set | None = None) -> bool:
    """Audience "circle" = the author's Inner Circle (friends.close). circles = preloaded authors whose circle I'm in.
    v6: private profiles (followRequests on) → accepted followers only. hidden = preloaded routes_v6.hidden_private()."""
    if p.author_id == me.id: return True
    if hidden is not None:
        if p.author_id in hidden: return False
    else:
        a = db.get(M.User, p.author_id)
        if a and (a.profile or {}).get("social_private") and not db.get(M.Edge, (me.id, "follow", a.id)):
            if "vl_frq" not in db.info:
                from .realtime import feature
                db.info["vl_frq"] = feature(db, me, "followRequests")
            if db.info["vl_frq"]: return False
    if p.audience != "circle": return True
    if circles is not None: return p.author_id in circles
    f = db.get(M.Friend, (p.author_id, me.id)); return bool(f and f.close)

def my_circles(db: Session, me: M.User) -> set:
    return set(db.scalars(select(M.Friend.user_id).where(M.Friend.friend_id == me.id, M.Friend.close == True)))  # noqa: E712

def blocked_ids(db: Session, me: M.User) -> set:
    """Both directions: people I blocked and people who blocked me."""
    return set(db.scalars(select(M.Edge.target).where(M.Edge.user_id == me.id, M.Edge.kind == "block"))) | \
           set(db.scalars(select(M.Edge.user_id).where(M.Edge.target == me.id, M.Edge.kind == "block")))

def viewable_post(db: Session, pid: str, me: M.User) -> M.Post:
    """IDOR guard for every post interaction: exists, not removed, audience allows me, no block either way."""
    p = db.get(M.Post, pid)
    if not p or p.hidden or not can_see(db, p, me) or (p.author_id != me.id and p.author_id in blocked_ids(db, me)): raise HTTPException(404, "Post not found")
    return p

@router.get("/feed")
def feed(mode: Literal["foryou", "circle", "trending", "fresh"] = "foryou", cursor: int = Query(0, ge=0), u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    blocked = set(db.scalars(select(M.Edge.target).where(M.Edge.user_id == u.id, M.Edge.kind == "block")))
    circles = my_circles(db, u)
    from .routes_v6 import hidden_private
    hid = hidden_private(db, u)
    q = select(M.Post).where(M.Post.hidden == False)  # noqa: E712
    if blocked: q = q.where(M.Post.author_id.not_in(blocked))
    if mode == "circle":
        mine = set(db.scalars(select(M.Edge.target).where(M.Edge.user_id == u.id, M.Edge.kind == "follow"))) | set(db.scalars(select(M.Friend.friend_id).where(M.Friend.user_id == u.id)))
        q = q.where(M.Post.author_id.in_(mine | {u.id}))
    if mode == "trending":
        q = q.where(M.Post.at > M.now_ms() - 7 * 86_400_000).order_by((M.Post.shares * 20 + M.Post.views).desc(), M.Post.at.desc(), M.Post.id)
    else: q = q.order_by(M.Post.at.desc(), M.Post.id)
    out, off, more = [], cursor, False
    while True:  # skip posts the caller may not see, keep pages full
        rows = db.scalars(q.offset(off).limit(PAGE * 2)).all()
        for p in rows:
            if len(out) == PAGE: more = True; break
            off += 1
            if can_see(db, p, u, circles, hid): out.append(p)
        if more or len(rows) < PAGE * 2: break
    if not more and len(out) == PAGE: more = db.scalars(q.offset(off).limit(1)).first() is not None
    if out: db.scalars(select(M.User).where(M.User.id.in_({p.author_id for p in out}))).all()
    return {"mode": mode, "items": posts_json(db, out, u), "nextCursor": off if more else None}

def comment_json(db: Session, c: M.Comment, me: M.User) -> dict:
    by = db.get(M.User, c.by)
    return {"id": c.id, "postId": c.post_id, "by": me_id(c.by, me), "user": user_json(by) if by else None, "text": c.text, "at": c.at,
            "replyTo": c.reply_to, "likes": len(c.liked_by or []), "liked": me.id in (c.liked_by or []), "mine": c.by == me.id, "held": c.held}

@router.get("/posts/{pid}/comments")
def list_comments(pid: str, cursor: int = Query(0, ge=0), u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(M.Post, pid)
    if not p or p.hidden or not can_see(db, p, u): raise HTTPException(404, "Post not found")
    q = select(M.Comment).where(M.Comment.post_id == pid, (M.Comment.held == False) | (M.Comment.by == u.id)).order_by(M.Comment.at, M.Comment.id)  # noqa: E712
    rows = db.scalars(q.offset(cursor).limit(PAGE + 1)).all()
    if rows: db.scalars(select(M.User).where(M.User.id.in_({c.by for c in rows}))).all()  # batch authors
    total = db.scalar(select(func.count()).select_from(M.Comment).where(M.Comment.post_id == pid, M.Comment.held == False))  # noqa: E712
    return {"items": [comment_json(db, c, u) for c in rows[:PAGE]], "nextCursor": cursor + PAGE if len(rows) > PAGE else None, "total": total}

@router.delete("/comments/{cid}")
def delete_comment(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    c = db.get(M.Comment, cid)
    p = db.get(M.Post, c.post_id) if c else None
    if not c or not p: raise HTTPException(404, "Comment not found")
    if u.id not in (c.by, p.author_id): raise HTTPException(403, "Only the author or the post owner can delete this")
    for r in db.scalars(select(M.Comment).where(M.Comment.reply_to == c.id)): r.reply_to = None
    db.delete(c); db.commit(); return {"ok": True}

@router.post("/comments/{cid}/like")
def like_comment(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    c = db.get(M.Comment, cid)
    if not c or (c.held and c.by != u.id): raise HTTPException(404, "Comment not found")
    viewable_post(db, c.post_id, u)
    lb = list(c.liked_by or [])
    c.liked_by = [x for x in lb if x != u.id] if u.id in lb else lb + [u.id]; db.commit(); return comment_json(db, c, u)

# ---------- Glow: profile grids + server search ----------
def _follow_state(db: Session, me: M.User, t: M.User) -> str:
    if db.get(M.Edge, (me.id, "follow", t.id)): return "following"
    pend = db.scalar(select(M.FollowRequest.id).where(M.FollowRequest.from_id == me.id, M.FollowRequest.to_id == t.id, M.FollowRequest.status == "pending").limit(1))
    return "requested" if pend else "none"

@router.get("/users/{uid}/posts")
def user_posts(uid: str, cursor: int = Query(0, ge=0), u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    """A person's Drops grid (own profile with uid=me, or a creator profile). Private/blocked rules as in /feed."""
    from .serial import creator_json
    t = u if uid == "me" else db.get(M.User, uid[:40])
    if not t or t.suspended or (t.id != u.id and t.id in blocked_ids(db, u)): raise HTTPException(404, "User not found")
    followers = db.scalar(select(func.count()).select_from(M.Edge).where(M.Edge.kind == "follow", M.Edge.target == t.id)) or 0
    following = db.scalar(select(func.count()).select_from(M.Edge).where(M.Edge.kind == "follow", M.Edge.user_id == t.id)) or 0
    q = select(M.Post).where(M.Post.author_id == t.id, M.Post.hidden == False).order_by(M.Post.at.desc(), M.Post.id)  # noqa: E712
    rows = db.scalars(q.offset(cursor).limit(PAGE + 1)).all()
    more = len(rows) > PAGE; rows = rows[:PAGE]
    vis = [p for p in rows if can_see(db, p, u)]
    total = db.scalar(select(func.count()).select_from(M.Post).where(M.Post.author_id == t.id, M.Post.hidden == False)) or 0  # noqa: E712
    locked = t.id != u.id and bool(rows) and not vis
    return {"user": {**creator_json(t, followers), "following": following, "posts": total, "followState": "self" if t.id == u.id else _follow_state(db, u, t)},
            "items": posts_json(db, vis, u), "locked": locked, "nextCursor": cursor + PAGE if more else None}

@router.get("/search")
def search(q: str = Query(..., min_length=1, max_length=60), u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    """Glow Seek: people (name/handle/city/bio) and Drops (caption/mood/interest/place/tags) the caller may see."""
    from .serial import creator_json
    like = f"%{q.strip().lower()}%"; hide = blocked_ids(db, u)
    users = db.scalars(select(M.User).where(M.User.suspended == False, M.User.id != u.id,  # noqa: E712
        func.lower(M.User.name).like(like) | func.lower(M.User.handle).like(like) | func.lower(func.coalesce(M.User.city, "")).like(like) | func.lower(func.coalesce(M.User.bio, "")).like(like)).limit(20)).all()
    users = [x for x in users if x.id not in hide]
    fol = dict(db.execute(select(M.Edge.target, func.count()).where(M.Edge.kind == "follow", M.Edge.target.in_([x.id for x in users])).group_by(M.Edge.target)).all()) if users else {}
    posts = db.scalars(select(M.Post).where(M.Post.hidden == False, M.Post.author_id.not_in(hide or {""}),  # noqa: E712
        func.lower(M.Post.text).like(like) | func.lower(M.Post.mood).like(like) | func.lower(M.Post.interest).like(like) | func.lower(func.coalesce(M.Post.place, "")).like(like)).order_by(M.Post.at.desc()).limit(40)).all()
    posts = [p for p in posts if can_see(db, p, u)][:20]
    return {"q": q, "people": [{**creator_json(x, fol.get(x.id, 0)), "followState": _follow_state(db, u, x)} for x in users], "posts": posts_json(db, posts, u)}
