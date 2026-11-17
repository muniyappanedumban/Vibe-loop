"""Trust & safety, privacy and reliability (P0 steps 2–7):

2. Account deletion with a grace period + purge job; "Your data" export.
3. Age protection: birth date at sign-up, minimum age, teen-safe defaults (hooks used by routes_identity.register).
4. Appeals: bans, removed posts, blocked media and spam restrictions; admin decision queue.
5. Anti-spam: new-account limits, bulk same-text detection, auto-restrict, spam flags + suspicion score for staff.
6. Content scanning: hash blocklist, uploads held until a scanner (Scanner plug) or a moderator clears them.
7. Incident log (auto + manual) for security / safety / outage response.

Every behaviour has an admin switch in User App Settings (privacy.*, safety.*, spam.*).
"""
import hashlib, logging, os, threading, time
from datetime import date
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, func, or_, and_
from sqlalchemy.orm import Session
from .db import get_db, SessionLocal
from . import models as M
from .security import current_user, current_user_any, require, audit
from .ratelimit import client_ip

log = logging.getLogger("vibeloop.trust")
router = APIRouter()
STAFF = require("owner", "admin", "moderator", "support")
HOUR, DAY = 3_600_000, 86_400_000

def ua(db: Session, path: str, user=None):
    from .user_app import setting
    return setting(db, path, user)

def sec_event(db: Session, u: M.User, kind: str, detail: str = "", req: Request | None = None):
    from .routes_security import event
    event(db, u, kind, detail, client_ip(req) if req else "")

def st(u: M.User) -> dict: return dict(u.settings or {})

def incident(db: Session, title: str, severity: str = "medium", kind: str = "auto", detail: str = "", user_id: str | None = None) -> M.Incident:
    i = M.Incident(title=title[:200], severity=severity, kind=kind, detail=detail, user_id=user_id, timeline=[{"at": M.now_ms(), "by": "system", "note": "opened"}])
    db.add(i); log.warning("incident %s [%s] %s", kind, severity, title)
    return i

def notify(uid: str, title: str, body: str, route: str = "AccountStanding"):
    try:
        from .push import queue
        queue(uid, "security", title, body, {"route": route}, force=True)
    except Exception: pass

# =====================================================================
# 2 · deletion + export
# =====================================================================
class DeleteIn(BaseModel): confirm: str = Field(min_length=2, max_length=60)

def deletion_json(u: M.User) -> dict:
    s = st(u); return {"scheduled": bool(s.get("deleteAt")), "deleteAt": s.get("deleteAt"), "requestedAt": s.get("deleteRequestedAt")}

@router.post("/me/delete")
def request_delete(b: DeleteIn, req: Request, u: M.User = Depends(current_user_any), db: Session = Depends(get_db)):
    if not ua(db, "privacy.selfDelete"): raise HTTPException(403, "Account deletion from the app is turned off — contact support")
    if b.confirm.strip().lstrip("@").lower() != u.handle.lstrip("@").lower(): raise HTTPException(400, f"Type your @ID ({u.handle}) to confirm")
    if u.role in ("owner", "admin"): raise HTTPException(409, "Staff accounts are removed by another owner in the admin panel")
    grace = ua(db, "privacy.deletionGraceDays"); now = M.now_ms()
    s = st(u); s.update(deleteRequestedAt=now, deleteAt=now + grace * DAY); u.settings = s
    db.add(M.PrivacyRequest(user_id=u.id, kind="deletion", status="scheduled"))
    sec_event(db, u, "deletion_scheduled", f"in {grace} days", req); audit(db, u.handle, "privacy.self_delete", f"grace={grace}d")
    if grace == 0:
        purge_user(db, u, "self"); db.commit(); return {"deleted": True}
    # sign out every device: coming back and signing in is how you cancel
    for x in db.scalars(select(M.AuthSession).where(M.AuthSession.user_id == u.id, M.AuthSession.revoked_at == None)): x.revoked_at = now  # noqa: E711
    u.token_version = (u.token_version or 0) + 1
    db.commit(); return deletion_json(u)

@router.get("/me/deletion")
def my_deletion(u: M.User = Depends(current_user_any)): return deletion_json(u)

