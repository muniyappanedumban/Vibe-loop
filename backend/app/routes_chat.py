"""v2 chat module: conversations, messages, search, bridge, vibes (status), towns."""
import hmac, secrets
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .db import get_db
from . import models as M
from .security import current_user, audit
from .v2common import user_json, are_friends, blocked_between, can_message, chat_notice, prof, DAY

router = APIRouter()
EDIT_WINDOW = 15 * 60_000
UNDO_WINDOW = 60 * 60_000
FOLDERS = ("friends", "family", "work", "groups")
FADES = (None, 3600, 86400, 604800)

def me_id(uid: str, me: M.User) -> str: return "me" if uid == me.id else uid

# ---------- conversations ----------
def get_conv(db: Session, cid: str, u: M.User) -> M.Conv:
    c = db.get(M.Conv, cid)
    if not c or u.id not in c.members: raise HTTPException(404, "Conversation not found")
    return c

def my_state(c: M.Conv, uid: str) -> dict: return dict((c.state or {}).get(uid) or {})

def set_state(c: M.Conv, uid: str, **kv):
    st = {k: dict(v) for k, v in (c.state or {}).items()}; st[uid] = {**st.get(uid, {}), **kv}; c.state = st

def visible(m: M.ChatMsg, me: M.User, now: int) -> bool:
    if m.expires_at and m.expires_at <= now: return False
    if m.send_at and m.send_at > now and m.sender != me.id: return False
    return True

def conv_msgs(db: Session, c: M.Conv, me: M.User) -> list[M.ChatMsg]:
    now = M.now_ms()
    return [m for m in db.scalars(select(M.ChatMsg).where(M.ChatMsg.conv_id == c.id).order_by(M.ChatMsg.at, M.ChatMsg.id)) if visible(m, me, now)]

def unread_count(db: Session, c: M.Conv, me: M.User) -> int:
    lr = my_state(c, me.id).get("lastRead", 0); now = M.now_ms()
    q = select(M.ChatMsg).where(M.ChatMsg.conv_id == c.id, M.ChatMsg.sender != me.id, M.ChatMsg.at > lr, M.ChatMsg.deleted == False)  # noqa: E712
    return sum(1 for m in db.scalars(q) if visible(m, me, now) and m.at <= now)

def msg_json(db: Session, m: M.ChatMsg, me: M.User) -> dict:
    rep = None
    if m.reply_to and (r := db.get(M.ChatMsg, m.reply_to)):
        rep = {"id": r.id, "text": "" if r.deleted or r.kind == "viewonce" else r.text[:200], "from": me_id(r.sender, me)}
    poll = None
    if m.poll and not m.deleted:
        voters = m.poll.get("voters", {})
        poll = {"q": m.poll["q"], "options": [{"text": o["text"], "votes": o["votes"]} for o in m.poll["options"]], "myVote": voters.get(me.id)}
    mine = m.sender == me.id
    opened = (len(m.opened_by) > 0) if mine else (me.id in (m.opened_by or []))
    text = "" if m.deleted or (m.kind == "viewonce" and not mine) else m.text
    return {"id": m.id, "convId": m.conv_id, "from": me_id(m.sender, me), "kind": m.kind, "text": text, "replyTo": rep,
            "reactions": [{"moji": r["moji"], "by": me_id(r["by"], me)} for r in (m.reactions or [])], "starred": me.id in (m.starred_by or []),
            "pinned": m.pinned, "edited": m.edited, "deleted": m.deleted, "at": m.at, "expiresAt": m.expires_at, "sendAt": m.send_at,
            "poll": poll, "ref": None if m.deleted else m.ref, "opened": opened}

