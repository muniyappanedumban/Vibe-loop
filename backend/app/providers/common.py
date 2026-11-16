import base64, hashlib, hmac
import httpx

TIMEOUT = httpx.Timeout(10.0)

class ProviderError(Exception):
    """Provider call failed; message is safe to show (never contains secrets)."""

def hmac_hex(secret: str, body: bytes) -> str: return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
def hmac_b64(secret: str, body: bytes) -> str: return base64.b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).decode()
def same(a: str | None, b: str | None) -> bool:
    return bool(a) and bool(b) and hmac.compare_digest(a.encode(), b.encode())

def err_text(r: httpx.Response) -> str:
    try:
        j = r.json(); e = j.get("error") if isinstance(j, dict) else None
        msg = (e.get("description") if isinstance(e, dict) else None) or (j.get("message") if isinstance(j, dict) else None)
    except Exception: msg = None
    return f"HTTP {r.status_code}" + (f": {str(msg)[:160]}" if msg else "")
