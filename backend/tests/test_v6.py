import base64, os, hmac, hashlib
import pytest
from starlette.websockets import WebSocketDisconnect
from app import push
from app.db import SessionLocal
from app import models as M
from tests.conftest import login
from tests.test_v5 import set_features

push.SYNC = True
def u(c, id): return login(c, f"{id}@demo.vibeloop.app")
def tok(h): return h["Authorization"][7:]
def key(n=1): return base64.b64encode(bytes([n]) * 32).decode()
PNG = b"\x89PNG\r\n\x1a\n" + os.urandom(64)

def upload_png(c, h):
    r = c.post("/media", headers=h, files={"file": ("a.png", PNG, "image/png")}); assert r.status_code == 200, r.text; return r.json()["url"]

def recv_until(ws, typ, n=10):
    for _ in range(n):
        e = ws.receive_json()
        if e["type"] == typ: return e
    raise AssertionError(f"no {typ}")

class FakeResp:
    def __init__(self, code, body): self.status_code, self._b = code, body
    def json(self): return self._b

@pytest.fixture()
def expo(monkeypatch):
    sent = []
    def fake(url, json=None, headers=None, timeout=None):
        sent.append({"url": url, "json": json, "headers": headers})
        return FakeResp(200, {"data": [{"status": "error", "message": "x", "details": {"error": "DeviceNotRegistered"}} if "dead" in m["to"] else {"status": "ok", "id": "t"} for m in json]})
    monkeypatch.setattr(push.httpx, "post", fake); return sent

# ---------- config ----------
def test_app_config_flags_rtc_screens(client):
    cfg = client.get("/app-config").json()
    for f in ["realtime", "readReceipts", "typing", "voiceNotes", "calls", "push", "e2ee", "snaps", "storyViewers", "followRequests", "liveCamera", "demoMode"]: assert cfg["features"][f] is True
    assert cfg["rtc"]["iceServers"][0]["urls"] == ["stun:stun.l.google.com:19302"]
    assert {"CreatorHub", "CreateHub", "Vault", "Loops", "IconKit"} <= set(cfg["screens"])

def test_rtc_layer_rejects_turn_creds(client, admin):
    r = client.put("/admin/config/base", headers=admin, json={"rtc": {"iceServers": [{"urls": ["turn:x"], "username": "a", "credential": "b"}]}}); assert r.status_code == 400
    assert client.put("/admin/config/base", headers=admin, json={"rtc": {"iceServers": [{"urls": ["stun:stun.example.com:3478"]}]}}).status_code == 200
    assert client.get("/app-config").json()["rtc"]["iceServers"][0]["urls"] == ["stun:stun.example.com:3478"]

# ---------- realtime ----------
def test_ws_auth(client, riya, admin):
    for bad in ("", "nope"):
        with client.websocket_connect(f"/ws?token={bad}") as ws:
            with pytest.raises(WebSocketDisconnect) as e: ws.receive_json()
            assert e.value.code == 4401
    set_features(client, admin, realtime=False)
    with client.websocket_connect(f"/ws?token={tok(riya)}") as ws:
        with pytest.raises(WebSocketDisconnect) as e: ws.receive_json()
        assert e.value.code == 4403

def test_ws_suspended(client, admin):
    h = u(client, "u1")
    db = SessionLocal(); db.get(M.User, "u1").suspended = True; db.commit(); db.close()
    with client.websocket_connect(f"/ws?token={tok(h)}") as ws:
        with pytest.raises(WebSocketDisconnect) as e: ws.receive_json()
        assert e.value.code == 4403

