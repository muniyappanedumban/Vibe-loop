"""Add-ons batch 8 (Hush): Emergency Card, Remind Them, Meeting Notes, Memory Jar, Kindness Streak, Quiet Reply — plus their admin switches."""
import time
from datetime import datetime, timezone
from tests.conftest import login
from app.db import SessionLocal
from app import models as M
from app.routes_addons_b8 import Reminder, KindNote, deliver_due

def u(c, id): return login(c, f"{id}@demo.vibeloop.app")
def cfg(client, admin, body): r = client.put("/admin/config/base", json=body, headers=admin); assert r.status_code == 200, r.text
def off(client, admin, key): cfg(client, admin, {"addons": {"hush": {key: False}}})
def now(): return int(time.time() * 1000)

def test_emergency_card(client, riya, admin):
    body = {"blood": "O+", "allergies": "Peanuts", "contacts": [{"name": "Amma", "phone": "+91 98765 43210", "relation": "Mother"}], "sharedWith": ["u1"]}
    r = client.put("/addons/b8/emergency", headers=riya, json=body); assert r.status_code == 200, r.text
    assert r.json()["blood"] == "O+" and r.json()["sharedWith"][0]["id"] == "u1"
    assert client.put("/addons/b8/emergency", headers=riya, json={**body, "blood": "Z9"}).status_code == 422
    assert client.put("/addons/b8/emergency", headers=riya, json={**body, "sharedWith": ["u2"]}).status_code == 400   # not a friend
    u1 = u(client, "u1")
    assert client.get("/addons/b8/emergency", headers=u1).json()["sharedWithMe"][0]["user"]["id"] == "usr_riya"
    v = client.get("/addons/b8/emergency/usr_riya", headers=u1).json(); assert v["allergies"] == "Peanuts" and v["sharedWith"] is None
    assert client.get("/addons/b8/emergency/usr_riya", headers=u(client, "u3")).status_code == 404     # friend, but not chosen
    off(client, admin, "emergencyCard")
    assert client.get("/addons/b8/emergency", headers=riya).status_code == 403

def test_remind_them(client, riya, admin):
    assert client.post("/addons/b8/reminders", headers=riya, json={"to": "u1", "note": "Call mom", "dueAt": now()}).status_code == 400
    assert client.post("/addons/b8/reminders", headers=riya, json={"to": "u2", "note": "x", "dueAt": now() + 3_600_000}).status_code == 400
    r = client.post("/addons/b8/reminders", headers=riya, json={"to": "u1", "note": "Bring the charger", "dueAt": now() + 3_600_000}).json()
    assert r["status"] == "pending"
    db = SessionLocal(); db.get(Reminder, r["id"]).due_at = now() - 1; db.commit(); assert deliver_due(db) == 1; db.close()
    u1 = u(client, "u1")
    inbox = client.get("/addons/b8/reminders", headers=u1).json()["inbox"]; assert inbox[0]["id"] == r["id"]
    assert client.post(f"/addons/b8/reminders/{r['id']}", headers=riya, json={"action": "snooze"}).status_code == 400   # sender can't snooze
    assert client.post(f"/addons/b8/reminders/{r['id']}", headers=u(client, "u3"), json={"action": "done"}).status_code == 404
    s = client.post(f"/addons/b8/reminders/{r['id']}", headers=u1, json={"action": "snooze", "minutes": 10}).json()
    assert s["status"] == "pending" and s["snoozes"] == 1
    off(client, admin, "remindThem")
    assert client.get("/addons/b8/reminders", headers=riya).status_code == 403

def test_meeting_notes(client, riya, admin):
    assert client.post("/addons/b8/convs/cv_weekend/notes", headers=riya, json={"title": "Plan", "items": [{"text": "x", "assignee": "u2"}]}).status_code == 400
    assert client.post("/addons/b8/convs/cv_weekend/notes", headers=riya, json={"title": ""}).status_code == 422
    n = client.post("/addons/b8/convs/cv_weekend/notes", headers=riya, json={"title": "Trip sync", "body": "Goa in Dec", "items": [{"text": "Book hotel", "assignee": "u4"}]}).json()
    iid = n["items"][0]["id"]
    assert client.patch(f"/addons/b8/notes/{n['id']}", headers=riya, json={"tick": iid}).status_code == 403   # not the assignee
    t = client.patch(f"/addons/b8/notes/{n['id']}", headers=u(client, "u4"), json={"tick": iid}).json(); assert t["done"] == 1
    assert client.get("/addons/b8/convs/cv_weekend/notes", headers=u(client, "u2")).status_code == 404
    assert client.delete(f"/addons/b8/notes/{n['id']}", headers=u(client, "u1")).status_code == 403
    off(client, admin, "meetingNotes")
    assert client.get("/addons/b8/convs/cv_weekend/notes", headers=riya).status_code == 403

