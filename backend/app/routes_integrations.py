"""Admin "Plugs": provider keys (Razorpay, Cashfree, MSG91, Maps). Secrets are Fernet-encrypted at rest and never returned (masked ••••last4)."""
import httpx
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from .db import get_db
from . import models as M
from .security import require, audit
from . import crypto_store as C
from .providers import razorpay, cashfree, msg91
from .providers.common import TIMEOUT, err_text

router = APIRouter()
STAFF = require("owner")
# name → (plain fields, secret fields, required for "configured")
SPEC = {"razorpay": (["mode", "keyId"], ["keySecret", "webhookSecret"], ["keyId", "keySecret"]),
        "cashfree": (["mode", "appId"], ["secretKey", "webhookSecret"], ["appId", "secretKey"]),
        "msg91": (["mode", "templateId", "sender", "enabled"], ["authKey"], ["authKey", "templateId", "sender"]),
        "maps": (["mode", "provider"], ["key"], ["key"]),
        "turn": (["urls", "username"], ["credential", "sharedSecret"], ["urls"]),  # + credential or sharedSecret (checked in get_config)
        "expo": ([], ["accessToken"], []),
        "scanner": (["url", "enabled"], ["apiKey"], ["url"])}  # content-safety scanner webhook (see routes_trust.scan_media)  # Expo push works without a token; the access token is optional
DEFAULTS = {"razorpay": {"mode": "test", "keyId": ""}, "cashfree": {"mode": "test", "appId": ""},
            "msg91": {"mode": "test", "templateId": "", "sender": "", "enabled": False}, "maps": {"mode": "test", "provider": "google"},
            "turn": {"urls": "", "username": ""}, "expo": {}, "scanner": {"url": "", "enabled": False}}

def _raw(db: Session, name: str) -> dict:
    r = db.get(M.KV, ("integrations", name)); return dict(r.value) if r else dict(DEFAULTS[name])

def get_config(db: Session, name: str) -> dict | None:
    """Decrypted config for server-side use, or None when required keys are missing."""
    plain, secret, req = SPEC[name]; raw = _raw(db, name)
    cfg = {k: raw.get(k, DEFAULTS[name].get(k)) for k in plain}
    for k in secret: cfg[k] = C.decrypt(raw.get(k))
    if name == "turn" and not (cfg.get("credential") or cfg.get("sharedSecret")): return None
    return cfg if all(cfg.get(k) for k in req) else None

def public_view(db: Session, name: str) -> dict:
    plain, secret, req = SPEC[name]; raw = _raw(db, name)
    out = {k: raw.get(k, DEFAULTS[name].get(k)) for k in plain}
    for k in secret: out[k] = C.mask(C.decrypt(raw.get(k)))  # never the secret itself
    out["configured"] = get_config(db, name) is not None
    out["updatedAt"] = raw.get("updatedAt")
    return out

