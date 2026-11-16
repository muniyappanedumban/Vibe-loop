import hashlib, io
from app.db import SessionLocal
from app import models as M
from tests.conftest import login

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
def u(c, id): return login(c, f"{id}@demo.vibeloop.app")

def upload(c, h, name, data, **kw):
    r = c.post("/uploads", headers=h, json={"filename": name, "size": len(data), "mime": "", **kw}); assert r.status_code == 200, r.text
    sid = r.json()["uploadId"]
    r = c.put(f"/uploads/{sid}/chunk?offset=0", headers={**h, "Content-Type": "application/octet-stream"}, content=data)
    assert r.status_code == 200, r.text
    r = c.post(f"/uploads/{sid}/complete", headers=h); assert r.status_code == 200, r.text; return r.json()

def set_user(uid, **kv):
    db = SessionLocal(); x = db.get(M.User, uid)
    for k, v in kv.items(): setattr(x, k, v)
    db.commit(); db.close()

# ---------- uploads ----------
def test_chunked_upload_resume_and_sha(client, riya):
    data = b"%PDF-1.7\n" + bytes(range(256)) * 50000  # ~12.8 MB → 3 chunks
    sha = hashlib.sha256(data).hexdigest()
    r = client.post("/uploads", headers=riya, json={"filename": "deck.pdf", "size": len(data), "mime": "application/pdf", "sha256": sha}).json()
    sid, cs = r["uploadId"], r["chunkSize"]; assert cs == 5 * 1024 * 1024 and r["received"] == 0
    oh = {**riya, "Content-Type": "application/octet-stream"}
    assert client.put(f"/uploads/{sid}/chunk?offset=0", headers=oh, content=data[:cs]).json()["received"] == cs
    bad = client.put(f"/uploads/{sid}/chunk?offset={2 * cs}", headers=oh, content=data[2 * cs:])  # out of order
    assert bad.status_code == 409 and bad.json()["received"] == cs
    assert client.post(f"/uploads/{sid}/complete", headers=riya).status_code == 409  # incomplete
    st = client.get(f"/uploads/{sid}", headers=riya).json(); assert st == {"received": cs, "size": len(data), "done": False}
    off = st["received"]
    while off < len(data):  # resume
        off = client.put(f"/uploads/{sid}/chunk?offset={off}", headers=oh, content=data[off:off + cs]).json()["received"]
    m = client.post(f"/uploads/{sid}/complete", headers=riya).json()
    assert m["kind"] == "file" and m["mime"] == "application/pdf" and m["size"] == len(data) and m["name"] == "deck.pdf" and m["url"].endswith(".pdf")
    got = client.get(m["url"]); assert got.status_code == 200 and hashlib.sha256(got.content).hexdigest() == sha and "attachment" in got.headers["content-disposition"]
    assert client.get(f"/uploads/{sid}", headers=u(client, "u1")).status_code == 404  # someone else's session

def test_sha_mismatch_and_limits(client, riya):
    data = b"hello world\n"
    r = client.post("/uploads", headers=riya, json={"filename": "a.txt", "size": len(data), "sha256": "0" * 64}).json()
    client.put(f"/uploads/{r['uploadId']}/chunk?offset=0", headers=riya, content=data)
    assert client.post(f"/uploads/{r['uploadId']}/complete", headers=riya).status_code == 400
    assert client.post("/uploads", headers=riya, json={"filename": "big.mp4", "size": 1024 ** 3 + 1}).status_code == 413
    assert client.post("/uploads", headers=riya, json={"filename": "big.mp4", "size": 1024 ** 3}).status_code == 200  # exactly 1 GB ok
    assert client.post("/uploads", headers=riya, json={"filename": "setup.exe", "size": 100}).status_code == 415
    assert client.post("/uploads", headers=riya, json={"filename": "run.sh", "size": 100}).status_code == 415