def test_ws_message_typing_receipts(client, riya, admin):
    a1 = u(client, "u1")
    with client.websocket_connect(f"/ws?token={tok(a1)}") as ws:
        assert ws.receive_json()["type"] == "hello"
        ws.send_json({"type": "ping"}); assert recv_until(ws, "pong")
        r = client.post("/conv/cv_u1/messages", headers=riya, json={"text": "hey there"}).json()
        e = recv_until(ws, "message.new"); assert e["convId"] == "cv_u1" and e["message"]["text"] == "hey there" and e["message"]["from"] == "usr_riya"
        assert r["status"] == "delivered"  # u1 had a live socket
        with client.websocket_connect(f"/ws?token={tok(riya)}") as rws:
            recv_until(rws, "hello")
            ws.send_json({"type": "typing", "convId": "cv_u1", "on": True})
            t = recv_until(rws, "typing"); assert t == {"type": "typing", "convId": "cv_u1", "userId": "u1", "on": True}
            ws.send_json({"type": "read", "convId": "cv_u1", "upTo": r["id"]})
            rc = recv_until(rws, "receipt"); assert rc["kind"] == "read" and rc["messageId"] == r["id"] and rc["userId"] == "u1"
            ws.send_json({"type": "typing", "convId": "cv_nope", "on": True}); assert recv_until(ws, "error")["code"] == "not_found"
    msgs = client.get("/conv/cv_u1/messages", headers=riya).json()
    assert next(m for m in msgs if m["id"] == r["id"])["status"] == "read"
    assert all(m["status"] is None for m in msgs if m["from"] != "me")
    st = client.get("/admin/realtime", headers=admin).json(); assert st["connections"] == 0 and sum(x["count"] for x in st["eventsPerMinute"]) > 0
    assert client.get("/admin/realtime", headers=riya).status_code == 403

def test_receipts_rest_and_reciprocal(client, riya, admin):
    a1 = u(client, "u1")
    m = client.post("/conv/cv_u1/messages", headers=riya, json={"text": "one"}).json(); assert m["status"] == "sent"
    client.get("/conv/cv_u1/messages", headers=a1)  # fetch → delivered
    assert client.get("/conv/cv_u1/messages", headers=riya).json()[-1]["status"] == "delivered"
    assert client.post("/conv/cv_u1/read", headers=a1, json={"upTo": m["id"]}).status_code == 200
    assert client.get("/conv/cv_u1/messages", headers=riya).json()[-1]["status"] == "read"
    # riya turns receipts off → she no longer sees "read"
    db = SessionLocal(); x = db.get(M.User, "usr_riya"); x.profile = {**(x.profile or {}), "chat_read_receipts": False}; db.commit(); db.close()
    assert client.get("/conv/cv_u1/messages", headers=riya).json()[-1]["status"] == "delivered"
    # and her reads aren't recorded for u1
    m2 = client.post("/conv/cv_u1/messages", headers=a1, json={"text": "two"}).json()
    client.post("/conv/cv_u1/read", headers=riya, json={"upTo": m2["id"]})
    assert client.get("/conv/cv_u1/messages", headers=a1).json()[-1]["status"] == "delivered"
    assert client.post("/conv/cv_u1/read", headers=a1, json={"upTo": "cm_nope"}).status_code == 400
    set_features(client, admin, readReceipts=False)
    assert client.post("/conv/cv_u1/read", headers=a1, json={"upTo": m2["id"]}).status_code == 403
    assert client.get("/conv/cv_u1/messages", headers=a1).json()[-1]["status"] is None

def test_ghost_no_typing_no_presence(client, riya):
    db = SessionLocal(); x = db.get(M.User, "u1"); x.profile = {**(x.profile or {}), "ghost_hours": True}; db.commit(); db.close()
    a1 = u(client, "u1")
    with client.websocket_connect(f"/ws?token={tok(riya)}") as rws:
        recv_until(rws, "hello")
        with client.websocket_connect(f"/ws?token={tok(a1)}") as ws:
            recv_until(ws, "hello")
            ws.send_json({"type": "typing", "convId": "cv_u1", "on": True}); ws.send_json({"type": "ping"}); recv_until(ws, "pong")
        rws.send_json({"type": "ping"})
        assert rws.receive_json()["type"] == "pong"  # nothing (no presence, no typing) arrived before the pong

def test_presence_for_friends(client, riya):
    a1 = u(client, "u1")
    with client.websocket_connect(f"/ws?token={tok(riya)}") as rws:
        recv_until(rws, "hello")
        with client.websocket_connect(f"/ws?token={tok(a1)}") as ws:
            recv_until(ws, "hello")
            p = recv_until(rws, "presence"); assert p["userId"] == "u1" and p["online"] is True
        p = recv_until(rws, "presence"); assert p["online"] is False and p["lastSeen"]

def test_notice_new_event(client, riya):
    a5 = u(client, "u5")
    with client.websocket_connect(f"/ws?token={tok(riya)}") as rws:
        recv_until(rws, "hello")
        client.post("/conv/cv_u1/messages", headers=u(client, "u1"), json={"text": "yo"})
        n = recv_until(rws, "notice.new"); assert n["notice"]["kind"] == "message" and n["notice"]["body"] == "yo"

