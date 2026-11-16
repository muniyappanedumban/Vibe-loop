from app.db import SessionLocal
from app import models as M
from app.ratelimit import limiter
from app import config_resolver as R
from tests.conftest import login

H = {"riya": "riya@vibeloop.app"}
def auth(tok): return {"Authorization": f"Bearer {tok}"}
def u(c, id): return login(c, f"{id}@demo.vibeloop.app")
def db_do(fn):
    db = SessionLocal()
    try: fn(db); db.commit()
    finally: db.close()

# ---------- OTP / identity ----------
def test_register_and_otp_happy_path(client):
    r = client.post("/auth/register", json={"handle": "@New.Person", "name": "New", "email": "np@example.com"}).json()
    assert r["sent"] and r["channel"] == "email" and r["to"] == "n***@example.com" and r["expiresIn"] == 300 and len(r["demoCode"]) == 6
    v = client.post("/auth/otp/verify", json={"identifier": "@new.person", "code": r["demoCode"]})
    assert v.status_code == 200 and v.json()["user"]["handle"] == "@new.person" and v.json()["user"]["verified"]
    assert client.get("/me/profile", headers=auth(v.json()["token"])).json()["handle"] == "@new.person"
    # reuse fails
    assert client.post("/auth/otp/verify", json={"identifier": "@new.person", "code": r["demoCode"]}).status_code == 400
    # code is stored hashed
    db = SessionLocal(); row = db.query(M.OtpRequest).filter(M.OtpRequest.user_id == v.json()["user"]["id"]).first(); db.close()
    assert row.code_hash and r["demoCode"] not in row.code_hash

def test_otp_request_existing_by_email_and_handle(client):
    r = client.post("/auth/otp/request", json={"identifier": "riya.makes"}).json()
    v = client.post("/auth/otp/verify", json={"identifier": "@riya.makes", "code": r["demoCode"]}).json()
    assert v["user"]["id"] == "usr_riya" and {a["handle"] for a in v["accounts"]} == {"@riya.makes", "@riya.chats"}
    r = client.post("/auth/otp/request", json={"identifier": "riya@vibeloop.app"}).json()
    assert client.post("/auth/otp/verify", json={"identifier": "riya@vibeloop.app", "code": r["demoCode"]}).json()["user"]["id"] == "usr_riya"

def test_otp_wrong_attempts_lock(client):
    code = client.post("/auth/otp/request", json={"identifier": "@aanya.eats"}).json()["demoCode"]
    wrong = "000000" if code != "000000" else "111111"
    codes = [client.post("/auth/otp/verify", json={"identifier": "@aanya.eats", "code": wrong}).status_code for _ in range(5)]
    assert codes == [400, 400, 400, 400, 429]
    assert client.post("/auth/otp/verify", json={"identifier": "@aanya.eats", "code": code}).status_code == 429  # locked even with the right code

def test_otp_expiry(client):
    code = client.post("/auth/otp/request", json={"identifier": "@aanya.eats"}).json()["demoCode"]
    db_do(lambda db: [setattr(r, "expires_at", 1) for r in db.query(M.OtpRequest).filter(M.OtpRequest.user_id == "u1")])
    assert client.post("/auth/otp/verify", json={"identifier": "@aanya.eats", "code": code}).status_code == 400

def test_no_enumeration(client):
    known = client.post("/auth/otp/request", json={"identifier": "@aanya.eats"})
    unknown = client.post("/auth/otp/request", json={"identifier": "@nobody.here"})
    assert known.status_code == unknown.status_code == 200 and set(known.json()) == set(unknown.json())
    assert client.post("/auth/otp/verify", json={"identifier": "@nobody.here", "code": unknown.json()["demoCode"]}).status_code == 400
    e = client.post("/auth/otp/request", json={"identifier": "ghost@example.com"}).json(); assert e["to"] == "g***@example.com"

def test_rate_limit_429(client):
    codes = [client.post("/auth/otp/request", json={"identifier": "@aanya.eats"}).status_code for _ in range(6)]
    assert codes[:5] == [200] * 5 and codes[5] == 429
    r = client.post("/auth/otp/request", json={"identifier": "@aanya.eats"}); assert int(r.headers["Retry-After"]) > 0
    limiter.reset()
    for _ in range(10): client.post("/auth/login", json={"email": "riya@vibeloop.app", "password": "wrong"})
    assert client.post("/auth/login", json={"email": "riya@vibeloop.app", "password": "wrong"}).status_code == 429

