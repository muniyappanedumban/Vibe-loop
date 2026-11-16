"""Security & scalability hardening: IDOR, private media, suspension, prod config, rate limits, webhook replay, caps, health."""
import base64, hashlib, hmac, json, time
import pytest
from app.db import SessionLocal
from app import models as M
from tests.conftest import login
from tests.test_v4 import upload, PNG

def u(c, id): return login(c, f"{id}@demo.vibeloop.app")
PDF = b"%PDF-1.4\n% private attachment\n"

# ---------- IDOR ----------
def test_idor_conv_and_message_by_id(client, riya):
    u4 = u(client, "u4")  # not a member of cv_u3 (riya + u3)
    assert client.get("/conv/cv_u3/messages", headers=u4).status_code == 404
    assert client.patch("/conv/cv_u3", headers=u4, json={"muted": True}).status_code == 404
    assert client.post("/conv/cv_u3/messages", headers=u4, json={"text": "hi"}).status_code == 404
    mid = client.get("/conv/cv_u3/messages", headers=riya).json()[0]["id"]
    for path in (f"/messages/{mid}/react", f"/messages/{mid}/star", f"/messages/{mid}/pin"):
        assert client.post(path, headers=u4, json={"moji": 1}).status_code == 404, path
    assert client.patch(f"/messages/{mid}", headers=u4, json={"text": "x"}).status_code == 404
    assert client.post(f"/messages/{mid}/forward", headers=u4, json={"convId": "cv_weekend"}).status_code == 404

def test_idor_legacy_chat_message_must_belong_to_chat(client, riya):
    from sqlalchemy import select
    db = SessionLocal(); other = db.scalar(select(M.Message).where(M.Message.chat_id != "c1")); db.close()
    # riya is a member of c1, but the message lives in another chat → 404 (was: reacted to any message by id)
    assert client.post(f"/chats/c1/messages/{other.id}/react", headers=riya, json={"moji": 3}).status_code == 404

def test_idor_private_chat_attachment(client, riya):
    up = upload(client, riya, "notes.pdf", PDF)
    raw = up["url"]
    sent = client.post("/conv/cv_u1/messages", headers=riya, json={"attachment": {"url": raw}})
    assert sent.status_code == 200, sent.text
    signed = sent.json()["attachment"]["url"]
    assert signed.startswith(raw + "?exp=") and "&sig=" in signed
    assert client.get(raw).status_code == 404                                   # anonymous
    assert client.get(raw, headers=u(client, "u4")).status_code == 404          # signed-in outsider
    member = client.get(raw, headers=u(client, "u1"))                           # conv member
    assert member.status_code == 200 and member.headers["content-disposition"].startswith("attachment")
    assert client.get(raw, headers=riya).status_code == 200                     # owner
    assert client.get(signed).status_code == 200                                # signed link (opened outside the app)
    assert client.get(signed[:-4] + "0000").status_code == 404                  # tampered signature
    # someone else can't launder it into a public post
    r = client.post("/posts", headers=u(client, "u4"), json={"kind": "photo", "text": "mine now", "mediaUrl": raw})
    assert r.status_code == 400

def test_public_post_media_stays_public(client, riya):
    r = client.post("/media", headers=riya, files={"file": ("a.png", PNG, "image/png")}); assert r.status_code == 200
    url = r.json()["url"]
    assert client.post("/posts", headers=riya, json={"kind": "photo", "text": "pic", "mediaUrl": url}).status_code == 200
    g = client.get(url); assert g.status_code == 200 and "content-disposition" not in g.headers
    assert g.headers["x-content-type-options"] == "nosniff"

def test_media_name_traversal_rejected(client):
    for bad in ("..%2F..%2Fetc%2Fpasswd", "abc..", "abc.", ".png", "a" * 60 + ".png", "abc.png%00.txt"):
        assert client.get(f"/media/{bad}").status_code == 404, bad

