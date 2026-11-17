"""Add-ons batch 7 (Hush): Chore Rotation, Watch Queue, Secret Santa, Lend Log, Habit Buddies, Trip Planner — plus their admin switches."""
import time
from sqlalchemy import select
from tests.conftest import login
from app.db import SessionLocal
from app import models as M

def u(c, id): return login(c, f"{id}@demo.vibeloop.app")
def hdr(c, uid): return login(c, "riya@vibeloop.app") if uid == "usr_riya" else u(c, uid)
def off(client, admin, key):
    r = client.put("/admin/config/base", json={"addons": {"hush": {key: False}}}, headers=admin); assert r.status_code == 200, r.text
def friend_conv(client, riya):
    for m in ("u1", "u3", "u4", "u5", "u6", "u7"):
        r = client.post("/conv", headers=riya, json={"members": [m]})
        if r.status_code == 200: return r.json()["id"], m
    raise AssertionError("no conv")
def group_conv(client, riya):
    cands = ("u1", "u3", "u4", "u5", "u6", "u7")
    for i, a in enumerate(cands):
        for b in cands[i + 1:]:
            r = client.post("/conv", headers=riya, json={"members": [a, b], "title": "Crew"})
            if r.status_code == 200: return r.json()["id"], [a, b]
    raise AssertionError("no group")
def outsider(client, cid):
    db = SessionLocal()
    try: mem = db.get(M.Conv, cid).members
    finally: db.close()
    return next(x for x in ("u2", "u8", "u9", "u10", "u1", "u3", "u4") if x not in mem)

def test_chore_rotation(client, riya, admin):
    cid, other = friend_conv(client, riya); o = u(client, other)
    x = client.post(f"/addons/b7/convs/{cid}/chores", headers=riya, json={"title": "Bins out", "everyDays": 3, "rota": ["usr_riya", other]}).json()
    assert x["myTurn"] and not x["overdue"]
    assert client.post(f"/addons/b7/chores/{x['id']}/done", headers=o).status_code == 403          # not their turn
    x = client.post(f"/addons/b7/chores/{x['id']}/done", headers=riya).json(); assert not x["myTurn"] and x["onDuty"]["id"] == other
    db = SessionLocal()
    try: from app.routes_addons_b7 import B7Chore; db.get(B7Chore, x["id"]).due_at = 1; db.commit()
    finally: db.close()
    assert client.get(f"/addons/b7/convs/{cid}/chores", headers=o).json()[0]["overdue"]
    assert client.post(f"/addons/b7/chores/{x['id']}/done", headers=o).json()["onDuty"]["id"] == "usr_riya"
    assert client.post(f"/addons/b7/convs/{cid}/chores", headers=riya, json={"title": "", "everyDays": 3}).status_code == 422
    assert client.post(f"/addons/b7/convs/{cid}/chores", headers=riya, json={"title": "x", "rota": ["u2zz"]}).status_code == 400
    assert client.get(f"/addons/b7/convs/{cid}/chores", headers=u(client, outsider(client, cid))).status_code == 404
    off(client, admin, "choreRotation")
    assert client.get(f"/addons/b7/convs/{cid}/chores", headers=riya).status_code == 403

def test_watch_queue(client, riya, admin):
    cid, other = friend_conv(client, riya); o = u(client, other)
    a = client.post(f"/addons/b7/convs/{cid}/watch", headers=riya, json={"title": "Night Train", "kind": "movie"}).json()
    b = client.post(f"/addons/b7/convs/{cid}/watch", headers=o, json={"title": "Sky Diaries", "kind": "show"}).json()
    assert client.post(f"/addons/b7/convs/{cid}/watch", headers=o, json={"title": "night train"}).status_code == 409
    assert client.post(f"/addons/b7/watch/{b['id']}/vote", headers=riya).json()["votes"] == 2
    q = client.get(f"/addons/b7/convs/{cid}/watch", headers=riya).json()["queue"]; assert q[0]["id"] == b["id"]
    assert client.post(f"/addons/b7/watch/{a['id']}/rate", headers=riya, json={"stars": 6}).status_code == 422
    client.post(f"/addons/b7/watch/{a['id']}/rate", headers=riya, json={"stars": 5})
    r = client.post(f"/addons/b7/watch/{a['id']}/rate", headers=o, json={"stars": 4}).json(); assert r["watched"] and r["avg"] == 4.5
    assert client.delete(f"/addons/b7/watch/{a['id']}", headers=o).status_code == 403
    assert client.post(f"/addons/b7/watch/{a['id']}/vote", headers=u(client, outsider(client, cid))).status_code == 404
    off(client, admin, "watchQueue")
    assert client.get(f"/addons/b7/convs/{cid}/watch", headers=riya).status_code == 403

