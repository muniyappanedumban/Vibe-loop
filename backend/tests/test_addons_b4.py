"""Add-ons batch 4 (Glow): Photo Prompt, Mentor Match, Hidden Gems, Recipe Box, Book Nook, Meetup Board — plus their admin switches."""
import time
from sqlalchemy import select
from tests.conftest import login
from app.db import SessionLocal
from app import models as M
from app.routes_addons_b4 import week_of

def u(c, id): return login(c, f"{id}@demo.vibeloop.app")
def cfg(client, admin, body): r = client.put("/admin/config/base", json=body, headers=admin); assert r.status_code == 200, r.text
def off(client, admin, key): cfg(client, admin, {"addons": {"glow": {key: False}}})
def media(owner: str, mid: str) -> str:
    db = SessionLocal()
    try: db.add(M.MediaFile(id=mid, owner_id=owner, mime="image/jpeg", size=100, kind="image")); db.commit()
    finally: db.close()
    return f"/media/{mid}.jpg"
def a_friend() -> str:
    db = SessionLocal()
    try: return db.scalars(select(M.Friend.friend_id).where(M.Friend.user_id == "usr_riya")).first()
    finally: db.close()

def test_photo_prompt(client, riya, admin):
    u1 = u(client, "u1"); url = media("usr_riya", "mfb4riya1")
    assert client.post("/addons/b4/photo-prompt/entries", headers=riya, json={"mediaUrl": url}).status_code == 409  # no theme yet
    assert client.put("/admin/addons/b4/photo-prompt", headers=riya, json={"week": week_of(), "title": "Morning light"}).status_code == 403
    assert client.put("/admin/addons/b4/photo-prompt", headers=admin, json={"week": week_of(), "title": "Morning light"}).status_code == 200
    assert client.post("/addons/b4/photo-prompt/entries", headers=u1, json={"mediaUrl": url}).status_code == 400  # not their upload
    assert client.post("/addons/b4/photo-prompt/entries", headers=riya, json={"mediaUrl": "nope"}).status_code == 422
    e = client.post("/addons/b4/photo-prompt/entries", headers=riya, json={"mediaUrl": url, "caption": "6am"}).json()
    assert client.post(f"/addons/b4/photo-prompt/entries/{e['id']}/vote", headers=riya).status_code == 400  # own entry
    assert client.post(f"/addons/b4/photo-prompt/entries/{e['id']}/vote", headers=u1).json()["votes"] == 1
    g = client.get("/addons/b4/photo-prompt", headers=u1).json()
    assert g["theme"]["title"] == "Morning light" and g["entries"][0]["voted"] and g["votesLeft"] == 2
    cfg(client, admin, {"addons": {"glow": {"photoVotesPerWeek": 1}}})
    for x in ("u3", "u4"):
        h = u(client, x); client.post("/addons/b4/photo-prompt/entries", headers=h, json={"mediaUrl": media(f"{x}", f"mfb4{x}")})
    other = next(x for x in client.get("/addons/b4/photo-prompt", headers=u1).json()["entries"] if not x["voted"])
    assert client.post(f"/addons/b4/photo-prompt/entries/{other['id']}/vote", headers=u1).status_code == 429
    assert client.get("/admin/addons/b4", headers=admin).json()["items"][0]["week"] >= 1
    off(client, admin, "photoPrompt")
    assert client.get("/addons/b4/photo-prompt", headers=riya).status_code == 403

