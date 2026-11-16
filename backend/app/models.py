import time, uuid
from sqlalchemy import String, Integer, Float, Boolean, JSON, ForeignKey, Text, UniqueConstraint, BigInteger
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base
def now_ms() -> int: return int(time.time() * 1000)
def nid(p: str) -> str: return f"{p}_{uuid.uuid4().hex[:12]}"

class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("usr"))
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    handle: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(String(20), default="creator")  # owner|creator|editor|analyst|viewer|fan
    suspended: Mapped[bool] = mapped_column(Boolean, default=False)
    mfa_required: Mapped[bool] = mapped_column(Boolean, default=False)
    hue: Mapped[int] = mapped_column(Integer, default=280)
    city: Mapped[str] = mapped_column(String(80), default="")
    bio: Mapped[str] = mapped_column(Text, default="")
    badge: Mapped[bool] = mapped_column(Boolean, default=False)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    social: Mapped[dict] = mapped_column(JSON, default=dict)  # privacy, reactionPack, lessons, reminders, mood
    created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class Loop(Base):
    __tablename__ = "loops"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("loop"))
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200)); template: Mapped[str] = mapped_column(String(60))
    size_limit: Mapped[int] = mapped_column(Integer, default=20); min_score: Mapped[int] = mapped_column(Integer, default=70)
    window_hours: Mapped[int] = mapped_column(Integer, default=24); status: Mapped[str] = mapped_column(String(20), default="testing")
    opened_at: Mapped[int] = mapped_column(BigInteger, default=now_ms)
    drafts: Mapped[list] = mapped_column(JSON, default=list); members: Mapped[list] = mapped_column(JSON, default=list)
    notes: Mapped[list] = mapped_column(JSON, default=list); dna: Mapped[dict] = mapped_column(JSON, default=dict)
    invite: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    silent: Mapped[bool] = mapped_column(Boolean, default=False); paid_only: Mapped[bool] = mapped_column(Boolean, default=False)
    fail_reason: Mapped[str | None] = mapped_column(Text, nullable=True); demo: Mapped[bool] = mapped_column(Boolean, default=False)

class Reaction(Base):
    __tablename__ = "reactions"
    __table_args__ = (UniqueConstraint("loop_id", "member_id", "version"),)
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("r"))
    loop_id: Mapped[str] = mapped_column(ForeignKey("loops.id"), index=True)
    member_id: Mapped[str] = mapped_column(String(40)); version: Mapped[str] = mapped_column(String(1))
    kind: Mapped[str] = mapped_column(String(10)); text: Mapped[str] = mapped_column(Text, default="")
    anonymous: Mapped[bool] = mapped_column(Boolean, default=False); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class ApprovalToken(Base):
    __tablename__ = "approval_tokens"
    jti: Mapped[str] = mapped_column(String(60), primary_key=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id")); action: Mapped[str] = mapped_column(String(20))
    payload_hash: Mapped[str] = mapped_column(String(80)); expires_at: Mapped[int] = mapped_column(BigInteger)
    used_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

class Publish(Base):
    __tablename__ = "publishes"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("pub"))
    loop_id: Mapped[str] = mapped_column(ForeignKey("loops.id")); visibility: Mapped[str] = mapped_column(String(20))
    approver: Mapped[str] = mapped_column(String(60)); token_id: Mapped[str] = mapped_column(String(60))
    status: Mapped[str] = mapped_column(String(20), default="released"); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class Txn(Base):
    __tablename__ = "txns"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("t"))
    creator_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True); kind: Mapped[str] = mapped_column(String(20))
    from_name: Mapped[str] = mapped_column(String(120)); gross: Mapped[float] = mapped_column(Float); fee: Mapped[float] = mapped_column(Float)
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms); demo: Mapped[bool] = mapped_column(Boolean, default=False)

class Payout(Base):
    __tablename__ = "payouts"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("po"))
    creator_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True); amount: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(20), default="pending_review"); token_id: Mapped[str] = mapped_column(String(60))
    reviewed_by: Mapped[str | None] = mapped_column(String(60), nullable=True); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class Notice(Base):
    __tablename__ = "notices"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("n"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True); kind: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(200)); body: Mapped[str] = mapped_column(Text, default="")
    route: Mapped[str | None] = mapped_column(String(40), nullable=True); params: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class Audit(Base):
    """Append-only: the API exposes no update or delete for this table."""
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)
    actor: Mapped[str] = mapped_column(String(120)); action: Mapped[str] = mapped_column(String(80), index=True); detail: Mapped[str] = mapped_column(Text, default="")

class Asset(Base):
    __tablename__ = "assets"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("a"))
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True); title: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(20)); hue: Mapped[int] = mapped_column(Integer, default=200)
    synthetic: Mapped[bool] = mapped_column(Boolean, default=False); core_identity: Mapped[bool] = mapped_column(Boolean, default=False)
    versions: Mapped[list] = mapped_column(JSON, default=list)

