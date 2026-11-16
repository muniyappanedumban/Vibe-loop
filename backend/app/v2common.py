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

def user_json(u: M.User) -> dict:
    p = prof(u)
    return {"id": u.id, "handle": u.handle, "name": u.name, "hue": u.hue, "bio": p["chat_bio"], "verified": bool(u.verified), "mood": p["mood"]}

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
