"""User App Settings: schema, validation, /app-config output, server-side enforcement."""
from conftest import login
from app import seed

def put(client, admin, layer, body):
    return client.put(f"/admin/config/{layer}", json=body, headers=admin)

def test_schema_and_defaults_in_app_config(client, admin):
    s = client.get("/admin/user-app/schema", headers=admin).json()
    assert len(s["settings"]) > 25 and {x["module"] for x in s["settings"]} == {"glow", "hush", "global"}
    cfg = client.get("/app-config").json()
    assert cfg["limits"]["maxPhotosPerPost"] == 10 and cfg["access"]["signupOpen"] is True
    assert cfg["defaults"]["hush"]["callTypes"] == ["audio", "video"] and cfg["defaults"]["glow"]["whoCanComment"] == "everyone"

def test_validation(client, admin):
    assert put(client, admin, "base", {"limits": {"maxPhotosPerPost": 99}}).status_code == 400
    assert put(client, admin, "base", {"defaults": {"hush": {"whoCanMessage": "aliens"}}}).status_code == 400
    assert put(client, admin, "base", {"defaults": {"glow": {"nope": True}}}).status_code == 400
    assert put(client, admin, "base", {"access": {"minAppVersion": "abc"}}).status_code == 400
    assert put(client, admin, "country:IN", {"limits": {"maxPhotosPerPost": 3}, "access": {"maintenanceMessage": "hi"}}).status_code == 200
    assert client.get("/app-config?country=IN").json()["limits"]["maxPhotosPerPost"] == 3
    assert client.get("/app-config?country=US").json()["limits"]["maxPhotosPerPost"] == 10
    log = client.get("/admin/audit", headers=admin)
    if log.status_code == 200: assert "config.layer_put" in log.text

def test_signup_closed_and_max_accounts(client, admin):
    put(client, admin, "base", {"access": {"signupOpen": False}})
    r = client.post("/auth/register", json={"email": "new@x.io", "handle": "newbie1", "name": "New"})
    assert r.status_code == 403
    put(client, admin, "base", {"limits": {"maxAccounts": 1}})
    r = client.post("/auth/register", json={"email": "riya@vibeloop.app", "handle": "riya2x", "name": "R"})
    assert r.status_code == 409 and "1 accounts" in r.json()["detail"]

def test_maintenance_and_min_version(client, admin, riya):
    put(client, admin, "base", {"access": {"maintenance": True, "maintenanceMessage": "Brb"}})
    r = client.get("/conv", headers=riya); assert r.status_code == 503 and r.json()["detail"] == "Brb"
    assert client.get("/app-config").status_code == 200
    assert client.get("/admin/config/layers", headers=admin).status_code == 200
    put(client, admin, "base", {"access": {"minAppVersion": "2.0.0", "forceUpdate": True}})
    assert client.get("/conv", headers={**riya, "X-App-Version": "1.9.9"}).status_code == 426
    assert client.get("/conv", headers={**riya, "X-App-Version": "2.0.0"}).status_code == 200

def test_group_size_and_windows(client, admin, riya):
    put(client, admin, "base", {"limits": {"maxGroupSize": 2}})
    others = ["u2", "u3"]
    r = client.post("/conv", json={"members": others}, headers=riya)
    assert r.status_code == 400 and "at most 2" in r.json()["detail"]

def test_photos_per_post_and_hashtags(client, admin, riya):
    put(client, admin, "base", {"limits": {"maxPhotosPerPost": 2}, "defaults": {"glow": {"hashtags": False}}})
    r = client.post("/posts", json={"kind": "carousel", "text": "hi", "slides": 3}, headers=riya)
    assert r.status_code == 400 and "at most 2" in r.json()["detail"]
    r = client.post("/posts", json={"kind": "thought", "text": "hi", "tags": ["a"]}, headers=riya)
    assert r.status_code == 200, r.text

def test_upload_cap_and_otp_cooldown(client, admin, riya):
    put(client, admin, "base", {"limits": {"uploadMaxMB": 1, "otpResendSec": 60}})
    r = client.post("/uploads", json={"filename": "a.mp4", "size": 2 * 1024 * 1024, "mime": "video/mp4"}, headers=riya)
    assert r.status_code == 413
    assert client.post("/auth/otp/request", json={"identifier": "riya@vibeloop.app"}).status_code == 200
    assert client.post("/auth/otp/request", json={"identifier": "riya@vibeloop.app"}).status_code == 429

def test_auto_hide_after_reports(client, admin):
    put(client, admin, "base", {"limits": {"autoHideReports": 2}})
    pid = client.post("/posts", json={"kind": "thought", "text": "x"}, headers=login(client, "riya@vibeloop.app")).json()["id"]
    from app.db import SessionLocal
    from app import models as M
    db = SessionLocal(); db.add(M.Report(reporter_id="usr_riya_chat", target=pid, reason="spam")); db.commit(); db.close()  # first reporter
    assert client.post("/reports", json={"target": pid, "reason": "spam"}, headers=admin).status_code == 200  # second → auto-hide
    db = SessionLocal(); assert db.get(M.Post, pid).hidden; db.close()
