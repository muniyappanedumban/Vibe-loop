"""v3 "Boosts": admin-created ads, shown labelled Sponsored, only for slabs (creator tiers) the admin enabled."""
import random
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db
from . import models as M
from .security import current_user, require, audit
from . import config_resolver as R
from .routes_money import feature_on

router = APIRouter()
STAFF = require("owner")
PLACES = ("feed", "explore", "chat_list")
DEFAULT_SLABS = {"starter": {"enabled": False, "places": [], "frequency": 8}, "rising": {"enabled": True, "places": ["feed"], "frequency": 8},
                 "pro": {"enabled": False, "places": [], "frequency": 8}}

def ad_slabs(db: Session) -> dict:
    r = db.get(M.KV, ("ads", "slabs")); return r.value if r else DEFAULT_SLABS

@router.get("/ads/slot")
def slot(place: Literal["feed", "explore", "chat_list"], u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    if not feature_on(db, u, "ads"): raise HTTPException(403, "Not enabled")
    slab = R.slab_for(R.followers(db, u.id), R.slabs(db)); rule = ad_slabs(db).get(slab) or {}
    if not rule.get("enabled") or place not in rule.get("places", []): return {"ad": None, "slab": slab}
    ads = [a for a in db.scalars(select(M.Ad).where(M.Ad.active == True)) if place in (a.places or [])]  # noqa: E712
    if not ads: return {"ad": None, "slab": slab}
    a = random.choice(ads); a.impressions += 1; db.commit()
    return {"ad": {"id": a.id, "title": a.title, "body": a.body, "cta": a.cta, "url": a.url, "sponsor": a.sponsor, "label": "Sponsored"},
            "slab": slab, "frequency": rule.get("frequency", 8)}

class AdIn(BaseModel):
    id: str | None = Field(default=None, pattern=r"^[\w-]{3,40}$"); title: str = Field(min_length=1, max_length=80); body: str = Field(default="", max_length=200)
    cta: str = Field(default="Learn more", min_length=1, max_length=30); url: str = Field(pattern=r"^https://[^\s]{3,290}$"); sponsor: str = Field(min_length=1, max_length=80)
    places: list[Literal["feed", "explore", "chat_list"]] = Field(default_factory=lambda: ["feed"]); active: bool = True
def ad_json(a: M.Ad) -> dict:
    return {"id": a.id, "title": a.title, "body": a.body, "cta": a.cta, "url": a.url, "sponsor": a.sponsor, "places": a.places, "active": a.active, "demo": a.demo, "impressions": a.impressions}

@router.get("/admin/ads")
def admin_ads(a: M.User = Depends(STAFF), db: Session = Depends(get_db)): return [ad_json(x) for x in db.scalars(select(M.Ad).order_by(M.Ad.at))]

@router.put("/admin/ads")
def put_ads(items: list[AdIn] = Body(...), a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    """Full replace: ads missing from the list are deleted."""
    keep = set()
    for it in items:
        x = db.get(M.Ad, it.id) if it.id else None
        if not x: x = M.Ad(id=it.id or M.nid("ad")); db.add(x)
        x.title, x.body, x.cta, x.url, x.sponsor, x.places, x.active = it.title, it.body, it.cta, it.url, it.sponsor, list(dict.fromkeys(it.places)), it.active
        keep.add(x.id)
    db.flush()
    for x in db.scalars(select(M.Ad)):
        if x.id not in keep: db.delete(x)
    audit(db, a.handle, "ads.put", ",".join(sorted(keep))); db.commit(); return admin_ads(a, db)

@router.get("/admin/ads/slabs")
def get_ad_slabs(a: M.User = Depends(STAFF), db: Session = Depends(get_db)): return ad_slabs(db)

@router.put("/admin/ads/slabs")
def put_ad_slabs(b: dict = Body(...), a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    known = {s["key"] for s in R.slabs(db)}; out = {}
    for k, v in b.items():
        if k not in known: raise HTTPException(400, f"Unknown slab: {k}")
        if not isinstance(v, dict) or not isinstance(v.get("enabled"), bool): raise HTTPException(400, f"{k}: enabled must be true/false")
        pl = v.get("places", [])
        if not isinstance(pl, list) or any(p not in PLACES for p in pl): raise HTTPException(400, f"{k}: places are feed, explore, chat_list")
        fq = v.get("frequency", 8)
        if not isinstance(fq, int) or not 3 <= fq <= 50: raise HTTPException(400, f"{k}: frequency must be 3–50 posts")
        out[k] = {"enabled": v["enabled"], "places": list(dict.fromkeys(pl)), "frequency": fq}
    db.merge(M.KV(ns="ads", key="slabs", value=out)); audit(db, a.handle, "ads.slabs", ",".join(f"{k}={v['enabled']}" for k, v in out.items())); db.commit(); return out
