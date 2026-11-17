"""P0 steps 2–7: deletion + export, age gate, appeals, anti-spam, content scanning, incidents."""
import hashlib
from tests.conftest import login
from app.db import SessionLocal
from app import models as M

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
def H(t): return {"Authorization": f"Bearer {t}"}
def cfg(client, admin, body): r = client.put("/admin/config/base", json=body, headers=admin); assert r.status_code == 200, r.text
def otp(client, ident):
    t = client.post("/auth/otp/request", json={"identifier": ident}).json()
    return client.post("/auth/otp/verify", json={"identifier": ident, "code": t["demoCode"]}).json()
def u(client, id): return login(client, f"{id}@demo.vibeloop.app")

# ---------- 2 · deletion + export ----------
def test_export_has_my_data(client, riya):
    r = client.get("/me/export", headers=riya); assert r.status_code == 200
    d = r.json(); assert d["account"]["handle"] == "@riya.makes" and "posts" in d and "chats" in d and "securityEvents" in d
    assert "totpSecret" not in str(d)

def test_delete_schedule_cancel_and_purge(client, admin):
    tok = otp(client, "@riya.makes")["token"]
    assert client.post("/me/delete", headers=H(tok), json={"confirm": "@wrong"}).status_code == 400
    r = client.post("/me/delete", headers=H(tok), json={"confirm": "@riya.makes"}).json()
    assert r["scheduled"] and r["deleteAt"] > r["requestedAt"]
    assert client.get("/me/deletion", headers=H(tok)).status_code == 401           # every device signed out
    tok2 = otp(client, "@riya.makes")["token"]                                       # signing back in is allowed…
    assert client.get("/me/deletion", headers=H(tok2)).json()["scheduled"]
    assert client.post("/me/deletion/cancel", headers=H(tok2)).json()["scheduled"] is False   # …and cancels
    # schedule again with 0-day grace → erased at once
    cfg(client, admin, {"privacy": {"deletionGraceDays": 0}})
    assert client.post("/me/delete", headers=H(tok2), json={"confirm": "riya.makes"}).json()["deleted"]
    db = SessionLocal(); x = db.get(M.User, "usr_riya")
    assert x.handle.startswith("@deleted_") and x.email.endswith("@invalid") and x.name == "Deleted account" and x.suspended
    assert not db.query(M.AuthSession).filter_by(user_id="usr_riya").count(); db.close()
    t = client.post("/auth/otp/request", json={"identifier": "@riya.makes"}).json()
    assert client.post("/auth/otp/verify", json={"identifier": "@riya.makes", "code": t.get("demoCode") or "000000"}).status_code == 400

def test_purge_due_job(client, admin):
    tok = otp(client, "@riya.makes")["token"]
    client.post("/me/delete", headers=H(tok), json={"confirm": "@riya.makes"})
    db = SessionLocal(); x = db.get(M.User, "usr_riya"); s = dict(x.settings); s["deleteAt"] = 1; x.settings = s; db.commit(); db.close()
    assert client.post("/admin/privacy/purge-due", headers=admin).json()["erased"] == 1
    db = SessionLocal(); assert db.get(M.User, "usr_riya").handle.startswith("@deleted_"); db.close()

def test_delete_and_export_switches(client, admin, riya):
    cfg(client, admin, {"privacy": {"selfDelete": False, "selfExport": False}})
    assert client.post("/me/delete", headers=riya, json={"confirm": "@riya.makes"}).status_code == 403
    assert client.get("/me/export", headers=riya).status_code == 403

# ---------- 3 · age ----------
def test_age_gate_and_teen_defaults(client, admin):
    reg = lambda h, bd: client.post("/auth/register", json={"handle": h, "name": "X", "email": f"{h}@ex.com", **({"birthDate": bd} if bd else {})})
    assert reg("nobday1", None).status_code == 400
    assert reg("kid12", "2020-01-01").status_code == 403
    assert reg("badday", "2999-01-01").status_code == 400
    assert reg("teen16", "2010-06-01").status_code == 200
    db = SessionLocal(); t = db.query(M.User).filter_by(handle="@teen16").one()
    assert t.profile["teen"] and t.profile["social_private"] and t.profile["who_can_message"] == "friends"; db.close()
    assert reg("adult30", "1995-01-01").status_code == 200
    db = SessionLocal(); a = db.query(M.User).filter_by(handle="@adult30").one(); assert not a.profile["teen"] and "social_private" not in a.profile; db.close()
    cfg(client, admin, {"safety": {"minAge": 18}})
    assert reg("teen17", "2009-01-01").status_code == 403
    cfg(client, admin, {"safety": {"ageGate": False, "minAge": 13}})
    assert reg("nobday2", None).status_code == 200