def test_idor_collections_uploads_comments_circle(client, riya):
    u4 = u(client, "u4")
    col = client.post("/collections", headers=riya, json={"name": "Mine"}).json()
    assert client.post(f"/collections/{col['id']}/items", headers=u4, json={"postId": "p1"}).status_code == 404
    assert client.delete(f"/collections/{col['id']}/items/p1", headers=u4).status_code == 404
    sid = client.post("/uploads", headers=riya, json={"filename": "x.pdf", "size": 10}).json()["uploadId"]
    assert client.get(f"/uploads/{sid}", headers=u4).status_code == 404
    assert client.put(f"/uploads/{sid}/chunk?offset=0", headers={**u4, "Content-Type": "application/octet-stream"}, content=b"%PDF-12345").status_code == 404
    assert client.post(f"/uploads/{sid}/complete", headers=u4).status_code == 404
    # circle post: u4 is not in riya's Inner Circle → can't see, react, comment, vote or share it
    client.post("/posts", headers=riya, json={"id": "circ-h", "kind": "thought", "text": "inner", "audience": "circle"})
    assert client.post("/posts/circ-h/comments", headers=u4, json={"text": "sneaky"}).status_code == 404
    assert client.post("/posts/circ-h/react", headers=u4, json={"key": "heart"}).status_code == 404
    assert client.post("/posts/circ-h/share", headers=u4).status_code == 404
    assert client.post("/posts/circ-h/comments", headers=u(client, "u1"), json={"text": "hi"}).status_code == 200  # u1 is close
    cid = client.get("/posts/circ-h/comments", headers=riya).json()["items"][0]["id"]
    assert client.delete(f"/comments/{cid}", headers=u4).status_code == 403
    assert client.post(f"/comments/{cid}/like", headers=u4).status_code == 404
    assert "circ-h" not in {p["id"] for p in client.get("/users/usr_riya/pinned", headers=u4).json()}

def test_idor_store_reviews_speakup(client, riya, admin):
    from tests.test_v3 import money_on
    money_on(client, admin)
    client.put("/admin/money/settings", json={"store": True}, headers=admin)
    p = client.post("/store/products", headers=riya, json={"title": "Preset", "price": 0})
    assert p.status_code == 200, p.text
    assert client.patch(f"/store/products/{p.json()['id']}", headers=u(client, "u4"), json={"price": 1}).status_code == 403
    # Speak Up can't target a message from a conversation you're not in
    mid = client.get("/conv/cv_u3/messages", headers=riya).json()[0]["id"]
    r = client.post("/speakup", headers=u(client, "u4"), json={"category": "harassment", "targetType": "message", "targetId": mid, "details": "x"})
    assert r.status_code == 404
    assert client.post("/speakup", headers=riya, json={"category": "harassment", "targetType": "message", "targetId": mid, "details": "x"}).status_code == 200

def test_every_admin_route_is_owner_only(client, riya):
    from app.main import app
    checked = 0
    for path, ops in app.openapi()["paths"].items():  # every registered route, including included routers
        if not (path.startswith("/admin") or path == "/pages/{slug}/versions"): continue
        url = path
        for seg in [s for s in path.split("/") if s.startswith("{")]: url = url.replace(seg, "x1")
        for meth in [m.upper() for m in ops]:
            res = client.request(meth, url, headers=riya, json={})
            assert res.status_code == 403, (meth, path, res.status_code)
            assert client.request(meth, url, json={}).status_code == 401, (meth, path)
            checked += 1
    assert checked > 60

# ---------- auth ----------
def test_suspended_user_rejected_everywhere(client, admin):
    u1 = u(client, "u1")
    assert client.get("/me", headers=u1).status_code == 200
    assert client.patch("/admin/users/u1", headers=admin, json={"suspended": True}).status_code == 200
    for path in ("/me", "/bootstrap", "/conv", "/feed", "/friends", "/status", "/me/profile"):
        assert client.get(path, headers=u1).status_code == 403, path
    assert client.post("/posts", headers=u1, json={"kind": "thought", "text": "x"}).status_code == 403

def test_jwt_rules(client, riya):
    import jwt as pyjwt
    from app.config import JWT_SECRET
    now = int(time.time())
    def tok(**claims): return {"Authorization": "Bearer " + pyjwt.encode({"sub": "usr_riya", "tv": 0, "iat": now, "exp": now + 60, **claims}, JWT_SECRET, "HS256")}
    assert client.get("/me", headers=tok()).status_code == 200
    assert client.get("/me", headers=tok(exp=now - 10)).status_code == 200      # within clock-skew leeway
    assert client.get("/me", headers=tok(exp=now - 600)).status_code == 401
    noexp = pyjwt.encode({"sub": "usr_riya", "tv": 0, "iat": now}, JWT_SECRET, "HS256")
    assert client.get("/me", headers={"Authorization": "Bearer " + noexp}).status_code == 401
    none_alg = pyjwt.encode({"sub": "usr_riya", "tv": 0, "iat": now, "exp": now + 60}, None, "none")
    assert client.get("/me", headers={"Authorization": "Bearer " + none_alg}).status_code == 401
    from app.config import ACCESS_TTL_MIN
    assert ACCESS_TTL_MIN <= 24 * 60