def test_mentor_match(client, riya, admin):
    u1, u3, u4 = u(client, "u1"), u(client, "u3"), u(client, "u4")
    p = client.post("/addons/b4/mentors/profile", headers=riya, json={"role": "mentor", "topic": "  Photo Editing ", "bio": "10 yrs"}).json()
    assert p["topic"] == "photo editing"
    assert client.post("/addons/b4/mentors/profile", headers=riya, json={"role": "boss", "topic": "x y"}).status_code == 422
    assert client.post("/addons/b4/mentors/request", headers=riya, json={"profileId": p["id"]}).status_code == 400  # self
    cfg(client, admin, {"addons": {"glow": {"mentorCapacity": 1}}})
    m1 = client.post("/addons/b4/mentors/request", headers=u1, json={"profileId": p["id"], "note": "hi"}).json()
    m3 = client.post("/addons/b4/mentors/request", headers=u3, json={"profileId": p["id"]}).json()
    assert client.post(f"/addons/b4/mentorships/{m1['id']}", headers=u1, json={"action": "accept"}).status_code == 403  # mentee can't accept
    assert client.post(f"/addons/b4/mentorships/{m1['id']}", headers=riya, json={"action": "accept"}).json()["status"] == "active"
    assert client.post(f"/addons/b4/mentorships/{m3['id']}", headers=riya, json={"action": "accept"}).status_code == 409  # at capacity
    assert client.post(f"/addons/b4/mentorships/{m1['id']}/notes", headers=u1, json={"text": "Session 1: curves"}).status_code == 200
    assert len(client.get(f"/addons/b4/mentorships/{m1['id']}/notes", headers=riya).json()["notes"]) == 1
    assert client.get(f"/addons/b4/mentorships/{m1['id']}/notes", headers=u4).status_code == 404
    assert any(m["topic"] == "photo editing" for m in client.get("/addons/b4/mentors?topic=photo editing", headers=u4).json()["mentors"])
    off(client, admin, "mentorMatch")
    assert client.get("/addons/b4/mentors", headers=riya).status_code == 403

def test_hidden_gems(client, riya, admin):
    u1 = u(client, "u1")
    g = client.post("/addons/b4/gems", headers=riya, json={"name": "Blue Door Bakery", "area": "bandra west", "category": "cafe", "why": "Best cardamom buns in town"}).json()
    assert g["area"] == "Bandra West"
    assert client.post("/addons/b4/gems", headers=u1, json={"name": "blue door bakery", "area": "Bandra West", "category": "cafe", "why": "Duplicate place here"}).status_code == 409
    assert client.post("/addons/b4/gems", headers=u1, json={"name": "X", "area": "Y", "category": "spa", "why": "short"}).status_code == 422
    assert client.post(f"/addons/b4/gems/{g['id']}/upvote", headers=riya).status_code == 400
    assert client.post(f"/addons/b4/gems/{g['id']}/upvote", headers=u1).json()["upvotes"] == 1
    r = client.get("/addons/b4/gems?area=Bandra West&category=cafe", headers=u1).json()
    assert r["gems"][0]["upvoted"] and r["topMonth"][0]["id"] == g["id"] and "Bandra West" in r["areas"]
    assert client.delete(f"/addons/b4/gems/{g['id']}", headers=u1).status_code == 404  # not owner
    off(client, admin, "hiddenGems")
    assert client.get("/addons/b4/gems", headers=riya).status_code == 403
    assert client.delete(f"/addons/b4/gems/{g['id']}", headers=riya).status_code == 403  # owner delete also blocked when off

def test_recipe_box(client, riya, admin):
    u1 = u(client, "u1")
    r = client.post("/addons/b4/recipes", headers=riya, json={"title": "Masala chai", "ingredients": ["Tea", "Milk", "Ginger"], "steps": ["Boil", "Steep"], "minutes": 10, "servings": 2}).json()
    assert r["ingredients"] == ["Tea", "Milk", "Ginger"] and r["cooked"] == 0
    assert client.post("/addons/b4/recipes", headers=riya, json={"title": "Empty", "ingredients": [], "steps": ["x"], "minutes": 1, "servings": 1}).status_code == 422
    assert client.post(f"/addons/b4/recipes/{r['id']}/save", headers=riya).status_code == 400
    assert client.post(f"/addons/b4/recipes/{r['id']}/save", headers=u1).json()["saved"]
    assert client.get("/addons/b4/recipes?tab=saved", headers=u1).json()[0]["id"] == r["id"]
    assert client.post(f"/addons/b4/recipes/{r['id']}/cooked", headers=u1).json()["cooked"] == 1
    assert client.post(f"/addons/b4/recipes/{r['id']}/cooked", headers=u1).status_code == 429
    assert client.delete(f"/addons/b4/recipes/{r['id']}", headers=u1).status_code == 404
    off(client, admin, "recipeBox")
    assert client.get("/addons/b4/recipes", headers=riya).status_code == 403

