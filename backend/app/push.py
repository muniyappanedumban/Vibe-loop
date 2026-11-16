"""v6 push: device tokens + Expo Push API sends in a background worker (never on the request path).
FCM tokens are stored but not sent to yet (logged as "skipped"). Every attempt is recorded in push_sends."""
import logging, time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func, delete
from sqlalchemy.orm import Session
from .db import get_db, SessionLocal
from . import models as M
from .security import current_user, require, audit

log = logging.getLogger("vibeloop")
router = APIRouter()
EXPO_URL = "https://exp.host/--/api/v2/push/send"
POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="vl-push")
SYNC = False  # tests: run sends inline
PUSH_KINDS = {"message", "mention", "friend", "follow_request", "call", "call_invite", "test"}

def _submit(fn, *a):
    if SYNC: fn(*a)
    else: POOL.submit(fn, *a)

def in_quiet_hours(settings: dict, now: datetime | None = None) -> bool:
    q = (settings or {}).get("quietHours") or {}
    if not q.get("on"): return False
    try: start, end, off = int(q.get("from", 22)) % 24, int(q.get("to", 7)) % 24, int(q.get("tzOffsetMin", 330))
    except (TypeError, ValueError): return False
    h = ((now or datetime.now(timezone.utc)) + timedelta(minutes=off)).hour
    return (start <= h < end) if start < end else (h >= start or h < end)

def queue_notice(uid: str, n: dict):
    """Called after commit for every new Notice — decides in the worker whether it becomes a push."""
    if n.get("kind") in PUSH_KINDS: _submit(_send_notice, uid, n)

def queue(uid: str, kind: str, title: str, body: str, data: dict | None = None, force: bool = False): _submit(_send, uid, kind, title, body, data or {}, force)

def _send_notice(uid: str, n: dict):
    _send(uid, n["kind"], n["title"], n.get("body") or "", {"route": n.get("route"), "params": n.get("params"), "kind": n["kind"], "noticeId": n.get("id")}, False, n.get("module"))

def _send(uid: str, kind: str, title: str, body: str, data: dict, force: bool = False, module: str | None = None):
    db = SessionLocal()
    try:
        toks = db.scalars(select(M.PushToken).where(M.PushToken.user_id == uid)).all()
        if not toks: return
        u = db.get(M.User, uid)
        if not u or u.suspended: return
        if not force:
            from .realtime import feature
            from .v2common import prof
            if not feature(db, u, "push"): return
            if module == "social" and prof(u)["focus_social_muted"]: return  # Focus Switch
            if in_quiet_hours(u.settings or {}): return
        expo = [t for t in toks if t.provider == "expo"]
        for t in toks:
            if t.provider != "expo": db.add(M.PushSend(user_id=uid, kind=kind, provider=t.provider, status="skipped", error="FCM sending not configured — use Expo tokens"))
        if expo:
            from .routes_integrations import get_config
            cfg = get_config(db, "expo") or {}
            hdr = {"Accept": "application/json", "Content-Type": "application/json"}
            if cfg.get("accessToken"): hdr["Authorization"] = f"Bearer {cfg['accessToken']}"
            msgs = [{"to": t.token, "title": title[:100], "body": body[:180], "data": data, "sound": "default"} for t in expo]
            try:
                r = httpx.post(EXPO_URL, json=msgs, headers=hdr, timeout=10)
                tickets = (r.json() or {}).get("data") if r.status_code == 200 else None
                if not isinstance(tickets, list): tickets = [{"status": "error", "message": f"HTTP {r.status_code}"}] * len(expo)
            except (httpx.HTTPError, ValueError) as e: tickets = [{"status": "error", "message": f"Expo unreachable ({type(e).__name__})"}] * len(expo)
            for t, tk in zip(expo, tickets):
                ok = isinstance(tk, dict) and tk.get("status") == "ok"
                errc = "" if ok else str((tk.get("details") or {}).get("error") or tk.get("message") or "error")[:300]
                db.add(M.PushSend(user_id=uid, kind=kind, provider="expo", status="sent" if ok else "failed", error=errc))
                if errc == "DeviceNotRegistered": db.execute(delete(M.PushToken).where(M.PushToken.token == t.token))
        db.commit()
    except Exception as e:
        log.warning("push send failed (%s)", type(e).__name__); db.rollback()
    finally: db.close()