def conv_json(db: Session, c: M.Conv, me: M.User) -> dict:
    st = my_state(c, me.id)
    others = [x for x in (db.get(M.User, i) for i in c.members if i != me.id) if x]
    msgs = [m for m in conv_msgs(db, c, me) if not (m.send_at and m.send_at > M.now_ms())]
    last = msgs[-1] if msgs else None
    lt = None
    if last: lt = {"text": "" if last.deleted or last.kind == "viewonce" else (last.text or (last.poll or {}).get("q", "")), "at": last.at, "from": me_id(last.sender, me)}
    title = c.title if c.group else (others[0].name if others else c.title)
    return {"id": c.id, "title": title, "group": c.group, "members": [user_json(x) for x in others], "folder": st.get("folder"),
            "muted": bool(st.get("muted")), "pinned": bool(st.get("pinned")), "locked": bool(st.get("locked")), "theme": st.get("theme"),
            "fadeSec": c.fade_sec, "request": bool(st.get("request")), "awaitingAccept": any((s or {}).get("request") for k, s in (c.state or {}).items() if k != me.id),
            "unread": unread_count(db, c, me), "last": lt}

def open_dm(db: Session, me: M.User, t: M.User) -> M.Conv:
    """Reuse or create a 1:1 conv. Non-friends → Request Gate for the recipient."""
    for c in db.scalars(select(M.Conv).where(M.Conv.group == False)):  # noqa: E712
        if sorted(c.members) == sorted([me.id, t.id]): return c
    can_message(db, me, t)
    friends = are_friends(db, me.id, t.id)
    if prof(t)["who_can_message"] == "friends" and not friends: raise HTTPException(403, "This person only accepts messages from friends")
    c = M.Conv(title="", group=False, members=[me.id, t.id], created_by=me.id, state={me.id: {}, t.id: {"request": not friends}})
    db.add(c); db.flush(); return c

class ConvIn(BaseModel):
    members: list[str] = Field(min_length=1, max_length=50); title: str | None = Field(default=None, max_length=80)
