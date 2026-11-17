"""VibeLoop add-ons, batch 6 (Hush) — all live inside a chat; members only; each switchable in User App Settings (addons.hush.*).

  Check-in Circle  group chats get a daily "how are you?" — members answer with a mood 1–5 + note; 7-day strip per member.
  Plan Board       shared events (title, time, place); members RSVP yes / maybe / no; upcoming list.
  Birthday Buddy   members opt in a month/day for this chat; upcoming list; members get a push the day before.
  Ride Rota        a driver posts a trip with seats; members claim / release seats; the driver closes it.
  Decision Dice    a question with options; members vote, then the creator settles by top vote or a server-side roll.
  Gift Pool        a group gift: target amount, members pledge, progress; organiser marks purchased. No money moves.
"""
import secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import String, Integer, BigInteger, Boolean, JSON, ForeignKey, UniqueConstraint, select, func
from sqlalchemy.orm import Session, Mapped, mapped_column
from .db import get_db
from . import models as M
from .models import Base, nid, now_ms
from .security import current_user, require, audit
from .routes_addons import on, need, push, who, conv_for, DAY

router = APIRouter()
STAFF = require("owner", "admin", "moderator", "support")
UID = lambda: ForeignKey("users.id", ondelete="CASCADE")

# =====================================================================
# Models
# =====================================================================
class B6CheckIn(Base):
    __tablename__ = "b6_checkins"
    __table_args__ = (UniqueConstraint("conv_id", "user_id", "day", name="uq_b6_checkin_day"),)
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("ck"))
    conv_id: Mapped[str] = mapped_column(String(40), index=True); user_id: Mapped[str] = mapped_column(UID(), index=True)
    day: Mapped[str] = mapped_column(String(10), index=True); mood: Mapped[int] = mapped_column(Integer)
    note: Mapped[str] = mapped_column(String(140), default=""); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class B6Plan(Base):
    __tablename__ = "b6_plans"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("pl"))
    conv_id: Mapped[str] = mapped_column(String(40), index=True); created_by: Mapped[str] = mapped_column(UID(), index=True)
    title: Mapped[str] = mapped_column(String(80)); place: Mapped[str] = mapped_column(String(120), default="")
    starts_at: Mapped[int] = mapped_column(BigInteger, index=True); rsvps: Mapped[dict] = mapped_column(JSON, default=dict)
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class B6Birthday(Base):
    __tablename__ = "b6_birthdays"
    __table_args__ = (UniqueConstraint("conv_id", "user_id", name="uq_b6_birthday_member"),)
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("bd"))
    conv_id: Mapped[str] = mapped_column(String(40), index=True); user_id: Mapped[str] = mapped_column(UID(), index=True)
    month: Mapped[int] = mapped_column(Integer); day: Mapped[int] = mapped_column(Integer)
    reminded: Mapped[str] = mapped_column(String(10), default="")  # date (YYYY-MM-DD) of the last birthday we reminded for
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class B6Ride(Base):
    __tablename__ = "b6_rides"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("rd"))
    conv_id: Mapped[str] = mapped_column(String(40), index=True); driver_id: Mapped[str] = mapped_column(UID(), index=True)
    dest: Mapped[str] = mapped_column(String(120)); leaves_at: Mapped[int] = mapped_column(BigInteger)
    seats: Mapped[int] = mapped_column(Integer); riders: Mapped[list] = mapped_column(JSON, default=list)
    closed: Mapped[bool] = mapped_column(Boolean, default=False); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class B6Dice(Base):
    __tablename__ = "b6_dice"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("dd"))
    conv_id: Mapped[str] = mapped_column(String(40), index=True); created_by: Mapped[str] = mapped_column(UID(), index=True)
    question: Mapped[str] = mapped_column(String(120)); options: Mapped[list] = mapped_column(JSON, default=list)
    votes: Mapped[dict] = mapped_column(JSON, default=dict); result: Mapped[int | None] = mapped_column(Integer, nullable=True)
    method: Mapped[str] = mapped_column(String(10), default=""); settled_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class B6Gift(Base):
    __tablename__ = "b6_gifts"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("gp"))
    conv_id: Mapped[str] = mapped_column(String(40), index=True); organiser_id: Mapped[str] = mapped_column(UID(), index=True)
    for_name: Mapped[str] = mapped_column(String(80)); idea: Mapped[str] = mapped_column(String(140), default="")
    target: Mapped[int] = mapped_column(Integer); currency: Mapped[str] = mapped_column(String(3), default="INR")
    pledges: Mapped[dict] = mapped_column(JSON, default=dict); purchased: Mapped[bool] = mapped_column(Boolean, default=False)
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

