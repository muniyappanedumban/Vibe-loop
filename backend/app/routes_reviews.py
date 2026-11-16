"""v5 reviews. Vouches (creator/collab reviews of a person) and Real Talk (product reviews, verified buyers / free claimers only).
Features: `reviews` is the master switch; `vouches` and `productReviews` (also needs money.store) each gate their half → 403 when off."""
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, or_, and_, func
from sqlalchemy.orm import Session
from .db import get_db
from . import models as M
from .security import current_user, require, audit
from . import config_resolver as R
from .v2common import are_friends, blocked_between, user_json

router = APIRouter()
STAFF = require("owner")

def review_on(db: Session, u: M.User | None, kind: str) -> bool:
    f = R.resolve(db, u)["features"]
    if not f.get("reviews", True): return False
    if kind == "vouch": return bool(f.get("vouches", True))
    return bool(f.get("productReviews", True)) and bool(f.get("money")) and bool(f.get("store"))  # Real Talk needs Stash on
def gate(db, u, kind):
    if not review_on(db, u, kind): raise HTTPException(403, "Not enabled")

def review_json(db: Session, r: M.Review, admin: bool = False) -> dict:
    a = db.get(M.User, r.author_id)
    d = {"id": r.id, "type": r.type, "targetId": r.target_id, "rating": r.rating, "text": r.text, "context": r.context, "verifiedPurchase": r.verified_purchase,
         "at": r.at, "updatedAt": r.updated_at, "author": {"id": a.id, "handle": a.handle, "name": a.name, "hue": a.hue} if a else None}
    if admin: d["status"] = r.status
    return d

def bought_from(db: Session, buyer: str, creator: str) -> bool:
    return (db.scalar(select(M.Order.id).where(M.Order.user_id == buyer, M.Order.creator_id == creator, M.Order.status == "paid").limit(1)) is not None
            or db.scalar(select(M.StoreClaim.product_id).where(M.StoreClaim.user_id == buyer, M.StoreClaim.creator_id == creator).limit(1)) is not None)
def collab_together(db: Session, a: M.User, b: M.User) -> bool:
    ha, hb = a.handle.lstrip("@").lower(), b.handle.lstrip("@").lower()
    q = select(M.Post.id).where(or_(and_(M.Post.author_id == a.id, func.lower(func.ltrim(M.Post.collab, "@")) == hb),
                                    and_(M.Post.author_id == b.id, func.lower(func.ltrim(M.Post.collab, "@")) == ha))).limit(1)
    return db.scalar(q) is not None
def interacted(db: Session, a: M.User, b: M.User) -> bool:
    return are_friends(db, a.id, b.id) or collab_together(db, a, b) or bought_from(db, a.id, b.id)

def upsert(db: Session, u: M.User, type_: str, target: str, rating: int, text: str, **kw) -> tuple[M.Review, bool]:
    r = db.scalar(select(M.Review).where(M.Review.type == type_, M.Review.author_id == u.id, M.Review.target_id == target))
    new = r is None
    if new: r = M.Review(type=type_, author_id=u.id, target_id=target); db.add(r)
    r.rating, r.text, r.updated_at = rating, text.strip(), M.now_ms()
    for k, v in kw.items(): setattr(r, k, v)
    db.flush(); return r, new

def summary(db: Session, type_: str, target: str) -> dict:
    w = (M.Review.type == type_, M.Review.target_id == target, M.Review.status == "visible")
    avg, n = db.execute(select(func.avg(M.Review.rating), func.count()).where(*w)).one()  # aggregate in SQL; items capped at 100
    rows = db.scalars(select(M.Review).where(*w).order_by(M.Review.at.desc()).limit(100)).all()
    if rows: db.scalars(select(M.User).where(M.User.id.in_({r.author_id for r in rows}))).all()
    return {"avg": round(float(avg), 2) if n else None, "count": n, "items": [review_json(db, r) for r in rows]}

# ---------- Vouches ----------
class VouchIn(BaseModel):
    userId: str = Field(max_length=40); rating: int = Field(ge=1, le=5); text: str = Field(default="", max_length=500); context: Literal["collab", "creator"] = "creator"
