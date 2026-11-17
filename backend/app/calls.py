"""v6 1:1 voice/video calls: WebRTC signaling relayed over /ws, call log, ICE servers (STUN + TURN REST credentials)."""
import base64, hashlib, hmac, re, time
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, or_
from sqlalchemy.orm import Session
from .db import get_db
from . import models as M
from .security import current_user, require
from .v2common import are_friends, blocked_between, prof, user_json

router = APIRouter()
RING_TIMEOUT_MS = 60_000
CALL_ID = re.compile(r"^[\w-]{3,40}$")

def can_call(db: Session, a: M.User, b: M.User) -> bool:
    if a.id == b.id or b.suspended or blocked_between(db, a.id, b.id): return False
    who = (((b.settings or {}).get("hush") or {}).get("whoCanCall")) or "friends"  # Hush Control Room
    if who == "nobody": return False
    if are_friends(db, a.id, b.id): return True
    if who != "everyone": return False
    if prof(b)["who_can_message"] != "everyone": return False
    for c in db.scalars(select(M.Conv).where(M.Conv.group == False, M.has_member(M.Conv.members, a.id), M.has_member(M.Conv.members, b.id))):  # noqa: E712
        if sorted(c.members) == sorted([a.id, b.id]) and not any((s or {}).get("request") for s in (c.state or {}).values()): return True
    return False

def settle(db: Session, c: M.Call) -> M.Call:
    if c.status == "ringing" and M.now_ms() - c.started_at > RING_TIMEOUT_MS: missed(db, c)
    return c

def missed(db: Session, c: M.Call):
    from .v2common import chat_notice
    c.status, c.ended_at = "missed", M.now_ms()
    caller = db.get(M.User, c.caller_id)
    chat_notice(db, c.callee_id, "call", f"Missed {'video' if c.media == 'video' else 'voice'} call from {caller.name if caller else 'someone'}", "", "Calls", {"callId": c.id})

def handle(db: Session, u: M.User, t: str, msg: dict) -> dict | None:
    from .realtime import feature, publish, err, hub
    if not feature(db, u, "calls"): return err("disabled", "Not enabled", t)
    if t == "call.invite":
        to = db.get(M.User, str(msg.get("to", ""))[:40]); media = msg.get("media")
        if media not in ("audio", "video"): return err("bad_request", "media must be audio or video", t)
        from .user_app import setting as ua_setting
        if media not in ua_setting(db, "defaults.hush.callTypes", u): return err("disabled", f"{media.capitalize()} calls are turned off", t)
        if not to or not can_call(db, u, to): return err("call_not_allowed", "You can't call this person", t)
        cid = str(msg.get("callId") or M.nid("call"))
        if not CALL_ID.match(cid) or db.get(M.Call, cid): return err("bad_request", "callId invalid or in use", t)
        sdp = msg.get("sdp")
        if not isinstance(sdp, (str, dict)): return err("bad_request", "sdp required", t)
        c = M.Call(id=cid, caller_id=u.id, callee_id=to.id, media=media); db.add(c); db.commit()
        publish([to.id], {"type": "call.invite", "callId": cid, "from": user_json(u), "media": media, "sdp": sdp})
        if not hub.online(to.id):
            from . import push
            push.queue(to.id, "call_invite", f"{u.name} is calling", "Incoming video call" if media == "video" else "Incoming voice call", {"kind": "call_invite", "callId": cid, "route": "Call"})
        return {"type": "call.ringing", "callId": cid}
    c = db.get(M.Call, str(msg.get("callId", ""))[:40])
    if not c or u.id not in (c.caller_id, c.callee_id): return err("not_found", "Call not found", t)
    settle(db, c)
    peer = c.callee_id if u.id == c.caller_id else c.caller_id
    if t == "call.ice":
        publish([peer], {"type": "call.ice", "callId": c.id, "candidate": msg.get("candidate")}); db.commit(); return None
    if t == "call.answer":
        if u.id != c.callee_id or c.status != "ringing": return err("bad_state", f"Call is {c.status}", t)
        c.status, c.answered_at = "answered", M.now_ms(); db.commit()
        publish([peer, u.id], {"type": "call.answer", "callId": c.id, "sdp": msg.get("sdp"), "by": u.id}); return None
    if t == "call.reject":
        if u.id != c.callee_id or c.status != "ringing": return err("bad_state", f"Call is {c.status}", t)
        c.status, c.ended_at = "rejected", M.now_ms(); db.commit()
        publish([peer, u.id], {"type": "call.reject", "callId": c.id, "by": u.id, "status": c.status}); return None
    if t == "call.end":
        if c.status == "ringing": missed(db, c)
        elif c.status == "answered": c.status, c.ended_at = "ended", M.now_ms()
        db.commit()
        publish([peer, u.id], {"type": "call.end", "callId": c.id, "by": u.id, "status": c.status}); return None
    return err("unknown", f"Unknown frame type {t}", t)

