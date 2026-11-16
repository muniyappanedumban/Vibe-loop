"""v3 money: admin-switchable subscriptions, tips, platform fees. Everything is OFF unless the admin turns it on.
No fake payments: orders get a real provider payment link, and only a signature-verified webhook marks them paid."""
import json, logging
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Body, Request, Header
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .db import get_db
from . import models as M
from .security import current_user, require, audit
from . import config_resolver as R
from .routes_integrations import get_config
from .providers import razorpay, cashfree
from .providers.common import ProviderError

log = logging.getLogger("vibeloop.money")
router = APIRouter()
STAFF = require("owner")
FLAGS = ["money", "subscriptions", "store", "tips", "ads", "platformFees"]
DEFAULT_SETTINGS = {**{k: False for k in FLAGS}, "feePercent": 8.0, "minPayout": 50000, "currency": "INR"}
DEFAULT_COUNTRIES = {"IN": {"currency": "INR", "symbol": "₹"}, "US": {"currency": "USD", "symbol": "$"}, "GB": {"currency": "GBP", "symbol": "£"}, "AE": {"currency": "AED", "symbol": "AED "}}
NOT_CONFIGURED = "Payments not configured by admin"
MONTH_MS = 30 * 86_400_000

def kvget(db, ns, key, default):
    r = db.get(M.KV, (ns, key)); return r.value if r else default
def settings(db: Session) -> dict: return {**DEFAULT_SETTINGS, **kvget(db, "money", "settings", {})}
def countries(db: Session) -> dict: return kvget(db, "money", "countries", DEFAULT_COUNTRIES)
def country_of(u: M.User) -> str: return ((u.profile or {}).get("country") or "IN").upper()[:2]

def feature_on(db: Session, u: M.User | None, flag: str) -> bool:
    f = R.resolve(db, u)["features"]
    return bool(f.get("money")) and (flag == "money" or bool(f.get(flag)))
def gate(db: Session, u: M.User | None, flag: str):
    if not feature_on(db, u, flag): raise HTTPException(403, "Not enabled")

def display(amount: int, symbol: str) -> str:
    v = amount / 100
    return f"{symbol}{v:,.0f}" if amount % 100 == 0 else f"{symbol}{v:,.2f}"
def price_for(db: Session, prices: dict, country: str) -> dict | None:
    """Caller's country price if both the plan and the country table have it; else INR (IN)."""
    cs = countries(db)
    for c in (country, "IN"):
        if c in prices and c in cs and isinstance(prices[c], int):
            return {"amount": prices[c], "currency": cs[c]["currency"], "display": display(prices[c], cs[c]["symbol"]), "country": c}
    return None
def inr(amount: int, currency: str = "INR") -> dict:
    sym = next((c["symbol"] for c in DEFAULT_COUNTRIES.values() if c["currency"] == currency), currency + " ")
    return {"amount": amount, "currency": currency, "display": display(amount, sym)}

def plan_json(db, p: M.Plan, country: str) -> dict:
    return {"id": p.id, "name": p.name, "perks": p.perks or [], "period": p.period, "price": price_for(db, p.prices or {}, country), "demo": p.demo}

def order_json(o: M.Order) -> dict:
    return {"id": o.id, "kind": o.kind, "refId": o.ref_id, "creatorId": o.creator_id, "amount": o.amount, "currency": o.currency, "provider": o.provider,
            "status": o.status, "fee": o.fee, "payUrl": o.pay_url, "testMode": o.test_mode, "at": o.at, "paidAt": o.paid_at, "note": o.note}

