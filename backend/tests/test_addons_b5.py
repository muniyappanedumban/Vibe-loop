"""Add-ons batch 5 (Glow): Collab Canvas, Office Hours, Fan Missions, Moodboard Pins, Time-Lock Polls, Thank-You Stories."""
import time
from tests.conftest import login
from app.db import SessionLocal
from app import models as M
from app.routes_addons_b5 import LockPoll

def u(c, id): return login(c, f"{id}@demo.vibeloop.app")
def cfg(client, admin, body): r = client.put("/admin/config/base", json=body, headers=admin); assert r.status_code == 200, r.text
def off(client, admin, key): cfg(client, admin, {"addons": {"glow": {key: False}}})
def now(): return int(time.time() * 1000)

def test_collab_canvas(client, riya, admin):
    assert client.post("/addons/b5/canvas", headers=riya, json={"title": "", "coauthors": []}).status_code == 422
    assert client.post("/addons/b5/canvas", headers=riya, json={"title": "x", "coauthors": [f"u{i}" for i in range(1, 11)]}).status_code in (400, 404)
    c = client.post("/addons/b5/canvas", headers=riya, json={"title": "Monsoon poem", "coauthors": ["u1"]}).json()
    assert c["myTurn"] and len(c["authors"]) == 2
    u1, u2 = u(client, "u1"), u(client, "u2")
    assert client.post(f"/addons/b5/canvas/{c['id']}/tiles", headers=u1, json={"text": "too early"}).status_code == 409   # turn order
    assert client.post(f"/addons/b5/canvas/{c['id']}/tiles", headers=riya, json={"text": "Rain on tin roofs"}).status_code == 200
    assert client.post(f"/addons/b5/canvas/{c['id']}/tiles", headers=u1, json={"text": "chai in both hands"}).status_code == 200
    assert client.get(f"/addons/b5/canvas/{c['id']}", headers=u2).status_code == 404          # not final yet
    assert client.post(f"/addons/b5/canvas/{c['id']}/tiles", headers=u2, json={"text": "hi"}).status_code == 404
    assert client.post(f"/addons/b5/canvas/{c['id']}/lock", headers=u1, json={"locked": True}).status_code == 403
    assert client.post(f"/addons/b5/canvas/{c['id']}/lock", headers=riya, json={"locked": True}).json()["locked"]
    assert len(client.get(f"/addons/b5/canvas/{c['id']}", headers=u2).json()["tiles"]) == 2
    assert client.post(f"/addons/b5/canvas/{c['id']}/tiles", headers=riya, json={"text": "more"}).status_code == 409
    off(client, admin, "collabCanvas")
    assert client.get("/addons/b5/canvas", headers=riya).status_code == 403

def test_office_hours(client, riya, admin):
    u1, u2, u3 = u(client, "u1"), u(client, "u2"), u(client, "u3")
    db = SessionLocal(); db.add(M.Edge(user_id="u3", kind="follow", target="u1")); db.commit(); db.close()
    assert client.post("/addons/b5/office", headers=u1, json={"startsAt": now() - 1000, "minutes": 30}).status_code == 400
    assert client.post("/addons/b5/office", headers=u1, json={"startsAt": now() + 86_400_000, "minutes": 5}).status_code == 422
    s = client.post("/addons/b5/office", headers=u1, json={"startsAt": now() + 86_400_000, "minutes": 30, "topic": "Editing Q&A", "weeks": 2}).json()
    assert len(s) == 2
    assert client.post("/addons/b5/office", headers=u1, json={"startsAt": now() + 86_400_000 + 600_000, "minutes": 30}).status_code == 409
    sid = s[0]["id"]
    assert client.post(f"/addons/b5/office/{sid}/book", headers=u2).status_code == 403           # not a follower
    assert client.post(f"/addons/b5/office/{sid}/book", headers=riya).json()["bookedByMe"]
    assert client.post(f"/addons/b5/office/{sid}/book", headers=u3).status_code == 409           # no double booking
    assert client.get("/addons/b5/office/creator/u1", headers=riya).json()["canBook"]
    assert client.post(f"/addons/b5/office/{sid}/cancel", headers=riya).status_code == 404
    assert client.post(f"/addons/b5/office/{sid}/cancel", headers=u1).json()["status"] == "cancelled"
    assert client.post(f"/addons/b5/office/{sid}/release", headers=riya).status_code == 404       # can't reopen a cancelled slot
    assert client.post(f"/addons/b5/office/{sid}/cancel", headers=u1).status_code == 409
    assert client.post(f"/addons/b5/office/{sid}/book", headers=u3).status_code == 404
    off(client, admin, "officeHours")
    assert client.get("/addons/b5/office", headers=u1).status_code == 403

def test_fan_missions(client, riya, admin):
    u1, u2 = u(client, "u1"), u(client, "u2")
    assert client.post("/addons/b5/missions", headers=u1, json={"title": "Share my loop", "points": 0}).status_code == 422
    m = client.post("/addons/b5/missions", headers=u1, json={"title": "Share my loop", "detail": "Repost to your story", "points": 50}).json()
    assert client.post(f"/addons/b5/missions/{m['id']}/claim", headers=u1, json={"proof": "did it myself"}).status_code == 400
    assert any(x["id"] == m["id"] for x in client.get("/addons/b5/missions", headers=riya).json()["feed"])   # riya follows u1
    client.post(f"/addons/b5/missions/{m['id']}/claim", headers=riya, json={"proof": "Shared it at 9pm"})
    claim = client.get("/addons/b5/missions", headers=u1).json()["review"][0]
    assert client.post(f"/addons/b5/missions/claims/{claim['id']}", headers=u2, json={"approve": True}).status_code == 404
    assert client.post(f"/addons/b5/missions/claims/{claim['id']}", headers=u1, json={"approve": True}).json()["status"] == "approved"
    b = client.get("/addons/b5/missions/creator/u1", headers=u2).json()["board"]
    assert b[0]["user"]["id"] == "usr_riya" and b[0]["points"] == 50
    off(client, admin, "fanMissions")
    assert client.post(f"/addons/b5/missions/{m['id']}/claim", headers=u2, json={"proof": "done it"}).status_code == 403

