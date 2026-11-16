"""Pure-ASGI middlewares: security headers, request body cap, kill switches."""
import json
from sqlalchemy import select
from .db import SessionLocal
from . import models as M

MAX_BODY = 1_000_000  # 1 MB
CHUNK_BODY = 5 * 1024 * 1024 + 64 * 1024  # v4 resumable chunk (5 MB) + slack
MEDIA_BODY = 50 * 1024 * 1024 + 400_000  # 50 MB video + multipart overhead
SEC_HEADERS = [(b"x-content-type-options", b"nosniff"), (b"x-frame-options", b"DENY"), (b"referrer-policy", b"no-referrer"),
               (b"permissions-policy", b"camera=(), microphone=(), geolocation=(), payment=()"), (b"cache-control", b"no-store")]
CHAT_PREFIXES = ("/friends", "/pings", "/conv", "/messages", "/search/messages", "/bridge", "/status", "/towns")
SOCIAL_PREFIXES = ("/posts",)
OTP_PATHS = ("/auth/otp/request", "/auth/register")

async def _send_json(send, status: int, detail: str, extra=()):
    body = json.dumps({"detail": detail}).encode()
    await send({"type": "http.response.start", "status": status, "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode()), *SEC_HEADERS, *extra]})
    await send({"type": "http.response.body", "body": body})

def _match(path: str, prefixes) -> bool: return any(path == p or path.startswith(p + "/") for p in prefixes)

def kill_for(path: str) -> str | None:
    if _match(path, CHAT_PREFIXES): return "chat"
    if _match(path, SOCIAL_PREFIXES): return "social"
    if path in OTP_PATHS: return "otp"
    return None

SCREEN_AREAS = {"/payouts": ("Payout", "payouts"), "/live": ("Live", "live"), "/towns": ("Towns", "towns"), "/status": ("Vibes", "statuses")}

def config_area(path: str):
    """Server-driven config enforcement: (kind, key) for paths gated by app-config."""
    for pre, k in SCREEN_AREAS.items():
        if _match(path, (pre,)): return "screen", k
    if _match(path, CHAT_PREFIXES): return "module", "chat"
    if _match(path, SOCIAL_PREFIXES): return "module", "social"
    return None

class SecurityMiddleware:
    def __init__(self, app): self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http": return await self.app(scope, receive, send)
        headers = dict(scope.get("headers") or [])
        path, meth = scope.get("path", ""), scope.get("method")
        if path == "/media" and meth == "POST": cap = MEDIA_BODY  # photo/video uploads only
        elif meth == "PUT" and path.startswith("/uploads/") and path.endswith("/chunk"): cap = CHUNK_BODY  # resumable upload chunks
        else: cap = MAX_BODY
        cl = headers.get(b"content-length")
        if cl is not None:
            try: too_big = int(cl) > cap
            except ValueError: too_big = True
            if too_big: return await _send_json(send, 413, "Request body too large")
        else:
            # No declared length (chunked): buffer up to the cap, then replay.
            chunks, size, more = [], 0, True
            while more:
                msg = await receive()
                if msg["type"] != "http.request": chunks.append(msg); break
                size += len(msg.get("body", b""))
                if size > cap: return await _send_json(send, 413, "Request body too large")
                chunks.append(msg); more = msg.get("more_body", False)
            body = b"".join(m.get("body", b"") for m in chunks if m["type"] == "http.request")
            done, orig_receive = False, receive
            async def receive():  # noqa: F811
                nonlocal done
                if not done: done = True; return {"type": "http.request", "body": body, "more_body": False}
                return await orig_receive()  # block until the real disconnect (streaming responses listen for it)

        if scope.get("method") != "OPTIONS" and (k := kill_for(scope["path"])):
            db = SessionLocal()
            try: flag = db.scalar(select(M.KV).where(M.KV.ns == "kill", M.KV.key == k))
            finally: db.close()
            if flag and (flag.value or {}).get("on"):
                return await _send_json(send, 503, f"{k.capitalize()} is paused by the platform (kill switch)")

        if scope.get("method") != "OPTIONS" and (area := config_area(scope["path"])):
            from .routes_config import optional_user
            from .config_resolver import resolve
            db = SessionLocal()
            try:
                cfg = resolve(db, optional_user(db, headers.get(b"authorization", b"").decode("latin-1")))
            finally: db.close()
            kind, key = area
            if kind == "module" and not cfg["modules"].get(key, True):
                return await _send_json(send, 503, f"{key.capitalize()} is turned off in your region")
            if kind == "screen" and (not cfg["screens"].get(key[0], True) or not cfg["features"].get(key[1], True)):
                return await _send_json(send, 403, "This is turned off in your region")

        async def send_wrapped(msg):
            if msg["type"] == "http.response.start":
                existing = {h[0].lower() for h in msg.get("headers", [])}
                msg["headers"] = list(msg.get("headers", [])) + [h for h in SEC_HEADERS if h[0] not in existing]
            await send(msg)
        await self.app(scope, receive, send_wrapped)


# ---------- v4: request id + structured log + presence + viewer context ----------
import logging, time, uuid, re as _re
import jwt as _jwt
from .v2common import VIEWER, MODULE
log = logging.getLogger("vibeloop.request")
if not log.handlers:
    _h = logging.StreamHandler(); _h.setFormatter(logging.Formatter("%(message)s")); log.addHandler(_h); log.setLevel(logging.INFO); log.propagate = False
    from .logsafe import install as _install_redaction; _install_redaction("vibeloop.request")
PRESENCE_EVERY_MS = 60_000
RID_RE = _re.compile(r"^[A-Za-z0-9._-]{1,64}$")

def module_for(path: str) -> str: return "chat" if _match(path, CHAT_PREFIXES) else "social"

def touch_presence(authz: str) -> dict | None:
    """Decode the bearer token; record last_seen_at at most once per 60 s. Returns the viewer context or None."""
    if not authz.startswith("Bearer "): return None
    from .security import decode_access
    try: data = decode_access(authz[7:])
    except _jwt.PyJWTError: return None
    db = SessionLocal()
    try:
        u = db.get(M.User, data.get("sub"))
        if not u or u.suspended or data.get("tv", 0) != (u.token_version or 0): return None
        now = M.now_ms()
        if not u.last_seen_at or now - u.last_seen_at >= PRESENCE_EVERY_MS: u.last_seen_at = now; db.commit()
        return {"id": u.id, "lsv": u.last_seen_visible is not False}
    except Exception: return None
    finally: db.close()

class RequestContextMiddleware:
    def __init__(self, app): self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http": return await self.app(scope, receive, send)
        headers = dict(scope.get("headers") or [])
        rid = headers.get(b"x-request-id", b"").decode("latin-1")
        if not RID_RE.match(rid): rid = uuid.uuid4().hex[:16]
        t0 = time.perf_counter(); status = {"code": 500}
        viewer = touch_presence(headers.get(b"authorization", b"").decode("latin-1")) if scope.get("method") != "OPTIONS" else None
        tv, tm = VIEWER.set(viewer), MODULE.set(module_for(scope["path"]))
        async def send_wrapped(msg):
            if msg["type"] == "http.response.start":
                status["code"] = msg["status"]; msg["headers"] = list(msg.get("headers", [])) + [(b"x-request-id", rid.encode())]
            await send(msg)
        try: await self.app(scope, receive, send_wrapped)
        finally:
            VIEWER.reset(tv); MODULE.reset(tm)
            log.info(json.dumps({"rid": rid, "method": scope.get("method"), "path": scope["path"], "status": status["code"],
                                 "ms": round((time.perf_counter() - t0) * 1000, 1), "uid": (viewer or {}).get("id")}))


class JsonGZipMiddleware:
    """GZip API responses (≥1 KB); media files stream untouched (already-compressed formats, range/file responses)."""
    def __init__(self, app):
        from starlette.middleware.gzip import GZipMiddleware
        self.app, self.gz = app, GZipMiddleware(app, minimum_size=1024)
    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and not scope["path"].startswith(("/media/", "/uploads/")): return await self.gz(scope, receive, send)
        return await self.app(scope, receive, send)
