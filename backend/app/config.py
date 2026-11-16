"""Process configuration — everything comes from the environment (see backend/.env.example).

ENV=dev (default): convenient fallbacks (random per-process secrets, local Postgres, demo OTP codes, CORS *).
ENV=prod: the process refuses to start unless every secret is set explicitly and dev conveniences are off."""
import os, secrets

ENV = os.environ.get("ENV", "dev").strip().lower()
if ENV not in ("dev", "prod"): raise RuntimeError(f"ENV must be dev or prod (got {ENV!r})")
IS_PROD = ENV == "prod"

PROD_REQUIRED = ("DATABASE_URL", "JWT_SECRET", "APPROVAL_SECRET", "OTP_SECRET", "MASTER_KEY", "CORS_ORIGINS")
MIN_SECRET_LEN = 32

def production_problems(env) -> list[str]:
    """Everything that makes `env` unsafe to run with ENV=prod. Empty list = OK. Pure function (unit tested)."""
    out = [f"{k} must be set" for k in PROD_REQUIRED if not (env.get(k) or "").strip()]
    for k in ("JWT_SECRET", "APPROVAL_SECRET", "OTP_SECRET"):
        v = env.get(k) or ""
        if v and len(v) < MIN_SECRET_LEN: out.append(f"{k} must be at least {MIN_SECRET_LEN} characters")
    if len({env.get(k) for k in ("JWT_SECRET", "APPROVAL_SECRET", "OTP_SECRET") if env.get(k)}) < len([k for k in ("JWT_SECRET", "APPROVAL_SECRET", "OTP_SECRET") if env.get(k)]):
        out.append("JWT_SECRET, APPROVAL_SECRET and OTP_SECRET must all be different")
    if env.get("DEMO_OTP", "") != "0": out.append("DEMO_OTP must be 0 (demo codes would be returned in API responses)")
    origins = [o.strip() for o in (env.get("CORS_ORIGINS") or "").split(",") if o.strip()]
    if "*" in origins: out.append('CORS_ORIGINS must list explicit origins, not "*"')
    return out

if IS_PROD and (_p := production_problems(os.environ)):
    raise RuntimeError("Refusing to start with ENV=prod:\n  - " + "\n  - ".join(_p))

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql+psycopg://localhost/vibeloop")
# Secrets come only from the environment. In dev a random secret is generated if unset, so tokens reset on restart.
JWT_SECRET = os.environ.get("JWT_SECRET") or secrets.token_urlsafe(48)
APPROVAL_SECRET = os.environ.get("APPROVAL_SECRET") or secrets.token_urlsafe(48)
OTP_SECRET = (os.environ.get("OTP_SECRET") or secrets.token_urlsafe(48)).encode()
DEMO_OTP = os.environ.get("DEMO_OTP", "0" if IS_PROD else "1") == "1"
# Access tokens: 12 h by default, never more than 24 h. Clock-skew leeway for exp/iat checks.
ACCESS_TTL_MIN = max(5, min(int(os.environ.get("ACCESS_TTL_MIN", "720")), 1440))
JWT_LEEWAY_SEC = int(os.environ.get("JWT_LEEWAY_SEC", "30"))
APPROVAL_TTL_SEC = 300
PLATFORM_FEE = float(os.environ.get("PLATFORM_FEE", "0.08"))
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]

# Database pool (per API process). Total connections ≈ replicas × workers × (POOL_SIZE + MAX_OVERFLOW) — keep below Postgres max_connections / PgBouncer.
POOL_SIZE = int(os.environ.get("POOL_SIZE", "10"))
MAX_OVERFLOW = int(os.environ.get("MAX_OVERFLOW", "20"))
POOL_RECYCLE = int(os.environ.get("POOL_RECYCLE", "1800"))
POOL_TIMEOUT = int(os.environ.get("POOL_TIMEOUT", "30"))
STATEMENT_TIMEOUT_MS = int(os.environ.get("STATEMENT_TIMEOUT_MS", "15000"))

# Shared rate-limit store. Unset → in-memory (single process only).
REDIS_URL = os.environ.get("REDIS_URL", "").strip() or None
# Set to 1 only when the API sits behind a proxy/load balancer you control that sets X-Forwarded-For.
TRUST_PROXY = os.environ.get("TRUST_PROXY", "0") == "1"
# Signed links for private chat attachments (opened outside the app, without the bearer header).
MEDIA_LINK_TTL_SEC = int(os.environ.get("MEDIA_LINK_TTL_SEC", "86400"))
