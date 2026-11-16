import hashlib, hmac, os, time, base64, jwt
from fastapi import Depends, HTTPException, Header
from sqlalchemy.orm import Session
from .config import JWT_SECRET, APPROVAL_SECRET, ACCESS_TTL_MIN, APPROVAL_TTL_SEC
from .db import get_db
from . import models as M

def hash_password(pw: str) -> str:
    salt = os.urandom(16); dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 310_000)
    return "pbkdf2$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(dk).decode()
def verify_password(pw: str, h: str) -> bool:
    try:
        _, s, d = h.split("$"); dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), base64.b64decode(s), 310_000)
        return hmac.compare_digest(dk, base64.b64decode(d))
    except Exception: return False
def password_ok(pw: str) -> str | None:
    if len(pw) < 8: return "Password must be at least 8 characters"
    if pw.lower() == pw or not any(c.isdigit() for c in pw): return "Use upper & lower case letters and a number"
    return None

def make_access(user: M.User) -> str:
    return jwt.encode({"sub": user.id, "role": user.role, "tv": user.token_version or 0, "exp": int(time.time()) + ACCESS_TTL_MIN * 60, "iat": int(time.time())}, JWT_SECRET, "HS256")

def current_user(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> M.User:
    if not authorization.startswith("Bearer "): raise HTTPException(401, "Sign in required")
    try: data = jwt.decode(authorization[7:], JWT_SECRET, ["HS256"])
    except jwt.PyJWTError: raise HTTPException(401, "Session expired — sign in again")
    u = db.get(M.User, data["sub"])
    if not u: raise HTTPException(401, "Unknown user")
    if data.get("tv", 0) != (u.token_version or 0): raise HTTPException(401, "Session ended — sign in again")
    if u.suspended: raise HTTPException(403, "Account suspended")
    return u

def require(*roles: str):
    def dep(u: M.User = Depends(current_user)) -> M.User:
        if u.role not in roles: raise HTTPException(403, f"Requires role: {', '.join(roles)}")
        return u
    return dep

def payload_hash(action: str, payload: str) -> str: return hashlib.sha256(f"{action}:{payload}".encode()).hexdigest()

def issue_approval(db: Session, user: M.User, action: str, payload: str) -> tuple[str, M.ApprovalToken]:
    """One-time approval token: signed JWT bound to actor, action, payload hash and expiry; jti recorded for single use."""
    jti = M.nid("apr"); exp = int(time.time()) + APPROVAL_TTL_SEC
    tok = M.ApprovalToken(jti=jti, actor_id=user.id, action=action, payload_hash=payload_hash(action, payload), expires_at=exp * 1000)
    db.add(tok)
    signed = jwt.encode({"jti": jti, "sub": user.id, "act": action, "ph": tok.payload_hash, "exp": exp}, APPROVAL_SECRET, "HS256")
    return signed, tok

def consume_approval(db: Session, user: M.User, signed: str, action: str, payload: str) -> M.ApprovalToken:
    try: data = jwt.decode(signed, APPROVAL_SECRET, ["HS256"])
    except jwt.ExpiredSignatureError: raise HTTPException(403, "Approval token expired")
    except jwt.PyJWTError: raise HTTPException(403, "Invalid approval token")
    tok = db.get(M.ApprovalToken, data.get("jti"))
    if not tok: raise HTTPException(403, "Unknown approval token")
    if tok.used_at: raise HTTPException(403, "Approval token already used")
    if tok.actor_id != user.id or data["sub"] != user.id: raise HTTPException(403, "Token belongs to another user")
    if tok.action != action or tok.payload_hash != payload_hash(action, payload): raise HTTPException(403, "Token does not match this action")
    tok.used_at = M.now_ms()
    return tok

def audit(db: Session, actor: str, action: str, detail: str = ""):
    db.add(M.Audit(actor=actor, action=action, detail=detail))