def test_memory_jar(client, riya, admin):
    m = client.post("/conv/cv_u1/messages", headers=riya, json={"text": "Best dosa of my life"}); assert m.status_code == 200, m.text
    mid = m.json()["id"]
    assert any(c["id"] == mid for c in client.get("/addons/b8/convs/cv_u1/jar/candidates", headers=riya).json())
    j = client.post("/addons/b8/convs/cv_u1/jar", headers=riya, json={"msgId": mid}).json()
    assert j["text"] == "Best dosa of my life" and j["sender"]["id"] == "usr_riya"
    assert client.post("/addons/b8/convs/cv_u1/jar", headers=riya, json={"msgId": mid}).status_code == 409
    assert client.post("/addons/b8/convs/cv_u1/jar", headers=riya, json={}).status_code == 422
    u1 = u(client, "u1")
    assert client.get("/addons/b8/convs/cv_u1/jar", headers=u1).json()["total"] == 1
    assert client.delete(f"/addons/b8/jar/{j['id']}", headers=u1).status_code == 403
    assert client.get("/addons/b8/convs/cv_u1/jar", headers=u(client, "u3")).status_code == 404
    assert client.delete(f"/addons/b8/jar/{j['id']}", headers=riya).status_code == 200
    off(client, admin, "memoryJar")
    assert client.get("/addons/b8/convs/cv_u1/jar", headers=riya).status_code == 403

def test_kindness_streak(client, riya, admin):
    db = SessionLocal(); y = datetime.fromtimestamp(time.time() - 86400, timezone.utc).strftime("%Y-%m-%d")
    db.add(KindNote(from_id="u1", to_id="usr_riya", day=y, text="You rock")); db.commit(); db.close()
    k = client.post("/addons/b8/kindness", headers=riya, json={"to": "u1", "text": "Thanks for the help today"}).json(); assert k["streak"] == 2
    assert client.post("/addons/b8/kindness", headers=riya, json={"to": "u1", "text": "Again!"}).status_code == 409
    assert client.post("/addons/b8/kindness", headers=riya, json={"to": "u2", "text": "Hello there"}).status_code == 400
    assert client.post("/addons/b8/kindness", headers=riya, json={"to": "u1", "text": "x"}).status_code == 422
    o = client.get("/addons/b8/kindness", headers=riya).json(); assert o["pairs"][0]["streak"] == 2 and o["pairs"][0]["sentToday"]
    assert len(client.get("/addons/b8/kindness/u1", headers=riya).json()["notes"]) == 2
    off(client, admin, "kindnessStreak")
    assert client.get("/addons/b8/kindness", headers=riya).status_code == 403

def test_quiet_reply(client, riya, admin):
    assert client.put("/addons/b8/away", headers=riya, json={"text": "x", "startMin": 2000, "endMin": 0}).status_code == 422
    a = client.put("/addons/b8/away", headers=riya, json={"text": "Sleeping, back at 7", "startMin": 0, "endMin": 0}).json()   # all day
    assert a["quietNow"]
    r = client.get("/addons/b8/away/usr_riya", headers=u(client, "u1")).json(); assert r["away"] and r["text"] == "Sleeping, back at 7"
    assert client.get("/addons/b8/away/usr_riya", headers=u(client, "u4")).status_code == 404   # only in a group, no 1:1
    client.post("/addons/b8/away/toggle", headers=riya, json={"enabled": False})
    assert not client.get("/addons/b8/away/usr_riya", headers=u(client, "u1")).json()["away"]
    off(client, admin, "quietReply")
    assert client.get("/addons/b8/away", headers=riya).status_code == 403

def test_admin_overview(client, riya, admin):
    r = client.get("/admin/addons/b8", headers=admin).json()
    assert r["module"] == "hush" and len(r["items"]) == 6 and all(i["on"] for i in r["items"])
    assert client.get("/admin/addons/b8", headers=riya).status_code == 403
    off(client, admin, "memoryJar")
    assert not next(i for i in client.get("/admin/addons/b8", headers=admin).json()["items"] if i["flag"] == "addons.hush.memoryJar")["on"]
