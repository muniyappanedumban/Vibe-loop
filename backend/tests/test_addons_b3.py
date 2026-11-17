"""Add-ons batch 3 (Glow): Local Pulse, Skill Swap Board, Ask Box, Memory Lane, Goal Ladder, Wish Shelf — plus their admin switches."""
from datetime import datetime, timezone
from sqlalchemy import select
from tests.conftest import login
from app.db import SessionLocal
from app import models as M
from app import routes_addons_b3 as B

def u(c, id): return login(c, f"{id}@demo.vibeloop.app")
def off(client, admin, key): r = client.put("/admin/config/base", json={"addons": {"glow": {key: False}}}, headers=admin); assert r.status_code == 200, r.text
def friend_of_riya():
    db = SessionLocal()
    try: return db.scalars(select(M.Friend.friend_id).where(M.Friend.user_id == "usr_riya", M.Friend.friend_id.like("u%"))).first()
    finally: db.close()
def stranger():
    db = SessionLocal()
    try: return next(x for x in ("u2", "u3", "u4", "u5", "u6", "u7") if not db.get(M.Friend, ("usr_riya", x)) and not db.get(M.Friend, (x, "usr_riya")))
    finally: db.close()

def test_local_pulse(client, riya, admin):
    assert client.post("/addons/b3/pulse", headers=riya, json={"area": "I", "text": "x"}).status_code == 422
    p = client.post("/addons/b3/pulse", headers=riya, json={"area": " Indiranagar ", "text": "Metro gate 2 closed"}).json()
    assert p["area"] == "Indiranagar" and p["expiresAt"] > p["at"]
    assert any(x["id"] == p["id"] for x in client.get("/addons/b3/pulse?area=indiranagar", headers=riya).json()["items"])
    assert client.get("/addons/b3/pulse?area=Koramangala", headers=riya).json()["items"] == []
    assert client.get("/addons/b3/pulse/areas", headers=riya).json()[0]["area"] == "Indiranagar"
    o = u(client, "u1")
    assert client.delete(f"/addons/b3/pulse/{p['id']}", headers=o).status_code == 404
    assert client.post(f"/addons/b3/pulse/{p['id']}/report", headers=riya, json={"reason": "spam"}).status_code == 400
    assert client.post(f"/addons/b3/pulse/{p['id']}/report", headers=o, json={"reason": "spam"}).status_code == 200
    db = SessionLocal()
    try:
        assert db.scalar(select(M.Report).where(M.Report.target == f"pulse:{p['id']}"))
        db.get(B.PulseNote, p["id"]).expires_at = 1; db.commit()
    finally: db.close()
    assert client.get("/addons/b3/pulse", headers=riya).json()["items"] == []        # expired
    assert client.get("/admin/addons/b3/pulse/reports", headers=riya).status_code == 403
    assert client.get("/admin/addons/b3/pulse/reports", headers=admin).json()[0]["reports"][0]["reason"] == "spam"
    s = client.get("/admin/addons/b3", headers=admin).json(); assert s["module"] == "glow" and len(s["items"]) == 6
    assert next(i for i in s["items"] if i["flag"] == "addons.glow.localPulse")["week"] == 1
    off(client, admin, "localPulse")
    assert client.get("/addons/b3/pulse", headers=riya).status_code == 403
    assert next(i for i in client.get("/admin/addons/b3", headers=admin).json()["items"] if i["flag"] == "addons.glow.localPulse")["on"] is False

