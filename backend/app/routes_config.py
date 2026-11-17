"""Server-driven app config: public resolver + owner admin for layers, zones, slabs, languages."""
import jwt, json, hashlib
from fastapi.responses import Response
from fastapi import APIRouter, Depends, HTTPException, Header, Body
from sqlalchemy.orm import Session
from .db import get_db
from . import models as M
from .security import require, audit
from . import config_resolver as R

router = APIRouter()
STAFF = require("owner")

def optional_user(db: Session, authorization: str) -> M.User | None:
    if not authorization.startswith("Bearer "): return None
    from .security import decode_access
    try: data = decode_access(authorization[7:])
    except jwt.PyJWTError: return None
    u = db.get(M.User, data.get("sub"))
    return u if u and not u.suspended and data.get("tv", 0) == (u.token_version or 0) else None

@router.get("/app-config")
def app_config(country: str | None = None, lang: str | None = None, authorization: str = Header(default=""), x_country: str | None = Header(default=None),
               if_none_match: str | None = Header(default=None), db: Session = Depends(get_db)):
    if country and (len(country) != 2 or not country.isalpha()): raise HTTPException(400, "country must be ISO2")
    if lang and (not 2 <= len(lang) <= 3 or not lang.isalpha()): raise HTTPException(400, "lang must be a 2–3 letter code")
    u = optional_user(db, authorization)
    hdr = x_country if x_country and len(x_country) == 2 and x_country.isalpha() else None
    c = country or ((u.profile or {}).get("country") if u else None) or hdr
    cfg = R.resolve(db, u, country=c, lang=lang)
    body = json.dumps(cfg, separators=(",", ":"), ensure_ascii=False).encode()
    etag = '"' + hashlib.sha256(body).hexdigest()[:20] + '"'
    hdr = {"ETag": etag, "Cache-Control": "private, no-cache", "Vary": "Authorization, X-Country"}
    if if_none_match and etag in [x.strip() for x in if_none_match.split(",")]: return Response(status_code=304, headers=hdr)
    return Response(body, media_type="application/json", headers=hdr)

def bump(db: Session) -> int:
    R.invalidate(db)
    v = R.version(db) + 1; db.merge(M.KV(ns="config_meta", key="version", value={"v": v})); return v

@router.get("/admin/config/layers")
def get_layers(a: M.User = Depends(STAFF), db: Session = Depends(get_db)): return {"version": R.version(db), "layers": R.layers(db)}

@router.put("/admin/config/{layer_key}")
def put_layer(layer_key: str, override: dict = Body(...), a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    if err := R.validate_layer(layer_key, override, R.layers(db)): raise HTTPException(400, err)
    if err := R.validate_theme_layer(layer_key, override, R.layers(db)): raise HTTPException(422, err)
    db.merge(M.KV(ns="config", key=layer_key, value=override)); v = bump(db)
    audit(db, a.handle, "config.layer_put", f"{layer_key} v{v}"); db.commit(); return {"ok": True, "version": v}

@router.delete("/admin/config/{layer_key}")
def del_layer(layer_key: str, a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    if layer_key == "base": raise HTTPException(400, "The base layer can't be deleted")
    r = db.get(M.KV, ("config", layer_key))
    if not r: raise HTTPException(404, "No such layer")
    rest = {k: v for k, v in R.layers(db).items() if k != layer_key}
    if "base" in rest and (err := R.validate_layer("base", rest["base"], rest)): raise HTTPException(400, err)
    db.delete(r); v = bump(db); audit(db, a.handle, "config.layer_delete", f"{layer_key} v{v}"); db.commit(); return {"ok": True, "version": v}

@router.get("/admin/config/preview")
def preview(country: str = "IN", slab: str | None = None, lang: str = "en", a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    return R.resolve(db, None, country=country[:2], lang=lang[:3], slab=slab[:30] if slab else None)

@router.get("/admin/theme/presets")
def theme_presets(a: M.User = Depends(STAFF)):
    return {m: [{"key": k, "default": k == R.THEME_DEFAULT[m], **v} for k, v in ps.items()] for m, ps in R.THEME_PRESETS.items()}

@router.get("/admin/zones")
def get_zones(a: M.User = Depends(STAFF), db: Session = Depends(get_db)): return R.zones(db)
@router.put("/admin/zones")
def put_zones(z: dict = Body(...), a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    for k, v in z.items():
        if not isinstance(v, dict) or not isinstance(v.get("countries", []), list) or len(k) > 30: raise HTTPException(400, f"Zone {k} is invalid")
    db.merge(M.KV(ns="appcfg", key="zones", value=z)); bump(db); audit(db, a.handle, "config.zones", ",".join(z)); db.commit(); return z

@router.get("/admin/slabs")
def get_slabs(a: M.User = Depends(STAFF), db: Session = Depends(get_db)): return R.slabs(db)
@router.put("/admin/slabs")
def put_slabs(s: list = Body(...), a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    if not s or any(not isinstance(x, dict) or not isinstance(x.get("key"), str) or not isinstance(x.get("minFollowers", 0), int) for x in s): raise HTTPException(400, "Each slab needs key and minFollowers")
    db.merge(M.KV(ns="appcfg", key="slabs", value={"items": s})); bump(db); audit(db, a.handle, "config.slabs", ",".join(x["key"] for x in s)); db.commit(); return s

@router.get("/admin/languages")
def get_langs(a: M.User = Depends(STAFF), db: Session = Depends(get_db)): return R.languages(db)
@router.put("/admin/languages")
def put_langs(l: dict = Body(...), a: M.User = Depends(STAFF), db: Session = Depends(get_db)):
    av = l.get("available")
    if not isinstance(av, list) or not av or any(not isinstance(x, str) or not 2 <= len(x) <= 3 for x in av) or l.get("default") not in av: raise HTTPException(400, "available must list codes and include default")
    v = {"available": av, "default": l["default"]}
    db.merge(M.KV(ns="appcfg", key="languages", value=v)); bump(db); audit(db, a.handle, "config.languages", ",".join(av)); db.commit(); return v