# ---------- 4 · appeals ----------
def test_ban_appeal_reversed(client, admin):
    u1 = u(client, "u1")
    assert client.patch("/admin/users/u1", headers=admin, json={"suspended": True}).status_code == 200
    assert client.get("/me", headers=u1).status_code == 403
    st = client.get("/me/standing", headers=u1).json(); assert st["suspended"]
    assert client.post("/appeals", headers=u1, json={"kind": "ban", "reason": "short"}).status_code == 422
    a = client.post("/appeals", headers=u1, json={"kind": "ban", "reason": "I think this was a mistake, please check again."}).json()
    assert client.post("/appeals", headers=u1, json={"kind": "ban", "reason": "Second appeal for the same thing"}).status_code == 409
    q = client.get("/admin/appeals", headers=admin).json(); assert any(x["id"] == a["id"] for x in q)
    r = client.post(f"/admin/appeals/{a['id']}/decide", headers=admin, json={"decision": "reverse", "note": "ok"}).json()
    assert r["status"] == "reversed"
    assert client.get("/me", headers=u1).status_code == 200

def test_post_appeal_upheld(client, admin, riya):
    p = client.post("/posts", headers=riya, json={"kind": "thought", "text": "appeal me"}).json()
    db = SessionLocal(); db.get(M.Post, p["id"]).hidden = True; db.commit(); db.close()
    a = client.post("/appeals", headers=riya, json={"kind": "post", "target": p["id"], "reason": "This post follows the rules."}).json()
    assert client.post("/appeals", headers=riya, json={"kind": "post", "target": "nope", "reason": "This post follows the rules."}).status_code == 404
    assert client.post(f"/admin/appeals/{a['id']}/decide", headers=admin, json={"decision": "uphold"}).json()["status"] == "upheld"
    assert client.post(f"/admin/appeals/{a['id']}/decide", headers=admin, json={"decision": "reverse"}).status_code == 409

def test_appeals_switch(client, admin, riya):
    cfg(client, admin, {"safety": {"appeals": False}})
    assert client.post("/appeals", headers=riya, json={"kind": "ban", "reason": "Please check again"}).status_code == 403

# ---------- 5 · spam ----------
def test_bulk_same_text_restricts(client, admin, riya):
    cfg(client, admin, {"spam": {"bulkSameText": 3}})
    convs = []
    for m in ("u1", "u3", "u4", "u5", "u6", "u7"):
        r = client.post("/conv", headers=riya, json={"members": [m]})
        if r.status_code == 200: convs.append(r.json()["id"])
    assert len(convs) >= 3
    msg = {"text": "Buy cheap followers now at spam.example"}
    codes = [client.post(f"/conv/{c}/messages", headers=riya, json=msg).status_code for c in convs[:3]]
    assert codes[:2] == [200, 200] and codes[2] == 403
    assert client.post("/posts", headers=riya, json={"kind": "thought", "text": "x"}).status_code == 403   # restricted everywhere
    st = client.get("/me/standing", headers=riya).json(); assert st["restrictedUntil"]
    sp = client.get("/admin/spam", headers=admin).json(); f = next(x for x in sp["flags"] if x["user"]["handle"] == "@riya.makes")
    assert f["kind"] == "bulk_same_text" and f["user"]["score"] > 0
    assert client.post(f"/admin/spam/{f['id']}", headers=admin, json={"action": "clear"}).json()["status"] == "cleared"
    assert client.post("/posts", headers=riya, json={"kind": "thought", "text": "back"}).status_code == 200

def test_new_account_chat_limit(client, admin):
    cfg(client, admin, {"spam": {"newAccountDmPerHour": 1}})
    assert client.post("/auth/register", json={"handle": "freshie", "name": "F", "email": "fresh@ex.com", "birthDate": "1999-01-01"}).status_code == 200
    tok = otp(client, "@freshie")["token"]
    sent = []
    for m in ("u1", "u3", "u4", "u5"):
        r = client.post("/conv", headers=H(tok), json={"members": [m]})
        if r.status_code == 200: sent.append(client.post(f"/conv/{r.json()['id']}/messages", headers=H(tok), json={"text": f"hi {m}"}).status_code)
    assert sent[0] == 200 and 429 in sent

