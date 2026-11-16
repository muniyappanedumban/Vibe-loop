"""Media uploads (photos and short videos for posts/stories/chats) + Quick Story creation.
Security: auth required, 5 MB image / 50 MB video cap, type decided by magic bytes (not filename/Content-Type), random server-side names,
files served from a dedicated directory with nosniff. Storage is local disk for dev — use object storage + a CDN in production."""
import os, secrets
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from .db import get_db
from . import models as M
from .security import current_user, audit

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
async def upload(file: UploadFile = File(...), u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    data = await file.read(MAX_VIDEO_BYTES + 1)
    if (t := sniff(data[:16])): kind = "image"
    elif (t := sniff_video(data[:16])): kind = "video"
    else: raise HTTPException(415, "Only JPEG, PNG, WebP or GIF images, or MP4, MOV or WebM videos are allowed")
    if kind == "image" and len(data) > MAX_BYTES: raise HTTPException(413, "Photos must be 5 MB or smaller")
    if len(data) > MAX_VIDEO_BYTES: raise HTTPException(413, "Videos must be 50 MB or smaller")
    mid = secrets.token_hex(12); mime, ext = t
    with open(os.path.join(MEDIA_DIR, f"{mid}.{ext}"), "wb") as f: f.write(data)
    db.add(M.MediaFile(id=mid, owner_id=u.id, mime=mime, size=len(data), kind=kind)); audit(db, u.handle, "media.upload", f"{mid} {mime} {len(data)}B"); db.commit()
    return {"url": f"/media/{mid}.{ext}", "id": mid, "mime": mime, "size": len(data), "kind": kind}

@router.get("/media/{name}")
def serve(name: str, db: Session = Depends(get_db)):
    mid, _, ext = name.partition(".")
    m = db.get(M.MediaFile, mid)
    path = os.path.join(MEDIA_DIR, f"{mid}.{ext}")
    if not m or not mid.isalnum() or not os.path.isfile(path): raise HTTPException(404, "Not found")
    return FileResponse(path, media_type=m.mime, headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=86400"})

class SparkIn(BaseModel):
    text: str = Field(min_length=1, max_length=200); hue: int = 260; lens: str | None = None; mediaUrl: str | None = Field(default=None, pattern=r"^/media/[\w.-]+$")
    place: str | None = Field(default=None, max_length=120); hours: int = 24; close: bool = False
@router.post("/sparks")
def create_spark(b: SparkIn, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    if b.hours not in (1, 6, 12, 24): raise HTTPException(400, "Story timer must be 1, 6, 12 or 24 hours")
    s = M.Spark(author_id=u.id, hue=b.hue, text=b.text, lens=b.lens, media_url=b.mediaUrl, place=b.place, close=b.close, expires_at=M.now_ms() + b.hours * 3_600_000)
    db.add(s); audit(db, u.handle, "spark.create", f"{b.hours}h"); db.commit()
    return {"id": s.id, "by": "me", "hue": s.hue, "text": s.text, "poll": None, "close": s.close, "at": s.at, "lens": s.lens, "mediaUrl": s.media_url, "place": s.place, "expiresAt": s.expires_at}
