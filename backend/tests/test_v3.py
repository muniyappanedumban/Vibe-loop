import base64, hashlib, hmac, json
from app.db import SessionLocal
from app import models as M
from tests.conftest import login

def u(c, id): return login(c, f"{id}@demo.vibeloop.app")
def money_on(c, admin, **flags):
    body = {"money": True, "subscriptions": True, "store": True, "tips": True, "ads": True, "platformFees": True, **flags}
    r = c.put("/admin/money/settings", json=body, headers=admin); assert r.status_code == 200, r.text; return r.json()

def test_gating_403_when_off(client, riya):
    for m, path, body in [("get", "/money/plans", None), ("get", "/store", None), ("get", "/money/me", None), ("get", "/ads/slot?place=feed", None),
                          ("post", "/money/subscribe", {"planId": "plan_backstage"}), ("post", "/money/tips", {"to": "u1", "amount": 1000}), ("post", "/store/orders", {"productId": "prd_zine"})]:
        r = getattr(client, m)(path, headers=riya, **({"json": body} if body else {}))
        assert r.status_code == 403 and r.json()["detail"] == "Not enabled", (path, r.text)
    cfg = client.get("/app-config", headers=riya).json()
    assert not any(cfg["features"][k] for k in ["money", "subscriptions", "store", "tips", "ads", "platformFees"])

def test_settings_mirror_into_config_and_master_switch(client, riya, admin):
    v0 = client.get("/app-config").json()["version"]
    r = money_on(client, admin, money=False)
    cfg = client.get("/app-config", headers=riya).json()
    assert cfg["version"] == r["configVersion"] > v0 and cfg["features"]["store"] and not cfg["features"]["money"]
    assert client.get("/store", headers=riya).status_code == 403  # store on but master off
    money_on(client, admin)
    assert client.get("/store", headers=riya).status_code == 200

def test_plans_resolved_by_country(client, riya, admin):
    money_on(client, admin)
    p = {x["id"]: x for x in client.get("/money/plans", headers=riya).json()}
    assert p["plan_backstage"]["price"] == {"amount": 9900, "currency": "INR", "display": "₹99", "country": "IN"}
    client.patch("/me/profile", json={"country": "US"}, headers=riya)
    db = SessionLocal(); usr = db.get(M.User, "usr_riya"); usr.profile = {**usr.profile, "country": "US"}; db.commit(); db.close()
    p = {x["id"]: x for x in client.get("/money/plans", headers=riya).json()}
    assert p["plan_backstage"]["price"]["display"] == "$1.99" and p["plan_creator_pro"]["price"]["currency"] == "USD"
    db = SessionLocal(); usr = db.get(M.User, "usr_riya"); usr.profile = {**usr.profile, "country": "GB"}; db.commit(); db.close()
    assert {x["id"]: x for x in client.get("/money/plans", headers=riya).json()}["plan_backstage"]["price"]["currency"] == "INR"  # no GB price → INR

def test_subscribe_409_when_not_configured(client, riya, admin):
    money_on(client, admin)
    for prov in ("razorpay", "cashfree"):
        r = client.post("/money/subscribe", json={"planId": "plan_backstage", "provider": prov}, headers=riya)
        assert r.status_code == 409 and r.json()["detail"] == "Payments not configured by admin"
    assert client.post("/money/tips", json={"to": "u1", "amount": 5000}, headers=riya).status_code == 409
    assert client.post("/store/orders", json={"productId": "prd_zine"}, headers=riya).status_code == 409
    assert client.post("/store/orders", json={"productId": "prd_guide"}, headers=riya).json()["status"] == "free"
    db = SessionLocal(); assert db.query(M.Order).filter(M.Order.id != "ord_demo_m3_presets").count() == 0; db.close()  # v5 seed adds one labelled demo paid order