def test_skill_swap(client, riya, admin):
    assert client.post("/addons/b3/skills", headers=riya, json={"teach": "Guitar", "learn": "guitar"}).status_code == 400
    mine = client.post("/addons/b3/skills", headers=riya, json={"teach": "Guitar", "learn": "Python"}).json()
    o = u(client, "u1"); x = u(client, "u2")
    theirs = client.post("/addons/b3/skills", headers=o, json={"teach": "Python basics", "learn": "Guitar"}).json()
    client.post("/addons/b3/skills", headers=x, json={"teach": "Baking", "learn": "Chess"})
    m = client.get(f"/addons/b3/skills/{mine['id']}/matches", headers=riya).json()
    assert m[0]["id"] == theirs["id"] and m[0]["perfect"] and len(m) == 1
    assert client.get(f"/addons/b3/skills/{mine['id']}/matches", headers=o).status_code == 404
    r = client.post(f"/addons/b3/skills/{theirs['id']}/request", headers=riya, json={"message": "Swap?"}).json()
    assert client.post(f"/addons/b3/skills/{theirs['id']}/request", headers=riya, json={}).status_code == 409
    assert client.post(f"/addons/b3/swaps/{r['id']}", headers=riya, json={"action": "accept"}).status_code == 403
    assert client.post(f"/addons/b3/swaps/{r['id']}", headers=x, json={"action": "accept"}).status_code == 404
    assert client.post(f"/addons/b3/swaps/{r['id']}", headers=o, json={"action": "maybe"}).status_code == 422
    assert client.post(f"/addons/b3/swaps/{r['id']}", headers=o, json={"action": "accept"}).json()["status"] == "accepted"
    assert client.get("/addons/b3/swaps", headers=riya).json()[0]["status"] == "accepted"
    off(client, admin, "skillSwap")
    assert client.get("/addons/b3/skills", headers=riya).status_code == 403

def test_ask_box(client, riya, admin):
    o = u(client, "u1")
    assert client.post("/addons/b3/ask/u1", headers=riya, json={"text": "hi"}).status_code == 422
    assert client.post("/addons/b3/ask/usr_riya", headers=riya, json={"text": "Self question"}).status_code == 400
    q = client.post("/addons/b3/ask/u1", headers=riya, json={"text": "How did you start drawing?", "anon": True}).json()
    inbox = client.get("/addons/b3/ask", headers=o).json(); assert inbox["pending"][0]["asker"] is None   # anonymous to creator
    assert client.get("/admin/addons/b3/ask", headers=admin).json()[0]["asker"]["id"] == "usr_riya"     # never to staff
    assert client.post(f"/addons/b3/ask/q/{q['id']}/answer", headers=riya, json={"text": "hijack"}).status_code == 404
    assert client.get("/addons/b3/ask/box/u1", headers=riya).json()["answered"] == []
    assert client.post(f"/addons/b3/ask/q/{q['id']}/answer", headers=o, json={"text": "Doodling in class"}).status_code == 200
    box = client.get("/addons/b3/ask/box/u1", headers=u(client, "u2")).json()["answered"]
    assert box[0]["answer"] == "Doodling in class" and box[0]["asker"] is None
    q2 = client.post("/addons/b3/ask/u1", headers=riya, json={"text": "Second question here"}).json()
    assert client.delete(f"/addons/b3/ask/q/{q2['id']}", headers=riya).status_code == 404
    assert client.delete(f"/addons/b3/ask/q/{q2['id']}", headers=o).status_code == 200
    off(client, admin, "askBox")
    assert client.post("/addons/b3/ask/u1", headers=riya, json={"text": "Another one?"}).status_code == 403