def create_order(db: Session, u: M.User, *, kind: str, ref_id: str, creator_id: str | None, amount: int, currency: str, provider: str, description: str, note: str = "") -> dict:
    """Creates the order + a real hosted payment link. 409 when the admin hasn't configured the provider."""
    cfg = get_config(db, provider)
    if not cfg: raise HTTPException(409, NOT_CONFIGURED)
    o = M.Order(user_id=u.id, kind=kind, ref_id=ref_id, creator_id=creator_id, amount=amount, currency=currency, provider=provider,
                test_mode=cfg.get("mode") != "live", note=note[:200])
    db.add(o); db.flush()
    try:
        if provider == "razorpay": link = razorpay.create_link(cfg, order_id=o.id, amount=amount, currency=currency, description=description, email=u.email, name=u.name)
        else: link = cashfree.create_link(cfg, order_id=o.id, amount=amount, currency=currency, description=description, email=u.email, name=u.name, phone=(u.profile or {}).get("phone"))
    except ProviderError as e:
        db.rollback(); raise HTTPException(502, str(e))
    o.provider_ref, o.pay_url = link["ref"], link["url"]
    audit(db, u.handle, f"order.create", f"{o.id} {kind} {amount} {currency} via {provider}"); db.commit()
    return {"orderId": o.id, "status": o.status, "payUrl": o.pay_url, "provider": provider, "testMode": o.test_mode,
            "message": "Opens the payment page. Your order is confirmed only after the payment provider confirms it." + (" (test mode — no real money)" if o.test_mode else "")}

def mark_paid(db: Session, order_id: str | None, provider: str) -> M.Order | None:
    o = db.get(M.Order, order_id) if order_id else None
    if not o or o.provider != provider or o.status == "paid": return o
    s = settings(db)
    o.status, o.paid_at = "paid", M.now_ms()
    o.fee = round(o.amount * float(s["feePercent"]) / 100) if s.get("platformFees") and o.kind != "subscription" else 0
    if o.kind == "subscription":
        db.add(M.Subscription(user_id=o.user_id, plan_id=o.ref_id, status="active", renews_at=o.paid_at + MONTH_MS, order_id=o.id))
    if o.kind == "product" and (p := db.get(M.Product, o.ref_id)) and p.stock is not None: p.stock = max(0, p.stock - 1)
    audit(db, f"webhook:{provider}", "order.paid", f"{o.id} {o.amount} fee {o.fee}")
    return o

