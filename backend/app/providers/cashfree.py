"""Cashfree PG Payment Links API (sandbox.cashfree.com in test mode, api.cashfree.com in live)."""
import httpx
from .common import TIMEOUT, ProviderError, hmac_b64, same, err_text

API_VERSION = "2023-08-01"
def base(cfg: dict) -> str: return "https://api.cashfree.com/pg" if cfg.get("mode") == "live" else "https://sandbox.cashfree.com/pg"
def headers(cfg: dict) -> dict: return {"x-client-id": cfg["appId"], "x-client-secret": cfg["secretKey"], "x-api-version": API_VERSION}

def create_link(cfg: dict, *, order_id: str, amount: int, currency: str, description: str, email: str | None, name: str | None, phone: str | None) -> dict:
    cust = {k: v for k, v in {"customer_email": email, "customer_name": name, "customer_phone": phone}.items() if v}
    body = {"link_id": order_id, "link_amount": round(amount / 100, 2), "link_currency": currency, "link_purpose": description[:500],
            "customer_details": cust, "link_notify": {"send_email": False, "send_sms": False}, "link_notes": {"orderId": order_id}}
    try: r = httpx.post(f"{base(cfg)}/links", json=body, headers=headers(cfg), timeout=TIMEOUT)
    except httpx.HTTPError as e: raise ProviderError(f"Cashfree unreachable ({type(e).__name__})")
    if r.status_code >= 300: raise ProviderError(f"Cashfree refused the payment link — {err_text(r)}")
    j = r.json(); return {"ref": j.get("link_id") or order_id, "url": j.get("link_url")}

def test(cfg: dict) -> dict:
    """Valid credentials → 404 for an unknown link; invalid → 401."""
    try: r = httpx.get(f"{base(cfg)}/links/vl_connection_check", headers=headers(cfg), timeout=TIMEOUT)
    except httpx.HTTPError as e: return {"ok": False, "message": f"Cashfree unreachable ({type(e).__name__})"}
    if r.status_code in (200, 404): return {"ok": True, "message": f"Cashfree accepted the keys ({'live' if cfg.get('mode') == 'live' else 'sandbox'})"}
    return {"ok": False, "message": f"Cashfree rejected the keys — {err_text(r)}"}

def verify_webhook(secret: str, timestamp: str | None, body: bytes, signature: str | None) -> bool:
    """x-webhook-signature = base64(HMAC-SHA256(timestamp + raw body, secret))."""
    if not secret or not timestamp: return False
    return same(hmac_b64(secret, timestamp.encode() + body), signature)

def paid_reference(event: dict) -> str | None:
    d = event.get("data") or {}
    if event.get("type") == "PAYMENT_LINK_EVENT" and d.get("link_status") == "PAID":
        return (d.get("link_notes") or {}).get("orderId") or d.get("link_id")
    if event.get("type") == "PAYMENT_SUCCESS_WEBHOOK":
        return ((d.get("order") or {}).get("order_tags") or {}).get("link_id") or (d.get("order") or {}).get("order_id")
    return None