def test_blocked_exe_by_magic(client, riya):
    for name, data in [("notes.txt", b"MZ\x90\x00" + b"\x00" * 100), ("photo.jpg", b"\x7fELF" + b"\x00" * 60), ("readme.txt", b"#!/bin/sh\nrm -rf /\n"), ("pic.png", b"\xff\xd8\xff" + b"0" * 40)]:
        r = client.post("/uploads", headers=riya, json={"filename": name, "size": len(data)}).json()
        x = client.put(f"/uploads/{r['uploadId']}/chunk?offset=0", headers=riya, content=data)
        assert x.status_code == 415, name
        assert client.get(f"/uploads/{r['uploadId']}", headers=riya).status_code == 404  # session dropped

def test_video_60s_rule(client, riya):
    mp4 = b"\x00\x00\x00\x18ftypisom" + b"\x00" * 100  # not decodable by ffprobe → falls back to client durationSec
    long = upload(client, riya, "long.mp4", mp4, durationSec=75)
    assert long["kind"] == "video"
    r = client.post("/posts", headers=riya, json={"kind": "motion", "text": "too long", "mediaUrl": long["url"]}); assert r.status_code == 400 and "60" in r.json()["detail"]
    assert client.post("/sparks", headers=riya, json={"text": "blink", "mediaUrl": long["url"]}).status_code == 400
    ok = upload(client, riya, "short.mp4", mp4, durationSec=30)
    assert client.post("/posts", headers=riya, json={"kind": "motion", "text": "short", "mediaUrl": ok["url"]}).status_code == 200

# ---------- chat files + idempotency ----------
def test_chat_file_message_and_idempotent(client, riya):
    f = upload(client, riya, "plan.docx", b"PK\x03\x04" + b"\x00" * 200)
    body = {"id": "cli-msg-001", "kind": "file", "text": "", "attachment": {"url": f["url"]}}
    a = client.post("/conv/cv_u1/messages", headers=riya, json=body); assert a.status_code == 200, a.text
    b = client.post("/conv/cv_u1/messages", headers=riya, json=body); assert b.status_code == 200
    assert a.json()["id"] == b.json()["id"] == "cli-msg-001" and a.json()["attachment"]["name"] == "plan.docx" and a.json()["attachment"]["kind"] == "file"
    msgs = client.get("/conv/cv_u1/messages", headers=u(client, "u1")).json()
    assert sum(1 for m in msgs if m["id"] == "cli-msg-001") == 1
    u1 = u(client, "u1")
    assert client.post("/conv/cv_u1/messages", headers=u1, json={"kind": "file", "attachment": {"url": f["url"]}}).status_code == 400  # not their upload

def test_idempotent_creates(client, riya):
    for path, body in [("/posts", {"id": "cli-post-1", "kind": "thought", "text": "offline post"}), ("/sparks", {"id": "cli-spark-1", "text": "offline blink"}),
                       ("/status", {"id": "cli-st-1", "kind": "text", "text": "offline mood"}), ("/posts/p1/comments", {"id": "cli-cm-1", "text": "offline comment"})]:
        a = client.post(path, headers=riya, json=body); b = client.post(path, headers=riya, json=body)
        assert a.status_code == b.status_code == 200, (path, a.text, b.text)
    db = SessionLocal()
    assert db.query(M.Comment).filter_by(id="cli-cm-1").count() == 1 and db.query(M.Post).filter_by(id="cli-post-1").count() == 1
    db.close()
    assert client.post("/posts", headers=u(client, "u1"), json={"id": "cli-post-1", "kind": "thought", "text": "x"}).status_code == 409  # someone else's id

