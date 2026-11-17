"""Shared helpers for the v2 identity + chat modules."""
import re
from fastapi import HTTPException
from sqlalchemy import select, or_, and_
from sqlalchemy.orm import Session
from . import models as M

HANDLE_RE = re.compile(r"^[a-z0-9._]{3,20}$")
RESERVED = {"admin", "support", "vibeloop", "staff", "root", "help", "security", "official", "mod", "moderator"}
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[a-z]{2,24}$")
MAX_ACCOUNTS_PER_EMAIL = 5
DAY = 86_400_000
PROFILE_DEFAULTS = {"chat_bio": "", "hidden": False, "who_can_message": "everyone", "ghost_hours": False, "focus_social_muted": False,
                    "social_private": False, "chat_read_receipts": True, "mood": None, "country": None, "lang": None}

def bare_handle(raw: str) -> str: return (raw or "").strip().lstrip("@").lower()

def stored_handle(raw: str) -> str: return "@" + bare_handle(raw)

def handle_problem(db: Session, raw: str, for_user: M.User | None = None) -> tuple[int, str] | None:
    """Validate a handle for registration/change. Returns (status, message) or None if OK."""
    h = bare_handle(raw)
    if not HANDLE_RE.match(h): return 400, "@ID must be 3–20 characters: a–z, 0–9, dot or underscore"
    kv = db.get(M.KV, ("reserved", h))
    if h in RESERVED or (kv and (kv.value or {}).get("on", True)): return 409, "That @ID is reserved"
    if db.scalar(select(M.User.id).where(M.User.handle == "@" + h)): return 409, "That @ID is taken"
    held = db.scalar(select(M.HandleChange).where(M.HandleChange.old == "@" + h, M.HandleChange.at > M.now_ms() - 30 * DAY))
    if held and (not for_user or held.user_id != for_user.id): return 409, "That @ID was recently released and is reserved for 30 days"
    return None

def find_by_handle(db: Session, raw: str) -> M.User | None:
    h = bare_handle(raw)
    if not HANDLE_RE.match(h): return None
    return db.scalar(select(M.User).where(M.User.handle == "@" + h))

def mask_email(e: str) -> str:
    local, _, dom = (e or "").partition("@")
    return f"{local[:1]}***@{dom}" if dom else "***"

def mask_ip(ip: str) -> str:
    if ":" in (ip or ""): return ip.split(":")[0] + ":***"
    parts = (ip or "").split(".")
    return ".".join(parts[:2] + ["*", "*"]) if len(parts) == 4 else "***"

def prof(u: M.User) -> dict: return {**PROFILE_DEFAULTS, **(u.profile or {})}

# v4: per-request viewer context (set by RequestContextMiddleware) → module-appropriate avatar + reciprocal last-seen
from contextvars import ContextVar
VIEWER: ContextVar[dict | None] = ContextVar("vl_viewer", default=None)  # {"id", "lsv"} of the signed-in caller
MODULE: ContextVar[str] = ContextVar("vl_module", default="social")

def avatar_for(u: M.User, module: str | None = None) -> str | None:
    m = module or MODULE.get()
    return (u.avatar_chat or u.avatar_social) if m == "chat" else (u.avatar_social or u.avatar_chat)

def last_seen_for(u: M.User) -> int | None:
    """Null when that user hides it — and if the viewer hides theirs, they can't see anyone's (reciprocal)."""
    v = VIEWER.get()
    if not v: return None
    if v["id"] == u.id: return u.last_seen_at
    return u.last_seen_at if (u.last_seen_visible is not False and v.get("lsv", True)) else None

def mood_drop(u: M.User) -> dict | None:
    md = (u.profile or {}).get("moodDrop")
    return md if md and md.get("at", 0) > M.now_ms() - DAY else None

def photo_visible(u: M.User) -> bool:
    """Hush photoVisibility: may the current viewer see u's chat photo?"""
    w = (((u.settings or {}).get("hush") or {}).get("photoVisibility")) or "everyone"
    if w == "everyone": return True
    v = VIEWER.get()
    if v and v["id"] == u.id: return True
    if w == "nobody" or not v: return False
    from sqlalchemy.orm import object_session
    db = object_session(u)
    return bool(db) and are_friends(db, u.id, v["id"])

def user_json(u: M.User) -> dict:
    p = prof(u)
    if u.avatar_chat and not photo_visible(u):
        return {"id": u.id, "handle": u.handle, "name": u.name, "hue": u.hue, "bio": p["chat_bio"], "verified": bool(u.verified), "mood": p["mood"],
                "avatar": u.avatar_social if MODULE.get() != "chat" else None, "lastSeen": last_seen_for(u), "moodDrop": mood_drop(u)}
    return {"id": u.id, "handle": u.handle, "name": u.name, "hue": u.hue, "bio": p["chat_bio"], "verified": bool(u.verified), "mood": p["mood"],
            "avatar": avatar_for(u), "lastSeen": last_seen_for(u), "moodDrop": mood_drop(u)}

def are_friends(db: Session, a: str, b: str) -> bool: return db.get(M.Friend, (a, b)) is not None

def blocked_between(db: Session, a: str, b: str) -> bool:
    return db.scalar(select(M.Edge).where(M.Edge.kind == "block", or_(and_(M.Edge.user_id == a, M.Edge.target == b), and_(M.Edge.user_id == b, M.Edge.target == a)))) is not None

def can_message(db: Session, me: M.User, target: M.User):
    """Raise 403 if `me` may not start a conversation / friend request with `target`."""
    if blocked_between(db, me.id, target.id): raise HTTPException(403, "You can't message this person")
    w = prof(target)["who_can_message"]
    if w == "nobody": raise HTTPException(403, "This person isn't accepting messages")

def chat_notice(db: Session, user_id: str, kind: str, title: str, body: str = "", route: str | None = None, params: dict | None = None):
    db.add(M.Notice(user_id=user_id, kind=kind, title=title[:200], body=body[:500], route=route, params=params, module="chat"))

def kill_on(db: Session, key: str) -> bool:
    f = db.get(M.KV, ("kill", key)); return bool(f and (f.value or {}).get("on"))

LENS_KEYS = set("none,warm,cool,noir,neon,vintage,festival,city,mood,sparkle,chai,mint,dusk,blush,arctic,matcha,velvet,sunburst,citrus,ocean,lilac,ember,slate,peach,volt,cocoa,aurora,rosegold,midnight,polaroid,film,cinema,grid,vignette,glitch,heartframe".split(","))