def today() -> str: return datetime.now(timezone.utc).strftime("%Y-%m-%d")
def others(c: M.Conv, me: str): return [m for m in c.members if m != me]
def gone(x, name: str):
    if not x: raise HTTPException(404, f"{name} not found")
    return x

# =====================================================================
# Check-in Circle
# =====================================================================
F_CK = "addons.hush.checkInCircle"
class CheckIn(BaseModel): mood: int = Field(ge=1, le=5); note: str = Field(default="", max_length=140)

def circle(db: Session, c: M.Conv, u: M.User) -> dict:
    days = [(datetime.now(timezone.utc).date() - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    rows = db.scalars(select(B6CheckIn).where(B6CheckIn.conv_id == c.id, B6CheckIn.day.in_(days))).all()
    by = {(r.user_id, r.day): r for r in rows}
    members = [{"user": who(db, m), "strip": [{"day": d, "mood": by[(m, d)].mood if (m, d) in by else None, "note": by[(m, d)].note if (m, d) in by else ""} for d in days]} for m in c.members]
    mine = by.get((u.id, today()))
    return {"prompt": "How are you today?", "day": today(), "days": days, "answered": bool(mine), "members": members,
            "todayCount": sum(1 for r in rows if r.day == today())}

@router.get("/addons/b6/convs/{cid}/checkins")
def checkin_get(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_CK, "Check-in Circle"); c = conv_for(db, cid, u)
    if not c.group: raise HTTPException(400, "Check-in Circle is for group chats")
    return circle(db, c, u)

@router.post("/addons/b6/convs/{cid}/checkins")
def checkin_post(cid: str, b: CheckIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_CK, "Check-in Circle"); c = conv_for(db, cid, u)
    if not c.group: raise HTTPException(400, "Check-in Circle is for group chats")
    d = today(); r = db.scalar(select(B6CheckIn).where(B6CheckIn.conv_id == c.id, B6CheckIn.user_id == u.id, B6CheckIn.day == d))
    first = not db.scalar(select(func.count()).select_from(B6CheckIn).where(B6CheckIn.conv_id == c.id, B6CheckIn.day == d))
    if r: r.mood = b.mood; r.note = b.note.strip()
    else: db.add(B6CheckIn(conv_id=c.id, user_id=u.id, day=d, mood=b.mood, note=b.note.strip()))
    db.commit()
    if first:  # the first answer of the day nudges the rest of the circle
        for m in others(c, u.id): push(m, "How are you today?", f"{u.name} checked in — your circle is waiting", "CheckInCircle", {"convId": c.id})
    return circle(db, c, u)

# =====================================================================
# Plan Board
# =====================================================================
F_PL = "addons.hush.planBoard"
class PlanIn(BaseModel): title: str = Field(min_length=1, max_length=80); place: str = Field(default="", max_length=120); startsAt: int
class Rsvp(BaseModel): answer: str = Field(pattern=r"^(yes|maybe|no)$")

def plan_json(db: Session, p: B6Plan, u: M.User) -> dict:
    r = p.rsvps or {}
    return {"id": p.id, "title": p.title, "place": p.place, "startsAt": p.starts_at, "createdBy": who(db, p.created_by), "mine": p.created_by == u.id,
            "me": r.get(u.id), "counts": {k: sum(1 for v in r.values() if v == k) for k in ("yes", "maybe", "no")},
            "rsvps": [{"user": who(db, k), "answer": v} for k, v in r.items()]}

@router.get("/addons/b6/convs/{cid}/plans")
def plan_list(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_PL, "Plan Board"); c = conv_for(db, cid, u)
    rows = db.scalars(select(B6Plan).where(B6Plan.conv_id == c.id, B6Plan.starts_at >= now_ms() - 3_600_000).order_by(B6Plan.starts_at).limit(100)).all()
    return [plan_json(db, p, u) for p in rows]

@router.post("/addons/b6/convs/{cid}/plans")
def plan_create(cid: str, b: PlanIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_PL, "Plan Board"); c = conv_for(db, cid, u)
    if not now_ms() < b.startsAt < now_ms() + 365 * DAY: raise HTTPException(400, "Pick a time in the next year")
    p = B6Plan(conv_id=c.id, created_by=u.id, title=b.title.strip(), place=b.place.strip(), starts_at=b.startsAt, rsvps={u.id: "yes"})
    db.add(p); db.commit()
    for m in others(c, u.id): push(m, f"New plan: {p.title}", f"{u.name} added a plan — are you in?", "PlanBoard", {"convId": c.id})
    return plan_json(db, p, u)

@router.post("/addons/b6/plans/{pid}/rsvp")
def plan_rsvp(pid: str, b: Rsvp, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_PL, "Plan Board"); p = gone(db.get(B6Plan, pid), "Plan"); conv_for(db, p.conv_id, u)
    if p.starts_at < now_ms(): raise HTTPException(400, "This plan has already started")
    p.rsvps = {**(p.rsvps or {}), u.id: b.answer}; db.commit(); return plan_json(db, p, u)

@router.delete("/addons/b6/plans/{pid}")
def plan_delete(pid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_PL, "Plan Board"); p = gone(db.get(B6Plan, pid), "Plan"); conv_for(db, p.conv_id, u)
    if p.created_by != u.id: raise HTTPException(403, "Only the person who added the plan can remove it")
    db.delete(p); db.commit(); return {"ok": True}

# =====================================================================
# Birthday Buddy
# =====================================================================
F_BD = "addons.hush.birthdayBuddy"
class BdayIn(BaseModel): month: int = Field(ge=1, le=12); day: int = Field(ge=1, le=31)

def next_bday(month: int, day: int, base) -> "datetime.date":
    for y in (base.year, base.year + 1, base.year + 2, base.year + 3, base.year + 4):
        try:
            d = base.replace(year=y, month=month, day=day)
            if d >= base: return d
        except ValueError: continue  # 29 Feb in a non-leap year
    return base

def remind_due(db: Session, conv_ids: list[str] | None = None) -> int:
    """Push "birthday tomorrow" to the other members — once per birthday. Called on read and from addons loops."""
    tmr = datetime.now(timezone.utc).date() + timedelta(days=1); n = 0
    q = select(B6Birthday).where(B6Birthday.month == tmr.month, B6Birthday.day == tmr.day, B6Birthday.reminded != tmr.isoformat())
    if conv_ids is not None: q = q.where(B6Birthday.conv_id.in_(conv_ids or ["-"]))
    for b in db.scalars(q).all():
        c = db.get(M.Conv, b.conv_id); u = db.get(M.User, b.user_id)
        if c and u and u.id in c.members and on(db, None, F_BD):
            for m in others(c, u.id): push(m, f"{u.name}'s birthday is tomorrow", "Plan something sweet with the chat", "BirthdayBuddy", {"convId": c.id}); n += 1
        b.reminded = tmr.isoformat()
    db.commit(); return n

@router.get("/addons/b6/convs/{cid}/birthdays")
def bday_list(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_BD, "Birthday Buddy"); c = conv_for(db, cid, u); remind_due(db, [c.id])
    base = datetime.now(timezone.utc).date()
    rows = [b for b in db.scalars(select(B6Birthday).where(B6Birthday.conv_id == c.id)).all() if b.user_id in c.members]
    out = sorted(({"user": who(db, b.user_id), "month": b.month, "day": b.day, "mine": b.user_id == u.id,
                   "inDays": (next_bday(b.month, b.day, base) - base).days} for b in rows), key=lambda x: x["inDays"])
    mine = next((b for b in rows if b.user_id == u.id), None)
    return {"upcoming": out, "mine": {"month": mine.month, "day": mine.day} if mine else None}

@router.put("/addons/b6/convs/{cid}/birthdays")
def bday_set(cid: str, b: BdayIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_BD, "Birthday Buddy"); c = conv_for(db, cid, u)
    try: datetime(2024, b.month, b.day)  # leap year, so 29 Feb is fine
    except ValueError: raise HTTPException(400, "That date doesn't exist")
    r = db.scalar(select(B6Birthday).where(B6Birthday.conv_id == c.id, B6Birthday.user_id == u.id))
    if r: r.month, r.day, r.reminded = b.month, b.day, ""
    else: db.add(B6Birthday(conv_id=c.id, user_id=u.id, month=b.month, day=b.day))
    db.commit(); return bday_list(cid, u, db)

@router.delete("/addons/b6/convs/{cid}/birthdays")
def bday_remove(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_BD, "Birthday Buddy"); c = conv_for(db, cid, u)
    if r := db.scalar(select(B6Birthday).where(B6Birthday.conv_id == c.id, B6Birthday.user_id == u.id)): db.delete(r)
    db.commit(); return {"ok": True}

# =====================================================================
# Ride Rota
# =====================================================================
F_RD = "addons.hush.rideRota"
class RideIn(BaseModel): dest: str = Field(min_length=1, max_length=120); leavesAt: int; seats: int = Field(ge=1, le=50)
class RideAct(BaseModel): action: str = Field(pattern=r"^(claim|release|close)$")

def ride_json(db: Session, r: B6Ride, u: M.User) -> dict:
    return {"id": r.id, "dest": r.dest, "leavesAt": r.leaves_at, "seats": r.seats, "left": r.seats - len(r.riders or []), "closed": r.closed,
            "driver": who(db, r.driver_id), "isDriver": r.driver_id == u.id, "riding": u.id in (r.riders or []), "riders": [who(db, x) for x in (r.riders or [])]}

@router.get("/addons/b6/convs/{cid}/rides")
def ride_list(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_RD, "Ride Rota"); c = conv_for(db, cid, u)
    rows = db.scalars(select(B6Ride).where(B6Ride.conv_id == c.id, B6Ride.leaves_at >= now_ms() - DAY).order_by(B6Ride.closed, B6Ride.leaves_at).limit(50)).all()
    return [ride_json(db, r, u) for r in rows]

@router.post("/addons/b6/convs/{cid}/rides")
def ride_create(cid: str, b: RideIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_RD, "Ride Rota"); c = conv_for(db, cid, u)
    if b.seats > (mx := on(db, u, "addons.hush.rideMaxSeats")): raise HTTPException(400, f"Up to {mx} seats per trip")
    if not now_ms() < b.leavesAt < now_ms() + 90 * DAY: raise HTTPException(400, "Pick a departure in the next 90 days")
    r = B6Ride(conv_id=c.id, driver_id=u.id, dest=b.dest.strip(), leaves_at=b.leavesAt, seats=b.seats, riders=[]); db.add(r); db.commit()
    for m in others(c, u.id): push(m, f"{u.name} is driving", f"{b.seats} seat{'s' if b.seats > 1 else ''} to {r.dest}", "RideRota", {"convId": c.id})
    return ride_json(db, r, u)

@router.post("/addons/b6/rides/{rid}")
def ride_act(rid: str, b: RideAct, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_RD, "Ride Rota"); r = gone(db.get(B6Ride, rid), "Trip"); c = conv_for(db, r.conv_id, u)
    riders = list(r.riders or [])
    if b.action == "close":
        if r.driver_id != u.id: raise HTTPException(403, "Only the driver can close the trip")
        r.closed = True
        for x in riders: push(x, "Ride locked in", f"{u.name} closed the trip to {r.dest}", "RideRota", {"convId": c.id})
    elif r.closed: raise HTTPException(400, "This trip is closed")
    elif b.action == "claim":
        if u.id == r.driver_id: raise HTTPException(400, "You're the driver")
        if u.id not in riders:
            if len(riders) >= r.seats: raise HTTPException(409, "No seats left")
            riders.append(u.id); push(r.driver_id, "Seat claimed", f"{u.name} is riding with you to {r.dest}", "RideRota", {"convId": c.id})
    else: riders = [x for x in riders if x != u.id]
    r.riders = riders; db.commit(); return ride_json(db, r, u)

# =====================================================================
# Decision Dice
# =====================================================================
F_DD = "addons.hush.decisionDice"
class DiceIn(BaseModel): question: str = Field(min_length=1, max_length=120); options: list[str] = Field(min_length=2, max_length=20)
class Vote(BaseModel): option: int = Field(ge=0)
class Settle(BaseModel): method: str = Field(pattern=r"^(vote|roll)$")

def dice_json(db: Session, d: B6Dice, u: M.User) -> dict:
    v = d.votes or {}
    return {"id": d.id, "question": d.question, "createdBy": who(db, d.created_by), "mine": d.created_by == u.id, "myVote": v.get(u.id),
            "options": [{"i": i, "text": t, "votes": sum(1 for x in v.values() if x == i)} for i, t in enumerate(d.options)],
            "result": d.result, "resultText": d.options[d.result] if d.result is not None else None, "method": d.method, "settledAt": d.settled_at, "at": d.at}

@router.get("/addons/b6/convs/{cid}/dice")
def dice_list(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_DD, "Decision Dice"); c = conv_for(db, cid, u)
    return [dice_json(db, d, u) for d in db.scalars(select(B6Dice).where(B6Dice.conv_id == c.id).order_by(B6Dice.at.desc()).limit(50))]

@router.post("/addons/b6/convs/{cid}/dice")
def dice_create(cid: str, b: DiceIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_DD, "Decision Dice"); c = conv_for(db, cid, u)
    opts = list({o.strip()[:60].lower(): o.strip()[:60] for o in reversed(b.options) if o.strip()}.values())[::-1]
    if len(opts) < 2: raise HTTPException(400, "Give at least two different options")
    if len(opts) > (mx := on(db, u, "addons.hush.diceMaxOptions")): raise HTTPException(400, f"Up to {mx} options")
    d = B6Dice(conv_id=c.id, created_by=u.id, question=b.question.strip(), options=opts, votes={}); db.add(d); db.commit()
    for m in others(c, u.id): push(m, "Help decide", f"{u.name}: {d.question}", "DecisionDice", {"convId": c.id})
    return dice_json(db, d, u)

@router.post("/addons/b6/dice/{did}/vote")
def dice_vote(did: str, b: Vote, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_DD, "Decision Dice"); d = gone(db.get(B6Dice, did), "Decision"); conv_for(db, d.conv_id, u)
    if d.result is not None: raise HTTPException(400, "Already decided")
    if b.option >= len(d.options): raise HTTPException(400, "No such option")
    d.votes = {**(d.votes or {}), u.id: b.option}; db.commit(); return dice_json(db, d, u)

@router.post("/addons/b6/dice/{did}/settle")
def dice_settle(did: str, b: Settle, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_DD, "Decision Dice"); d = gone(db.get(B6Dice, did), "Decision"); c = conv_for(db, d.conv_id, u)
    if d.created_by != u.id: raise HTTPException(403, "Only the person who asked can settle it")
    if d.result is not None: raise HTTPException(400, "Already decided")
    counts = [sum(1 for x in (d.votes or {}).values() if x == i) for i in range(len(d.options))]
    if b.method == "vote":
        if not any(counts): raise HTTPException(400, "No votes yet — roll instead")
        top = [i for i, n in enumerate(counts) if n == max(counts)]
        d.result = top[0] if len(top) == 1 else secrets.choice(top)  # ties broken by the dice
    else: d.result = secrets.randbelow(len(d.options))
    d.method = b.method; d.settled_at = now_ms(); db.commit()
    for m in others(c, u.id): push(m, "Decided!", f"{d.question} → {d.options[d.result]}", "DecisionDice", {"convId": c.id})
    return dice_json(db, d, u)

# =====================================================================
# Gift Pool
# =====================================================================
F_GP = "addons.hush.giftPool"
class GiftIn(BaseModel):
    forName: str = Field(min_length=1, max_length=80); idea: str = Field(default="", max_length=140)
    target: int = Field(gt=0, le=100_000_000); currency: str = Field(default="INR", pattern=r"^[A-Z]{3}$")
class Pledge(BaseModel): amount: int = Field(ge=0, le=100_000_000)  # 0 withdraws

def gift_json(db: Session, g: B6Gift, u: M.User) -> dict:
    p = g.pledges or {}; total = sum(p.values())
    return {"id": g.id, "forName": g.for_name, "idea": g.idea, "target": g.target, "currency": g.currency, "purchased": g.purchased,
            "organiser": who(db, g.organiser_id), "isOrganiser": g.organiser_id == u.id, "pledged": total, "pct": min(100, round(100 * total / g.target)),
            "myPledge": p.get(u.id, 0), "pledges": [{"user": who(db, k), "amount": v} for k, v in sorted(p.items(), key=lambda x: -x[1])], "at": g.at}

@router.get("/addons/b6/convs/{cid}/gifts")
def gift_list(cid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_GP, "Gift Pool"); c = conv_for(db, cid, u)
    return [gift_json(db, g, u) for g in db.scalars(select(B6Gift).where(B6Gift.conv_id == c.id).order_by(B6Gift.purchased, B6Gift.at.desc()).limit(50))]

@router.post("/addons/b6/convs/{cid}/gifts")
def gift_create(cid: str, b: GiftIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_GP, "Gift Pool"); c = conv_for(db, cid, u)
    if b.target > (mx := on(db, u, "addons.hush.giftMaxTarget")) * 100: raise HTTPException(400, f"Targets go up to {mx}")
    g = B6Gift(conv_id=c.id, organiser_id=u.id, for_name=b.forName.strip(), idea=b.idea.strip(), target=b.target, currency=b.currency, pledges={})
    db.add(g); db.commit()
    for m in others(c, u.id): push(m, f"Gift Pool for {g.for_name}", f"{u.name} started a group gift — chip in?", "GiftPool", {"convId": c.id})
    return gift_json(db, g, u)

@router.post("/addons/b6/gifts/{gid}/pledge")
def gift_pledge(gid: str, b: Pledge, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_GP, "Gift Pool"); g = gone(db.get(B6Gift, gid), "Gift Pool"); conv_for(db, g.conv_id, u)
    if g.purchased: raise HTTPException(400, "The gift is already bought")
    p = dict(g.pledges or {})
    if b.amount: p[u.id] = b.amount
    else: p.pop(u.id, None)
    g.pledges = p; db.commit(); return gift_json(db, g, u)

@router.post("/addons/b6/gifts/{gid}/purchased")
def gift_purchased(gid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    need(db, u, F_GP, "Gift Pool"); g = gone(db.get(B6Gift, gid), "Gift Pool"); conv_for(db, g.conv_id, u)
    if g.organiser_id != u.id: raise HTTPException(403, "Only the organiser can mark it bought")
    g.purchased = True; db.commit()
    for m in (g.pledges or {}):
        if m != u.id: push(m, "Gift bought!", f"The gift for {g.for_name} is sorted — settle your pledge with {u.name}", "GiftPool", {"convId": g.conv_id})
    return gift_json(db, g, u)

# =====================================================================
# Admin
# =====================================================================
ITEMS = [("Check-in Circle", "checkInCircle", B6CheckIn), ("Plan Board", "planBoard", B6Plan), ("Birthday Buddy", "birthdayBuddy", B6Birthday),
         ("Ride Rota", "rideRota", B6Ride), ("Decision Dice", "decisionDice", B6Dice), ("Gift Pool", "giftPool", B6Gift)]

@router.get("/admin/addons/b6")
def admin_b6(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    since = now_ms() - 7 * DAY
    return {"title": "Hush · Together in chats", "module": "hush",
            "items": [{"name": n, "flag": f"addons.hush.{k}", "on": bool(on(db, None, f"addons.hush.{k}")),
                       "week": db.scalar(select(func.count()).select_from(T).where(T.at > since)) or 0} for n, k, T in ITEMS]}

@router.post("/admin/addons/b6/birthdays/remind")
def admin_b6_remind(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    n = remind_due(db); audit(db, a.handle, "addons.b6_bday_remind", str(n)); db.commit(); return {"sent": n}
