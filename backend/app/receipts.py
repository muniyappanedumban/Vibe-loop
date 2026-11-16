"""v6 delivered/read receipts (message_receipts). Reciprocal: users with chat_read_receipts off neither send nor see "read"."""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from . import models as M
from .v2common import prof

def receipts_on(u: M.User) -> bool: return bool(prof(u)["chat_read_receipts"])

def mark(db: Session, u: M.User, conv_id: str, up_to: str, kind: str) -> int:
    """Mark every message from others up to `up_to` delivered (or read). Returns the timestamp; publishes one receipt event per sender."""
    from .realtime import feature, publish
    if not feature(db, u, "readReceipts"): raise HTTPException(403, "Not enabled")
    c = db.get(M.Conv, conv_id)
    if not c or u.id not in c.members: raise HTTPException(404, "Conversation not found")
    m = db.get(M.ChatMsg, up_to)
    if not m or m.conv_id != c.id: raise HTTPException(400, "upTo must be a message in this chat")
    now = M.now_ms()
    if kind == "read":
        from .routes_chat import set_state, my_state
        set_state(c, u.id, lastRead=max(now, my_state(c, u.id).get("lastRead", 0)))
    record_read = kind == "read" and receipts_on(u)
    rows = db.scalars(select(M.ChatMsg).where(M.ChatMsg.conv_id == c.id, M.ChatMsg.sender != u.id, M.ChatMsg.at <= m.at, M.ChatMsg.at <= now).order_by(M.ChatMsg.at, M.ChatMsg.id)).all()
    existing = {r.message_id: r for r in db.scalars(select(M.MessageReceipt).where(M.MessageReceipt.user_id == u.id, M.MessageReceipt.message_id.in_([x.id for x in rows])))} if rows else {}
    senders: dict[str, str] = {}
    for x in rows:
        r = existing.get(x.id)
        if not r: r = M.MessageReceipt(message_id=x.id, user_id=u.id); db.add(r)
        changed = False
        if not r.delivered_at: r.delivered_at = now; changed = True
        if record_read and not r.read_at: r.read_at = now; changed = True
        if changed: senders[x.sender] = x.id
    db.commit()
    if kind == "read" and not record_read: kind = "delivered"
    for s, mid in senders.items():
        publish([s], {"type": "receipt", "convId": c.id, "messageId": mid, "userId": u.id, "kind": kind, "at": now})
    return now

def mark_delivered_ids(db: Session, u: M.User, msgs: list[M.ChatMsg]):
    """Recipient fetched these messages → delivered (no commit; caller commits). Returns {sender: last message id}."""
    others = [m for m in msgs if m.sender != u.id]
    if not others: return {}
    have = set(db.scalars(select(M.MessageReceipt.message_id).where(M.MessageReceipt.user_id == u.id, M.MessageReceipt.message_id.in_([m.id for m in others]))))
    now = M.now_ms(); out = {}
    for m in others:
        if m.id not in have: db.add(M.MessageReceipt(message_id=m.id, user_id=u.id, delivered_at=now)); out[m.sender] = m.id
    return out

def statuses(db: Session, msgs: list[M.ChatMsg], me: M.User, c: M.Conv) -> dict:
    """{message id: sent|delivered|read} for my messages."""
    mine = [m for m in msgs if m.sender == me.id]
    if not mine: return {}
    others = [i for i in c.members if i != me.id]
    if not others: return {m.id: "sent" for m in mine}
    users = {x.id: x for x in db.scalars(select(M.User).where(M.User.id.in_(others)))}
    see_read = receipts_on(me)
    rows = db.scalars(select(M.MessageReceipt).where(M.MessageReceipt.message_id.in_([m.id for m in mine]), M.MessageReceipt.user_id.in_(others))).all()
    by: dict[str, dict] = {}
    for r in rows: by.setdefault(r.message_id, {})[r.user_id] = r
    out = {}
    for m in mine:
        rs = by.get(m.id, {})
        delivered = all(o in rs and rs[o].delivered_at for o in others)
        read = see_read and all(o in rs and rs[o].read_at and users.get(o) and receipts_on(users[o]) for o in others)
        out[m.id] = "read" if read else ("delivered" if delivered else "sent")
    return out
