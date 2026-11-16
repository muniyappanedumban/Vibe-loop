"""v5 Content hub (CMS): admin-managed pages per module with versions/history and a publish toggle.
Kinds gated by config features: blog → `blog`, news → `news`, links → `appLinks` (off → hidden from /pages, 403 on /pages/{slug})."""
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select, or_, delete
from sqlalchemy.orm import Session
from .db import get_db
from . import models as M
from .security import require, audit
from . import config_resolver as R

router = APIRouter()
STAFF = require("owner")
MODULES = ("glow", "hush", "both")
KINDS = ("page", "faq", "blog", "news", "guide", "links")
KIND_FEATURE = {"blog": "blog", "news": "news", "links": "appLinks"}
SLUG = r"^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$"

class FaqItem(BaseModel): q: str = Field(min_length=1, max_length=300); a: str = Field(min_length=1, max_length=3000)
class LinkItem(BaseModel):
    label: str = Field(min_length=1, max_length=80); url: str = Field(default="", max_length=300, pattern=r"^(https?://\S+|)$")
    platform: Literal["android", "ios", "web", "other"] = "other"; note: str = Field(default="", max_length=120)
class ContactItem(BaseModel):
    label: str = Field(min_length=1, max_length=80); value: str = Field(min_length=1, max_length=200); type: Literal["email", "phone", "url", "ticket"] = "email"
ITEM_MODELS = {"faq": FaqItem, "links": LinkItem, "contacts": ContactItem}

import re as _re
# Pages are plain text + simple markdown, rendered by the clients as text (never as HTML). The API never returns HTML; on top of
# that, raw HTML and script-ish links are refused at write time so a future web renderer can't be turned into stored XSS.
UNSAFE_MD = _re.compile(r"</?[a-zA-Z!]|javascript\s*:|vbscript\s*:|data\s*:\s*text/html", _re.I)
def safe_md(*texts):
    for t in texts:
        if t and UNSAFE_MD.search(t): raise HTTPException(400, "HTML tags and javascript:/data: links aren't allowed — use plain markdown")

def clean_items(items_kind: str | None, items: list | None) -> list:
    if not items: return []
    if items_kind not in ITEM_MODELS: raise HTTPException(400, "itemsKind must be faq, links or contacts when items are given")
    if len(items) > 60: raise HTTPException(400, "At most 60 items")
    try: out = [ITEM_MODELS[items_kind](**x).model_dump() for x in items]
    except Exception as e: raise HTTPException(400, f"Bad {items_kind} item: {str(e).splitlines()[0][:160]}")
    safe_md(*[str(v) for it in out for v in it.values()])
    return out

def features(db: Session, authorization: str = "") -> dict:
    from .routes_config import optional_user
    return R.resolve(db, optional_user(db, authorization) if authorization else None)["features"]
def kind_on(f: dict, kind: str) -> bool: return kind not in KIND_FEATURE or bool(f.get(KIND_FEATURE[kind], True))

def snapshot(p: M.Page) -> dict:
    return {"module": p.module, "kind": p.kind, "title": p.title, "summary": p.summary, "body": p.body, "coverUrl": p.cover_url,
            "itemsKind": p.items_kind, "items": p.items or [], "published": p.published, "order": p.order}
def page_json(p: M.Page, admin: bool = False) -> dict:
    d = {"slug": p.slug, **snapshot(p), "updatedAt": p.updated_at, "version": p.version}
    if admin: d["updatedBy"] = p.updated_by
    return d

def save_version(db: Session, p: M.Page, by: str, note: str = ""):
    db.add(M.PageVersion(slug=p.slug, version=p.version, snapshot=snapshot(p), by=by, note=note[:200], at=p.updated_at))

# ---------- public ----------
@router.get("/pages")
def list_pages(module: Literal["glow", "hush", "both"] | None = None, kind: Literal[KINDS] | None = None, authorization: str = Header(default=""), db: Session = Depends(get_db)):  # type: ignore[valid-type]
    f = features(db, authorization)
    if kind and not kind_on(f, kind): return []
    q = select(M.Page).where(M.Page.published == True).order_by(M.Page.order, M.Page.updated_at.desc()).limit(100)  # noqa: E712
    if module and module != "both": q = q.where(M.Page.module.in_((module, "both")))
    if kind: q = q.where(M.Page.kind == kind)
    return [page_json(p) for p in db.scalars(q) if kind_on(f, p.kind)]

@router.get("/pages/{slug}")
def get_page(slug: str, authorization: str = Header(default=""), db: Session = Depends(get_db)):
    p = db.get(M.Page, slug)
    if not p or not p.published: raise HTTPException(404, "Page not found")
    if not kind_on(features(db, authorization), p.kind): raise HTTPException(403, "Not enabled")
    return page_json(p)