@router.post("/me/deletion/cancel")
def cancel_delete(req: Request, u: M.User = Depends(current_user_any), db: Session = Depends(get_db)):
    s = st(u)
    if not s.get("deleteAt"): return deletion_json(u)
    s.pop("deleteAt", None); s.pop("deleteRequestedAt", None); u.settings = s
    for r in db.scalars(select(M.PrivacyRequest).where(M.PrivacyRequest.user_id == u.id, M.PrivacyRequest.kind == "deletion", M.PrivacyRequest.status == "scheduled")): r.status = "cancelled"
    sec_event(db, u, "deletion_cancelled", "", req); audit(db, u.handle, "privacy.delete_cancel"); db.commit()
    return deletion_json(u)

# Rows that are only about this person and can go entirely. Money records (orders, payouts, txns, subscriptions, store)
# are kept for tax/accounting law but point at the anonymised record. Chat messages stay with the other people in the
# chat (like any messenger) and show "Deleted account".
PURGE_DELETE = [("push_tokens", "user_id"), ("device_keys", "user_id"), ("edges", "user_id"), ("follow_requests", "from_id"), ("follow_requests", "to_id"),
                ("friend_requests", "from_id"), ("friend_requests", "to_id"), ("friends", "user_id"), ("friends", "friend_id"), ("statuses", "user_id"),
                ("post_reactions", "user_id"), ("spark_views", "viewer_id"), ("town_members", "user_id"), ("notices", "user_id"), ("handle_changes", "user_id"),
                ("upload_sessions", "owner_id"), ("message_receipts", "user_id"), ("collections", "owner_id"), ("auth_sessions", "user_id"),
                ("recovery_codes", "user_id"), ("comments", "by"), ("sparks", "author_id"), ("reviews", "author_id")]

def purge_user(db: Session, u: M.User, by: str):
    """Erase personal data now. Idempotent. Content that others may reference is hidden + detached rather than deleted."""
    from sqlalchemy import text
    uid = u.id
    for table, col in PURGE_DELETE:
        sp = db.begin_nested()
        try: db.execute(text(f'DELETE FROM "{table}" WHERE "{col}" = :u'), {"u": uid}); sp.commit()
        except Exception as e: sp.rollback(); log.warning("purge %s.%s kept (%s)", table, col, type(e).__name__)
    for p in db.scalars(select(M.Post).where(M.Post.author_id == uid)): p.hidden = True; p.text = ""; p.media_url = None
    for mf in db.scalars(select(M.MediaFile).where(M.MediaFile.owner_id == uid)):
        pth = os.path.join(_media_dir(), media_name(mf))
        if os.path.isfile(pth):
            try: os.remove(pth)
            except OSError: pass
        mf.scan_status = "blocked"; mf.scan_note = "owner deleted"
    short = uid[-8:]
    u.email = f"deleted+{short}@invalid"; u.handle = f"@deleted_{short}"; u.name = "Deleted account"; u.password_hash = "!deleted"
    for attr in ("bio", "avatar_social", "avatar_chat"):
        if hasattr(u, attr): setattr(u, attr, None if attr.startswith("avatar") else "")
    for attr in ("profile", "social"):
        if hasattr(u, attr): setattr(u, attr, {})
    u.totp_secret = None; u.mfa_required = False; u.suspended = True; u.verified = False
    u.token_version = (u.token_version or 0) + 1; u.settings = {"deletedAt": M.now_ms(), "deletedBy": by}
    for r in db.scalars(select(M.PrivacyRequest).where(M.PrivacyRequest.user_id == uid, M.PrivacyRequest.kind == "deletion", M.PrivacyRequest.status.in_(["scheduled", "pending"]))): r.status = "fulfilled"
    audit(db, by, "privacy.purged", uid)

def _media_dir() -> str:
    from .routes_media import MEDIA_DIR
    return MEDIA_DIR

def purge_due(db: Session) -> int:
    now = M.now_ms(); n = 0
    for u in db.scalars(select(M.User).where(M.User.settings.isnot(None))):
        at = (u.settings or {}).get("deleteAt")
        if at and not (u.settings or {}).get("deletedAt") and at <= now: purge_user(db, u, "system"); n += 1
    db.commit(); return n

def purge_loop(stop: threading.Event, every_sec: int = 3600):
    while not stop.wait(every_sec):
        db = SessionLocal()
        try:
            n = purge_due(db)
            if n: log.warning("erased %d accounts past their deletion date", n)
        except Exception: log.exception("purge loop failed"); db.rollback()
        finally: db.close()