def _order(kind="product", provider="razorpay", amount=49900, ref="prd_zine", creator="u4"):
    db = SessionLocal(); o = M.Order(id=M.nid("ord"), user_id="usr_riya", kind=kind, ref_id=ref, creator_id=creator, amount=amount, provider=provider); db.add(o); db.commit(); db.close(); return o.id
def _status(oid):
    db = SessionLocal(); o = db.get(M.Order, oid); db.close(); return o.status, o.fee

def test_razorpay_webhook_signature(client, riya, admin):
    money_on(client, admin)
    client.put("/admin/integrations", json={"razorpay": {"keyId": "k_dummy_for_test", "keySecret": "s_dummy_for_test", "webhookSecret": "whsec_unit_test"}}, headers=admin)
    oid = _order()
    body = json.dumps({"event": "payment_link.paid", "payload": {"payment_link": {"entity": {"reference_id": oid}}}}).encode()
    bad = client.post("/webhooks/razorpay", content=body, headers={"X-Razorpay-Signature": hmac.new(b"wrong", body, hashlib.sha256).hexdigest()})
    assert bad.status_code == 401 and _status(oid)[0] == "created"
    assert client.post("/webhooks/razorpay", content=body).status_code == 401
    good = client.post("/webhooks/razorpay", content=body, headers={"X-Razorpay-Signature": hmac.new(b"whsec_unit_test", body, hashlib.sha256).hexdigest()})
    assert good.status_code == 200 and _status(oid) == ("paid", round(49900 * 0.08))
    inc = client.get("/admin/money/income", headers=admin).json()
    assert inc["paidOrders"] == 1 and inc["totals"]["store"] == 49900
    me = client.get("/money/me", headers=u(client, "u4")).json()
    assert me["income"]["store"] == 49900 and me["income"]["net"] == 49900 - round(49900 * 0.08)

def test_cashfree_webhook_signature(client, admin):
    client.put("/admin/integrations", json={"cashfree": {"appId": "app_dummy", "secretKey": "sec_dummy", "webhookSecret": "cf_unit_secret"}}, headers=admin)
    oid = _order(provider="cashfree", kind="subscription", ref="plan_backstage", creator=None, amount=9900)
    body = json.dumps({"type": "PAYMENT_LINK_EVENT", "data": {"link_id": oid, "link_status": "PAID"}}).encode(); ts = str(int(__import__("time").time()))  # hardening: Cashfree timestamps must be within ±5 min
    sig = lambda key: base64.b64encode(hmac.new(key, ts.encode() + body, hashlib.sha256).digest()).decode()
    assert client.post("/webhooks/cashfree", content=body, headers={"x-webhook-timestamp": ts, "x-webhook-signature": sig(b"nope")}).status_code == 401
    assert _status(oid)[0] == "created"
    assert client.post("/webhooks/cashfree", content=body, headers={"x-webhook-timestamp": ts, "x-webhook-signature": sig(b"cf_unit_secret")}).status_code == 200
    assert _status(oid)[0] == "paid"
    db = SessionLocal(); assert db.query(M.Subscription).filter_by(user_id="usr_riya", plan_id="plan_backstage").count() == 1; db.close()

def test_integration_secrets_encrypted_and_masked(client, admin, riya):
    secret = "rzp_secret_ABCD1234wxyz"
    r = client.put("/admin/integrations", json={"razorpay": {"mode": "test", "keyId": "rzp_test_abc", "keySecret": secret}}, headers=admin)
    assert r.status_code == 200
    view = client.get("/admin/integrations", headers=admin).json()
    assert view["razorpay"]["keySecret"] == "••••wxyz" and view["razorpay"]["configured"] and secret not in json.dumps(view)
    db = SessionLocal(); raw = db.get(M.KV, ("integrations", "razorpay")).value; aud = " ".join(a.detail for a in db.query(M.Audit)); db.close()
    assert raw["keySecret"].startswith("enc:") and secret not in json.dumps(raw) and secret not in aud
    # masked value sent back keeps the secret
    client.put("/admin/integrations", json={"razorpay": {"keySecret": "••••wxyz"}}, headers=admin)
    from app.routes_integrations import get_config
    db = SessionLocal(); assert get_config(db, "razorpay")["keySecret"] == secret; db.close()
    assert client.get("/admin/integrations", headers=riya).status_code == 403
    assert client.post("/admin/integrations/cashfree/test", headers=admin).json()["configured"] is False
    assert client.put("/admin/integrations", json={"razorpay": {"mode": "prod"}}, headers=admin).status_code == 400