@router.post("/vouches")
def vouch(b: VouchIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    gate(db, u, "vouch")
    t = db.get(M.User, b.userId)
    if not t or t.suspended: raise HTTPException(404, "User not found")
    if t.id == u.id: raise HTTPException(400, "You can't vouch for yourself")
    if blocked_between(db, u.id, t.id): raise HTTPException(403, "You can't vouch for this person")
    if not interacted(db, u, t): raise HTTPException(403, "Vouch only for people you've actually worked with — be friends, collab on a Drop, or buy from their Stash first")
    r, new = upsert(db, u, "vouch", t.id, b.rating, b.text, context=b.context)
    audit(db, u.handle, "vouch.create" if new else "vouch.update", f"{r.id} → {t.handle} {b.rating}★"); db.commit()
    return review_json(db, r)

@router.get("/users/{uid}/vouches")
def user_vouches(uid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    gate(db, u, "vouch")
    if not db.get(M.User, uid): raise HTTPException(404, "User not found")
    return summary(db, "vouch", uid)

# ---------- Real Talk ----------
class ProductReviewIn(BaseModel): rating: int = Field(ge=1, le=5); text: str = Field(default="", max_length=1000)
@router.post("/store/products/{pid}/reviews")
def product_review(pid: str, b: ProductReviewIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    gate(db, u, "product")
    p = db.get(M.Product, pid)
    if not p: raise HTTPException(404, "Product not found")
    if p.creator_id == u.id: raise HTTPException(400, "You can't review your own product")
    paid = db.scalar(select(M.Order.id).where(M.Order.user_id == u.id, M.Order.kind == "product", M.Order.ref_id == pid, M.Order.status == "paid").limit(1))
    claimed = db.get(M.StoreClaim, (u.id, pid))
    if not paid and not claimed: raise HTTPException(403, "Real Talk is for people who bought (or claimed) this — get it first")
    r, new = upsert(db, u, "product", pid, b.rating, b.text, verified_purchase=bool(paid))
    audit(db, u.handle, "realtalk.create" if new else "realtalk.update", f"{r.id} {pid} {b.rating}★"); db.commit()
    return review_json(db, r)

@router.get("/store/products/{pid}/reviews")
def product_reviews(pid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    gate(db, u, "product")
    if not db.get(M.Product, pid): raise HTTPException(404, "Product not found")
    return summary(db, "product", pid)

# ---------- admin ----------
@router.get("/admin/reviews")
def admin_reviews(type: Literal["vouch", "product"] | None = None, status: Literal["visible", "hidden"] | None = None, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    q = select(M.Review).order_by(M.Review.at.desc()).limit(100)
    if type: q = q.where(M.Review.type == type)
    if status: q = q.where(M.Review.status == status)
    rs = db.scalars(q).all(); ids = {r.target_id for r in rs} | {r.author_id for r in rs}
    users = {x.id: x for x in db.scalars(select(M.User).where(M.User.id.in_(ids)))} if rs else {}
    prods = {p.id: p.title for p in db.scalars(select(M.Product).where(M.Product.id.in_(ids)))} if rs else {}
    out = []
    for r in rs:
        d = review_json(db, r, True)
        d["targetLabel"] = prods.get(r.target_id, r.target_id) if r.type == "product" else (users[r.target_id].handle if r.target_id in users else r.target_id)
        out.append(d)
    return out

class ReviewPatch(BaseModel): status: Literal["visible", "hidden"]
@router.patch("/admin/reviews/{rid}")
def admin_patch_review(rid: str, b: ReviewPatch, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    r = db.get(M.Review, rid)
    if not r: raise HTTPException(404, "Review not found")
    r.status = b.status; audit(db, a.handle, "review.moderate", f"{rid} {b.status}"); db.commit(); return review_json(db, r, True)

@router.delete("/admin/reviews/{rid}")
def admin_delete_review(rid: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    r = db.get(M.Review, rid)
    if not r: raise HTTPException(404, "Review not found")
    db.delete(r); audit(db, a.handle, "review.delete", f"{rid} {r.type} {r.target_id}"); db.commit(); return {"ok": True}