def test_memory_lane(client, riya, admin):
    now = datetime.now(timezone.utc); past = now.replace(year=now.year - 2, day=min(now.day, 28)) if now.month == 2 else now.replace(year=now.year - 2)
    db = SessionLocal()
    try:
        old = M.Post(author_id="usr_riya", kind="text", text="Two years ago today", at=int(past.timestamp() * 1000)); db.add(old)
        other = M.Post(author_id="u1", kind="text", text="Not mine", at=int(past.timestamp() * 1000)); db.add(other); db.commit()
        oid, xid = old.id, other.id
    finally: db.close()
    r = client.get("/addons/b3/memories", headers=riya).json()
    ids = [p["id"] for p in r["onThisDay"]]; assert oid in ids and xid not in ids
    assert client.post("/addons/b3/memories", headers=riya, json={"postId": xid}).status_code == 404
    assert client.post("/addons/b3/memories", headers=riya, json={"postId": oid, "note": "x" * 201}).status_code == 422
    pin = client.post("/addons/b3/memories", headers=riya, json={"postId": oid, "note": "First trip"}).json()
    assert client.get("/addons/b3/memories", headers=riya).json()["pinned"][0]["note"] == "First trip"
    assert client.delete(f"/addons/b3/memories/{pin['id']}", headers=u(client, "u1")).status_code == 404
    assert client.delete(f"/addons/b3/memories/{pin['id']}", headers=riya).status_code == 200
    off(client, admin, "memoryLane")
    assert client.get("/addons/b3/memories", headers=riya).status_code == 403

def test_goal_ladder(client, riya, admin):
    assert client.post("/addons/b3/goals", headers=riya, json={"title": "Run", "steps": [str(i) for i in range(11)]}).status_code == 422
    g = client.post("/addons/b3/goals", headers=riya, json={"title": "Run a 10K", "steps": ["5K", "8K", "10K"]}).json()
    assert g["total"] == 3 and g["done"] == 0
    f = friend_of_riya(); assert f
    s = stranger()
    assert client.post(f"/addons/b3/goals/{g['id']}/cheer", headers=u(client, s)).status_code == 403
    assert client.post(f"/addons/b3/goals/{g['id']}/cheer", headers=u(client, f)).json()["cheers"] == 1
    assert client.post(f"/addons/b3/goals/{g['id']}/tick", headers=u(client, f), json={"step": g["steps"][0]["id"]}).status_code == 403
    for st in g["steps"][:-1]: r = client.post(f"/addons/b3/goals/{g['id']}/tick", headers=riya, json={"step": st["id"]}).json(); assert not r["celebrate"]
    r = client.post(f"/addons/b3/goals/{g['id']}/tick", headers=riya, json={"step": g["steps"][-1]["id"]}).json()
    assert r["celebrate"] and r["complete"]
    assert client.get("/addons/b3/goals?user=usr_riya", headers=u(client, s)).json()["goals"][0]["complete"]
    off(client, admin, "goalLadder")
    assert client.get("/addons/b3/goals", headers=riya).status_code == 403

def test_wish_shelf(client, riya, admin):
    assert client.post("/addons/b3/wishes", headers=riya, json={"title": "Book", "link": "javascript:alert(1)"}).status_code == 422
    w = client.post("/addons/b3/wishes", headers=riya, json={"title": "Film camera", "link": "https://example.com/cam", "note": "35mm"}).json()
    f = friend_of_riya(); fh = u(client, f); s = stranger()
    assert client.get("/addons/b3/wishes/of/usr_riya", headers=u(client, s)).status_code == 403
    assert client.post(f"/addons/b3/wishes/{w['id']}/claim", headers=u(client, s)).status_code == 403
    assert client.post(f"/addons/b3/wishes/{w['id']}/claim", headers=riya).status_code == 400
    assert client.post(f"/addons/b3/wishes/{w['id']}/claim", headers=fh).json()["claimedByMe"]
    mine = client.get("/addons/b3/wishes", headers=riya).json()["items"][0]
    assert "claimed" not in mine and "claimedByMe" not in mine                       # hidden from owner
    assert "claimed" not in client.get("/addons/b3/wishes/of/usr_riya", headers=riya).json()["items"][0]
    assert client.get("/addons/b3/wishes/of/usr_riya", headers=fh).json()["items"][0]["claimed"]
    assert not client.delete(f"/addons/b3/wishes/{w['id']}/claim", headers=fh).json()["claimed"]
    off(client, admin, "wishShelf")
    assert client.get("/addons/b3/wishes", headers=riya).status_code == 403