def test_production_config_guard():
    from app.config import production_problems
    good = {"DATABASE_URL": "postgresql+psycopg://db/vl", "JWT_SECRET": "j" * 40, "APPROVAL_SECRET": "a" * 40, "OTP_SECRET": "o" * 40,
            "MASTER_KEY": "m" * 44, "CORS_ORIGINS": "https://app.example.com", "DEMO_OTP": "0"}
    assert production_problems(good) == []
    for k in ("DATABASE_URL", "JWT_SECRET", "APPROVAL_SECRET", "OTP_SECRET", "MASTER_KEY", "CORS_ORIGINS"):
        assert any(k in p for p in production_problems({**good, k: ""})), k
    assert any("DEMO_OTP" in p for p in production_problems({**good, "DEMO_OTP": "1"}))
    assert any("DEMO_OTP" in p for p in production_problems({k: v for k, v in good.items() if k != "DEMO_OTP"}))
    assert any("CORS" in p for p in production_problems({**good, "CORS_ORIGINS": "*"}))
    assert any("different" in p for p in production_problems({**good, "APPROVAL_SECRET": "j" * 40}))
    assert any("32" in p for p in production_problems({**good, "JWT_SECRET": "short"}))

def test_prod_refuses_to_start_without_secrets():
    import os, subprocess, sys
    env = {k: v for k, v in os.environ.items() if k not in ("JWT_SECRET", "APPROVAL_SECRET", "OTP_SECRET", "MASTER_KEY")}
    env["ENV"] = "prod"
    r = subprocess.run([sys.executable, "-c", "import app.config"], env=env, capture_output=True, text=True, cwd=os.path.dirname(os.path.dirname(__file__)))
    assert r.returncode != 0 and "Refusing to start" in r.stderr

# ---------- input limits / pagination ----------
def test_input_and_pagination_caps(client, riya, admin):
    assert client.post("/posts", headers=riya, json={"kind": "thought", "text": "x", "mood": "m" * 500}).status_code == 422
    assert client.post("/posts/p1/comments", headers=riya, json={"text": "c" * 5000}).status_code == 400
    assert client.post("/reports", headers=riya, json={"target": "t" * 500, "reason": "spam"}).status_code == 400
    assert client.post(f"/edges/follow/{'x' * 100}", headers=riya).status_code == 400
    assert client.put("/settings", headers=riya, json={f"k{i}": i for i in range(100)}).status_code == 400
    assert client.post("/admin/announcements", headers=admin, json={"title": "", "body": "b"}).status_code == 400
    assert len(client.get("/admin/audit?limit=1000", headers=admin).json()) <= 100
    for i in range(3): client.post("/conv/cv_u1/messages", headers=riya, json={"text": f"m{i}"})
    page = client.get("/conv/cv_u1/messages?limit=2", headers=riya).json()
    assert len(page) == 2 and page[-1]["text"] == "m2"
    older = client.get(f"/conv/cv_u1/messages?limit=100&before={page[0]['at']}", headers=riya).json()
    assert older and all(m["at"] < page[0]["at"] for m in older)
    assert len(client.get("/conv/cv_u1/messages?limit=5000", headers=riya).json()) <= 100
    boot = client.get("/bootstrap", headers=riya).json()
    assert all(len(v) <= 100 for v in boot["social"].values() if isinstance(v, list))
    assert all(len(boot[k]) <= 100 for k in ("loops", "txns", "payouts", "notices", "assets", "insights", "published"))

def test_announcement_fanout(client, admin, riya):
    r = client.post("/admin/announcements", headers=admin, json={"title": "Hello", "body": "World"}); assert r.status_code == 200
    db = SessionLocal(); from sqlalchemy import select, func
    n = db.scalar(select(func.count()).select_from(M.Notice).where(M.Notice.title == "Hello"))
    users = db.scalar(select(func.count()).select_from(M.User).where(M.User.role != "owner")); db.close()
    assert n == users

# ---------- rate limits ----------
def test_write_rate_limits_per_user_and_ip(client, riya, monkeypatch):
    from app import ratelimit
    monkeypatch.setitem(ratelimit.WRITE_LIMITS, "comment", (3, 100, 60))
    for i in range(3): assert client.post("/posts/p1/comments", headers=riya, json={"text": f"c{i}"}).status_code == 200
    r = client.post("/posts/p1/comments", headers=riya, json={"text": "c4"})
    assert r.status_code == 429 and int(r.headers["retry-after"]) >= 1
    assert client.post("/posts/p1/comments", headers=u(client, "u3"), json={"text": "other user ok"}).status_code == 200
    # per-IP: everyone in tests shares one client IP
    ratelimit.limiter.reset(); monkeypatch.setitem(ratelimit.WRITE_LIMITS, "friend_request", (100, 2, 60))
    codes = [client.post("/friends/request", headers=login(client, h), json={"handle": "@zoya.draws"}).status_code
             for h in ("u2@demo.vibeloop.app", "u3@demo.vibeloop.app", "u5@demo.vibeloop.app")]
    assert codes[-1] == 429 and 429 not in codes[:2]

