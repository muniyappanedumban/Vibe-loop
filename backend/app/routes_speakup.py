"""v5 Speak Up: reports & support tickets. Feature `speakUp` (403 when off).
self_harm or urgent=true → priority "urgent" and the response carries SOS Lane info. Staff actions are audited and the reporter gets a notice."""
import secrets
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .db import get_db
from . import models as M
from .security import current_user, require, audit
from .ratelimit import write_limit
from . import config_resolver as R

router = APIRouter()
STAFF = require("owner")
CATEGORIES = ("harassment", "violation", "complaint", "collab_dispute", "scam", "impersonation", "self_harm", "other")
TARGETS = ("user", "post", "message", "product", "hood", "none")
STATUSES = ("open", "reviewing", "actioned", "closed")
HIGH = {"harassment", "scam", "impersonation"}
PRIORITY_RANK = {"urgent": 0, "high": 1, "normal": 2}
DAILY_CAP = 20
SOS = {"page": "sos-lane", "title": "SOS Lane", "message": "If you're in danger right now, call 112. You're not alone — our team reads urgent reports first.",
       "lines": [{"label": "Emergency (India)", "value": "112", "type": "phone"}, {"label": "Cyber crime helpline", "value": "1930", "type": "phone"},
                 {"label": "Women helpline", "value": "181", "type": "phone"}]}

def gate(db: Session, u: M.User | None):
    if not R.resolve(db, u)["features"].get("speakUp", True): raise HTTPException(403, "Not enabled")

def new_code(db: Session) -> str:
    while True:
        c = "SU-" + "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(5))
        if not db.scalar(select(M.Ticket.id).where(M.Ticket.code == c)): return c

def ticket_json(db: Session, t: M.Ticket, admin: bool = False) -> dict:
    d = {"id": t.id, "ticket": t.code, "category": t.category, "targetType": t.target_type, "targetId": t.target_id, "details": t.details,
         "evidence": t.evidence or [], "priority": t.priority, "status": t.status, "at": t.at, "updatedAt": t.updated_at,
         "updates": [{"at": h["at"], "status": h.get("status"), "message": h.get("public")} for h in (t.history or []) if h.get("public")]}
    if admin:
        r = db.get(M.User, t.reporter_id)
        d["reporter"] = {"id": r.id, "handle": r.handle, "name": r.name} if r else None
        d["history"] = t.history or []; d["target"] = target_info(db, t)
    return d

def target_info(db: Session, t: M.Ticket) -> dict | None:
    """Who/what the ticket points at, plus the user an action would hit."""
    if not t.target_id or t.target_type == "none": return None
    ty, tid = t.target_type, t.target_id
    if ty == "user":
        u = db.get(M.User, tid) or db.scalar(select(M.User).where(M.User.handle == "@" + tid.lstrip("@").lower()))
        return {"label": u.handle, "userId": u.id, "suspended": u.suspended} if u else None
    if ty == "post":
        p = db.get(M.Post, tid); return {"label": p.text[:80], "userId": p.author_id, "hidden": p.hidden} if p else None
    if ty == "message":
        m = db.get(M.ChatMsg, tid); return {"label": m.text[:80], "userId": m.sender, "deleted": m.deleted} if m else None
    if ty == "product":
        p = db.get(M.Product, tid); return {"label": p.title, "userId": p.creator_id, "active": p.active} if p else None
    if ty == "hood":
        h = db.get(M.Town, tid); return {"label": h.name, "userId": h.owner_id, "suspended": h.suspended} if h else None
    return None

class SpeakUpIn(BaseModel):
    category: Literal[CATEGORIES]; targetType: Literal[TARGETS] = "none"  # type: ignore[valid-type]
    targetId: str | None = Field(default=None, max_length=60); details: str = Field(min_length=1, max_length=2000)
    evidence: list[str] = Field(default_factory=list, max_length=10); urgent: bool = False

@router.post("/speakup")
def speak_up(b: SpeakUpIn, u: M.User = Depends(write_limit("report")), db: Session = Depends(get_db)):
    gate(db, u)
    import re
    if any(not re.match(r"^(/media/[\w.-]+|https://\S{1,290})$", e) for e in b.evidence): raise HTTPException(400, "Evidence must be uploaded media (/media/…) or https links")
    if b.targetType != "none" and not b.targetId: raise HTTPException(400, "targetId is required for this target type")
    if b.targetType == "message":  # IDOR: you can only report messages from conversations you're in (else staff would see others' private chats)
        m = db.get(M.ChatMsg, b.targetId); c = db.get(M.Conv, m.conv_id) if m else None
        if not c or u.id not in (c.members or []): raise HTTPException(404, "Message not found")
    urgent = b.urgent or b.category == "self_harm"
    if not urgent and (db.scalar(select(func.count()).select_from(M.Ticket).where(M.Ticket.reporter_id == u.id, M.Ticket.at > M.now_ms() - 86_400_000)) or 0) >= DAILY_CAP:
        raise HTTPException(429, "That's a lot of reports today — our team is on it. Try again tomorrow.")
    pr = "urgent" if urgent else "high" if b.category in HIGH else "normal"
    now = M.now_ms()
    t = M.Ticket(code=new_code(db), reporter_id=u.id, category=b.category, target_type=b.targetType, target_id=b.targetId if b.targetType != "none" else None,
                 details=b.details.strip(), evidence=b.evidence, priority=pr, status="open", at=now, updated_at=now,
                 history=[{"at": now, "by": u.handle, "status": "open", "public": "We got it. Your ticket is in the queue."}])
    db.add(t); db.flush(); audit(db, u.handle, "speakup.create", f"{t.code} {b.category} {pr} {b.targetType}:{b.targetId or '-'}"); db.commit()
    out = {"id": t.id, "ticket": t.code, "status": t.status, "priority": pr}
    if urgent: out["sos"] = SOS
    return out