def test_ads_slot_only_for_enabled_slab(client, riya, admin):
    money_on(client, admin)
    # riya follows few → starter slab (off)
    r = client.get("/ads/slot?place=feed", headers=riya).json(); assert r["ad"] is None and r["slab"] == "starter"
    client.put("/admin/ads/slabs", json={"starter": {"enabled": True, "places": ["feed"], "frequency": 8}}, headers=admin)
    r = client.get("/ads/slot?place=feed", headers=riya).json()
    assert r["ad"] and r["ad"]["label"] == "Sponsored" and r["frequency"] == 8
    assert client.get("/ads/slot?place=explore", headers=riya).json()["ad"] is None  # place not enabled for slab
    assert client.put("/admin/ads/slabs", json={"nope": {"enabled": True}}, headers=admin).status_code == 400
    money_on(client, admin, ads=False)
    assert client.get("/ads/slot?place=feed", headers=riya).status_code == 403

def test_video_upload_magic_bytes(client, riya):
    mp4 = b"\x00\x00\x00\x18ftypisom" + b"\x00" * 200
    r = client.post("/media", files={"file": ("x.bin", mp4, "application/octet-stream")}, headers=riya).json()
    assert r["kind"] == "video" and r["mime"] == "video/mp4" and r["url"].endswith(".mp4")
    mov = b"\x00\x00\x00\x14ftypqt  " + b"\x00" * 100
    assert client.post("/media", files={"file": ("a.mp4", mov, "video/mp4")}, headers=riya).json()["mime"] == "video/quicktime"
    webm = b"\x1a\x45\xdf\xa3" + b"\x00" * 100
    assert client.post("/media", files={"file": ("a", webm)}, headers=riya).json()["kind"] == "video"
    assert client.post("/media", files={"file": ("fake.mp4", b"not a video at all" * 10, "video/mp4")}, headers=riya).status_code == 415
    big_img = b"\x89PNG\r\n\x1a\n" + b"\x00" * (5 * 1024 * 1024)
    assert client.post("/media", files={"file": ("a.png", big_img)}, headers=riya).status_code == 413
    big_vid = b"\x00\x00\x00\x18ftypisom" + b"\x00" * (6 * 1024 * 1024)
    assert client.post("/media", files={"file": ("v.mp4", big_vid)}, headers=riya).json()["kind"] == "video"  # >5 MB ok for video

def test_post_video_edit_metadata(client, riya):
    vid = client.post("/media", files={"file": ("v", b"\x00\x00\x00\x18ftypisom" + b"\x00" * 64)}, headers=riya).json()["url"]
    img = client.post("/media", files={"file": ("i", b"\x89PNG\r\n\x1a\n" + b"\x00" * 64)}, headers=riya).json()["url"]
    edit = {"trimStart": 1.5, "trimEnd": 12, "speed": 1.5, "captions": [{"text": "hi", "align": "left", "at": 2, "style": "neon"}]}
    p = client.post("/posts", json={"kind": "motion", "text": "clip", "mediaUrl": vid, "edit": edit}, headers=riya)
    assert p.status_code == 200, p.text
    assert p.json()["mediaKind"] == "video" and p.json()["edit"]["speed"] == 1.5 and p.json()["edit"]["captions"][0]["style"] == "neon"
    assert client.post("/posts", json={"kind": "photo", "text": "x", "mediaUrl": img}, headers=riya).json()["mediaKind"] == "image"
    bad = [{**edit, "trimEnd": 1}, {**edit, "trimEnd": 200}, {**edit, "speed": 3}, {**edit, "captions": [{"text": "x" * 81, "at": 0}]},
           {**edit, "captions": [{"text": "a", "at": 0}] * 21}, {**edit, "captions": [{"text": "a", "at": 0, "style": "comic"}]}]
    for e in bad: assert client.post("/posts", json={"kind": "motion", "text": "c", "mediaUrl": vid, "edit": e}, headers=riya).status_code == 422, e
    assert client.post("/posts", json={"kind": "photo", "text": "c", "mediaUrl": img, "edit": edit}, headers=riya).status_code == 400

