"""v6: E2EE key directory, Blink (spark) viewers + replies, follow requests for private profiles, admin E2EE stats."""
import base64
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func, delete
from sqlalchemy.orm import Session
from .db import get_db
from . import models as M
from .security import current_user, require
from .v2common import user_json, blocked_between, prof, chat_notice
from .realtime import feature

router = APIRouter()
MAX_DEVICES = 5

def need(db: Session, u: M.User, flag: str):
    if not feature(db, u, flag): raise HTTPException(403, "Not enabled")

# ---------- E2EE key directory ----------
class KeyIn(BaseModel):
    publicKey: str = Field(min_length=44, max_length=44); deviceId: str = Field(pattern=r"^[\w-]{1,64}$")
@router.put("/keys")
def put_key(b: KeyIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "e2ee")
    try: raw = base64.b64decode(b.publicKey, validate=True)
    except Exception: raise HTTPException(400, "publicKey must be base64")
    if len(raw) != 32: raise HTTPException(400, "publicKey must be 32 bytes (X25519)")
    k = db.get(M.DeviceKey, (u.id, b.deviceId))
    if k: k.public_key, k.at = b.publicKey, M.now_ms()
    else:
        if db.scalar(select(func.count()).select_from(M.DeviceKey).where(M.DeviceKey.user_id == u.id)) >= MAX_DEVICES: raise HTTPException(409, f"At most {MAX_DEVICES} devices — remove one first")
        db.add(M.DeviceKey(user_id=u.id, device_id=b.deviceId, public_key=b.publicKey))
    db.commit(); return {"ok": True, "deviceId": b.deviceId}

