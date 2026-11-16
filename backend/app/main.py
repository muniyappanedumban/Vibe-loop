from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import select, func, or_, delete
from sqlalchemy.orm import Session
from .config import CORS_ORIGINS, PLATFORM_FEE
from .db import get_db, engine, Base
from . import models as M
from .security import (hash_password, verify_password, password_ok, make_access, current_user, require, issue_approval, consume_approval, audit)
from .score import loop_score
from .serial import loop_json, post_json, creator_json, chat_json, user_admin_json

app = FastAPI(title="VibeLoop API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])
STAFF = ("owner",)

@app.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(select(1)); return {"ok": True, "db": "up", "version": app.version}

# ---------- auth ----------
class SignUp(BaseModel): email: str; password: str; name: str; handle: str
class SignIn(BaseModel): email: str; password: str
@app.post("/auth/signup")
def signup(b: SignUp, db: Session = Depends(get_db)):
    if err := password_ok(b.password): raise HTTPException(400, err)
    h = b.handle if b.handle.startswith("@") else "@" + b.handle
    if db.scalar(select(M.User).where(or_(M.User.email == b.email.lower(), M.User.handle == h))): raise HTTPException(409, "Email or handle already taken")
    u = M.User(email=b.email.lower(), handle=h, name=b.name, password_hash=hash_password(b.password), role="creator")
    db.add(u); db.flush(); audit(db, u.handle, "auth.signup"); db.commit()
    return {"token": make_access(u), "user": user_admin_json(u)}
@app.post("/auth/login")
def login(b: SignIn, db: Session = Depends(get_db)):
    u = db.scalar(select(M.User).where(M.User.email == b.email.lower()))
    if not u or not verify_password(b.password, u.password_hash): raise HTTPException(401, "Wrong email or password")
    if u.suspended: raise HTTPException(403, "Account suspended")
    audit(db, u.handle, "auth.login"); db.commit()
    return {"token": make_access(u), "user": user_admin_json(u)}
@app.get("/me")
def me(u: M.User = Depends(current_user)): return user_admin_json(u)

# ---------- bootstrap: everything the app needs, in client shapes ----------
def edges(db, u, kind): return [t for t in db.scalars(select(M.Edge.target).where(M.Edge.user_id == u.id, M.Edge.kind == kind))]
@app.get("/bootstrap")
def bootstrap(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    loops = db.scalars(select(M.Loop).where(M.Loop.owner_id == u.id).order_by(M.Loop.opened_at.desc())).all()
    blocked = set(edges(db, u, "block"))
    posts = db.scalars(select(M.Post).where(M.Post.hidden == False).order_by(M.Post.at.desc()).limit(100)).all()  # noqa: E712
    others = db.scalars(select(M.User).where(M.User.id != u.id, M.User.role == "creator")).all()
    fol = dict(db.execute(select(M.Edge.target, func.count()).where(M.Edge.kind == "follow").group_by(M.Edge.target)).all())
    chats = [c for c in db.scalars(select(M.Chat)).all() if u.id in c.members]
    my_reacts = {r.post_id: r.key for r in db.scalars(select(M.PostReaction).where(M.PostReaction.user_id == u.id))}
    pub = db.scalars(select(M.Publish).join(M.Loop).where(M.Loop.owner_id == u.id).order_by(M.Publish.at.desc())).all()
    soc = u.social or {}
    return {
        "user": {"id": u.id, "name": u.name, "handle": u.handle, "role": u.role},
        "loops": [loop_json(db, l) for l in loops],
        "txns": [{"id": t.id, "kind": t.kind, "from": t.from_name, "gross": t.gross, "fee": t.fee, "at": t.at, "demo": t.demo} for t in db.scalars(select(M.Txn).where(M.Txn.creator_id == u.id).order_by(M.Txn.at.desc()))],
        "payouts": [{"id": p.id, "amount": p.amount, "status": p.status, "at": p.at, "tokenId": p.token_id} for p in db.scalars(select(M.Payout).where(M.Payout.creator_id == u.id).order_by(M.Payout.at.desc()))],
        "notices": [{"id": n.id, "kind": n.kind, "title": n.title, "body": n.body, "at": n.at, "read": n.read, "route": n.route, "params": n.params} for n in db.scalars(select(M.Notice).where(M.Notice.user_id == u.id).order_by(M.Notice.at.desc()).limit(100))],
        "audit": [{"id": str(a.id), "at": a.at, "actor": a.actor, "action": a.action, "detail": a.detail} for a in db.scalars(select(M.Audit).where(M.Audit.actor == u.handle).order_by(M.Audit.id.desc()).limit(50))],
        "assets": [{"id": a.id, "title": a.title, "kind": a.kind, "hue": a.hue, "synthetic": a.synthetic, "coreIdentity": a.core_identity, "versions": a.versions} for a in db.scalars(select(M.Asset).where(M.Asset.owner_id == u.id))],
        "insights": [{"id": i.id, "text": i.text, "source": i.source, "corrected": i.corrected, "note": i.note} for i in db.scalars(select(M.Insight).where(M.Insight.owner_id == u.id))],
        "published": [{"loopId": p.loop_id, "at": p.at, "visibility": p.visibility, "approver": p.approver, "tokenId": p.token_id} for p in pub],
        "settings": u.settings or {},
        "social": {
            "creators": [creator_json(o, fol.get(o.id, 0)) for o in others],
            "posts": [post_json(db, p, u) for p in posts if p.author_id not in blocked],
            "sparks": [{"id": s.id, "by": s.author_id, "hue": s.hue, "text": s.text, "poll": s.poll, "close": s.close, "at": s.at} for s in db.scalars(select(M.Spark).order_by(M.Spark.at.desc()))],
            "chats": [chat_json(db, c, u) for c in chats],
            "tribes": [{"id": t.id, "name": t.name, "kind": t.kind, "members": t.members, "hue": t.hue, "desc": t.desc} for t in db.scalars(select(M.Tribe))],
            "lives": [{"id": v.id, "by": v.author_id, "title": v.title, "at": v.at, "hue": v.hue} for v in db.scalars(select(M.LiveEvent).order_by(M.LiveEvent.at))],
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
class LoopIn(BaseModel): id: str | None = Field(default=None, pattern=r'^[\w-]{3,40}$'); title: str = Field(min_length=3); template: str; sizeLimit: int = 20; minScore: int = 70; paidOnly: bool = False; draft: dict
@app.post("/loops")
def create_loop(b: LoopIn, u: M.User = Depends(require("creator", "owner")), db: Session = Depends(get_db)):
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
class LoopPatch(BaseModel): status: str | None = None; failReason: str | None = None; silent: bool | None = None; paidOnly: bool | None = None; note: str | None = None; versionB: dict | None = None
@app.patch("/loops/{loop_id}")
def patch_loop(loop_id: str, b: LoopPatch, u: M.User = Depends(require("creator", "owner")), db: Session = Depends(get_db)):
    l = own_loop(db, u, loop_id)
    if b.status:
        if b.status not in ("testing", "locked", "archived"): raise HTTPException(400, "Use the release gate to publish")
        l.status = b.status; audit(db, u.handle, f"loop.{b.status}", l.id)
    if b.failReason is not None: l.fail_reason = b.failReason
    if b.silent is not None: l.silent = b.silent
    if b.paidOnly is not None: l.paid_only = b.paidOnly
    if b.note: l.notes = [b.note, *l.notes]
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
class ReactIn(BaseModel): memberId: str | None = None; version: str; kind: str; text: str = ""; anonymous: bool = False
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
class ApprovalIn(BaseModel): action: str; payload: str
@app.post("/approvals")
def approval(b: ApprovalIn, u: M.User = Depends(require("creator", "owner")), db: Session = Depends(get_db)):
    if b.action not in ("publish", "payout", "message"): raise HTTPException(400, "Unknown action")
    signed, tok = issue_approval(db, u, b.action, b.payload); audit(db, u.handle, "token.issue", f"{b.action} · {tok.jti}"); db.commit()
    return {"token": signed, "id": tok.jti, "expiresAt": tok.expires_at}
class PublishIn(BaseModel): visibility: str; approvalToken: str; rights: dict
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
class PayoutIn(BaseModel): amount: float; approvalToken: str
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
    q = select(M.Notice).where(M.Notice.user_id == u.id)
    for n in db.scalars(q): 
        if ids is None or n.id in ids: n.read = True
    db.commit(); return {"ok": True}
@app.put("/settings")
def put_settings(s: dict, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    u.settings = {**(u.settings or {}), **s}; audit(db, u.handle, "settings.change", ",".join(s)); db.commit(); return u.settings
@app.put("/social-prefs")
def put_social(s: dict, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    if "bio" in s: u.bio = s.pop("bio")
    u.social = {**(u.social or {}), **s}; db.commit(); return u.social
class InsightIn(BaseModel): text: str | None = None; note: str | None = None
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
    a.versions = [*a.versions, {"v": len(a.versions) + 1, "at": M.now_ms(), "note": note.get("note", "")}]; db.commit(); return a.versions
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
class PostIn(BaseModel): id: str | None = Field(default=None, pattern=r'^[\w-]{3,40}$'); kind: str; text: str = Field(min_length=1, max_length=2200); hue: int = 200; mood: str = "Happy"; interest: str = "Life"; place: str | None = None; bg: str | None = None; slides: int | None = None
@app.post("/posts")
def create_post(b: PostIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    if b.kind not in ("photo", "carousel", "thought", "motion"): raise HTTPException(400, "Unknown post type")
    data = b.model_dump(); data['id'] = data['id'] or M.nid('p')
    if db.get(M.Post, data['id']): raise HTTPException(409, 'Post id exists')
    p = M.Post(author_id=u.id, **data); db.add(p); db.flush(); audit(db, u.handle, "post.create", p.id); db.commit(); return post_json(db, p, u)
@app.delete("/posts/{pid}")
def delete_post(pid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(M.Post, pid)
    if not p or p.author_id != u.id: raise HTTPException(404, "Not found")
    p.hidden = True; db.commit(); return {"ok": True}
@app.post("/posts/{pid}/react")
def react_post(pid: str, b: dict, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(M.Post, pid); key = b.get("key")
    if not p or key not in ("heart", "fire", "laugh", "touch", "clap", "boom"): raise HTTPException(400, "Invalid")
    ex = db.get(M.PostReaction, (u.id, pid))
    if ex and ex.key == key: db.delete(ex)
    elif ex: ex.key = key
    else: db.add(M.PostReaction(user_id=u.id, post_id=pid, key=key))
    db.commit(); return post_json(db, p, u)
@app.post("/posts/{pid}/comments")
def comment(pid: str, b: dict, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(M.Post, pid); text = (b.get("text") or "").strip()
    if not p or not text: raise HTTPException(400, "Invalid")
    author = db.get(M.User, p.author_id); guard = ((author.social or {}).get("privacy") or {})
    held = bool(guard.get("commentGuard", True)) and any(w.lower() in text.lower() for w in guard.get("guardWords", ["spam"]))
    restricted = db.get(M.Edge, (p.author_id, "restrict", u.id)) is not None
    db.add(M.Comment(post_id=pid, by=u.id, text=text[:1000], held=held or restricted)); db.commit()
    return {"post": post_json(db, p, u), "held": held or restricted}
@app.post("/posts/{pid}/share")
def share(pid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(M.Post, pid)
    if not p: raise HTTPException(404, "Not found")
    p.shares += 1; db.commit(); return post_json(db, p, u)
@app.post("/edges/{kind}/{target}")
def toggle_edge(kind: str, target: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    if kind not in ("follow", "save", "block", "restrict", "join", "remind"): raise HTTPException(400, "Unknown")
    e = db.get(M.Edge, (u.id, kind, target))
    if e: db.delete(e); on = False
    else: db.add(M.Edge(user_id=u.id, kind=kind, target=target)); on = True
    if kind == "join" and (t := db.get(M.Tribe, target)): t.members += 1 if on else -1
    if kind in ("block", "restrict"): audit(db, u.handle, f"{kind}.{'on' if on else 'off'}", target)
    db.commit(); return {"on": on}
@app.post("/reports")
def report(b: dict, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    r = M.Report(reporter_id=u.id, target=str(b.get("target", "")), reason=str(b.get("reason", ""))[:120]); db.add(r)
    audit(db, u.handle, "report.create", f"{r.target} · {r.reason}"); db.commit(); return {"id": r.id, "status": r.status}
@app.post("/chats/{cid}/messages")
def send(cid: str, b: dict, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    c = db.get(M.Chat, cid); text = (b.get("text") or "").strip()
    if not c or u.id not in c.members: raise HTTPException(404, "Chat not found")
    if not text: raise HTTPException(400, "Empty message")
    if ((c.state or {}).get(u.id) or {}).get("request"): raise HTTPException(409, "Accept the message request first")
    db.add(M.Message(chat_id=cid, sender=u.id, text=text[:4000])); db.commit(); return chat_json(db, c, u)
@app.post("/chats/{cid}/messages/{mid}/react")
def react_msg(cid: str, mid: str, b: dict, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    m = db.get(M.Message, mid); c = db.get(M.Chat, cid)
    if not m or not c or u.id not in c.members: raise HTTPException(404, "Not found")
    moji = b.get("moji"); m.react = None if m.react == moji else moji; db.commit(); return chat_json(db, c, u)
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
def admin_users(q: str = "", a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    s = select(M.User).order_by(M.User.created_at)
    if q: s = s.where(or_(M.User.email.ilike(f"%{q}%"), M.User.handle.ilike(f"%{q}%"), M.User.name.ilike(f"%{q}%")))
    return [user_admin_json(u) for u in db.scalars(s)]
@app.patch("/admin/users/{uid}")
def admin_user(uid: str, b: dict, a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    u = db.get(M.User, uid)
    if not u: raise HTTPException(404, "Not found")
    if "role" in b:
        if b["role"] not in ("owner", "creator", "editor", "analyst", "viewer", "fan"): raise HTTPException(400, "Unknown role")
        u.role = b["role"]
    if "suspended" in b: u.suspended = bool(b["suspended"])
    if "mfaRequired" in b: u.mfa_required = bool(b["mfaRequired"])
    audit(db, a.handle, "admin.user_update", f"{u.handle} {b}"); db.commit(); return user_admin_json(u)
@app.get("/admin/reports")
def admin_reports(a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    return [{"id": r.id, "reporter": r.reporter_id, "target": r.target, "reason": r.reason, "reasonCode": r.reason_code, "status": r.status, "at": r.at} for r in db.scalars(select(M.Report).order_by(M.Report.at.desc()))]
@app.patch("/admin/reports/{rid}")
def admin_report(rid: str, b: dict, a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    r = db.get(M.Report, rid)
    if not r: raise HTTPException(404, "Not found")
    if b.get("status") not in ("approved", "removed", "escalated"): raise HTTPException(400, "Status must be approved/removed/escalated")
    if not b.get("reasonCode"): raise HTTPException(400, "Reason code required")
    r.status, r.reason_code = b["status"], b["reasonCode"]
    if r.status == "removed" and (p := db.get(M.Post, r.target)): p.hidden = True
    audit(db, a.handle, f"moderation.{r.status}", f"{r.id} {r.reason_code}"); db.commit(); return {"ok": True}
@app.get("/admin/payouts")
def admin_payouts(a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    rows = db.execute(select(M.Payout, M.User.handle).join(M.User, M.User.id == M.Payout.creator_id).order_by(M.Payout.at.desc())).all()
    return [{"id": p.id, "creator": h, "amount": p.amount, "status": p.status, "at": p.at, "reviewedBy": p.reviewed_by} for p, h in rows]
class Decide(BaseModel): decision: str; approvalToken: str
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
def admin_audit(q: str = "", limit: int = Query(200, le=1000), a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    s = select(M.Audit).order_by(M.Audit.id.desc()).limit(limit)
    if q: s = s.where(or_(M.Audit.actor.ilike(f"%{q}%"), M.Audit.action.ilike(f"%{q}%"), M.Audit.detail.ilike(f"%{q}%")))
    return [{"id": x.id, "at": x.at, "actor": x.actor, "action": x.action, "detail": x.detail} for x in db.scalars(s)]
@app.get("/admin/kv/{ns}")
def kv_get(ns: str, a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    return {k.key: k.value for k in db.scalars(select(M.KV).where(M.KV.ns == ns))}
@app.put("/admin/kv/{ns}/{key}")
def kv_put(ns: str, key: str, value: dict, a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    if ns not in ("flag", "kill", "settings", "roles", "emoji", "feature"): raise HTTPException(400, "Unknown namespace")
    db.merge(M.KV(ns=ns, key=key, value=value)); audit(db, a.handle, f"{ns}.set", f"{key}={value}"); db.commit(); return {"ok": True}
@app.get("/admin/privacy")
def admin_privacy(a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    rows = db.execute(select(M.PrivacyRequest, M.User.handle).join(M.User, M.User.id == M.PrivacyRequest.user_id).order_by(M.PrivacyRequest.at.desc())).all()
    return [{"id": r.id, "user": h, "kind": r.kind, "status": r.status, "at": r.at} for r, h in rows]
@app.post("/admin/privacy/{rid}/{action}")
def admin_privacy_act(rid: str, action: str, a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    r = db.get(M.PrivacyRequest, rid)
    if not r or action not in ("fulfil", "reject"): raise HTTPException(400, "Invalid")
    r.status = "fulfilled" if action == "fulfil" else "rejected"; audit(db, a.handle, f"privacy.{action}", rid); db.commit(); return {"ok": True}
@app.post("/admin/retention/dry-run")
def retention_dry_run(b: dict, a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    days = int(b.get("days", 365)); cutoff = M.now_ms() - days * 86_400_000
    n = {"posts": db.scalar(select(func.count()).select_from(M.Post).where(M.Post.hidden == True, M.Post.at < cutoff)),  # noqa: E712
         "notices": db.scalar(select(func.count()).select_from(M.Notice).where(M.Notice.read == True, M.Notice.at < cutoff))}  # noqa: E712
    audit(db, a.handle, "retention.dry_run", f"{days}d → {n}"); db.commit(); return {"days": days, "wouldDelete": n, "deleted": 0}
@app.get("/admin/announcements")
def ann_list(a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    return [{"id": x.id, "title": x.title, "body": x.body, "audience": x.audience, "by": x.by, "at": x.at} for x in db.scalars(select(M.Announcement).order_by(M.Announcement.at.desc()))]
@app.post("/admin/announcements")
def ann_create(b: dict, a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    x = M.Announcement(title=b["title"], body=b["body"], audience=b.get("audience", "all"), by=a.handle); db.add(x)
    for u in db.scalars(select(M.User).where(M.User.role != "owner")): db.add(M.Notice(user_id=u.id, kind="system", title=x.title, body=x.body))
    audit(db, a.handle, "announcement.broadcast", x.title); db.commit(); return {"id": x.id}
@app.get("/admin/search")
def admin_search(q: str, a: M.User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    like = f"%{q}%"
    return {"users": [user_admin_json(u) for u in db.scalars(select(M.User).where(or_(M.User.handle.ilike(like), M.User.name.ilike(like), M.User.email.ilike(like))).limit(20))],
            "posts": [{"id": p.id, "text": p.text} for p in db.scalars(select(M.Post).where(M.Post.text.ilike(like)).limit(20))],
            "loops": [{"id": l.id, "title": l.title} for l in db.scalars(select(M.Loop).where(M.Loop.title.ilike(like)).limit(20))],
            "audit": [{"id": x.id, "action": x.action, "detail": x.detail} for x in db.scalars(select(M.Audit).where(or_(M.Audit.action.ilike(like), M.Audit.detail.ilike(like))).limit(20))]}
