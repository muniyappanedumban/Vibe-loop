"""Add-ons batch 9 (Hush): Confession Box, Time Zone Board, Read-Later Shelf, Study Sprint, Shared Budget, Vote to Pin."""
from tests.conftest import login
from app.db import SessionLocal
from app import models as M
from app import routes_addons_b9 as B

def u(c, id): return login(c, f"{id}@demo.vibeloop.app")
def off(client, admin, key): r = client.put("/admin/config/base", json={"addons": {"hush": {key: False}}}, headers=admin); assert r.status_code == 200, r.text
def group(members=("usr_riya", "u1", "u3")):
    db = SessionLocal()
    try:
        c = M.Conv(title="Study crew", group=True, members=list(members), created_by=members[0], state={m: {} for m in members}); db.add(c); db.commit(); return c.id
    finally: db.close()

def test_confession_box(client, riya, admin):
    cid = group(); u1 = u(client, "u1")
    dm = group(("usr_riya", "u1")); db = SessionLocal(); db.get(M.Conv, dm).group = False; db.commit(); db.close()
    assert client.post(f"/addons/b9/convs/{dm}/confession-boxes", headers=riya, json={"title": "x"}).status_code == 400
    assert client.post(f"/addons/b9/convs/{cid}/confession-boxes", headers=riya, json={"title": ""}).status_code == 422
    b = client.post(f"/addons/b9/convs/{cid}/confession-boxes", headers=riya, json={"title": "Exam week"}).json()
    n = client.post(f"/addons/b9/confession-boxes/{b['id']}/notes", headers=u1, json={"text": "I haven't started"}).json()
    seen = client.get(f"/addons/b9/confession-boxes/{b['id']}", headers=riya).json()
    assert seen["count"] == 1 and "user" not in seen["notes"][0] and not seen["notes"][0]["mine"]
    assert client.post(f"/addons/b9/confessions/{n['id']}/react", headers=riya, json={"kind": "same"}).json()["reactions"]["same"] == 1
    assert client.get(f"/addons/b9/confession-boxes/{b['id']}", headers=u(client, "u2")).status_code == 404
    assert client.post(f"/addons/b9/confession-boxes/{b['id']}/close", headers=u1).status_code == 403
    assert client.post(f"/addons/b9/confession-boxes/{b['id']}/close", headers=riya).json()["open"] is False
    assert client.post(f"/addons/b9/confession-boxes/{b['id']}/notes", headers=u1, json={"text": "late"}).status_code == 409
    staff = client.get("/admin/addons/b9/confessions", headers=admin).json(); assert staff[0]["sender"]["id"] == "u1"
    assert client.get("/admin/addons/b9/confessions", headers=riya).status_code == 403
    assert client.delete(f"/addons/b9/confessions/{n['id']}", headers=riya).status_code == 404
    off(client, admin, "confessionBox"); assert client.get(f"/addons/b9/convs/{cid}/confession-boxes", headers=riya).status_code == 403
    assert client.delete(f"/addons/b9/confessions/{n['id']}", headers=u1).status_code == 403

def test_time_zone_board(client, riya, admin):
    cid = group(("usr_riya", "u1"))
    assert client.put(f"/addons/b9/convs/{cid}/timezones", headers=riya, json={"city": "Pune", "offsetMin": 9999}).status_code == 422
    assert client.put(f"/addons/b9/convs/{cid}/timezones", headers=riya, json={"city": "Pune", "offsetMin": 330, "wake": 20, "sleep": 10}).status_code == 400
    client.put(f"/addons/b9/convs/{cid}/timezones", headers=riya, json={"city": "Pune", "offsetMin": 330})
    r = client.put(f"/addons/b9/convs/{cid}/timezones", headers=u(client, "u1"), json={"city": "London", "offsetMin": 0}).json()
    assert len(r["people"]) == 2 and r["missing"] == 0
    # Pune 9-22 local = 3:30-16:30 UTC → full hours 4..16; London 9..21 → overlap 9..16
    assert r["overlapUtcHours"] == list(range(9, 17))
    assert client.get(f"/addons/b9/convs/{cid}/timezones", headers=u(client, "u2")).status_code == 404
    off(client, admin, "timeZoneBoard"); assert client.get(f"/addons/b9/convs/{cid}/timezones", headers=riya).status_code == 403

def test_read_later_shelf(client, riya, admin):
    cid = group(("usr_riya", "u1")); u1 = u(client, "u1")
    assert client.post(f"/addons/b9/convs/{cid}/shelf", headers=riya, json={"url": "not a link", "title": "x"}).status_code == 422
    s = client.post(f"/addons/b9/convs/{cid}/shelf", headers=riya, json={"url": "https://example.com/a", "title": "Essay", "note": "read before Fri"}).json()
    assert client.get(f"/addons/b9/convs/{cid}/shelf", headers=u1).json()["unread"] == 1
    assert client.post(f"/addons/b9/shelf/{s['id']}/read", headers=u1).json()["read"] is True
    assert client.get(f"/addons/b9/convs/{cid}/shelf", headers=u1).json()["unread"] == 0
    assert client.get(f"/addons/b9/convs/{cid}/shelf", headers=riya).json()["unread"] == 1  # per member
    assert client.delete(f"/addons/b9/shelf/{s['id']}", headers=u1).status_code == 403
    assert client.post(f"/addons/b9/shelf/{s['id']}/read", headers=u(client, "u2")).status_code == 404
    off(client, admin, "readLaterShelf"); assert client.get(f"/addons/b9/convs/{cid}/shelf", headers=riya).status_code == 403

