from app.db import SessionLocal
from app import models as M
from tests.conftest import login
from tests.test_v3 import money_on

def u(c, id): return login(c, f"{id}@demo.vibeloop.app")
def fan(c, i): return login(c, f"fan{i}@demo.vibeloop.app")

def set_features(c, admin, **flags):
    base = c.get("/admin/config/layers", headers=admin).json().get("base") or {}
    base["features"] = {**(base.get("features") or {}), **flags}
    r = c.put("/admin/config/base", json=base, headers=admin); assert r.status_code == 200, r.text

# ---------- CMS pages ----------
SEEDED = {"help-hub", "hit-us-up", "house-rules", "privacy-promise", "data-receipt", "our-story", "sos-lane", "glow-guide", "hush-guide", "get-the-apps"}

def test_seeded_pages_by_module(client):
    glow = {p["slug"]: p for p in client.get("/pages?module=glow").json()}
    assert SEEDED - {"hush-guide"} <= set(glow) and "hush-guide" not in glow and "hush-notes-friend-flame" not in glow
    hush = {p["slug"] for p in client.get("/pages?module=hush").json()}
    assert "hush-guide" in hush and "glow-guide" not in hush and "hush-notes-friend-flame" in hush
    assert len(client.get("/pages?module=glow&kind=blog").json()) == 2 and len(client.get("/pages?module=hush&kind=blog").json()) == 1
    assert len(client.get("/pages?kind=news").json()) == 2
    assert glow["help-hub"]["kind"] == "faq" and len(glow["help-hub"]["items"]) >= 8
    assert glow["house-rules"]["body"].startswith("**Draft — review with your lawyer before launch.**")
    assert "replace" in glow["hit-us-up"]["items"][0]["value"]
    sos = client.get("/pages/sos-lane").json()
    assert {"112", "1930", "181"} <= {i["value"] for i in sos["items"]}
    assert "end-to-end" not in client.get("/pages/privacy-promise").json()["body"].lower().replace("end-to-end encryption for hush chats is planned", "")

def test_page_crud_versions_restore_publish(client, admin, riya):
    assert client.get("/admin/pages", headers=riya).status_code == 403
    r = client.post("/admin/pages", headers=admin, json={"slug": "test-page", "module": "glow", "kind": "faq", "title": "T1", "items": [{"q": "a?", "a": "b"}]})
    assert r.status_code == 200 and r.json()["version"] == 1 and r.json()["itemsKind"] == "faq" and not r.json()["published"]
    assert client.post("/admin/pages", headers=admin, json={"slug": "test-page", "title": "dup"}).status_code == 409
    assert client.get("/pages/test-page").status_code == 404  # unpublished
    assert client.post("/admin/pages/test-page/publish", headers=admin, json={"published": True}).json()["version"] == 2
    assert client.get("/pages/test-page").json()["title"] == "T1"
    p = client.patch("/admin/pages/test-page", headers=admin, json={"title": "T2", "body": "# Hi", "note": "copy edit"}).json()
    assert p["version"] == 3 and p["title"] == "T2" and p["published"]
    assert client.patch("/admin/pages/test-page", headers=admin, json={"items": [{"q": ""}]}).status_code == 400
    vs = client.get("/pages/test-page/versions", headers=admin).json()
    assert [v["version"] for v in vs] == [3, 2, 1] and vs[0]["note"] == "copy edit" and vs[2]["snapshot"]["title"] == "T1"
    assert client.get("/pages/test-page/versions", headers=riya).status_code == 403
    r = client.post("/admin/pages/test-page/restore", headers=admin, json={"version": 1}).json()
    assert r["version"] == 4 and r["title"] == "T1" and r["published"]  # restore keeps publish state
    assert client.delete("/admin/pages/test-page", headers=admin).status_code == 200
    assert client.get("/admin/pages/test-page", headers=admin).status_code == 404

def test_page_features_off(client, admin):
    set_features(client, admin, blog=False, news=False, appLinks=False)
    assert client.get("/pages?kind=blog&module=glow").json() == [] and client.get("/pages?kind=news").json() == []
    slugs = {p["slug"] for p in client.get("/pages?module=glow").json()}
    assert "loopdown-loops-101" not in slugs and "get-the-apps" not in slugs and "help-hub" in slugs
    assert client.get("/pages/get-the-apps").status_code == 403 and client.get("/pages/loopdown-loops-101").status_code == 403

