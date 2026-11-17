"""Add-ons batch 2 (Glow): Vibe Meter, Streak Garden, Micro Challenges, Spotlight Wall, Hot Take Duels, Gratitude Jar — plus switches."""
import time
from sqlalchemy import select
from tests.conftest import login
from app.db import SessionLocal
from app import models as M
from app.routes_addons_b2 import Challenge

def u(c, id): return login(c, f"{id}@demo.vibeloop.app")
def cfg(client, admin, body): r = client.put("/admin/config/base", json=body, headers=admin); assert r.status_code == 200, r.text
def off(client, admin, key): cfg(client, admin, {"addons": {"glow": {key: False}}})
def now(): return int(time.time() * 1000)

def test_vibe_meter(client, riya, admin):
    db = SessionLocal(); pid = db.scalar(select(M.Post.id).where(M.Post.author_id != "usr_riya", M.Post.hidden == False))  # noqa: E712
    own = db.scalar(select(M.Post.id).where(M.Post.author_id == "u1")); db.close()
    r = client.put(f"/addons/b2/vibe/{pid}", headers=riya, json={"value": 85}); assert r.status_code == 200, r.text
    assert r.json()["mine"] == 85 and r.json()["count"] == 1
    r = client.put(f"/addons/b2/vibe/{pid}", headers=riya, json={"value": 15}).json()  # changeable, still one vote
    assert r["count"] == 1 and r["average"] == 15 and r["distribution"][0] == 1
    assert client.put(f"/addons/b2/vibe/{pid}", headers=riya, json={"value": 101}).status_code == 422
    assert client.put("/addons/b2/vibe/nope", headers=riya, json={"value": 5}).status_code == 404
    if own: assert client.put(f"/addons/b2/vibe/{own}", headers=u(client, "u1"), json={"value": 5}).status_code == 400
    assert client.get("/addons/b2/vibe-posts", headers=riya).status_code == 200
    off(client, admin, "vibeMeter"); assert client.get(f"/addons/b2/vibe/{pid}", headers=riya).status_code == 403

def test_streak_garden(client, riya, admin):
    g = client.get("/addons/b2/garden", headers=riya).json(); assert "streak" in g and len(g["days"]) == 14
    client.post("/addons/b2/duels", headers=riya, json={"statement": "Pineapple belongs on pizza"})
    d = client.get("/addons/b2/duels", headers=riya).json()[0]
    client.post(f"/addons/b2/duels/{d['id']}/take", headers=riya, json={"side": "a", "argument": "Sweet and salty"})
    g = client.get("/addons/b2/garden", headers=riya).json(); assert g["wateredToday"] and g["streak"] >= 1
    o = u(client, "u2"); g2 = client.get("/addons/b2/garden", headers=o).json()
    if g2["canFreezeYesterday"]:
        cfg(client, admin, {"addons": {"glow": {"streakFreezesPerMonth": 0}}})
        assert client.post("/addons/b2/garden/freeze", headers=o).status_code == 429
        cfg(client, admin, {"addons": {"glow": {"streakFreezesPerMonth": 2}}})
        f = client.post("/addons/b2/garden/freeze", headers=o).json(); assert f["days"][-2]["state"] == "frozen"
    assert client.post("/addons/b2/garden/freeze", headers=o).status_code == 409
    off(client, admin, "streakGarden"); assert client.get("/addons/b2/garden", headers=riya).status_code == 403

def test_micro_challenges(client, riya, admin):
    assert client.post("/admin/addons/b2/challenges", headers=riya, json={"title": "Sky", "rules": "Shoot the sky", "endsAt": now() + 86_400_000}).status_code == 403
    assert client.post("/admin/addons/b2/challenges", headers=admin, json={"title": "Sky", "rules": "x" * 5, "endsAt": now()}).status_code == 400
    c = client.post("/admin/addons/b2/challenges", headers=admin, json={"title": "Sky week", "rules": "Shoot the sky", "endsAt": now() + 86_400_000}).json()
    e = client.post(f"/addons/b2/challenges/{c['id']}/entry", headers=riya, json={"text": "Sunset over the lake"}).json()
    assert client.post(f"/addons/b2/challenges/{c['id']}/entry", headers=riya, json={"text": "Edited"}).json()["id"] == e["id"]
    assert client.post(f"/addons/b2/challenges/{c['id']}/entry", headers=riya, json={"text": "x", "mediaUrl": "/media/notmine.jpg"}).status_code == 400
    assert client.post(f"/addons/b2/challenges/entries/{e['id']}/vote", headers=riya).status_code == 400
    o = u(client, "u1"); assert client.post(f"/addons/b2/challenges/entries/{e['id']}/vote", headers=o).json()["votes"] == 1
    db = SessionLocal(); db.get(Challenge, c["id"]).ends_at = now() - 1; db.commit(); db.close()
    r = client.get(f"/addons/b2/challenges/{c['id']}", headers=o).json(); assert r["ended"] and r["winners"][0]["id"] == e["id"]
    assert client.post(f"/addons/b2/challenges/{c['id']}/entry", headers=o, json={"text": "late"}).status_code == 409
    off(client, admin, "microChallenges"); assert client.get("/addons/b2/challenges", headers=riya).status_code == 403