def test_study_sprint(client, riya, admin):
    cid = group(); u1 = u(client, "u1"); u3 = u(client, "u3")
    assert client.post(f"/addons/b9/convs/{cid}/sprints", headers=riya, json={"minutes": 30}).status_code == 400
    s = client.post(f"/addons/b9/convs/{cid}/sprints", headers=riya, json={"minutes": 25, "goal": "Chapter 4"}).json()
    assert client.post(f"/addons/b9/convs/{cid}/sprints", headers=u1, json={"minutes": 50}).status_code == 409
    client.post(f"/addons/b9/sprints/{s['id']}", headers=u1, json={"action": "join"})
    client.post(f"/addons/b9/sprints/{s['id']}", headers=u3, json={"action": "join"})
    client.post(f"/addons/b9/sprints/{s['id']}", headers=u3, json={"action": "leave"})
    assert client.post(f"/addons/b9/sprints/{s['id']}", headers=u(client, "u2"), json={"action": "join"}).status_code == 404
    db = SessionLocal(); db.get(B.Sprint, s["id"]).ends_at = 1; db.commit(); db.close()
    r = client.get(f"/addons/b9/convs/{cid}/sprints", headers=riya).json()
    assert r["current"] is None and {x["id"] for x in r["past"][0]["completed"]} == {"usr_riya", "u1"}
    assert {b["user"]["id"]: b["minutes"] for b in r["board"]} == {"usr_riya": 25, "u1": 25}
    assert client.post(f"/addons/b9/sprints/{s['id']}", headers=u3, json={"action": "join"}).status_code == 409
    off(client, admin, "studySprint"); assert client.get(f"/addons/b9/convs/{cid}/sprints", headers=riya).status_code == 403

def test_shared_budget(client, riya, admin):
    cid = group(("usr_riya", "u1")); u1 = u(client, "u1")
    assert client.post(f"/addons/b9/convs/{cid}/budgets", headers=riya, json={"title": "Trip", "categories": []}).status_code == 422
    b = client.post(f"/addons/b9/convs/{cid}/budgets", headers=riya, json={"title": "Trip", "categories": [{"name": "Food", "limit": 5000}, {"name": "Stay", "limit": 20000}]}).json()
    food = b["categories"][0]["id"]
    r = client.post(f"/addons/b9/budgets/{b['id']}/spends", headers=u1, json={"category": food, "amount": 1200, "note": "Thali"}).json()
    assert r["categories"][0]["remaining"] == 3800 and r["totalSpent"] == 1200
    assert client.post(f"/addons/b9/budgets/{b['id']}/spends", headers=u1, json={"category": "nope", "amount": 1}).status_code == 400
    assert client.post(f"/addons/b9/budgets/{b['id']}/spends", headers=u(client, "u2"), json={"category": food, "amount": 1}).status_code == 404
    assert client.delete(f"/addons/b9/budgets/{b['id']}", headers=u1).status_code == 403
    assert client.delete(f"/addons/b9/budget-spends/{r['spends'][0]['id']}", headers=riya).json()["totalSpent"] == 0
    off(client, admin, "sharedBudget"); assert client.get(f"/addons/b9/convs/{cid}/budgets", headers=riya).status_code == 403

def test_vote_to_pin(client, riya, admin):
    cid = group(("usr_riya", "u1", "u3", "u4"))
    assert client.post(f"/addons/b9/convs/{cid}/pins", headers=riya, json={"text": ""}).status_code == 422
    r = client.post(f"/addons/b9/convs/{cid}/pins", headers=riya, json={"text": "Exam on 3rd Dec, room 204"}).json()
    p = r["proposals"][0]; assert r["pinned"] is None and p["yes"] == 1 and p["need"] == 2
    assert client.post(f"/addons/b9/pins/{p['id']}/vote", headers=u(client, "u2")).status_code == 404
    r = client.post(f"/addons/b9/pins/{p['id']}/vote", headers=u(client, "u1")).json()
    assert r["pinned"]["text"].startswith("Exam") and r["proposals"] == []
    assert client.post(f"/addons/b9/pins/{p['id']}/vote", headers=u(client, "u3")).status_code == 409
    off(client, admin, "voteToPin"); assert client.get(f"/addons/b9/convs/{cid}/pins", headers=riya).status_code == 403

def test_admin_overview(client, riya, admin):
    r = client.get("/admin/addons/b9", headers=admin).json()
    assert r["module"] == "hush" and len(r["items"]) == 6 and all(i["on"] for i in r["items"])
    assert client.get("/admin/addons/b9", headers=riya).status_code == 403
    off(client, admin, "studySprint")
    assert not next(i for i in client.get("/admin/addons/b9", headers=admin).json()["items"] if i["flag"] == "addons.hush.studySprint")["on"]
