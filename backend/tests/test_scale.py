"""Scale-out plumbing that works without Redis: fallback paths, health endpoints, timeouts, config cache, read engine."""
import asyncio, time
from fastapi import FastAPI
from fastapi.testclient import TestClient

def test_health_live_and_ready(client):
    assert client.get("/health/live").json()["ok"] is True
    r = client.get("/health/ready"); assert r.status_code == 200
    j = r.json(); assert j["db"] == "up" and "redis" not in j  # no REDIS_URL in tests

def test_cache_memory_ttl_copy_and_delete():
    from app.cache import Cache
    c, calls = Cache(url=None), []
    f = lambda: calls.append(1) or {"a": [1]}
    v = c.get_or_set("k", 0.2, f); v["a"].append(2)  # caller mutation must not leak into the cache
    assert c.get_or_set("k", 0.2, f) == {"a": [1]} and len(calls) == 1
    time.sleep(0.25); c.get_or_set("k", 0.2, f); assert len(calls) == 2
    c.delete("k"); c.get_or_set("k", 0.2, f); assert len(calls) == 3
    c.get_or_set("k", 0, f); assert len(calls) == 4  # ttl 0 = no caching

def test_cache_fails_open_when_redis_unreachable():
    from app.cache import Cache
    c = Cache(url="redis://127.0.0.1:1/0")
    assert c.get_or_set("k", 5, lambda: {"x": 1}) == {"x": 1} and c.errors >= 1

def test_config_cache_invalidated_by_admin_write(client, admin):
    before = client.get("/app-config").json()
    r = client.put("/admin/config/base", json={"moduleNames": {"social": "Zap"}}, headers=admin); assert r.status_code == 200, r.text
    after = client.get("/app-config").json()
    assert after["version"] == before["version"] + 1 and after["moduleNames"]["social"] == "Zap"

def test_resolve_is_served_from_cache(client):
    from app import config_resolver as R
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        a = R.resolve(db, None); n = {"q": 0}
        from sqlalchemy import event
        def count(*_a, **_k): n["q"] += 1
        event.listen(db.get_bind(), "before_cursor_execute", count)
        try: b = R.resolve(db, None)
        finally: event.remove(db.get_bind(), "before_cursor_execute", count)
        assert a == b and n["q"] == 0
    finally: db.close()

def test_timeout_middleware_returns_504_and_exempts_uploads():
    from app.middleware import TimeoutMiddleware
    inner = FastAPI()
    @inner.get("/slow")
    async def slow(): await asyncio.sleep(1); return {"ok": True}
    @inner.get("/uploads/x")
    async def up(): await asyncio.sleep(0.2); return {"ok": True}
    @inner.get("/fast")
    async def fast(): return {"ok": True}
    c = TestClient(TimeoutMiddleware(inner, timeout=0.1))
    assert c.get("/slow").status_code == 504
    assert c.get("/fast").status_code == 200
    assert c.get("/uploads/x").status_code == 200

def test_read_db_falls_back_to_primary():
    from app import db as D
    assert D.DATABASE_READ_URL is None and D.read_engine is D.engine and D.ReadSessionLocal is D.SessionLocal
    g = D.get_read_db(); s = next(g)
    from sqlalchemy import text
    assert s.execute(text("select 1")).scalar() == 1
    g.close()

def test_presence_local_without_redis():
    from app.realtime import Hub, Conn
    h = Hub(); c = Conn(None, None, "u1")
    assert not h.online("u1")
    h.add(c); h.mark("u1", True)  # mark is a no-op without REDIS_URL
    assert h.online("u1")
    h.remove(c); assert not h.online("u1")
