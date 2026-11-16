"""v4 resumable uploads (≤ 1 GB): images, video, audio, pdf, zip, office docs, txt.
Type = extension allowlist AND magic bytes of the first chunk must agree; executables/scripts are rejected (415).
Chunks must arrive in order (offset == received) — anything else is 409 with the current `received` so clients resume."""
import hashlib, json, os, secrets, shutil, subprocess
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .db import get_db, SessionLocal
from . import models as M
from .security import current_user, audit
from .ratelimit import write_limit
from .routes_media import MEDIA_DIR

router = APIRouter()
CHUNK = 5 * 1024 * 1024
CHUNK_SLACK = 64 * 1024
MAX_UPLOAD = 1024 ** 3  # 1 GB
MAX_VIDEO_SEC = 60
MAX_OPEN_SESSIONS = 20  # unfinished resumable uploads per user (each reserves disk until complete / 24 h cleanup)
PART_DIR = os.path.join(MEDIA_DIR, "uploads")
os.makedirs(PART_DIR, exist_ok=True)
FFPROBE = shutil.which("ffprobe")

# ext → (kind, mime, magic family)
ALLOWED = {
    "jpg": ("image", "image/jpeg", "jpeg"), "jpeg": ("image", "image/jpeg", "jpeg"), "png": ("image", "image/png", "png"),
    "gif": ("image", "image/gif", "gif"), "webp": ("image", "image/webp", "webp"),
    "mp4": ("video", "video/mp4", "ftyp"), "mov": ("video", "video/quicktime", "ftyp"), "webm": ("video", "video/webm", "ebml"),
    "m4a": ("audio", "audio/mp4", "ftyp"), "mp3": ("audio", "audio/mpeg", "mp3"), "ogg": ("audio", "audio/ogg", "ogg"), "wav": ("audio", "audio/wav", "wav"),
    "pdf": ("file", "application/pdf", "pdf"), "zip": ("file", "application/zip", "zip"),
    "docx": ("file", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "zip"),
    "xlsx": ("file", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "zip"),
    "pptx": ("file", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "zip"),
    "txt": ("file", "text/plain", "text"),
}
EXEC_MAGIC = (b"MZ", b"\x7fELF", b"#!", b"\xfe\xed\xfa\xce", b"\xfe\xed\xfa\xcf", b"\xce\xfa\xed\xfe", b"\xcf\xfa\xed\xfe", b"\xca\xfe\xba\xbe", b"\x00asm")

