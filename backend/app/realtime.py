"""v6 realtime gateway: WebSocket /ws, in-process connection registry, optional Redis pub/sub fan-out.

publish(user_ids, event) is safe from sync request handlers (threadpool) and from async code: each socket remembers
the event loop it lives on and sends are scheduled there without waiting. With REDIS_URL set, events go through the
Redis channel "vl:rt" and every process delivers to its own sockets (one subscriber thread per process)."""
import asyncio, json, logging, threading, time, uuid
from collections import deque, Counter
import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from starlette.concurrency import run_in_threadpool
from sqlalchemy import event, select
from sqlalchemy.orm import Session
from .config import REDIS_URL
from .db import SessionLocal, get_db
from . import models as M
from .security import decode_access, require

log = logging.getLogger("vibeloop")
router = APIRouter()
NODE = uuid.uuid4().hex[:8]
CHANNEL = "vl:rt"
MAX_FRAME = 64 * 1024
FRAMES_PER_SEC = 30

class Conn:
    __slots__ = ("ws", "loop", "user_id")
    def __init__(self, ws, loop, user_id): self.ws, self.loop, self.user_id = ws, loop, user_id

class Hub:
    def __init__(self):
        self.lock = threading.Lock(); self.conns: dict[str, set[Conn]] = {}
        self.events = deque(maxlen=200_000)  # (ts, type) — honest in-process counters for the admin monitor
        self.redis = None; self.sub_started = False

    def add(self, c: Conn) -> bool:
        with self.lock:
            s = self.conns.setdefault(c.user_id, set()); first = not s; s.add(c); return first
    def remove(self, c: Conn) -> bool:
        with self.lock:
            s = self.conns.get(c.user_id, set()); s.discard(c)
            if not s: self.conns.pop(c.user_id, None); return True
            return False
    def online(self, uid: str) -> bool:
        with self.lock: return bool(self.conns.get(uid))
    def count(self) -> tuple[int, int]:
        with self.lock: return sum(len(s) for s in self.conns.values()), len(self.conns)

    def deliver_local(self, uids, evt: dict):
        with self.lock: targets = [c for u in set(uids) for c in self.conns.get(u, ())]
        self.events.append((time.time(), evt.get("type", "?")))
        for c in targets:
            try:
                coro = c.ws.send_json(evt)
                try: running = asyncio.get_running_loop()
                except RuntimeError: running = None
                if running is c.loop: c.loop.create_task(coro)
                else: asyncio.run_coroutine_threadsafe(coro, c.loop)
            except Exception: pass  # socket going away — its reader loop cleans up

    def publish(self, uids, evt: dict):
        uids = [u for u in set(uids or []) if u]
        if not uids: return
        if REDIS_URL:
            try:
                self._redis().publish(CHANNEL, json.dumps({"to": uids, "evt": evt, "node": NODE})); return
            except Exception as e: log.warning("realtime redis publish failed (%s) — delivering locally", type(e).__name__)
        self.deliver_local(uids, evt)

    def _redis(self):
        if self.redis is None:
            import redis; self.redis = redis.Redis.from_url(REDIS_URL)
        return self.redis

    def start_subscriber(self):
        if not REDIS_URL or self.sub_started: return
        self.sub_started = True
        def run():
            while True:
                try:
                    ps = self._redis().pubsub(); ps.subscribe(CHANNEL)
                    for m in ps.listen():
                        if m.get("type") == "message":
                            d = json.loads(m["data"]); self.deliver_local(d["to"], d["evt"])
                except Exception as e:
                    log.warning("realtime redis subscriber error (%s), retrying", type(e).__name__); time.sleep(2)
        threading.Thread(target=run, daemon=True, name="vl-rt-sub").start()

    def stats(self) -> dict:
        now = time.time(); conns, users = self.count()
        recent = [(t, k) for t, k in list(self.events) if t > now - 3600]
        per = Counter(int((now - t) // 60) for t, _ in recent)
        return {"connections": conns, "users": users, "eventsLastMinute": per.get(0, 0),
                "eventsPerMinute": [{"minute": -i, "count": per.get(i, 0)} for i in range(59, -1, -1)],
                "byType": dict(Counter(k for _, k in recent)), "redis": bool(REDIS_URL), "node": NODE,
                "note": "Counts are for this API process only" + (" (events fan out via Redis)." if REDIS_URL else "; with several processes set REDIS_URL.")}

hub = Hub()
def publish(uids, evt: dict): hub.publish(uids, evt)

# ---------- notices → notice.new (+ push) after commit, for every code path that adds a Notice ----------
@event.listens_for(Session, "pending_to_persistent")
def _track(session, obj):
    if isinstance(obj, M.Notice):
        session.info.setdefault("vl_notices", []).append({"id": obj.id, "user_id": obj.user_id, "module": obj.module or "social", "kind": obj.kind, "title": obj.title,
                                                         "body": obj.body, "at": obj.at, "read": obj.read, "route": obj.route, "params": obj.params})
@event.listens_for(Session, "after_commit")
def _flush_notices(session):
    items = session.info.pop("vl_notices", None)
    if not items: return
    from . import push
    for n in items:
        uid = n.pop("user_id")
        hub.publish([uid], {"type": "notice.new", "notice": n})
        push.queue_notice(uid, n)
@event.listens_for(Session, "after_rollback")
def _drop(session): session.info.pop("vl_notices", None)

# ---------- socket ----------
def feature(db: Session, u: M.User | None, flag: str) -> bool:
    """Resolved per user; cached on the session (one request / one frame) so loops don't re-resolve the config."""
    from . import config_resolver as R
    ck = ("vl_features", u.id if u else None)
    if ck not in db.info: db.info[ck] = R.resolve(db, u)["features"]
    return bool(db.info[ck].get(flag, True))

def _auth(token: str):
    """→ (user_id, ghost, close_code|None)"""
    try: data = decode_access(token or "")
    except jwt.PyJWTError: return None, False, 4401
    db = SessionLocal()
    try:
        u = db.get(M.User, str(data["sub"]))
        if not u or data.get("tv", 0) != (u.token_version or 0): return None, False, 4401
        if u.suspended or not feature(db, u, "realtime"): return None, False, 4403
        from .v2common import prof
        return u.id, bool(prof(u)["ghost_hours"]), None
    finally: db.close()

def presence_targets(uid: str) -> list[str]:
    db = SessionLocal()
    try: return list(db.scalars(select(M.Friend.friend_id).where(M.Friend.user_id == uid)))
    finally: db.close()

def _presence(uid: str, online: bool):
    db = SessionLocal()
    try:
        u = db.get(M.User, uid)
        if not u: return
        if not online: u.last_seen_at = M.now_ms(); db.commit()
        hub.publish(presence_targets(uid), {"type": "presence", "userId": uid, "online": online, "lastSeen": u.last_seen_at if u.last_seen_visible is not False else None})
    finally: db.close()

@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    uid, ghost, code = await run_in_threadpool(_auth, ws.query_params.get("token", ""))
    await ws.accept()
    if code: await ws.close(code=code); return
    hub.start_subscriber()
    c = Conn(ws, asyncio.get_running_loop(), uid)
    first = hub.add(c)
    await ws.send_json({"type": "hello", "userId": uid, "serverTime": M.now_ms()})
    if first and not ghost: await run_in_threadpool(_presence, uid, True)
    window, n, strikes = int(time.time()), 0, 0
    try:
        while True:
            raw = await ws.receive_text()
            if len(raw) > MAX_FRAME: await ws.close(code=1009); break
            sec = int(time.time())
            if sec != window: window, n = sec, 0
            n += 1
            if n > FRAMES_PER_SEC:
                strikes += 1
                if strikes > 5: await ws.close(code=4408); break
                await ws.send_json({"type": "error", "code": "slow_down", "message": "Too many frames"}); continue
            try: msg = json.loads(raw); assert isinstance(msg, dict) and isinstance(msg.get("type"), str)
            except Exception: await ws.send_json({"type": "error", "code": "bad_frame", "message": "Send JSON objects with a type"}); continue
            reply = await run_in_threadpool(handle, uid, msg)
            if reply: await ws.send_json(reply)
    except WebSocketDisconnect: pass
    except RuntimeError: pass
    finally:
        last = hub.remove(c)
        if last and not ghost: await run_in_threadpool(_presence, uid, False)

def err(code: str, message: str, ref: str | None = None) -> dict: return {"type": "error", "code": code, "message": message, "ref": ref}

def handle(uid: str, msg: dict) -> dict | None:
    """One client frame (runs in a worker thread with its own DB session)."""
    t = msg["type"]
    if t == "ping": return {"type": "pong", "at": M.now_ms()}
    db = SessionLocal()
    try:
        u = db.get(M.User, uid)
        if not u or u.suspended: return err("auth", "Session ended", t)
        if t == "typing":
            from .v2common import prof
            if not feature(db, u, "typing"): return err("disabled", "Not enabled", t)
            c = db.get(M.Conv, str(msg.get("convId", ""))[:40])
            if not c or uid not in c.members: return err("not_found", "Conversation not found", t)
            if prof(u)["ghost_hours"]: return None  # ghosts don't broadcast typing
            hub.publish([m for m in c.members if m != uid], {"type": "typing", "convId": c.id, "userId": uid, "on": bool(msg.get("on"))}); return None
        if t in ("read", "delivered"):
            from . import receipts
            from fastapi import HTTPException
            try: receipts.mark(db, u, str(msg.get("convId", ""))[:40], str(msg.get("upTo", ""))[:40], t)
            except HTTPException as e: return err("rejected", str(e.detail), t)
            return None
        if t.startswith("call."):
            from . import calls
            return calls.handle(db, u, t, msg)
        return err("unknown", f"Unknown frame type {t}", t)
    finally: db.close()

@router.get("/admin/realtime")
def admin_realtime(a: M.User = Depends(require("owner"))): return hub.stats()
