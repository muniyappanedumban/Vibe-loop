"""Login safety: sessions & devices, two-factor (TOTP) with recovery codes, new-device alerts, account activity.

Admin switches (User App Settings → Global):
  security.twoFactor        users may turn on 2FA; when off, sign-in skips the 2FA step and setup is refused
  security.newDeviceAlerts  push + activity entry when an account signs in on a device it hasn't used before
  security.sessionList      users can see and sign out their devices
"""
import base64, hashlib, hmac, secrets, struct, time
from urllib.parse import quote
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .db import get_db
from . import models as M
from .config import APPROVAL_SECRET, OTP_SECRET
from .crypto_store import encrypt, decrypt
from .ratelimit import enforce, client_ip
from .security import make_access, current_user, current_sid, require, audit
from .v2common import mask_ip

router = APIRouter()
STAFF = require("owner", "admin", "support")
MFA_TICKET_SEC = 300
RECOVERY_COUNT = 10

def ua(db: Session, path: str):
    from .user_app import setting
    return setting(db, path)

# ---------- TOTP (RFC 6238, SHA-1, 30 s, 6 digits) ----------
def new_secret() -> str: return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")

def totp_at(secret: str, step: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    h = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    o = h[-1] & 0x0F
    return f"{(struct.unpack('>I', h[o:o + 4])[0] & 0x7FFFFFFF) % 1_000_000:06d}"

def totp_match(secret: str, code: str, now: float | None = None) -> int | None:
    """Matching time step (±1 step drift) or None."""
    if not (len(code) == 6 and code.isdigit()): return None
    step = int((now or time.time()) // 30)
    for s in (step, step - 1, step + 1):
        if hmac.compare_digest(totp_at(secret, s), code): return s
    return None

def rc_hash(code: str) -> str:
    return hmac.new(OTP_SECRET, ("rc:" + code.replace("-", "").lower()).encode(), hashlib.sha256).hexdigest()

def new_recovery_codes(db: Session, u: M.User) -> list[str]:
    db.query(M.RecoveryCode).filter(M.RecoveryCode.user_id == u.id).delete()
    out = []
    for _ in range(RECOVERY_COUNT):
        raw = secrets.token_hex(4) + secrets.token_hex(4)
        code = f"{raw[:4]}-{raw[4:8]}-{raw[8:12]}-{raw[12:]}"
        db.add(M.RecoveryCode(user_id=u.id, code_hash=rc_hash(code))); out.append(code)
    return out

def check_second_factor(db: Session, u: M.User, code: str) -> str | None:
    """'totp' | 'recovery' when the code is valid (and consumes it), else None. A TOTP step is accepted once."""
    code = (code or "").strip()
    secret = decrypt(u.totp_secret) if u.totp_secret else None
    if secret and (step := totp_match(secret, code)) is not None:
        st = dict(u.settings or {})
        if st.get("totpLastStep", -1) >= step: return None  # replay of an already-used code
        st["totpLastStep"] = step; u.settings = st
        return "totp"
    if len(code.replace("-", "")) == 16:
        r = db.scalar(select(M.RecoveryCode).where(M.RecoveryCode.user_id == u.id, M.RecoveryCode.code_hash == rc_hash(code), M.RecoveryCode.used_at == None))  # noqa: E711
        if r: r.used_at = M.now_ms(); return "recovery"
    return None

def mfa_on(db: Session, u: M.User) -> bool: return bool(u.totp_secret) and bool(ua(db, "security.twoFactor"))

# ---------- sessions & events ----------
def event(db: Session, u: M.User, kind: str, detail: str = "", ip: str = ""):
    db.add(M.SecurityEvent(user_id=u.id, kind=kind, detail=detail[:300], ip=mask_ip(ip) if ip else ""))

def device_of(req: Request) -> tuple[str, str]:
    did = (req.headers.get("x-device-id") or "").strip()[:64]
    name = (req.headers.get("x-device-name") or req.headers.get("user-agent") or "Unknown device").strip()[:120]
    if not did: did = "ua-" + hashlib.sha256(name.encode()).hexdigest()[:24]
    return did, name

def start_session(db: Session, u: M.User, req: Request, how: str) -> str:
    """Create the session row, log the sign-in, alert on a new device. Returns the access token. Caller commits."""
    did, name = device_of(req); ip = client_ip(req)
    seen = db.scalar(select(func.count()).select_from(M.AuthSession).where(M.AuthSession.user_id == u.id, M.AuthSession.device_id == did))
    first_ever = not db.scalar(select(func.count()).select_from(M.AuthSession).where(M.AuthSession.user_id == u.id))
    s = M.AuthSession(user_id=u.id, device_id=did, device_name=name, ip=mask_ip(ip))
    db.add(s); db.flush()
    event(db, u, "sign_in", f"{name} · {how}", ip)
    if not seen and not first_ever and ua(db, "security.newDeviceAlerts"):
        event(db, u, "new_device", name, ip)
        try:
            from .push import queue
            queue(u.id, "security", "New sign-in to your account", f"{name}. Not you? Open Settings → Devices and sign it out.", {"route": "Devices"}, force=True)
        except Exception: pass
    return make_access(u, s.id)

def sign_in_or_challenge(db: Session, u: M.User, req: Request, how: str, extra: dict | None = None) -> dict:
    """Shared by every sign-in path. With 2FA on, returns a short-lived ticket instead of a token."""
    if mfa_on(db, u):
        exp = int(time.time()) + MFA_TICKET_SEC
        ticket = jwt.encode({"sub": u.id, "act": "mfa", "how": how, "tv": u.token_version or 0, "exp": exp}, APPROVAL_SECRET, "HS256")
        db.commit()
        return {"mfaRequired": True, "mfaTicket": ticket, "expiresIn": MFA_TICKET_SEC}
    tok = start_session(db, u, req, how); db.commit()
    return {"token": tok, **(extra or {})}

# ---------- 2FA endpoints ----------
class MfaIn(BaseModel): ticket: str = Field(min_length=10, max_length=2000); code: str = Field(min_length=6, max_length=24)
@router.post("/auth/mfa/verify")
def mfa_verify(b: MfaIn, req: Request, db: Session = Depends(get_db)):
    try: data = jwt.decode(b.ticket, APPROVAL_SECRET, ["HS256"])
    except jwt.PyJWTError: raise HTTPException(401, "Sign-in expired — start again")
    if data.get("act") != "mfa": raise HTTPException(401, "Sign-in expired — start again")
    u = db.get(M.User, str(data["sub"]))
    if not u or u.suspended or data.get("tv", 0) != (u.token_version or 0): raise HTTPException(401, "Sign-in expired — start again")
    enforce("mfa_verify", u.id, client_ip(req))
    how = check_second_factor(db, u, b.code)
    if not how:
        event(db, u, "mfa_failed", "", client_ip(req)); db.commit()
        raise HTTPException(400, "Wrong code")
    if how == "recovery": event(db, u, "recovery_code_used", "", client_ip(req))
    tok = start_session(db, u, req, f"{data.get('how', 'code')} + {how}"); audit(db, u.handle, "auth.mfa_login"); db.commit()
    from .v2common import user_json
    accounts = db.scalars(select(M.User).where(M.User.email == u.email, M.User.verified == True).order_by(M.User.created_at)).all()  # noqa: E712
    left = db.scalar(select(func.count()).select_from(M.RecoveryCode).where(M.RecoveryCode.user_id == u.id, M.RecoveryCode.used_at == None))  # noqa: E711
    return {"token": tok, "user": {**user_json(u), "role": u.role}, "accounts": [user_json(a) for a in accounts], "recoveryCodesLeft": left}

@router.get("/me/2fa")
def mfa_status(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    left = db.scalar(select(func.count()).select_from(M.RecoveryCode).where(M.RecoveryCode.user_id == u.id, M.RecoveryCode.used_at == None))  # noqa: E711
    return {"available": bool(ua(db, "security.twoFactor")), "enabled": bool(u.totp_secret), "recoveryCodesLeft": left}

@router.post("/me/2fa/setup")
def mfa_setup(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    if not ua(db, "security.twoFactor"): raise HTTPException(403, "Two-factor sign-in is not available right now")
    if u.totp_secret: raise HTTPException(409, "Two-factor is already on")
    secret = new_secret(); st = dict(u.settings or {}); st["totpPending"] = encrypt(secret); u.settings = st; db.commit()
    label = quote(f"VibeLoop:{u.handle}")
    return {"secret": secret, "otpauth": f"otpauth://totp/{label}?secret={secret}&issuer=VibeLoop&digits=6&period=30"}

class CodeIn(BaseModel): code: str = Field(min_length=6, max_length=24)
@router.post("/me/2fa/enable")
def mfa_enable(b: CodeIn, req: Request, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    enforce("mfa_verify", u.id, client_ip(req))
    st = dict(u.settings or {}); pending = decrypt(st.get("totpPending"))
    if not pending: raise HTTPException(400, "Start setup first")
    step = totp_match(pending, b.code.strip())
    if step is None: raise HTTPException(400, "Wrong code — check your authenticator app's time")
    st.pop("totpPending", None); st["totpLastStep"] = step; u.settings = st
    u.totp_secret = encrypt(pending); u.mfa_required = True
    codes = new_recovery_codes(db, u)
    event(db, u, "2fa_on", "", client_ip(req)); audit(db, u.handle, "security.2fa_on"); db.commit()
    return {"enabled": True, "recoveryCodes": codes}

@router.post("/me/2fa/disable")
def mfa_disable(b: CodeIn, req: Request, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    enforce("mfa_verify", u.id, client_ip(req))
    if not u.totp_secret: return {"enabled": False}
    if not check_second_factor(db, u, b.code): raise HTTPException(400, "Wrong code")
    u.totp_secret = None; u.mfa_required = False
    db.query(M.RecoveryCode).filter(M.RecoveryCode.user_id == u.id).delete()
    event(db, u, "2fa_off", "", client_ip(req)); audit(db, u.handle, "security.2fa_off"); db.commit()
    return {"enabled": False}

@router.post("/me/2fa/recovery-codes")
def mfa_new_codes(b: CodeIn, req: Request, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    enforce("mfa_verify", u.id, client_ip(req))
    if not u.totp_secret: raise HTTPException(400, "Two-factor is off")
    if not check_second_factor(db, u, b.code): raise HTTPException(400, "Wrong code")
    codes = new_recovery_codes(db, u); event(db, u, "recovery_codes_new", "", client_ip(req)); db.commit()
    return {"recoveryCodes": codes}

# ---------- sessions ----------
def session_json(s: M.AuthSession, cur: str | None) -> dict:
    return {"id": s.id, "device": s.device_name, "ip": s.ip, "createdAt": s.created_at, "lastSeen": s.last_seen, "current": s.id == cur}

@router.get("/me/sessions")
def my_sessions(u: M.User = Depends(current_user), sid: str | None = Depends(current_sid), db: Session = Depends(get_db)):
    if not ua(db, "security.sessionList"): raise HTTPException(403, "Device list is turned off")
    rows = db.scalars(select(M.AuthSession).where(M.AuthSession.user_id == u.id, M.AuthSession.revoked_at == None).order_by(M.AuthSession.last_seen.desc()).limit(50)).all()  # noqa: E711
    return {"items": [session_json(s, sid) for s in rows]}

@router.delete("/me/sessions/{ses_id}")
def revoke_session(ses_id: str, req: Request, u: M.User = Depends(current_user), sid: str | None = Depends(current_sid), db: Session = Depends(get_db)):
    s = db.get(M.AuthSession, ses_id)
    if not s or s.user_id != u.id or s.revoked_at: raise HTTPException(404, "No such device")
    s.revoked_at = M.now_ms(); event(db, u, "session_revoked", s.device_name, client_ip(req)); db.commit()
    return {"ok": True, "signedOutSelf": ses_id == sid}

@router.post("/me/sessions/revoke-others")
def revoke_others(req: Request, u: M.User = Depends(current_user), sid: str | None = Depends(current_sid), db: Session = Depends(get_db)):
    n = 0
    for s in db.scalars(select(M.AuthSession).where(M.AuthSession.user_id == u.id, M.AuthSession.revoked_at == None, M.AuthSession.id != (sid or ""))):  # noqa: E711
        s.revoked_at = M.now_ms(); n += 1
    if not sid: u.token_version = (u.token_version or 0) + 1  # legacy token without a session: fall back to logout-all
    event(db, u, "sessions_revoked", f"{n} device(s)", client_ip(req)); db.commit()
    return {"ok": True, "revoked": n}

@router.post("/auth/logout")
def logout(u: M.User = Depends(current_user), sid: str | None = Depends(current_sid), db: Session = Depends(get_db)):
    if sid and (s := db.get(M.AuthSession, sid)): s.revoked_at = M.now_ms(); db.commit()
    return {"ok": True}

# ---------- activity ----------
@router.get("/me/security-events")
def my_events(limit: int = 50, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(M.SecurityEvent).where(M.SecurityEvent.user_id == u.id).order_by(M.SecurityEvent.at.desc()).limit(max(1, min(limit, 200)))).all()
    return {"items": [{"id": e.id, "at": e.at, "kind": e.kind, "detail": e.detail, "ip": e.ip} for e in rows]}

# ---------- admin ----------
@router.get("/admin/users/{uid}/security")
def admin_user_security(uid: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    u = db.get(M.User, uid)
    if not u: raise HTTPException(404, "No such user")
    ses = db.scalars(select(M.AuthSession).where(M.AuthSession.user_id == uid, M.AuthSession.revoked_at == None).order_by(M.AuthSession.last_seen.desc()).limit(50)).all()  # noqa: E711
    ev = db.scalars(select(M.SecurityEvent).where(M.SecurityEvent.user_id == uid).order_by(M.SecurityEvent.at.desc()).limit(50)).all()
    return {"twoFactor": bool(u.totp_secret), "sessions": [session_json(s, None) for s in ses],
            "events": [{"at": e.at, "kind": e.kind, "detail": e.detail, "ip": e.ip} for e in ev]}

@router.post("/admin/users/{uid}/2fa-reset")
def admin_reset_2fa(uid: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    """Support path for a user who lost both their authenticator and recovery codes (after identity checks offline)."""
    u = db.get(M.User, uid)
    if not u: raise HTTPException(404, "No such user")
    u.totp_secret = None; u.mfa_required = False; u.token_version = (u.token_version or 0) + 1
    db.query(M.RecoveryCode).filter(M.RecoveryCode.user_id == uid).delete()
    event(db, u, "2fa_reset_by_staff", a.handle); audit(db, a.handle, "security.2fa_reset", uid); db.commit()
    return {"ok": True}

@router.post("/admin/users/{uid}/sessions/revoke")
def admin_revoke_all(uid: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    u = db.get(M.User, uid)
    if not u: raise HTTPException(404, "No such user")
    for s in db.scalars(select(M.AuthSession).where(M.AuthSession.user_id == uid, M.AuthSession.revoked_at == None)): s.revoked_at = M.now_ms()  # noqa: E711
    u.token_version = (u.token_version or 0) + 1
    event(db, u, "sessions_revoked", f"by staff {a.handle}"); audit(db, a.handle, "security.sessions_revoke", uid); db.commit()
    return {"ok": True}
