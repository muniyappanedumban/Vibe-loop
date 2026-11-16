"""Small in-memory sliding-window rate limiter.

NOTE: per-process memory only — counts reset on restart and are not shared between workers.
Production should back this with Redis (e.g. a sorted set per key, ZREMRANGEBYSCORE + ZCARD) behind the same interface.
"""
import math, threading, time
from collections import deque
from fastapi import HTTPException

class SlidingWindowLimiter:
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
            q.append(now); return None

    def reset(self):
        with self._lock: self._hits.clear()

limiter = SlidingWindowLimiter()
WINDOW = 15 * 60
LIMITS = {"otp_request": 5, "otp_verify": 10, "login": 10, "register": 5}

def enforce(bucket: str, *keys: str):
    """Apply the bucket limit to each key (identifier, client IP). Raises 429 with Retry-After."""
    limit = LIMITS[bucket]
    for k in keys:
        if not k: continue
        retry = limiter.hit(f"{bucket}:{k}", limit, WINDOW)
        if retry: raise HTTPException(429, "Too many attempts — try again later", headers={"Retry-After": str(retry)})