# ---------- comments / shares / feed ----------
def test_comments_paging_delete_like(client, riya):
    u1 = u(client, "u1")
    for i in range(25): client.post("/posts/p1/comments", headers=riya, json={"text": f"c{i}"})
    p1 = client.get("/posts/p1/comments", headers=riya).json()
    assert len(p1["items"]) == 20 and p1["nextCursor"] == 20 and p1["total"] == 27
    p2 = client.get(f"/posts/p1/comments?cursor={p1['nextCursor']}", headers=riya).json(); assert len(p2["items"]) == 7 and p2["nextCursor"] is None
    mine = next(c for c in p2["items"] if c["mine"])
    rep = client.post("/posts/p1/comments", headers=u1, json={"text": "reply", "replyTo": mine["id"]}).json()
    assert client.post(f"/comments/{mine['id']}/like", headers=u1).json()["likes"] == 1
    other = next(c for c in p1["items"] if c["by"] == "u3")
    assert client.delete(f"/comments/{other['id']}", headers=riya).status_code == 403  # not author / not post owner
    assert client.delete(f"/comments/{other['id']}", headers=u1).status_code == 200    # u1 owns p1
    assert client.delete(f"/comments/{mine['id']}", headers=riya).status_code == 200
    assert rep["comment"]["id"]

def test_share_and_feed(client, riya):
    s0 = client.get("/feed?mode=fresh", headers=riya).json()["items"]
    sh = {p["id"]: p["shares"] for p in s0}
    assert client.post("/posts/p2/share", headers=riya, json={"to": "chat"}).json()["shares"] == sh["p2"] + 1
    assert client.post("/posts/p2/share", headers=riya).status_code == 200  # body optional (old contract)
    assert client.post("/posts/p2/share", headers=riya, json={"to": "fax"}).status_code == 400
    for i in range(25): client.post("/posts", headers=riya, json={"kind": "thought", "text": f"feed {i}"})
    f1 = client.get("/feed?mode=fresh", headers=riya).json(); assert len(f1["items"]) == 20 and f1["nextCursor"]
    f2 = client.get(f"/feed?mode=fresh&cursor={f1['nextCursor']}", headers=riya).json()
    assert not {p["id"] for p in f1["items"]} & {p["id"] for p in f2["items"]}
    for m in ("foryou", "circle", "trending"): assert client.get(f"/feed?mode={m}", headers=riya).status_code == 200
    # circle audience = Inner Circle only
    client.post("/posts", headers=riya, json={"id": "circ-1", "kind": "thought", "text": "inner circle only", "audience": "circle"})
    ids = lambda h: {p["id"] for p in client.get("/feed?mode=fresh", headers=h).json()["items"]}
    assert "circ-1" in ids(u(client, "u1")) and "circ-1" not in ids(u(client, "u4"))  # u1 close, u4 not

# ---------- profiles / presence ----------
def test_profile_avatars_and_last_seen_reciprocity(client, riya):
    img = upload(client, riya, "me.png", PNG)
    r = client.patch("/me/profile", headers=riya, json={"avatar_social": img["url"], "pronouns": "she/her", "links": ["https://riya.example"], "state": "tn"}).json()
    assert r["avatar_social"] == img["url"] and r["avatar_chat"] is None and r["state"] == "TN" and r["links"] == ["https://riya.example"]
    assert client.patch("/me/profile", headers=riya, json={"links": ["a", "b", "c", "d"]}).status_code == 422
    assert client.patch("/me/profile", headers=riya, json={"links": ["javascript:alert(1)"]}).status_code == 400
    u1 = u(client, "u1")
    other = upload(client, u1, "u1.png", PNG)
    assert client.patch("/me/profile", headers=riya, json={"avatar_chat": other["url"]}).status_code == 400  # not own upload
    # chat routes fall back to avatar_social when avatar_chat is empty; presence recorded on any request
    fr = {f["id"]: f for f in client.get("/friends", headers=u1).json()["friends"]}
    assert fr["usr_riya"]["avatar"] == img["url"] and fr["usr_riya"]["lastSeen"]
    assert fr["usr_riya"]["flame"] == 12
    # riya hides her last seen → u1 can't see it; and riya can't see others' (reciprocal)
    client.patch("/me/profile", headers=riya, json={"last_seen_visible": False})
    assert {f["id"]: f for f in client.get("/friends", headers=u1).json()["friends"]}["usr_riya"]["lastSeen"] is None
    assert all(f["lastSeen"] is None for f in client.get("/friends", headers=riya).json()["friends"])
    client.patch("/me/profile", headers=riya, json={"last_seen_visible": True})
    assert {f["id"]: f for f in client.get("/friends", headers=riya).json()["friends"]}["u1"]["lastSeen"]