# ---------- Vouches ----------
def test_vouch_requires_interaction(client, riya, admin):
    r = client.get("/users/u1/vouches", headers=riya).json(); assert r["count"] == 2 and r["avg"] == 4.5
    assert client.post("/vouches", headers=riya, json={"userId": "u2", "rating": 5}).status_code == 403  # not friends/collab/buyer
    assert client.post("/vouches", headers=riya, json={"userId": "usr_riya", "rating": 5}).status_code == 400
    r = client.post("/vouches", headers=riya, json={"userId": "u3", "rating": 4, "text": "Great collab", "context": "collab"})  # friends
    assert r.status_code == 200 and r.json()["rating"] == 4
    r2 = client.post("/vouches", headers=riya, json={"userId": "u3", "rating": 5, "text": "Even better"})  # one per pair → update
    assert r2.json()["id"] == r.json()["id"] and client.get("/users/u3/vouches", headers=riya).json()["count"] == 1
    assert client.post("/vouches", headers=riya, json={"userId": "u3", "rating": 6}).status_code == 422
    assert client.post("/vouches", headers=riya, json={"userId": "u3", "rating": 3, "text": "x" * 501}).status_code == 422
    # buyer of u1's product (m3, seeded paid order) may vouch even without friendship
    assert client.post("/vouches", headers=fan(client, 3), json={"userId": "u1", "rating": 5}).status_code == 200
    set_features(client, admin, vouches=False)
    assert client.get("/users/u1/vouches", headers=riya).status_code == 403 and client.post("/vouches", headers=riya, json={"userId": "u3", "rating": 5}).status_code == 403

def test_vouch_via_collab_post(client, riya):
    assert client.post("/vouches", headers=riya, json={"userId": "u2", "rating": 5}).status_code == 403
    r = client.post("/posts", headers=riya, json={"kind": "thought", "text": "Collab with Kabir", "collab": "@kabir.frames"}); assert r.status_code == 200, r.text
    assert client.post("/vouches", headers=riya, json={"userId": "u2", "rating": 5, "context": "collab"}).status_code == 200

# ---------- Real Talk ----------
def test_real_talk_verified_buyers_and_claimers(client, riya, admin):
    assert client.get("/store/products/prod_u1_presets/reviews", headers=riya).status_code == 403  # store off → productReviews off
    money_on(client, admin)
    r = client.get("/store/products/prod_u1_presets/reviews", headers=riya).json()
    assert r["count"] == 1 and r["avg"] == 5 and r["items"][0]["verifiedPurchase"] is True
    assert client.post("/store/products/prod_u1_presets/reviews", headers=riya, json={"rating": 5, "text": "nice"}).status_code == 403  # no order
    assert client.post("/store/products/prod_u1_presets/reviews", headers=u(client, "u1"), json={"rating": 5}).status_code == 400  # own product
    # created-but-unpaid order doesn't count
    db = SessionLocal(); db.add(M.Order(user_id="usr_riya", kind="product", ref_id="prod_u1_presets", creator_id="u1", amount=14900, provider="razorpay", status="created")); db.commit(); db.close()
    assert client.post("/store/products/prod_u1_presets/reviews", headers=riya, json={"rating": 4}).status_code == 403
    # free claimer
    assert client.post("/store/products/prd_guide/reviews", headers=riya, json={"rating": 4}).status_code == 403
    assert client.post("/store/orders", headers=riya, json={"productId": "prd_guide"}).json()["status"] == "free"
    r = client.post("/store/products/prd_guide/reviews", headers=riya, json={"rating": 4, "text": "Handy"})
    assert r.status_code == 200 and r.json()["verifiedPurchase"] is False
    set_features(client, admin, productReviews=False)
    assert client.get("/store/products/prd_guide/reviews", headers=riya).status_code == 403

def test_admin_review_moderation(client, admin, riya):
    assert client.get("/admin/reviews", headers=riya).status_code == 403
    allr = client.get("/admin/reviews", headers=admin).json(); assert len(allr) == 3
    vs = client.get("/admin/reviews?type=vouch", headers=admin).json(); assert len(vs) == 2 and all(v["targetLabel"] == "@aanya.eats" for v in vs)
    rid = vs[0]["id"]
    assert client.patch(f"/admin/reviews/{rid}", headers=admin, json={"status": "hidden"}).json()["status"] == "hidden"
    assert client.get("/users/u1/vouches", headers=riya).json()["count"] == 1
    assert len(client.get("/admin/reviews?status=hidden", headers=admin).json()) == 1
    assert client.delete(f"/admin/reviews/{rid}", headers=admin).status_code == 200
    assert client.delete(f"/admin/reviews/{rid}", headers=admin).status_code == 404
    db = SessionLocal(); n = db.query(M.Audit).filter(M.Audit.action.in_(["review.moderate", "review.delete"])).count(); db.close(); assert n == 2

# ---------- Speak Up ----------
def test_speakup_priority_and_sos(client, riya):
    r = client.post("/speakup", headers=riya, json={"category": "complaint", "targetType": "none", "details": "App crashed on upload"}).json()
    assert r["status"] == "open" and r["ticket"].startswith("SU-") and len(r["ticket"]) == 8 and r["priority"] == "normal" and "sos" not in r
    r = client.post("/speakup", headers=riya, json={"category": "self_harm", "targetType": "none", "details": "A friend posted something worrying"}).json()
    assert r["priority"] == "urgent" and "112" in [x["value"] for x in r["sos"]["lines"]]
    r = client.post("/speakup", headers=riya, json={"category": "other", "targetType": "user", "targetId": "x1", "details": "scary", "urgent": True}).json()
    assert r["priority"] == "urgent" and r["sos"]["page"] == "sos-lane"
    assert client.post("/speakup", headers=riya, json={"category": "scam", "targetType": "post", "details": "x"}).status_code == 400  # needs targetId
    assert client.post("/speakup", headers=riya, json={"category": "nope", "details": "x"}).status_code == 422
    assert client.post("/speakup", headers=riya, json={"category": "other", "details": "x" * 2001}).status_code == 422
    assert client.post("/speakup", headers=riya, json={"category": "other", "details": "x", "evidence": ["javascript:alert(1)"]}).status_code == 400
    mine = client.get("/speakup/mine", headers=riya).json(); assert len(mine) == 3 and mine[0]["updates"]

