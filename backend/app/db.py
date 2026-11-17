from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from .config import (DATABASE_URL, DATABASE_READ_URL, PGBOUNCER, POOL_SIZE, MAX_OVERFLOW, POOL_RECYCLE, POOL_TIMEOUT, STATEMENT_TIMEOUT_MS)

def make_engine(url: str):
    if url.startswith("sqlite"): return create_engine(url, connect_args={"check_same_thread": False})
    # Pool sized from env; pre-ping drops dead connections; recycle avoids LB/PgBouncer idle cuts.
    # statement_timeout bounds any single query so one slow request can't pin a connection forever.
    args: dict = {}
    if PGBOUNCER:
        # Transaction pooling: no server-side prepared statements, and no startup "options" (PgBouncer rejects them).
        # Set the timeout on the role instead:  ALTER ROLE vibeloop SET statement_timeout = '15s';
        args["prepare_threshold"] = None
    elif STATEMENT_TIMEOUT_MS > 0: args["options"] = f"-c statement_timeout={STATEMENT_TIMEOUT_MS}"
    return create_engine(url, pool_pre_ping=True, pool_size=POOL_SIZE, max_overflow=MAX_OVERFLOW, pool_recycle=POOL_RECYCLE,
                         pool_timeout=POOL_TIMEOUT, connect_args=args)

engine = make_engine(DATABASE_URL)
# Read replica: opt-in via DATABASE_READ_URL; otherwise the same engine as writes.
read_engine = make_engine(DATABASE_READ_URL) if DATABASE_READ_URL else engine
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
ReadSessionLocal = sessionmaker(bind=read_engine, autoflush=False, expire_on_commit=False) if read_engine is not engine else SessionLocal
class Base(DeclarativeBase): pass
def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()
def get_read_db():
    """Session on the read replica (or the primary when none is configured). Read-only use only: results may lag the
    primary by replication delay, so don't use it right after a write by the same user or for auth/money decisions."""
    db = ReadSessionLocal()
    try: yield db
    finally:
        db.rollback(); db.close()
def dispose_engines():
    engine.dispose()
    if read_engine is not engine: read_engine.dispose()