def test_secret_santa(client, riya, admin):
    dm, _ = friend_conv(client, riya)
    assert client.post(f"/addons/b7/convs/{dm}/santa", headers=riya, json={"title": "x"}).status_code == 400   # needs a group
    cid, (a, b) = group_conv(client, riya); ha, hb = u(client, a), u(client, b)
    s = client.post(f"/addons/b7/convs/{cid}/santa", headers=riya, json={"title": "Office gifts", "budget": "₹500"}).json()
    client.post(f"/addons/b7/santa/{s['id']}", headers=ha, json={"action": "join"})
    assert client.post(f"/addons/b7/santa/{s['id']}", headers=riya, json={"action": "draw"}).status_code == 400  # only 2 joined
    client.post(f"/addons/b7/santa/{s['id']}", headers=hb, json={"action": "join"})
    assert client.post(f"/addons/b7/santa/{s['id']}", headers=ha, json={"action": "draw"}).status_code == 403
    assert client.post(f"/addons/b7/santa/{s['id']}", headers=riya, json={"action": "shuffle"}).status_code == 422
    r = client.post(f"/addons/b7/santa/{s['id']}", headers=riya, json={"action": "draw"}).json(); assert r["status"] == "drawn"
    got = {}
    for uid, h in (("usr_riya", riya), (a, ha), (b, hb)):
        me = client.get(f"/addons/b7/convs/{cid}/santa", headers=h).json()[0]
        assert "pairs" not in me and me["myMatch"]["id"] != uid; got[uid] = me["myMatch"]["id"]
    assert sorted(got.values()) == sorted(got)                                                           # a true permutation
    assert client.get(f"/addons/b7/convs/{cid}/santa", headers=u(client, outsider(client, cid))).status_code == 404
    off(client, admin, "secretSanta")
    assert client.get(f"/addons/b7/convs/{cid}/santa", headers=riya).status_code == 403

def test_lend_log(client, riya, admin):
    cid, other = friend_conv(client, riya); o = u(client, other)
    x = client.post(f"/addons/b7/convs/{cid}/lends", headers=riya, json={"item": "Camping tent", "other": other, "dueAt": int(time.time() * 1000) + 86_400_000}).json()
    assert x["iLent"] and x["borrower"]["id"] == other
    assert client.get(f"/addons/b7/convs/{cid}/lends", headers=o).json()["entries"][0]["iLent"] is False
    assert client.post(f"/addons/b7/lends/{x['id']}/returned", headers=o).status_code == 403           # borrower can't self-clear
    assert client.post(f"/addons/b7/lends/{x['id']}/remind", headers=riya).status_code == 200
    assert client.post(f"/addons/b7/lends/{x['id']}/remind", headers=riya).status_code == 429
    assert client.post(f"/addons/b7/lends/{x['id']}/returned", headers=riya).json()["returned"]
    assert client.post(f"/addons/b7/convs/{cid}/lends", headers=riya, json={"item": "x", "other": "usr_riya"}).status_code == 400
    assert client.post(f"/addons/b7/convs/{cid}/lends", headers=riya, json={"item": "x", "other": other, "dueAt": 5}).status_code == 400
    assert client.post(f"/addons/b7/lends/{x['id']}/remind", headers=u(client, outsider(client, cid))).status_code == 404
    off(client, admin, "lendLog")
    assert client.get(f"/addons/b7/convs/{cid}/lends", headers=riya).status_code == 403