@router.delete("/keys/{device_id}")
def del_key(device_id: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    db.execute(delete(M.DeviceKey).where(M.DeviceKey.user_id == u.id, M.DeviceKey.device_id == device_id[:64])); db.commit(); return {"ok": True}

@router.get("/users/{uid}/keys")
def get_keys(uid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "e2ee")
    t = db.get(M.User, uid[:40])
    if not t or t.suspended or (t.id != u.id and blocked_between(db, u.id, t.id)): raise HTTPException(404, "Unknown user")
    return [{"deviceId": k.device_id, "publicKey": k.public_key, "at": k.at} for k in db.scalars(select(M.DeviceKey).where(M.DeviceKey.user_id == t.id).order_by(M.DeviceKey.at.desc()))]

@router.get("/admin/e2ee")
def admin_e2ee(a: M.User = Depends(require("owner")), db: Session = Depends(get_db)):
    users = db.scalar(select(func.count(func.distinct(M.DeviceKey.user_id)))) or 0
    keyed = set(db.scalars(select(M.DeviceKey.user_id).distinct()))
    convs = sum(1 for c in db.scalars(select(M.Conv).where(M.Conv.group == False)) if len(c.members) == 2 and set(c.members) <= keyed)  # noqa: E712
    return {"usersWithKeys": users, "devices": db.scalar(select(func.count()).select_from(M.DeviceKey)) or 0, "e2eeConvs": convs,
            "encryptedMessages": db.scalar(select(func.count()).select_from(M.ChatMsg).where(M.ChatMsg.enc.is_not(None))) or 0,
            "note": "Staff (and the database) see only ciphertext for encrypted chats: no text, no search, no moderation of content. Metadata — who talked to whom, when, sizes — is still visible. "
                    "Scope today: NaCl box per message to one device key, no forward secrecy yet; Signal-style double ratchet is the future path."}

# ---------- Blink (spark) viewers + replies ----------
def live_spark(db: Session, sid: str, u: M.User) -> M.Spark:
    s = db.get(M.Spark, sid[:40])
    if not s or (s.expires_at or s.at + 86_400_000) <= M.now_ms(): raise HTTPException(404, "Blink not found")
    if s.author_id != u.id:
        if blocked_between(db, s.author_id, u.id): raise HTTPException(404, "Blink not found")
        if s.close and not ((f := db.get(M.Friend, (s.author_id, u.id))) and f.close): raise HTTPException(404, "Blink not found")
    return s

@router.post("/sparks/{sid}/view")
def view_spark(sid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "storyViewers"); s = live_spark(db, sid, u)
    if s.author_id != u.id and not db.get(M.SparkView, (s.id, u.id)): db.add(M.SparkView(spark_id=s.id, viewer_id=u.id)); db.commit()
    return {"ok": True}

@router.get("/sparks/{sid}/viewers")
def spark_viewers(sid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "storyViewers")
    s = db.get(M.Spark, sid[:40])
    if not s or s.author_id != u.id: raise HTTPException(404, "Blink not found")
    rows = db.execute(select(M.SparkView, M.User).join(M.User, M.User.id == M.SparkView.viewer_id).where(M.SparkView.spark_id == s.id).order_by(M.SparkView.at.desc()).limit(500)).all()
    return [{"user": user_json(usr), "viewedAt": v.at} for v, usr in rows]

def view_counts(db: Session, ids: list[str]) -> dict:
    return dict(db.execute(select(M.SparkView.spark_id, func.count()).where(M.SparkView.spark_id.in_(ids)).group_by(M.SparkView.spark_id)).all()) if ids else {}

class AttIn(BaseModel): url: str = Field(pattern=r"^/media/[A-Za-z0-9]+\.[a-z0-9]+$")
class SparkReplyIn(BaseModel): text: str = Field(default="", max_length=1000); attachment: AttIn | None = None
@router.post("/sparks/{sid}/reply")
def reply_spark(sid: str, b: SparkReplyIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    from .routes_chat import open_dm, check_can_send, add_message, msg_json, conv_json, publish_msg, make_snap
    need(db, u, "storyViewers"); s = live_spark(db, sid, u)
    if s.author_id == u.id: raise HTTPException(400, "That's your own Blink")
    text = b.text.strip()
    if not text and not b.attachment: raise HTTPException(400, "Write something or add a snap")
    c = open_dm(db, u, db.get(M.User, s.author_id)); check_can_send(db, c, u)
    ref = {"type": "spark", "id": s.id, "title": s.text[:80], "hue": s.hue}
    if b.attachment:
        need(db, u, "snaps")
        mf = db.get(M.MediaFile, b.attachment.url.split("/")[-1].split(".")[0])
        if not mf or mf.owner_id != u.id: raise HTTPException(400, "Upload the file first")
        m = add_message(db, c, u, "snap", text, ref=ref, attachment=make_snap(db, mf, b.attachment.url), expires_at=M.now_ms() + 86_400_000)
    else: m = add_message(db, c, u, "text", f"Replied to your Blink “{s.text[:60]}”: {text}", ref=ref)
    db.commit(); publish_msg(db, c, m)
    return {"conv": conv_json(db, c, u), "message": msg_json(db, m, u)}

# ---------- follow requests ----------
def is_private(t: M.User) -> bool: return bool(prof(t)["social_private"])

def follow_toggle(db: Session, u: M.User, target: str) -> dict | None:
    """Handles /edges/follow/{id} when the target is private and followRequests is on. None → normal toggle."""
    t = db.get(M.User, target)
    if not t or db.get(M.Edge, (u.id, "follow", target)) or not is_private(t) or not feature(db, u, "followRequests"): return None
    pend = db.scalar(select(M.FollowRequest).where(M.FollowRequest.from_id == u.id, M.FollowRequest.to_id == t.id, M.FollowRequest.status == "pending"))
    if pend: db.delete(pend); db.commit(); return {"on": False, "state": "none"}
    if blocked_between(db, u.id, t.id): raise HTTPException(403, "You can't follow this person")
    r = M.FollowRequest(from_id=u.id, to_id=t.id); db.add(r); db.flush()
    db.add(M.Notice(user_id=t.id, module="social", kind="follow_request", title=f"{u.name} wants to follow you", body=u.handle, route="FollowRequests", params={"requestId": r.id}))
    db.commit(); return {"on": False, "state": "requested"}

@router.get("/follow/requests")
def follow_requests(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "followRequests")
    q = lambda col: db.scalars(select(M.FollowRequest).where(col == u.id, M.FollowRequest.status == "pending").order_by(M.FollowRequest.at.desc()).limit(200)).all()
    inc, out = q(M.FollowRequest.to_id), q(M.FollowRequest.from_id)
    users = {x.id: x for x in db.scalars(select(M.User).where(M.User.id.in_({r.from_id for r in inc} | {r.to_id for r in out})))} if (inc or out) else {}
    return {"incoming": [{"id": r.id, "user": user_json(users[r.from_id]), "at": r.at} for r in inc if r.from_id in users],
            "outgoing": [{"id": r.id, "user": user_json(users[r.to_id]), "at": r.at} for r in out if r.to_id in users]}

@router.post("/follow/requests/{rid}/{action}")
def follow_decide(rid: str, action: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, "followRequests")
    if action not in ("accept", "decline"): raise HTTPException(404, "Unknown action")
    r = db.get(M.FollowRequest, rid[:40])
    if not r or r.to_id != u.id or r.status != "pending": raise HTTPException(404, "Request not found")
    r.status = "accepted" if action == "accept" else "declined"
    if action == "accept":
        if not db.get(M.Edge, (r.from_id, "follow", u.id)): db.add(M.Edge(user_id=r.from_id, kind="follow", target=u.id))
        db.add(M.Notice(user_id=r.from_id, module="social", kind="follow_accepted", title=f"{u.name} accepted your follow request", body=u.handle, route="Profile", params={"id": u.id}))
    db.commit(); return {"ok": True, "status": r.status}

def hidden_private(db: Session, me: M.User) -> set:
    """Private authors whose Drops I may not see (not me, not followed). Empty when followRequests is off."""
    if not feature(db, me, "followRequests"): return set()
    from sqlalchemy import cast
    from sqlalchemy.dialects.postgresql import JSONB
    priv = set(db.scalars(select(M.User.id).where(cast(M.User.profile, JSONB).contains({"social_private": True}))))
    if not priv: return set()
    return priv - set(db.scalars(select(M.Edge.target).where(M.Edge.user_id == me.id, M.Edge.kind == "follow"))) - {me.id}
