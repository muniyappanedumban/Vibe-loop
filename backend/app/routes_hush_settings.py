"""Hush Control Room: per-user Hush (chat) settings that /me/profile doesn't cover, plus blocked list, archive, export, storage.

Stored in User.settings["hush"] (partial-merge); quiet hours live in User.settings["quietHours"] because push.in_quiet_hours reads them there.
"""
import copy
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .db import get_db
from . import models as M
from .security import current_user, audit
from .v2common import user_json

router = APIRouter()
Who = Literal["everyone", "friends", "nobody"]
FADES = (None, 3600, 86400, 604800)
BUBBLES = ("aqua", "ink", "sunset", "night", "lime", "grape")
HUSH_DEFAULTS = {
    "typingVisible": True, "photoVisibility": "everyone", "whoCanCall": "friends", "callDataSaver": False,
    "notif": {"messages": True, "groups": True, "calls": True, "moods": True, "previews": True},
    "defaultFadeSec": None, "bubbleTheme": "aqua", "fontSize": "m", "enterToSend": False,
    "autoDownload": {"wifi": True, "cellular": False}, "chatLock": False,
}
QUIET_DEFAULT = {"on": False, "from": 22, "to": 7, "tzOffsetMin": 330}

def hush_of(u: M.User) -> dict:
    s = (u.settings or {}).get("hush") or {}
    out = copy.deepcopy(HUSH_DEFAULTS)
    for k, v in s.items():
        if k in out: out[k] = {**out[k], **v} if isinstance(out[k], dict) and isinstance(v, dict) else v
    return out

def storage_of(db: Session, u: M.User) -> dict:
    n, b = db.execute(select(func.count(), func.coalesce(func.sum(M.MediaFile.size), 0)).where(M.MediaFile.owner_id == u.id)).one()
    return {"uploads": int(n), "bytes": int(b)}

def payload(db: Session, u: M.User) -> dict:
    return {"settings": hush_of(u), "quietHours": {**QUIET_DEFAULT, **((u.settings or {}).get("quietHours") or {})},
            "storage": storage_of(db, u), "archived": len(archived_convs(db, u)), "blocked": len(blocked_users(db, u))}

class NotifIn(BaseModel):
    messages: bool | None = None; groups: bool | None = None; calls: bool | None = None; moods: bool | None = None; previews: bool | None = None
class AutoDlIn(BaseModel): wifi: bool | None = None; cellular: bool | None = None
class QuietIn(BaseModel):
    on: bool | None = None; from_: int | None = Field(default=None, alias="from", ge=0, le=23); to: int | None = Field(default=None, ge=0, le=23)
    tzOffsetMin: int | None = Field(default=None, ge=-720, le=840)
    model_config = {"populate_by_name": True}
class HushPatch(BaseModel):
    typingVisible: bool | None = None; photoVisibility: Who | None = None; whoCanCall: Who | None = None; callDataSaver: bool | None = None
    notif: NotifIn | None = None; defaultFadeSec: int | None = None; bubbleTheme: str | None = None
    fontSize: Literal["s", "m", "l", "xl"] | None = None; enterToSend: bool | None = None; autoDownload: AutoDlIn | None = None
    chatLock: bool | None = None; quietHours: QuietIn | None = None

@router.get("/me/hush-settings")
def get_hush(u: M.User = Depends(current_user), db: Session = Depends(get_db)): return payload(db, u)

@router.patch("/me/hush-settings")
def patch_hush(b: HushPatch, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    d = b.model_dump(exclude_unset=True, by_alias=True)
    if "defaultFadeSec" in d and d["defaultFadeSec"] not in FADES: raise HTTPException(400, "defaultFadeSec must be null, 3600, 86400 or 604800")
    if d.get("bubbleTheme") is not None and d["bubbleTheme"] not in BUBBLES: raise HTTPException(400, "Unknown bubble theme")
    s = dict(u.settings or {})
    if "quietHours" in d:
        q = {k: v for k, v in (d.pop("quietHours") or {}).items() if v is not None}
        s["quietHours"] = {**QUIET_DEFAULT, **(s.get("quietHours") or {}), **q}
    cur = dict(s.get("hush") or {})
    for k, v in d.items():
        if isinstance(v, dict): cur[k] = {**(cur.get(k) or {}), **{a: x for a, x in v.items() if x is not None}}
        elif v is not None or k == "defaultFadeSec": cur[k] = v
    s["hush"] = cur; u.settings = s
    audit(db, u.handle, "hush.settings", ",".join(sorted(b.model_dump(exclude_unset=True)))); db.commit()
    return payload(db, u)

# ---------- blocked ----------
def blocked_users(db: Session, u: M.User) -> list[M.User]:
    ids = db.scalars(select(M.Edge.target).where(M.Edge.user_id == u.id, M.Edge.kind == "block")).all()
    return db.scalars(select(M.User).where(M.User.id.in_(ids))).all() if ids else []

@router.get("/me/blocked")
def list_blocked(u: M.User = Depends(current_user), db: Session = Depends(get_db)): return [user_json(x) for x in blocked_users(db, u)]

# ---------- archive ----------
def archived_convs(db: Session, u: M.User) -> list[M.Conv]:
    from .routes_chat import my_convs, my_state
    return [c for c in my_convs(db, u) if my_state(c, u.id).get("archived")]

@router.get("/me/hush-archive")
def list_archive(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    from .routes_chat import conv_json
    return [conv_json(db, c, u) for c in archived_convs(db, u)]

class ArchiveIn(BaseModel): archived: bool
@router.post("/conv/{cid}/archive")
def set_archive(cid: str, b: ArchiveIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    from .routes_chat import get_conv, set_state
    c = get_conv(db, cid, u); set_state(c, u.id, archived=b.archived); db.commit(); return {"id": c.id, "archived": b.archived}

# ---------- export ----------
@router.get("/me/hush-export")
def export_all(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    from .routes_chat import my_convs, visible
    now = M.now_ms(); out = []
    for c in my_convs(db, u):
        msgs = db.scalars(select(M.ChatMsg).where(M.ChatMsg.conv_id == c.id).order_by(M.ChatMsg.at).limit(5000)).all()
        names = {x.id: x.handle for x in (db.get(M.User, i) for i in c.members) if x}
        out.append({"id": c.id, "title": c.title, "group": c.group, "members": list(names.values()),
                    "messages": [{"at": m.at, "from": names.get(m.sender, m.sender), "kind": m.kind,
                                  "text": "[encrypted]" if getattr(m, "enc", None) else ("" if m.deleted else m.text)}
                                 for m in msgs if not m.deleted and visible(m, u, now)]})
    audit(db, u.handle, "hush.export", str(len(out))); db.commit()
    return {"exportedAt": now, "handle": u.handle, "conversations": out}

# ---------- push test (to my own devices) ----------
@router.post("/me/push-test")
def push_test(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    from .realtime import feature
    from . import push
    if not feature(db, u, "push"): raise HTTPException(403, "Not enabled")
    n = db.scalar(select(func.count()).select_from(M.PushToken).where(M.PushToken.user_id == u.id)) or 0
    if n: push.queue(u.id, "test", "Hush test ping", "Push works on this device ✨", force=True)
    return {"devices": int(n), "sent": bool(n)}