@router.post("/admin/privacy/purge-due")
def admin_purge_due(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    n = purge_due(db); audit(db, a.handle, "privacy.purge_due", str(n)); db.commit(); return {"erased": n}

@router.get("/me/export")
def export_me(req: Request, u: M.User = Depends(current_user_any), db: Session = Depends(get_db)):
    if not ua(db, "privacy.selfExport"): raise HTTPException(403, "Data download is turned off — contact support")
    from .ratelimit import enforce
    enforce("export", u.id, client_ip(req))
    rows = lambda q: db.scalars(q).all()  # noqa: E731
    posts = rows(select(M.Post).where(M.Post.author_id == u.id).order_by(M.Post.at.desc()).limit(5000))
    comments = rows(select(M.Comment).where(M.Comment.by == u.id).limit(5000))
    media = rows(select(M.MediaFile).where(M.MediaFile.owner_id == u.id).limit(5000))
    events = rows(select(M.SecurityEvent).where(M.SecurityEvent.user_id == u.id).order_by(M.SecurityEvent.at.desc()).limit(500))
    sessions = rows(select(M.AuthSession).where(M.AuthSession.user_id == u.id).order_by(M.AuthSession.created_at.desc()).limit(200))
    appeals = rows(select(M.Appeal).where(M.Appeal.user_id == u.id))
    try:
        from .routes_hush_settings import export_all
        chats = export_all(u, db)["conversations"]
    except Exception: chats = []
    settings = {k: v for k, v in st(u).items() if not k.startswith("totp")}
    sec_event(db, u, "data_exported", "", req); audit(db, u.handle, "privacy.export"); db.commit()
    return {"exportedAt": M.now_ms(), "format": "vibeloop-export/1",
            "account": {"id": u.id, "handle": u.handle, "name": u.name, "email": u.email, "role": u.role, "createdAt": u.created_at, "twoFactor": bool(u.totp_secret)},
            "profile": u.profile or {}, "social": getattr(u, "social", None) or {}, "settings": settings,
            "posts": [{"id": p.id, "at": p.at, "kind": p.kind, "text": p.text, "media": p.media_url, "hidden": p.hidden} for p in posts],
            "comments": [{"id": c.id, "post": c.post_id, "text": c.text, "at": c.at} for c in comments],
            "media": [{"id": m.id, "kind": m.kind, "mime": m.mime, "size": m.size, "at": m.at, "status": m.scan_status} for m in media],
            "chats": chats,
            "devices": [{"device": s.device_name, "createdAt": s.created_at, "lastSeen": s.last_seen, "revokedAt": s.revoked_at} for s in sessions],
            "securityEvents": [{"at": e.at, "kind": e.kind, "detail": e.detail} for e in events],
            "appeals": [{"kind": a.kind, "target": a.target, "status": a.status, "at": a.at} for a in appeals]}

# =====================================================================
# 3 · age protection (called from /auth/register)
# =====================================================================
def age_of(birth: str) -> int | None:
    try: y, m, d = (int(x) for x in birth.split("-")); b = date(y, m, d)
    except Exception: return None
    t = date.today()
    if b > t or y < 1900: return None
    return t.year - b.year - ((t.month, t.day) < (b.month, b.day))

def check_age(db: Session, birth: str | None) -> int | None:
    """Raises when the sign-up must be refused. Returns the age (or None when the gate is off and no date given)."""
    if not ua(db, "safety.ageGate"):
        return age_of(birth) if birth else None
    if not birth: raise HTTPException(400, "Add your date of birth")
    age = age_of(birth)
    if age is None: raise HTTPException(400, "Enter a real date of birth (YYYY-MM-DD)")
    if age < (mn := ua(db, "safety.minAge")): raise HTTPException(403, f"You need to be at least {mn} to use VibeLoop")
    return age

def apply_age(db: Session, u: M.User, birth: str | None, age: int | None):
    if age is None: return
    p = dict(u.profile or {}); p["birthDate"] = birth; p["teen"] = age < 18
    if age < 18 and ua(db, "safety.teenDefaults"):
        p["social_private"] = True; p["who_can_message"] = "friends"; p["hidden"] = True  # only exact-@ID search by friends finds them
    u.profile = p

# =====================================================================
# 4 · appeals
# =====================================================================
@router.get("/me/standing")
def my_standing(u: M.User = Depends(current_user_any), db: Session = Depends(get_db)):
    s = st(u); now = M.now_ms()
    removed = db.scalars(select(M.Post).where(M.Post.author_id == u.id, M.Post.hidden == True).order_by(M.Post.at.desc()).limit(50)).all()  # noqa: E712
    blocked = db.scalars(select(M.MediaFile).where(M.MediaFile.owner_id == u.id, M.MediaFile.scan_status.in_(["blocked", "pending"])).order_by(M.MediaFile.at.desc()).limit(50)).all()
    apps = db.scalars(select(M.Appeal).where(M.Appeal.user_id == u.id).order_by(M.Appeal.at.desc()).limit(50)).all()
    return {"suspended": bool(u.suspended), "restrictedUntil": s.get("restrictedUntil") if (s.get("restrictedUntil") or 0) > now else None,
            "appealsOn": bool(ua(db, "safety.appeals")),
            "removedPosts": [{"id": p.id, "text": (p.text or "")[:140], "at": p.at} for p in removed],
            "heldMedia": [{"id": m.id, "kind": m.kind, "status": m.scan_status, "note": m.scan_note, "at": m.at} for m in blocked if m.scan_note != "owner deleted"],
            "appeals": [appeal_json(a) for a in apps]}

def appeal_json(a: M.Appeal, u: M.User | None = None) -> dict:
    d = {"id": a.id, "kind": a.kind, "target": a.target, "reason": a.reason, "status": a.status, "note": a.note, "at": a.at, "decidedAt": a.decided_at}
    if u: d["user"] = {"id": u.id, "handle": u.handle, "name": u.name, "suspended": u.suspended}
    return d

class AppealIn(BaseModel):
    kind: str = Field(pattern=r"^(ban|post|media|restrict)$"); target: str = Field(default="", max_length=80); reason: str = Field(min_length=10, max_length=1000)
@router.post("/appeals")
def create_appeal(b: AppealIn, req: Request, u: M.User = Depends(current_user_any), db: Session = Depends(get_db)):
    if not ua(db, "safety.appeals"): raise HTTPException(403, "Appeals are closed right now")
    from .ratelimit import enforce
    enforce("appeal", u.id, client_ip(req))
    s = st(u); now = M.now_ms(); window = ua(db, "safety.appealWindowDays") * DAY; target = b.target
    if b.kind == "ban":
        if not u.suspended: raise HTTPException(400, "Your account isn't suspended")
        if s.get("suspendedAt") and now - s["suspendedAt"] > window: raise HTTPException(409, "The appeal window for this action has closed")
        target = u.id
    elif b.kind == "restrict":
        if (s.get("restrictedUntil") or 0) <= now: raise HTTPException(400, "Your account isn't restricted")
        target = u.id
    elif b.kind == "post":
        p = db.get(M.Post, target)
        if not p or p.author_id != u.id or not p.hidden: raise HTTPException(404, "No removed post with that id")
    else:
        m = db.get(M.MediaFile, target)
        if not m or m.owner_id != u.id or m.scan_status == "clean": raise HTTPException(404, "No held or blocked file with that id")
    if db.scalar(select(M.Appeal).where(M.Appeal.user_id == u.id, M.Appeal.kind == b.kind, M.Appeal.target == target, M.Appeal.status == "open")):
        raise HTTPException(409, "You already have an open appeal for this")
    a = M.Appeal(user_id=u.id, kind=b.kind, target=target, reason=b.reason.strip()); db.add(a)
    sec_event(db, u, "appeal_sent", b.kind, req); audit(db, u.handle, "appeal.create", f"{b.kind} {target}"); db.commit()
    return appeal_json(a)

@router.get("/admin/appeals")
def admin_appeals(status: str = "open", a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    q = select(M.Appeal, M.User).join(M.User, M.User.id == M.Appeal.user_id).order_by(M.Appeal.at.asc() if status == "open" else M.Appeal.at.desc()).limit(200)
    if status != "all": q = q.where(M.Appeal.status == status)
    out = []
    for ap, usr in db.execute(q).all():
        d = appeal_json(ap, usr)
        if ap.kind == "post" and (p := db.get(M.Post, ap.target)): d["content"] = {"text": p.text, "media": p.media_url}
        if ap.kind == "media" and (m := db.get(M.MediaFile, ap.target)): d["content"] = {"mediaId": m.id, "kind": m.kind, "status": m.scan_status, "note": m.scan_note}
        out.append(d)
    return out

class DecideIn(BaseModel): decision: str = Field(pattern=r"^(uphold|reverse)$"); note: str = Field(default="", max_length=500)
@router.post("/admin/appeals/{aid}/decide")
def decide_appeal(aid: str, b: DecideIn, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    ap = db.get(M.Appeal, aid)
    if not ap: raise HTTPException(404, "No such appeal")
    if ap.status != "open": raise HTTPException(409, "Already decided")
    u = db.get(M.User, ap.user_id)
    if b.decision == "reverse":
        if ap.kind == "ban": u.suspended = False
        elif ap.kind == "restrict": s = st(u); s.pop("restrictedUntil", None); u.settings = s
        elif ap.kind == "post" and (p := db.get(M.Post, ap.target)): p.hidden = False
        elif ap.kind == "media" and (m := db.get(M.MediaFile, ap.target)): m.scan_status = "clean"; m.scan_note = f"cleared on appeal by {a.handle}"
    ap.status = "reversed" if b.decision == "reverse" else "upheld"; ap.note = b.note.strip(); ap.decided_by = a.handle; ap.decided_at = M.now_ms()
    sec_event(db, u, "appeal_decided", ap.status); audit(db, a.handle, f"appeal.{ap.status}", f"{ap.id} {ap.kind} {ap.target}"); db.commit()
    notify(u.id, "Your appeal was reviewed", "We reversed our decision." if ap.status == "reversed" else "We kept our decision. Open VibeLoop for details.")
    return appeal_json(ap, u)

# =====================================================================
# 5 · anti-spam
# =====================================================================
def restricted(u: M.User) -> int | None:
    t = (u.settings or {}).get("restrictedUntil") or 0
    return t if t > M.now_ms() else None

def assert_not_restricted(u: M.User):
    if t := restricted(u):
        mins = max(1, (t - M.now_ms()) // 60_000)
        raise HTTPException(403, f"Your account is limited for {mins} more minutes because of unusual activity. You can appeal from Account standing.")

def flag(db: Session, u: M.User, kind: str, detail: str, restrict_hours: int = 24):
    db.add(M.SpamFlag(user_id=u.id, kind=kind, detail=detail[:300]))
    if ua(db, "spam.autoRestrict") and not restricted(u):
        s = st(u); s["restrictedUntil"] = M.now_ms() + restrict_hours * HOUR; u.settings = s
        from .routes_security import event
        event(db, u, "restricted", kind)
    audit(db, "system", f"spam.{kind}", f"{u.handle} {detail[:120]}")

def check_message(db: Session, u: M.User, c: M.Conv, text: str):
    """Called before a chat message is stored. Raises 403/429; may add a spam flag + restriction (committed even on refusal)."""
    if u.role in ("owner", "admin", "moderator", "support"): return
    assert_not_restricted(u)
    now = M.now_ms()
    new_h = ua(db, "spam.newAccountHours")
    if new_h and now - (u.created_at or now) < new_h * HOUR and not c.group:
        others = [i for i in c.members if i != u.id]
        from .v2common import are_friends
        first_here = not db.scalar(select(M.ChatMsg.id).where(M.ChatMsg.conv_id == c.id, M.ChatMsg.sender == u.id).limit(1))
        if first_here and others and not are_friends(db, u.id, others[0]):
            started = db.scalar(select(func.count(func.distinct(M.ChatMsg.conv_id))).where(M.ChatMsg.sender == u.id, M.ChatMsg.at > now - HOUR))
            if started >= ua(db, "spam.newAccountDmPerHour"):
                db.add(M.SpamFlag(user_id=u.id, kind="new_account_burst", detail=f"{started} new chats in 1 h")); db.commit()
                raise HTTPException(429, "New accounts can start only a few chats per hour — try again later")
    n = ua(db, "spam.bulkSameText"); t = (text or "").strip()
    if n and len(t) >= 8:
        same = db.scalar(select(func.count(func.distinct(M.ChatMsg.conv_id))).where(M.ChatMsg.sender == u.id, M.ChatMsg.text == t, M.ChatMsg.at > now - 10 * 60_000, M.ChatMsg.conv_id != c.id))
        if same + 1 >= n:
            flag(db, u, "bulk_same_text", f"same text to {same + 1} chats in 10 min: {t[:80]}")
            if (same + 1) >= n * 3: incident(db, f"Mass messaging by {u.handle}", "medium", "spam", t[:200], u.id)
            db.commit()
            if restricted(u): assert_not_restricted(u)

def suspicion(db: Session, u: M.User) -> tuple[int, list[str]]:
    now = M.now_ms(); score, why = 0, []
    age_h = (now - (u.created_at or now)) / HOUR
    if age_h < 24: score += 25; why.append("account < 1 day old")
    elif age_h < 24 * 7: score += 10; why.append("account < 1 week old")
    if not u.verified: score += 15; why.append("email not verified")
    if not (getattr(u, "avatar_social", None) or getattr(u, "avatar_chat", None)): score += 5; why.append("no avatar")
    flags = db.scalar(select(func.count()).select_from(M.SpamFlag).where(M.SpamFlag.user_id == u.id, M.SpamFlag.status != "cleared")) or 0
    if flags: score += min(40, 20 * flags); why.append(f"{flags} spam flag(s)")
    reports = db.scalar(select(func.count()).select_from(M.Report).where(M.Report.target == u.id)) or 0
    if reports: score += min(30, 10 * reports); why.append(f"{reports} report(s)")
    sent = db.scalar(select(func.count()).select_from(M.ChatMsg).where(M.ChatMsg.sender == u.id, M.ChatMsg.at > now - DAY)) or 0
    if sent > 300: score += 20; why.append(f"{sent} messages in 24 h")
    return min(100, score), why

@router.get("/admin/spam")
def admin_spam(status: str = "open", a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    q = select(M.SpamFlag, M.User).join(M.User, M.User.id == M.SpamFlag.user_id).order_by(M.SpamFlag.at.desc()).limit(200)
    if status != "all": q = q.where(M.SpamFlag.status == status)
    flags = []
    for f, usr in db.execute(q).all():
        sc, why = suspicion(db, usr)
        flags.append({"id": f.id, "kind": f.kind, "detail": f.detail, "status": f.status, "at": f.at,
                      "user": {"id": usr.id, "handle": usr.handle, "name": usr.name, "suspended": usr.suspended, "restrictedUntil": restricted(usr), "score": sc, "why": why}})
    recent = db.scalars(select(M.User).where(M.User.created_at > M.now_ms() - 7 * DAY, M.User.suspended == False).order_by(M.User.created_at.desc()).limit(200)).all()  # noqa: E712
    watch = sorted(({"id": x.id, "handle": x.handle, "name": x.name, "score": s, "why": w} for x in recent for s, w in [suspicion(db, x)] if s >= 40), key=lambda r: -r["score"])[:50]
    return {"flags": flags, "watchlist": watch}

class SpamActIn(BaseModel): action: str = Field(pattern=r"^(clear|restrict|unrestrict|suspend)$")
@router.post("/admin/spam/{fid}")
def admin_spam_act(fid: int, b: SpamActIn, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    f = db.get(M.SpamFlag, fid)
    if not f: raise HTTPException(404, "No such flag")
    u = db.get(M.User, f.user_id); s = st(u)
    if b.action == "clear": f.status = "cleared"; s.pop("restrictedUntil", None)
    elif b.action == "unrestrict": s.pop("restrictedUntil", None); f.status = "cleared"
    elif b.action == "restrict": s["restrictedUntil"] = M.now_ms() + 7 * DAY; f.status = "actioned"
    else: u.suspended = True; s["suspendedAt"] = M.now_ms(); f.status = "actioned"; u.token_version = (u.token_version or 0) + 1
    u.settings = s; audit(db, a.handle, f"spam.{b.action}", f"{u.handle} flag={fid}"); db.commit()
    return {"ok": True, "status": f.status}

# =====================================================================
# 6 · content scanning
# =====================================================================
def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for blk in iter(lambda: f.read(1 << 20), b""): h.update(blk)
    return h.hexdigest()

def on_new_media(db: Session, mf: M.MediaFile, path: str, u: M.User):
    """Called right after a file is stored, before commit. Refuses blocklisted files; holds others when scanning is on."""
    mf.sha256 = sha256_file(path)
    if ua(db, "safety.hashBlocklist") and (bh := db.get(M.BlockedHash, mf.sha256)):
        try: os.remove(path)
        except OSError: pass
        db.rollback()
        db.add(M.SpamFlag(user_id=u.id, kind="blocked_hash", detail=f"{bh.label or 'blocklisted file'} {mf.sha256[:16]}"))
        incident(db, f"Blocklisted file upload attempt by {u.handle}", "critical", "blocked_hash", f"sha256={mf.sha256} label={bh.label}", u.id)
        audit(db, "system", "media.blocked_hash", f"{u.handle} {mf.sha256}"); db.commit()
        raise HTTPException(451, "This file can't be uploaded")
    if ua(db, "safety.scanUploads"):
        mf.scan_status = "pending"; mf.scan_note = "waiting for safety check"
        threading.Thread(target=_scan_async, args=(mf.id,), daemon=True).start()

def _scan_async(mid: str):
    time.sleep(0.5)  # let the request commit the row first
    db = SessionLocal()
    try: scan_media(db, mid)
    except Exception: log.exception("scan failed for %s", mid)
    finally: db.close()

def scan_media(db: Session, mid: str) -> str | None:
    """Ask the Scanner plug. Contract: POST {mediaId, kind, mime, sha256, url} → {"verdict": "clean"|"block"|"review", "labels": [...]}."""
    from .routes_integrations import get_config
    cfg = get_config(db, "scanner"); mf = db.get(M.MediaFile, mid)
    if not mf or mf.scan_status != "pending" or not cfg or not cfg.get("enabled"): return None
    from .routes_media import _media_sig
    exp = int(time.time()) + 600; name = media_name(mf)
    body = {"mediaId": mf.id, "kind": mf.kind, "mime": mf.mime, "sha256": mf.sha256, "url": f"/media/{name}?exp={exp}&sig={_media_sig(name, exp)}"}
    hdr = {"Authorization": f"Bearer {cfg['apiKey']}"} if cfg.get("apiKey") else {}
    try: r = httpx.post(cfg["url"], json=body, headers=hdr, timeout=20); data = r.json() if r.status_code < 400 else {}
    except Exception as e: log.warning("scanner unreachable: %s", type(e).__name__); return None  # stays pending → manual queue
    v = data.get("verdict"); labels = ",".join(map(str, data.get("labels") or []))[:150]
    if v == "clean": mf.scan_status, mf.scan_note = "clean", "scanner: clean"
    elif v == "block":
        mf.scan_status, mf.scan_note = "blocked", f"scanner: {labels or 'blocked'}"
        u = db.get(M.User, mf.owner_id)
        if u: db.add(M.SpamFlag(user_id=u.id, kind="scanner_block", detail=labels or mf.id))
        if any(k in labels.lower() for k in ("csam", "child")):
            incident(db, f"Scanner flagged child-safety content from {u.handle if u else mf.owner_id}", "critical", "csam", f"media={mf.id} labels={labels}", mf.owner_id)
            if mf.sha256 and not db.get(M.BlockedHash, mf.sha256): db.add(M.BlockedHash(sha256=mf.sha256, label="scanner: " + labels, added_by="system"))
    else: mf.scan_note = f"needs review {labels}".strip()
    audit(db, "system", "media.scan", f"{mf.id} {mf.scan_status} {labels}"); db.commit()
    return mf.scan_status

def media_name(mf: M.MediaFile) -> str:
    """Stored file name (<id>.<ext>) — the extension comes from the upload, so look it up on disk."""
    import glob
    hits = glob.glob(os.path.join(_media_dir(), glob.escape(mf.id) + ".*"))
    return os.path.basename(hits[0]) if hits else f"{mf.id}.bin"

def can_view_held(db: Session, m: M.MediaFile, authorization: str) -> bool:
    if m.scan_status == "clean": return True
    if not authorization.startswith("Bearer "): return False
    try:
        from .security import decode_access
        data = decode_access(authorization[7:]); viewer = db.get(M.User, str(data["sub"]))
    except Exception: return False
    return bool(viewer) and (viewer.role in ("owner", "admin", "moderator", "support") or (viewer.id == m.owner_id and m.scan_status == "pending"))

@router.get("/admin/scan-queue")
def scan_queue(status: str = "pending", a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    q = select(M.MediaFile, M.User.handle).join(M.User, M.User.id == M.MediaFile.owner_id).order_by(M.MediaFile.at.desc()).limit(200)
    q = q.where(M.MediaFile.scan_status == status) if status != "all" else q.where(M.MediaFile.scan_status != "clean")
    return [{"id": m.id, "owner": h, "kind": m.kind, "mime": m.mime, "size": m.size, "status": m.scan_status, "note": m.scan_note, "sha256": m.sha256, "at": m.at,
             "url": "/media/" + media_name(m)} for m, h in db.execute(q).all()]

class ScanIn(BaseModel): verdict: str = Field(pattern=r"^(clean|blocked)$"); addToBlocklist: bool = False; label: str = Field(default="", max_length=120)
@router.post("/admin/media/{mid}/scan")
def admin_scan(mid: str, b: ScanIn, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    m = db.get(M.MediaFile, mid)
    if not m: raise HTTPException(404, "No such file")
    m.scan_status = b.verdict; m.scan_note = f"{'cleared' if b.verdict == 'clean' else 'blocked'} by {a.handle}" + (f": {b.label}" if b.label else "")
    if b.verdict == "blocked":
        for p in db.scalars(select(M.Post).where(M.Post.media_url.like(f"/media/{m.id}.%"))): p.hidden = True
        if b.addToBlocklist and m.sha256 and not db.get(M.BlockedHash, m.sha256): db.add(M.BlockedHash(sha256=m.sha256, label=b.label or "moderator block", added_by=a.handle))
        notify(m.owner_id, "A file you uploaded was removed", "It broke the House Rules. You can appeal from Account standing.")
    audit(db, a.handle, f"media.{b.verdict}", m.id); db.commit()
    return {"id": m.id, "status": m.scan_status}

@router.post("/admin/media/{mid}/rescan")
def admin_rescan(mid: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    m = db.get(M.MediaFile, mid)
    if not m: raise HTTPException(404, "No such file")
    m.scan_status = "pending"; db.commit()
    res = scan_media(db, mid)
    return {"id": mid, "status": res or "pending", "scanner": res is not None}

class HashIn(BaseModel): sha256: str = Field(pattern=r"^[0-9a-fA-F]{64}$"); label: str = Field(default="", max_length=120)
@router.get("/admin/hash-blocklist")
def hash_list(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    return [{"sha256": h.sha256, "label": h.label, "addedBy": h.added_by, "at": h.at} for h in db.scalars(select(M.BlockedHash).order_by(M.BlockedHash.at.desc()).limit(1000))]
@router.post("/admin/hash-blocklist")
def hash_add(b: HashIn, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    h = b.sha256.lower()
    if not db.get(M.BlockedHash, h): db.add(M.BlockedHash(sha256=h, label=b.label, added_by=a.handle))
    n = 0
    for m in db.scalars(select(M.MediaFile).where(M.MediaFile.sha256 == h)): m.scan_status = "blocked"; m.scan_note = "on hash blocklist"; n += 1
    audit(db, a.handle, "media.hash_add", f"{h} {b.label}"); db.commit(); return {"ok": True, "matchedExisting": n}
@router.delete("/admin/hash-blocklist/{h}")
def hash_del(h: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    if r := db.get(M.BlockedHash, h.lower()): db.delete(r)
    audit(db, a.handle, "media.hash_remove", h); db.commit(); return {"ok": True}

# =====================================================================
# 7 · incidents
# =====================================================================
def incident_json(i: M.Incident) -> dict:
    return {"id": i.id, "severity": i.severity, "kind": i.kind, "title": i.title, "detail": i.detail, "status": i.status, "userId": i.user_id,
            "timeline": i.timeline or [], "at": i.at, "resolvedAt": i.resolved_at}

@router.get("/admin/incidents")
def list_incidents(status: str = "active", a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    q = select(M.Incident).order_by(M.Incident.at.desc()).limit(200)
    if status == "active": q = q.where(M.Incident.status != "resolved")
    elif status != "all": q = q.where(M.Incident.status == status)
    return [incident_json(i) for i in db.scalars(q)]

class IncidentIn(BaseModel):
    title: str = Field(min_length=3, max_length=200); severity: str = Field(default="medium", pattern=r"^(low|medium|high|critical)$")
    kind: str = Field(default="manual", max_length=30); detail: str = Field(default="", max_length=5000)
@router.post("/admin/incidents")
def open_incident(b: IncidentIn, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    i = M.Incident(title=b.title, severity=b.severity, kind=b.kind, detail=b.detail, timeline=[{"at": M.now_ms(), "by": a.handle, "note": "opened"}])
    db.add(i); audit(db, a.handle, "incident.open", f"{b.severity} {b.title}"); db.commit(); return incident_json(i)

class IncidentPatch(BaseModel):
    status: str | None = Field(default=None, pattern=r"^(open|investigating|resolved)$"); severity: str | None = Field(default=None, pattern=r"^(low|medium|high|critical)$")
    note: str = Field(default="", max_length=2000)
@router.patch("/admin/incidents/{iid}")
def update_incident(iid: str, b: IncidentPatch, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    i = db.get(M.Incident, iid)
    if not i: raise HTTPException(404, "No such incident")
    parts = []
    if b.status and b.status != i.status: parts.append(f"status → {b.status}"); i.status = b.status; i.resolved_at = M.now_ms() if b.status == "resolved" else None
    if b.severity and b.severity != i.severity: parts.append(f"severity → {b.severity}"); i.severity = b.severity
    if b.note.strip(): parts.append(b.note.strip())
    if not parts: raise HTTPException(400, "Nothing to update")
    i.timeline = [*(i.timeline or []), {"at": M.now_ms(), "by": a.handle, "note": " · ".join(parts)}]
    audit(db, a.handle, "incident.update", f"{iid} {' · '.join(parts)[:150]}"); db.commit(); return incident_json(i)