def test_presence_throttled(client, riya):
    set_user("usr_riya", last_seen_at=None)
    client.get("/me/profile", headers=riya)
    db = SessionLocal(); t1 = db.get(M.User, "usr_riya").last_seen_at; db.close()
    client.get("/me/profile", headers=riya)
    db = SessionLocal(); t2 = db.get(M.User, "usr_riya").last_seen_at; db.close()
    assert t1 and t1 == t2

def test_mood_drop_and_pings(client, riya):
    d = client.put("/me/mood", headers=riya, json={"moji": 42, "text": "Shipping"}).json(); assert d["moji"] == 42
    assert client.get("/me/profile", headers=riya).json()["moodDrop"]["text"] == "Shipping"
    fr = {f["id"]: f for f in client.get("/friends", headers=u(client, "u1")).json()["friends"]}
    assert fr["usr_riya"]["moodDrop"]["moji"] == 42
    assert {f["id"]: f for f in client.get("/friends", headers=riya).json()["friends"]}["u1"]["moodDrop"]["text"] == "Dosa hunt mode"  # seeded
    for k in ("thanks", "celebrate"): assert client.post("/pings", headers=riya, json={"to": "u1", "moji": 5, "kind": k}).status_code == 200

def test_friend_flame_counts_days(client, riya):
    import app.routes_micro as RM
    db = SessionLocal()
    for a, b in (("usr_riya", "u4"), ("u4", "usr_riya")):
        f = db.get(M.Friend, (a, b)); f.flame, f.flame_day, f.last_msg_day = 2, RM.today() - 1, RM.today() - 1
    db.commit(); db.close()
    c = client.post("/conv", headers=riya, json={"members": ["u4"]}).json()
    client.post(f"/conv/{c['id']}/messages", headers=riya, json={"text": "hi"})
    assert {f["id"]: f for f in client.get("/friends", headers=riya).json()["friends"]}["u4"]["flame"] == 2  # only one side so far
    client.post(f"/conv/{c['id']}/messages", headers=u(client, "u4"), json={"text": "hey"})
    assert {f["id"]: f for f in client.get("/friends", headers=riya).json()["friends"]}["u4"]["flame"] == 3

# ---------- micro ----------
def test_poll_vote_once(client, riya):
    p = client.post("/posts", headers=riya, json={"kind": "thought", "text": "pick", "poll": {"q": "Tea?", "options": ["Chai", "Coffee"]}}).json()
    assert p["poll"]["options"][0]["votes"] == 0
    v = client.post(f"/posts/{p['id']}/vote", headers=riya, json={"option": 1}).json(); assert v["poll"]["options"][1]["votes"] == 1 and v["poll"]["myVote"] == 1
    assert client.post(f"/posts/{p['id']}/vote", headers=riya, json={"option": 0}).status_code == 409
    assert client.post("/posts/p3/vote", headers=riya, json={"option": 0}).json()["poll"]["options"][0]["votes"] == 42  # seeded poll
    assert client.post("/posts", headers=riya, json={"kind": "thought", "text": "x", "poll": {"q": "?", "options": ["a"]}}).status_code == 422
    assert client.post("/posts/p1/vote", headers=riya, json={"option": 0}).status_code == 400