def test_email_cap(client):
    for i in range(3):  # riya's email already has 2 accounts
        assert client.post("/auth/register", json={"handle": f"riya.alt{i}", "name": "R", "email": "riya@vibeloop.app"}).status_code == 200
    r = client.post("/auth/register", json={"handle": "riya.alt9", "name": "R", "email": "riya@vibeloop.app"})
    assert r.status_code == 409 and r.json()["detail"] == "This email already has 5 accounts"
    assert client.get("/me/accounts-for-email", headers=login(client, H["riya"])).json()["count"] == 5

def test_handle_rules(client, riya):
    reg = lambda h: client.post("/auth/register", json={"handle": h, "name": "X", "email": "x@example.com"}).status_code
    assert reg("ab") == 400 and reg("Bad-Handle") == 400 and reg("a" * 21) in (400, 422)
    assert reg("@admin") == 409 and reg("riya.makes") == 409
    client.put("/admin/kv/reserved/@Brand.X", headers=login(client, "admin@vibeloop.app"), json={"on": True})
    assert reg("brand.x") == 409
    r = client.post("/me/handle", headers=riya, json={"handle": "@riya.new"}); assert r.status_code == 200 and r.json()["handle"] == "@riya.new"
    r = client.post("/me/handle", headers=riya, json={"handle": "riya.newer"}); assert r.status_code == 429 and "again on" in r.json()["detail"]
    assert reg("riya.makes") == 409  # old handle reserved 30 days
    assert client.get("/users/lookup?handle=riya.new", headers=riya).json()["id"] == "usr_riya"

def test_logout_all(client, riya):
    assert client.get("/me", headers=riya).status_code == 200
    assert client.post("/auth/logout-all", headers=riya).status_code == 200
    assert client.get("/me", headers=riya).status_code == 401
    assert client.get("/me", headers=login(client, H["riya"])).status_code == 200

def test_security_headers_and_body_limit(client):
    r = client.get("/health")
    assert r.headers["x-frame-options"] == "DENY" and r.headers["x-content-type-options"] == "nosniff" and r.headers["cache-control"] == "no-store"
    assert client.post("/auth/otp/request", content=b"x" * 1_100_000, headers={"content-type": "application/json"}).status_code == 413

def test_profile_and_lookup_hidden(client, riya):
    p = client.patch("/me/profile", headers=riya, json={"chat_bio": "hi", "who_can_message": "friends", "country": "us", "lang": "ta"}).json()
    assert p["chat_bio"] == "hi" and p["who_can_message"] == "friends" and p["country"] == "US"
    assert client.patch("/me/profile", headers=riya, json={"who_can_message": "aliens"}).status_code == 422
    assert client.patch("/me/profile", headers=riya, json={"chat_bio": "x" * 200}).status_code == 422
    u2 = u(client, "u2")
    client.patch("/me/profile", headers=riya, json={"hidden": True})
    assert client.get("/users/lookup?handle=@riya.makes", headers=u2).status_code == 404          # hidden, not friends
    assert client.get("/users/lookup?handle=@riya.makes", headers=u(client, "u1")).status_code == 200  # friend sees

