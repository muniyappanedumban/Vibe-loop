"""Add-ons batch 6 (Hush): Check-in Circle, Plan Board, Birthday Buddy, Ride Rota, Decision Dice, Gift Pool — plus their admin switches."""
import time
from datetime import datetime, timezone, timedelta
from tests.conftest import login
from app.db import SessionLocal
from app import models as M
from app.routes_addons_b6 import B6Birthday, remind_due

def u(c, id): return login(c, f"{id}@demo.vibeloop.app")
def off(client, admin, key): r = client.put("/admin/config/base", json={"addons": {"hush": {key: False}}}, headers=admin); assert r.status_code == 200, r.text
def group(members=("usr_riya", "u1", "u3")):
    db = SessionLocal()
    try:
        c = M.Conv(title="Crew", group=True, members=list(members), created_by=members[0], state={m: {} for m in members}); db.add(c); db.commit(); return c.id
    finally: db.close()
def soon(h=24): return int(time.time() * 1000) + h * 3_600_000

def test_checkin_circle(client, riya, admin):
    cid = group(); o = u(client, "u1"); out = u(client, "u2")
    r = client.post(f"/addons/b6/convs/{cid}/checkins", headers=riya, json={"mood": 4, "note": "good day"}); assert r.status_code == 200, r.text
    client.post(f"/addons/b6/convs/{cid}/checkins", headers=o, json={"mood": 2})
    d = client.post(f"/addons/b6/convs/{cid}/checkins", headers=riya, json={"mood": 5}).json()  # edit, not duplicate
    assert d["answered"] and d["todayCount"] == 2 and len(d["days"]) == 7
    me = next(m for m in d["members"] if m["user"]["id"] == "usr_riya"); assert me["strip"][-1]["mood"] == 5
    assert client.post(f"/addons/b6/convs/{cid}/checkins", headers=riya, json={"mood": 9}).status_code == 422
    assert client.get(f"/addons/b6/convs/{cid}/checkins", headers=out).status_code == 404
    off(client, admin, "checkInCircle"); assert client.get(f"/addons/b6/convs/{cid}/checkins", headers=riya).status_code == 403

def test_plan_board(client, riya, admin):
    cid = group(); o = u(client, "u1")
    p = client.post(f"/addons/b6/convs/{cid}/plans", headers=riya, json={"title": "Picnic", "place": "Cubbon Park", "startsAt": soon()}).json()
    assert p["counts"]["yes"] == 1
    p = client.post(f"/addons/b6/plans/{p['id']}/rsvp", headers=o, json={"answer": "maybe"}).json(); assert p["counts"]["maybe"] == 1 and p["me"] == "maybe"
    assert client.post(f"/addons/b6/plans/{p['id']}/rsvp", headers=o, json={"answer": "sure"}).status_code == 422
    assert client.post(f"/addons/b6/convs/{cid}/plans", headers=riya, json={"title": "x", "startsAt": soon(-2)}).status_code == 400
    assert [x["id"] for x in client.get(f"/addons/b6/convs/{cid}/plans", headers=o).json()] == [p["id"]]
    assert client.delete(f"/addons/b6/plans/{p['id']}", headers=o).status_code == 403
    assert client.post(f"/addons/b6/plans/{p['id']}/rsvp", headers=u(client, "u2"), json={"answer": "yes"}).status_code == 404
    off(client, admin, "planBoard"); assert client.get(f"/addons/b6/convs/{cid}/plans", headers=riya).status_code == 403

def test_birthday_buddy(client, riya, admin):
    cid = group(); tmr = datetime.now(timezone.utc).date() + timedelta(days=1)
    assert client.put(f"/addons/b6/convs/{cid}/birthdays", headers=riya, json={"month": 2, "day": 31}).status_code == 400
    assert client.put(f"/addons/b6/convs/{cid}/birthdays", headers=riya, json={"month": 13, "day": 1}).status_code == 422
    d = client.put(f"/addons/b6/convs/{cid}/birthdays", headers=riya, json={"month": tmr.month, "day": tmr.day}).json()
    assert d["mine"] == {"month": tmr.month, "day": tmr.day} and d["upcoming"][0]["inDays"] == 1
    db = SessionLocal()
    try:
        b = db.query(B6Birthday).filter_by(conv_id=cid).one(); assert b.reminded == tmr.isoformat()  # reminded on read
        assert remind_due(db, [cid]) == 0  # only once
    finally: db.close()
    assert client.get(f"/addons/b6/convs/{cid}/birthdays", headers=u(client, "u2")).status_code == 404
    off(client, admin, "birthdayBuddy"); assert client.get(f"/addons/b6/convs/{cid}/birthdays", headers=riya).status_code == 403

