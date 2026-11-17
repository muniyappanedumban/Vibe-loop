from fastapi import FastAPI, Depends, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator
from typing import Literal
import re
from sqlalchemy import select, func, or_, and_, delete
from sqlalchemy.orm import Session
from .config import CORS_ORIGINS, PLATFORM_FEE
from .db import get_db, engine, Base
from . import models as M
from .security import (hash_password, verify_password, password_ok, make_access, current_user, require, issue_approval, consume_approval, audit)
from .score import loop_score
from .middleware import SecurityMiddleware
from . import routes_identity, routes_chat, routes_config
from .ratelimit import enforce, write_limit
from fastapi import Request
from .v2common import bare_handle
from .serial import loop_json, post_json, posts_json, creator_json, chat_json, user_admin_json
from .routes_feed import viewable_post, blocked_ids
import json as _json

PAGE_MAX = 100  # hard cap for every list endpoint / sub-list
def page(limit: int) -> int: return max(1, min(int(limit), PAGE_MAX))
def small_dict(d: dict, what: str, max_keys: int = 50, max_bytes: int = 16_384) -> dict:
    """Free-form JSON bodies (settings, prefs, notes): bounded key count and serialized size."""
    if not isinstance(d, dict) or len(d) > max_keys or len(_json.dumps(d, default=str)) > max_bytes: raise HTTPException(400, f"{what} is too large")
    return d
def text_field(v, what: str, max_len: int, required: bool = False) -> str:
    if v is None: v = ""
    if not isinstance(v, str): raise HTTPException(400, f"{what} must be text")
    v = v.strip()
    if required and not v: raise HTTPException(400, f"{what} is required")
    if len(v) > max_len: raise HTTPException(400, f"{what} must be at most {max_len} characters")
    return v

from contextlib import asynccontextmanager
@asynccontextmanager
async def lifespan(_app):
    from . import logsafe; logsafe.install()  # redact tokens / OTPs / secrets / emails in every log line
    from .config import ENV, IS_PROD, DEMO_OTP, CORS_ORIGINS as _co
    import logging as _lg
    _lg.getLogger("vibeloop").warning("VibeLoop API starting: ENV=%s demo_otp=%s cors=%s rate_limiter=%s", ENV, DEMO_OTP, "*" if "*" in _co else f"{len(_co)} origins",
                                      __import__("app.ratelimit", fromlist=["limiter"]).limiter.name)
    from .routes_uploads import cleanup_abandoned
    n = cleanup_abandoned()  # abandoned resumable uploads (> 24 h)
    if n: import logging; logging.getLogger("vibeloop").warning("removed %d abandoned upload sessions", n)
    import threading as _thr
    from .routes_trust import purge_loop
    _stop = _thr.Event(); _thr.Thread(target=purge_loop, args=(_stop,), daemon=True, name="purge").start()
    from .routes_addons import addons_loop
    _thr.Thread(target=addons_loop, args=(_stop,), daemon=True, name="addons").start()  # Safe Arrival overdue alerts (every minute)  # erase accounts past their deletion date (hourly)
    yield
    _stop.set()
    # Graceful shutdown (SIGTERM from gunicorn/k8s): the server has stopped accepting and drained in-flight requests by now.
    # Let queued push sends finish (bounded), then close pooled DB connections so PgBouncer/Postgres free them at once.
    import threading as _th
    from . import push as _push
    from .db import dispose_engines
    t = _th.Thread(target=_push.POOL.shutdown, kwargs={"wait": True}, daemon=True); t.start(); t.join(timeout=10)
    if t.is_alive(): _lg.getLogger("vibeloop").warning("shutdown: push queue not drained within 10 s — remaining sends dropped")
    dispose_engines()
app = FastAPI(title="VibeLoop API", version="1.0.0", lifespan=lifespan)
app.add_middleware(SecurityMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                   allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-Country", "If-None-Match", "Accept-Language", "X-App-Version", "X-Device-Id", "X-Device-Name"],
                   expose_headers=["X-Request-ID", "ETag", "Retry-After"], max_age=600)
from .middleware import RequestContextMiddleware, JsonGZipMiddleware
from .middleware import TimeoutMiddleware
app.add_middleware(JsonGZipMiddleware)
app.add_middleware(TimeoutMiddleware)  # REQUEST_TIMEOUT_SEC; inside the request logger so 504s are logged
app.add_middleware(RequestContextMiddleware)
from .routes_media import router as media_router
app.include_router(media_router)
app.include_router(routes_identity.router)
from . import routes_security, routes_trust, routes_addons
app.include_router(routes_addons.router)
import importlib as _il
for _n in range(2, 10):  # add-on batches (models register on import)
    app.include_router(_il.import_module(f".routes_addons_b{_n}", __package__).router)
app.include_router(routes_security.router)
app.include_router(routes_trust.router)
app.include_router(routes_chat.router)
app.include_router(routes_config.router)
from . import routes_money, routes_store, routes_ads, routes_integrations
for _r in (routes_money, routes_store, routes_ads, routes_integrations): app.include_router(_r.router)
from . import routes_profile, routes_uploads, routes_promos, routes_micro, routes_feed
for _r in (routes_profile, routes_uploads, routes_promos, routes_micro, routes_feed): app.include_router(_r.router)
from . import routes_pages, routes_reviews, routes_speakup
for _r in (routes_pages, routes_reviews, routes_speakup): app.include_router(_r.router)
from . import realtime, push, calls, routes_v6  # v6 realtime parity
for _r in (realtime, push, calls, routes_v6): app.include_router(_r.router)
from . import routes_hush_settings; app.include_router(routes_hush_settings.router)  # Hush Control Room
STAFF = ("owner",)

@app.get("/health")
@app.get("/health/live")
def health():
    """Liveness: the process is up and serving. No dependencies — a DB outage must not get healthy pods killed."""
    return {"ok": True, "version": app.version}

@app.get("/health/ready")
def health_ready():
    """Readiness: DB reachable (and Redis when configured). 503 → load balancer stops routing here."""
    from fastapi.responses import JSONResponse
    from .db import SessionLocal
    from .ratelimit import limiter
    out = {"ok": True, "db": "up", "rateLimiter": limiter.name, "version": app.version}
    db = SessionLocal()
    try: db.execute(select(1))
    except Exception: out.update(ok=False, db="down")
    finally: db.close()
    from .config import REDIS_URL
    if REDIS_URL:  # shared limiter, realtime fan-out/presence and config cache all depend on it
        from .cache import cache
        # Redis down is *degraded*, not unready: every Redis user fails open (limiter allows, fan-out delivers locally,
        # cache computes). Failing readiness here would pull every replica out of the LB at once — a total outage.
        try: cache.ping(); out["redis"] = "up"
        except Exception: out.update(redis="down", degraded=True)
    return JSONResponse(out, status_code=200 if out["ok"] else 503)