# ---------- friends ----------
def test_friend_rules(client, riya):
    f = client.get("/friends", headers=riya).json()
    assert {x["id"] for x in f["friends"]} == {"u1", "u3", "u4", "u6"} and f["incoming"][0]["from"]["id"] == "u5" and f["outgoing"][0]["to"]["id"] == "u2"
    assert next(x for x in f["friends"] if x["id"] == "u1")["bestie"]
    assert client.post("/friends/request", headers=riya, json={"handle": "@aanya.eats"}).status_code == 409  # already friends
    assert client.post("/friends/request", headers=riya, json={"handle": "kabir.frames"}).status_code == 409  # pending
    assert client.post("/friends/request", headers=riya, json={"handle": "rohan.plays"}).status_code == 409  # pending (incoming)
    u5 = u(client, "u5")
    assert client.post("/friends/requests/fr_u5/accept", headers=u5).status_code == 404  # only recipient
    assert client.post("/friends/requests/fr_u5/accept", headers=riya).json()["status"] == "accepted"
    assert client.post("/friends/requests/fr_u5/accept", headers=riya).status_code == 409
    u2 = u(client, "u2")
    assert client.post("/friends/requests/fr_u2/decline", headers=u2).json()["status"] == "declined"
    # block → 403
    client.post("/edges/block/usr_riya", headers=u2)
    assert client.post("/friends/request", headers=riya, json={"handle": "kabir.frames"}).status_code == 403
    # nobody → 403
    m = login(client, "fan1@demo.vibeloop.app")
    client.patch("/me/profile", headers=m, json={"who_can_message": "nobody"})
    assert client.post("/friends/request", headers=riya, json={"handle": "kabir.fan"}).status_code == 403
    # labels + unfriend + chat notice
    assert client.patch("/friends/u4", headers=riya, json={"close": True}).json()["close"]
    assert client.delete("/friends/u6", headers=riya).status_code == 200 and client.delete("/friends/u6", headers=riya).status_code == 404
    assert client.post("/pings", headers=riya, json={"to": "u1", "moji": 7, "kind": "heart"}).status_code == 200
    n = client.get("/bootstrap", headers=u(client, "u1")).json()["notices"]
    assert n[0]["module"] == "chat" and "Heart Ping" in n[0]["title"]
    assert client.post("/pings", headers=riya, json={"to": "u2", "moji": 7, "kind": "wave"}).status_code == 403

# ---------- conversations ----------
def test_request_gate_and_nobody(client, riya):
    c = client.post("/conv", headers=riya, json={"members": ["u5"]}).json()
    assert not c["request"] and c["awaitingAccept"]
    assert client.post(f"/conv/{c['id']}/messages", headers=riya, json={"text": "hi Rohan"}).status_code == 200
    assert client.post(f"/conv/{c['id']}/messages", headers=riya, json={"text": "again"}).status_code == 409
    u5 = u(client, "u5")
    theirs = next(x for x in client.get("/conv", headers=u5).json() if x["id"] == c["id"])
    assert theirs["request"] and client.post(f"/conv/{c['id']}/messages", headers=u5, json={"text": "yo"}).status_code == 409
    client.patch(f"/conv/{c['id']}", headers=u5, json={"accept": True})
    assert client.post(f"/conv/{c['id']}/messages", headers=riya, json={"text": "again"}).status_code == 200
    assert client.post("/conv", headers=riya, json={"members": ["u5"]}).json()["id"] == c["id"]  # reuse
    client.patch("/me/profile", headers=u(client, "u2"), json={"who_can_message": "nobody"})
    assert client.post("/conv", headers=riya, json={"members": ["u2"]}).status_code == 403

def test_seed_convs(client, riya):
    cs = {c["id"]: c for c in client.get("/conv", headers=riya).json()}
    assert cs["cv_x1"]["request"] and cs["cv_weekend"]["folder"] == "groups" and cs["cv_u1"]["pinned"] and cs["cv_u1"]["unread"] >= 1
    msgs = client.get("/conv/cv_weekend/messages", headers=riya).json()
    poll = next(m for m in msgs if m["kind"] == "poll"); assert poll["poll"]["myVote"] is None and poll["poll"]["options"][0]["votes"] == 2
    assert client.post(f"/messages/{poll['id']}/vote", headers=riya, json={"option": 1}).json()["poll"]["myVote"] == 1
    assert client.post(f"/messages/{poll['id']}/vote", headers=riya, json={"option": 0}).status_code == 409
    assert client.get("/search/messages?q=sip", headers=riya).json()[0]["id"] == "cm_m1"
    assert client.get("/search/messages?q=sip", headers=u(client, "u2")).json() == []

