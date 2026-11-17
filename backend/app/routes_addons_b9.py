"""VibeLoop add-ons, batch 9 (Hush · chat-side tools). Each one switchable in User App Settings (addons.hush.*).

  Confession Box   anonymous-to-members notes inside a group chat (staff can see the sender); react; creator closes the box.
  Time Zone Board  members share city + UTC offset; board shows local times now and the hours that suit everyone.
  Read-Later Shelf save links to a chat's shelf with a title/note; each member marks read.
  Study Sprint     25/50-minute focus sprint; members join; at the end everyone still in completes; weekly minutes board.
  Shared Budget    budget with categories + limits; members log spends; remaining per category. No money moves.
  Vote to Pin      propose a note to pin; once half the members vote yes it becomes the chat's pinned note.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import String, Integer, BigInteger, Boolean, JSON, ForeignKey, UniqueConstraint, select, func
from sqlalchemy.orm import Session, Mapped, mapped_column
from .db import get_db
from . import models as M
from .models import Base, nid, now_ms
from .security import current_user, require, audit
from .routes_addons import on, need, push, who, conv_for

router = APIRouter()
STAFF = require("owner", "admin", "moderator", "support")
DAY = 86_400_000
UFK = lambda: ForeignKey("users.id", ondelete="CASCADE")  # noqa: E731

# =====================================================================
# models
# =====================================================================
class ConfessionBox(Base):
    __tablename__ = "b9_confession_boxes"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("cb"))
    conv_id: Mapped[str] = mapped_column(String(40), index=True); created_by: Mapped[str] = mapped_column(UFK(), index=True)
    title: Mapped[str] = mapped_column(String(80)); open: Mapped[bool] = mapped_column(Boolean, default=True)
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class Confession(Base):
    __tablename__ = "b9_confessions"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("cf"))
    box_id: Mapped[str] = mapped_column(ForeignKey("b9_confession_boxes.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(UFK(), index=True); text: Mapped[str] = mapped_column(String(500))
    reactions: Mapped[dict] = mapped_column(JSON, default=dict); at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class TzEntry(Base):
    __tablename__ = "b9_tz_entries"
    __table_args__ = (UniqueConstraint("conv_id", "user_id", name="uq_b9_tz_conv_user"),)
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("tz"))
    conv_id: Mapped[str] = mapped_column(String(40), index=True); user_id: Mapped[str] = mapped_column(UFK(), index=True)
    city: Mapped[str] = mapped_column(String(60)); offset_min: Mapped[int] = mapped_column(Integer)
    wake: Mapped[int] = mapped_column(Integer, default=9); sleep: Mapped[int] = mapped_column(Integer, default=22)
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class ShelfItem(Base):
    __tablename__ = "b9_shelf_items"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("sh"))
    conv_id: Mapped[str] = mapped_column(String(40), index=True); user_id: Mapped[str] = mapped_column(UFK(), index=True)
    url: Mapped[str] = mapped_column(String(500)); title: Mapped[str] = mapped_column(String(120)); note: Mapped[str] = mapped_column(String(280), default="")
    read_by: Mapped[list] = mapped_column(JSON, default=list); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class Sprint(Base):
    __tablename__ = "b9_sprints"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("sp"))
    conv_id: Mapped[str] = mapped_column(String(40), index=True); created_by: Mapped[str] = mapped_column(UFK(), index=True)
    goal: Mapped[str] = mapped_column(String(120), default=""); minutes: Mapped[int] = mapped_column(Integer)
    ends_at: Mapped[int] = mapped_column(BigInteger, index=True); members: Mapped[list] = mapped_column(JSON, default=list)
    quit: Mapped[list] = mapped_column(JSON, default=list); status: Mapped[str] = mapped_column(String(10), default="running")
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class Budget(Base):
    __tablename__ = "b9_budgets"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("bg"))
    conv_id: Mapped[str] = mapped_column(String(40), index=True); created_by: Mapped[str] = mapped_column(UFK(), index=True)
    title: Mapped[str] = mapped_column(String(80)); currency: Mapped[str] = mapped_column(String(3), default="INR")
    categories: Mapped[list] = mapped_column(JSON, default=list); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class BudgetSpend(Base):
    __tablename__ = "b9_budget_spends"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("bs"))
    budget_id: Mapped[str] = mapped_column(ForeignKey("b9_budgets.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(UFK(), index=True); category: Mapped[str] = mapped_column(String(40))
    amount: Mapped[int] = mapped_column(Integer); note: Mapped[str] = mapped_column(String(120), default="")
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class PinProposal(Base):
    __tablename__ = "b9_pin_proposals"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("pp"))
    conv_id: Mapped[str] = mapped_column(String(40), index=True); user_id: Mapped[str] = mapped_column(UFK(), index=True)
    text: Mapped[str] = mapped_column(String(300)); yes: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(10), default="open", index=True)  # open | pinned | replaced | dropped
    pinned_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

def notify(c: M.Conv, me: M.User, title: str, body: str, route: str):
    for m in c.members:
        if m != me.id: push(m, title, body, route, {"convId": c.id})

def get_or_404(db: Session, model, oid: str, what: str):
    x = db.get(model, oid)
    if not x: raise HTTPException(404, f"{what} not found")
    return x

# =====================================================================
# Confession Box
# =====================================================================
REACTS = ("hug", "same", "wow", "laugh")
CB = ("addons.hush.confessionBox", "Confession Box")

def conf_json(f: Confession, me: M.User) -> dict:
    r = f.reactions or {}
    return {"id": f.id, "text": f.text, "at": f.at, "mine": f.user_id == me.id,
            "reactions": {k: len(r.get(k, [])) for k in REACTS}, "myReactions": [k for k in REACTS if me.id in r.get(k, [])]}

def box_json(db: Session, b: ConfessionBox, me: M.User, with_notes=False) -> dict:
    n = db.scalar(select(func.count()).select_from(Confession).where(Confession.box_id == b.id)) or 0
    d = {"id": b.id, "convId": b.conv_id, "title": b.title, "open": b.open, "at": b.at, "count": n, "createdBy": who(db, b.created_by), "canClose": b.created_by == me.id}
    if with_notes: d["notes"] = [conf_json(f, me) for f in db.scalars(select(Confession).where(Confession.box_id == b.id).order_by(Confession.at.desc()))]
    return d

class BoxIn(BaseModel): title: str = Field(min_length=1, max_length=80)
@router.post("/addons/b9/convs/{cid}/confession-boxes")
def box_create(cid: str, b: BoxIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *CB); c = conv_for(db, cid, u)
    if not c.group: raise HTTPException(400, "Confession Box works in group chats only")
    x = ConfessionBox(conv_id=c.id, created_by=u.id, title=b.title.strip()); db.add(x); db.commit()
    notify(c, u, "Confession Box opened", f"“{x.title}” — drop a note, nobody sees who", "ConfessionBox"); return box_json(db, x, u)

@router.get("/addons/b9/convs/{cid}/confession-boxes")
def box_list(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *CB); c = conv_for(db, cid, u)
    return [box_json(db, b, u) for b in db.scalars(select(ConfessionBox).where(ConfessionBox.conv_id == c.id).order_by(ConfessionBox.at.desc()))]

def my_box(db, bid, u) -> ConfessionBox:
    b = get_or_404(db, ConfessionBox, bid, "Box"); conv_for(db, b.conv_id, u); return b

@router.get("/addons/b9/confession-boxes/{bid}")
def box_get(bid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *CB); return box_json(db, my_box(db, bid, u), u, True)

class ConfIn(BaseModel): text: str = Field(min_length=1, max_length=500)
@router.post("/addons/b9/confession-boxes/{bid}/notes")
def conf_add(bid: str, b: ConfIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *CB); x = my_box(db, bid, u)
    if not x.open: raise HTTPException(409, "This box is closed")
    from .routes_trust import assert_not_restricted
    assert_not_restricted(u)
    used = db.scalar(select(func.count()).select_from(Confession).where(Confession.user_id == u.id, Confession.at > now_ms() - DAY)) or 0
    if used >= (cap := on(db, u, "addons.hush.confessionsPerDay")): raise HTTPException(429, f"You've dropped {cap} notes today — more tomorrow")
    f = Confession(box_id=x.id, user_id=u.id, text=b.text.strip(), reactions={}); db.add(f); db.commit(); return conf_json(f, u)

class ReactIn(BaseModel): kind: str = Field(pattern=r"^(hug|same|wow|laugh)$")
@router.post("/addons/b9/confessions/{fid}/react")
def conf_react(fid: str, b: ReactIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *CB); f = get_or_404(db, Confession, fid, "Note"); my_box(db, f.box_id, u)
    r = {k: list(v) for k, v in (f.reactions or {}).items()}; lst = r.setdefault(b.kind, [])
    lst.remove(u.id) if u.id in lst else lst.append(u.id)
    f.reactions = r; db.commit(); return conf_json(f, u)

@router.delete("/addons/b9/confessions/{fid}")
def conf_delete(fid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *CB); f = get_or_404(db, Confession, fid, "Note"); my_box(db, f.box_id, u)
    if f.user_id != u.id: raise HTTPException(404, "Note not found")
    db.delete(f); db.commit(); return {"ok": True}

@router.post("/addons/b9/confession-boxes/{bid}/close")
def box_close(bid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *CB); x = my_box(db, bid, u)
    if x.created_by != u.id: raise HTTPException(403, "Only the person who opened this box can close it")
    x.open = False; db.commit(); return box_json(db, x, u, True)

@router.get("/admin/addons/b9/confessions")
def admin_confessions(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    rows = db.scalars(select(Confession).order_by(Confession.at.desc()).limit(100)).all()
    return [{"id": f.id, "boxId": f.box_id, "text": f.text, "at": f.at, "sender": who(db, f.user_id)} for f in rows]

@router.delete("/admin/addons/b9/confessions/{fid}")
def admin_conf_remove(fid: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    if f := db.get(Confession, fid): db.delete(f)
    audit(db, a.handle, "addons.b9.confession_remove", fid); db.commit(); return {"ok": True}

# =====================================================================
# Time Zone Board
# =====================================================================
TZ = ("addons.hush.timeZoneBoard", "Time Zone Board")
class TzIn(BaseModel):
    city: str = Field(min_length=1, max_length=60); offsetMin: int = Field(ge=-720, le=840)
    wake: int = Field(default=9, ge=0, le=23); sleep: int = Field(default=22, ge=1, le=24)

def tz_board(db: Session, c: M.Conv) -> dict:
    rows = db.scalars(select(TzEntry).where(TzEntry.conv_id == c.id, TzEntry.user_id.in_(c.members))).all()
    now = now_ms()
    people = [{"user": who(db, e.user_id), "city": e.city, "offsetMin": e.offset_min, "wake": e.wake, "sleep": e.sleep,
               "localMinute": ((now // 60000) + e.offset_min) % 1440} for e in rows]
    # UTC hours when every member is awake (between their wake and sleep hour, local)
    good = [h for h in range(24) if rows and all(e.wake <= ((h * 60 + e.offset_min) // 60) % 24 < e.sleep for e in rows)]
    return {"people": sorted(people, key=lambda p: p["offsetMin"]), "overlapUtcHours": good, "missing": len(c.members) - len(rows)}

@router.put("/addons/b9/convs/{cid}/timezones")
def tz_set(cid: str, b: TzIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *TZ); c = conv_for(db, cid, u)
    if b.wake >= b.sleep: raise HTTPException(400, "Wake hour must be before sleep hour")
    e = db.scalar(select(TzEntry).where(TzEntry.conv_id == c.id, TzEntry.user_id == u.id))
    if not e: e = TzEntry(conv_id=c.id, user_id=u.id); db.add(e)
    e.city, e.offset_min, e.wake, e.sleep, e.at = b.city.strip(), b.offsetMin, b.wake, b.sleep, now_ms()
    db.commit(); return tz_board(db, c)

@router.get("/addons/b9/convs/{cid}/timezones")
def tz_get(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *TZ); return tz_board(db, conv_for(db, cid, u))

@router.delete("/addons/b9/convs/{cid}/timezones")
def tz_clear(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *TZ); c = conv_for(db, cid, u)
    if e := db.scalar(select(TzEntry).where(TzEntry.conv_id == c.id, TzEntry.user_id == u.id)): db.delete(e); db.commit()
    return tz_board(db, c)

# =====================================================================
# Read-Later Shelf
# =====================================================================
SH = ("addons.hush.readLaterShelf", "Read-Later Shelf")
def shelf_json(db, s: ShelfItem, me: M.User) -> dict:
    return {"id": s.id, "url": s.url, "title": s.title, "note": s.note, "at": s.at, "by": who(db, s.user_id), "mine": s.user_id == me.id,
            "read": me.id in (s.read_by or []), "readCount": len(s.read_by or [])}

class ShelfIn(BaseModel):
    url: str = Field(min_length=8, max_length=500, pattern=r"^https?://[^\s]+$"); title: str = Field(min_length=1, max_length=120); note: str = Field(default="", max_length=280)
@router.post("/addons/b9/convs/{cid}/shelf")
def shelf_add(cid: str, b: ShelfIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *SH); c = conv_for(db, cid, u)
    n = db.scalar(select(func.count()).select_from(ShelfItem).where(ShelfItem.conv_id == c.id)) or 0
    if n >= (cap := on(db, u, "addons.hush.shelfMaxItems")): raise HTTPException(400, f"This shelf is full ({cap} links) — clear some first")
    s = ShelfItem(conv_id=c.id, user_id=u.id, url=b.url, title=b.title.strip(), note=b.note.strip(), read_by=[]); db.add(s); db.commit()
    notify(c, u, f"{u.name} shelved a link", s.title, "ReadLaterShelf"); return shelf_json(db, s, u)

@router.get("/addons/b9/convs/{cid}/shelf")
def shelf_list(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *SH); c = conv_for(db, cid, u)
    items = [shelf_json(db, s, u) for s in db.scalars(select(ShelfItem).where(ShelfItem.conv_id == c.id).order_by(ShelfItem.at.desc()))]
    return {"items": items, "unread": sum(1 for i in items if not i["read"]), "members": len(c.members)}

@router.post("/addons/b9/shelf/{sid}/read")
def shelf_read(sid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *SH); s = get_or_404(db, ShelfItem, sid, "Link"); conv_for(db, s.conv_id, u)
    rb = list(s.read_by or []); rb.remove(u.id) if u.id in rb else rb.append(u.id)
    s.read_by = rb; db.commit(); return shelf_json(db, s, u)

@router.delete("/addons/b9/shelf/{sid}")
def shelf_delete(sid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *SH); s = get_or_404(db, ShelfItem, sid, "Link"); conv_for(db, s.conv_id, u)
    if s.user_id != u.id: raise HTTPException(403, "Only the person who shelved this can remove it")
    db.delete(s); db.commit(); return {"ok": True}

# =====================================================================
# Study Sprint
# =====================================================================
SS = ("addons.hush.studySprint", "Study Sprint")
def finish_due(db: Session, conv_id: str):
    n = 0
    for s in db.scalars(select(Sprint).where(Sprint.conv_id == conv_id, Sprint.status == "running", Sprint.ends_at <= now_ms())): s.status = "done"; n += 1
    if n: db.commit()

def sprint_json(db, s: Sprint, me: M.User) -> dict:
    done = [m for m in (s.members or []) if m not in (s.quit or [])] if s.status == "done" else []
    return {"id": s.id, "goal": s.goal, "minutes": s.minutes, "endsAt": s.ends_at, "status": s.status, "at": s.at, "startedBy": who(db, s.created_by),
            "members": [who(db, m) for m in s.members or []], "quit": [who(db, m) for m in s.quit or []], "completed": [who(db, m) for m in done],
            "joined": me.id in (s.members or []) and me.id not in (s.quit or [])}

class SprintIn(BaseModel): minutes: int; goal: str = Field(default="", max_length=120)
@router.post("/addons/b9/convs/{cid}/sprints")
def sprint_start(cid: str, b: SprintIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *SS); c = conv_for(db, cid, u); finish_due(db, c.id)
    if b.minutes not in (25, 50): raise HTTPException(400, "A sprint is 25 or 50 minutes")
    if db.scalar(select(Sprint).where(Sprint.conv_id == c.id, Sprint.status == "running")): raise HTTPException(409, "A sprint is already running here — join it")
    s = Sprint(conv_id=c.id, created_by=u.id, goal=b.goal.strip(), minutes=b.minutes, ends_at=now_ms() + b.minutes * 60_000, members=[u.id], quit=[])
    db.add(s); db.commit(); notify(c, u, f"{u.name} started a {b.minutes}-min Study Sprint", s.goal or "Join in and focus together", "StudySprint")
    return sprint_json(db, s, u)

@router.get("/addons/b9/convs/{cid}/sprints")
def sprint_list(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *SS); c = conv_for(db, cid, u); finish_due(db, c.id)
    rows = db.scalars(select(Sprint).where(Sprint.conv_id == c.id).order_by(Sprint.at.desc()).limit(20)).all()
    mins: dict[str, int] = {}
    for s in db.scalars(select(Sprint).where(Sprint.conv_id == c.id, Sprint.status == "done", Sprint.at > now_ms() - 7 * DAY)):
        for m in s.members or []:
            if m not in (s.quit or []): mins[m] = mins.get(m, 0) + s.minutes
    cur = next((s for s in rows if s.status == "running"), None)
    return {"current": sprint_json(db, cur, u) if cur else None, "past": [sprint_json(db, s, u) for s in rows if s.status != "running"],
            "board": [{"user": who(db, k), "minutes": v} for k, v in sorted(mins.items(), key=lambda x: -x[1])]}

class SprintAct(BaseModel): action: str = Field(pattern=r"^(join|leave)$")
@router.post("/addons/b9/sprints/{sid}")
def sprint_act(sid: str, b: SprintAct, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *SS); s = get_or_404(db, Sprint, sid, "Sprint"); conv_for(db, s.conv_id, u); finish_due(db, s.conv_id); db.refresh(s)
    if s.status != "running": raise HTTPException(409, "This sprint has ended")
    mem, q = list(s.members or []), list(s.quit or [])
    if b.action == "join":
        if u.id not in mem: mem.append(u.id)
        if u.id in q: q.remove(u.id)
    else:
        if u.id not in mem: raise HTTPException(400, "You haven't joined this sprint")
        if u.id not in q: q.append(u.id)
    s.members, s.quit = mem, q; db.commit(); return sprint_json(db, s, u)

# =====================================================================
# Shared Budget
# =====================================================================
SB = ("addons.hush.sharedBudget", "Shared Budget")
def budget_json(db, b: Budget) -> dict:
    spends = db.scalars(select(BudgetSpend).where(BudgetSpend.budget_id == b.id).order_by(BudgetSpend.at.desc())).all()
    used: dict[str, int] = {}
    for s in spends: used[s.category] = used.get(s.category, 0) + s.amount
    cats = [{**c, "spent": used.get(c["id"], 0), "remaining": c["limit"] - used.get(c["id"], 0)} for c in b.categories or []]
    return {"id": b.id, "title": b.title, "currency": b.currency, "at": b.at, "createdBy": who(db, b.created_by), "categories": cats,
            "totalLimit": sum(c["limit"] for c in cats), "totalSpent": sum(c["spent"] for c in cats),
            "spends": [{"id": s.id, "category": s.category, "amount": s.amount, "note": s.note, "at": s.at, "by": who(db, s.user_id)} for s in spends[:50]]}

class CatIn(BaseModel): name: str = Field(min_length=1, max_length=40); limit: int = Field(gt=0, le=100_000_000)
class BudgetIn(BaseModel):
    title: str = Field(min_length=1, max_length=80); currency: str = Field(default="INR", pattern=r"^[A-Z]{3}$"); categories: list[CatIn] = Field(min_length=1, max_length=20)
@router.post("/addons/b9/convs/{cid}/budgets")
def budget_create(cid: str, b: BudgetIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *SB); c = conv_for(db, cid, u)
    x = Budget(conv_id=c.id, created_by=u.id, title=b.title.strip(), currency=b.currency,
               categories=[{"id": nid("bc"), "name": k.name.strip(), "limit": k.limit} for k in b.categories]); db.add(x); db.commit()
    notify(c, u, f"New shared budget: {x.title}", f"{u.name} set up {len(x.categories)} categories", "SharedBudget"); return budget_json(db, x)

@router.get("/addons/b9/convs/{cid}/budgets")
def budget_list(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *SB); c = conv_for(db, cid, u)
    return [budget_json(db, b) for b in db.scalars(select(Budget).where(Budget.conv_id == c.id).order_by(Budget.at.desc()))]

class SpendIn(BaseModel): category: str = Field(min_length=1, max_length=40); amount: int = Field(gt=0, le=100_000_000); note: str = Field(default="", max_length=120)
@router.post("/addons/b9/budgets/{bid}/spends")
def budget_spend(bid: str, b: SpendIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *SB); x = get_or_404(db, Budget, bid, "Budget"); c = conv_for(db, x.conv_id, u)
    cat = next((k for k in x.categories or [] if k["id"] == b.category), None)
    if not cat: raise HTTPException(400, "Pick one of this budget's categories")
    db.add(BudgetSpend(budget_id=x.id, user_id=u.id, category=b.category, amount=b.amount, note=b.note.strip())); db.commit()
    out = budget_json(db, x); left = next(k for k in out["categories"] if k["id"] == b.category)["remaining"]
    if left < 0 <= left + b.amount: notify(c, u, f"{cat['name']} is over budget", f"{x.title}: {cat['name']} went past its limit", "SharedBudget")
    return out

@router.delete("/addons/b9/budget-spends/{sid}")
def budget_spend_delete(sid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *SB); s = get_or_404(db, BudgetSpend, sid, "Spend"); x = db.get(Budget, s.budget_id); conv_for(db, x.conv_id, u)
    if s.user_id != u.id and x.created_by != u.id: raise HTTPException(403, "Only who logged it or the budget's creator can remove this")
    db.delete(s); db.commit(); return budget_json(db, x)

@router.delete("/addons/b9/budgets/{bid}")
def budget_delete(bid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *SB); x = get_or_404(db, Budget, bid, "Budget"); conv_for(db, x.conv_id, u)
    if x.created_by != u.id: raise HTTPException(403, "Only the person who made this budget can delete it")
    db.delete(x); db.commit(); return {"ok": True}

# =====================================================================
# Vote to Pin
# =====================================================================
VP = ("addons.hush.voteToPin", "Vote to Pin")
def need_votes(c: M.Conv) -> int: return max(1, -(-len(c.members) // 2))  # half the members, rounded up

def pin_json(db, p: PinProposal, me: M.User, c: M.Conv) -> dict:
    return {"id": p.id, "text": p.text, "status": p.status, "at": p.at, "pinnedAt": p.pinned_at, "by": who(db, p.user_id), "mine": p.user_id == me.id,
            "yes": len([y for y in p.yes or [] if y in c.members]), "need": need_votes(c), "voted": me.id in (p.yes or [])}

def pin_board(db, c: M.Conv, me: M.User) -> dict:
    pinned = db.scalar(select(PinProposal).where(PinProposal.conv_id == c.id, PinProposal.status == "pinned"))
    open_ = db.scalars(select(PinProposal).where(PinProposal.conv_id == c.id, PinProposal.status == "open").order_by(PinProposal.at.desc())).all()
    return {"pinned": pin_json(db, pinned, me, c) if pinned else None, "proposals": [pin_json(db, p, me, c) for p in open_], "members": len(c.members)}

def maybe_pin(db: Session, c: M.Conv, p: PinProposal, me: M.User):
    if len([y for y in p.yes or [] if y in c.members]) < need_votes(c): return
    for old in db.scalars(select(PinProposal).where(PinProposal.conv_id == c.id, PinProposal.status == "pinned")): old.status = "replaced"
    p.status = "pinned"; p.pinned_at = now_ms(); db.flush()
    notify(c, me, "New pinned note", p.text[:120], "VoteToPin")

class PinIn(BaseModel): text: str = Field(min_length=1, max_length=300)
@router.post("/addons/b9/convs/{cid}/pins")
def pin_propose(cid: str, b: PinIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *VP); c = conv_for(db, cid, u)
    if (db.scalar(select(func.count()).select_from(PinProposal).where(PinProposal.conv_id == c.id, PinProposal.status == "open")) or 0) >= 20:
        raise HTTPException(400, "Too many open proposals — vote on those first")
    p = PinProposal(conv_id=c.id, user_id=u.id, text=b.text.strip(), yes=[u.id]); db.add(p); db.flush()
    maybe_pin(db, c, p, u); db.commit(); return pin_board(db, c, u)

@router.get("/addons/b9/convs/{cid}/pins")
def pin_get(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *VP); return pin_board(db, conv_for(db, cid, u), u)

@router.post("/addons/b9/pins/{pid}/vote")
def pin_vote(pid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *VP); p = get_or_404(db, PinProposal, pid, "Proposal"); c = conv_for(db, p.conv_id, u)
    if p.status != "open": raise HTTPException(409, "Voting on this one has closed")
    y = list(p.yes or []); y.remove(u.id) if u.id in y else y.append(u.id)
    p.yes = y; maybe_pin(db, c, p, u); db.commit(); return pin_board(db, c, u)

@router.delete("/addons/b9/pins/{pid}")
def pin_drop(pid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, *VP); p = get_or_404(db, PinProposal, pid, "Proposal"); c = conv_for(db, p.conv_id, u)
    if p.status == "open" and p.user_id != u.id: raise HTTPException(403, "Only who proposed it can withdraw it")
    p.status = "dropped"; db.commit(); return pin_board(db, c, u)

# =====================================================================
# admin overview
# =====================================================================
@router.get("/admin/addons/b9")
def admin_b9(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    wk = now_ms() - 7 * DAY
    cnt = lambda m: db.scalar(select(func.count()).select_from(m).where(m.at > wk)) or 0  # noqa: E731
    rows = [("Confession Box", "confessionBox", Confession), ("Time Zone Board", "timeZoneBoard", TzEntry), ("Read-Later Shelf", "readLaterShelf", ShelfItem),
            ("Study Sprint", "studySprint", Sprint), ("Shared Budget", "sharedBudget", BudgetSpend), ("Vote to Pin", "voteToPin", PinProposal)]
    return {"title": "Hush · Chat Tools", "module": "hush",
            "items": [{"name": n, "flag": f"addons.hush.{k}", "on": bool(on(db, None, f"addons.hush.{k}")), "week": cnt(m)} for n, k, m in rows]}