def test_speakup_admin_actions(client, admin, riya):
    q = client.get("/admin/speakup", headers=admin).json()
    assert q["items"][0]["priority"] == "urgent" and q["urgentOpen"] == 1 and q["counts"]["reviewing"] == 1
    assert len(client.get("/admin/speakup?category=scam", headers=admin).json()["items"]) == 1
    assert client.get("/admin/speakup", headers=riya).status_code == 403
    t = client.post("/speakup", headers=riya, json={"category": "violation", "targetType": "post", "targetId": "p5", "details": "Spammy"}).json()
    r = client.patch(f"/admin/speakup/{t['id']}", headers=admin, json={"status": "reviewing", "note": "looking"}).json()
    assert r["status"] == "reviewing" and r["history"][-1]["note"] == "looking"
    r = client.patch(f"/admin/speakup/{t['id']}", headers=admin, json={"action": "remove_content", "note": "hidden"}).json()
    assert r["status"] == "actioned" and r["target"]["hidden"] is True
    assert client.patch(f"/admin/speakup/{t['id']}", headers=admin, json={}).status_code == 400
    # warn + suspend on the urgent ticket (target user x1)
    assert client.patch("/admin/speakup/su_demo_urgent", headers=admin, json={"action": "warn"}).status_code == 200
    r = client.patch("/admin/speakup/su_demo_urgent", headers=admin, json={"action": "suspend_user", "status": "closed", "message": "We suspended that account."}).json()
    assert r["status"] == "closed" and r["target"]["suspended"] is True
    db = SessionLocal()
    got = (db.query(M.Notice).filter(M.Notice.user_id == "x1", M.Notice.title.like("%heads-up%")).count(),
           db.query(M.Notice).filter(M.Notice.user_id == "m4", M.Notice.body == "We suspended that account.").count(),
           db.query(M.Notice).filter(M.Notice.user_id == "usr_riya", M.Notice.title.like("Speak Up SU-%")).count(),
           db.query(M.Audit).filter(M.Audit.action == "speakup.update").count())
    db.close(); assert got == (1, 1, 2, 4)
    assert client.patch("/admin/speakup/su_demo_scam", headers=admin, json={"action": "warn"}).status_code == 200  # post target → warns author
    none_t = client.post("/speakup", headers=riya, json={"category": "complaint", "details": "hi"}).json()
    assert client.patch(f"/admin/speakup/{none_t['id']}", headers=admin, json={"action": "warn"}).status_code == 400

def test_speakup_feature_off(client, admin, riya):
    set_features(client, admin, speakUp=False)
    assert client.post("/speakup", headers=riya, json={"category": "complaint", "details": "x"}).status_code == 403
    assert client.get("/speakup/mine", headers=riya).status_code == 403

# ---------- module names ----------
def test_module_names_layers(client, admin):
    cfg = client.get("/app-config?country=IN&lang=en").json()
    assert cfg["moduleNames"] == {"social": "Glow", "chat": "Hush"} and cfg["languages"]["strings"]["module.chat"] == "Hush"
    for bad in ({"social": ""}, {"social": "x" * 17}, {"chat": " Hush"}, {"chat": "🔥🔥"}, {"other": "Nope"}):
        assert client.put("/admin/config/country:US", json={"moduleNames": bad}, headers=admin).status_code == 400
    assert client.put("/admin/config/country:US", json={"moduleNames": {"chat": "Whisper"}}, headers=admin).status_code == 200
    us = client.get("/app-config?country=US&lang=en").json()
    assert us["moduleNames"] == {"social": "Glow", "chat": "Whisper"} and us["languages"]["strings"]["module.chat"] == "Whisper"
    assert us["languages"]["strings"]["module.social"] == "Glow"
    # a lang layer override wins over moduleNames; lang layers may not set moduleNames
    assert client.put("/admin/config/lang:ta", json={"moduleNames": {"chat": "X"}}, headers=admin).status_code == 400
    assert client.put("/admin/config/lang:ta", json={"languages": {"strings": {"module.chat": "Ragasiyam"}}}, headers=admin).status_code == 200
    assert client.get("/app-config?country=US&lang=ta").json()["languages"]["strings"]["module.chat"] == "Ragasiyam"
    client.delete("/admin/config/lang:ta", headers=admin); client.delete("/admin/config/country:US", headers=admin)