def test_message_features(client, riya):
    u1 = u(client, "u1")
    m = client.post("/conv/cv_u1/messages", headers=riya, json={"text": "draft", "replyTo": "cm_a5"}).json()
    assert m["replyTo"]["id"] == "cm_a5" and m["from"] == "me"
    assert client.patch(f"/messages/{m['id']}", headers=riya, json={"text": "final"}).json()["edited"]
    assert client.patch(f"/messages/{m['id']}", headers=u1, json={"text": "hack"}).status_code == 403
    db_do(lambda db: setattr(db.get(M.ChatMsg, m["id"]), "at", M.now_ms() - 16 * 60_000))
    assert client.patch(f"/messages/{m['id']}", headers=riya, json={"text": "late"}).status_code == 409
    assert client.delete(f"/messages/{m['id']}", headers=riya).json()["deleted"]  # within 60 min
    m2 = client.post("/conv/cv_u1/messages", headers=riya, json={"text": "old"}).json()
    db_do(lambda db: setattr(db.get(M.ChatMsg, m2["id"]), "at", M.now_ms() - 61 * 60_000))
    assert client.delete(f"/messages/{m2['id']}", headers=riya).status_code == 409
    # react / star / pin
    r = client.post("/messages/cm_a5/react", headers=riya, json={"moji": 42}).json(); assert {"moji": 42, "by": "me"} in r["reactions"]
    assert client.post("/messages/cm_a5/react", headers=riya, json={"moji": 42}).json()["reactions"] == []
    assert client.post("/messages/cm_a5/star", headers=riya).json()["starred"]
    assert not client.get("/conv/cv_u1/messages", headers=u1).json()[4]["starred"]  # star is per-user
    assert client.post("/messages/cm_a5/pin", headers=riya).json()["pinned"]
    # forward
    f = client.post("/messages/cm_a5/forward", headers=riya, json={"convId": "cv_u3"}).json(); assert f["convId"] == "cv_u3" and f["text"] == "Deal. Sending the location soon"
    assert client.post("/messages/cm_a5/forward", headers=u(client, "u2"), json={"convId": "cv_u3"}).status_code == 404
    # view once
    v = client.post("/conv/cv_u1/messages", headers=riya, json={"text": "secret", "viewOnce": True}).json(); assert v["kind"] == "viewonce"
    seen = next(x for x in client.get("/conv/cv_u1/messages", headers=u1).json() if x["id"] == v["id"]); assert seen["text"] == "" and not seen["opened"]
    o = client.post(f"/messages/{v['id']}/open", headers=u1).json(); assert o["text"] == "secret"
    assert client.post(f"/messages/{v['id']}/open", headers=u1).status_code == 409
    assert next(x for x in client.get("/conv/cv_u1/messages", headers=u1).json() if x["id"] == v["id"])["opened"]
    # poll in DM
    p = client.post("/conv/cv_u1/messages", headers=riya, json={"poll": {"q": "Dosa?", "options": ["Yes", "No"]}}).json(); assert p["kind"] == "poll"
    assert client.post(f"/messages/{p['id']}/vote", headers=u1, json={"option": 5}).status_code == 400

def test_send_later_and_fade(client, riya):
    u1 = u(client, "u1")
    s = client.post("/conv/cv_u1/messages", headers=riya, json={"text": "later", "sendAt": M.now_ms() + 3600_000}).json(); assert s["sendAt"]
    assert any(x["id"] == s["id"] for x in client.get("/conv/cv_u1/messages", headers=riya).json())
    assert not any(x["id"] == s["id"] for x in client.get("/conv/cv_u1/messages", headers=u1).json())
    db_do(lambda db: (setattr(db.get(M.ChatMsg, s["id"]), "send_at", M.now_ms() - 1), setattr(db.get(M.ChatMsg, s["id"]), "at", M.now_ms() - 1)))
    assert any(x["id"] == s["id"] for x in client.get("/conv/cv_u1/messages", headers=u1).json())
    assert client.post("/conv/cv_u1/messages", headers=riya, json={"text": "x", "sendAt": 5}).status_code == 400
    assert client.patch("/conv/cv_u1", headers=riya, json={"fadeSec": 12}).status_code == 400
    assert client.patch("/conv/cv_u1", headers=riya, json={"fadeSec": 3600}).json()["fadeSec"] == 3600
    f = client.post("/conv/cv_u1/messages", headers=riya, json={"text": "poof"}).json(); assert f["expiresAt"]
    db_do(lambda db: setattr(db.get(M.ChatMsg, f["id"]), "expires_at", M.now_ms() - 1))
    assert not any(x["id"] == f["id"] for x in client.get("/conv/cv_u1/messages", headers=riya).json())
    c = client.patch("/conv/cv_u1", headers=riya, json={"folder": "family", "muted": True, "theme": "sunset", "locked": True}).json()
    assert c["folder"] == "family" and c["muted"] and c["locked"] and c["theme"] == "sunset"