class TokenIn(BaseModel):
    token: str = Field(min_length=8, max_length=300); platform: str = Field(pattern=r"^(ios|android|web)$"); provider: str = Field(default="expo", pattern=r"^(expo|fcm)$")
@router.post("/push/token")
def add_token(b: TokenIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    from .realtime import feature
    if not feature(db, u, "push"): raise HTTPException(403, "Not enabled")
    if b.provider == "expo" and not (b.token.startswith("ExponentPushToken[") or b.token.startswith("ExpoPushToken[")): raise HTTPException(400, "Expo tokens look like ExponentPushToken[…]")
    t = db.get(M.PushToken, b.token)
    if t: t.user_id, t.platform, t.provider, t.at = u.id, b.platform, b.provider, M.now_ms()  # a device moves to the account signed in now
    else:
        if db.scalar(select(func.count()).select_from(M.PushToken).where(M.PushToken.user_id == u.id)) >= 10: raise HTTPException(409, "Too many devices (10)")
        db.add(M.PushToken(token=b.token, user_id=u.id, platform=b.platform, provider=b.provider))
    db.commit(); return {"ok": True}

class TokenDel(BaseModel): token: str = Field(min_length=1, max_length=300)
@router.delete("/push/token")
def del_token(b: TokenDel, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    db.execute(delete(M.PushToken).where(M.PushToken.token == b.token, M.PushToken.user_id == u.id)); db.commit(); return {"ok": True}

STAFF = require("owner")
@router.get("/admin/push/stats")
def push_stats(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    g = lambda col: dict(db.execute(select(col, func.count()).group_by(col)).all())
    since = M.now_ms() - 86_400_000
    last = dict(db.execute(select(M.PushSend.status, func.count()).where(M.PushSend.at > since).group_by(M.PushSend.status)).all())
    recent = db.scalars(select(M.PushSend).order_by(M.PushSend.id.desc()).limit(30)).all()
    users = {x.id: x for x in db.scalars(select(M.User).where(M.User.id.in_({r.user_id for r in recent})))} if recent else {}
    return {"tokens": {"total": db.scalar(select(func.count()).select_from(M.PushToken)) or 0, "byPlatform": g(M.PushToken.platform), "byProvider": g(M.PushToken.provider)},
            "last24h": {"sent": last.get("sent", 0), "failed": last.get("failed", 0), "skipped": last.get("skipped", 0)},
            "recent": [{"id": r.id, "userId": r.user_id, "handle": users[r.user_id].handle if r.user_id in users else None, "kind": r.kind, "ok": r.status == "sent",
                        "status": r.status, "error": r.error, "at": r.at} for r in recent]}

class TestIn(BaseModel): userId: str = Field(min_length=1, max_length=60)
@router.post("/admin/push/test")
def push_test(b: TestIn, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    u = db.get(M.User, b.userId)
    if not u:
        from .v2common import find_by_handle
        u = find_by_handle(db, b.userId)
    if not u: raise HTTPException(404, "Unknown user")
    n = db.scalar(select(func.count()).select_from(M.PushToken).where(M.PushToken.user_id == u.id)) or 0
    audit(db, a.handle, "push.test", u.id); db.commit()
    if n: queue(u.id, "test", "VibeLoop test", "Push works on this device", {"kind": "test"}, force=True)
    return {"queued": bool(n), "tokens": n, "message": f"Queued to {n} device(s) — check Push Center for the result" if n else "That user has no push tokens yet"}