# ---------- voice + snaps ----------
def test_voice_note(client, riya, admin):
    from tests.test_v4 import upload
    a = upload(client, riya, "note.m4a", b"\x00\x00\x00\x18ftypM4A " + os.urandom(200))
    r = client.post("/conv/cv_u1/messages", headers=riya, json={"kind": "voice", "attachment": {"url": a["url"]}, "durationSec": 12})
    assert r.status_code == 200, r.text; m = r.json(); assert m["kind"] == "voice" and m["attachment"]["durationSec"] == 12
    assert client.post("/conv/cv_u1/messages", headers=riya, json={"kind": "voice", "attachment": {"url": a["url"]}, "durationSec": 301}).status_code == 422
    assert client.post("/conv/cv_u1/messages", headers=riya, json={"kind": "voice", "attachment": {"url": a["url"]}}).status_code == 400
    img = upload_png(client, riya)
    assert client.post("/conv/cv_u1/messages", headers=riya, json={"kind": "voice", "attachment": {"url": img}, "durationSec": 3}).status_code == 400
    set_features(client, admin, voiceNotes=False)
    assert client.post("/conv/cv_u1/messages", headers=riya, json={"kind": "voice", "attachment": {"url": a["url"]}, "durationSec": 3}).status_code == 403

def test_snap_open_once_and_revoked(client, riya):
    a1 = u(client, "u1"); url = upload_png(client, riya); name = url.split("/")[-1]
    m = client.post("/conv/cv_u1/messages", headers=riya, json={"kind": "snap", "attachment": {"url": url}}).json()
    assert m["kind"] == "snap" and abs(m["expiresAt"] - m["at"] - 86_400_000) < 5000
    seen = client.get("/conv/cv_u1/messages", headers=a1).json()[-1]
    assert seen["attachment"]["locked"] and seen["attachment"]["url"] is None
    assert client.get(f"/media/{name}", headers=a1).status_code == 404  # not via conv membership
    assert client.get(f"/media/{name}", headers=riya).status_code == 200  # sender keeps it
    o = client.post(f"/messages/{m['id']}/open", headers=a1).json()
    assert client.get(o["mediaUrl"]).status_code == 200
    assert client.post(f"/messages/{m['id']}/open", headers=a1).status_code == 409
    assert client.post("/conv/cv_u1/messages", headers=riya, json={"kind": "snap", "attachment": {"url": url}}).status_code == 400  # fresh upload only
    assert client.post("/posts", headers=riya, json={"kind": "photo", "text": "x", "mediaUrl": url}).status_code in (400, 422)
    assert client.post(f"/messages/{m['id']}/screenshot", headers=a1).json() == {"ok": True}
    assert client.post(f"/messages/{m['id']}/screenshot", headers=riya).status_code == 400
    assert any(n["kind"] == "screenshot" for n in client.get("/bootstrap", headers=riya).json()["notices"])

def test_snap_link_expires(client, riya, monkeypatch):
    from app import routes_media as RM
    a1 = u(client, "u1"); url = upload_png(client, riya)
    m = client.post("/conv/cv_u1/messages", headers=riya, json={"kind": "snap", "attachment": {"url": url}}).json()
    link = client.post(f"/messages/{m['id']}/open", headers=a1).json()["mediaUrl"]
    real = RM.time.time; monkeypatch.setattr(RM.time, "time", lambda: real() + 120)
    assert client.get(link).status_code == 404