# ---------- vibes ----------
def test_status_visibility(client, riya):
    ids = lambda h: [s["id"] for s in client.get("/status", headers=h).json()]
    mine = ids(riya); assert mine[0] == "st_riya" and {"st_u1", "st_u6"} <= set(mine) and "st_old" not in mine
    assert "st_u4" not in mine  # u4's close list doesn't include riya
    db_do(lambda db: setattr(db.get(M.Friend, ("u4", "usr_riya")), "close", True))
    assert "st_u4" in ids(riya)
    u2 = u(client, "u2"); vis = ids(u2)
    assert "st_u6" in vis and "st_u1" not in vis and "st_riya" not in vis  # public only
    r = client.post("/status/st_u1/reply", headers=riya, json={"text": "Where??"}).json(); assert r["conv"]["id"] == "cv_u1"
    assert client.post("/status/st_u1/reply", headers=u2, json={"text": "hi"}).status_code == 404
    s = client.post("/status", headers=riya, json={"kind": "mood", "moji": 5, "audience": "close"}).json(); assert s["by"] == "me"
    assert client.delete(f"/status/{s['id']}", headers=u2).status_code == 404 and client.delete(f"/status/{s['id']}", headers=riya).status_code == 200

# ---------- towns ----------
def test_towns(client, riya):
    ts = {t["id"]: t for t in client.get("/towns", headers=riya).json()}
    assert ts["town_cbe"]["role"] == "owner" and ts["town_chai"]["role"] == "member" and ts["town_indie"]["role"] is None
    assert ts["town_chai"]["invite"] is None and ts["town_cbe"]["board"]
    u2 = u(client, "u2")
    assert "town_chai" not in [t["id"] for t in client.get("/towns", headers=u2).json()]
    assert client.get("/towns/town_chai", headers=u2).status_code == 404
    assert client.post("/towns/town_chai/join", headers=u2, json={}).status_code == 403
    assert client.post("/towns/town_chai/join", headers=u2, json={"code": "WRONG"}).status_code == 403
    assert client.post("/towns/town_chai/join", headers=u2, json={"code": "chai2026"}).json()["role"] == "member"
    assert client.post("/towns/town_indie/join", headers=riya).json()["role"] == "member"
    # roles: only owner changes roles
    assert client.patch("/towns/town_chai/members/u2", headers=riya, json={"role": "admin"}).status_code == 403
    u4 = u(client, "u4")
    assert client.patch("/towns/town_chai/members/u2", headers=u4, json={"role": "admin"}).json()["role"] == "admin"
    assert client.patch("/towns/town_chai/members/u4", headers=u4, json={"role": "member"}).status_code == 409
    assert client.post("/towns/town_chai/channels", headers=u2, json={"name": "Open Mic"}).status_code == 200  # admin can
    assert client.post("/towns/town_chai/channels", headers=riya, json={"name": "x"}).status_code == 403
    assert client.post("/towns/town_chai/board", headers=riya, json={"text": "x"}).status_code == 403
    # channel messages
    assert client.post("/towns/town_cbe/channels/ch_cbe_general/messages", headers=riya, json={"text": "hello"}).json()["from"] == "me"
    assert client.get("/towns/town_cbe/channels/ch_cbe_general/messages", headers=u2).status_code == 403
    # invite rotate + revoke + notice
    inv = client.post("/towns/town_cbe/invite", headers=riya, json={"to": "u2"}).json()["invite"]; assert inv
    assert client.post("/towns/town_cbe/invite", headers=riya, json={"revoke": True}).json()["invite"] is None
    assert client.post("/towns/town_cbe/leave", headers=riya).status_code == 409
    t = client.post("/towns", headers=u2, json={"name": "Secret Lab", "open": False}).json(); assert t["role"] == "owner" and t["invite"]

# ---------- bridge, pulse ----------
def test_bridge_and_pulse(client, riya):
    p = client.post("/bridge/share", headers=riya, json={"convId": "cv_u1", "type": "post", "id": "p3", "note": "look"}).json()
    assert p["kind"] == "post" and p["ref"]["id"] == "p3"
    d = client.post("/bridge/share", headers=riya, json={"convId": "cv_u1", "type": "loop", "id": "l1"}).json(); assert d["kind"] == "draft"
    assert client.post("/bridge/share", headers=u(client, "u1"), json={"convId": "cv_u1", "type": "loop", "id": "l1"}).status_code == 404  # not own loop
    pu = client.get("/pulse", headers=riya).json()
    assert pu["social"] == 2 and pu["detail"]["requests"] == 1 and pu["detail"]["notices"] == 2 and pu["chat"] == pu["detail"]["messages"] + 3
    client.get("/conv/cv_u1/messages", headers=riya)
    assert client.get("/pulse", headers=riya).json()["detail"]["messages"] < pu["detail"]["messages"] or pu["detail"]["messages"] == 0

