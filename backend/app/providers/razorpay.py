"""Razorpay Payment Links API. Test vs live is decided by the key (rzp_test_… / rzp_live_…); the base URL is the same."""
import httpx
from .common import TIMEOUT, ProviderError, hmac_hex, same, err_text

BASE = "https://api.razorpay.com/v1"

def create_link(cfg: dict, *, order_id: str, amount: int, currency: str, description: str, email: str | None, name: str | None) -> dict:
    body = {"amount": amount, "currency": currency, "description": description[:2048], "reference_id": order_id, "notes": {"orderId": order_id},
            "notify": {"email": False, "sms": False}, "reminder_enable": False}
    if email: body["customer"] = {"email": email, **({"name": name} if name else {})}
    try: r = httpx.post(f"{BASE}/payment_links", json=body, auth=(cfg["keyId"], cfg["keySecret"]), timeout=TIMEOUT)
    except httpx.HTTPError as e: raise ProviderError(f"Razorpay unreachable ({type(e).__name__})")
    if r.status_code >= 300: raise ProviderError(f"Razorpay refused the payment link — {err_text(r)}")
    j = r.json(); return {"ref": j.get("id"), "url": j.get("short_url")}

def test(cfg: dict) -> dict:
    try: r = httpx.get(f"{BASE}/payment_links", params={"count": 1}, auth=(cfg["keyId"], cfg["keySecret"]), timeout=TIMEOUT)
    except httpx.HTTPError as e: return {"ok": False, "message": f"Razorpay unreachable ({type(e).__name__})"}
    if r.status_code == 200: return {"ok": True, "message": "Razorpay accepted the keys" + (" (test mode)" if cfg["keyId"].startswith("rzp_test_") else "")}
    return {"ok": False, "message": f"Razorpay rejected the keys — {err_text(r)}"}

def verify_webhook(secret: str, body: bytes, signature: str | None) -> bool:
    """X-Razorpay-Signature = hex(HMAC-SHA256(raw body, webhook secret))."""
    return bool(secret) and same(hmac_hex(secret, body), signature)

def paid_reference(event: dict) -> str | None:
    """Our order id from a payment_link.paid / order.paid event."""
    if event.get("event") not in ("payment_link.paid", "order.paid"): return None
    p = event.get("payload") or {}
    link = ((p.get("payment_link") or {}).get("entity") or {})
    if link.get("reference_id"): return link["reference_id"]
    order = ((p.get("order") or {}).get("entity") or {})
    return (order.get("notes") or {}).get("orderId") or order.get("receipt")
