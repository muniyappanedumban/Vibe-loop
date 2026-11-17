"""Glow backend wiring: profile Drops grid, creator profile, server search, resumable video upload → post/Blink."""
import os
from tests.test_v5 import set_features

MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 4 + os.urandom(256)

def test_my_posts_grid(client, riya):
    r = client.post("/posts", headers=riya, json={"kind": "thought", "text": "grid check"}); assert r.status_code == 200
    g = client.get("/users/me/posts", headers=riya).json()
    assert g["user"]["followState"] == "self" and g["items"][0]["text"] == "grid check" and g["items"][0]["mine"] is True
    assert g["user"]["posts"] >= 1

def test_creator_posts_and_404(client, riya):
    other = client.get("/bootstrap", headers=riya).json()["social"]["creators"][0]["id"]
    g = client.get(f"/users/{other}/posts", headers=riya)
    assert g.status_code == 200 and g.json()["user"]["id"] == other and g.json()["user"]["followState"] in ("none", "following")
    assert all(p["mine"] is False for p in g.json()["items"])
    assert client.get("/users/nope_x/posts", headers=riya).status_code == 404
    assert client.get("/users/me/posts").status_code == 401

def test_search(client, riya):
    client.post("/posts", headers=riya, json={"kind": "thought", "text": "zebracrossing chai"})
    r = client.get("/search?q=zebracrossing", headers=riya).json()
    assert any("zebracrossing" in p["text"] for p in r["posts"])
    who = client.get("/bootstrap", headers=riya).json()["social"]["creators"][0]
    r = client.get(f"/search?q={who['handle'].lstrip('@')[:5]}", headers=riya).json()
    assert any(p["id"] == who["id"] for p in r["people"])
    assert client.get("/search?q=", headers=riya).status_code == 422

def _upload(client, h, data, name, mime):
    s = client.post("/uploads", headers=h, json={"filename": name, "size": len(data), "mime": mime}); assert s.status_code == 200, s.text
    sid = s.json()["uploadId"]
    r = client.put(f"/uploads/{sid}/chunk?offset=0", headers={**h, "content-type": "application/octet-stream"}, content=data); assert r.status_code == 200, r.text
    d = client.post(f"/uploads/{sid}/complete", headers=h); assert d.status_code == 200, d.text; return d.json()

def test_resumable_video_drop_and_blink(client, riya):
    up = _upload(client, riya, MP4, "clip.mp4", "video/mp4"); assert up["kind"] == "video"
    p = client.post("/posts", headers=riya, json={"kind": "photo", "text": "video drop", "mediaUrl": up["url"], "edit": {"trimStart": 0, "trimEnd": 3, "speed": 1, "captions": []}})
    assert p.status_code == 200, p.text
    assert p.json()["mediaKind"] == "video"
    assert client.get(up["url"]).status_code == 200  # public once posted
    up2 = _upload(client, riya, MP4, "blink.mp4", "video/mp4")
    s = client.post("/sparks", headers=riya, json={"text": "video blink", "mediaUrl": up2["url"], "hours": 24}); assert s.status_code == 200, s.text
    assert s.json()["mediaUrl"].endswith(".mp4")

def test_follow_request_state_in_profile(client, riya, admin):
    other = client.get("/bootstrap", headers=riya).json()["social"]["creators"][0]["id"]
    set_features(client, admin, followRequests=True)
    from app.db import SessionLocal
    from app import models as M
    db = SessionLocal(); t = db.get(M.User, other); t.profile = {**(t.profile or {}), "social_private": True}; db.commit(); db.close()
    if client.get(f"/users/{other}/posts", headers=riya).json()["user"]["followState"] == "following":
        client.post(f"/edges/follow/{other}", headers=riya)  # unfollow first
    r = client.post(f"/edges/follow/{other}", headers=riya).json(); assert r["state"] == "requested"
    assert client.get(f"/users/{other}/posts", headers=riya).json()["user"]["followState"] == "requested"
