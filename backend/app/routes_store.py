"""v3 "Stash": creator store. Gated by features money && store."""
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db
from . import models as M
from .security import current_user, require, audit
from .routes_money import gate, inr, create_order, order_json

router = APIRouter()
CREATORS = ("creator", "owner")

def product_json(p: M.Product) -> dict:
    return {"id": p.id, "creatorId": p.creator_id, "title": p.title, "desc": p.desc, "price": inr(p.price, p.currency), "mediaUrl": p.media_url,
            "kind": p.kind, "stock": p.stock, "active": p.active, "demo": p.demo}

@router.get("/store")
def list_store(creator: str | None = None, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    gate(db, u, "store")
    q = select(M.Product).where(M.Product.active == True).order_by(M.Product.at.desc())  # noqa: E712
    if creator: q = q.where(M.Product.creator_id == creator)
    return [product_json(p) for p in db.scalars(q)]

class ProductIn(BaseModel):
    title: str = Field(min_length=1, max_length=120); desc: str = Field(default="", max_length=2000); price: int = Field(ge=0, le=10_000_000)
    mediaUrl: str | None = Field(default=None, pattern=r"^/media/[\w.-]+$"); kind: Literal["digital", "physical"] = "digital"; stock: int | None = Field(default=None, ge=0)
class ProductPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120); desc: str | None = Field(default=None, max_length=2000); price: int | None = Field(default=None, ge=0, le=10_000_000)
    mediaUrl: str | None = Field(default=None, pattern=r"^/media/[\w.-]+$"); kind: Literal["digital", "physical"] | None = None; stock: int | None = Field(default=None, ge=0); active: bool | None = None

@router.post("/store/products")
def create_product(b: ProductIn, u: M.User = Depends(require(*CREATORS)), db: Session = Depends(get_db)):
    gate(db, u, "store")
    p = M.Product(creator_id=u.id, title=b.title.strip(), desc=b.desc, price=b.price, media_url=b.mediaUrl, kind=b.kind, stock=b.stock)
    db.add(p); db.flush(); audit(db, u.handle, "store.product_create", p.id); db.commit(); return product_json(p)

@router.patch("/store/products/{pid}")
def patch_product(pid: str, b: ProductPatch, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    gate(db, u, "store")
    p = db.get(M.Product, pid)
    if not p: raise HTTPException(404, "Product not found")
    if p.creator_id != u.id: raise HTTPException(403, "Only the creator can edit this product")
    d = b.model_dump(exclude_unset=True)
    if "mediaUrl" in d: p.media_url = d.pop("mediaUrl")
    for k, v in d.items(): setattr(p, k, v)
    audit(db, u.handle, "store.product_patch", f"{pid} {','.join(b.model_fields_set)}"); db.commit(); return product_json(p)

class StoreOrderIn(BaseModel): productId: str = Field(max_length=40); provider: Literal["razorpay", "cashfree"] = "razorpay"
@router.post("/store/orders")
def store_order(b: StoreOrderIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    gate(db, u, "store")
    p = db.get(M.Product, b.productId)
    if not p or not p.active: raise HTTPException(404, "Product not found")
    if p.stock is not None and p.stock <= 0: raise HTTPException(409, "Sold out")
    if p.price == 0: return {"orderId": None, "status": "free", "payUrl": None, "provider": None, "testMode": False, "message": "This one is free — no payment needed.", "mediaUrl": p.media_url}
    return create_order(db, u, kind="product", ref_id=p.id, creator_id=p.creator_id, amount=p.price, currency=p.currency, provider=b.provider, description=p.title)

# ---------- admin moderation ----------
STAFF = require("owner")
@router.get("/admin/store")
def admin_store(a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    users = {u.id: u.handle for u in db.scalars(select(M.User))}
    return {"products": [{**product_json(p), "creatorHandle": users.get(p.creator_id)} for p in db.scalars(select(M.Product).order_by(M.Product.at.desc()))],
            "orders": [order_json(o) for o in db.scalars(select(M.Order).where(M.Order.kind == "product").order_by(M.Order.at.desc()).limit(200))]}

class AdminProductPatch(BaseModel): active: bool
@router.patch("/admin/store/products/{pid}")
def admin_patch_product(pid: str, b: AdminProductPatch, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    p = db.get(M.Product, pid)
    if not p: raise HTTPException(404, "Product not found")
    p.active = b.active; audit(db, a.handle, "store.moderate", f"{pid} active={b.active}"); db.commit(); return product_json(p)