def test_moodboards(client, riya, admin):
    db = SessionLocal(); db.add(M.MediaFile(id="mfb5riya", owner_id="usr_riya", mime="image/jpeg", size=10)); db.add(M.MediaFile(id="mfb5u1", owner_id="u1", mime="image/jpeg", size=10)); db.commit(); db.close()
    b = client.post("/addons/b5/moodboards", headers=riya, json={"name": "Desk setup", "public": False}).json()
    assert client.post(f"/addons/b5/moodboards/{b['id']}/pins", headers=riya, json={"note": ""}).status_code == 400
    assert client.post(f"/addons/b5/moodboards/{b['id']}/pins", headers=riya, json={"mediaUrl": "/media/mfb5u1.jpg"}).status_code == 400   # not yours
    b = client.post(f"/addons/b5/moodboards/{b['id']}/pins", headers=riya, json={"mediaUrl": "/media/mfb5riya.jpg", "note": "warm light"}).json()
    assert b["count"] == 1
    u1 = u(client, "u1")
    assert client.get(f"/addons/b5/moodboards/{b['id']}", headers=u1).status_code == 404          # private
    assert client.post(f"/addons/b5/moodboards/{b['id']}/pins", headers=u1, json={"note": "x"}).status_code == 404
    client.patch(f"/addons/b5/moodboards/{b['id']}", headers=riya, json={"public": True})
    assert client.get(f"/addons/b5/moodboards/{b['id']}", headers=u1).json()["count"] == 1
    db = SessionLocal(); assert db.get(M.MediaFile, "mfb5riya").public; db.close()
    off(client, admin, "moodboards")
    assert client.get("/addons/b5/moodboards", headers=riya).status_code == 403

def test_time_lock_polls(client, riya, admin):
    assert client.post("/addons/b5/polls", headers=riya, json={"question": "Best snack?", "options": ["Samosa", "samosa"], "revealAt": now() + 3_600_000}).status_code == 400
    assert client.post("/addons/b5/polls", headers=riya, json={"question": "Best snack?", "options": ["A", "B"], "revealAt": now()}).status_code == 400
    p = client.post("/addons/b5/polls", headers=riya, json={"question": "Best snack?", "options": ["Samosa", "Vada pav"], "revealAt": now() + 3_600_000}).json()
    u1 = u(client, "u1")
    r = client.post(f"/addons/b5/polls/{p['id']}/vote", headers=u1, json={"choice": 1}).json()
    assert r["myVote"] == 1 and r["results"] is None                                               # sealed
    assert client.post(f"/addons/b5/polls/{p['id']}/vote", headers=u1, json={"choice": 0}).status_code == 409   # one vote
    assert client.get(f"/addons/b5/polls/{p['id']}", headers=riya).json()["results"] is None      # even for creator
    db = SessionLocal(); db.get(LockPoll, p["id"]).reveal_at = now() - 1; db.commit(); db.close()
    assert client.get(f"/addons/b5/polls/{p['id']}", headers=riya).json()["results"] == [0, 1]
    assert client.post(f"/addons/b5/polls/{p['id']}/vote", headers=riya, json={"choice": 0}).status_code == 409
    off(client, admin, "timeLockPolls")
    assert client.get("/addons/b5/polls", headers=riya).status_code == 403
    assert client.delete(f"/addons/b5/polls/{p['id']}", headers=riya).status_code == 403          # switch covers delete too

def test_thank_you_stories(client, riya, admin):
    assert client.post("/addons/b5/thanks", headers=riya, json={"to": "u1", "text": "short"}).status_code == 422
    assert client.post("/addons/b5/thanks", headers=riya, json={"to": "usr_riya", "text": "Thanks to myself for this"}).status_code == 400
    t = client.post("/addons/b5/thanks", headers=riya, json={"to": "u1", "text": "Thanks for editing my reel overnight!", "context": "collab"}).json()
    u1, u2 = u(client, "u1"), u(client, "u2")
    assert client.get("/addons/b5/thanks/user/u1", headers=u2).json()["stories"] == []            # pending → hidden
    assert client.post(f"/addons/b5/thanks/{t['id']}/decide", headers=riya, json={"approve": True}).status_code == 404
    assert client.post(f"/addons/b5/thanks/{t['id']}/decide", headers=u1, json={"approve": True}).json()["status"] == "approved"
    assert len(client.get("/addons/b5/thanks/user/u1", headers=u2).json()["stories"]) == 1
    r = client.get("/admin/addons/b5", headers=admin).json()
    assert r["module"] == "glow" and len(r["items"]) == 6 and next(i for i in r["items"] if i["flag"] == "addons.glow.thankYouStories")["week"] == 1
    assert client.get("/admin/addons/b5", headers=riya).status_code == 403
    off(client, admin, "thankYouStories")
    assert client.get("/addons/b5/thanks", headers=riya).status_code == 403
    assert next(i for i in client.get("/admin/addons/b5", headers=admin).json()["items"] if i["flag"] == "addons.glow.thankYouStories")["on"] is False
