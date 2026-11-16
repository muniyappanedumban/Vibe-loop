"""MSG91 email OTP (v5 Email API). No phone number is ever required."""
import httpx
from .common import TIMEOUT, err_text

BASE = "https://control.msg91.com/api/v5"

def send_email_otp(cfg: dict, *, to: str, name: str, code: str) -> dict:
    sender = cfg.get("sender") or ""
    body = {"recipients": [{"to": [{"email": to, "name": name or to}], "variables": {"otp": code, "name": name or ""}}],
            "from": {"email": sender}, "domain": sender.split("@")[-1] if "@" in sender else "", "template_id": cfg.get("templateId")}
    try: r = httpx.post(f"{BASE}/email/send", json=body, headers={"authkey": cfg["authKey"], "accept": "application/json"}, timeout=TIMEOUT)
    except httpx.HTTPError as e: return {"ok": False, "message": f"MSG91 unreachable ({type(e).__name__})"}
    return {"ok": r.status_code < 300, "message": "sent" if r.status_code < 300 else f"MSG91 refused — {err_text(r)}"}

def test(cfg: dict) -> dict:
    """Lightweight authenticated read: list email domains."""
    try: r = httpx.get(f"{BASE}/email/domains", headers={"authkey": cfg["authKey"], "accept": "application/json"}, timeout=TIMEOUT)
    except httpx.HTTPError as e: return {"ok": False, "message": f"MSG91 unreachable ({type(e).__name__})"}
    if r.status_code == 200: return {"ok": True, "message": "MSG91 accepted the auth key"}
    return {"ok": False, "message": f"MSG91 rejected the auth key — {err_text(r)}"}