# ---------- kill switches + admin ----------
def test_kill_switches(client, riya, admin):
    for k in ("chat", "social", "otp"): client.put(f"/admin/kv/kill/{k}", headers=admin, json={"on": True})
    assert client.get("/conv", headers=riya).status_code == 503 and client.get("/towns", headers=riya).status_code == 503
    assert client.get("/friends", headers=riya).status_code == 503 and client.get("/status", headers=riya).status_code == 503
    assert client.post("/posts", headers=riya, json={"kind": "thought", "text": "x"}).status_code == 503
    assert client.post("/auth/otp/request", json={"identifier": "@aanya.eats"}).status_code == 503
    assert client.get("/bootstrap", headers=riya).status_code == 200

def test_admin_rbac(client, riya, admin):
    client.post("/auth/otp/request", json={"identifier": "@aanya.eats"})
    for path in ("/admin/otp", "/admin/identity", "/admin/towns", "/admin/chat-stats", "/admin/config/layers", "/admin/zones", "/admin/slabs", "/admin/languages"):
        assert client.get(path, headers=riya).status_code == 403, path
        assert client.get(path, headers=admin).status_code == 200, path
    o = client.get("/admin/otp", headers=admin).json()[0]; assert "code" not in o and "***" in o["identifier"] and "*" in o["ip"]
    idn = client.get("/admin/identity", headers=admin).json(); assert any(e["count"] == 2 for e in idn["accountsPerEmail"])
    assert client.get("/admin/chat-stats", headers=admin).json()["towns"] == 3
    assert client.patch("/admin/towns/town_cbe", headers=admin, json={"suspended": True}).json()["suspended"]
    assert client.get("/towns/town_cbe", headers=riya).status_code == 404

# ---------- server-driven config ----------
def test_config_resolution_order_unit():
    ls = {"base": {"limits": {"maxGroupSize": 10}}, "country:US": {"limits": {"maxGroupSize": 20}, "features": {"payouts": False}},
          "zone:GLOBAL": {"limits": {"maxGroupSize": 30}}, "slab:pro": {"limits": {"maxGroupSize": 40}},
          "lang:ta": {"languages": {"strings": {"nav.Home": "முகப்பு"}}}}
    assert R.resolve_with(ls, "IN", "IN-SOUTH", "starter", "en")["limits"]["maxGroupSize"] == 10
    assert R.resolve_with(ls, "US", "IN-SOUTH", "starter", "en")["limits"]["maxGroupSize"] == 20
    assert R.resolve_with(ls, "US", "GLOBAL", "starter", "en")["limits"]["maxGroupSize"] == 30
    c = R.resolve_with(ls, "US", "GLOBAL", "pro", "ta")
    assert c["limits"]["maxGroupSize"] == 40 and c["limits"]["statusHours"] == 24 and not c["features"]["payouts"] and c["features"]["polls"]
    assert c["nav"]["social"][0]["label"] == "முகப்பு" and c["resolvedFor"] == {"country": "US", "zone": "GLOBAL", "slab": "pro", "lang": "ta"}
    assert R.zone_for("IN", R.DEFAULT_ZONES) == "IN-SOUTH" and R.zone_for("FR", R.DEFAULT_ZONES) == "GLOBAL"
    assert R.slab_for(0, R.DEFAULT_SLABS) == "starter" and R.slab_for(5000, R.DEFAULT_SLABS) == "rising" and R.slab_for(10**6, R.DEFAULT_SLABS) == "pro"
    assert R.deep_merge({"a": {"b": 1, "c": 2}}, {"a": {"b": 3}}) == {"a": {"b": 3, "c": 2}}