class Insight(Base):
    __tablename__ = "insights"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("i"))
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True); text: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(200), default=""); corrected: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

class Post(Base):
    __tablename__ = "posts"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("p"))
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True); kind: Mapped[str] = mapped_column(String(20))
    text: Mapped[str] = mapped_column(Text); hue: Mapped[int] = mapped_column(Integer, default=200); mood: Mapped[str] = mapped_column(String(30), default="Happy")
    interest: Mapped[str] = mapped_column(String(30), default="Life"); place: Mapped[str | None] = mapped_column(String(120), nullable=True)
    bg: Mapped[str | None] = mapped_column(String(20), nullable=True); slides: Mapped[int | None] = mapped_column(Integer, nullable=True)
    shares: Mapped[int] = mapped_column(Integer, default=0); views: Mapped[int] = mapped_column(Integer, default=0)
    hidden: Mapped[bool] = mapped_column(Boolean, default=False); at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)
    seed_reactions: Mapped[dict] = mapped_column(JSON, default=dict)  # demo baseline counts, labelled demo in UI

class PostReaction(Base):
    __tablename__ = "post_reactions"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True); post_id: Mapped[str] = mapped_column(ForeignKey("posts.id"), primary_key=True)
    key: Mapped[str] = mapped_column(String(10))

class Comment(Base):
    __tablename__ = "comments"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("cm"))
    post_id: Mapped[str] = mapped_column(ForeignKey("posts.id"), index=True); by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    text: Mapped[str] = mapped_column(Text); held: Mapped[bool] = mapped_column(Boolean, default=False); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class Edge(Base):
    """follow | save | block | restrict | join(tribe) | remind(live)"""
    __tablename__ = "edges"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    kind: Mapped[str] = mapped_column(String(12), primary_key=True); target: Mapped[str] = mapped_column(String(40), primary_key=True)
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class Chat(Base):
    __tablename__ = "chats"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("c"))
    title: Mapped[str] = mapped_column(String(200)); group: Mapped[bool] = mapped_column(Boolean, default=False)
    members: Mapped[list] = mapped_column(JSON, default=list)  # user ids
    state: Mapped[dict] = mapped_column(JSON, default=dict)    # {userId: {pinned, muted, request}}

class Message(Base):
    __tablename__ = "messages"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("m"))
    chat_id: Mapped[str] = mapped_column(ForeignKey("chats.id"), index=True); sender: Mapped[str] = mapped_column(String(40))
    text: Mapped[str] = mapped_column(Text); react: Mapped[int | None] = mapped_column(Integer, nullable=True); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class Spark(Base):
    __tablename__ = "sparks"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("s"))
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id")); hue: Mapped[int] = mapped_column(Integer); text: Mapped[str] = mapped_column(Text)
    poll: Mapped[dict | None] = mapped_column(JSON, nullable=True); close: Mapped[bool] = mapped_column(Boolean, default=False); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class Tribe(Base):
    __tablename__ = "tribes"
    id: Mapped[str] = mapped_column(String(40), primary_key=True); name: Mapped[str] = mapped_column(String(120)); kind: Mapped[str] = mapped_column(String(30))
    members: Mapped[int] = mapped_column(Integer, default=0); hue: Mapped[int] = mapped_column(Integer); desc: Mapped[str] = mapped_column(Text)

class LiveEvent(Base):
    __tablename__ = "live_events"
    id: Mapped[str] = mapped_column(String(40), primary_key=True); author_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(200)); at: Mapped[int] = mapped_column(BigInteger); hue: Mapped[int] = mapped_column(Integer)

class Report(Base):
    __tablename__ = "reports"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("rp"))
    reporter_id: Mapped[str] = mapped_column(ForeignKey("users.id")); target: Mapped[str] = mapped_column(String(80)); reason: Mapped[str] = mapped_column(String(120))
    reason_code: Mapped[str | None] = mapped_column(String(20), nullable=True); status: Mapped[str] = mapped_column(String(20), default="open")
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class PrivacyRequest(Base):
    __tablename__ = "privacy_requests"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("dsr"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id")); kind: Mapped[str] = mapped_column(String(10))  # access|deletion
    status: Mapped[str] = mapped_column(String(20), default="pending"); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class KV(Base):
    """Platform settings, feature flags, kill switches, role matrix."""
    __tablename__ = "kv"
    ns: Mapped[str] = mapped_column(String(20), primary_key=True); key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)

class Announcement(Base):
    __tablename__ = "announcements"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("an"))
    title: Mapped[str] = mapped_column(String(200)); body: Mapped[str] = mapped_column(Text); audience: Mapped[str] = mapped_column(String(30))
    by: Mapped[str] = mapped_column(String(120)); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)