@router.get("/speakup/mine")
def mine(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    gate(db, u)
    return [ticket_json(db, t) for t in db.scalars(select(M.Ticket).where(M.Ticket.reporter_id == u.id).order_by(M.Ticket.at.desc()).limit(100))]

# ---------- admin ----------
@router.get("/admin/speakup")
def admin_list(status: Literal[STATUSES] | None = None, category: Literal[CATEGORIES] | None = None, priority: Literal["urgent", "high", "normal"] | None = None,  # type: ignore[valid-type]
               a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    q = select(M.Ticket).order_by(M.Ticket.at.desc()).limit(100)
    if status: q = q.where(M.Ticket.status == status)
    if category: q = q.where(M.Ticket.category == category)
    if priority: q = q.where(M.Ticket.priority == priority)
    rows = sorted(db.scalars(q), key=lambda t: (t.status in ("actioned", "closed"), PRIORITY_RANK.get(t.priority, 3), -t.at))
    counts = dict(db.execute(select(M.Ticket.status, func.count()).group_by(M.Ticket.status)).all())
    urgent_open = db.scalar(select(func.count()).select_from(M.Ticket).where(M.Ticket.priority == "urgent", M.Ticket.status.in_(("open", "reviewing")))) or 0
    return {"items": [ticket_json(db, t, True) for t in rows], "counts": {s: counts.get(s, 0) for s in STATUSES}, "urgentOpen": urgent_open}

@router.get("/admin/speakup/{tid}")
def admin_get(tid: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    t = db.get(M.Ticket, tid)
    if not t: raise HTTPException(404, "Ticket not found")
    return ticket_json(db, t, True)

class TicketPatch(BaseModel):
    status: Literal[STATUSES] | None = None; note: str = Field(default="", max_length=1000)  # type: ignore[valid-type]
    action: Literal["warn", "remove_content", "suspend_user"] | None = None; message: str = Field(default="", max_length=300)  # message → reporter (optional)

def do_action(db: Session, a: M.User, t: M.Ticket, action: str) -> str:
    info = target_info(db, t)
    if not info: raise HTTPException(400, "This ticket has no actionable target")
    uid = info["userId"]
    if action == "warn":
        db.add(M.Notice(user_id=uid, kind="system", title="A heads-up from the VibeLoop team",
                        body="Something you shared was reported and goes against House Rules. Please give them a read — repeat issues can lead to a suspension.", route="Page", params={"slug": "house-rules"}))
        return f"warned {uid}"
    if action == "remove_content":
        ty, tid = t.target_type, t.target_id
        if ty == "post": db.get(M.Post, tid).hidden = True
        elif ty == "message": m = db.get(M.ChatMsg, tid); m.deleted, m.text = True, ""
        elif ty == "product": db.get(M.Product, tid).active = False
        elif ty == "hood": db.get(M.Town, tid).suspended = True
        else: raise HTTPException(400, "remove_content needs a post, message, product or hood target")
        return f"removed {ty}:{tid}"
    u = db.get(M.User, uid)
    if not u: raise HTTPException(404, "User not found")
    if u.role == "owner": raise HTTPException(400, "Staff accounts can't be suspended from Speak Up")
    u.suspended = True; u.token_version = (u.token_version or 0) + 1
    return f"suspended {u.handle}"

@router.patch("/admin/speakup/{tid}")
def admin_patch(tid: str, b: TicketPatch, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    t = db.get(M.Ticket, tid)
    if not t: raise HTTPException(404, "Ticket not found")
    if not (b.status or b.note.strip() or b.action): raise HTTPException(400, "Nothing to change")
    did = do_action(db, a, t, b.action) if b.action else None
    if did and not b.status: b.status = "actioned"
    now = M.now_ms()
    public = b.message.strip() or ({"reviewing": "A real human is looking at your report now.", "actioned": "We took action on your report. Thanks for speaking up.",
                                    "closed": "Your ticket is closed. If it's still happening, open a new one anytime.", "open": "Your ticket was reopened."}.get(b.status or "") if b.status and b.status != t.status else None)
    t.history = [*(t.history or []), {"at": now, "by": a.handle, "status": b.status, "note": b.note.strip() or None, "action": b.action, "result": did, "public": public}]
    if b.status: t.status = b.status
    t.updated_at = now
    if public:
        db.add(M.Notice(user_id=t.reporter_id, kind="system", title=f"Speak Up {t.code}: {t.status}", body=public, route="SpeakUp", params={"id": t.id}))
    audit(db, a.handle, "speakup.update", f"{t.code} status={t.status}" + (f" action={b.action} ({did})" if did else "") + (" +note" if b.note.strip() else "")); db.commit()
    return ticket_json(db, t, True)
