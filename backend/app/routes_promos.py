"""v4 Promos: our own brand promotions (admin controlled), shown to everyone matching, labelled "From VibeLoop".
Targeting: global, or AND of the non-empty lists (countries, zones, states) — e.g. countries [IN] + states [TN] = Tamil Nadu only.
Window: startAt ≤ now ≤ endAt (either optional). Order: priority desc, newest first. Config feature `promos` switches it off globally."""
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db
from . import models as M
from .security import require, audit
from . import config_resolver as R

router = APIRouter()
STAFF = require("owner")
PLACEMENTS = ("home_banner", "feed", "chat_list", "splash", "explore")
KINDS = ("banner", "card", "video", "image", "link", "post")
LABEL = "From VibeLoop"

def zones_for(db: Session, country: str, state: str) -> set[str]:
    zs = R.zones(db); out = {R.zone_for(country, zs)} if country else set()
    for k, z in zs.items():
        if (state and state in (z.get("states") or []) and (not z.get("countries") or country in z["countries"] or "*" in z["countries"])) or (country and country in (z.get("countries") or [])):
            out.add(k)
    return out

def matches(p: M.Promo, country: str, state: str, zones: set[str], now: int, placement: str | None) -> bool:
    if not p.active or (p.start_at and p.start_at > now) or (p.end_at and p.end_at < now): return False
    if placement and placement not in (p.placement or []): return False
    t = p.target or {}
    if t.get("global"): return True
    cs, zz, ss = t.get("countries") or [], t.get("zones") or [], t.get("states") or []
    if not (cs or zz or ss): return False
    return (not cs or country in cs) and (not zz or bool(zones & set(zz))) and (not ss or state in ss)

def promo_json(p: M.Promo, admin: bool = False) -> dict:
    d = {"id": p.id, "title": p.title, "body": p.body, "kind": p.kind, "mediaUrl": p.media_url, "url": p.url, "cta": p.cta, "placement": p.placement or [],
         "priority": p.priority, "label": LABEL}
    if admin: d.update({"target": p.target or {}, "startAt": p.start_at, "endAt": p.end_at, "active": p.active, "by": p.by, "at": p.at})
    return d

def select_promos(db: Session, country: str, state: str, placement: str | None) -> list[M.Promo]:
    country, state, now = (country or "").upper()[:2], (state or "").upper()[:3], M.now_ms()
    zs = zones_for(db, country, state)
    rows = db.scalars(select(M.Promo).where(M.Promo.active == True).order_by(M.Promo.priority.desc(), M.Promo.at.desc())).all()  # noqa: E712
    return [p for p in rows if matches(p, country, state, zs, now, placement)]

@router.get("/promos")
def promos(placement: str | None = None, country: str | None = None, state: str | None = None, authorization: str = Header(default=""),
           x_country: str | None = Header(default=None), db: Session = Depends(get_db)):
    from .routes_config import optional_user
    if placement and placement not in PLACEMENTS: raise HTTPException(400, f"placement must be one of {', '.join(PLACEMENTS)}")
    u = optional_user(db, authorization)
    c = ((u.profile or {}).get("country") if u else None) or country or x_country or ("IN" if u else "")
    s = (u.state if u else None) or (state if not u else "") or ""
    if not R.resolve(db, u, country=c or None)["features"].get("promos", True): return []
    return [promo_json(p) for p in select_promos(db, c, s, placement)]

# ---------- admin ----------
class Target(BaseModel):
    global_: bool = Field(default=False, alias="global"); countries: list[str] = Field(default_factory=list, max_length=250)
    zones: list[str] = Field(default_factory=list, max_length=50); states: list[str] = Field(default_factory=list, max_length=100)
    model_config = {"populate_by_name": True}
    def out(self) -> dict:
        return {"global": self.global_, "countries": sorted({c.strip().upper()[:2] for c in self.countries if c.strip()}),
                "zones": sorted({z.strip()[:30] for z in self.zones if z.strip()}), "states": sorted({s.strip().upper()[:3] for s in self.states if s.strip()})}