# ---------- calls ----------
def test_call_flow_and_log(client, riya, admin):
    a1 = u(client, "u1")
    with client.websocket_connect(f"/ws?token={tok(riya)}") as rws, client.websocket_connect(f"/ws?token={tok(a1)}") as ws:
        recv_until(rws, "hello"); recv_until(ws, "hello")
        rws.send_json({"type": "call.invite", "callId": "call_t1", "to": "u1", "media": "video", "sdp": "v=0"})
        assert recv_until(rws, "call.ringing")["callId"] == "call_t1"
        inv = recv_until(ws, "call.invite"); assert inv["from"]["id"] == "usr_riya" and inv["sdp"] == "v=0"
        ws.send_json({"type": "call.ice", "callId": "call_t1", "candidate": {"c": 1}}); assert recv_until(rws, "call.ice")["candidate"] == {"c": 1}
        ws.send_json({"type": "call.answer", "callId": "call_t1", "sdp": "ans"}); assert recv_until(rws, "call.answer")["sdp"] == "ans"
        rws.send_json({"type": "call.end", "callId": "call_t1"}); assert recv_until(ws, "call.end")["status"] == "ended"
        # missed: caller hangs up before answer
        rws.send_json({"type": "call.invite", "callId": "call_t2", "to": "u1", "media": "audio", "sdp": "v=0"}); recv_until(rws, "call.ringing")
        rws.send_json({"type": "call.end", "callId": "call_t2"}); assert recv_until(ws, "call.end")["status"] == "missed"
        ws.send_json({"type": "call.invite", "to": "x1", "media": "audio", "sdp": "v"}); assert recv_until(ws, "error")["code"] == "call_not_allowed"
    log = client.get("/calls", headers=a1).json()
    assert [(c["id"], c["status"], c["direction"]) for c in log[:2]] == [("call_t2", "missed", "in"), ("call_t1", "ended", "in")]
    assert any(n["kind"] == "call" for n in client.get("/bootstrap", headers=a1).json()["notices"])
    al = client.get("/admin/calls?status=missed", headers=admin).json(); assert "call_t2" in [c["id"] for c in al] and {c["status"] for c in al} == {"missed"}
    assert client.get("/admin/calls?q=riya", headers=admin).json()
    set_features(client, admin, calls=False)
    assert client.get("/calls", headers=a1).status_code == 403

def test_ice_servers_turn_hmac(client, riya, admin):
    assert client.get("/rtc/ice", headers=riya).json()["iceServers"] == [{"urls": ["stun:stun.l.google.com:19302"]}]
    client.put("/admin/integrations", headers=admin, json={"turn": {"urls": "turn:turn.example.com:3478,turns:turn.example.com:5349", "sharedSecret": "s3cret"}})
    ice = client.get("/rtc/ice", headers=riya).json(); t = ice["iceServers"][-1]
    assert ice["ttl"] == 3600 and t["username"].endswith(":usr_riya")
    assert t["credential"] == base64.b64encode(hmac.new(b"s3cret", t["username"].encode(), hashlib.sha1).digest()).decode()
    pub = client.get("/admin/integrations", headers=admin).json()["turn"]; assert pub["configured"] and "s3cret" not in str(pub)
    assert client.post("/admin/integrations/turn/test", headers=admin).json()["ok"]
    assert "turn" not in str(client.get("/app-config").json()["rtc"])
    client.put("/admin/integrations", headers=admin, json={"turn": {"urls": "http://bad", "sharedSecret": None, "credential": "pw", "username": "me"}})
    assert client.post("/admin/integrations/turn/test", headers=admin).json()["ok"] is False

# ---------- push ----------
def test_push_tokens_and_dm_push(client, riya, admin, expo):
    a1 = u(client, "u1")
    assert client.post("/push/token", headers=a1, json={"token": "nope-token", "platform": "ios", "provider": "expo"}).status_code == 400
    assert client.post("/push/token", headers=a1, json={"token": "ExponentPushToken[abc]", "platform": "ios"}).status_code == 200
    assert client.post("/push/token", headers=a1, json={"token": "ExponentPushToken[dead]", "platform": "android"}).status_code == 200
    assert client.post("/push/token", headers=a1, json={"token": "fcm-token-123", "platform": "android", "provider": "fcm"}).status_code == 200
    client.post("/conv/cv_u1/messages", headers=riya, json={"text": "secret plans"})
    assert len(expo) == 1 and {m["to"] for m in expo[0]["json"]} == {"ExponentPushToken[abc]", "ExponentPushToken[dead]"} and expo[0]["json"][0]["body"] == "secret plans"
    st = client.get("/admin/push/stats", headers=admin).json()
    assert st["tokens"]["total"] == 2 and st["last24h"] == {"sent": 1, "failed": 1, "skipped": 1}  # dead token removed
    assert st["tokens"]["byProvider"] == {"expo": 1, "fcm": 1}
    # muted conv → no push
    client.patch("/conv/cv_u1", headers=a1, json={"muted": True}); n = len(expo)
    client.post("/conv/cv_u1/messages", headers=riya, json={"text": "again"}); assert len(expo) == n
    client.patch("/conv/cv_u1", headers=a1, json={"muted": False})
    # quiet hours all day → no push
    db = SessionLocal(); x = db.get(M.User, "u1"); x.settings = {"quietHours": {"on": True, "from": 0, "to": 0}}; db.commit(); db.close()
    assert push.in_quiet_hours({"quietHours": {"on": True, "from": 22, "to": 7, "tzOffsetMin": 0}}, __import__("datetime").datetime(2026, 1, 1, 23, tzinfo=__import__("datetime").timezone.utc))
    db = SessionLocal(); x = db.get(M.User, "u1"); x.settings = {"quietHours": {"on": True, "from": 0, "to": 23, "tzOffsetMin": 0}}; db.commit(); db.close()
    import datetime as dt
    if dt.datetime.now(dt.timezone.utc).hour < 23:
        client.post("/conv/cv_u1/messages", headers=riya, json={"text": "quiet"}); assert len(expo) == n
    db = SessionLocal(); x = db.get(M.User, "u1"); x.settings = {}; db.commit(); db.close()
    # admin test send + delete token
    r = client.post("/admin/push/test", headers=admin, json={"userId": "u1"}).json(); assert r["queued"] and r["tokens"] == 2
    assert client.request("DELETE", "/push/token", headers=a1, json={"token": "ExponentPushToken[abc]"}).status_code == 200
    assert client.post("/admin/push/test", headers=admin, json={"userId": "usr_riya"}).json()["queued"] is False
    set_features(client, admin, push=False)
    assert client.post("/push/token", headers=a1, json={"token": "ExponentPushToken[x2]", "platform": "ios"}).status_code == 403