def test_habit_buddies(client, riya, admin):
    db = SessionLocal()
    try:
        fr = db.scalars(select(M.Friend.friend_id).where(M.Friend.user_id == "usr_riya")).first()
        stranger = next(x for x in ("u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8") if x != fr and not db.get(M.Friend, ("usr_riya", x)))
    finally: db.close()
    assert client.post("/addons/b7/habits", headers=riya, json={"title": "Run", "buddy": stranger}).status_code == 400
    assert client.post("/addons/b7/habits", headers=riya, json={"title": "", "buddy": fr}).status_code == 422
    h = client.post("/addons/b7/habits", headers=riya, json={"title": "10k steps", "buddy": fr}).json(); f = hdr(client, fr)
    assert client.post(f"/addons/b7/habits/{h['id']}/checkin", headers=riya).status_code == 409         # not accepted
    assert client.post(f"/addons/b7/habits/{h['id']}/accept", headers=riya).status_code == 403
    assert client.post(f"/addons/b7/habits/{h['id']}/accept", headers=f).json()["status"] == "active"
    assert client.post(f"/addons/b7/habits/{h['id']}/checkin", headers=riya).json()["streak"] == 0      # buddy hasn't yet
    r = client.post(f"/addons/b7/habits/{h['id']}/checkin", headers=f).json(); assert r["streak"] == 1 and r["meToday"] and r["buddyToday"]
    assert client.post(f"/addons/b7/habits/{h['id']}/checkin", headers=u(client, stranger)).status_code == 404
    off(client, admin, "habitBuddies")
    assert client.get("/addons/b7/habits", headers=riya).status_code == 403

def test_trip_planner(client, riya, admin):
    cid, other = friend_conv(client, riya); o = u(client, other)
    t = client.post(f"/addons/b7/convs/{cid}/trips", headers=riya, json={"title": "Hampi weekend", "days": 2}).json()
    d1 = t["days"][0]["id"]
    client.patch(f"/addons/b7/trips/{t['id']}", headers=riya, json={"op": "addItem", "dayId": d1, "time": "07:00", "title": "Sunrise at Matanga"})
    t = client.patch(f"/addons/b7/trips/{t['id']}", headers=o, json={"op": "addItem", "dayId": d1, "time": "10:30", "title": "Breakfast", "note": "Mango Tree"}).json()
    second = t["days"][0]["items"][1]["id"]
    t = client.patch(f"/addons/b7/trips/{t['id']}", headers=o, json={"op": "moveItem", "itemId": second, "dir": -1}).json()
    assert t["days"][0]["items"][0]["id"] == second
    assert client.patch(f"/addons/b7/trips/{t['id']}", headers=o, json={"op": "addItem", "dayId": d1, "time": "25:00", "title": "x"}).status_code == 422
    t = client.patch(f"/addons/b7/trips/{t['id']}", headers=o, json={"op": "deleteItem", "itemId": second}).json(); assert t["stops"] == 1
    assert len(client.patch(f"/addons/b7/trips/{t['id']}", headers=riya, json={"op": "addDay"}).json()["days"]) == 3
    assert client.post(f"/addons/b7/convs/{cid}/trips", headers=riya, json={"title": "x", "days": 45}).status_code == 400
    assert client.delete(f"/addons/b7/trips/{t['id']}", headers=o).status_code == 403
    assert t["mine"] is False and client.get(f"/addons/b7/convs/{cid}/trips", headers=riya).json()[0]["mine"] is True
    assert client.patch(f"/addons/b7/trips/{t['id']}", headers=u(client, outsider(client, cid)), json={"op": "addDay"}).status_code == 404
    off(client, admin, "tripPlanner")
    assert client.get(f"/addons/b7/convs/{cid}/trips", headers=riya).status_code == 403
    assert client.delete(f"/addons/b7/trips/{t['id']}", headers=riya).status_code == 403              # switch enforced on delete too

def test_admin_overview(client, riya, admin):
    cid, _ = friend_conv(client, riya)
    client.post(f"/addons/b7/convs/{cid}/trips", headers=riya, json={"title": "Coorg"})
    r = client.get("/admin/addons/b7", headers=admin).json()
    assert r["module"] == "hush" and len(r["items"]) == 6 and all(i["on"] for i in r["items"])
    assert next(i for i in r["items"] if i["flag"] == "addons.hush.tripPlanner")["week"] == 1
    assert client.get("/admin/addons/b7", headers=riya).status_code == 403
    off(client, admin, "watchQueue")
    assert not next(i for i in client.get("/admin/addons/b7", headers=admin).json()["items"] if i["flag"] == "addons.hush.watchQueue")["on"]
