"""Serialize DB rows into the exact shapes the mobile app's stores use (mobile/src/store/types.ts & useSocial.ts)."""
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from . import models as M
from .score import loop_score

def loop_json(db: Session, l: M.Loop) -> dict:
    rs = db.scalars(select(M.Reaction).where(M.Reaction.loop_id == l.id).order_by(M.Reaction.at)).all()
    return {"id": l.id, "title": l.title, "template": l.template, "sizeLimit": l.size_limit, "minScore": l.min_score, "windowHours": l.window_hours,
            "members": l.members, "drafts": l.drafts, "status": l.status, "openedAt": l.opened_at, "invite": l.invite, "notes": l.notes,
            "silent": l.silent, "paidOnly": l.paid_only, "dna": l.dna, "failReason": l.fail_reason, "demo": l.demo, "score": loop_score(l, rs),
            "reactions": [{"id": r.id, "memberId": r.member_id, "version": r.version, "kind": r.kind, "text": r.text, "at": r.at, "anonymous": r.anonymous} for r in rs]}

def me_id(uid: str, me: M.User) -> str: return "me" if uid == me.id else uid

POST_COMMENTS_INLINE = 50  # comments embedded per post; the full list is paged via GET /posts/{id}/comments

def post_json(db: Session, p: M.Post, me: M.User, pre: dict | None = None) -> dict:
    """pre = output of preload_posts() for batch serialization (feed/bootstrap); None → per-post queries."""
    if pre is None: pre = preload_posts(db, [p])
    counts = dict(p.seed_reactions or {})
    for k, n in pre["reacts"].get(p.id, {}).items(): counts[k] = counts.get(k, 0) + n
    cms = pre["comments"].get(p.id, [])
    return {"id": p.id, "by": me_id(p.author_id, me), "kind": p.kind, "text": p.text, "hue": p.hue, "mood": p.mood, "interest": p.interest, "place": p.place,
            "bg": p.bg, "slides": p.slides, "at": p.at, "shares": p.shares, "views": p.views, "mine": p.author_id == me.id,
            "reactions": {**{k: counts.get(k, 0) for k in ["heart", "fire", "laugh", "touch", "clap", "boom"]}, **{k: n for k, n in counts.items() if k.startswith("m") and n >= 1}},
            "comments": [{"by": me_id(c.by, me), "text": c.text} for c in cms],
            "mediaUrl": p.media_url, "lens": p.lens, "lat": p.lat, "lng": p.lng, "tags": p.tags or [], "collab": p.collab, "sound": p.sound, "audience": p.audience,
            "mediaKind": p.media_kind, "edit": p.edit, "pinned": bool(p.pinned_at), "commentCount": pre["ccount"].get(p.id, 0),
            "poll": ({"q": p.poll["q"], "options": [{"text": o["text"], "votes": o["votes"]} for o in p.poll["options"]], "myVote": (p.poll.get("voters") or {}).get(me.id)} if p.poll else None)}

def preload_posts(db: Session, posts: list) -> dict:
    """3 queries for any number of posts (reaction counts, inline comments via window function, comment totals) — no N+1."""
    ids = [p.id for p in posts]
    out = {"reacts": {}, "comments": {}, "ccount": {}}
    if not ids: return out
    for pid, k, n in db.execute(select(M.PostReaction.post_id, M.PostReaction.key, func.count()).where(M.PostReaction.post_id.in_(ids)).group_by(M.PostReaction.post_id, M.PostReaction.key)):
        out["reacts"].setdefault(pid, {})[k] = n
    vis = (M.Comment.post_id.in_(ids), M.Comment.held == False)  # noqa: E712
    rn = func.row_number().over(partition_by=M.Comment.post_id, order_by=(M.Comment.at, M.Comment.id)).label("rn")
    sub = select(M.Comment.id, rn).where(*vis).subquery()
    for c in db.scalars(select(M.Comment).join(sub, sub.c.id == M.Comment.id).where(sub.c.rn <= POST_COMMENTS_INLINE).order_by(M.Comment.post_id, M.Comment.at, M.Comment.id)):
        out["comments"].setdefault(c.post_id, []).append(c)
    out["ccount"] = dict(db.execute(select(M.Comment.post_id, func.count()).where(*vis).group_by(M.Comment.post_id)).all())
    return out

def posts_json(db: Session, posts: list, me: M.User) -> list[dict]:
    pre = preload_posts(db, posts); return [post_json(db, p, me, pre) for p in posts]

def creator_json(u: M.User, followers: int) -> dict:
    from .v2common import avatar_for, last_seen_for, mood_drop
    return {"id": u.id, "name": u.name, "handle": u.handle, "hue": u.hue, "city": u.city, "badge": u.badge, "bio": u.bio, "followers": followers,
            "avatar": avatar_for(u, "social"), "lastSeen": last_seen_for(u), "moodDrop": mood_drop(u), "pronouns": u.pronouns or "", "cover": u.cover}

def chat_json(db: Session, c: M.Chat, me: M.User) -> dict:
    st = (c.state or {}).get(me.id, {})
    msgs = list(reversed(db.scalars(select(M.Message).where(M.Message.chat_id == c.id).order_by(M.Message.at.desc()).limit(100)).all()))  # newest 100
    return {"id": c.id, "title": c.title, "group": c.group, "members": [m for m in c.members if m != me.id], "pinned": st.get("pinned", False), "muted": st.get("muted", False),
            "request": st.get("request", False), "msgs": [{"id": m.id, "from": me_id(m.sender, me), "text": m.text, "at": m.at, "react": m.react} for m in msgs]}

def user_admin_json(u: M.User) -> dict:
    return {"id": u.id, "email": u.email, "handle": u.handle, "name": u.name, "role": u.role, "suspended": u.suspended, "mfaRequired": u.mfa_required, "twoFactor": bool(u.totp_secret), "createdAt": u.created_at,
            "avatar": u.avatar_social or u.avatar_chat, "lastSeenAt": u.last_seen_at}
