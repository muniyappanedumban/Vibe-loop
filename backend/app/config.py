import os, secrets
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql+psycopg://localhost/vibeloop")
# Secrets come only from the environment (PRD rule). A random dev secret is generated if unset, so tokens reset on restart.
JWT_SECRET = os.environ.get("JWT_SECRET") or secrets.token_urlsafe(48)
APPROVAL_SECRET = os.environ.get("APPROVAL_SECRET") or secrets.token_urlsafe(48)
ACCESS_TTL_MIN = int(os.environ.get("ACCESS_TTL_MIN", "720"))
APPROVAL_TTL_SEC = 300
PLATFORM_FEE = float(os.environ.get("PLATFORM_FEE", "0.08"))
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")