class PromoIn(BaseModel):
    title: str = Field(min_length=1, max_length=120); body: str = Field(default="", max_length=500); kind: Literal[KINDS] = "card"  # type: ignore[valid-type]
    mediaUrl: str | None = Field(default=None, max_length=300, pattern=r"^(/media/[A-Za-z0-9]+\.[a-z0-9]+|https://\S+)$")
    url: str | None = Field(default=None, max_length=300, pattern=r"^https?://\S+$"); cta: str | None = Field(default=None, max_length=30)
    placement: list[Literal[PLACEMENTS]] = Field(min_length=1)  # type: ignore[valid-type]
    target: Target = Field(default_factory=Target); startAt: int | None = None; endAt: int | None = None
    active: bool = True; priority: int = Field(default=0, ge=-100, le=1000)
    @model_validator(mode="after")
    def _win(self):
        if self.startAt and self.endAt and self.endAt <= self.startAt: raise ValueError("endAt must be after startAt")
        return self
class PromoPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120); body: str | None = Field(default=None, max_length=500); kind: Literal[KINDS] | None = None  # type: ignore[valid-type]
    mediaUrl: str | None = Field(default=None, max_length=300, pattern=r"^(/media/[A-Za-z0-9]+\.[a-z0-9]+|https://\S+)$")
    url: str | None = Field(default=None, max_length=300, pattern=r"^https?://\S+$"); cta: str | None = Field(default=None, max_length=30)
    placement: list[Literal[PLACEMENTS]] | None = Field(default=None, min_length=1)  # type: ignore[valid-type]
    target: Target | None = None; startAt: int | None = None; endAt: int | None = None; active: bool | None = None; priority: int | None = Field(default=None, ge=-100, le=1000)

def check_target(t: dict):
    if not t["global"] and not (t["countries"] or t["zones"] or t["states"]): raise HTTPException(400, "Pick Global or at least one country, zone or state")

@router.get("/admin/promos")
def admin_list(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    return [promo_json(p, True) for p in db.scalars(select(M.Promo).order_by(M.Promo.priority.desc(), M.Promo.at.desc()).limit(100))]

@router.post("/admin/promos")
def admin_create(b: PromoIn, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    t = b.target.out(); check_target(t)
    p = M.Promo(title=b.title.strip(), body=b.body.strip(), kind=b.kind, media_url=b.mediaUrl, url=b.url, cta=b.cta, placement=list(dict.fromkeys(b.placement)),
                target=t, start_at=b.startAt, end_at=b.endAt, active=b.active, priority=b.priority, by=a.handle)
    db.add(p); db.flush(); audit(db, a.handle, "promo.create", f"{p.id} {p.title}"); db.commit(); return promo_json(p, True)

@router.patch("/admin/promos/{pid}")
def admin_patch(pid: str, b: PromoPatch, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    p = db.get(M.Promo, pid)
    if not p: raise HTTPException(404, "Promo not found")
    d = b.model_dump(exclude_unset=True, by_alias=False)
    m = {"mediaUrl": "media_url", "startAt": "start_at", "endAt": "end_at"}
    for k, v in d.items():
        if k == "target": t = b.target.out(); check_target(t); p.target = t
        elif k == "placement": p.placement = list(dict.fromkeys(v))
        elif k in ("title", "body") and v is not None: setattr(p, k, v.strip())
        elif k in ("kind", "active", "priority") and v is None: continue
        else: setattr(p, m.get(k, k), v)
    if p.start_at and p.end_at and p.end_at <= p.start_at: raise HTTPException(400, "endAt must be after startAt")
    audit(db, a.handle, "promo.update", f"{p.id} {','.join(d)}"); db.commit(); return promo_json(p, True)

@router.delete("/admin/promos/{pid}")
def admin_delete(pid: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    p = db.get(M.Promo, pid)
    if not p: raise HTTPException(404, "Promo not found")
    db.delete(p); audit(db, a.handle, "promo.delete", pid); db.commit(); return {"ok": True}

@router.get("/admin/promos/preview")
def admin_preview(country: str = "IN", state: str = "", placement: str | None = None, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    if placement and placement not in PLACEMENTS: raise HTTPException(400, "Unknown placement")
    c, s = country.upper()[:2], state.upper()[:3]
    enabled = R.resolve(db, None, country=c or None)["features"].get("promos", True)
    return {"country": c, "state": s, "zones": sorted(zones_for(db, c, s)), "enabled": enabled, "placement": placement,
            "items": [promo_json(p, True) for p in select_promos(db, c, s, placement)]}
