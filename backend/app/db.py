from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from .config import DATABASE_URL, POOL_SIZE, MAX_OVERFLOW, POOL_RECYCLE, POOL_TIMEOUT, STATEMENT_TIMEOUT_MS

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # Pool sized from env; pre-ping drops dead connections; recycle avoids LB/PgBouncer idle cuts.
    # statement_timeout bounds any single query so one slow request can't pin a connection forever.
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=POOL_SIZE, max_overflow=MAX_OVERFLOW, pool_recycle=POOL_RECYCLE,
                           pool_timeout=POOL_TIMEOUT, connect_args={"options": f"-c statement_timeout={STATEMENT_TIMEOUT_MS}"} if STATEMENT_TIMEOUT_MS > 0 else {})
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
class Base(DeclarativeBase): pass
def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()
