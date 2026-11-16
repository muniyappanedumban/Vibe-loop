"""Sliding-window rate limiter with pluggable storage.

Backends (same interface: hit(key, limit, window_sec) -> None | retry_after_seconds, reset()):
  * MemoryBackend — per-process; counts reset on restart and are NOT shared between workers/replicas. Dev + tests.
  * RedisBackend  — used automatically when REDIS_URL is set: one sorted set per key (ZREMRANGEBYSCORE + ZCARD + ZADD in a
                    Lua script, so check-and-add is atomic across every API replica). If Redis is unreachable the request is
                    allowed (fail-open) and an error is logged — availability over strictness for a rate limiter.

Buckets: auth buckets (15 min windows, keyed by identifier + IP) and write buckets (per user AND per client IP)."""
import logging, math, threading, time, uuid
from collections import deque
from fastapi import Depends, HTTPException, Request
from .config import REDIS_URL, TRUST_PROXY

log = logging.getLogger("vibeloop.ratelimit")

class MemoryBackend:
    name = "memory"
    def __init__(self):
        self._hits: dict[str, deque] = {}
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int, window_sec: int) -> int | None:
        """Record a hit. Returns None if allowed, else seconds until the oldest hit leaves the window (Retry-After)."""
        now = time.monotonic()
        with self._lock:
            q = self._hits.setdefault(key, deque())
            while q and q[0] <= now - window_sec: q.popleft()
            if len(q) >= limit: return max(1, math.ceil(q[0] + window_sec - now))
            q.append(now)
            if len(self._hits) > 200_000: self._gc(now)
            return None

    def _gc(self, now: float):
        for k in [k for k, q in self._hits.items() if not q or q[-1] < now - 3600]: del self._hits[k]

    def reset(self):
        with self._lock: self._hits.clear()

_LUA = """
local key, now, window, limit, member = KEYS[1], tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3]), ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
if redis.call('ZCARD', key) >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return math.max(1, math.ceil(tonumber(oldest[2]) + window - now))
end
redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, math.ceil(window) + 1)
return 0
"""

class RedisBackend:
    name = "redis"
    def __init__(self, url: str, prefix: str = "vl:rl:"):
        import redis  # optional dependency (requirements.txt); only imported when REDIS_URL is set
        self.r = redis.Redis.from_url(url, socket_timeout=0.5, socket_connect_timeout=0.5)
        self.prefix = prefix
        self._script = self.r.register_script(_LUA)

    def hit(self, key: str, limit: int, window_sec: int) -> int | None:
        try:
            retry = int(self._script(keys=[self.prefix + key], args=[time.time(), window_sec, limit, uuid.uuid4().hex]))
        except Exception as e:  # fail open
            log.error("rate limiter: redis unavailable (%s) — allowing request", type(e).__name__); return None
        return retry or None

    def reset(self):
        for k in self.r.scan_iter(self.prefix + "*"): self.r.delete(k)

def make_backend(url: str | None = REDIS_URL):
    if url:
        try: return RedisBackend(url)
        except Exception as e: log.error("REDIS_URL set but redis backend failed (%s) — using in-memory limiter", e)
    return MemoryBackend()

limiter = make_backend()
SlidingWindowLimiter = MemoryBackend  # backwards-compatible name

# ---------- auth buckets: identifier + IP, 15-minute window ----------
WINDOW = 15 * 60
LIMITS = {"otp_request": 5, "otp_verify": 10, "login": 10, "register": 5}

def _deny(retry: int):
    raise HTTPException(429, "Too many attempts — try again later", headers={"Retry-After": str(retry)})

def enforce(bucket: str, *keys: str):
    """Apply the bucket limit to each key (identifier, client IP). Raises 429 with Retry-After."""
    limit = LIMITS[bucket]
    for k in keys:
        if not k: continue
        retry = limiter.hit(f"{bucket}:{k}", limit, WINDOW)
        if retry: _deny(retry)

# ---------- write buckets: (per-user limit, per-IP limit, window seconds) ----------
# Per-IP limits are higher because many users can share one IP (carrier NAT, offices).
WRITE_LIMITS = {
    "message":        (60, 600, 60),     # chat messages / town messages
    "conv_create":    (20, 200, 600),
    "post":           (30, 300, 600),
    "comment":        (30, 300, 600),
    "report":         (20, 200, 3600),   # /reports + /speakup (speakup also has a daily cap)
    "friend_request": (30, 300, 3600),
    "upload_init":    (60, 600, 3600),   # /uploads (resumable start) + /media
    "status":         (30, 300, 3600),
    "ping":           (60, 600, 3600),
}

def client_ip(req: Request) -> str:
    """X-Forwarded-For is spoofable — only honoured with TRUST_PROXY=1 (behind your own load balancer)."""
    if TRUST_PROXY:
        xff = req.headers.get("x-forwarded-for", "")
        if xff: return xff.split(",")[0].strip()[:64]
    return req.client.host if req.client else ""

def enforce_write(bucket: str, user_id: str, ip: str):
    per_user, per_ip, window = WRITE_LIMITS[bucket]
    if user_id and (retry := limiter.hit(f"w:{bucket}:u:{user_id}", per_user, window)): _deny(retry)
    if ip and (retry := limiter.hit(f"w:{bucket}:ip:{ip}", per_ip, window)): _deny(retry)

def write_limit(bucket: str):
    """FastAPI dependency: authenticated write endpoint limited per user and per IP. Returns the current user."""
    from .security import current_user
    def dep(req: Request, u=Depends(current_user)):
        enforce_write(bucket, u.id, client_ip(req)); return u
    dep.__name__ = f"write_limit_{bucket}"
    return dep
