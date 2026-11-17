from tests.conftest import login
from tests.test_v6 import u, upload_png

def test_defaults_and_flag(client):
    assert client.get("/app-config").json()["features"]["hushSettings"] is True
    h = u(client, "riya") if False else login(client, "riya@vibeloop.app")
    r = client.get("/me/hush-settings", headers=h); assert r.status_code == 200, r.text
    j = r.json(); assert j["settings"]["typingVisible"] is True and j["settings"]["notif"]["messages"] is True
    assert j["quietHours"]["on"] is False and "uploads" in j["storage"]

def test_patch_persists_and_partial_merge(client, riya):
    r = client.patch("/me/hush-settings", headers=riya, json={"typingVisible": False, "whoCanCall": "nobody", "notif": {"groups": False},
                                                             "defaultFadeSec": 86400, "bubbleTheme": "grape", "fontSize": "l", "autoDownload": {"cellular": True},
                                                             "quietHours": {"on": True, "from": 23, "to": 6}})
    assert r.status_code == 200, r.text
    client.patch("/me/hush-settings", headers=riya, json={"notif": {"calls": False}})
    j = client.get("/me/hush-settings", headers=riya).json(); s = j["settings"]
    assert s["typingVisible"] is False and s["whoCanCall"] == "nobody" and s["defaultFadeSec"] == 86400 and s["bubbleTheme"] == "grape"
    assert s["notif"] == {"messages": True, "groups": False, "calls": False, "moods": True, "previews": True}
    assert s["autoDownload"] == {"wifi": True, "cellular": True}
    assert j["quietHours"]["on"] is True and j["quietHours"]["from"] == 23 and j["quietHours"]["to"] == 6
    client.patch("/me/hush-settings", headers=riya, json={"defaultFadeSec": None})
    assert client.get("/me/hush-settings", headers=riya).json()["settings"]["defaultFadeSec"] is None

def test_validation(client, riya):
    for b in ({"defaultFadeSec": 5}, {"bubbleTheme": "nope"}, {"whoCanCall": "aliens"}, {"quietHours": {"from": 30}}):
        assert client.patch("/me/hush-settings", headers=riya, json=b).status_code in (400, 422), b
    assert client.get("/me/hush-settings").status_code == 401

def test_blocked_list_and_unblock(client, riya):
    other = client.get("/users/lookup", headers=riya, params={"handle": "@arjun"})
    tid = other.json()["id"] if other.status_code == 200 else client.get("/friends", headers=riya).json()["friends"][0]["id"]
    assert client.post(f"/edges/block/{tid}", headers=riya).json()["on"] is True
    assert [x["id"] for x in client.get("/me/blocked", headers=riya).json()] == [tid]
    client.post(f"/edges/block/{tid}", headers=riya)
    assert client.get("/me/blocked", headers=riya).json() == []

def test_archive_and_export(client, riya):
    convs = client.get("/conv", headers=riya).json(); assert convs
    cid = convs[0]["id"]
    assert client.post(f"/conv/{cid}/archive", headers=riya, json={"archived": True}).status_code == 200
    assert [c["id"] for c in client.get("/me/hush-archive", headers=riya).json()] == [cid]
    client.post(f"/conv/{cid}/archive", headers=riya, json={"archived": False})
    assert client.get("/me/hush-archive", headers=riya).json() == []
    ex = client.get("/me/hush-export", headers=riya).json()
    assert ex["handle"] and len(ex["conversations"]) == len(convs)
    assert client.post("/conv/nope/archive", headers=riya, json={"archived": True}).status_code == 404

def test_push_test_counts_devices(client, riya, monkeypatch):
    from app import push; sent = []
    monkeypatch.setattr(push, "queue", lambda *a, **k: sent.append(a))
    assert client.post("/me/push-test", headers=riya).json() == {"devices": 0, "sent": False}
    client.post("/push/token", headers=riya, json={"token": "ExponentPushToken[abc12345]", "platform": "ios"})
    assert client.post("/me/push-test", headers=riya).json()["devices"] == 1 and len(sent) == 1
