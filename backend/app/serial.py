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

def post_json(db: Session, p: M.Post, me: M.User) -> dict:
    counts = dict(p.seed_reactions or {})
    for k, n in db.execute(select(M.PostReaction.key, func.count()).where(M.PostReaction.post_id == p.id).group_by(M.PostReaction.key)):
        counts[k] = counts.get(k, 0) + n
    cms = db.scalars(select(M.Comment).where(M.Comment.post_id == p.id, M.Comment.held == False).order_by(M.Comment.at)).all()  # noqa: E712
    return {"id": p.id, "by": me_id(p.author_id, me), "kind": p.kind, "text": p.text, "hue": p.hue, "mood": p.mood, "interest": p.interest, "place": p.place,
            "bg": p.bg, "slides": p.slides, "at": p.at, "shares": p.shares, "views": p.views, "mine": p.author_id == me.id,
            "reactions": {k: counts.get(k, 0) for k in ["heart", "fire", "laugh", "touch", "clap", "boom"]},
            "comments": [{"by": me_id(c.by, me), "text": c.text} for c in cms]}

def creator_json(u: M.User, followers: int) -> dict:
    return {"id": u.id, "name": u.name, "handle": u.handle, "hue": u.hue, "city": u.city, "badge": u.badge, "bio": u.bio, "followers": followers}

def chat_json(db: Session, c: M.Chat, me: M.User) -> dict:
    st = (c.state or {}).get(me.id, {})
    msgs = db.scalars(select(M.Message).where(M.Message.chat_id == c.id).order_by(M.Message.at)).all()
    return {"id": c.id, "title": c.title, "group": c.group, "members": [m for m in c.members if m != me.id], "pinned": st.get("pinned", False), "muted": st.get("muted", False),
            "request": st.get("request", False), "msgs": [{"id": m.id, "from": me_id(m.sender, me), "text": m.text, "at": m.at, "react": m.react} for m in msgs]}

def user_admin_json(u: M.User) -> dict:
    return {"id": u.id, "email": u.email, "handle": u.handle, "name": u.name, "role": u.role, "suspended": u.suspended, "mfaRequired": u.mfa_required, "createdAt": u.created_at}
