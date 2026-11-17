"""Hush Control Room settings are enforced server-side."""
from app.db import SessionLocal
from app import models as M
from tests.conftest import login
from tests.test_v6 import u, tok, recv_until, upload_png, expo  # noqa: F401

def set_hush(uid, **kv):
    db = SessionLocal(); x = db.get(M.User, uid); s = dict(x.settings or {}); s["hush"] = {**(s.get("hush") or {}), **kv}; x.settings = s; db.commit(); db.close()

def test_typing_hidden(client, riya):
    set_hush("u1", typingVisible=False); a1 = u(client, "u1")
    with client.websocket_connect(f"/ws?token={tok(riya)}") as rws:
        recv_until(rws, "hello")
        with client.websocket_connect(f"/ws?token={tok(a1)}") as ws:
            recv_until(ws, "hello")
            ws.send_json({"type": "typing", "convId": "cv_u1", "on": True}); ws.send_json({"type": "ping"}); recv_until(ws, "pong")
        rws.send_json({"type": "ping"})
        for _ in range(5):
            e = rws.receive_json(); assert e["type"] != "typing"
            if e["type"] == "pong": break

def test_who_can_call(client, riya):
    a1 = u(client, "u1")
    with client.websocket_connect(f"/ws?token={tok(riya)}") as rws:
        recv_until(rws, "hello")
        set_hush("u1", whoCanCall="nobody")
        rws.send_json({"type": "call.invite", "callId": "call_h1", "to": "u1", "media": "audio", "sdp": "v=0"})
        assert recv_until(rws, "error")["code"] == "call_not_allowed"
        set_hush("u1", whoCanCall="friends")
        rws.send_json({"type": "call.invite", "callId": "call_h2", "to": "u1", "media": "audio", "sdp": "v=0"})
        assert recv_until(rws, "call.ringing")["callId"] == "call_h2"
    assert a1

def test_photo_visibility(client, riya):
    db = SessionLocal(); x = db.get(M.User, "u1"); x.avatar_chat = "/media/abc.png"; db.commit(); db.close()
    stranger = u(client, "u2")
    def av(h): return next((m["avatar"] for c in client.get("/conv", headers=h).json() for m in c["members"] if m["id"] == "u1"), "missing")
    from app.v2common import user_json, VIEWER, MODULE
    def view(viewer):
        db = SessionLocal(); x = db.get(M.User, "u1"); t1 = VIEWER.set({"id": viewer, "lsv": True}); t2 = MODULE.set("chat")
        try: return user_json(x)["avatar"]
        finally: VIEWER.reset(t1); MODULE.reset(t2); db.close()
    friend = "usr_riya"
    set_hush("u1", photoVisibility="everyone"); assert view(friend) == "/media/abc.png" and view("u2") == "/media/abc.png"
    set_hush("u1", photoVisibility="friends"); assert view(friend) == "/media/abc.png" and view("u2") is None and view("u1") == "/media/abc.png"
    set_hush("u1", photoVisibility="nobody"); assert view(friend) is None
    assert av(riya) is None  # end to end through GET /conv
    set_hush("u1", photoVisibility="everyone"); assert stranger

def test_push_toggles(client, riya, expo):
    a1 = u(client, "u1"); client.post("/push/token", headers=a1, json={"token": "ExponentPushToken[h1]", "platform": "ios"})
    set_hush("u1", notif={"messages": True, "previews": False})
    client.post("/conv/cv_u1/messages", headers=riya, json={"text": "secret"}); assert expo[-1]["json"][0]["body"] == "New message"
    n = len(expo); set_hush("u1", notif={"messages": False})
    client.post("/conv/cv_u1/messages", headers=riya, json={"text": "again"}); assert len(expo) == n
    set_hush("u1", notif={})

def test_default_fade_and_archive(client, riya):
    client.patch("/me/hush-settings", headers=riya, json={"defaultFadeSec": 3600})
    c = client.post("/conv", headers=riya, json={"members": ["u3", "u4"], "title": "fade grp"}).json(); assert c["fadeSec"] == 3600
    client.patch("/me/hush-settings", headers=riya, json={"defaultFadeSec": None})
    c2 = client.post("/conv", headers=riya, json={"members": ["u3", "u4"], "title": "plain"}).json(); assert c2["fadeSec"] is None
    assert client.post(f"/conv/{c['id']}/archive", headers=riya, json={"archived": True}).status_code == 200
    rows = {x["id"]: x for x in client.get("/conv", headers=riya).json()}; assert rows[c["id"]]["archived"] is True and rows[c2["id"]]["archived"] is False

def test_mood_media_private_to_audience(client, riya):
    img = upload_png(client, riya)
    s = client.post("/status", headers=riya, json={"kind": "photo", "attachment": {"url": img}, "audience": "friends"}).json()
    assert client.get(img).status_code == 404  # not public anymore
    friend = u(client, "u1"); stranger = u(client, "u2")
    fs = {x["id"]: x for x in client.get("/status", headers=friend).json()}
    assert s["id"] in fs and "sig=" in fs[s["id"]]["media"]["url"] and client.get(fs[s["id"]]["media"]["url"]).status_code == 200
    assert s["id"] not in {x["id"] for x in client.get("/status", headers=stranger).json()}
    assert client.get(img, headers=stranger).status_code == 404 and client.get(img, headers=friend).status_code == 404  # bare URL needs the grant link
    bad = fs[s["id"]]["media"]["url"].replace("sig=", "sig=0"); assert client.get(bad[:-1]).status_code == 404
    from app.routes_chat import status_media
    db = SessionLocal(); st = db.get(M.Status, s["id"]); assert status_media(db, st, db.get(M.User, "u2")) is None; db.close()
    assert not any(c["id"].startswith("mv-") for c in client.get("/conv", headers=riya).json())

def test_media_corp_cross_origin(client, riya):
    img = upload_png(client, riya)
    r = client.get(img, headers=riya); assert r.status_code == 200 and r.headers["cross-origin-resource-policy"] == "cross-origin"
