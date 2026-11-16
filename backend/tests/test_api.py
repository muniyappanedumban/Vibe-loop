from tests.conftest import login

def test_health(client): assert client.get("/health").json()["ok"]

def test_auth_rules(client):
    assert client.post("/auth/login", json={"email": "riya@vibeloop.app", "password": "nope"}).status_code == 401
    assert client.post("/auth/signup", json={"email": "a@b.co", "password": "short", "name": "A", "handle": "a"}).status_code == 400
    r = client.post("/auth/signup", json={"email": "new@b.co", "password": "Strong1pass", "name": "New", "handle": "newbie"}); assert r.status_code == 200
    assert client.post("/auth/signup", json={"email": "new@b.co", "password": "Strong1pass", "name": "N", "handle": "x2"}).status_code == 409
    assert client.get("/bootstrap").status_code == 401

def test_bootstrap_shapes(client, riya):
    d = client.get("/bootstrap", headers=riya).json()
    assert [l["id"] for l in d["loops"]] == ["l1", "l2", "l3"] and d["loops"][0]["score"] == 70
    assert len(d["social"]["posts"]) == 8 and d["social"]["chats"][0]["msgs"]

def test_loop_create_and_reaction_rules(client, riya):
    l = client.post("/loops", headers=riya, json={"title": "Test loop", "template": "Comedy short", "sizeLimit": 99, "minScore": 60, "draft": {"title": "T", "hook": "h", "caption": "", "hue": 1, "durationSec": 30, "synthetic": False}}).json()
    assert l["sizeLimit"] == 50 and l["score"] is None
    m = l["members"][0]["id"]
    ok = client.post(f"/loops/{l['id']}/reactions", headers=riya, json={"memberId": m, "version": "A", "kind": "share", "text": "great"}); assert ok.status_code == 200
    assert client.post(f"/loops/{l['id']}/reactions", headers=riya, json={"memberId": m, "version": "A", "kind": "skip"}).status_code == 409   # one per member per version
    assert client.post(f"/loops/{l['id']}/reactions", headers=riya, json={"memberId": "stranger", "version": "A", "kind": "skip"}).status_code == 403
    fan = login(client, "fan1@demo.vibeloop.app")
    assert client.post(f"/loops/{l['id']}/reactions", headers=fan, json={"version": "A", "kind": "forme", "text": "this is me"}).status_code == 200
    client.post(f"/loops/{l['id']}/reactions", headers=riya, json={"memberId": l["members"][2]["id"], "version": "A", "kind": "work", "text": "ok, tighten it"})
    assert client.get(f"/loops/{l['id']}", headers=riya).json()["score"] is not None   # 3 counted reactions → real score

def test_publish_requires_score_checklist_and_one_time_token(client, riya):
    def tok(payload): return client.post("/approvals", headers=riya, json={"action": "publish", "payload": payload}).json()["token"]
    rights = {"rights": True, "music": True, "consent": True}
    assert client.post("/loops/l3/publish", headers=riya, json={"visibility": "public", "approvalToken": tok("l3:public"), "rights": rights}).status_code == 409  # score 36 < 70
    assert client.post("/loops/l1/publish", headers=riya, json={"visibility": "public", "approvalToken": tok("l1:public"), "rights": {}}).status_code == 400
    assert client.post("/loops/l1/publish", headers=riya, json={"visibility": "public", "approvalToken": tok("l1:unlisted"), "rights": rights}).status_code == 403  # payload mismatch
    t = tok("l1:public")
    assert client.post("/loops/l1/publish", headers=riya, json={"visibility": "public", "approvalToken": t, "rights": rights}).status_code == 200
    assert client.post("/loops/l1/publish", headers=riya, json={"visibility": "public", "approvalToken": t, "rights": rights}).status_code == 403  # reused

def test_payout_flow_and_admin_approval(client, riya, admin):
    t = client.post("/approvals", headers=riya, json={"action": "payout", "payload": "100"}).json()["token"]
    assert client.post("/payouts", headers=riya, json={"amount": 100, "approvalToken": t}).status_code == 400  # below minimum
    t = client.post("/approvals", headers=riya, json={"action": "payout", "payload": "600"}).json()["token"]
    p = client.post("/payouts", headers=riya, json={"amount": 600, "approvalToken": t}); assert p.status_code == 200
    assert client.get("/admin/payouts", headers=riya).status_code == 403   # RBAC
    pid = p.json()["id"]
    at = client.post("/admin/approvals", headers=admin, json={"action": "payout", "payload": f"decide:{pid}:approved"}).json()["token"]
    assert client.post(f"/admin/payouts/{pid}/decide", headers=admin, json={"decision": "approved", "approvalToken": at}).json()["status"] == "approved"
    assert any(a["action"] == "payout.approved" for a in client.get("/admin/audit", headers=admin).json())

def test_kill_switch_blocks_publish(client, riya, admin):
    client.put("/admin/kv/kill/publishing", headers=admin, json={"on": True})
    t = client.post("/approvals", headers=riya, json={"action": "publish", "payload": "l1:public"}).json()["token"]
    assert client.post("/loops/l1/publish", headers=riya, json={"visibility": "public", "approvalToken": t, "rights": {"rights": 1, "music": 1, "consent": 1}}).status_code == 503

def test_social(client, riya):
    p = client.post("/posts", headers=riya, json={"kind": "thought", "text": "hello"}).json(); assert p["mine"] and p["by"] == "me"
    assert client.post("/posts/p1/react", headers=riya, json={"key": "fire"}).json()["reactions"]["fire"] == 14
    r = client.post("/posts/p1/comments", headers=riya, json={"text": "buy fake followers"}).json(); assert r["held"] is False  # p1 author has default guard? author u1 has no guard words except default
    assert client.post("/edges/follow/u2", headers=riya).json()["on"] is True
    c = client.post("/chats/c1/messages", headers=riya, json={"text": "See you Saturday"}).json(); assert c["msgs"][-1]["from"] == "me"
    assert client.post("/chats/c4/messages", headers=riya, json={"text": "hi"}).status_code == 409  # unaccepted request
    assert client.post("/sparks/s1/vote", headers=riya, json={"v": "a"}).json()["va"] == 65
    assert client.post("/sparks/s1/vote", headers=riya, json={"v": "a"}).status_code == 409

def test_admin_moderation_requires_reason(client, admin):
    rid = client.get("/admin/reports", headers=admin).json()[0]["id"]
    assert client.patch(f"/admin/reports/{rid}", headers=admin, json={"status": "removed"}).status_code == 400
    assert client.patch(f"/admin/reports/{rid}", headers=admin, json={"status": "removed", "reasonCode": "R-SPAM"}).status_code == 200