def test_book_nook(client, riya, admin):
    fr = a_friend(); assert fr
    b = client.post("/addons/b4/books", headers=riya, json={"title": "Piranesi", "author": "S. Clarke", "status": "reading"}).json()
    assert client.post("/addons/b4/books", headers=riya, json={"title": "X", "status": "want", "rating": 4}).status_code == 400
    assert client.post("/addons/b4/books", headers=riya, json={"title": "X", "status": "done", "rating": 9}).status_code == 422
    b = client.patch(f"/addons/b4/books/{b['id']}", headers=riya, json={"status": "done", "rating": 5, "review": "Dreamlike"}).json()
    assert b["rating"] == 5 and client.get("/addons/b4/books", headers=riya).json()["counts"]["done"] == 1
    fh = u(client, fr) if fr.startswith("u") else None
    if fh:
        assert any(x["id"] == b["id"] for x in client.get("/addons/b4/books/feed", headers=fh).json())
        assert client.patch(f"/addons/b4/books/{b['id']}", headers=fh, json={"status": "want"}).status_code == 404
    off(client, admin, "bookNook")
    assert client.get("/addons/b4/books", headers=riya).status_code == 403

def test_meetup_board(client, riya, admin):
    u1, u3, u4 = u(client, "u1"), u(client, "u3"), u(client, "u4")
    soon = int(time.time() * 1000) + 86_400_000
    assert client.post("/addons/b4/meetups", headers=riya, json={"title": "Sketch walk", "place": "Carter Road", "startsAt": 1, "capacity": 5}).status_code == 400
    assert client.post("/addons/b4/meetups", headers=riya, json={"title": "Sketch walk", "place": "Carter Road", "startsAt": soon, "capacity": 1}).status_code == 422
    m = client.post("/addons/b4/meetups", headers=riya, json={"title": "Sketch walk", "place": "Carter Road", "startsAt": soon, "capacity": 2}).json()
    assert client.post(f"/addons/b4/meetups/{m['id']}/rsvp", headers=u1).json()["my"] == "going"
    client.post(f"/addons/b4/meetups/{m['id']}/rsvp", headers=u3)
    w = client.post(f"/addons/b4/meetups/{m['id']}/rsvp", headers=u4).json(); assert w["my"] == "waitlist" and w["myWaitPos"] == 1
    assert client.delete(f"/addons/b4/meetups/{m['id']}/rsvp", headers=u1).status_code == 200
    assert client.get(f"/addons/b4/meetups/{m['id']}", headers=u4).json()["my"] == "going"  # promoted
    assert client.post(f"/addons/b4/meetups/{m['id']}/cancel", headers=u3).status_code == 403
    assert client.post(f"/addons/b4/meetups/{m['id']}/cancel", headers=riya).json()["status"] == "cancelled"
    assert client.post(f"/addons/b4/meetups/{m['id']}/rsvp", headers=u1).status_code == 409
    off(client, admin, "meetupBoard")
    assert client.get("/addons/b4/meetups", headers=riya).status_code == 403
    ov = client.get("/admin/addons/b4", headers=admin).json()
    assert ov["module"] == "glow" and len(ov["items"]) == 6 and not next(i for i in ov["items"] if i["flag"] == "addons.glow.meetupBoard")["on"]