# ---------- 6 · scanning ----------
def test_hash_blocklist_refuses_upload(client, admin, riya):
    h = hashlib.sha256(PNG).hexdigest()
    assert client.post("/admin/hash-blocklist", headers=admin, json={"sha256": h, "label": "test list"}).status_code == 200
    assert client.post("/media", files={"file": ("i.png", PNG)}, headers=riya).status_code == 451
    inc = client.get("/admin/incidents", headers=admin).json(); assert any(i["kind"] == "blocked_hash" and i["severity"] == "critical" for i in inc)
    client.delete(f"/admin/hash-blocklist/{h}", headers=admin)
    assert client.post("/media", files={"file": ("i.png", PNG)}, headers=riya).status_code == 200

def test_scan_hold_and_review(client, admin, riya):
    cfg(client, admin, {"safety": {"scanUploads": True}})
    up = client.post("/media", files={"file": ("i.png", PNG + b"x")}, headers=riya).json()
    assert client.get(up["url"]).status_code == 404                  # held from the public
    assert client.get(up["url"], headers=riya).status_code == 200     # owner can still see it
    q = client.get("/admin/scan-queue", headers=admin).json(); item = next(x for x in q if x["id"] == up["id"])
    assert item["status"] == "pending"
    assert client.post(f"/admin/media/{up['id']}/scan", headers=admin, json={"verdict": "clean"}).json()["status"] == "clean"
    assert client.get(up["url"]).status_code == 200
    up2 = client.post("/media", files={"file": ("j.png", PNG + b"y")}, headers=riya).json()
    client.post(f"/admin/media/{up2['id']}/scan", headers=admin, json={"verdict": "blocked", "addToBlocklist": True, "label": "rules"})
    assert client.get(up2["url"], headers=riya).status_code == 404   # blocked: gone even for the owner
    st = client.get("/me/standing", headers=riya).json(); assert any(m["id"] == up2["id"] for m in st["heldMedia"])
    a = client.post("/appeals", headers=riya, json={"kind": "media", "target": up2["id"], "reason": "It's my own drawing, nothing wrong."}).json()
    client.post(f"/admin/appeals/{a['id']}/decide", headers=admin, json={"decision": "reverse"})
    assert client.get(up2["url"]).status_code == 200

# ---------- 7 · incidents ----------
def test_incident_lifecycle(client, admin, riya):
    i = client.post("/admin/incidents", headers=admin, json={"title": "Login errors spike", "severity": "high", "detail": "5xx on /auth"}).json()
    assert i["status"] == "open"
    i = client.patch(f"/admin/incidents/{i['id']}", headers=admin, json={"status": "investigating", "note": "looking at DB"}).json()
    i = client.patch(f"/admin/incidents/{i['id']}", headers=admin, json={"status": "resolved", "note": "pool size raised"}).json()
    assert i["resolvedAt"] and len(i["timeline"]) == 3
    assert not any(x["id"] == i["id"] for x in client.get("/admin/incidents", headers=admin).json())
    assert client.get("/admin/incidents", headers=riya).status_code == 403

# ---------- server-driven feed tabs ----------
def test_feed_modes_and_switch(client, admin, riya):
    for m in ("foryou", "circle", "trending", "fresh"):
        r = client.get(f"/feed?mode={m}", headers=riya); assert r.status_code == 200, (m, r.text)
    client.post("/posts", headers=riya, json={"kind": "thought", "text": "calm day", "mood": "Relaxing"})
    items = client.get("/feed?mode=mood&tag=Relaxing", headers=riya).json()["items"]
    assert items and all(p["mood"] == "Relaxing" for p in items)
    assert client.get("/feed?mode=mood", headers=riya).status_code == 400
    cfg(client, admin, {"defaults": {"glow": {"feedTabs": ["forYou", "fresh"]}}})
    assert client.get("/feed?mode=trending", headers=riya).status_code == 403
    assert client.get("/feed?mode=fresh", headers=riya).status_code == 200