# ---------- app endpoints ----------
@router.get("/money/plans")
def plans(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    gate(db, u, "subscriptions"); c = country_of(u)
    return [plan_json(db, p, c) for p in db.scalars(select(M.Plan).where(M.Plan.active == True).order_by(M.Plan.sort, M.Plan.at))]  # noqa: E712

class SubscribeIn(BaseModel): planId: str = Field(max_length=40); provider: Literal["razorpay", "cashfree"] = "razorpay"
@router.post("/money/subscribe")
def subscribe(b: SubscribeIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    gate(db, u, "subscriptions")
    p = db.get(M.Plan, b.planId)
    if not p or not p.active: raise HTTPException(404, "Plan not found")
    pr = price_for(db, p.prices or {}, country_of(u))
    if not pr: raise HTTPException(400, "This plan has no price for your country")
    return create_order(db, u, kind="subscription", ref_id=p.id, creator_id=None, amount=pr["amount"], currency=pr["currency"], provider=b.provider, description=f"{p.name} ({p.period})")

class TipIn(BaseModel):
    to: str = Field(max_length=40); amount: int = Field(ge=100, le=10_000_000); provider: Literal["razorpay", "cashfree"] = "razorpay"; note: str = Field(default="", max_length=200)
@router.post("/money/tips")
def tip(b: TipIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    gate(db, u, "tips")
    to = db.get(M.User, b.to)
    if not to or to.suspended: raise HTTPException(404, "User not found")
    if to.id == u.id: raise HTTPException(400, "You can't tip yourself")
    return create_order(db, u, kind="tip", ref_id=to.id, creator_id=to.id, amount=b.amount, currency="INR", provider=b.provider, description=f"Props for {to.handle}", note=b.note)

@router.get("/money/me")
def money_me(u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    gate(db, u, "money")
    sub = db.scalar(select(M.Subscription).where(M.Subscription.user_id == u.id, M.Subscription.status == "active").order_by(M.Subscription.at.desc()))
    paid = db.scalars(select(M.Order).where(M.Order.creator_id == u.id, M.Order.status == "paid")).all()
    inc = {"tips": sum(o.amount for o in paid if o.kind == "tip"), "store": sum(o.amount for o in paid if o.kind == "product"), "subs": 0, "fees": sum(o.fee for o in paid)}
    inc["net"] = inc["tips"] + inc["store"] + inc["subs"] - inc["fees"]
    orders = db.scalars(select(M.Order).where(M.Order.user_id == u.id).order_by(M.Order.at.desc()).limit(50)).all()
    return {"subscription": {"planId": sub.plan_id, "status": sub.status, "renewsAt": sub.renews_at} if sub else None, "income": inc, "currency": "INR",
            "orders": [order_json(o) for o in orders]}

# ---------- webhooks (signature-verified only) ----------
def _secret(db, name, *keys):
    cfg = get_config(db, name) or {}
    return next((cfg[k] for k in keys if cfg.get(k)), None)

@router.post("/webhooks/razorpay")
async def wh_razorpay(req: Request, x_razorpay_signature: str | None = Header(default=None), db: Session = Depends(get_db)):
    body = await req.body()
    if not razorpay.verify_webhook(_secret(db, "razorpay", "webhookSecret") or "", body, x_razorpay_signature):
        log.warning("razorpay webhook rejected: bad signature"); raise HTTPException(401, "Invalid signature")
    try: ev = json.loads(body)
    except ValueError: raise HTTPException(400, "Bad JSON")
    o = mark_paid(db, razorpay.paid_reference(ev), "razorpay"); db.commit()
    return {"ok": True, "order": o.id if o else None, "status": o.status if o else None}

@router.post("/webhooks/cashfree")
async def wh_cashfree(req: Request, x_webhook_signature: str | None = Header(default=None), x_webhook_timestamp: str | None = Header(default=None), db: Session = Depends(get_db)):
    body = await req.body()
    if not cashfree.verify_webhook(_secret(db, "cashfree", "webhookSecret", "secretKey") or "", x_webhook_timestamp, body, x_webhook_signature):
        log.warning("cashfree webhook rejected: bad signature"); raise HTTPException(401, "Invalid signature")
    try: ev = json.loads(body)
    except ValueError: raise HTTPException(400, "Bad JSON")
    o = mark_paid(db, cashfree.paid_reference(ev), "cashfree"); db.commit()
    return {"ok": True, "order": o.id if o else None, "status": o.status if o else None}

# ---------- admin ----------
@router.get("/admin/money/settings")
def get_settings(a: M.User = Depends(STAFF), db: Session = Depends(get_db)): return settings(db)

@router.put("/admin/money/settings")
def put_settings(b: dict = Body(...), a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    s = settings(db)
    for k, v in b.items():
        if k in FLAGS:
            if not isinstance(v, bool): raise HTTPException(400, f"{k} must be true/false")
        elif k == "feePercent":
            if not isinstance(v, (int, float)) or not 0 <= v <= 50: raise HTTPException(400, "feePercent must be 0–50")
        elif k == "minPayout":
            if not isinstance(v, int) or not 0 <= v <= 100_000_000: raise HTTPException(400, "minPayout is in paise (0–₹10,00,000)")
        elif k == "currency":
            if v != "INR": raise HTTPException(400, "Only INR is supported as the base currency")
        else: raise HTTPException(400, f"Unknown setting: {k}")
        s[k] = v
    db.merge(M.KV(ns="money", key="settings", value=s))
    # mirror into the config base layer so the app (and server gates) see the same switches
    layers = R.layers(db); base = dict(layers.get("base") or {})
    base["features"] = {**(base.get("features") or {}), **{k: bool(s[k]) for k in FLAGS}}
    base["fees"] = {**(base.get("fees") or {}), "platformFee": round(float(s["feePercent"]) / 100, 4)}
    if err := R.validate_layer("base", base, layers): raise HTTPException(400, err)
    db.merge(M.KV(ns="config", key="base", value=base))
    from .routes_config import bump
    v = bump(db); audit(db, a.handle, "money.settings", f"{json.dumps({k: s[k] for k in FLAGS})} fee {s['feePercent']}% v{v}"); db.commit()
    return {**s, "configVersion": v}

class PlanIn(BaseModel):
    id: str | None = Field(default=None, pattern=r"^[\w-]{3,40}$"); name: str = Field(min_length=1, max_length=80)
    perks: list[str] = Field(default_factory=list, max_length=10); period: Literal["month", "year"] = "month"
    prices: dict[str, int] = Field(default_factory=dict); active: bool = True; sort: int = 0
def admin_plan_json(p: M.Plan) -> dict:
    return {"id": p.id, "name": p.name, "perks": p.perks, "period": p.period, "prices": p.prices, "active": p.active, "demo": p.demo, "sort": p.sort}

@router.get("/admin/money/plans")
def admin_plans(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    return [admin_plan_json(p) for p in db.scalars(select(M.Plan).order_by(M.Plan.sort, M.Plan.at))]

@router.put("/admin/money/plans")
def put_plans(items: list[PlanIn] = Body(...), a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    """Full replace: plans not in the list are deactivated (kept for order history)."""
    cs = countries(db); keep = set()
    for it in items:
        for c, amt in it.prices.items():
            if c not in cs: raise HTTPException(400, f"{it.name}: add {c} to country pricing first")
            if amt < 0 or amt > 100_000_000: raise HTTPException(400, f"{it.name}: price for {c} is out of range")
        if any(not x.strip() or len(x) > 100 for x in it.perks): raise HTTPException(400, "Perks are 1–100 characters")
        p = db.get(M.Plan, it.id) if it.id else None
        if not p: p = M.Plan(id=it.id or M.nid("plan")); db.add(p)
        p.name, p.perks, p.period, p.prices, p.active, p.sort = it.name.strip(), [x.strip() for x in it.perks], it.period, it.prices, it.active, it.sort
        keep.add(p.id)
    db.flush()
    for p in db.scalars(select(M.Plan)):
        if p.id not in keep: p.active = False
    audit(db, a.handle, "money.plans", ",".join(sorted(keep))); db.commit()
    return admin_plans(a, db)

@router.get("/admin/money/country-pricing")
def get_countries(a: M.User = Depends(STAFF), db: Session = Depends(get_db)): return countries(db)
@router.put("/admin/money/country-pricing")
def put_countries(b: dict = Body(...), a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    if "IN" not in b: raise HTTPException(400, "IN (INR) is the base country and must stay")
    for c, v in b.items():
        if not (len(c) == 2 and c.isalpha() and c.isupper()): raise HTTPException(400, f"{c}: use an ISO2 code like US")
        if not isinstance(v, dict) or not isinstance(v.get("currency"), str) or len(v["currency"]) != 3 or not isinstance(v.get("symbol"), str) or not 1 <= len(v["symbol"]) <= 5:
            raise HTTPException(400, f"{c}: needs a 3-letter currency and a symbol")
    val = {c: {"currency": v["currency"].upper(), "symbol": v["symbol"]} for c, v in b.items()}
    db.merge(M.KV(ns="money", key="countries", value=val)); audit(db, a.handle, "money.countries", ",".join(val)); db.commit(); return val

@router.get("/admin/money/income")
def income(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    """Real paid orders only (verified webhooks). Demo data is never counted."""
    paid = db.scalars(select(M.Order).where(M.Order.status == "paid").order_by(M.Order.paid_at)).all()
    by_day: dict[str, dict] = {}
    import datetime as dt
    for o in paid:
        d = dt.datetime.fromtimestamp((o.paid_at or o.at) / 1000, dt.timezone.utc).strftime("%Y-%m-%d")
        x = by_day.setdefault(d, {"day": d, "fees": 0, "subs": 0, "store": 0, "tips": 0, "orders": 0})
        x["fees"] += o.fee; x["orders"] += 1
        x[{"subscription": "subs", "product": "store", "tip": "tips"}[o.kind]] += o.amount
    tot = {"fees": sum(o.fee for o in paid), "subs": sum(o.amount for o in paid if o.kind == "subscription"),
           "store": sum(o.amount for o in paid if o.kind == "product"), "tips": sum(o.amount for o in paid if o.kind == "tip"), "ads": 0}
    tot["platform"] = tot["fees"] + tot["subs"] + tot["ads"]
    return {"currency": "INR", "paidOrders": len(paid), "totals": tot, "byDay": list(by_day.values()),
            "pending": db.scalar(select(func.count()).select_from(M.Order).where(M.Order.status == "created")) or 0,
            "activeSubscriptions": db.scalar(select(func.count()).select_from(M.Subscription).where(M.Subscription.status == "active")) or 0,
            "adImpressions": db.scalar(select(func.coalesce(func.sum(M.Ad.impressions), 0))) or 0,
            "note": "Counts only orders confirmed by a signature-verified provider webhook. Ads have no paid booking flow yet, so ad income is 0."}