def call_json(c: M.Call, me: M.User, users: dict) -> dict:
    out = c.caller_id == me.id; p = users.get(c.callee_id if out else c.caller_id)
    return {"id": c.id, "peer": user_json(p) if p else None, "direction": "out" if out else "in", "media": c.media, "status": c.status,
            "startedAt": c.started_at, "answeredAt": c.answered_at, "endedAt": c.ended_at}

@router.get("/calls")
def my_calls(limit: int = Query(50, ge=1, le=100), u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    from .realtime import feature
    if not feature(db, u, "calls"): raise HTTPException(403, "Not enabled")
    rows = db.scalars(select(M.Call).where(or_(M.Call.caller_id == u.id, M.Call.callee_id == u.id)).order_by(M.Call.started_at.desc()).limit(limit)).all()
    for c in rows: settle(db, c)
    db.commit()
    users = {x.id: x for x in db.scalars(select(M.User).where(M.User.id.in_({c.caller_id for c in rows} | {c.callee_id for c in rows})))} if rows else {}
    return [call_json(c, u, users) for c in rows]

def ice_servers(db: Session, u: M.User) -> dict:
    from . import config_resolver as R
    from .routes_integrations import get_config
    out = list(R.resolve(db, u).get("rtc", {}).get("iceServers", []))
    cfg = get_config(db, "turn"); ttl = None
    if cfg:
        urls = [x.strip() for x in (cfg.get("urls") or "").split(",") if x.strip()]
        if cfg.get("sharedSecret"):
            ttl = 3600; name = f"{int(time.time()) + ttl}:{u.id}"
            cred = base64.b64encode(hmac.new(cfg["sharedSecret"].encode(), name.encode(), hashlib.sha1).digest()).decode()
            out.append({"urls": urls, "username": name, "credential": cred})
        elif cfg.get("credential"): out.append({"urls": urls, "username": cfg.get("username") or "", "credential": cfg["credential"]})
    return {"iceServers": out, "ttl": ttl}

@router.get("/rtc/ice")
def rtc_ice(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    from .realtime import feature
    if not feature(db, u, "calls"): raise HTTPException(403, "Not enabled")
    return ice_servers(db, u)

@router.get("/admin/calls")
def admin_calls(status: str | None = Query(None, max_length=10), media: str | None = Query(None, max_length=8), q: str | None = Query(None, max_length=60),
                limit: int = Query(100, ge=1, le=200), a: M.User = Depends(require("owner")), db: Session = Depends(get_db)):
    s = select(M.Call)
    if status: s = s.where(M.Call.status == status)
    if media: s = s.where(M.Call.media == media)
    if q:
        ids = list(db.scalars(select(M.User.id).where(or_(M.User.handle.ilike(f"%{q.strip().lstrip('@')}%"), M.User.name.ilike(f"%{q.strip()}%"))).limit(50)))
        s = s.where(or_(M.Call.caller_id.in_(ids), M.Call.callee_id.in_(ids)))
    rows = db.scalars(s.order_by(M.Call.started_at.desc()).limit(limit)).all()
    users = {x.id: x for x in db.scalars(select(M.User).where(M.User.id.in_({c.caller_id for c in rows} | {c.callee_id for c in rows})))} if rows else {}
    mini = lambda i: {"id": i, "handle": users[i].handle, "name": users[i].name} if i in users else {"id": i}
    return [{"id": c.id, "caller": mini(c.caller_id), "callee": mini(c.callee_id), "media": c.media, "status": c.status,
             "startedAt": c.started_at, "answeredAt": c.answered_at, "endedAt": c.ended_at} for c in rows]