def test_ride_rota(client, riya, admin):
    cid = group(); o = u(client, "u1"); o3 = u(client, "u3")
    r = client.post(f"/addons/b6/convs/{cid}/rides", headers=riya, json={"dest": "Nandi Hills", "leavesAt": soon(), "seats": 1}).json()
    assert client.post(f"/addons/b6/rides/{r['id']}", headers=riya, json={"action": "claim"}).status_code == 400
    assert client.post(f"/addons/b6/rides/{r['id']}", headers=o, json={"action": "claim"}).json()["left"] == 0
    assert client.post(f"/addons/b6/rides/{r['id']}", headers=o3, json={"action": "claim"}).status_code == 409
    assert client.post(f"/addons/b6/rides/{r['id']}", headers=o, json={"action": "close"}).status_code == 403
    assert client.post(f"/addons/b6/rides/{r['id']}", headers=riya, json={"action": "close"}).json()["closed"]
    assert client.post(f"/addons/b6/convs/{cid}/rides", headers=riya, json={"dest": "x", "leavesAt": soon(), "seats": 40}).status_code == 400
    assert client.post(f"/addons/b6/convs/{cid}/rides", headers=u(client, "u2"), json={"dest": "x", "leavesAt": soon(), "seats": 2}).status_code == 404
    off(client, admin, "rideRota"); assert client.get(f"/addons/b6/convs/{cid}/rides", headers=riya).status_code == 403

def test_decision_dice(client, riya, admin):
    cid = group(); o = u(client, "u1")
    assert client.post(f"/addons/b6/convs/{cid}/dice", headers=riya, json={"question": "Dinner?", "options": ["Pizza", "pizza "[:5]]}).status_code == 400
    d = client.post(f"/addons/b6/convs/{cid}/dice", headers=riya, json={"question": "Dinner?", "options": ["Pizza", "Dosa", "Momos"]}).json()
    client.post(f"/addons/b6/dice/{d['id']}/vote", headers=o, json={"option": 1})
    assert client.post(f"/addons/b6/dice/{d['id']}/vote", headers=o, json={"option": 7}).status_code == 400
    assert client.post(f"/addons/b6/dice/{d['id']}/settle", headers=o, json={"method": "roll"}).status_code == 403
    s = client.post(f"/addons/b6/dice/{d['id']}/settle", headers=riya, json={"method": "vote"}).json(); assert s["resultText"] == "Dosa"
    d2 = client.post(f"/addons/b6/convs/{cid}/dice", headers=riya, json={"question": "Movie?", "options": ["A", "B"]}).json()
    s2 = client.post(f"/addons/b6/dice/{d2['id']}/settle", headers=riya, json={"method": "roll"}).json(); assert s2["result"] in (0, 1) and s2["method"] == "roll"
    assert client.post(f"/addons/b6/dice/{d2['id']}/settle", headers=riya, json={"method": "roll"}).status_code == 400
    off(client, admin, "decisionDice"); assert client.get(f"/addons/b6/convs/{cid}/dice", headers=riya).status_code == 403

def test_gift_pool(client, riya, admin):
    cid = group(); o = u(client, "u1")
    g = client.post(f"/addons/b6/convs/{cid}/gifts", headers=riya, json={"forName": "Aarav", "idea": "Headphones", "target": 300000}).json()
    client.post(f"/addons/b6/gifts/{g['id']}/pledge", headers=riya, json={"amount": 100000})
    g = client.post(f"/addons/b6/gifts/{g['id']}/pledge", headers=o, json={"amount": 50000}).json(); assert g["pledged"] == 150000 and g["pct"] == 50
    assert client.post(f"/addons/b6/gifts/{g['id']}/pledge", headers=o, json={"amount": -5}).status_code == 422
    assert client.post(f"/addons/b6/gifts/{g['id']}/purchased", headers=o).status_code == 403
    assert client.post(f"/addons/b6/gifts/{g['id']}/purchased", headers=riya).json()["purchased"]
    assert client.post(f"/addons/b6/gifts/{g['id']}/pledge", headers=o, json={"amount": 1}).status_code == 400
    assert client.get(f"/addons/b6/convs/{cid}/gifts", headers=u(client, "u2")).status_code == 404
    off(client, admin, "giftPool"); assert client.get(f"/addons/b6/convs/{cid}/gifts", headers=riya).status_code == 403

def test_admin_b6(client, riya, admin):
    assert client.get("/admin/addons/b6", headers=riya).status_code == 403
    off(client, admin, "rideRota")
    d = client.get("/admin/addons/b6", headers=admin).json()
    assert d["module"] == "hush" and len(d["items"]) == 6
    assert next(i for i in d["items"] if i["flag"] == "addons.hush.rideRota")["on"] is False
