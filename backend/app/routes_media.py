"""Media uploads (photos and short videos for posts/stories/chats) + Quick Story creation.
Security: auth required, 5 MB image / 50 MB video cap, type decided by magic bytes (not filename/Content-Type), random server-side names,
files served from a dedicated directory with nosniff. Storage is local disk for dev — use object storage + a CDN in production."""
import hashlib, hmac, os, re, secrets, time
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Header, Query
from fastapi.responses import FileResponse
from sqlalchemy import select
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from .db import get_db
from . import models as M
from .security import current_user, audit
from .ratelimit import write_limit
from .config import JWT_SECRET, MEDIA_LINK_TTL_SEC

MEDIA_DIR = os.environ.get("MEDIA_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "media"))
os.makedirs(MEDIA_DIR, exist_ok=True)
MAX_BYTES = 5 * 1024 * 1024        # images
MAX_VIDEO_BYTES = 50 * 1024 * 1024  # videos
MAGIC = [(b"\xff\xd8\xff", "image/jpeg", "jpg"), (b"\x89PNG\r\n\x1a\n", "image/png", "png"), (b"GIF87a", "image/gif", "gif"), (b"GIF89a", "image/gif", "gif")]
router = APIRouter()

def sniff(head: bytes):
    for sig, mime, ext in MAGIC:
        if head.startswith(sig): return mime, ext
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP": return "image/webp", "webp"
    return None

def sniff_video(head: bytes):
    """ISO-BMFF (ftyp box at offset 4): QuickTime brand 'qt  ' → mov, else mp4. EBML header 1A45DFA3 → webm."""
    if head[4:8] == b"ftyp":
        return ("video/quicktime", "mov") if head[8:12] == b"qt  " else ("video/mp4", "mp4")
    if head.startswith(b"\x1a\x45\xdf\xa3"): return "video/webm", "webm"
    return None

@router.post("/media")
async def upload(file: UploadFile = File(...), u: M.User = Depends(write_limit("upload_init")), db: Session = Depends(get_db)):
    data = await file.read(MAX_VIDEO_BYTES + 1)
    if (t := sniff(data[:16])): kind = "image"
    elif (t := sniff_video(data[:16])): kind = "video"
    else: raise HTTPException(415, "Only JPEG, PNG, WebP or GIF images, or MP4, MOV or WebM videos are allowed")
    if kind == "image" and len(data) > MAX_BYTES: raise HTTPException(413, "Photos must be 5 MB or smaller")
    if len(data) > MAX_VIDEO_BYTES: raise HTTPException(413, "Videos must be 50 MB or smaller")
    mid = secrets.token_hex(12); mime, ext = t
    with open(os.path.join(MEDIA_DIR, f"{mid}.{ext}"), "wb") as f: f.write(data)
    dur = None
    if kind == "video":
        from .routes_uploads import probe_duration
        dur = probe_duration(os.path.join(MEDIA_DIR, f"{mid}.{ext}"))
    db.add(M.MediaFile(id=mid, owner_id=u.id, mime=mime, size=len(data), kind=kind, name=(file.filename or "")[:200] or None, duration_sec=dur)); audit(db, u.handle, "media.upload", f"{mid} {mime} {len(data)}B"); db.commit()
    return {"url": f"/media/{mid}.{ext}", "id": mid, "mime": mime, "size": len(data), "kind": kind}

NAME_RE = re.compile(r"^([A-Za-z0-9]{1,40})\.([a-z0-9]{1,5})$")  # <random id>.<ext> only — no separators, no dot-dot, no NUL

def _media_sig(name: str, exp: int) -> str:
    return hmac.new(JWT_SECRET.encode(), f"media:{name}:{exp}".encode(), hashlib.sha256).hexdigest()[:32]

def signed_attachment(att: dict | None) -> dict | None:
    """Chat attachment as returned to conv members: url carries an expiring signature so it opens outside the app
    (system browser / share sheet) without the bearer header. Expiry is bucketed to the TTL so URLs stay cacheable."""
    if not att or not str(att.get("url", "")).startswith("/media/"): return att
    name = att["url"].split("/")[-1]; ttl = max(60, MEDIA_LINK_TTL_SEC)
    exp = (int(time.time()) // ttl + 2) * ttl
    return {**att, "url": f"/media/{name}?exp={exp}&sig={_media_sig(name, exp)}"}

SNAP_TTL_SEC = 60
def _snap_sig(name: str, exp: int) -> str:
    return hmac.new(JWT_SECRET.encode(), f"snap:{name}:{exp}".encode(), hashlib.sha256).hexdigest()[:32]

def snap_link(url: str) -> str | None:
    """One-time snap open → a link valid for 60 s (signed in its own namespace)."""
    if not url.startswith("/media/"): return None
    name = url.split("/")[-1].split("?")[0]; exp = int(time.time()) + SNAP_TTL_SEC
    return f"/media/{name}?exp={exp}&sig={_snap_sig(name, exp)}"

def _viewer_id(db: Session, authorization: str) -> str | None:
    from .routes_config import optional_user
    u = optional_user(db, authorization) if authorization else None
    return u.id if u else None

def can_read_private(db: Session, m: M.MediaFile, name: str, authorization: str, exp: int | None, sig: str | None) -> bool:
    if exp and sig and exp >= time.time() and hmac.compare_digest(sig, _media_sig(name, exp)): return True
    if m.view_once and exp and sig and exp >= time.time() and hmac.compare_digest(sig, _snap_sig(name, exp)): return True
    uid = _viewer_id(db, authorization)
    if not uid: return False
    if uid == m.owner_id: return True
    if m.view_once: return False  # snaps: never via conv membership
    convs = db.scalars(select(M.MediaGrant.conv_id).where(M.MediaGrant.media_id == m.id)).all()
    return bool(convs) and db.scalar(select(M.Conv.id).where(M.Conv.id.in_(convs), M.has_member(M.Conv.members, uid)).limit(1)) is not None

@router.get("/media/{name}")
def serve(name: str, exp: int | None = Query(default=None), sig: str | None = Query(default=None, max_length=64),
          authorization: str = Header(default=""), db: Session = Depends(get_db)):
    mt = NAME_RE.match(name)
    if not mt: raise HTTPException(404, "Not found")
    mid, ext = mt.groups()
    m = db.get(M.MediaFile, mid)
    path = os.path.join(MEDIA_DIR, f"{mid}.{ext}")
    if not m or os.path.dirname(os.path.abspath(path)) != os.path.abspath(MEDIA_DIR) or not os.path.isfile(path): raise HTTPException(404, "Not found")
    private = m.view_once or (not m.public and db.scalar(select(M.MediaGrant.conv_id).where(M.MediaGrant.media_id == m.id).limit(1)) is not None)
    if private and not can_read_private(db, m, name, authorization, exp, sig): raise HTTPException(404, "Not found")  # 404, not 403: don't confirm existence
    hdr = {"X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" if m.view_once else "private, max-age=3600" if private else "public, max-age=86400",
           "Content-Security-Policy": "default-src 'none'; media-src 'self'; img-src 'self'; sandbox", "Cross-Origin-Resource-Policy": "same-site"}
    if m.kind not in ("image", "video"):  # documents/audio/anything else download, never render inline
        safe = "".join(ch for ch in (m.name or f"{mid}.{ext}") if ch.isalnum() or ch in "._- ")[:120] or "file"
        hdr["Content-Disposition"] = f'attachment; filename="{safe}"'
    return FileResponse(path, media_type=m.mime, headers=hdr)

def mark_public(db: Session, url: str | None, u: M.User):
    """Media used in public content (posts, stories, avatars, products) is served to anyone — but only the uploader can
    publish a file. Someone else's private chat attachment can't be made public by referencing its URL (IDOR guard)."""
    if not url or not url.startswith("/media/"): return
    mf = db.get(M.MediaFile, url.split("/")[-1].split(".")[0].split("?")[0])
    if not mf: return
    if mf.view_once: raise HTTPException(400, "Snap media can't be reused")
    if mf.owner_id == u.id: mf.public = True
    elif not mf.public and db.scalar(select(M.MediaGrant.conv_id).where(M.MediaGrant.media_id == mf.id).limit(1)) is not None:
        raise HTTPException(400, "Upload the media first")

class SparkIn(BaseModel):
    id: str | None = Field(default=None, pattern=r"^[\w-]{3,40}$"); text: str = Field(min_length=1, max_length=200); hue: int = 260; lens: str | None = None; mediaUrl: str | None = Field(default=None, pattern=r"^/media/[\w.-]+$")
    place: str | None = Field(default=None, max_length=120); hours: int = 24; close: bool = False
@router.post("/sparks")
def create_spark(b: SparkIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    from .v2common import LENS_KEYS
    from .routes_uploads import media_for, check_video_length
    if b.id and (ex := db.get(M.Spark, b.id)):
        if ex.author_id != u.id: raise HTTPException(409, "Id in use")
        return spark_out(ex)
    if b.hours not in (1, 6, 12, 24): raise HTTPException(400, "Story timer must be 1, 6, 12 or 24 hours")
    if b.lens and b.lens not in LENS_KEYS: raise HTTPException(400, "Unknown lens")
    from .user_app import get as ua_get
    from .config_resolver import resolve as _resolve
    ucfg = _resolve(db, u)
    if b.hours > (bh := ua_get(ucfg, "limits.blinkHours")): raise HTTPException(400, f"Blinks last at most {bh} hours")
    if b.lens and b.lens != "none" and b.lens not in ua_get(ucfg, "defaults.glow.lenses"): raise HTTPException(400, "This lens is turned off")
    check_video_length(media_for(db, b.mediaUrl), ua_get(ucfg, "limits.blinkVideoMaxSec"))
    mark_public(db, b.mediaUrl, u)
    s = M.Spark(id=b.id or M.nid("s"), author_id=u.id, hue=b.hue, text=b.text, lens=b.lens, media_url=b.mediaUrl, place=b.place, close=b.close, expires_at=M.now_ms() + b.hours * 3_600_000)
    db.add(s); audit(db, u.handle, "spark.create", f"{b.hours}h"); db.commit()
    return spark_out(s)

def spark_out(s: M.Spark) -> dict:
    return {"id": s.id, "by": "me", "hue": s.hue, "text": s.text, "poll": None, "close": s.close, "at": s.at, "lens": s.lens, "mediaUrl": s.media_url, "place": s.place, "expiresAt": s.expires_at}
