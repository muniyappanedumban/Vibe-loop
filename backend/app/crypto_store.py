"""Secrets at rest: Fernet with a key from env MASTER_KEY. In dev, a key file backend/.master_key is generated (gitignored) and a warning logged.
Never log or return plaintext secrets — use mask()."""
import base64, hashlib, logging, os
from cryptography.fernet import Fernet, InvalidToken

log = logging.getLogger("vibeloop.crypto")
KEY_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".master_key")
PREFIX = "enc:"
_fernet: Fernet | None = None

def _load_key() -> bytes:
    raw = os.environ.get("MASTER_KEY")
    if not raw:
        if os.path.isfile(KEY_FILE):
            with open(KEY_FILE, "rb") as f: raw = f.read().decode().strip()
        else:
            raw = Fernet.generate_key().decode()
            fd = os.open(KEY_FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w") as f: f.write(raw)
        log.warning("MASTER_KEY is not set — using the dev key file backend/.master_key. Set MASTER_KEY in any shared or production environment.")
    try:
        k = raw.encode(); Fernet(k); return k
    except (ValueError, TypeError):
        return base64.urlsafe_b64encode(hashlib.sha256(raw.encode()).digest())  # any passphrase → a valid 32-byte key

def fernet() -> Fernet:
    global _fernet
    if _fernet is None: _fernet = Fernet(_load_key())
    return _fernet

def encrypt(plain: str) -> str: return PREFIX + fernet().encrypt(plain.encode()).decode()

def decrypt(token: str | None) -> str | None:
    if not token: return None
    if not token.startswith(PREFIX): return None
    try: return fernet().decrypt(token[len(PREFIX):].encode()).decode()
    except InvalidToken:
        log.error("A stored secret could not be decrypted (MASTER_KEY changed?)"); return None

def mask(plain: str | None) -> str | None:
    if not plain: return None
    return "••••" + plain[-4:] if len(plain) > 4 else "••••"
