"""Hush photos & videos: chat media messages and photo/video Moods (flags chatMedia / moodMedia)."""
from tests.conftest import login
from tests.test_v4 import upload
from tests.test_v5 import set_features
from tests.test_v6 import upload_png

MP4 = b"\x00\x00\x00\x18ftypisom" + b"\x00" * 100

def test_chat_photo_and_video_messages(client, riya, admin):
    a1 = login(client, "u1@demo.vibeloop.app")
    img = upload_png(client, riya)
    m = client.post("/conv/cv_u1/messages", headers=riya, json={"id": "cm-img-1", "attachment": {"url": img}}).json()
    assert m["kind"] == "file" and m["attachment"]["kind"] == "image" and "sig=" in m["attachment"]["url"]
    assert client.post("/conv/cv_u1/messages", headers=riya, json={"id": "cm-img-1", "attachment": {"url": img}}).json()["id"] == "cm-img-1"  # outbox retry
    seen = client.get("/conv/cv_u1/messages", headers=a1).json()
    got = next(x for x in seen if x["id"] == "cm-img-1")
    assert client.get(got["attachment"]["url"]).status_code == 200  # signed link works without auth
    assert client.get(img).status_code == 404  # private to the conversation
    assert client.get(img, headers=a1).status_code == 200
    v = upload(client, riya, "clip.mp4", MP4, durationSec=20)
    m = client.post("/conv/cv_u1/messages", headers=riya, json={"attachment": {"url": v["url"]}, "text": "look"}).json()
    assert m["attachment"]["kind"] == "video" and m["attachment"]["durationSec"] == 20 and m["text"] == "look"
    long = upload(client, riya, "long.mp4", MP4, durationSec=75)
    assert client.post("/conv/cv_u1/messages", headers=riya, json={"attachment": {"url": long["url"]}}).status_code == 400
    other = upload_png(client, a1)
    assert client.post("/conv/cv_u1/messages", headers=riya, json={"attachment": {"url": other}}).status_code == 400  # not my upload
    set_features(client, admin, chatMedia=False)
    assert client.post("/conv/cv_u1/messages", headers=riya, json={"attachment": {"url": upload_png(client, riya)}}).status_code == 403

def test_photo_and_video_moods(client, riya, admin):
    img = upload_png(client, riya)
    s = client.post("/status", headers=riya, json={"kind": "photo", "text": "sunset", "attachment": {"url": img}})
    assert s.status_code == 200, s.text; s = s.json()
    assert s["media"]["kind"] == "image" and s["media"]["url"].startswith(img + "?exp=") and s["text"] == "sunset"
    v = upload(client, riya, "m.mp4", MP4, durationSec=10)
    sv = client.post("/status", headers=riya, json={"kind": "video", "attachment": {"url": v["url"]}}).json()
    assert sv["media"]["kind"] == "video"
    mine = {x["id"]: x for x in client.get("/status", headers=riya).json()}
    assert mine[s["id"]]["media"]["url"].startswith(img + "?") and mine[sv["id"]]["kind"] == "video"
    assert client.get(img).status_code == 404 and client.get(img, headers=riya).status_code == 200  # private: owner or signed link only
    assert client.get(mine[s["id"]]["media"]["url"]).status_code == 200
    assert client.post("/status", headers=riya, json={"kind": "video", "attachment": {"url": img}}).status_code == 400  # kind mismatch
    assert client.post("/status", headers=riya, json={"kind": "photo"}).status_code == 400
    assert client.post("/status", headers=riya, json={"kind": "text", "text": "x", "attachment": {"url": img}}).status_code == 400
    a1 = login(client, "u1@demo.vibeloop.app")
    assert client.post("/status", headers=a1, json={"kind": "photo", "attachment": {"url": img}}).status_code == 400  # not my upload
    long = upload(client, riya, "l.mp4", MP4, durationSec=90)
    assert client.post("/status", headers=riya, json={"kind": "video", "attachment": {"url": long["url"]}}).status_code == 400
    set_features(client, admin, moodMedia=False)
    assert client.post("/status", headers=riya, json={"kind": "photo", "attachment": {"url": upload_png(client, riya)}}).status_code == 403