def test_pin_three_limit(client, riya):
    assert len(client.get("/users/me/pinned", headers=riya).json()) == 1  # seeded p9
    ids = [client.post("/posts", headers=riya, json={"kind": "thought", "text": f"pin {i}"}).json()["id"] for i in range(3)]
    assert client.post(f"/posts/{ids[0]}/pin", headers=riya).json()["pinned"]
    assert client.post(f"/posts/{ids[1]}/pin", headers=riya).status_code == 200
    assert client.post(f"/posts/{ids[2]}/pin", headers=riya).status_code == 409
    assert client.post(f"/posts/{ids[0]}/pin", headers=riya).json()["pinned"] is False  # unpin
    assert client.post(f"/posts/{ids[2]}/pin", headers=riya).status_code == 200
    assert client.post("/posts/p1/pin", headers=riya).status_code == 404  # not mine

def test_collections_and_likes(client, riya):
    c = client.post("/collections", headers=riya, json={"name": "Food"}).json()
    client.post(f"/collections/{c['id']}/items", headers=riya, json={"postId": "p1"})
    x = client.post(f"/collections/{c['id']}/items", headers=riya, json={"postId": "p1"}).json(); assert x["items"] == ["p1"]
    assert client.post(f"/collections/{c['id']}/items", headers=u(client, "u1"), json={"postId": "p2"}).status_code == 404
    assert [y["id"] for y in client.get("/collections", headers=riya).json()] == [c["id"]]
    client.post("/posts/p2/react", headers=riya, json={"key": "heart"}); client.post("/posts/p5/react", headers=riya, json={"key": "fire"})
    likes = client.get("/me/likes", headers=riya).json()["items"]
    assert [p["id"] for p in likes][:2] == ["p5", "p2"] and likes[0]["myReact"] == "fire"

def test_lens_allowlist(client, riya):
    assert client.post("/posts", headers=riya, json={"kind": "thought", "text": "x", "lens": "heartframe"}).status_code == 200
    assert client.post("/posts", headers=riya, json={"kind": "thought", "text": "x", "lens": "sepia"}).status_code == 400
    assert client.post("/sparks", headers=riya, json={"text": "x", "lens": "matcha"}).status_code == 200
    assert client.post("/sparks", headers=riya, json={"text": "x", "lens": "bogus"}).status_code == 400

# ---------- promos ----------
def test_promo_targeting_country_state(client, riya, admin):
    # riya: IN / TN (seeded)
    g = lambda pl, h=riya: [p["id"] for p in client.get(f"/promos?placement={pl}", headers=h).json()]
    assert g("home_banner") == ["promo_welcome"] and g("feed") == ["promo_in_week"] and g("chat_list") == ["promo_kovai"]
    assert client.get("/promos?placement=home_banner", headers=riya).json()[0]["label"] == "From VibeLoop"
    set_user("usr_riya", state="KA")
    assert g("chat_list") == [] and g("feed") == ["promo_in_week"]
    db = SessionLocal(); x = db.get(M.User, "usr_riya"); x.profile = {**x.profile, "country": "US"}; db.commit(); db.close()
    assert g("feed") == [] and g("home_banner") == ["promo_welcome"]
    assert [p["id"] for p in client.get("/promos?country=IN&placement=feed").json()] == ["promo_in_week"]  # anonymous via ?country=
    pv = client.get("/admin/promos/preview?country=IN&state=TN", headers=admin).json()
    assert {p["id"] for p in pv["items"]} == {"promo_welcome", "promo_in_week", "promo_kovai"} and "IN-SOUTH" in pv["zones"]
    assert [p["id"] for p in client.get("/admin/promos/preview?country=US", headers=admin).json()["items"]] == ["promo_welcome"]
    assert client.get("/admin/promos/preview", headers=riya).status_code == 403

