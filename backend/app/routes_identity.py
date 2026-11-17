"""v2 identity: @handle registration, OTP login, multi-account, profile, friends, pings, pulse, identity/OTP admin."""
import hashlib, hmac, os, secrets
from datetime import datetime, timezone
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, func, or_, and_, delete
from sqlalchemy.orm import Session
from .db import get_db
from . import models as M
from .security import make_access, current_user, require, audit
from .ratelimit import enforce, write_limit
from .v2common import (bare_handle, stored_handle, handle_problem, find_by_handle, mask_email, mask_ip, prof, user_json, are_friends,
                       blocked_between, can_message, chat_notice, mood_drop, EMAIL_RE, MAX_ACCOUNTS_PER_EMAIL, DAY, HANDLE_RE)

import logging
log = logging.getLogger("vibeloop.otp")
router = APIRouter()
from .config import OTP_SECRET, DEMO_OTP  # env-only; ENV=prod refuses to start without OTP_SECRET or with DEMO_OTP=1
OTP_TTL_MS = 5 * 60_000
OTP_MAX_ATTEMPTS = 5
FAKE_DOMAINS = ["gmail.com", "outlook.com", "yahoo.com", "icloud.com"]

from .ratelimit import client_ip  # X-Forwarded-For honoured only with TRUST_PROXY=1

def otp_hash(otp_id: str, code: str) -> str: return hmac.new(OTP_SECRET, f"{otp_id}:{code}".encode(), hashlib.sha256).hexdigest()

def resolve(db: Session, identifier: str) -> M.User | None:
    """@handle → that account. email → newest unverified account (just registered) else oldest verified account."""
    ident = identifier.strip()
    if "@" in ident[1:]:
        # suspended accounts can still sign in — every endpoint except appeals / standing / export / delete answers 403
        accts = db.scalars(select(M.User).where(M.User.email == ident.lower()).order_by(M.User.created_at)).all()
        accts = [a for a in accts if not (a.settings or {}).get("deletedAt")]
        unv = [a for a in accts if not a.verified]
        return unv[-1] if unv else (accts[0] if accts else None)
    u = find_by_handle(db, ident)
    return u if u and not (u.settings or {}).get("deletedAt") else None