def test_spotlight_wall(client, riya, admin):
    assert client.post("/admin/addons/b2/spotlight", headers=riya, json={"user": "u1", "reason": "Great reels"}).status_code == 403
    assert client.post("/admin/addons/b2/spotlight", headers=admin, json={"user": "u1", "reason": "x"}).status_code == 422
    a = client.post("/admin/addons/b2/spotlight", headers=admin, json={"user": "u1", "reason": "Brilliant city walks"}).json()
    b = client.post("/admin/addons/b2/spotlight", headers=admin, json={"user": "u2", "reason": "Kind in every comment"}).json()
    w = client.put("/admin/addons/b2/spotlight/order", headers=admin, json={"ids": [b["id"], a["id"]]}).json(); assert w[0]["id"] == b["id"]
    assert client.put("/admin/addons/b2/spotlight/order", headers=admin, json={"ids": [a["id"]]}).status_code == 400
    wall = client.get("/addons/b2/spotlight", headers=riya).json(); assert [x["id"] for x in wall] == [b["id"], a["id"]]
    assert next(x for x in wall if x["user"]["id"] == "u1")["following"]  # seed: riya follows u1
    client.delete(f"/admin/addons/b2/spotlight/{a['id']}", headers=admin); assert len(client.get("/addons/b2/spotlight", headers=riya).json()) == 1
    off(client, admin, "spotlightWall"); assert client.get("/addons/b2/spotlight", headers=riya).status_code == 403

def test_hot_take_duels(client, riya, admin):
    assert client.post("/addons/b2/duels", headers=riya, json={"statement": "Tea > coffee", "sideA": "Yes", "sideB": "yes"}).status_code == 400
    d = client.post("/addons/b2/duels", headers=riya, json={"statement": "Tea beats coffee", "sideA": "Tea", "sideB": "Coffee"}).json()
    o, p = u(client, "u1"), u(client, "u2")
    client.post(f"/addons/b2/duels/{d['id']}/take", headers=o, json={"side": "b", "argument": "Espresso wakes me up"})
    r = client.post(f"/addons/b2/duels/{d['id']}/take", headers=p, json={"side": "a", "argument": "Chai is love"}).json()
    assert r["countA"] == 1 and r["countB"] == 1
    assert client.post(f"/addons/b2/duels/{d['id']}/take", headers=p, json={"side": "c", "argument": "?"}).status_code == 422
    tid = r["topB"][0]["id"]
    assert client.post(f"/addons/b2/duels/takes/{tid}/back", headers=o).status_code == 400
    assert client.post(f"/addons/b2/duels/takes/{tid}/back", headers=p).json()["backers"] == 1
    assert client.delete(f"/addons/b2/duels/{d['id']}", headers=o).status_code == 403
    off(client, admin, "hotTakeDuels"); assert client.get("/addons/b2/duels", headers=riya).status_code == 403

def test_gratitude_jar(client, riya, admin):
    n = client.post("/addons/b2/gratitude", headers=riya, json={"text": "Mum's dal"}).json()
    assert client.post("/addons/b2/gratitude", headers=riya, json={"text": ""}).status_code == 422
    assert client.delete(f"/addons/b2/gratitude/{n['id']}", headers=u(client, "u1")).status_code == 404  # private
    assert client.get("/addons/b2/gratitude", headers=u(client, "u1")).json()["notes"] == []
    r = client.get("/addons/b2/gratitude/recap", headers=riya).json(); assert r["notes"] == 1 and r["days"] == 1 and r["throwback"]["text"] == "Mum's dal"
    cfg(client, admin, {"addons": {"glow": {"gratitudePerDay": 1}}})
    assert client.post("/addons/b2/gratitude", headers=riya, json={"text": "Rain"}).status_code == 429
    off(client, admin, "gratitudeJar"); assert client.get("/addons/b2/gratitude/recap", headers=riya).status_code == 403

def test_admin_overview_b2(client, admin, riya):
    r = client.get("/admin/addons/b2", headers=admin).json(); assert r["module"] == "glow" and len(r["items"]) == 6 and all(i["on"] for i in r["items"])
    assert client.get("/admin/addons/b2", headers=riya).status_code == 403