def family(head: bytes) -> str | None:
    if any(head.startswith(m) for m in EXEC_MAGIC): return "exec"
    if head.startswith(b"\xff\xd8\xff"): return "jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"): return "png"
    if head[:6] in (b"GIF87a", b"GIF89a"): return "gif"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP": return "webp"
    if head[:4] == b"RIFF" and head[8:12] == b"WAVE": return "wav"
    if head[4:8] == b"ftyp": return "ftyp"
    if head.startswith(b"\x1a\x45\xdf\xa3"): return "ebml"
    if head.startswith(b"ID3") or head[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"): return "mp3"
    if head.startswith(b"OggS"): return "ogg"
    if head.startswith(b"%PDF-"): return "pdf"
    if head.startswith(b"PK\x03\x04"): return "zip"
    if b"\x00" not in head[:4096]:
        try: head[:4096].decode("utf-8"); return "text"
        except UnicodeDecodeError:
            try: head[:4092].decode("utf-8"); return "text"  # chunk boundary may split a multibyte char
            except UnicodeDecodeError: return None
    return None

def ext_of(name: str) -> str: return name.rsplit(".", 1)[-1].lower() if "." in name else ""

def probe_duration(path: str) -> float | None:
    if not FFPROBE: return None
    try:
        out = subprocess.run([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "json", path], capture_output=True, timeout=20, text=True)
        return float(json.loads(out.stdout or "{}").get("format", {}).get("duration"))
    except Exception: return None

def part_path(sid: str) -> str: return os.path.join(PART_DIR, f"{sid}.part")

def get_session(db: Session, sid: str, u: M.User) -> M.UploadSession:
    s = db.get(M.UploadSession, sid)
    if not s or s.owner_id != u.id: raise HTTPException(404, "Upload not found")
    return s

def drop(db: Session, s: M.UploadSession):
    try: os.remove(part_path(s.id))
    except FileNotFoundError: pass
    db.delete(s); db.commit()

class UploadIn(BaseModel):
    filename: str = Field(min_length=1, max_length=200); size: int = Field(gt=0); mime: str = Field(default="", max_length=100)
    sha256: str | None = Field(default=None, pattern=r"^[0-9a-fA-F]{64}$"); durationSec: float | None = Field(default=None, ge=0)
@router.post("/uploads")
def start(b: UploadIn, u: M.User = Depends(write_limit("upload_init")), db: Session = Depends(get_db)):
    if b.size > MAX_UPLOAD: raise HTTPException(413, "Files must be 1 GB or smaller")
    open_n = db.scalar(select(func.count()).select_from(M.UploadSession).where(M.UploadSession.owner_id == u.id, M.UploadSession.done == False))  # noqa: E712
    if open_n >= MAX_OPEN_SESSIONS: raise HTTPException(429, "Too many unfinished uploads — finish or wait for them to expire", headers={"Retry-After": "3600"})
    ext = ext_of(b.filename)
    if ext not in ALLOWED: raise HTTPException(415, "This file type isn't allowed")
    kind, mime, _ = ALLOWED[ext]
    name = os.path.basename(b.filename.replace("\\", "/"))[:200]
    s = M.UploadSession(owner_id=u.id, filename=name, ext=ext, mime=mime, kind=kind, size=b.size, sha256=(b.sha256 or "").lower() or None, duration_sec=b.durationSec)
    db.add(s); db.commit(); open(part_path(s.id), "wb").close()
    return {"uploadId": s.id, "chunkSize": CHUNK, "received": 0}

@router.put("/uploads/{sid}/chunk")
async def chunk(sid: str, offset: int, req: Request, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    s = get_session(db, sid, u)
    if s.done: raise HTTPException(409, "Upload already complete")
    if offset != s.received: return JSONResponse({"detail": "Out-of-order chunk — resume from `received`", "received": s.received}, status_code=409)
    data = await req.body()
    if not data: raise HTTPException(400, "Empty chunk")
    if len(data) > CHUNK + CHUNK_SLACK: raise HTTPException(413, "Chunk too large")
    if s.received + len(data) > s.size: raise HTTPException(400, "More bytes than the declared size")
    if offset == 0:
        fam = family(data[:4096])
        if fam == "exec" or fam != ALLOWED[s.ext][2]:
            audit(db, u.handle, "upload.rejected", f"{s.id} {s.filename} magic={fam}"); drop(db, s)
            raise HTTPException(415, "File contents don't match an allowed type")
    with open(part_path(s.id), "ab") as f: f.write(data)
    s.received += len(data); db.commit()
    return {"received": s.received}

@router.get("/uploads/{sid}")
def status(sid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    s = get_session(db, sid, u); return {"received": s.received, "size": s.size, "done": s.done}

@router.post("/uploads/{sid}/complete")
def complete(sid: str, u: M.User = Depends(current_user), db: Session = Depends(get_db)):
    s = get_session(db, sid, u)
    if s.done and s.media_id:
        mf = db.get(M.MediaFile, s.media_id); return media_out(mf, s.ext)
    if s.received != s.size: return JSONResponse({"detail": "Upload incomplete", "received": s.received}, status_code=409)
    path = part_path(s.id)
    if s.sha256:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for blk in iter(lambda: f.read(1 << 20), b""): h.update(blk)
        if h.hexdigest() != s.sha256: drop(db, s); raise HTTPException(400, "Checksum mismatch — upload again")
    dur = None
    if s.kind == "video": dur = probe_duration(path) or s.duration_sec
    mid = secrets.token_hex(12); os.replace(path, os.path.join(MEDIA_DIR, f"{mid}.{s.ext}"))
    mf = M.MediaFile(id=mid, owner_id=u.id, mime=s.mime, size=s.size, kind=s.kind, name=s.filename, duration_sec=dur)
    db.add(mf); s.done, s.media_id = True, mid
    audit(db, u.handle, "upload.complete", f"{mid} {s.mime} {s.size}B"); db.commit()
    return media_out(mf, s.ext)

def media_out(mf: M.MediaFile, ext: str) -> dict:
    return {"url": f"/media/{mf.id}.{ext}", "kind": mf.kind, "mime": mf.mime, "size": mf.size, "name": mf.name, "durationSec": mf.duration_sec}

def check_video_length(mf: M.MediaFile | None):
    """Posts/Blinks: videos must be ≤ 60 s (ffprobe when installed, else client-declared duration)."""
    if mf and mf.kind == "video" and mf.duration_sec and mf.duration_sec > MAX_VIDEO_SEC + 0.5:
        raise HTTPException(400, f"Videos for posts and Blinks must be {MAX_VIDEO_SEC} seconds or shorter")

def media_for(db: Session, url: str | None) -> M.MediaFile | None:
    if not url or not url.startswith("/media/"): return None
    return db.get(M.MediaFile, url.split("/")[-1].split(".")[0])

def cleanup_abandoned(max_age_ms: int = 24 * 3600_000) -> int:
    """Startup: drop unfinished upload sessions older than 24 h and their partial files."""
    db = SessionLocal(); n = 0
    try:
        for s in db.scalars(select(M.UploadSession).where(M.UploadSession.done == False, M.UploadSession.at < M.now_ms() - max_age_ms)).all():  # noqa: E712
            try: os.remove(part_path(s.id))
            except FileNotFoundError: pass
            db.delete(s); n += 1
        db.commit()
    except Exception: db.rollback()
    finally: db.close()
    return n

# ---------- admin ----------
from .security import require
@router.get("/admin/uploads")
def admin_uploads(q: str = "", limit: int = 100, a: M.User = Depends(require("owner")), db: Session = Depends(get_db)):
    s = select(M.MediaFile).order_by(M.MediaFile.at.desc()).limit(max(1, min(limit, 100)))
    if q: s = s.where((M.MediaFile.name.ilike(f"%{q[:100]}%")) | (M.MediaFile.id.ilike(f"%{q[:100]}%")))
    out = []; rows = db.scalars(s).all()
    if rows: db.scalars(select(M.User).where(M.User.id.in_({m.owner_id for m in rows}))).all()  # batch owners
    for m in rows:
        owner = db.get(M.User, m.owner_id)
        out.append({"id": m.id, "name": m.name, "kind": m.kind, "mime": m.mime, "size": m.size, "owner": owner.handle if owner else None, "at": m.at,
                    "url": f"/media/{m.id}.{ALL_EXT.get(m.mime, 'bin')}", "durationSec": m.duration_sec})
    return out
ALL_EXT = {**{v[1]: k for k, v in ALLOWED.items()}, "image/jpeg": "jpg"}