@router.get("/pages/{slug}/versions")
def page_versions(slug: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    if not db.get(M.Page, slug): raise HTTPException(404, "Page not found")
    return [{"version": v.version, "at": v.at, "by": v.by, "note": v.note, "snapshot": v.snapshot}
            for v in db.scalars(select(M.PageVersion).where(M.PageVersion.slug == slug).order_by(M.PageVersion.version.desc()).limit(100))]

# ---------- admin ----------
class PageIn(BaseModel):
    slug: str = Field(pattern=SLUG); module: Literal[MODULES] = "both"; kind: Literal[KINDS] = "page"  # type: ignore[valid-type]
    title: str = Field(min_length=1, max_length=160); summary: str = Field(default="", max_length=400); body: str = Field(default="", max_length=50_000)
    coverUrl: str | None = Field(default=None, max_length=300, pattern=r"^(/media/[\w.-]+|https://\S+)$")
    itemsKind: Literal["faq", "links", "contacts"] | None = None; items: list[dict] = Field(default_factory=list)
    published: bool = False; order: int = Field(default=0, ge=-1000, le=1000)
    @model_validator(mode="after")
    def _ik(self):
        if self.kind == "faq" and not self.itemsKind: self.itemsKind = "faq"
        if self.kind == "links" and not self.itemsKind: self.itemsKind = "links"
        return self
class PagePatch(BaseModel):
    module: Literal[MODULES] | None = None; kind: Literal[KINDS] | None = None  # type: ignore[valid-type]
    title: str | None = Field(default=None, min_length=1, max_length=160); summary: str | None = Field(default=None, max_length=400)
    body: str | None = Field(default=None, max_length=50_000); coverUrl: str | None = Field(default=None, max_length=300, pattern=r"^(/media/[\w.-]+|https://\S+)$")
    itemsKind: Literal["faq", "links", "contacts"] | None = None; items: list[dict] | None = None
    published: bool | None = None; order: int | None = Field(default=None, ge=-1000, le=1000); note: str = Field(default="", max_length=200)

@router.get("/admin/pages")
def admin_pages(module: str | None = None, kind: str | None = None, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    q = select(M.Page).order_by(M.Page.kind, M.Page.order, M.Page.updated_at.desc()).limit(100)
    if module and module != "all": q = q.where(or_(M.Page.module == module, M.Page.module == "both")) if module != "both" else q.where(M.Page.module == "both")
    if kind: q = q.where(M.Page.kind == kind)
    return [page_json(p, True) for p in db.scalars(q)]

@router.get("/admin/pages/{slug}")
def admin_page(slug: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    p = db.get(M.Page, slug)
    if not p: raise HTTPException(404, "Page not found")
    return page_json(p, True)

@router.post("/admin/pages")
def admin_create(b: PageIn, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    if db.get(M.Page, b.slug): raise HTTPException(409, "That slug is taken")
    safe_md(b.title, b.summary, b.body)
    p = M.Page(slug=b.slug, module=b.module, kind=b.kind, title=b.title.strip(), summary=b.summary.strip(), body=b.body, cover_url=b.coverUrl,
               items_kind=b.itemsKind if b.items or b.itemsKind else None, items=clean_items(b.itemsKind, b.items), published=b.published, order=b.order,
               version=1, updated_at=M.now_ms(), updated_by=a.handle)
    db.add(p); db.flush(); save_version(db, p, a.handle, "created")
    audit(db, a.handle, "page.create", f"{p.slug} {p.kind}/{p.module}"); db.commit(); return page_json(p, True)

def apply_patch(db: Session, p: M.Page, d: dict, by: str, note: str, action: str = "page.update"):
    if "itemsKind" in d or "items" in d:
        ik = d.get("itemsKind", p.items_kind)
        p.items = clean_items(ik, d.get("items", p.items)); p.items_kind = ik if (p.items or ik) else None
    safe_md(*[v for k, v in d.items() if k in ("title", "summary", "body") and isinstance(v, str)])
    m = {"coverUrl": "cover_url"}
    for k, v in d.items():
        if k in ("itemsKind", "items", "note"): continue
        if v is None and k != "coverUrl": continue
        setattr(p, m.get(k, k), v.strip() if k in ("title", "summary") else v)
    p.version += 1; p.updated_at = M.now_ms(); p.updated_by = by
    save_version(db, p, by, note); audit(db, by, action, f"{p.slug} v{p.version} {','.join(k for k in d if k != 'note')}")

@router.patch("/admin/pages/{slug}")
def admin_patch(slug: str, b: PagePatch, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    p = db.get(M.Page, slug)
    if not p: raise HTTPException(404, "Page not found")
    d = b.model_dump(exclude_unset=True)
    if not set(d) - {"note"}: raise HTTPException(400, "Nothing to change")
    apply_patch(db, p, d, a.handle, b.note); db.commit(); return page_json(p, True)

class PublishIn(BaseModel): published: bool
@router.post("/admin/pages/{slug}/publish")
def admin_publish(slug: str, b: PublishIn, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    p = db.get(M.Page, slug)
    if not p: raise HTTPException(404, "Page not found")
    apply_patch(db, p, {"published": b.published}, a.handle, "published" if b.published else "unpublished", "page.publish"); db.commit(); return page_json(p, True)

class RestoreIn(BaseModel): version: int = Field(ge=1)
@router.post("/admin/pages/{slug}/restore")
def admin_restore(slug: str, b: RestoreIn, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    """Restore = a new version whose content equals the old snapshot (history is never rewritten)."""
    p = db.get(M.Page, slug)
    if not p: raise HTTPException(404, "Page not found")
    v = db.scalar(select(M.PageVersion).where(M.PageVersion.slug == slug, M.PageVersion.version == b.version))
    if not v: raise HTTPException(404, "Version not found")
    snap = {k: x for k, x in v.snapshot.items() if k != "published"}  # content only; publish state stays
    apply_patch(db, p, snap, a.handle, f"restored v{b.version}", "page.restore"); db.commit(); return page_json(p, True)

@router.delete("/admin/pages/{slug}")
def admin_delete(slug: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    p = db.get(M.Page, slug)
    if not p: raise HTTPException(404, "Page not found")
    db.delete(p); db.execute(delete(M.PageVersion).where(M.PageVersion.slug == slug))
    audit(db, a.handle, "page.delete", slug); db.commit(); return {"ok": True}
