"""v4 profiles ("Two Faces"): per-module avatars, cover, state, pronouns, links, last-seen privacy, Mood Drop + staff member detail."""
import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .db import get_db
from . import models as M
from .security import current_user, require
from .v2common import mood_drop, prof
from .serial import user_admin_json

router = APIRouter()
URL_RE = re.compile(r"^https?://[^\s<>\"']{3,200}$")

def own_image(db: Session, u: M.User, url: str | None) -> str | None:
    if url is None or url == "": return None
    if not re.match(r"^/media/[A-Za-z0-9]+\.[a-z0-9]+$", url): raise HTTPException(400, "Avatar and cover must be your own uploaded /media image")
    mf = db.get(M.MediaFile, url.split("/")[-1].split(".")[0])
    if not mf or mf.owner_id != u.id or mf.kind != "image": raise HTTPException(400, "Avatar and cover must be your own uploaded /media image")
    mf.public = True  # avatars/covers are shown to everyone
    return url

def apply_v4_profile(db: Session, u: M.User, d: dict):
    """Pops the v4 column fields out of a PATCH /me/profile body and applies them."""
    for k in ("avatar_social", "avatar_chat", "cover"):
        if k in d: setattr(u, k, own_image(db, u, d.pop(k)))
    if "state" in d: u.state = (d.pop("state") or "").upper()
    if "pronouns" in d: u.pronouns = (d.pop("pronouns") or "").strip()
    if "links" in d:
        links = [x.strip() for x in (d.pop("links") or []) if x and x.strip()]
        if any(not URL_RE.match(x) for x in links): raise HTTPException(400, "Links must be http(s) URLs")
        u.links = links[:3]
    if "last_seen_visible" in d:
        v = d.pop("last_seen_visible")
        if v is not None: u.last_seen_visible = bool(v)

class MoodIn(BaseModel): moji: int = Field(ge=0, le=10000); text: str | None = Field(default=None, max_length=80)
@router.put("/me/mood")
def put_mood(b: MoodIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    md = {"moji": b.moji, "text": (b.text or "").strip(), "at": M.now_ms()}
    u.profile = {**(u.profile or {}), "moodDrop": md}; db.commit(); return {**md, "expiresAt": md["at"] + 86_400_000}

@router.delete("/me/mood")
def clear_mood(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    p = dict(u.profile or {}); p.pop("moodDrop", None); u.profile = p; db.commit(); return {"ok": True}

# ---------- staff: member detail (staff see last seen regardless of privacy) ----------
@router.get("/admin/users/{uid}")
def admin_user_detail(uid: str, a: M.User = Depends(require("owner")), db: Session = Depends(get_db)):
    u = db.get(M.User, uid)
    if not u: raise HTTPException(404, "Not found")
    c = lambda m, *w: db.scalar(select(func.count()).select_from(m).where(*w))
    p = prof(u)
    return {**user_admin_json(u), "hue": u.hue, "verified": bool(u.verified), "avatarSocial": u.avatar_social, "avatarChat": u.avatar_chat, "cover": u.cover,
            "lastSeenAt": u.last_seen_at, "lastSeenVisible": u.last_seen_visible is not False, "city": u.city, "state": u.state or "", "country": p.get("country"),
            "lang": p.get("lang"), "pronouns": u.pronouns or "", "links": u.links or [], "bio": u.bio, "chatBio": p.get("chat_bio", ""), "moodDrop": mood_drop(u),
            "counts": {"posts": c(M.Post, M.Post.author_id == u.id), "friends": c(M.Friend, M.Friend.user_id == u.id),
                       "followers": c(M.Edge, M.Edge.kind == "follow", M.Edge.target == u.id), "uploads": c(M.MediaFile, M.MediaFile.owner_id == u.id)}}