# ---------- auth ----------
class SignUp(BaseModel):
    email: str = Field(max_length=200); password: str = Field(max_length=200); name: str = Field(max_length=60); handle: str = Field(max_length=21)
class SignIn(BaseModel): email: str = Field(min_length=1, max_length=200); password: str = Field(min_length=1, max_length=200)
@app.post("/auth/signup")
def signup(b: SignUp, req: Request, db: Session = Depends(get_db)):
    if err := password_ok(b.password): raise HTTPException(400, err)
    h = b.handle if b.handle.startswith("@") else "@" + b.handle
    if db.scalar(select(M.User).where(or_(M.User.email == b.email.lower(), M.User.handle == h))): raise HTTPException(409, "Email or handle already taken")
    from .user_app import setting as ua_setting
    if not ua_setting(db, "access.signupOpen"): raise HTTPException(403, "Sign-ups are closed right now")
    u = M.User(email=b.email.lower(), handle=h, name=b.name, password_hash=hash_password(b.password), role="creator")
    db.add(u); db.flush(); audit(db, u.handle, "auth.signup")
    from .routes_security import start_session
    tok = start_session(db, u, req, "sign-up"); db.commit()
    return {"token": tok, "user": user_admin_json(u)}
@app.post("/auth/login")
def login(b: SignIn, req: Request, db: Session = Depends(get_db)):
    ident = b.email.strip().lower()[:200]
    enforce("login", ident, req.client.host if req.client else "")
    q = select(M.User).where(M.User.handle == "@" + bare_handle(ident)) if ident.startswith("@") else select(M.User).where(M.User.email == ident).order_by(M.User.created_at)
    u = next((x for x in db.scalars(q) if verify_password(b.password, x.password_hash)), None)  # email may hold up to 5 accounts
    if not u: raise HTTPException(401, "Wrong email or password")
    if u.suspended: raise HTTPException(403, "Account suspended")
    audit(db, u.handle, "auth.login")
    from .routes_security import sign_in_or_challenge
    return sign_in_or_challenge(db, u, req, "password", {"user": user_admin_json(u)})
@app.get("/me")
def me(u: M.User = Depends(current_user)): return user_admin_json(u)