def test_push_friend_request_and_mention(client, riya, expo):
    a6 = u(client, "u6"); client.post("/push/token", headers=a6, json={"token": "ExponentPushToken[u6]", "platform": "ios"})
    client.post("/conv/cv_weekend/messages", headers=riya, json={"text": "hey @" + client.get("/me", headers=a6).json()["handle"].lstrip("@")})
    kinds = [m["json"][0]["data"]["kind"] for m in expo]; assert "mention" in kinds and "message" not in kinds  # groups: no per-message notice, mention only

def test_expo_test_reachability(client, admin, monkeypatch):
    from app import routes_integrations as RI
    monkeypatch.setattr(RI.httpx, "post", lambda *a, **k: FakeResp(200, {"data": [{"status": "error", "details": {"error": "DeviceNotRegistered"}}]}))
    r = client.post("/admin/integrations/expo/test", headers=admin).json(); assert r["ok"] and "rejected as expected" in r["message"]
    monkeypatch.setattr(RI.httpx, "post", lambda *a, **k: FakeResp(401, {}))
    client.put("/admin/integrations", headers=admin, json={"expo": {"accessToken": "bad-token"}})
    assert client.post("/admin/integrations/expo/test", headers=admin).json()["ok"] is False
    assert "bad-token" not in str(client.get("/admin/integrations", headers=admin).json())

# ---------- e2ee ----------
def test_e2ee_keys_and_encrypted_messages(client, riya, admin, expo):
    a1 = u(client, "u1")
    assert client.put("/keys", headers=riya, json={"publicKey": base64.b64encode(b"x" * 31 + b"").decode().ljust(44, "="), "deviceId": "d1"}).status_code == 400
    assert client.put("/keys", headers=riya, json={"publicKey": key(1), "deviceId": "phone"}).status_code == 200
    conv = next(c for c in client.get("/conv", headers=riya).json() if c["id"] == "cv_u1"); assert conv["e2ee"] is False
    enc = {"v": 1, "nonce": base64.b64encode(b"n" * 24).decode(), "box": base64.b64encode(b"c" * 40).decode(), "senderKey": key(1)}
    assert client.post("/conv/cv_u1/messages", headers=riya, json={"enc": enc}).status_code == 409
    client.put("/keys", headers=a1, json={"publicKey": key(2), "deviceId": "pixel"})
    assert client.get("/users/u1/keys", headers=riya).json()[0]["publicKey"] == key(2)
    assert next(c for c in client.get("/conv", headers=riya).json() if c["id"] == "cv_u1")["e2ee"] is True
    client.post("/push/token", headers=a1, json={"token": "ExponentPushToken[e2]", "platform": "ios"})
    m = client.post("/conv/cv_u1/messages", headers=riya, json={"enc": enc}).json()
    assert m["text"] == "[encrypted]" and m["enc"] == enc
    assert expo[-1]["json"][0]["body"] == "New message"
    assert client.post("/conv/cv_u1/messages", headers=riya, json={"enc": enc, "text": "plain"}).status_code == 400
    assert client.patch(f"/messages/{m['id']}", headers=riya, json={"text": "x"}).status_code == 409
    assert client.get("/search/messages?q=encrypted", headers=riya).json() == []
    e = client.get("/admin/e2ee", headers=admin).json(); assert e["usersWithKeys"] == 4 and e["encryptedMessages"] == 1 and e["e2eeConvs"] >= 1
    set_features(client, admin, e2ee=False)
    assert client.put("/keys", headers=riya, json={"publicKey": key(3), "deviceId": "tab"}).status_code == 403

