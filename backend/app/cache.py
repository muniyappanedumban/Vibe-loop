"""Tiny shared TTL cache for hot, read-mostly values (app-config resolution).

* REDIS_URL set   → values are JSON in Redis (shared by every API process/replica), key prefix `vl:c:`.
* REDIS_URL unset → per-process dict (fine for one process; other processes may serve values up to TTL seconds stale).
* Redis errors fail open: the value is computed from the source and the error logged — the cache is never a hard dependency.
Values must be JSON-serialisable. Every hit returns a fresh copy, so callers may mutate what they get."""
import json, logging, threading, time
from .config import REDIS_URL

log = logging.getLogger("vibeloop")
PREFIX = "vl:c:"

class Cache:
    def __init__(self, url: str | None = REDIS_URL):
        self.url, self.r = url, None
        self.local: dict[str, tuple[float, str]] = {}; self.lock = threading.Lock()
        self.hits = self.misses = self.errors = 0

    @property
    def name(self) -> str: return "redis" if self.url else "memory"

    def _redis(self):
        if self.r is None:
            import redis; self.r = redis.Redis.from_url(self.url, socket_timeout=0.3, socket_connect_timeout=0.3)
        return self.r

    def _get(self, key: str) -> str | None:
        if self.url:
            v = self._redis().get(PREFIX + key); return v.decode() if v is not None else None
        with self.lock:
            hit = self.local.get(key)
            if hit and hit[0] > time.monotonic(): return hit[1]
            self.local.pop(key, None); return None

    def _set(self, key: str, raw: str, ttl: float):
        if self.url: self._redis().set(PREFIX + key, raw, px=max(1, int(ttl * 1000))); return
        with self.lock:
            if len(self.local) > 10_000: self.local.clear()  # bounded; keys are few (country × slab × lang)
            self.local[key] = (time.monotonic() + ttl, raw)

    def get_or_set(self, key: str, ttl: float, compute):
        if ttl <= 0: return compute()
        try:
            raw = self._get(key)
            if raw is not None: self.hits += 1; return json.loads(raw)
        except Exception as e:
            self.errors += 1; log.warning("cache get failed (%s) — computing", type(e).__name__); return compute()
        self.misses += 1
        val = compute()
        try: self._set(key, json.dumps(val, separators=(",", ":")), ttl)
        except Exception as e: self.errors += 1; log.warning("cache set failed (%s)", type(e).__name__)
        return json.loads(json.dumps(val))  # same copy semantics as a hit

    def delete(self, *keys: str):
        with self.lock:
            for k in keys: self.local.pop(k, None)
        if self.url:
            try: self._redis().delete(*[PREFIX + k for k in keys])
            except Exception as e: self.errors += 1; log.warning("cache delete failed (%s)", type(e).__name__)

    def clear(self):
        """Local entries only (tests / dev). Redis entries expire by TTL."""
        with self.lock: self.local.clear()

    def ping(self) -> bool:
        if not self.url: return True
        return bool(self._redis().ping())

cache = Cache()