def sent_shape(to: str, code: str | None) -> dict:
    d = {"sent": True, "channel": "email", "to": to, "expiresIn": OTP_TTL_MS // 1000}
    if DEMO_OTP: d["demoCode"] = code
    return d

def issue_otp(db: Session, u: M.User | None, identifier: str, ip: str) -> dict:
    code = f"{secrets.randbelow(10**6):06d}"
    if u:
        for old in db.scalars(select(M.OtpRequest).where(M.OtpRequest.user_id == u.id, M.OtpRequest.used_at == None)):  # noqa: E711
            old.used_at = M.now_ms()  # a new code supersedes older unused ones
        r = M.OtpRequest(user_id=u.id, identifier=identifier[:200], ip=ip, expires_at=M.now_ms() + OTP_TTL_MS)
        db.add(r); db.flush(); r.code_hash = otp_hash(r.id, code); to = mask_email(u.email)
    else:
        # No account: identical response shape, nothing verifiable stored (code_hash stays NULL).
        db.add(M.OtpRequest(user_id=None, identifier=identifier[:200], ip=ip))
        if "@" in identifier[1:]: to = mask_email(identifier.lower())
        else:
            hsh = hashlib.sha256(OTP_SECRET + identifier.lower().encode()).digest()
            to = f"{bare_handle(identifier)[:1] or 'x'}***@{FAKE_DOMAINS[hsh[0] % len(FAKE_DOMAINS)]}"
    db.commit()
    if u: deliver(db, u, code)
    return sent_shape(to, code)

def deliver(db: Session, u: M.User, code: str):
    """Email the code via MSG91 when the admin configured + enabled it; otherwise the demo code path (DEMO_OTP) is all there is."""
    from .routes_integrations import get_config
    from .providers import msg91
    cfg = get_config(db, "msg91")
    if not cfg or not cfg.get("enabled"): return
    res = msg91.send_email_otp(cfg, to=u.email, name=u.name, code=code)
    if not res["ok"]: log.warning("MSG91 OTP delivery failed for %s: %s", mask_email(u.email), res["message"])

def log_limited(db: Session, identifier: str, ip: str):
    db.add(M.OtpRequest(identifier=identifier[:200], ip=ip, rate_limited=True)); db.commit()

# ---------- auth ----------
class RegisterIn(BaseModel):
    handle: str = Field(min_length=1, max_length=21); name: str = Field(min_length=1, max_length=60); email: str = Field(min_length=5, max_length=200)
    birthDate: str | None = Field(default=None, max_length=10)
@router.post("/auth/register")
def register(b: RegisterIn, req: Request, db: Session = Depends(get_db)):
    from .v2common import kill_on
    if kill_on(db, "signups"): raise HTTPException(503, "Sign-ups are paused by the platform (kill switch)")
    from .user_app import setting as ua_setting
    if not ua_setting(db, "access.signupOpen"): raise HTTPException(403, "Sign-ups are closed right now")
    email = b.email.strip().lower()
    if not EMAIL_RE.match(email): raise HTTPException(400, "Enter a valid email")
    if err := handle_problem(db, b.handle): raise HTTPException(*err)
    if db.scalar(select(func.count()).select_from(M.User).where(M.User.email == email)) >= (mx := ua_setting(db, "limits.maxAccounts")):
        raise HTTPException(409, f"This email already has {mx} accounts")
    from .routes_trust import check_age, apply_age
    age = check_age(db, b.birthDate)
    ip = client_ip(req)
    try: enforce("register", email, ip)
    except HTTPException: log_limited(db, email, ip); raise
    u = M.User(email=email, handle=stored_handle(b.handle), name=b.name.strip(), password_hash="!otp-only", role="creator", verified=False,
               hue=secrets.randbelow(360), profile={})
    apply_age(db, u, b.birthDate, age)
    db.add(u); db.flush(); audit(db, u.handle, "auth.register")
    return issue_otp(db, u, email, ip)

class OtpReqIn(BaseModel): identifier: str = Field(min_length=3, max_length=200)
@router.post("/auth/otp/request")
def otp_request(b: OtpReqIn, req: Request, db: Session = Depends(get_db)):
    ident, ip = b.identifier.strip(), client_ip(req)
    try: enforce("otp_request", ident.lower(), ip)
    except HTTPException: log_limited(db, ident, ip); raise
    from .user_app import setting as ua_setting
    if (cd := ua_setting(db, "limits.otpResendSec")) > 0:
        last = db.scalar(select(func.max(M.OtpRequest.expires_at)).where(M.OtpRequest.identifier == ident[:200], M.OtpRequest.expires_at > 0))
        if last and (wait := last - OTP_TTL_MS + cd * 1000 - M.now_ms()) > 0:
            raise HTTPException(429, f"Wait {wait // 1000 + 1} s before asking for a new code", headers={"Retry-After": str(wait // 1000 + 1)})
    return issue_otp(db, resolve(db, ident), ident, ip)

class OtpVerifyIn(BaseModel): identifier: str = Field(min_length=3, max_length=200); code: str = Field(min_length=1, max_length=10)
@router.post("/auth/otp/verify")
def otp_verify(b: OtpVerifyIn, req: Request, db: Session = Depends(get_db)):
    ident, ip = b.identifier.strip(), client_ip(req)
    enforce("otp_verify", ident.lower(), ip)
    bad = HTTPException(400, "Invalid or expired code")
    u = resolve(db, ident)
    if not u: raise bad
    r = db.scalar(select(M.OtpRequest).where(M.OtpRequest.user_id == u.id, M.OtpRequest.code_hash != None).order_by(M.OtpRequest.at.desc()).limit(1))  # noqa: E711
    if not r or r.used_at or r.expires_at < M.now_ms(): raise bad
    if r.attempts >= OTP_MAX_ATTEMPTS: raise HTTPException(429, "Too many wrong attempts — request a new code")
    code = b.code.strip()
    ok = len(code) == 6 and code.isdigit() and hmac.compare_digest(otp_hash(r.id, code), r.code_hash)
    if not ok:
        r.attempts += 1; db.commit()
        if r.attempts >= OTP_MAX_ATTEMPTS: raise HTTPException(429, "Too many wrong attempts — request a new code")
        raise bad
    r.used_at, r.verified = M.now_ms(), True
    u.verified = True; audit(db, u.handle, "auth.otp_login")
    accounts = db.scalars(select(M.User).where(M.User.email == u.email, M.User.verified == True).order_by(M.User.created_at)).all()  # noqa: E712
    from .routes_security import sign_in_or_challenge
    return sign_in_or_challenge(db, u, req, "email code", {"user": {**user_json(u), "role": u.role}, "accounts": [user_json(a) for a in accounts]})

@router.post("/auth/logout-all")
def logout_all(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    u.token_version = (u.token_version or 0) + 1; audit(db, u.handle, "auth.logout_all"); db.commit(); return {"ok": True}

# ---------- identity ----------
@router.get("/users/lookup")
def lookup(handle: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    if len(handle) > 30: raise HTTPException(400, "Invalid @ID")
    t = find_by_handle(db, handle)
    if not t or t.suspended or not (t.verified or t.id == u.id): raise HTTPException(404, "No one with that @ID")
    friends = are_friends(db, u.id, t.id)
    if t.id != u.id and ((prof(t)["hidden"] and not friends) or db.get(M.Edge, (t.id, "block", u.id))): raise HTTPException(404, "No one with that @ID")
    pending = db.scalar(select(M.FriendRequest).where(M.FriendRequest.status == "pending", or_(and_(M.FriendRequest.from_id == u.id, M.FriendRequest.to_id == t.id), and_(M.FriendRequest.from_id == t.id, M.FriendRequest.to_id == u.id))))
    return {**user_json(t), "friend": friends, "pending": bool(pending), "me": t.id == u.id}

def profile_json(u: M.User) -> dict:
    p = prof(u); nxt = (u.handle_changed_at + 30 * DAY) if u.handle_changed_at else None
    return {"id": u.id, "handle": u.handle, "name": u.name, "email": mask_email(u.email), "verified": bool(u.verified), "hue": u.hue, "social_bio": u.bio,
            **p, "handleChangedAt": u.handle_changed_at, "nextHandleChangeAt": nxt,
            "avatar_social": u.avatar_social, "avatar_chat": u.avatar_chat, "cover": u.cover, "state": u.state or "", "pronouns": u.pronouns or "",
            "links": u.links or [], "last_seen_visible": u.last_seen_visible is not False, "last_seen_at": u.last_seen_at, "moodDrop": mood_drop(u)}
@router.get("/me/profile")
def get_profile(u: M.User = Depends(current_user)): return profile_json(u)

class ProfilePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60); social_bio: str | None = Field(default=None, max_length=300)
    chat_bio: str | None = Field(default=None, max_length=140); hidden: bool | None = None
    who_can_message: Literal["everyone", "friends", "nobody"] | None = None; ghost_hours: bool | None = None; focus_social_muted: bool | None = None
    social_private: bool | None = None; chat_read_receipts: bool | None = None; mood: int | None = Field(default=None, ge=0, le=10000)
    country: str | None = Field(default=None, pattern=r"^[A-Za-z]{2}$"); lang: str | None = Field(default=None, pattern=r"^[a-z]{2,3}$")
    # v4
    avatar_social: str | None = Field(default=None, max_length=200); avatar_chat: str | None = Field(default=None, max_length=200); cover: str | None = Field(default=None, max_length=200)
    state: str | None = Field(default=None, pattern=r"^[A-Za-z]{0,3}$"); pronouns: str | None = Field(default=None, max_length=30)
    links: list[str] | None = Field(default=None, max_length=3); last_seen_visible: bool | None = None
@router.patch("/me/profile")
def patch_profile(b: ProfilePatch, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    d = b.model_dump(exclude_unset=True)
    if "name" in d and d["name"] is not None: u.name = d.pop("name").strip()
    else: d.pop("name", None)
    if "social_bio" in d: u.bio = d.pop("social_bio") or ""
    if d.get("country"): d["country"] = d["country"].upper()
    from .routes_profile import apply_v4_profile
    apply_v4_profile(db, u, d)
    u.profile = {**(u.profile or {}), **d}; db.commit(); return profile_json(u)

class HandleIn(BaseModel): handle: str = Field(min_length=1, max_length=21)
@router.post("/me/handle")
def change_handle(b: HandleIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    if u.handle_changed_at and M.now_ms() < u.handle_changed_at + 30 * DAY:
        when = datetime.fromtimestamp((u.handle_changed_at + 30 * DAY) / 1000, tz=timezone.utc).strftime("%d %b %Y")
        raise HTTPException(429, f"You can change your @ID again on {when}")
    if stored_handle(b.handle) == u.handle: raise HTTPException(400, "That's already your @ID")
    if err := handle_problem(db, b.handle, for_user=u): raise HTTPException(*err)
    old = u.handle; u.handle = stored_handle(b.handle); u.handle_changed_at = M.now_ms()
    db.add(M.HandleChange(user_id=u.id, old=old, new=u.handle)); audit(db, u.handle, "identity.handle_change", f"{old} → {u.handle}"); db.commit()
    return profile_json(u)

@router.get("/me/accounts-for-email")
def accounts_for_email(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    accts = db.scalars(select(M.User).where(M.User.email == u.email).order_by(M.User.created_at)).all()
    return {"email": mask_email(u.email), "count": len(accts), "max": MAX_ACCOUNTS_PER_EMAIL, "accounts": [user_json(a) for a in accts if a.verified]}

# ---------- friends ----------
@router.get("/friends")
def friends(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(M.Friend, M.User).join(M.User, M.User.id == M.Friend.friend_id).where(M.Friend.user_id == u.id).order_by(M.Friend.since.desc())).all()
    inc = db.execute(select(M.FriendRequest, M.User).join(M.User, M.User.id == M.FriendRequest.from_id).where(M.FriendRequest.to_id == u.id, M.FriendRequest.status == "pending").order_by(M.FriendRequest.at.desc())).all()
    out = db.execute(select(M.FriendRequest, M.User).join(M.User, M.User.id == M.FriendRequest.to_id).where(M.FriendRequest.from_id == u.id, M.FriendRequest.status == "pending").order_by(M.FriendRequest.at.desc())).all()
    from .routes_micro import flame_of
    return {"friends": [{**user_json(x), "close": f.close, "bestie": f.bestie, "since": f.since, "flame": flame_of(f)} for f, x in rows],
            "incoming": [{"id": r.id, "from": user_json(x), "at": r.at} for r, x in inc], "outgoing": [{"id": r.id, "to": user_json(x), "at": r.at} for r, x in out]}

class FriendReqIn(BaseModel): handle: str = Field(min_length=3, max_length=30)
@router.post("/friends/request")
def friend_request(b: FriendReqIn, u: M.User = Depends(write_limit("friend_request")), db: Session = Depends(get_db)):
    t = find_by_handle(db, b.handle)
    if not t or t.suspended or not t.verified or (prof(t)["hidden"] and not are_friends(db, u.id, t.id)): raise HTTPException(404, "No one with that @ID")
    if t.id == u.id: raise HTTPException(400, "That's you")
    can_message(db, u, t)
    if are_friends(db, u.id, t.id): raise HTTPException(409, "You're already friends")
    if db.scalar(select(M.FriendRequest).where(M.FriendRequest.status == "pending", or_(and_(M.FriendRequest.from_id == u.id, M.FriendRequest.to_id == t.id), and_(M.FriendRequest.from_id == t.id, M.FriendRequest.to_id == u.id)))):
        raise HTTPException(409, "A friend request is already pending")
    r = M.FriendRequest(from_id=u.id, to_id=t.id); db.add(r); db.flush()
    chat_notice(db, t.id, "friend", f"{u.name} sent you a friend request", u.handle, "Friends", {"requestId": r.id})
    db.commit(); return {"id": r.id, "to": user_json(t), "at": r.at}

def make_friends(db: Session, a: str, b: str):
    for x, y in ((a, b), (b, a)):
        if not db.get(M.Friend, (x, y)): db.add(M.Friend(user_id=x, friend_id=y))
    for c in db.scalars(select(M.Conv).where(M.Conv.group == False, M.has_member(M.Conv.members, a), M.has_member(M.Conv.members, b))):  # noqa: E712  clear any Request Gate between them
        if set(c.members) == {a, b}:
            st = {k: dict(v) for k, v in (c.state or {}).items()}
            for k in st: st[k]["request"] = False
            c.state = st

@router.post("/friends/requests/{rid}/{action}")
def friend_decide(rid: str, action: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    if action not in ("accept", "decline"): raise HTTPException(404, "Not found")
    r = db.get(M.FriendRequest, rid)
    if not r or r.to_id != u.id: raise HTTPException(404, "Request not found")
    if r.status != "pending": raise HTTPException(409, "Request already handled")
    r.status = "accepted" if action == "accept" else "declined"
    if action == "accept":
        if blocked_between(db, u.id, r.from_id): raise HTTPException(403, "Unblock first")
        make_friends(db, u.id, r.from_id); chat_notice(db, r.from_id, "friend", f"{u.name} accepted your friend request", u.handle, "Friends")
    db.commit(); return {"ok": True, "status": r.status}

@router.delete("/friends/{uid}")
def unfriend(uid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    n = db.execute(delete(M.Friend).where(or_(and_(M.Friend.user_id == u.id, M.Friend.friend_id == uid), and_(M.Friend.user_id == uid, M.Friend.friend_id == u.id)))).rowcount
    if not n: raise HTTPException(404, "Not friends")
    db.commit(); return {"ok": True}

class FriendPatch(BaseModel): close: bool | None = None; bestie: bool | None = None
@router.patch("/friends/{uid}")
def patch_friend(uid: str, b: FriendPatch, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    f = db.get(M.Friend, (u.id, uid))
    if not f: raise HTTPException(404, "Not friends")
    if b.close is not None: f.close = b.close
    if b.bestie is not None: f.bestie = b.bestie
    db.commit(); t = db.get(M.User, uid); return {**user_json(t), "close": f.close, "bestie": f.bestie, "since": f.since}

PING_TITLES = {"wave": "Wave", "heart": "Heart Ping", "ping": "Vibe Ping", "thanks": "Thank You Tap", "celebrate": "Celebrate Tap"}
class PingIn(BaseModel): to: str = Field(min_length=1, max_length=40); moji: int = Field(ge=0, le=10000); kind: Literal["wave", "heart", "ping", "thanks", "celebrate"] = "ping"
@router.post("/pings")
def ping(b: PingIn, u: M.User = Depends(write_limit("ping")), db: Session = Depends(get_db)):
    t = db.get(M.User, b.to)
    if not t or t.id == u.id: raise HTTPException(404, "Not found")
    if not are_friends(db, u.id, t.id) or blocked_between(db, u.id, t.id): raise HTTPException(403, "Pings are for friends")
    chat_notice(db, t.id, "ping", f"{u.name} sent you a {PING_TITLES[b.kind]}", u.handle, "Friends", {"from": u.id, "moji": b.moji, "kind": b.kind})
    db.commit(); return {"ok": True}

# ---------- pulse ----------
@router.get("/pulse")
def pulse(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    from .routes_chat import unread_count, my_convs
    social = db.scalar(select(func.count()).select_from(M.Notice).where(M.Notice.user_id == u.id, M.Notice.read == False, M.Notice.module == "social"))  # noqa: E712
    chat_n = db.scalar(select(func.count()).select_from(M.Notice).where(M.Notice.user_id == u.id, M.Notice.read == False, M.Notice.module == "chat"))  # noqa: E712
    reqs = db.scalar(select(func.count()).select_from(M.FriendRequest).where(M.FriendRequest.to_id == u.id, M.FriendRequest.status == "pending"))
    convs = my_convs(db, u)
    msgs = sum(unread_count(db, c, u) for c in convs)
    return {"social": social, "chat": msgs + reqs + chat_n, "detail": {"messages": msgs, "requests": reqs, "notices": chat_n}}

# ---------- admin additions (owner) ----------
STAFF = require("owner")
@router.get("/admin/otp")
def admin_otp(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    out = []
    for r in db.scalars(select(M.OtpRequest).order_by(M.OtpRequest.at.desc()).limit(100)):
        i = r.identifier
        masked = mask_email(i) if "@" in i[1:] else (i[:2] + "***" if len(i) > 2 else "***")
        out.append({"id": r.id, "identifier": masked, "at": r.at, "ip": mask_ip(r.ip), "verified": r.verified, "attempts": r.attempts, "rateLimited": r.rate_limited})
    return out

@router.get("/admin/identity")
def admin_identity(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    per = db.execute(select(M.User.email, func.count()).group_by(M.User.email).order_by(func.count().desc()).limit(100)).all()
    hc = db.scalars(select(M.HandleChange).order_by(M.HandleChange.at.desc()).limit(100)).all()
    return {"accountsPerEmail": [{"email": mask_email(e), "count": n} for e, n in per],
            "handleChanges": [{"id": h.id, "userId": h.user_id, "old": h.old, "new": h.new, "at": h.at} for h in hc],
            "reserved": sorted([k.key for k in db.scalars(select(M.KV).where(M.KV.ns == "reserved")) if (k.value or {}).get("on", True)])}

@router.get("/admin/towns")
def admin_towns(limit: int = 100, offset: int = 0, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    out = []
    towns = db.scalars(select(M.Town).order_by(M.Town.at, M.Town.id).offset(max(0, offset)).limit(max(1, min(limit, 100)))).all()
    ids = [t.id for t in towns]
    counts = dict(db.execute(select(M.TownMember.town_id, func.count()).where(M.TownMember.town_id.in_(ids)).group_by(M.TownMember.town_id)).all()) if ids else {}
    if towns: db.scalars(select(M.User).where(M.User.id.in_({t.owner_id for t in towns}))).all()
    for t in towns:
        n = counts.get(t.id, 0)
        owner = db.get(M.User, t.owner_id)
        out.append({"id": t.id, "name": t.name, "open": t.open, "members": n, "owner": owner.handle if owner else None, "suspended": t.suspended, "at": t.at})
    return out

class TownAdminPatch(BaseModel): suspended: bool
@router.patch("/admin/towns/{tid}")
def admin_town(tid: str, b: TownAdminPatch, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    t = db.get(M.Town, tid)
    if not t: raise HTTPException(404, "Not found")
    t.suspended = b.suspended; audit(db, a.handle, "town.suspend" if b.suspended else "town.unsuspend", t.id); db.commit(); return {"ok": True, "suspended": t.suspended}

@router.get("/admin/chat-stats")
def chat_stats(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    c = lambda m, *w: db.scalar(select(func.count()).select_from(m).where(*w))
    reqs = sum(1 for (st,) in db.execute(select(M.Conv.state).execution_options(yield_per=1000)) if any((s or {}).get("request") for s in (st or {}).values()))
    return {"convs": c(M.Conv), "messages": c(M.ChatMsg), "requestsPending": c(M.FriendRequest, M.FriendRequest.status == "pending") + reqs,
            "statuses24h": c(M.Status, M.Status.at > M.now_ms() - DAY), "towns": c(M.Town)}
