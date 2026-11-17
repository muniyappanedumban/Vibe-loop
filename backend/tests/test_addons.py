"""Add-ons batch 1: Daily Spark, Time Capsules, Kudos, Pacts, Hush Tab, Safe Arrival — plus their admin switches."""
from tests.conftest import login
from app.db import SessionLocal
from app import models as M

def u(c, id): return login(c, f"{id}@demo.vibeloop.app")
def cfg(client, admin, body): r = client.put("/admin/config/base", json=body, headers=admin); assert r.status_code == 200, r.text
def friend_conv(client, riya):
    for m in ("u1", "u3", "u4", "u5", "u6", "u7"):
        r = client.post("/conv", headers=riya, json={"members": [m]})
        if r.status_code == 200: return r.json()["id"], m
    raise AssertionError("no conv")

def test_daily_spark(client, riya, admin):
    r = client.get("/addons/spark", headers=riya).json()
    assert r["question"] and not r["answered"] and r["answers"] == []          # hidden until you answer
    a = client.post("/addons/spark", headers=riya, json={"text": "Walking after dinner"}).json()
    assert client.post("/addons/spark", headers=riya, json={"text": "Walking every evening"}).json()["id"] == a["id"]  # edit, not duplicate
    u1 = u(client, "u1"); client.post("/addons/spark", headers=u1, json={"text": "Reading"})
    r = client.get("/addons/spark", headers=riya).json(); assert r["answered"] and r["total"] == 2
    other = next(x for x in r["answers"] if not x["mine"])
    assert client.post(f"/addons/spark/{other['id']}/cheer", headers=riya).json()["cheered"]
    assert client.put("/admin/addons/spark", headers=admin, json={"day": r["day"], "text": "Custom question for today?"}).status_code == 200
    assert client.get("/addons/spark", headers=riya).json()["question"] == "Custom question for today?"
    assert client.put("/admin/addons/spark", headers=riya, json={"day": r["day"], "text": "hack"}).status_code == 403
    cfg(client, admin, {"addons": {"glow": {"dailySpark": False}}})
    assert client.get("/addons/spark", headers=riya).status_code == 403

def test_time_capsules(client, riya):
    import time
    now = int(time.time() * 1000)
    assert client.post("/addons/capsules", headers=riya, json={"title": "x", "text": "y", "unlockAt": now}).status_code == 400
    c = client.post("/addons/capsules", headers=riya, json={"title": "To me in 2027", "text": "Hello future", "audience": "friends", "unlockAt": now + 86_400_000}).json()
    assert c["sealed"] and c["text"] is None
    db = SessionLocal(); db.get(M.Capsule, c["id"]).unlock_at = now - 1; db.commit(); db.close()
    assert client.get(f"/addons/capsules/{c['id']}", headers=riya).json()["text"] == "Hello future"
    db = SessionLocal(); friend = next((x for x in ("u1", "u3", "u4", "u5") if db.get(M.Friend, ("usr_riya", x))), None); db.close()
    if friend: assert any(x["id"] == c["id"] for x in client.get("/addons/capsules", headers=u(client, friend)).json()["opened"])
    assert client.get(f"/addons/capsules/{c['id']}", headers=u(client, "u2")).status_code == 404

def test_kudos(client, riya, admin):
    r = client.post("/addons/kudos", headers=riya, json={"to": "u1", "kind": "helpful", "note": "thanks!"}); assert r.status_code == 200, r.text
    assert client.post("/addons/kudos", headers=riya, json={"to": "usr_riya", "kind": "kind"}).status_code == 400
    cfg(client, admin, {"addons": {"glow": {"kudosPerDay": 1}}})
    assert client.post("/addons/kudos", headers=riya, json={"to": "u1", "kind": "brave"}).status_code == 429
    b = client.get("/addons/kudos", headers=u(client, "u1")).json()
    assert b["totals"]["Helpful"] == 1 and any(x["user"]["id"] == "u1" for x in b["board"])

def test_pacts(client, riya, admin):
    cid, other = friend_conv(client, riya)
    p = client.post(f"/addons/convs/{cid}/pacts", headers=riya, json={"title": "Goa trip", "items": ["Book train", "Pack"]}).json()
    assert p["total"] == 2 and p["done"] == 0
    o = u(client, other)
    p = client.patch(f"/addons/pacts/{p['id']}", headers=o, json={"toggle": p["items"][0]["id"]}).json(); assert p["done"] == 1
    p = client.patch(f"/addons/pacts/{p['id']}", headers=o, json={"add": "Sunscreen"}).json(); assert p["total"] == 3
    assert client.delete(f"/addons/pacts/{p['id']}", headers=o).status_code == 403
    assert client.get(f"/addons/convs/{cid}/pacts", headers=u(client, "u2")).status_code == 404 or "u2" == other
    cfg(client, admin, {"addons": {"hush": {"pacts": False}}})
    assert client.get(f"/addons/convs/{cid}/pacts", headers=riya).status_code == 403

def test_hush_tab(client, riya):
    cid, other = friend_conv(client, riya)
    t = client.post(f"/addons/convs/{cid}/tabs", headers=riya, json={"title": "Dinner", "amount": 1001}).json()
    shares = {s["user"]["id"]: s["share"] for s in t["split"]}; assert sum(shares.values()) == 1001
    r = client.get(f"/addons/convs/{cid}/tabs", headers=riya).json(); assert r["myNet"] == shares[other]
    o = u(client, other)
    assert client.post(f"/addons/tabs/{t['id']}/settle", headers=o).status_code == 200
    assert client.get(f"/addons/convs/{cid}/tabs", headers=riya).json()["myNet"] == 0
    assert client.post(f"/addons/convs/{cid}/tabs", headers=riya, json={"title": "x", "amount": 100, "shares": {"usr_riya": 50, other: 40}}).status_code == 400

def test_safe_arrival(client, riya):
    db = SessionLocal(); fr = db.scalars(__import__("sqlalchemy").select(M.Friend.friend_id).where(M.Friend.user_id == "usr_riya")).first(); db.close()
    assert fr
    assert client.post("/addons/safe-arrival", headers=riya, json={"minutes": 30, "watchers": ["u2x-not-friend"]}).status_code == 400
    s = client.post("/addons/safe-arrival", headers=riya, json={"minutes": 30, "watchers": [fr], "note": "Cab home"}).json()
    assert s["status"] == "active"
    db = SessionLocal(); db.get(M.SafeArrival, s["id"]).due_at = 1; db.commit(); db.close()
    w = client.get("/addons/safe-arrival", headers=u(client, fr) if fr.startswith("u") else riya).json()
    assert client.get("/addons/safe-arrival", headers=riya).json()["mine"]["status"] == "alerted"
    assert client.post(f"/addons/safe-arrival/{s['id']}", headers=riya, json={"action": "arrived"}).json()["status"] == "arrived"
    assert client.get("/addons/safe-arrival", headers=riya).json()["mine"] is None

def test_admin_overview(client, admin, riya):
    r = client.get("/admin/addons", headers=admin).json(); assert r["glow"]["dailySpark"]["on"] and "safeArrival" in r["hush"]
    assert client.get("/admin/addons", headers=riya).status_code == 403