def test_config_validation_unit():
    off = lambda mod, keys: {"nav": {mod: [{"key": k, "enabled": False} for k in keys]}}
    assert "nav item" in R.validate_layer("base", off("chat", ["Chats", "Friends", "Vibes", "Towns", "ChatMe"]), {})
    assert R.validate_layer("base", off("chat", ["Chats", "Friends", "Vibes", "Towns"]), {}) is None
    assert R.validate_layer("country:US", {**off("chat", ["Chats", "Friends", "Vibes", "Towns", "ChatMe"]), "modules": {"chat": False}}, {}) is None
    assert "nav item" in R.validate_layer("zone:X", off("chat", ["ChatMe"]), {"base": off("chat", ["Chats", "Friends", "Vibes", "Towns"])})
    assert R.validate_layer("bogus", {}, {}) and R.validate_layer("country:usa", {}, {})
    assert R.validate_layer("lang:hi", {"features": {"polls": False}}, {}) and R.validate_layer("lang:hi", {"languages": {"strings": {"a": "b"}}}, {}) is None
    assert R.validate_layer("base", {"features": {"polls": "no"}}, {}) and R.validate_layer("base", {"wat": 1}, {})

def test_app_config_endpoint_and_admin(client, riya, admin):
    c = client.get("/app-config").json()
    assert c["resolvedFor"]["country"] == "IN" and c["resolvedFor"]["zone"] == "IN-SOUTH" and c["banner"]["suggestLang"] == "ta"
    assert [n["key"] for n in c["nav"]["chat"]] == ["Chats", "Friends", "Vibes", "Towns", "ChatMe"]
    us = client.get("/app-config?country=US&lang=hi").json()
    assert not us["features"]["payouts"] and not us["screens"]["Payout"] and us["nav"]["social"][0]["label"] == "हब"
    assert client.get("/app-config", headers={"X-Country": "US"}).json()["resolvedFor"]["country"] == "US"
    assert len(client.get("/app-config?lang=te").json()["languages"]["strings"]) >= 40
    assert client.get("/app-config", headers=riya).json()["resolvedFor"]["slab"] == "starter"
    assert client.get("/admin/config/preview?slab=pro", headers=admin).json()["fees"]["platformFee"] == 0.06
    v0 = client.get("/app-config").json()["version"]
    bad = {"nav": {"social": [{"key": k, "enabled": False} for k in ["Home", "Explore", "Create", "Motion", "Profile"]]}}
    assert client.put("/admin/config/base", headers=admin, json=bad).status_code == 400
    assert client.put("/admin/config/base", headers=riya, json={}).status_code == 403
    assert client.put("/admin/config/zone:IN-SOUTH", headers=admin, json={"screens": {"Towns": False}}).json()["version"] == v0 + 1
    assert client.get("/towns", headers=riya).status_code == 403   # screen off → API 403
    assert client.delete("/admin/config/zone:IN-SOUTH", headers=admin).status_code == 200 and client.get("/towns", headers=riya).status_code == 200
    assert client.delete("/admin/config/base", headers=admin).status_code == 400
    client.patch("/me/profile", headers=riya, json={"country": "US"})
    t = client.post("/approvals", headers=riya, json={"action": "payout", "payload": "600"}).json()["token"]
    assert client.post("/payouts", headers=riya, json={"amount": 600, "approvalToken": t}).status_code == 403
    client.put("/admin/config/country:FR", headers=admin, json={"modules": {"chat": False}})
    client.patch("/me/profile", headers=riya, json={"country": "FR"})
    assert client.get("/conv", headers=riya).status_code == 503 and client.get("/conv", headers=u(client, "u1")).status_code == 200
    assert client.put("/admin/slabs", headers=admin, json=[{"key": "all", "minFollowers": 0}]).status_code == 200
    assert client.put("/admin/languages", headers=admin, json={"available": ["en"], "default": "hi"}).status_code == 400


def test_config_language_does_not_leak_between_requests(client):
    ta = client.get("/app-config?lang=ta&country=IN").json()
    en = client.get("/app-config?lang=en&country=US").json()
    assert ta["nav"]["social"][0]["label"] != en["nav"]["social"][0]["label"]
    assert en["nav"]["social"][0]["label"] == "Hub"