def test_promo_time_window_priority_zone_and_switch(client, riya, admin):
    now = M.now_ms()
    mk = lambda **k: client.post("/admin/promos", headers=admin, json={"title": "T", "placement": ["explore"], "target": {"global": True}, **k})
    fut = mk(title="future", startAt=now + 3600_000).json(); past = mk(title="past", endAt=now - 1000).json()
    hi = mk(title="hi", priority=50).json(); lo = mk(title="lo", priority=1).json()
    z = mk(title="zone", target={"zones": ["IN-SOUTH"]}, priority=20).json()
    ids = [p["id"] for p in client.get("/promos?placement=explore", headers=riya).json()]
    assert ids == [hi["id"], z["id"], lo["id"]] and fut["id"] not in ids and past["id"] not in ids
    client.patch(f"/admin/promos/{fut['id']}", headers=admin, json={"startAt": now - 1000})
    assert fut["id"] in [p["id"] for p in client.get("/promos?placement=explore", headers=riya).json()]
    client.patch(f"/admin/promos/{hi['id']}", headers=admin, json={"active": False})
    assert hi["id"] not in [p["id"] for p in client.get("/promos?placement=explore", headers=riya).json()]
    assert mk(target={"global": False}).status_code == 400 and mk(placement=["moon"]).status_code == 422
    assert mk(startAt=now, endAt=now - 1).status_code == 422
    assert client.delete(f"/admin/promos/{lo['id']}", headers=admin).status_code == 200
    # config feature switch
    lay = client.get("/admin/config/layers", headers=admin).json()["layers"]["base"]
    client.put("/admin/config/base", headers=admin, json={**lay, "features": {**lay.get("features", {}), "promos": False}})
    assert client.get("/promos?placement=home_banner", headers=riya).json() == []
    assert client.get("/app-config", headers=riya).json()["features"]["promos"] is False

def test_admin_member_detail_and_search(client, admin, riya):
    client.get("/me", headers=riya)
    d = client.get("/admin/users/usr_riya", headers=admin).json()
    assert d["state"] == "TN" and d["country"] == "IN" and d["lastSeenAt"] and d["avatarSocial"] is None and d["counts"]["posts"] >= 1
    set_user("usr_riya", last_seen_visible=False)
    assert client.get("/admin/users/usr_riya", headers=admin).json()["lastSeenAt"]  # staff still see it
    s = client.get("/admin/search?q=Kovai", headers=admin).json(); assert [p["id"] for p in s["promos"]] == ["promo_kovai"]
    upload(client, riya, "brandkit.zip", b"PK\x03\x04" + b"\x00" * 50)
    assert client.get("/admin/search?q=brandkit", headers=admin).json()["uploads"][0]["name"] == "brandkit.zip"
    assert client.get("/admin/uploads", headers=admin).json()[0]["name"] == "brandkit.zip"

# ---------- engineering ----------
def test_request_id_gzip_etag(client):
    r = client.get("/health", headers={"X-Request-ID": "abc-123"}); assert r.headers["x-request-id"] == "abc-123"
    assert len(client.get("/health").headers["x-request-id"]) == 16
    r = client.get("/app-config?country=IN", headers={"Accept-Encoding": "gzip"})
    assert r.headers.get("content-encoding") == "gzip" and r.headers["etag"] and "no-cache" in r.headers["cache-control"]
    assert client.get("/app-config?country=IN", headers={"If-None-Match": r.headers["etag"]}).status_code == 304

def test_abandoned_upload_cleanup(client, riya):
    from app.routes_uploads import cleanup_abandoned, part_path
    sid = client.post("/uploads", headers=riya, json={"filename": "x.txt", "size": 10}).json()["uploadId"]
    db = SessionLocal(); db.get(M.UploadSession, sid).at = M.now_ms() - 25 * 3600_000; db.commit(); db.close()
    assert cleanup_abandoned() >= 1
    import os; assert not os.path.exists(part_path(sid))
    assert client.get(f"/uploads/{sid}", headers=riya).status_code == 404