def test_vibemoji_reactions(client, riya):
    r = client.post("/posts/p1/react", json={"key": "m1000"}, headers=riya); assert r.status_code == 200
    rx = r.json()["reactions"]; assert rx["m1000"] == 1 and "heart" in rx and not any(k.startswith("m") and k != "m1000" for k in rx)
    for k in ("m0", "m1001", "m01", "mx", "wow"): assert client.post("/posts/p1/react", json={"key": k}, headers=riya).status_code == 400
    assert client.post("/posts/p1/react", json={"key": "m7"}, headers=riya).json()["reactions"].get("m1000") is None

def test_store_product_permissions(client, riya, admin):
    money_on(client, admin)
    fan = login(client, "fan0@demo.vibeloop.app")
    assert client.post("/store/products", json={"title": "x", "price": 100}, headers=fan).status_code == 403
    r = client.post("/store/products", json={"title": "Riya LUTs", "price": 19900}, headers=riya); assert r.status_code == 200
    pid = r.json()["id"]; assert r.json()["price"]["display"] == "₹199"
    assert client.patch(f"/store/products/{pid}", json={"price": 9900}, headers=u(client, "u4")).status_code == 403
    assert client.patch(f"/store/products/{pid}", json={"price": 9900}, headers=riya).json()["price"]["amount"] == 9900
    assert client.patch("/store/products/prd_zine", json={"title": "mine now"}, headers=riya).status_code == 403
    assert client.patch(f"/admin/store/products/{pid}", json={"active": False}, headers=riya).status_code == 403
    assert client.patch(f"/admin/store/products/{pid}", json={"active": False}, headers=admin).json()["active"] is False
    assert pid not in [p["id"] for p in client.get("/store", headers=riya).json()]
    assert {"prod_u1_presets", "prd_zine", "prd_guide"} <= {p["id"] for p in client.get("/store", headers=riya).json()}

def test_admin_plans_and_countries(client, admin, riya):
    assert client.put("/admin/money/plans", json=[{"name": "X", "prices": {"JP": 100}}], headers=admin).status_code == 400
    r = client.put("/admin/money/plans", json=[{"id": "plan_backstage", "name": "Backstage Pass", "prices": {"IN": 4900, "GB": 99}}], headers=admin).json()
    assert {p["id"]: p["active"] for p in r} == {"plan_backstage": True, "plan_creator_pro": False}
    assert client.put("/admin/money/country-pricing", json={"US": {"currency": "USD", "symbol": "$"}}, headers=admin).status_code == 400
    assert client.get("/admin/money/plans", headers=riya).status_code == 403

def test_genz_names_in_config(client):
    c = client.get("/app-config").json()
    assert [i["label"] for i in c["nav"]["social"]] == ["Hub", "Drift", "Make", "Flicks", "Me"]
    assert [i["key"] for i in c["nav"]["chat"]] == ["Chats", "Friends", "Vibes", "Towns", "ChatMe"]
    s = c["languages"]["strings"]; assert s["module.social"] == "Glow" and s["module.chat"] == "Hush" and s["name.store"] == "Stash"
    assert client.get("/app-config?lang=hi").json()["languages"]["strings"]["module.social"] == "ग्लो"