@router.get("/conv")
def list_convs(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    out = [conv_json(db, c, u) for c in db.scalars(select(M.Conv)) if u.id in c.members]
    out.sort(key=lambda c: (not c["pinned"], -((c["last"] or {}).get("at") or 0)))
    return out

@router.post("/conv")
def create_conv(b: ConvIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    ids = list(dict.fromkeys(i for i in b.members if i != u.id))
    if not ids or any(len(i) > 40 for i in ids): raise HTTPException(400, "Pick at least one person")
    users = [db.get(M.User, i) for i in ids]
    if any(x is None or x.suspended for x in users): raise HTTPException(404, "Unknown member")
    if len(users) == 1: c = open_dm(db, u, users[0])
    else:
        st = {u.id: {}}
        for t in users:
            can_message(db, u, t)
            if prof(t)["who_can_message"] == "friends" and not are_friends(db, u.id, t.id): raise HTTPException(403, f"{t.handle} only accepts messages from friends")
            st[t.id] = {"request": not are_friends(db, u.id, t.id)}
        c = M.Conv(title=(b.title or ", ".join(x.name.split()[0] for x in users))[:80], group=True, members=[u.id, *ids], created_by=u.id, state=st)
        db.add(c); db.flush()
    db.commit(); return conv_json(db, c, u)

class ConvPatch(BaseModel):
    folder: Literal["friends", "family", "work", "groups"] | None = None; muted: bool | None = None; pinned: bool | None = None
    locked: bool | None = None; theme: str | None = Field(default=None, max_length=30); fadeSec: int | None = None; accept: bool | None = None
@router.patch("/conv/{cid}")
def patch_conv(cid: str, b: ConvPatch, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    c = get_conv(db, cid, u); d = b.model_dump(exclude_unset=True)
    if "fadeSec" in d:
        if d["fadeSec"] not in FADES: raise HTTPException(400, "fadeSec must be null, 3600, 86400 or 604800")
        c.fade_sec = d.pop("fadeSec")
    if d.pop("accept", None): set_state(c, u.id, request=False)
    upd = {k: v for k, v in d.items() if k in ("folder", "theme") or v is not None}
    if upd: set_state(c, u.id, **upd)
    db.commit(); return conv_json(db, c, u)

@router.get("/conv/{cid}/messages")
def get_messages(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    c = get_conv(db, cid, u); msgs = conv_msgs(db, c, u)
    set_state(c, u.id, lastRead=M.now_ms()); db.commit()
    return [msg_json(db, m, u) for m in msgs]

def check_can_send(db: Session, c: M.Conv, u: M.User):
    if my_state(c, u.id).get("request"): raise HTTPException(409, "Accept the message request first")
    others = [i for i in c.members if i != u.id]
    if not c.group and others:
        t = db.get(M.User, others[0])
        if blocked_between(db, u.id, others[0]) or (t and prof(t)["who_can_message"] == "nobody" and not are_friends(db, u.id, t.id)): raise HTTPException(403, "You can't message this person")
    if any((c.state or {}).get(i, {}).get("request") for i in others):
        sent = db.scalar(select(func.count()).select_from(M.ChatMsg).where(M.ChatMsg.conv_id == c.id, M.ChatMsg.sender == u.id))
        if sent >= 1: raise HTTPException(409, "Wait until they accept your message request")

def add_message(db: Session, c: M.Conv, u: M.User, kind: str, text: str, **kw) -> M.ChatMsg:
    base = kw.get("send_at") or M.now_ms()
    m = M.ChatMsg(conv_id=c.id, sender=u.id, kind=kind, text=text, at=base, expires_at=(base + c.fade_sec * 1000) if c.fade_sec else None, **kw)
    db.add(m); db.flush()
    if not kw.get("send_at") and not c.group:
        for t in c.members:
            if t != u.id and not my_state(c, t).get("muted"):
                body = "View-once message" if kind == "viewonce" else (text or "New message")[:80]
                chat_notice(db, t, "message", f"New message from {u.name}", body, "ChatThread", {"id": c.id})
    return m

class PollIn(BaseModel): q: str = Field(min_length=1, max_length=200); options: list[str] = Field(min_length=2, max_length=6)
class MsgIn(BaseModel):
    text: str = Field(default="", max_length=4000); kind: Literal["text", "poll", "viewonce", "ping"] = "text"
    replyTo: str | None = Field(default=None, max_length=40); poll: PollIn | None = None; viewOnce: bool = False; sendAt: int | None = None
@router.post("/conv/{cid}/messages")
def send(cid: str, b: MsgIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    c = get_conv(db, cid, u); check_can_send(db, c, u)
    now = M.now_ms(); kind = "viewonce" if b.viewOnce else ("poll" if b.poll else b.kind)
    if b.sendAt is not None and not (now < b.sendAt <= now + 30 * DAY): raise HTTPException(400, "sendAt must be in the future (max 30 days)")
    text = b.text.strip(); poll = None
    if kind == "poll":
        if not b.poll or any(not o.strip() or len(o) > 80 for o in b.poll.options): raise HTTPException(400, "A poll needs a question and 2–6 options")
        poll = {"q": b.poll.q.strip(), "options": [{"text": o.strip(), "votes": 0} for o in b.poll.options], "voters": {}}
    elif not text: raise HTTPException(400, "Empty message")
    if b.replyTo:
        r = db.get(M.ChatMsg, b.replyTo)
        if not r or r.conv_id != c.id: raise HTTPException(400, "Reply target not in this chat")
    m = add_message(db, c, u, kind, text, reply_to=b.replyTo, poll=poll, send_at=b.sendAt)
    db.commit(); return msg_json(db, m, u)

def get_msg(db: Session, mid: str, u: M.User) -> tuple[M.ChatMsg, M.Conv]:
    m = db.get(M.ChatMsg, mid)
    if not m: raise HTTPException(404, "Message not found")
    c = db.get(M.Conv, m.conv_id)
    if not c or u.id not in c.members or not visible(m, u, M.now_ms()): raise HTTPException(404, "Message not found")
    return m, c

class EditIn(BaseModel): text: str = Field(min_length=1, max_length=4000)
@router.patch("/messages/{mid}")
def edit_msg(mid: str, b: EditIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    m, _ = get_msg(db, mid, u)
    if m.sender != u.id: raise HTTPException(403, "You can only edit your own messages")
    if m.deleted or m.kind not in ("text",): raise HTTPException(409, "This message can't be edited")
    if M.now_ms() - m.at > EDIT_WINDOW: raise HTTPException(409, "Edit window (15 min) has passed")
    m.text, m.edited = b.text.strip(), True; db.commit(); return msg_json(db, m, u)

@router.delete("/messages/{mid}")
def delete_msg(mid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    m, _ = get_msg(db, mid, u)
    if m.sender != u.id: raise HTTPException(403, "You can only unsend your own messages")
    if M.now_ms() - m.at > UNDO_WINDOW: raise HTTPException(409, "Undo window (60 min) has passed")
    m.deleted, m.text, m.poll, m.ref = True, "", None, None; db.commit(); return msg_json(db, m, u)

class ReactIn(BaseModel): moji: int = Field(ge=0, le=10000)
@router.post("/messages/{mid}/react")
def react(mid: str, b: ReactIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    m, _ = get_msg(db, mid, u)
    if m.deleted: raise HTTPException(409, "Message was unsent")
    rs = [r for r in (m.reactions or []) if r["by"] != u.id]
    if not any(r["by"] == u.id and r["moji"] == b.moji for r in (m.reactions or [])): rs.append({"moji": b.moji, "by": u.id})
    m.reactions = rs; db.commit(); return msg_json(db, m, u)

@router.post("/messages/{mid}/star")
def star(mid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    m, _ = get_msg(db, mid, u); s = list(m.starred_by or [])
    m.starred_by = [x for x in s if x != u.id] if u.id in s else s + [u.id]; db.commit(); return msg_json(db, m, u)

@router.post("/messages/{mid}/pin")
def pin(mid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    m, _ = get_msg(db, mid, u)
    if m.deleted: raise HTTPException(409, "Message was unsent")
    m.pinned = not m.pinned; db.commit(); return msg_json(db, m, u)

class ForwardIn(BaseModel): convId: str = Field(min_length=1, max_length=40)
@router.post("/messages/{mid}/forward")
def forward(mid: str, b: ForwardIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    m, _ = get_msg(db, mid, u)
    if m.deleted or m.kind in ("viewonce", "ping", "system"): raise HTTPException(409, "This message can't be forwarded")
    c = get_conv(db, b.convId, u); check_can_send(db, c, u)
    if m.kind == "poll": n = add_message(db, c, u, "text", f"Poll: {m.poll['q']}")
    else: n = add_message(db, c, u, m.kind, m.text, ref=m.ref)
    db.commit(); return msg_json(db, n, u)

class VoteIn(BaseModel): option: int = Field(ge=0, le=9)
@router.post("/messages/{mid}/vote")
def vote(mid: str, b: VoteIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    m, _ = get_msg(db, mid, u)
    if m.kind != "poll" or not m.poll: raise HTTPException(400, "Not a poll")
    if b.option >= len(m.poll["options"]): raise HTTPException(400, "Unknown option")
    if u.id in m.poll.get("voters", {}): raise HTTPException(409, "You already voted")
    p = {**m.poll, "options": [dict(o) for o in m.poll["options"]], "voters": {**m.poll.get("voters", {}), u.id: b.option}}
    p["options"][b.option]["votes"] += 1; m.poll = p; db.commit(); return msg_json(db, m, u)

@router.post("/messages/{mid}/open")
def open_once(mid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    m, _ = get_msg(db, mid, u)
    if m.kind != "viewonce": raise HTTPException(400, "Not a view-once message")
    if m.sender == u.id: raise HTTPException(400, "You sent this one")
    if m.deleted or u.id in (m.opened_by or []): raise HTTPException(409, "Already opened")
    m.opened_by = [*(m.opened_by or []), u.id]; db.commit()
    return {**msg_json(db, m, u), "text": m.text}

@router.get("/search/messages")
def search(q: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    q = q.strip()
    if not 1 <= len(q) <= 100: raise HTTPException(400, "Search 1–100 characters")
    mine = [c.id for c in db.scalars(select(M.Conv)) if u.id in c.members]
    if not mine: return []
    like = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    rows = db.scalars(select(M.ChatMsg).where(M.ChatMsg.conv_id.in_(mine), M.ChatMsg.deleted == False, M.ChatMsg.kind != "viewonce",  # noqa: E712
                                              M.ChatMsg.text.ilike(like, escape="\\")).order_by(M.ChatMsg.at.desc()).limit(100)).all()
    now = M.now_ms()
    return [msg_json(db, m, u) for m in rows if visible(m, u, now)][:50]

# ---------- bridge ----------
class BridgeIn(BaseModel):
    convId: str = Field(min_length=1, max_length=40); type: Literal["post", "loop"]; id: str = Field(min_length=1, max_length=40); note: str | None = Field(default=None, max_length=500)
@router.post("/bridge/share")
def bridge(b: BridgeIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    c = get_conv(db, b.convId, u); check_can_send(db, c, u)
    if b.type == "post":
        p = db.get(M.Post, b.id)
        if not p or p.hidden: raise HTTPException(404, "Post not found")
        kind, ref = "post", {"type": "post", "id": p.id, "title": p.text[:80], "hue": p.hue}
    else:
        l = db.get(M.Loop, b.id)
        if not l or l.owner_id != u.id: raise HTTPException(404, "Loop not found")  # Draft Bridge: own loops only
        kind, ref = "draft", {"type": "loop", "id": l.id, "title": l.title, "hue": (l.drafts or [{}])[0].get("hue", 200)}
    m = add_message(db, c, u, kind, (b.note or "").strip(), ref=ref); db.commit(); return msg_json(db, m, u)

# ---------- vibes (status, 24h) ----------
def status_visible(db: Session, s: M.Status, me: M.User) -> bool:
    if s.user_id == me.id: return True
    if blocked_between(db, s.user_id, me.id): return False
    if s.audience == "public": return True
    f = db.get(M.Friend, (s.user_id, me.id))
    return bool(f) and (s.audience == "friends" or (s.audience == "close" and f.close))

def status_json(db: Session, s: M.Status, me: M.User) -> dict:
    return {"id": s.id, "by": me_id(s.user_id, me), "user": user_json(db.get(M.User, s.user_id)), "kind": s.kind, "text": s.text, "moji": s.moji,
            "bg": s.bg, "audience": s.audience, "at": s.at, "expiresAt": s.at + DAY}

class StatusIn(BaseModel):
    kind: Literal["text", "mood"]; text: str | None = Field(default=None, max_length=300); moji: int | None = Field(default=None, ge=0, le=10000)
    bg: str | None = Field(default=None, max_length=20); audience: Literal["friends", "close", "public"] = "friends"
@router.post("/status")
def post_status(b: StatusIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    if b.kind == "text" and not (b.text or "").strip(): raise HTTPException(400, "Write something")
    if b.kind == "mood" and b.moji is None: raise HTTPException(400, "Pick a mood")
    s = M.Status(user_id=u.id, kind=b.kind, text=(b.text or "").strip(), moji=b.moji, bg=b.bg, audience=b.audience); db.add(s); db.commit()
    return status_json(db, s, u)

@router.get("/status")
def list_status(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    rows = [s for s in db.scalars(select(M.Status).where(M.Status.at > M.now_ms() - DAY).order_by(M.Status.at.desc())) if status_visible(db, s, u)]
    rows.sort(key=lambda s: s.user_id != u.id)
    return [status_json(db, s, u) for s in rows]

class ReplyIn(BaseModel): text: str = Field(min_length=1, max_length=1000)
@router.post("/status/{sid}/reply")
def reply_status(sid: str, b: ReplyIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    s = db.get(M.Status, sid)
    if not s or s.at <= M.now_ms() - DAY or not status_visible(db, s, u): raise HTTPException(404, "Vibe not found")
    if s.user_id == u.id: raise HTTPException(400, "That's your own Vibe")
    c = open_dm(db, u, db.get(M.User, s.user_id)); check_can_send(db, c, u)
    snippet = s.text[:60] if s.text else "mood"
    m = add_message(db, c, u, "text", f"Replied to your Vibe “{snippet}”: {b.text.strip()}"); db.commit()
    return {"conv": conv_json(db, c, u), "message": msg_json(db, m, u)}

@router.delete("/status/{sid}")
def delete_status(sid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    s = db.get(M.Status, sid)
    if not s or s.user_id != u.id: raise HTTPException(404, "Vibe not found")
    db.delete(s); db.commit(); return {"ok": True}

# ---------- towns ----------
def membership(db: Session, t: M.Town, u: M.User) -> M.TownMember | None: return db.get(M.TownMember, (t.id, u.id))

def get_town(db: Session, tid: str, u: M.User) -> tuple[M.Town, M.TownMember | None]:
    t = db.get(M.Town, tid)
    if not t or t.suspended: raise HTTPException(404, "Town not found")
    mem = membership(db, t, u)
    if not t.open and not mem: raise HTTPException(404, "Town not found")
    return t, mem

def need_role(mem: M.TownMember | None, *roles: str):
    if not mem or mem.role not in roles: raise HTTPException(403, f"Requires town role: {', '.join(roles)}")

def town_json(db: Session, t: M.Town, u: M.User) -> dict:
    mem = membership(db, t, u); role = mem.role if mem else None
    n = db.scalar(select(func.count()).select_from(M.TownMember).where(M.TownMember.town_id == t.id))
    chans = db.scalars(select(M.TownChannel).where(M.TownChannel.town_id == t.id).order_by(M.TownChannel.name)).all()
    board = db.scalars(select(M.TownBoard).where(M.TownBoard.town_id == t.id).order_by(M.TownBoard.at.desc()).limit(20)).all()
    return {"id": t.id, "name": t.name, "open": t.open, "hue": t.hue, "about": t.about, "members": n, "role": role,
            "channels": [{"id": c.id, "name": c.name} for c in chans] if (mem or t.open) else [],
            "board": [{"id": x.id, "text": x.text, "at": x.at} for x in board], "invite": t.invite_code if role in ("owner", "admin") else None}

def new_code() -> str: return secrets.token_urlsafe(6).replace("-", "x").replace("_", "y").upper()

@router.get("/towns")
def list_towns(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    mine = set(db.scalars(select(M.TownMember.town_id).where(M.TownMember.user_id == u.id)))
    return [town_json(db, t, u) for t in db.scalars(select(M.Town).where(M.Town.suspended == False).order_by(M.Town.at)) if t.open or t.id in mine]  # noqa: E712

class TownIn(BaseModel):
    name: str = Field(min_length=3, max_length=60); open: bool = True; about: str = Field(default="", max_length=500); hue: int | None = Field(default=None, ge=0, le=360)
@router.post("/towns")
def create_town(b: TownIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    t = M.Town(name=b.name.strip(), open=b.open, about=b.about.strip(), hue=b.hue if b.hue is not None else secrets.randbelow(360), owner_id=u.id,
               invite_code=None if b.open else new_code())
    db.add(t); db.flush(); db.add_all([M.TownMember(town_id=t.id, user_id=u.id, role="owner"), M.TownChannel(town_id=t.id, name="general")])
    audit(db, u.handle, "town.create", t.id); db.commit(); return town_json(db, t, u)

@router.get("/towns/{tid}")
def get_town_ep(tid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    t, _ = get_town(db, tid, u); return town_json(db, t, u)

class JoinIn(BaseModel): code: str | None = Field(default=None, max_length=20)
@router.post("/towns/{tid}/join")
def join(tid: str, b: JoinIn | None = None, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    t = db.get(M.Town, tid)
    if not t or t.suspended: raise HTTPException(404, "Town not found")
    if membership(db, t, u): raise HTTPException(409, "Already a member")
    if not t.open:
        code = ((b and b.code) or "").strip().upper()
        if not t.invite_code or not code or not hmac.compare_digest(code, t.invite_code): raise HTTPException(403, "This town needs a valid invite code")
    db.add(M.TownMember(town_id=t.id, user_id=u.id, role="member")); db.commit(); return town_json(db, t, u)

@router.post("/towns/{tid}/leave")
def leave(tid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    t, mem = get_town(db, tid, u)
    if not mem: raise HTTPException(409, "Not a member")
    if mem.role == "owner": raise HTTPException(409, "Owners can't leave — transfer or delete the town")
    db.delete(mem); db.commit(); return {"ok": True}

class ChannelIn(BaseModel): name: str = Field(min_length=1, max_length=30)
@router.post("/towns/{tid}/channels")
def add_channel(tid: str, b: ChannelIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    t, mem = get_town(db, tid, u); need_role(mem, "owner", "admin")
    name = b.name.strip().lower().replace(" ", "-")
    if db.scalar(select(M.TownChannel).where(M.TownChannel.town_id == t.id, M.TownChannel.name == name)): raise HTTPException(409, "Channel exists")
    db.add(M.TownChannel(town_id=t.id, name=name)); db.commit(); return town_json(db, t, u)

def get_channel(db, t: M.Town, cid: str) -> M.TownChannel:
    ch = db.get(M.TownChannel, cid)
    if not ch or ch.town_id != t.id: raise HTTPException(404, "Channel not found")
    return ch

def tmsg_json(m: M.TownMessage, u: M.User, db: Session) -> dict:
    s = db.get(M.User, m.sender)
    return {"id": m.id, "from": me_id(m.sender, u), "user": user_json(s) if s else None, "text": m.text, "at": m.at}

@router.get("/towns/{tid}/channels/{cid}/messages")
def channel_messages(tid: str, cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    t, mem = get_town(db, tid, u)
    if not mem: raise HTTPException(403, "Join the town to read channels")
    ch = get_channel(db, t, cid)
    return [tmsg_json(m, u, db) for m in db.scalars(select(M.TownMessage).where(M.TownMessage.channel_id == ch.id).order_by(M.TownMessage.at).limit(500))]

class TownMsgIn(BaseModel): text: str = Field(min_length=1, max_length=2000)
@router.post("/towns/{tid}/channels/{cid}/messages")
def channel_send(tid: str, cid: str, b: TownMsgIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    t, mem = get_town(db, tid, u)
    if not mem: raise HTTPException(403, "Join the town to post")
    ch = get_channel(db, t, cid); m = M.TownMessage(channel_id=ch.id, sender=u.id, text=b.text.strip()); db.add(m); db.commit(); return tmsg_json(m, u, db)

class BoardIn(BaseModel): text: str = Field(min_length=1, max_length=1000)
@router.post("/towns/{tid}/board")
def board(tid: str, b: BoardIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    t, mem = get_town(db, tid, u); need_role(mem, "owner", "admin")
    db.add(M.TownBoard(town_id=t.id, text=b.text.strip())); db.commit(); return town_json(db, t, u)

class InviteIn(BaseModel): revoke: bool = False; to: str | None = Field(default=None, max_length=40)
@router.post("/towns/{tid}/invite")
def invite(tid: str, b: InviteIn | None = None, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    t, mem = get_town(db, tid, u); need_role(mem, "owner", "admin"); b = b or InviteIn()
    if b.revoke: t.invite_code = None
    elif not b.to or not t.invite_code: t.invite_code = new_code()
    if b.to and not b.revoke:
        target = db.get(M.User, b.to)
        if not target or blocked_between(db, u.id, target.id): raise HTTPException(404, "Unknown user")
        chat_notice(db, target.id, "town", f"{u.name} invited you to {t.name}", f"Invite code {t.invite_code}" if not t.open else "", "Town", {"id": t.id, "code": t.invite_code})
    audit(db, u.handle, "town.invite_revoke" if b.revoke else "town.invite", t.id); db.commit(); return {"invite": t.invite_code}

class RoleIn(BaseModel): role: Literal["admin", "moderator", "member"]
@router.patch("/towns/{tid}/members/{uid}")
def set_role(tid: str, uid: str, b: RoleIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    t, mem = get_town(db, tid, u); need_role(mem, "owner")
    target = db.get(M.TownMember, (t.id, uid))
    if not target: raise HTTPException(404, "Not a member")
    if target.role == "owner": raise HTTPException(409, "The owner's role can't change")
    target.role = b.role; audit(db, u.handle, "town.role", f"{t.id} {uid}={b.role}"); db.commit(); return {"ok": True, "userId": uid, "role": b.role}
