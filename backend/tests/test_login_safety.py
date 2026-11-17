"""Login safety: sessions & devices, TOTP 2FA + recovery codes, new-device events, admin switches and support tools."""
import time
from app.routes_security import totp_at
from tests.conftest import login

def otp_login(c, ident, device="dev-a", name="Pixel 8"):
    t = c.post("/auth/otp/request", json={"identifier": ident}).json()
    return c.post("/auth/otp/verify", json={"identifier": ident, "code": t["demoCode"]}, headers={"x-device-id": device, "x-device-name": name})

def H(tok): return {"Authorization": f"Bearer {tok}"}

def code_now(secret, offset=0): return totp_at(secret, int(time.time() // 30) + offset)

def test_session_list_and_revoke(client):
    a = otp_login(client, "@riya.makes", "dev-a", "Pixel 8").json()["token"]
    b = otp_login(client, "@riya.makes", "dev-b", "Galaxy S24").json()["token"]
    items = client.get("/me/sessions", headers=H(a)).json()["items"]
    assert {i["device"] for i in items} >= {"Pixel 8", "Galaxy S24"}
    assert sum(i["current"] for i in items) == 1
    other = next(i for i in items if i["device"] == "Galaxy S24")
    assert client.delete(f"/me/sessions/{other['id']}", headers=H(a)).status_code == 200
    assert client.get("/me/2fa", headers=H(b)).status_code == 401      # revoked device is signed out
    assert client.get("/me/2fa", headers=H(a)).status_code == 200      # this device still works

def test_revoke_others_and_logout(client):
    a = otp_login(client, "@riya.makes", "dev-a").json()["token"]
    b = otp_login(client, "@riya.makes", "dev-b").json()["token"]
    assert client.post("/me/sessions/revoke-others", headers=H(a)).json()["revoked"] >= 1
    assert client.get("/me/2fa", headers=H(b)).status_code == 401
    assert client.post("/auth/logout", headers=H(a)).status_code == 200
    assert client.get("/me/2fa", headers=H(a)).status_code == 401

def test_new_device_event(client):
    a = otp_login(client, "@riya.makes", "dev-a").json()["token"]
    otp_login(client, "@riya.makes", "dev-a")          # same device: no alert
    otp_login(client, "@riya.makes", "dev-z", "Unknown phone")
    kinds = [e["kind"] for e in client.get("/me/security-events", headers=H(a)).json()["items"]]
    assert kinds.count("new_device") == 1 and "sign_in" in kinds

def test_2fa_full_flow(client):
    tok = otp_login(client, "@riya.makes").json()["token"]
    s = client.post("/me/2fa/setup", headers=H(tok)).json()
    assert s["otpauth"].startswith("otpauth://totp/")
    assert client.post("/me/2fa/enable", headers=H(tok), json={"code": "000000" if code_now(s["secret"]) != "000000" else "111111"}).status_code == 400
    r = client.post("/me/2fa/enable", headers=H(tok), json={"code": code_now(s["secret"])}).json()
    codes = r["recoveryCodes"]; assert len(codes) == 10
    # sign-in now needs the second factor: no token after the email code
    v = otp_login(client, "@riya.makes", "dev-b").json()
    assert v.get("mfaRequired") and "token" not in v
    assert client.post("/auth/mfa/verify", json={"ticket": v["mfaTicket"], "code": "123456"}).status_code == 400
    ok = client.post("/auth/mfa/verify", json={"ticket": v["mfaTicket"], "code": code_now(s["secret"], 1)})
    assert ok.status_code == 200 and ok.json()["token"]
    # same TOTP step can't be replayed
    v2 = otp_login(client, "@riya.makes", "dev-c").json()
    assert client.post("/auth/mfa/verify", json={"ticket": v2["mfaTicket"], "code": code_now(s["secret"], 1)}).status_code == 400
    # recovery code works once
    assert client.post("/auth/mfa/verify", json={"ticket": v2["mfaTicket"], "code": codes[0]}).status_code == 200
    v3 = otp_login(client, "@riya.makes", "dev-d").json()
    assert client.post("/auth/mfa/verify", json={"ticket": v3["mfaTicket"], "code": codes[0]}).status_code == 400
    assert client.get("/me/2fa", headers=H(tok)).json()["recoveryCodesLeft"] == 9

def test_2fa_bad_ticket(client):
    assert client.post("/auth/mfa/verify", json={"ticket": "x" * 40, "code": "123456"}).status_code == 401

def test_admin_switch_and_reset(client, admin):
    tok = otp_login(client, "@riya.makes").json()["token"]
    s = client.post("/me/2fa/setup", headers=H(tok)).json()
    client.post("/me/2fa/enable", headers=H(tok), json={"code": code_now(s["secret"])})
    uid = client.get("/me", headers=H(tok)).json()["id"] if client.get("/me", headers=H(tok)).status_code == 200 else "usr_riya"
    info = client.get(f"/admin/users/{uid}/security", headers=admin).json()
    assert info["twoFactor"] is True and info["sessions"]
    assert client.post(f"/admin/users/{uid}/2fa-reset", headers=admin).status_code == 200
    assert client.get("/me/2fa", headers=H(tok)).status_code == 401        # reset signs the user out everywhere
    v = otp_login(client, "@riya.makes").json()
    assert "token" in v and not v.get("mfaRequired")

def test_non_staff_cannot_use_admin_tools(client, riya):
    assert client.post("/admin/users/usr_admin/2fa-reset", headers=riya).status_code == 403

def test_admin_switches_off(client, admin):
    tok = otp_login(client, "@riya.makes").json()["token"]
    s = client.post("/me/2fa/setup", headers=H(tok)).json()
    client.post("/me/2fa/enable", headers=H(tok), json={"code": code_now(s["secret"])})
    r = client.put("/admin/config/base", json={"security": {"twoFactor": False, "sessionList": False, "newDeviceAlerts": False}}, headers=admin)
    assert r.status_code == 200, r.text
    v = otp_login(client, "@riya.makes", "dev-q").json()
    assert "token" in v and not v.get("mfaRequired")                     # 2FA step skipped while switched off
    assert client.get("/me/sessions", headers=H(v["token"])).status_code == 403
    assert client.post("/me/2fa/setup", headers=H(v["token"])).status_code in (403, 409)
    kinds = [e["kind"] for e in client.get("/me/security-events", headers=H(v["token"])).json()["items"]]
    assert "new_device" not in kinds
    assert client.get("/app-config").json()["security"]["twoFactor"] is False

def test_cors_allows_device_headers(client):
    r = client.options("/auth/otp/request", headers={"Origin": "http://localhost:4175", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,x-app-version,x-device-id,x-device-name"})
    assert r.status_code == 200, r.text