# ---------- themes ----------
def test_theme_merge_order_unit():
    ls = {"base": {"theme": {"social": {"accent": "#111111"}}}, "country:US": {"theme": {"social": {"preset": "ocean"}, "chat": {"preset": "coral"}}},
          "zone:GLOBAL": {"theme": {"social": {"radius": "sharp"}}}, "slab:pro": {"theme": {"chat": {"preset": "midnight", "density": "compact"}}}}
    b = R.resolve_with(ls, "IN", "IN-SOUTH", "starter", "en")["theme"]
    assert b["social"]["preset"] == "prism" and b["social"]["accent"] == "#111111" and b["chat"]["preset"] == "aqua" and b["hash"]
    us = R.resolve_with(ls, "US", "IN-SOUTH", "starter", "en")["theme"]
    assert us["social"]["primary"] == "#2563EB" and us["chat"]["primary"] == "#FF6B5A"
    g = R.resolve_with(ls, "US", "GLOBAL", "pro", "en")["theme"]
    assert g["social"]["radius"] == "sharp" and g["social"]["primary"] == "#2563EB" and g["chat"]["primary"] == "#7C3AED" and g["chat"]["density"] == "compact"
    assert len({b["hash"], us["hash"], g["hash"]}) == 3
    assert R.resolve_with(ls, "IN", "IN-SOUTH", "starter", "en")["theme"]["hash"] == b["hash"]

def test_theme_api_validation(client, admin):
    us = client.get("/app-config?country=US").json()["theme"]
    assert us["social"]["preset"] == "ocean" and us["chat"]["preset"] == "coral"
    p = client.get("/admin/theme/presets", headers=admin).json()
    assert [x["key"] for x in p["social"]] == ["prism", "sunset", "ocean"] and [x["key"] for x in p["chat"]] == ["aqua", "midnight", "coral"]
    r = client.put("/admin/config/zone:GLOBAL", headers=admin, json={"theme": {"social": {"primary": "#12345"}}})
    assert r.status_code == 422 and "#RRGGBB" in r.json()["detail"]
    r = client.put("/admin/config/zone:GLOBAL", headers=admin, json={"theme": {"chat": {"ink": "#DDDDDD"}}})
    assert r.status_code == 422 and "contrast" in r.json()["detail"]
    assert client.put("/admin/config/zone:GLOBAL", headers=admin, json={"theme": {"chat": {"navStyle": "rail"}}}).status_code == 422
    assert client.put("/admin/config/lang:hi", headers=admin, json={"theme": {"social": {"preset": "sunset"}}}).status_code == 400
    h0 = client.get("/app-config?country=FR").json()["theme"]["hash"]
    assert client.put("/admin/config/zone:GLOBAL", headers=admin, json={"theme": {"social": {"preset": "sunset"}}}).status_code == 200
    t = client.get("/app-config?country=FR").json()["theme"]
    assert t["social"]["primary"] == "#FF5A5F" and t["hash"] != h0
    client.delete("/admin/config/zone:GLOBAL", headers=admin)


PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
def test_media_upload_and_post_fields(client, riya):
    bad = client.post("/media", headers=riya, files={"file": ("x.png", b"<html>not an image</html>", "image/png")})
    assert bad.status_code == 415                                    # type from magic bytes, not the filename
    up = client.post("/media", headers=riya, files={"file": ("a.png", PNG, "image/png")}); assert up.status_code == 200
    url = up.json()["url"]; assert client.get(url).status_code == 200
    p = client.post("/posts", headers=riya, json={"kind": "photo", "text": "Lens test #chai @aanya.eats", "mediaUrl": url, "lens": "festival", "lat": 11.0, "lng": 76.9,
                                                  "place": "Coimbatore", "tags": ["chai", "@aanya.eats"], "collab": "@aanya.eats", "sound": "Chai Lofi", "audience": "circle"})
    assert p.status_code == 200, p.text; j = p.json(); assert j["lens"] == "festival" and j["mediaUrl"] == url and j["collab"] == "@aanya.eats"
    assert client.post("/posts", headers=riya, json={"kind": "photo", "text": "x", "lens": "fake"}).status_code == 400
    assert client.post("/posts", headers=riya, json={"kind": "photo", "text": "x", "mediaUrl": "/media/doesnotexist.png"}).status_code == 400
    assert client.post("/posts", headers=riya, json={"kind": "photo", "text": "x", "collab": "@nobody.here"}).status_code == 404
    assert client.post("/media", files={"file": ("a.png", PNG, "image/png")}).status_code == 401

def test_quick_story_timer(client, riya):
    s = client.post("/sparks", headers=riya, json={"text": "Quick story", "lens": "sparkle", "hours": 1}); assert s.status_code == 200
    assert client.post("/sparks", headers=riya, json={"text": "x", "hours": 5}).status_code == 400
    sp = client.get("/bootstrap", headers=riya).json()["social"]["sparks"]; assert any(x["id"] == s.json()["id"] and x["by"] == "me" for x in sp)