@router.get("/admin/integrations")
def list_integrations(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    return {n: public_view(db, n) for n in SPEC}

@router.put("/admin/integrations")
def put_integrations(body: dict = Body(...), a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    """Partial update. Omitted, empty or masked (••••) secret fields keep the stored value; send null to clear a secret."""
    changed = []
    for name, vals in body.items():
        if name not in SPEC or not isinstance(vals, dict): raise HTTPException(400, f"Unknown integration: {name}")
        plain, secret, _ = SPEC[name]; raw = _raw(db, name)
        for k, v in vals.items():
            if k in plain:
                if k == "mode" and v not in ("test", "live"): raise HTTPException(400, "mode must be test or live")
                if k == "provider" and v not in ("google", "mapbox"): raise HTTPException(400, "maps provider must be google or mapbox")
                if k == "enabled": v = bool(v)
                elif not isinstance(v, str) or len(v) > 200: raise HTTPException(400, f"{name}.{k} must be text (≤200 chars)")
                raw[k] = v.strip() if isinstance(v, str) else v
            elif k in secret:
                if v is None: raw.pop(k, None); changed.append(f"{name}.{k}:cleared"); continue
                if not isinstance(v, str) or len(v) > 500: raise HTTPException(400, f"{name}.{k} must be text")
                if not v.strip() or v.startswith("••••"): continue
                raw[k] = C.encrypt(v.strip()); changed.append(f"{name}.{k}:set")
            elif k not in ("configured", "updatedAt"): raise HTTPException(400, f"Unknown field: {name}.{k}")
        raw["updatedAt"] = M.now_ms()
        db.merge(M.KV(ns="integrations", key=name, value=raw)); changed.append(name)
    audit(db, a.handle, "integrations.put", ",".join(changed))  # names only, never values
    db.commit()
    return {n: public_view(db, n) for n in SPEC}

def test_maps(cfg: dict) -> dict:
    try:
        if cfg.get("provider") == "mapbox":
            r = httpx.get("https://api.mapbox.com/geocoding/v5/mapbox.places/Chennai.json", params={"access_token": cfg["key"], "limit": 1}, timeout=TIMEOUT)
            ok = r.status_code == 200
        else:
            r = httpx.get("https://maps.googleapis.com/maps/api/geocode/json", params={"address": "Chennai", "key": cfg["key"]}, timeout=TIMEOUT)
            ok = r.status_code == 200 and r.json().get("status") in ("OK", "ZERO_RESULTS")
            if not ok: return {"ok": False, "message": f"Google Maps rejected the key — {r.json().get('status', err_text(r))}"}
    except httpx.HTTPError as e: return {"ok": False, "message": f"Maps provider unreachable ({type(e).__name__})"}
    return {"ok": ok, "message": "Maps key works" if ok else f"Maps provider rejected the key — {err_text(r)}"}

def test_turn(cfg: dict) -> dict:
    """Config validation only — no TURN allocation is attempted from the API server."""
    urls = [x.strip() for x in (cfg.get("urls") or "").split(",") if x.strip()]
    bad = [x for x in urls if not x.startswith(("turn:", "turns:", "stun:"))]
    if not urls or bad: return {"ok": False, "message": f"URLs must start with turn:, turns: or stun: ({', '.join(bad) or 'none given'})"}
    if not any(x.startswith(("turn:", "turns:")) for x in urls): return {"ok": False, "message": "Add at least one turn: or turns: URL"}
    if cfg.get("credential") and not cfg.get("sharedSecret") and not cfg.get("username"): return {"ok": False, "message": "Static credential needs a username"}
    how = "short-lived HMAC credentials (use-auth-secret)" if cfg.get("sharedSecret") else "the static username/credential"
    return {"ok": True, "message": f"Config looks valid: {len(urls)} URL(s), clients get {how}. This checks the config only — test a real call to confirm the server relays."}

def test_expo(cfg: dict) -> dict:
    """Reachability: send to a deliberately invalid token and expect Expo to reject that token (not us)."""
    from .push import EXPO_URL
    hdr = {"Accept": "application/json", "Content-Type": "application/json"}
    if cfg.get("accessToken"): hdr["Authorization"] = f"Bearer {cfg['accessToken']}"
    try: r = httpx.post(EXPO_URL, json=[{"to": "ExponentPushToken[vibeloop-reachability-check]", "title": "test"}], headers=hdr, timeout=TIMEOUT)
    except httpx.HTTPError as e: return {"ok": False, "message": f"Expo unreachable ({type(e).__name__})"}
    if r.status_code == 401 or r.status_code == 403: return {"ok": False, "message": "Expo rejected the access token"}
    if r.status_code >= 500 or r.status_code == 429: return {"ok": False, "message": f"Expo answered {r.status_code} — try again later"}
    tok = "with your access token" if cfg.get("accessToken") else "without an access token"
    return {"ok": True, "message": f"Expo is reachable {tok} (HTTP {r.status_code}); the test token was rejected as expected — no notification was sent."}

def test_scanner(cfg: dict) -> dict:
    hdr = {"Authorization": f"Bearer {cfg['apiKey']}"} if cfg.get("apiKey") else {}
    try: r = httpx.post(cfg["url"], json={"ping": True}, headers=hdr, timeout=TIMEOUT)
    except httpx.HTTPError as e: return {"ok": False, "message": f"Scanner unreachable ({type(e).__name__})"}
    return {"ok": r.status_code < 400, "message": f"Scanner answered HTTP {r.status_code}"}

@router.post("/admin/integrations/{name}/test")
def test_integration(name: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    if name not in SPEC: raise HTTPException(404, "Unknown integration")
    cfg = get_config(db, name)
    if not cfg: return {"ok": False, "configured": False, "message": "Not configured — add the keys and save first"}
    res = {"razorpay": razorpay.test, "cashfree": cashfree.test, "msg91": msg91.test, "maps": test_maps, "turn": test_turn, "expo": test_expo, "scanner": test_scanner}[name](cfg)
    audit(db, a.handle, "integrations.test", f"{name} ok={res['ok']}"); db.commit()
    return {**res, "configured": True, "mode": cfg.get("mode")}