# ---------- bootstrap: everything the app needs, in client shapes ----------
def edges(db, u, kind, limit: int = 1000): return [t for t in db.scalars(select(M.Edge.target).where(M.Edge.user_id == u.id, M.Edge.kind == kind).order_by(M.Edge.at.desc()).limit(limit))]
@app.get("/bootstrap")
def bootstrap(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    # Every sub-list is bounded (PAGE_MAX); full histories are paged by their own endpoints (/feed, /me/likes, /conv …).
    N = PAGE_MAX
    loops = db.scalars(select(M.Loop).where(M.Loop.owner_id == u.id).order_by(M.Loop.opened_at.desc()).limit(N)).all()
    blocked = set(edges(db, u, "block")); hide = blocked_ids(db, u)
    from .routes_feed import can_see, my_circles
    circles = my_circles(db, u)
    from .routes_v6 import hidden_private, view_counts
    hid = hidden_private(db, u)
    posts = [p for p in db.scalars(select(M.Post).where(M.Post.hidden == False).order_by(M.Post.at.desc()).limit(N)).all() if p.author_id not in hide and can_see(db, p, u, circles, hid)]  # noqa: E712
    sparks = [s for s in db.scalars(select(M.Spark).where(or_(and_(M.Spark.expires_at == None, M.Spark.at > M.now_ms() - 86_400_000), M.Spark.expires_at > M.now_ms()), M.Spark.author_id.not_in(hide or {""})).order_by(M.Spark.at.desc()).limit(N)) if (s.expires_at or s.at + 86_400_000) > M.now_ms()]  # noqa: E711
    vc = view_counts(db, [s.id for s in sparks if s.author_id == u.id])
    others = db.scalars(select(M.User).where(M.User.id != u.id, M.User.role == "creator", M.User.suspended == False).order_by(M.User.created_at).limit(N)).all()  # noqa: E712
    fol = dict(db.execute(select(M.Edge.target, func.count()).where(M.Edge.kind == "follow", M.Edge.target.in_([o.id for o in others])).group_by(M.Edge.target)).all()) if others else {}
    chats = db.scalars(select(M.Chat).where(M.has_member(M.Chat.members, u.id)).limit(N)).all()
    my_reacts = {r.post_id: r.key for r in db.scalars(select(M.PostReaction).where(M.PostReaction.user_id == u.id, M.PostReaction.post_id.in_([p.id for p in posts])))} if posts else {}
    pub = db.scalars(select(M.Publish).join(M.Loop).where(M.Loop.owner_id == u.id).order_by(M.Publish.at.desc()).limit(N)).all()
    soc = u.social or {}
    return {
        "user": {"id": u.id, "name": u.name, "handle": u.handle, "role": u.role},
        "loops": [loop_json(db, l) for l in loops],
        "txns": [{"id": t.id, "kind": t.kind, "from": t.from_name, "gross": t.gross, "fee": t.fee, "at": t.at, "demo": t.demo} for t in db.scalars(select(M.Txn).where(M.Txn.creator_id == u.id).order_by(M.Txn.at.desc()).limit(N))],
        "payouts": [{"id": p.id, "amount": p.amount, "status": p.status, "at": p.at, "tokenId": p.token_id} for p in db.scalars(select(M.Payout).where(M.Payout.creator_id == u.id).order_by(M.Payout.at.desc()).limit(N))],
        "notices": [{"id": n.id, "module": n.module or "social", "kind": n.kind, "title": n.title, "body": n.body, "at": n.at, "read": n.read, "route": n.route, "params": n.params} for n in db.scalars(select(M.Notice).where(M.Notice.user_id == u.id).order_by(M.Notice.at.desc()).limit(100))],
        "audit": [{"id": str(a.id), "at": a.at, "actor": a.actor, "action": a.action, "detail": a.detail} for a in db.scalars(select(M.Audit).where(M.Audit.actor == u.handle).order_by(M.Audit.id.desc()).limit(50))],
        "assets": [{"id": a.id, "title": a.title, "kind": a.kind, "hue": a.hue, "synthetic": a.synthetic, "coreIdentity": a.core_identity, "versions": a.versions} for a in db.scalars(select(M.Asset).where(M.Asset.owner_id == u.id).limit(N))],
        "insights": [{"id": i.id, "text": i.text, "source": i.source, "corrected": i.corrected, "note": i.note} for i in db.scalars(select(M.Insight).where(M.Insight.owner_id == u.id).limit(N))],
        "published": [{"loopId": p.loop_id, "at": p.at, "visibility": p.visibility, "approver": p.approver, "tokenId": p.token_id} for p in pub],
        "settings": u.settings or {},
        "social": {
            "creators": [creator_json(o, fol.get(o.id, 0)) for o in others],
            "posts": posts_json(db, posts, u),
            "sparks": [{"id": s.id, "by": "me" if s.author_id == u.id else s.author_id, "hue": s.hue, "text": s.text, "poll": s.poll, "close": s.close, "at": s.at, "lens": s.lens, "mediaUrl": s.media_url, "place": s.place, "expiresAt": s.expires_at or s.at + 86_400_000,
                        **({"viewCount": vc.get(s.id, 0)} if s.author_id == u.id else {})} for s in sparks],
            "chats": [chat_json(db, c, u) for c in chats],
            "tribes": [{"id": t.id, "name": t.name, "kind": t.kind, "members": t.members, "hue": t.hue, "desc": t.desc} for t in db.scalars(select(M.Tribe).limit(N))],
            "lives": [{"id": v.id, "by": v.author_id, "title": v.title, "at": v.at, "hue": v.hue} for v in db.scalars(select(M.LiveEvent).order_by(M.LiveEvent.at).limit(N))],
            "following": edges(db, u, "follow"), "saved": edges(db, u, "save"), "joined": edges(db, u, "join"), "blocked": list(blocked),
            "restricted": edges(db, u, "restrict"), "reminders": edges(db, u, "remind"), "myReacts": my_reacts,
            "privacy": soc.get("privacy"), "reactionPack": soc.get("reactionPack"), "lessons": soc.get("lessons", []), "profileMood": soc.get("profileMood"), "bio": u.bio,
        },
        "platformFee": PLATFORM_FEE,
    }

# ---------- loops ----------
def own_loop(db, u, loop_id) -> M.Loop:
    l = db.get(M.Loop, loop_id)
    if not l or l.owner_id != u.id: raise HTTPException(404, "Loop not found")
    return l
class LoopIn(BaseModel): id: str | None = Field(default=None, pattern=r'^[\w-]{3,40}$'); title: str = Field(min_length=3, max_length=200); template: str = Field(max_length=60); sizeLimit: int = 20; minScore: int = Field(default=70, ge=0, le=100); paidOnly: bool = False; draft: dict
@app.post("/loops")
def create_loop(b: LoopIn, u: M.User = Depends(require("creator", "owner")), db: Session = Depends(get_db)):
    small_dict(b.draft, "draft")
    fans = db.scalars(select(M.User).where(M.User.role == "fan").limit(6)).all()
    if b.id and db.get(M.Loop, b.id): raise HTTPException(409, "Loop id exists")
    l = M.Loop(id=b.id or M.nid("loop"), owner_id=u.id, title=b.title, template=b.template, size_limit=max(8, min(50, b.sizeLimit)), min_score=b.minScore, paid_only=b.paidOnly,
               drafts=[{**b.draft, "version": "A"}], members=[{"id": f.id, "name": f.name, "hue": f.hue, "joinedAt": f.created_at} for f in fans],
               dna={"mood": "New", "energy": 50, "depth": 50, "pace": 50})
    db.add(l); db.flush(); audit(db, u.handle, "loop.create", b.title); db.commit()
    return loop_json(db, l)
@app.get("/loops/{loop_id}")
def get_loop(loop_id: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    l = db.get(M.Loop, loop_id)
    if not l or (l.owner_id != u.id and u.id not in [m["id"] for m in l.members]): raise HTTPException(404, "Loop not found")
    return loop_json(db, l)
class LoopPatch(BaseModel): status: str | None = Field(default=None, max_length=20); failReason: str | None = Field(default=None, max_length=1000); silent: bool | None = None; paidOnly: bool | None = None; note: str | None = Field(default=None, max_length=1000); versionB: dict | None = None
@app.patch("/loops/{loop_id}")
def patch_loop(loop_id: str, b: LoopPatch, u: M.User = Depends(require("creator", "owner")), db: Session = Depends(get_db)):
    l = own_loop(db, u, loop_id)
    if b.versionB: small_dict(b.versionB, "versionB")
    if b.status:
        if b.status not in ("testing", "locked", "archived"): raise HTTPException(400, "Use the release gate to publish")
        l.status = b.status; audit(db, u.handle, f"loop.{b.status}", l.id)
    if b.failReason is not None: l.fail_reason = b.failReason
    if b.silent is not None: l.silent = b.silent
    if b.paidOnly is not None: l.paid_only = b.paidOnly
    if b.note: l.notes = [b.note, *l.notes][:100]
    if b.versionB and len(l.drafts) < 2: l.drafts = [*l.drafts, {**b.versionB, "version": "B"}]
    db.commit(); return loop_json(db, l)
@app.post("/loops/{loop_id}/invite")
def invite(loop_id: str, u: M.User = Depends(require("creator", "owner")), db: Session = Depends(get_db)):
    l = own_loop(db, u, loop_id); code = M.nid("").strip("_")[:8].upper()
    l.invite = {"code": code, "expiresAt": M.now_ms() + 86_400_000, "used": False}; audit(db, u.handle, "loop.invite", code); db.commit(); return l.invite
@app.post("/loops/{loop_id}/clone")
def clone(loop_id: str, b: dict | None = None, u: M.User = Depends(require("creator", "owner")), db: Session = Depends(get_db)):
    l = own_loop(db, u, loop_id)
    c = M.Loop(id=(b or {}).get("id") or M.nid("loop"), owner_id=u.id, title=l.title + " (clone)", template=l.template, size_limit=l.size_limit, min_score=l.min_score, drafts=l.drafts, members=l.members, dna=l.dna, notes=l.notes)
    db.add(c); db.flush(); audit(db, u.handle, "loop.clone", l.id); db.commit(); return loop_json(db, c)
class ReactIn(BaseModel): memberId: str | None = Field(default=None, max_length=40); version: str = Field(max_length=1); kind: str = Field(max_length=10); text: str = Field(default="", max_length=500); anonymous: bool = False
@app.post("/loops/{loop_id}/reactions")
def react(loop_id: str, b: ReactIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    l = db.get(M.Loop, loop_id)
    if not l: raise HTTPException(404, "Loop not found")
    members = [m["id"] for m in l.members]
    if u.id in members: member = u.id                                   # a real member reacting
    elif l.owner_id == u.id and b.memberId in members: member = b.memberId  # creator recording a member's reaction (testing mode)
    else: raise HTTPException(403, "Only Loop members can react")
    if l.status != "testing": raise HTTPException(409, "This Loop is locked — reactions are closed.")
    if b.kind not in ("share", "skip", "work", "forme") or b.version not in [d["version"] for d in l.drafts]: raise HTTPException(400, "Invalid reaction")
    if db.scalar(select(M.Reaction).where(M.Reaction.loop_id == l.id, M.Reaction.member_id == member, M.Reaction.version == b.version)): raise HTTPException(409, "You already reacted to this version.")
    r = M.Reaction(loop_id=l.id, member_id=member, version=b.version, kind=b.kind, text=b.text[:500], anonymous=b.anonymous); db.add(r)
    if not l.silent: db.add(M.Notice(user_id=l.owner_id, kind="reaction", title=f"New reaction on Version {b.version}", body=f"“{b.text}”" if b.text else "Reaction without text", route="LoopDetail", params={"id": l.id}))
    db.commit(); return loop_json(db, l)

# ---------- approvals, publish, payouts ----------
class ApprovalIn(BaseModel): action: str = Field(max_length=20); payload: str = Field(max_length=500)
@app.post("/approvals")
def approval(b: ApprovalIn, u: M.User = Depends(require("creator", "owner")), db: Session = Depends(get_db)):
    if b.action not in ("publish", "payout", "message"): raise HTTPException(400, "Unknown action")
    signed, tok = issue_approval(db, u, b.action, b.payload); audit(db, u.handle, "token.issue", f"{b.action} · {tok.jti}"); db.commit()
    return {"token": signed, "id": tok.jti, "expiresAt": tok.expires_at}
class PublishIn(BaseModel): visibility: str = Field(max_length=20); approvalToken: str = Field(max_length=2048); rights: dict
@app.post("/loops/{loop_id}/publish")
def publish(loop_id: str, b: PublishIn, u: M.User = Depends(require("creator", "owner")), db: Session = Depends(get_db)):
    l = own_loop(db, u, loop_id)
    if (flag := db.get(M.KV, ("kill", "publishing"))) and flag.value.get("on"): raise HTTPException(503, "Publishing is paused by the platform (kill switch)")
    sc = loop_score(l, db.scalars(select(M.Reaction).where(M.Reaction.loop_id == l.id)).all())
    if sc is None or sc < l.min_score: raise HTTPException(409, f"Loop Score must reach {l.min_score}")
    need = ["rights", "music", "consent"] + (["synthetic"] if any(d.get("synthetic") for d in l.drafts) else [])
    if not all(b.rights.get(k) for k in need): raise HTTPException(400, "Complete the rights checklist")
    tok = consume_approval(db, u, b.approvalToken, "publish", f"{l.id}:{b.visibility}")
    l.status = "released"; p = M.Publish(loop_id=l.id, visibility=b.visibility, approver=u.handle, token_id=tok.jti); db.add(p)
    audit(db, u.handle, "publish", f"{l.title} · {b.visibility} · {tok.jti}"); db.commit()
    return {"ok": True, "publish": {"loopId": l.id, "at": p.at, "visibility": p.visibility, "approver": p.approver, "tokenId": p.token_id}, "loop": loop_json(db, l)}
@app.post("/loops/{loop_id}/withdraw")
def withdraw(loop_id: str, u: M.User = Depends(require("creator", "owner")), db: Session = Depends(get_db)):
    l = own_loop(db, u, loop_id); l.status = "locked"; audit(db, u.handle, "publish.withdraw", l.id); db.commit(); return loop_json(db, l)
def balance(db, u):
    t = db.scalar(select(func.coalesce(func.sum(M.Txn.gross - M.Txn.fee), 0)).where(M.Txn.creator_id == u.id))
    p = db.scalar(select(func.coalesce(func.sum(M.Payout.amount), 0)).where(M.Payout.creator_id == u.id, M.Payout.status != "rejected"))
    return float(t) - float(p)
class PayoutIn(BaseModel): amount: float = Field(gt=0, le=100_000_000); approvalToken: str = Field(max_length=2048)
@app.post("/payouts")
def request_payout(b: PayoutIn, u: M.User = Depends(require("creator", "owner")), db: Session = Depends(get_db)):
    if (flag := db.get(M.KV, ("kill", "payouts"))) and flag.value.get("on"): raise HTTPException(503, "Payouts are paused by the platform (kill switch)")
    minimum = (u.settings or {}).get("minPayout", 500)
    if b.amount < minimum: raise HTTPException(400, f"Minimum payout is {minimum}")
    if b.amount > balance(db, u): raise HTTPException(400, "Amount exceeds available balance")
    tok = consume_approval(db, u, b.approvalToken, "payout", f"{b.amount:g}")
    p = M.Payout(creator_id=u.id, amount=b.amount, token_id=tok.jti); db.add(p); audit(db, u.handle, "payout.request", f"{b.amount:g}"); db.commit()
    return {"id": p.id, "amount": p.amount, "status": p.status, "at": p.at, "tokenId": p.token_id}

# ---------- misc creator ----------
@app.post("/notices/read")
def read_notices(ids: list[str] | None = None, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    from sqlalchemy import update
    if ids is not None and len(ids) > 500: raise HTTPException(400, "At most 500 ids")
    q = update(M.Notice).where(M.Notice.user_id == u.id, M.Notice.read == False)  # noqa: E712  — one UPDATE, scoped to the caller
    if ids is not None: q = q.where(M.Notice.id.in_([str(i)[:40] for i in ids]))
    db.execute(q.values(read=True)); db.commit(); return {"ok": True}
@app.put("/settings")
def put_settings(s: dict, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    small_dict(s, "settings")
    if "minPayout" in s and (not isinstance(s["minPayout"], (int, float)) or s["minPayout"] < 500): raise HTTPException(400, "minPayout must be a number ≥ 500")
    u.settings = small_dict({**(u.settings or {}), **s}, "settings", 200, 65_536); audit(db, u.handle, "settings.change", ",".join(s)); db.commit(); return u.settings
@app.put("/social-prefs")
def put_social(s: dict, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    small_dict(s, "social prefs")
    if "bio" in s: u.bio = text_field(s.pop("bio"), "bio", 300)
    u.social = small_dict({**(u.social or {}), **s}, "social prefs", 200, 65_536); db.commit(); return u.social
class InsightIn(BaseModel): text: str | None = Field(default=None, max_length=2000); note: str | None = Field(default=None, max_length=2000)
@app.patch("/insights/{iid}")
def patch_insight(iid: str, b: InsightIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    i = db.get(M.Insight, iid)
    if not i or i.owner_id != u.id: raise HTTPException(404, "Not found")
    if b.text: i.text, i.corrected = b.text, True
    if b.note is not None: i.note = b.note
    db.commit(); return {"ok": True}
@app.post("/assets/{aid}/versions")
def add_version(aid: str, note: dict, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    a = db.get(M.Asset, aid)
    if not a or a.owner_id != u.id: raise HTTPException(404, "Not found")
    a.versions = [*a.versions, {"v": len(a.versions) + 1, "at": M.now_ms(), "note": text_field(note.get("note", ""), "note", 500)}][-200:]; db.commit(); return a.versions
@app.post("/assets/{aid}/core")
def toggle_core(aid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    a = db.get(M.Asset, aid)
    if not a or a.owner_id != u.id: raise HTTPException(404, "Not found")
    a.core_identity = not a.core_identity; db.commit(); return {"coreIdentity": a.core_identity}
@app.post("/privacy/{kind}")
def privacy_request(kind: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    if kind not in ("access", "deletion"): raise HTTPException(400, "Unknown request")
    r = M.PrivacyRequest(user_id=u.id, kind=kind); db.add(r); audit(db, u.handle, f"privacy.{kind}_request"); db.commit(); return {"id": r.id, "status": r.status}

# ---------- social ----------
from .v2common import LENS_KEYS
class Caption(BaseModel):
    text: str = Field(min_length=1, max_length=80); align: Literal["left", "center", "right"] = "center"; at: float = Field(ge=0, le=180); style: Literal["pop", "clean", "neon"] = "clean"
class VideoEdit(BaseModel):
    trimStart: float = Field(default=0, ge=0, le=180); trimEnd: float = Field(gt=0, le=180); speed: Literal[0.5, 1, 1.5, 2] = 1
    captions: list[Caption] = Field(default_factory=list, max_length=20)
    @model_validator(mode="after")
    def _order(self):
        if self.trimEnd <= self.trimStart: raise ValueError("trimEnd must be greater than trimStart")
        return self
class PostPoll(BaseModel):
    q: str = Field(min_length=1, max_length=140); options: list[str] = Field(min_length=2, max_length=4)
class PostIn(BaseModel): id: str | None = Field(default=None, pattern=r'^[\w-]{3,40}$'); kind: str = Field(max_length=20); text: str = Field(min_length=1, max_length=2200); hue: int = Field(default=200, ge=0, le=360); mood: str = Field(default="Happy", max_length=30); interest: str = Field(default="Life", max_length=30); place: str | None = Field(default=None, max_length=120); bg: str | None = Field(default=None, max_length=20); slides: int | None = Field(default=None, ge=0, le=20); mediaUrl: str | None = Field(default=None, max_length=120, pattern=r'^/media/[\w.-]+$'); lens: str | None = Field(default=None, max_length=20); lat: float | None = Field(default=None, ge=-90, le=90); lng: float | None = Field(default=None, ge=-180, le=180); tags: list[str] = Field(default_factory=list, max_length=20); collab: str | None = Field(default=None, max_length=40); sound: str | None = Field(default=None, max_length=80); audience: str = Field(default="public", max_length=12); edit: VideoEdit | None = None; poll: PostPoll | None = None
@app.post("/posts")
def create_post(b: PostIn, u: M.User = Depends(write_limit("post")), db: Session = Depends(get_db)):
    from .routes_trust import assert_not_restricted
    assert_not_restricted(u)
    if b.id and (ex := db.get(M.Post, b.id)):  # v4 idempotent create (offline outbox re-send)
        if ex.author_id != u.id: raise HTTPException(409, 'Post id exists')
        return post_json(db, ex, u)
    if b.kind not in ("photo", "carousel", "thought", "motion"): raise HTTPException(400, "Unknown post type")
    if b.lens and b.lens not in LENS_KEYS: raise HTTPException(400, 'Unknown lens')
    from .user_app import get as ua_get
    from .config_resolver import resolve as _resolve
    ucfg = _resolve(db, u)
    if b.lens and b.lens != "none" and b.lens not in ua_get(ucfg, "defaults.glow.lenses"): raise HTTPException(400, 'This lens is turned off')
    if b.slides and b.slides > (mp := ua_get(ucfg, "limits.maxPhotosPerPost")): raise HTTPException(400, f'Posts can have at most {mp} photos')
    if not ua_get(ucfg, "defaults.glow.hashtags"): b.tags = []
    if b.audience not in ('public', 'circle', 'quiet'): raise HTTPException(400, 'Audience must be public, circle or quiet')
    mf = db.get(M.MediaFile, b.mediaUrl.split('/')[-1].split('.')[0]) if b.mediaUrl else None
    if b.mediaUrl and not mf: raise HTTPException(400, 'Upload the media first')
    from .routes_media import mark_public
    mark_public(db, b.mediaUrl, u)  # own media becomes public; someone else's private chat file is refused
    if b.edit and (not mf or mf.kind != "video"): raise HTTPException(400, 'Video edits need an uploaded video')
    if b.collab and not db.scalar(select(M.User).where(M.User.handle == ('@' + b.collab.lstrip('@')).lower())): raise HTTPException(404, 'Collab partner @ID not found')
    data = b.model_dump(); data['media_url'] = data.pop('mediaUrl'); data['tags'] = [t.strip()[:40] for t in data['tags'] if t.strip()]; data['id'] = data['id'] or M.nid('p')
    data['media_kind'] = mf.kind if mf else None
    from .routes_uploads import check_video_length
    check_video_length(mf, ua_get(ucfg, "limits.postVideoMaxSec"))
    if b.poll:
        if any(not o.strip() or len(o) > 60 for o in b.poll.options): raise HTTPException(400, 'Poll options are 1–60 characters')
        data['poll'] = {"q": b.poll.q.strip(), "options": [{"text": o.strip(), "votes": 0} for o in b.poll.options], "voters": {}}
    if db.get(M.Post, data['id']): raise HTTPException(409, 'Post id exists')
    p = M.Post(author_id=u.id, **data); db.add(p); db.flush(); audit(db, u.handle, "post.create", p.id); db.commit(); return post_json(db, p, u)
@app.delete("/posts/{pid}")
def delete_post(pid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(M.Post, pid)
    if not p or p.author_id != u.id: raise HTTPException(404, "Not found")
    p.hidden = True; db.commit(); return {"ok": True}
STD_REACTIONS = ("heart", "fire", "laugh", "touch", "clap", "boom")
VMOJI_RE = re.compile(r"^m([1-9]\d{0,2}|1000)$")  # any VibeMoji m1..m1000
@app.post("/posts/{pid}/react")
def react_post(pid: str, b: dict, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    key = b.get("key")
    if not isinstance(key, str) or not (key in STD_REACTIONS or VMOJI_RE.match(key)): raise HTTPException(400, "Invalid")
    p = viewable_post(db, pid, u)
    ex = db.get(M.PostReaction, (u.id, pid))
    if ex and ex.key == key: db.delete(ex)
    elif ex: ex.key, ex.at = key, M.now_ms()
    else: db.add(M.PostReaction(user_id=u.id, post_id=pid, key=key))
    db.commit(); return post_json(db, p, u)
@app.post("/posts/{pid}/comments")
def comment(pid: str, b: dict, u: M.User = Depends(write_limit("comment")), db: Session = Depends(get_db)):
    text = text_field(b.get("text"), "Comment", 1000)
    if not text: raise HTTPException(400, "Invalid")
    p = viewable_post(db, pid, u)
    cid = b.get("id")
    if cid is not None and (not isinstance(cid, str) or not re.match(r'^[\w-]{3,40}$', cid)): raise HTTPException(400, "Invalid id")
    if cid and (ex := db.get(M.Comment, cid)):  # v4 idempotent
        if ex.by != u.id or ex.post_id != pid: raise HTTPException(409, "Comment id exists")
        return {"post": post_json(db, p, u), "held": ex.held, "comment": {"id": ex.id}}
    reply = b.get("replyTo")
    if reply is not None and (not isinstance(reply, str) or len(reply) > 40): raise HTTPException(400, "Invalid replyTo")
    if reply and (not isinstance(reply, str) or not (rc := db.get(M.Comment, reply)) or rc.post_id != pid): raise HTTPException(400, "Reply target not on this post")
    author = db.get(M.User, p.author_id); guard = ((author.social or {}).get("privacy") or {})
    held = bool(guard.get("commentGuard", True)) and any(w.lower() in text.lower() for w in guard.get("guardWords", ["spam"]))
    restricted = db.get(M.Edge, (p.author_id, "restrict", u.id)) is not None
    cm = M.Comment(id=cid or M.nid("cm"), post_id=pid, by=u.id, text=text[:1000], held=held or restricted, reply_to=reply or None); db.add(cm); db.commit()
    return {"post": post_json(db, p, u), "held": held or restricted, "comment": {"id": cm.id}}
@app.post("/posts/{pid}/share")
def share(pid: str, b: dict | None = Body(default=None), u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    p = viewable_post(db, pid, u)
    to = (b or {}).get("to", "external")
    if to not in ("chat", "external"): raise HTTPException(400, "to must be chat or external")
    p.shares += 1; audit(db, u.handle, "post.share", f"{pid} {to}"); db.commit(); return post_json(db, p, u)
@app.post("/edges/{kind}/{target}")
def toggle_edge(kind: str, target: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    if kind not in ("follow", "save", "block", "restrict", "join", "remind"): raise HTTPException(400, "Unknown")
    if not target or len(target) > 40 or target == u.id: raise HTTPException(400, "Invalid target")
    if kind == "follow":
        from .routes_v6 import follow_toggle
        if (r := follow_toggle(db, u, target)) is not None: return r
    e = db.get(M.Edge, (u.id, kind, target))
    if e: db.delete(e); on = False
    else: db.add(M.Edge(user_id=u.id, kind=kind, target=target)); on = True
    if kind == "join" and (t := db.get(M.Tribe, target)): t.members += 1 if on else -1
    if kind in ("block", "restrict"): audit(db, u.handle, f"{kind}.{'on' if on else 'off'}", target)
    db.commit(); return {"on": on, **({"state": "following" if on else "none"} if kind == "follow" else {})}
@app.post("/reports")
def report(b: dict, u: M.User = Depends(write_limit("report")), db: Session = Depends(get_db)):
    r = M.Report(reporter_id=u.id, target=text_field(str(b.get("target", "")), "target", 80, True), reason=str(b.get("reason", ""))[:120]); db.add(r)
    audit(db, u.handle, "report.create", f"{r.target} · {r.reason}"); db.flush()
    from .user_app import setting as ua_setting
    if (n := ua_setting(db, "limits.autoHideReports")) > 0 and (p := db.get(M.Post, r.target)) and not p.hidden:
        if db.scalar(select(func.count(func.distinct(M.Report.reporter_id))).where(M.Report.target == r.target)) >= n:
            p.hidden = True; audit(db, "system", "moderation.auto_hide", f"{p.id} after {n} reports")
    db.commit(); return {"id": r.id, "status": r.status}
@app.post("/chats/{cid}/messages")
def send(cid: str, b: dict, u: M.User = Depends(write_limit("message")), db: Session = Depends(get_db)):
    c = db.get(M.Chat, cid); text = (b.get("text") or "").strip()
    if not c or u.id not in c.members: raise HTTPException(404, "Chat not found")
    if not text: raise HTTPException(400, "Empty message")
    if ((c.state or {}).get(u.id) or {}).get("request"): raise HTTPException(409, "Accept the message request first")
    db.add(M.Message(chat_id=cid, sender=u.id, text=text[:4000])); db.commit(); return chat_json(db, c, u)
@app.post("/chats/{cid}/messages/{mid}/react")
def react_msg(cid: str, mid: str, b: dict, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    m = db.get(M.Message, mid); c = db.get(M.Chat, cid)
    if not m or not c or u.id not in c.members or m.chat_id != c.id: raise HTTPException(404, "Not found")  # IDOR: message must belong to this chat
    moji = b.get("moji")
    if moji is not None and (not isinstance(moji, int) or isinstance(moji, bool) or not 0 <= moji <= 10000): raise HTTPException(400, "Invalid moji")
    m.react = None if m.react == moji else moji; db.commit(); return chat_json(db, c, u)
@app.patch("/chats/{cid}")
def chat_state(cid: str, b: dict, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    c = db.get(M.Chat, cid)
    if not c or u.id not in c.members: raise HTTPException(404, "Chat not found")
    st = dict(c.state or {}); mine = dict(st.get(u.id, {})); mine.update({k: bool(v) for k, v in b.items() if k in ("pinned", "muted", "request")}); st[u.id] = mine; c.state = st
    db.commit(); return chat_json(db, c, u)
@app.post("/sparks/{sid}/vote")
def vote(sid: str, b: dict, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    s = db.get(M.Spark, sid); v = b.get("v")
    if not s or not s.poll or v not in ("a", "b"): raise HTTPException(400, "Invalid")
    if db.get(M.Edge, (u.id, "vote", sid)): raise HTTPException(409, "Already voted")
    db.add(M.Edge(user_id=u.id, kind="vote", target=sid)); poll = dict(s.poll); poll["va" if v == "a" else "vb"] += 1; s.poll = poll; db.commit(); return s.poll

# ---------- admin (owner only) ----------
@app.get("/admin/overview")
def admin_overview(a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    c = lambda m, *w: db.scalar(select(func.count()).select_from(m).where(*w))
    return {"users": c(M.User), "creators": c(M.User, M.User.role == "creator"), "loops": c(M.Loop), "reactions": c(M.Reaction), "posts": c(M.Post),
            "openReports": c(M.Report, M.Report.status == "open"), "pendingPayouts": c(M.Payout, M.Payout.status == "pending_review"),
            "pendingPrivacy": c(M.PrivacyRequest, M.PrivacyRequest.status == "pending"), "gross": float(db.scalar(select(func.coalesce(func.sum(M.Txn.gross), 0)))),
            "fees": float(db.scalar(select(func.coalesce(func.sum(M.Txn.fee), 0))))}
@app.get("/admin/users")
def admin_users(q: str = Query("", max_length=100), limit: int = Query(PAGE_MAX, ge=1), offset: int = Query(0, ge=0), a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    s = select(M.User).order_by(M.User.created_at, M.User.id).offset(offset).limit(page(limit))
    if q: s = s.where(or_(M.User.email.ilike(f"%{q}%"), M.User.handle.ilike(f"%{q}%"), M.User.name.ilike(f"%{q}%")))
    return [user_admin_json(u) for u in db.scalars(s)]
@app.patch("/admin/users/{uid}")
def admin_user(uid: str, b: dict, a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    u = db.get(M.User, uid)
    if not u: raise HTTPException(404, "Not found")
    small_dict(b, "body", 10, 1000)
    if "role" in b:
        if b["role"] not in ("owner", "creator", "editor", "analyst", "viewer", "fan"): raise HTTPException(400, "Unknown role")
        u.role = b["role"]
    if "suspended" in b:
        u.suspended = bool(b["suspended"]); s = dict(u.settings or {})
        if u.suspended: s["suspendedAt"] = M.now_ms()
        else: s.pop("suspendedAt", None)
        u.settings = s
    if "mfaRequired" in b: u.mfa_required = bool(b["mfaRequired"])
    audit(db, a.handle, "admin.user_update", f"{u.handle} {b}"); db.commit(); return user_admin_json(u)
@app.get("/admin/reports")
def admin_reports(limit: int = Query(PAGE_MAX, ge=1), offset: int = Query(0, ge=0), a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    return [{"id": r.id, "reporter": r.reporter_id, "target": r.target, "reason": r.reason, "reasonCode": r.reason_code, "status": r.status, "at": r.at} for r in db.scalars(select(M.Report).order_by(M.Report.at.desc(), M.Report.id).offset(offset).limit(page(limit)))]
@app.patch("/admin/reports/{rid}")
def admin_report(rid: str, b: dict, a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    r = db.get(M.Report, rid)
    if not r: raise HTTPException(404, "Not found")
    if b.get("status") not in ("approved", "removed", "escalated"): raise HTTPException(400, "Status must be approved/removed/escalated")
    if not b.get("reasonCode") or not isinstance(b["reasonCode"], str) or len(b["reasonCode"]) > 20: raise HTTPException(400, "Reason code required (≤20 chars)")
    r.status, r.reason_code = b["status"], b["reasonCode"]
    if r.status == "removed" and (p := db.get(M.Post, r.target)): p.hidden = True
    audit(db, a.handle, f"moderation.{r.status}", f"{r.id} {r.reason_code}"); db.commit(); return {"ok": True}
@app.get("/admin/payouts")
def admin_payouts(limit: int = Query(PAGE_MAX, ge=1), offset: int = Query(0, ge=0), a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    rows = db.execute(select(M.Payout, M.User.handle).join(M.User, M.User.id == M.Payout.creator_id).order_by(M.Payout.at.desc(), M.Payout.id).offset(offset).limit(page(limit))).all()
    return [{"id": p.id, "creator": h, "amount": p.amount, "status": p.status, "at": p.at, "reviewedBy": p.reviewed_by} for p, h in rows]
class Decide(BaseModel): decision: str = Field(max_length=20); approvalToken: str = Field(max_length=2048)
@app.post("/admin/payouts/{pid}/decide")
def admin_decide(pid: str, b: Decide, a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    p = db.get(M.Payout, pid)
    if not p or p.status != "pending_review": raise HTTPException(409, "Payout is not pending")
    if b.decision not in ("approved", "rejected"): raise HTTPException(400, "Invalid decision")
    consume_approval(db, a, b.approvalToken, "payout", f"decide:{pid}:{b.decision}")
    p.status, p.reviewed_by = b.decision, a.handle
    db.add(M.Notice(user_id=p.creator_id, kind="earning", title=f"Payout {b.decision}", body=f"₹{p.amount:g}", route="Earnings"))
    audit(db, a.handle, f"payout.{b.decision}", p.id); db.commit(); return {"ok": True, "status": p.status}
@app.post("/admin/approvals")
def admin_approval(b: ApprovalIn, a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    signed, tok = issue_approval(db, a, b.action, b.payload); audit(db, a.handle, "token.issue", f"{b.action} · {tok.jti}"); db.commit()
    return {"token": signed, "id": tok.jti, "expiresAt": tok.expires_at}
@app.get("/admin/audit")
def admin_audit(q: str = Query("", max_length=100), limit: int = Query(PAGE_MAX, ge=1), before: int | None = None, a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    """Newest first, ≤100 per page (larger limits are clamped); page back with before=<smallest id seen>."""
    s = select(M.Audit).order_by(M.Audit.id.desc()).limit(page(limit))
    if before is not None: s = s.where(M.Audit.id < before)
    if q: s = s.where(or_(M.Audit.actor.ilike(f"%{q}%"), M.Audit.action.ilike(f"%{q}%"), M.Audit.detail.ilike(f"%{q}%")))
    return [{"id": x.id, "at": x.at, "actor": x.actor, "action": x.action, "detail": x.detail} for x in db.scalars(s)]
@app.get("/admin/kv/{ns}")
def kv_get(ns: str, a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    if ns == "integrations": raise HTTPException(400, "Use /admin/integrations")  # never hand out (even encrypted) provider secrets
    return {k.key: k.value for k in db.scalars(select(M.KV).where(M.KV.ns == ns).limit(1000))}
@app.put("/admin/kv/{ns}/{key}")
def kv_put(ns: str, key: str, value: dict, a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    if ns not in ("flag", "kill", "settings", "roles", "emoji", "feature", "reserved"): raise HTTPException(400, "Unknown namespace")
    if ns == "reserved": key = bare_handle(key)[:20]
    if len(key) > 80: raise HTTPException(400, "key too long")
    small_dict(value, "value", 200, 65_536)
    db.merge(M.KV(ns=ns, key=key, value=value)); audit(db, a.handle, f"{ns}.set", f"{key}={value}"); db.commit(); return {"ok": True}
@app.get("/admin/privacy")
def admin_privacy(limit: int = Query(PAGE_MAX, ge=1), offset: int = Query(0, ge=0), a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    rows = db.execute(select(M.PrivacyRequest, M.User.handle).join(M.User, M.User.id == M.PrivacyRequest.user_id).order_by(M.PrivacyRequest.at.desc(), M.PrivacyRequest.id).offset(offset).limit(page(limit))).all()
    return [{"id": r.id, "user": h, "kind": r.kind, "status": r.status, "at": r.at} for r, h in rows]
@app.post("/admin/privacy/{rid}/{action}")
def admin_privacy_act(rid: str, action: str, a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    r = db.get(M.PrivacyRequest, rid)
    if not r or action not in ("fulfil", "reject"): raise HTTPException(400, "Invalid")
    r.status = "fulfilled" if action == "fulfil" else "rejected"
    if action == "fulfil" and r.kind == "deletion" and (u := db.get(M.User, r.user_id)) and not (u.settings or {}).get("deletedAt"):
        from .routes_trust import purge_user
        purge_user(db, u, a.handle)
    audit(db, a.handle, f"privacy.{action}", rid); db.commit(); return {"ok": True}
@app.post("/admin/retention/dry-run")
def retention_dry_run(b: dict, a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    try: days = max(1, min(int(b.get("days", 365)), 36500))
    except (TypeError, ValueError): raise HTTPException(400, "days must be a number")
    cutoff = M.now_ms() - days * 86_400_000
    n = {"posts": db.scalar(select(func.count()).select_from(M.Post).where(M.Post.hidden == True, M.Post.at < cutoff)),  # noqa: E712
         "notices": db.scalar(select(func.count()).select_from(M.Notice).where(M.Notice.read == True, M.Notice.at < cutoff))}  # noqa: E712
    audit(db, a.handle, "retention.dry_run", f"{days}d → {n}"); db.commit(); return {"days": days, "wouldDelete": n, "deleted": 0}
@app.get("/admin/announcements")
def ann_list(limit: int = Query(PAGE_MAX, ge=1), offset: int = Query(0, ge=0), a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    return [{"id": x.id, "title": x.title, "body": x.body, "audience": x.audience, "by": x.by, "at": x.at} for x in db.scalars(select(M.Announcement).order_by(M.Announcement.at.desc(), M.Announcement.id).offset(offset).limit(page(limit)))]
@app.post("/admin/announcements")
def ann_create(b: dict, a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    x = M.Announcement(title=text_field(b.get("title"), "title", 200, True), body=text_field(b.get("body"), "body", 5000, True), audience=text_field(b.get("audience", "all"), "audience", 30) or "all", by=a.handle); db.add(x)
    # Fan-out insert in one statement (INSERT … SELECT) instead of one ORM object per user. At very large scale this belongs in a job queue.
    from sqlalchemy import insert, literal
    db.flush()
    ins = select(func.concat("n_", func.substr(func.md5(func.concat(M.User.id, literal(x.id))), 1, 12)), M.User.id, literal("system"), literal(x.title), literal(x.body),
                 literal(False), literal(M.now_ms()), literal("social")).where(M.User.role != "owner")
    db.execute(insert(M.Notice).from_select(["id", "user_id", "kind", "title", "body", "read", "at", "module"], ins))
    audit(db, a.handle, "announcement.broadcast", x.title); db.commit(); return {"id": x.id}
@app.get("/admin/search")
def admin_search(q: str = Query(min_length=1, max_length=100), a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    like = f"%{q}%"
    return {"users": [user_admin_json(u) for u in db.scalars(select(M.User).where(or_(M.User.handle.ilike(like), M.User.name.ilike(like), M.User.email.ilike(like))).limit(20))],
            "posts": [{"id": p.id, "text": p.text} for p in db.scalars(select(M.Post).where(M.Post.text.ilike(like)).limit(20))],
            "loops": [{"id": l.id, "title": l.title} for l in db.scalars(select(M.Loop).where(M.Loop.title.ilike(like)).limit(20))],
            "audit": [{"id": x.id, "action": x.action, "detail": x.detail} for x in db.scalars(select(M.Audit).where(or_(M.Audit.action.ilike(like), M.Audit.detail.ilike(like))).limit(20))],
            "promos": [{"id": x.id, "title": x.title, "active": x.active, "placement": x.placement} for x in db.scalars(select(M.Promo).where(or_(M.Promo.title.ilike(like), M.Promo.body.ilike(like), M.Promo.id.ilike(like))).limit(20))],
            "uploads": [{"id": m.id, "name": m.name, "kind": m.kind, "mime": m.mime, "size": m.size} for m in db.scalars(select(M.MediaFile).where(or_(M.MediaFile.name.ilike(like), M.MediaFile.id.ilike(like))).limit(20))]}
from . import routes_user_app; app.include_router(routes_user_app.router)  # User App Settings schema