# ---------- story viewers ----------
def test_spark_viewers_and_reply(client, riya, admin):
    a1 = u(client, "u1")
    s = client.post("/sparks", headers=riya, json={"text": "my blink"}).json()
    assert client.post(f"/sparks/{s['id']}/view", headers=a1).status_code == 200
    client.post(f"/sparks/{s['id']}/view", headers=a1)
    client.post(f"/sparks/{s['id']}/view", headers=riya)  # own view not counted
    v = client.get(f"/sparks/{s['id']}/viewers", headers=riya).json(); assert [x["user"]["id"] for x in v] == ["u1"]
    assert client.get(f"/sparks/{s['id']}/viewers", headers=a1).status_code == 404
    mine = next(x for x in client.get("/bootstrap", headers=riya).json()["social"]["sparks"] if x["id"] == s["id"]); assert mine["viewCount"] == 1
    r = client.post(f"/sparks/{s['id']}/reply", headers=a1, json={"text": "love it"}).json()
    assert r["message"]["ref"]["type"] == "spark" and "love it" in r["message"]["text"]
    url = upload_png(client, a1)
    r = client.post(f"/sparks/{s['id']}/reply", headers=a1, json={"attachment": {"url": url}}).json(); assert r["message"]["kind"] == "snap"
    assert client.post("/sparks/s2/view", headers=u(client, "u6")).status_code == 404  # close-friends blink
    set_features(client, admin, storyViewers=False)
    assert client.post(f"/sparks/{s['id']}/view", headers=a1).status_code == 403

# ---------- follow requests ----------
def test_follow_requests_private_profile(client, riya, admin):
    a5 = u(client, "u5")
    db = SessionLocal(); x = db.get(M.User, "usr_riya"); x.profile = {**(x.profile or {}), "social_private": True}; db.commit(); db.close()
    assert not any(p["id"] for p in client.get("/feed?mode=fresh", headers=a5).json()["items"] if p.get("author", {}).get("id") == "usr_riya" or p.get("by") == "usr_riya")
    r = client.post("/edges/follow/usr_riya", headers=a5).json(); assert r == {"on": False, "state": "requested"}
    assert client.post("/edges/follow/usr_riya", headers=a5).json()["state"] == "none"  # cancel
    client.post("/edges/follow/usr_riya", headers=a5)
    inc = client.get("/follow/requests", headers=riya).json()["incoming"]; assert inc[0]["user"]["id"] == "u5"
    assert client.get("/follow/requests", headers=a5).json()["outgoing"][0]["user"]["id"] == "usr_riya"
    assert any(n["kind"] == "follow_request" for n in client.get("/bootstrap", headers=riya).json()["notices"])
    assert client.post(f"/follow/requests/{inc[0]['id']}/accept", headers=a5).status_code == 404
    assert client.post(f"/follow/requests/{inc[0]['id']}/accept", headers=riya).json()["status"] == "accepted"
    assert "usr_riya" in client.get("/bootstrap", headers=a5).json()["social"]["following"]
    assert client.post("/edges/follow/usr_riya", headers=a5).json() == {"on": False, "state": "none"}  # unfollow is direct

def test_private_posts_hidden(client, riya, admin):
    a5 = u(client, "u5")
    p = client.post("/posts", headers=riya, json={"kind": "thought", "text": "private drop"}); assert p.status_code == 200, p.text
    pid = p.json()["id"]
    db = SessionLocal(); x = db.get(M.User, "usr_riya"); x.profile = {**(x.profile or {}), "social_private": True}; db.commit(); db.close()
    ids = lambda h: {q["id"] for q in client.get("/bootstrap", headers=h).json()["social"]["posts"]}
    assert pid not in ids(a5) and pid in ids(riya)
    assert pid not in {q["id"] for q in client.get("/feed?mode=fresh", headers=a5).json()["items"]}
    assert client.post(f"/posts/{pid}/share", headers=a5, json={}).status_code == 404
    set_features(client, admin, followRequests=False)
    assert pid in ids(a5)
    assert client.post("/edges/follow/usr_riya", headers=a5).json() == {"on": True, "state": "following"}