def test_redis_backend_when_available():
    from app.ratelimit import RedisBackend
    try:
        b = RedisBackend("redis://localhost:6379/15", prefix=f"vl:test:{time.time()}:"); b.r.ping()
    except Exception: pytest.skip("redis not running")
    assert b.hit("k", 2, 60) is None and b.hit("k", 2, 60) is None
    retry = b.hit("k", 2, 60); assert retry and 1 <= retry <= 60
    b.reset()
    dead = RedisBackend("redis://localhost:1/0")
    assert dead.hit("k", 1, 60) is None  # fail-open when redis is down

# ---------- webhooks ----------
def test_webhook_replay_and_timestamp(client, admin):
    from tests.test_v3 import _order, _status
    client.put("/admin/integrations", json={"razorpay": {"keyId": "k", "keySecret": "s", "webhookSecret": "whsec_r"},
                                            "cashfree": {"appId": "a", "secretKey": "s", "webhookSecret": "cf_s"}}, headers=admin)
    oid = _order()
    body = json.dumps({"event": "payment_link.paid", "payload": {"payment_link": {"entity": {"reference_id": oid}}}}).encode()
    h = {"X-Razorpay-Signature": hmac.new(b"whsec_r", body, hashlib.sha256).hexdigest(), "X-Razorpay-Event-Id": "evt_1"}
    assert client.post("/webhooks/razorpay", content=body, headers=h).json().get("duplicate") is None
    assert client.post("/webhooks/razorpay", content=body, headers=h).json()["duplicate"] is True
    assert _status(oid)[0] == "paid"
    oid2 = _order(provider="cashfree", kind="tip", ref="u4", creator="u4", amount=1000)
    cbody = json.dumps({"type": "PAYMENT_LINK_EVENT", "data": {"link_id": oid2, "link_status": "PAID"}}).encode()
    sig = lambda ts: base64.b64encode(hmac.new(b"cf_s", ts.encode() + cbody, hashlib.sha256).digest()).decode()
    stale = str(int(time.time()) - 3600)
    assert client.post("/webhooks/cashfree", content=cbody, headers={"x-webhook-timestamp": stale, "x-webhook-signature": sig(stale)}).status_code == 401
    assert _status(oid2)[0] == "created"
    ms = str(int(time.time() * 1000))
    assert client.post("/webhooks/cashfree", content=cbody, headers={"x-webhook-timestamp": ms, "x-webhook-signature": sig(ms)}).status_code == 200
    assert client.post("/webhooks/cashfree", content=cbody, headers={"x-webhook-timestamp": ms, "x-webhook-signature": sig(ms)}).json()["duplicate"] is True
    assert _status(oid2)[0] == "paid"

# ---------- health / logging ----------
def test_health_liveness_and_readiness(client):
    assert client.get("/health").json()["ok"] is True
    r = client.get("/health/ready"); assert r.status_code == 200 and r.json()["db"] == "up"

def test_log_redaction():
    from app.logsafe import redact
    s = redact('Authorization: Bearer abc.def.ghi user riya@vibeloop.app GET /media/x.pdf?exp=1&sig=deadbeef {"demoCode": "123456"} eyJhbGciOi.eyJzdWIiOi.sig')
    assert "abc.def.ghi" not in s and "riya@" not in s and "r***@vibeloop.app" in s and "deadbeef" not in s and "123456" not in s and "eyJhbGciOi" not in s

def test_pages_refuse_html(client, admin):
    base = {"slug": "safe-md", "title": "T", "body": "**bold** and a < b"}
    assert client.post("/admin/pages", headers=admin, json=base).status_code == 200
    assert client.post("/admin/pages", headers=admin, json={**base, "slug": "bad-md", "body": "<script>alert(1)</script>"}).status_code == 400
    assert client.patch("/admin/pages/safe-md", headers=admin, json={"body": "[x](javascript:alert(1))"}).status_code == 400
    r = client.get("/pages/safe-md"); assert r.status_code in (200, 404) and r.headers["content-type"].startswith("application/json")

def test_non_media_files_download_as_attachment(client, riya):
    mp3 = upload(client, riya, "song.mp3", b"ID3" + b"\x00" * 64)
    g = client.get(mp3["url"]); assert g.status_code == 200 and g.headers["content-disposition"].startswith("attachment")
    assert "sandbox" in g.headers["content-security-policy"]
    exe = client.post("/uploads", headers=riya, json={"filename": "x.exe", "size": 10}); assert exe.status_code == 415
    sid = client.post("/uploads", headers=riya, json={"filename": "fake.pdf", "size": 10}).json()["uploadId"]
    assert client.put(f"/uploads/{sid}/chunk?offset=0", headers={**riya, "Content-Type": "application/octet-stream"}, content=b"MZ\x90\x00binary").status_code == 415
