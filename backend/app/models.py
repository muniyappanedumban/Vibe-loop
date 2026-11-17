import time, uuid
from sqlalchemy import Index, String, Integer, Float, Boolean, JSON, ForeignKey, Text, UniqueConstraint, BigInteger
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base
def now_ms() -> int: return int(time.time() * 1000)
def nid(p: str) -> str: return f"{p}_{uuid.uuid4().hex[:12]}"

class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("usr"))
    email: Mapped[str] = mapped_column(String(200), index=True)  # not unique: up to 5 accounts per email (v2)
    handle: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(String(20), default="creator", index=True)  # owner|creator|editor|analyst|viewer|fan
    suspended: Mapped[bool] = mapped_column(Boolean, default=False)
    mfa_required: Mapped[bool] = mapped_column(Boolean, default=False)
    hue: Mapped[int] = mapped_column(Integer, default=280)
    city: Mapped[str] = mapped_column(String(80), default="")
    bio: Mapped[str] = mapped_column(Text, default="")
    badge: Mapped[bool] = mapped_column(Boolean, default=False)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    social: Mapped[dict] = mapped_column(JSON, default=dict)  # privacy, reactionPack, lessons, reminders, mood
    created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms)
    # v2 identity
    verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    handle_changed_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # v4 profiles ("Two Faces") + presence
    avatar_social: Mapped[str | None] = mapped_column(String(200), nullable=True); avatar_chat: Mapped[str | None] = mapped_column(String(200), nullable=True)
    cover: Mapped[str | None] = mapped_column(String(200), nullable=True); state: Mapped[str] = mapped_column(String(10), default="", server_default="")
    pronouns: Mapped[str] = mapped_column(String(30), default="", server_default=""); links: Mapped[list] = mapped_column(JSON, default=list)
    last_seen_visible: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true"); last_seen_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    profile: Mapped[dict] = mapped_column(JSON, default=dict)  # chat_bio, hidden, who_can_message, ghost_hours, focus_social_muted, social_private, chat_read_receipts, mood

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
    loop_id: Mapped[str] = mapped_column(ForeignKey("loops.id"), index=True); visibility: Mapped[str] = mapped_column(String(20))
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
    __table_args__ = (Index("ix_notices_user_read", "user_id", "read"), Index("ix_notices_user_at", "user_id", "at"))
    module: Mapped[str] = mapped_column(String(10), default="social", server_default="social")  # social|chat

class Audit(Base):
    """Append-only: the API exposes no update or delete for this table."""
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)
    actor: Mapped[str] = mapped_column(String(120), index=True); action: Mapped[str] = mapped_column(String(80), index=True); detail: Mapped[str] = mapped_column(Text, default="")

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
    __table_args__ = (Index("ix_posts_author_at", "author_id", "at"),)
    text: Mapped[str] = mapped_column(Text); hue: Mapped[int] = mapped_column(Integer, default=200); mood: Mapped[str] = mapped_column(String(30), default="Happy")
    interest: Mapped[str] = mapped_column(String(30), default="Life"); place: Mapped[str | None] = mapped_column(String(120), nullable=True)
    bg: Mapped[str | None] = mapped_column(String(20), nullable=True); slides: Mapped[int | None] = mapped_column(Integer, nullable=True)
    shares: Mapped[int] = mapped_column(Integer, default=0); views: Mapped[int] = mapped_column(Integer, default=0)
    hidden: Mapped[bool] = mapped_column(Boolean, default=False); at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)
    seed_reactions: Mapped[dict] = mapped_column(JSON, default=dict)  # demo baseline counts, labelled demo in UI
    # creation studio: uploaded media, lens overlay, location tag, #tags/@mentions, collab partner, sound tag, audience
    media_url: Mapped[str | None] = mapped_column(String(200), nullable=True); lens: Mapped[str | None] = mapped_column(String(20), nullable=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True); lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    tags: Mapped[list] = mapped_column(JSON, default=list); collab: Mapped[str | None] = mapped_column(String(60), nullable=True)
    sound: Mapped[str | None] = mapped_column(String(80), nullable=True); audience: Mapped[str] = mapped_column(String(12), default="public")
    # v3 video: media kind of the attached upload + validated edit metadata {trimStart, trimEnd, speed, captions[]}
    media_kind: Mapped[str | None] = mapped_column(String(10), nullable=True); edit: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # v4: Mini Vote poll {q, options:[{text,votes}], voters:{uid: idx}} + Pin 3
    poll: Mapped[dict | None] = mapped_column(JSON, nullable=True); pinned_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

class PostReaction(Base):
    __tablename__ = "post_reactions"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True); post_id: Mapped[str] = mapped_column(ForeignKey("posts.id"), primary_key=True)
    key: Mapped[str] = mapped_column(String(10)); at: Mapped[int] = mapped_column(BigInteger, default=now_ms, server_default="0")
    __table_args__ = (Index("ix_post_reactions_user_at", "user_id", "at"),)

class Comment(Base):
    __tablename__ = "comments"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("cm"))
    post_id: Mapped[str] = mapped_column(ForeignKey("posts.id"), index=True); by: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    text: Mapped[str] = mapped_column(Text); held: Mapped[bool] = mapped_column(Boolean, default=False); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)
    reply_to: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True); liked_by: Mapped[list] = mapped_column(JSON, default=list)
    __table_args__ = (Index("ix_comments_post_at", "post_id", "at"),)

class Edge(Base):
    """follow | save | block | restrict | join(tribe) | remind(live)"""
    __tablename__ = "edges"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    kind: Mapped[str] = mapped_column(String(12), primary_key=True); target: Mapped[str] = mapped_column(String(40), primary_key=True)
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms)
    __table_args__ = (Index("ix_edges_kind_target", "kind", "target"),)  # follower counts / "who follows X"

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
    __table_args__ = (Index("ix_messages_chat_at", "chat_id", "at"),)

class Spark(Base):
    __tablename__ = "sparks"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("s"))
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True); hue: Mapped[int] = mapped_column(Integer); text: Mapped[str] = mapped_column(Text)
    poll: Mapped[dict | None] = mapped_column(JSON, nullable=True); close: Mapped[bool] = mapped_column(Boolean, default=False); at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)
    lens: Mapped[str | None] = mapped_column(String(20), nullable=True); media_url: Mapped[str | None] = mapped_column(String(200), nullable=True)
    place: Mapped[str | None] = mapped_column(String(120), nullable=True); expires_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

class MediaFile(Base):
    __tablename__ = "media_files"
    id: Mapped[str] = mapped_column(String(40), primary_key=True); owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    mime: Mapped[str] = mapped_column(String(100)); size: Mapped[int] = mapped_column(BigInteger); at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)
    # True once used in public content (post, story, avatar, product…). A file shared only in chats (MediaGrant rows) is private.
    public: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    kind: Mapped[str] = mapped_column(String(10), default="image", server_default="image")  # image|video|audio|file
    view_once: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")  # v6 snap media: owner or 60 s signed link only
    name: Mapped[str | None] = mapped_column(String(200), nullable=True); duration_sec: Mapped[float | None] = mapped_column(Float, nullable=True)

class Tribe(Base):
    __tablename__ = "tribes"
    id: Mapped[str] = mapped_column(String(40), primary_key=True); name: Mapped[str] = mapped_column(String(120)); kind: Mapped[str] = mapped_column(String(30))
    members: Mapped[int] = mapped_column(Integer, default=0); hue: Mapped[int] = mapped_column(Integer); desc: Mapped[str] = mapped_column(Text)

class LiveEvent(Base):
    __tablename__ = "live_events"
    id: Mapped[str] = mapped_column(String(40), primary_key=True); author_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200)); at: Mapped[int] = mapped_column(BigInteger); hue: Mapped[int] = mapped_column(Integer)

class Report(Base):
    __tablename__ = "reports"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("rp"))
    reporter_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True); target: Mapped[str] = mapped_column(String(80)); reason: Mapped[str] = mapped_column(String(120))
    reason_code: Mapped[str | None] = mapped_column(String(20), nullable=True); status: Mapped[str] = mapped_column(String(20), default="open", index=True)
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class PrivacyRequest(Base):
    __tablename__ = "privacy_requests"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("dsr"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True); kind: Mapped[str] = mapped_column(String(10))  # access|deletion
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


# ======================= v2: identity + chat module =======================
class OtpRequest(Base):
    """One row per OTP request. code_hash is HMAC-SHA256 (never the code). Unknown identifiers get a row with no user and no code."""
    __tablename__ = "otp_requests"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("otp"))
    user_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    identifier: Mapped[str] = mapped_column(String(200)); ip: Mapped[str] = mapped_column(String(64), default="")
    code_hash: Mapped[str | None] = mapped_column(String(80), nullable=True)
    expires_at: Mapped[int] = mapped_column(BigInteger, default=0); attempts: Mapped[int] = mapped_column(Integer, default=0)
    used_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True); verified: Mapped[bool] = mapped_column(Boolean, default=False)
    rate_limited: Mapped[bool] = mapped_column(Boolean, default=False); at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class HandleChange(Base):
    __tablename__ = "handle_changes"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("hc"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    old: Mapped[str] = mapped_column(String(60), index=True); new: Mapped[str] = mapped_column(String(60)); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class Friend(Base):
    """Directional row per side of a friendship (close/bestie are per-side labels)."""
    __tablename__ = "friends"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    friend_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True, index=True)  # reverse lookups
    close: Mapped[bool] = mapped_column(Boolean, default=False); bestie: Mapped[bool] = mapped_column(Boolean, default=False)
    since: Mapped[int] = mapped_column(BigInteger, default=now_ms)
    # v4 Friend Flame: day numbers (UTC days since epoch); flame mirrored on both sides
    flame: Mapped[int] = mapped_column(Integer, default=0, server_default="0"); flame_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_msg_day: Mapped[int | None] = mapped_column(Integer, nullable=True)

class FriendRequest(Base):
    __tablename__ = "friend_requests"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("fr"))
    from_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True); to_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(12), default="pending"); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class Conv(Base):
    __tablename__ = "convs"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("cv"))
    title: Mapped[str] = mapped_column(String(120), default=""); group: Mapped[bool] = mapped_column(Boolean, default=False)
    members: Mapped[list] = mapped_column(JSON, default=list)
    state: Mapped[dict] = mapped_column(JSON, default=dict)  # {userId: {folder, muted, pinned, locked, theme, request, lastRead}}
    fade_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by: Mapped[str] = mapped_column(String(40), default=""); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class ChatMsg(Base):
    __tablename__ = "chat_messages"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("cm"))
    conv_id: Mapped[str] = mapped_column(ForeignKey("convs.id"), index=True); sender: Mapped[str] = mapped_column(String(40))
    kind: Mapped[str] = mapped_column(String(12), default="text"); text: Mapped[str] = mapped_column(Text, default="")
    reply_to: Mapped[str | None] = mapped_column(String(40), nullable=True)
    reactions: Mapped[list] = mapped_column(JSON, default=list); starred_by: Mapped[list] = mapped_column(JSON, default=list)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False); edited: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)
    expires_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True); send_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    poll: Mapped[dict | None] = mapped_column(JSON, nullable=True); ref: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    opened_by: Mapped[list] = mapped_column(JSON, default=list)
    attachment: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # v4 kind=file {url,name,size,mime,kind}
    enc: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # v6 E2EE {v,nonce,box,senderKey} — opaque, never logged
    __table_args__ = (Index("ix_chat_messages_conv_at", "conv_id", "at"),)

class Status(Base):
    __tablename__ = "statuses"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("st"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(10)); text: Mapped[str] = mapped_column(String(300), default="")
    moji: Mapped[int | None] = mapped_column(Integer, nullable=True); bg: Mapped[str | None] = mapped_column(String(20), nullable=True)
    audience: Mapped[str] = mapped_column(String(10), default="friends"); at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)
    media: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # photo/video Moods: {url, kind, mime, durationSec}

class Town(Base):
    __tablename__ = "towns"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("town"))
    name: Mapped[str] = mapped_column(String(80)); open: Mapped[bool] = mapped_column(Boolean, default=True)
    hue: Mapped[int] = mapped_column(Integer, default=200); about: Mapped[str] = mapped_column(String(500), default="")
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True); invite_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    suspended: Mapped[bool] = mapped_column(Boolean, default=False); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class TownMember(Base):
    __tablename__ = "town_members"
    town_id: Mapped[str] = mapped_column(ForeignKey("towns.id"), primary_key=True); user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True, index=True)
    role: Mapped[str] = mapped_column(String(12), default="member"); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class TownChannel(Base):
    __tablename__ = "town_channels"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("ch"))
    town_id: Mapped[str] = mapped_column(ForeignKey("towns.id"), index=True); name: Mapped[str] = mapped_column(String(40))

class TownMessage(Base):
    __tablename__ = "town_messages"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("tm"))
    channel_id: Mapped[str] = mapped_column(ForeignKey("town_channels.id"), index=True); sender: Mapped[str] = mapped_column(String(40))
    text: Mapped[str] = mapped_column(Text); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)
    __table_args__ = (Index("ix_town_messages_channel_at", "channel_id", "at"),)

class TownBoard(Base):
    __tablename__ = "town_board"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("tb"))
    town_id: Mapped[str] = mapped_column(ForeignKey("towns.id"), index=True); text: Mapped[str] = mapped_column(String(1000))
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms)


# ======================= v3: money (admin-switchable), store, ads =======================
class Plan(Base):
    """Subscription plan. prices = {ISO2: minor units}; currency per country comes from the country-pricing table."""
    __tablename__ = "plans"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("plan"))
    name: Mapped[str] = mapped_column(String(80)); perks: Mapped[list] = mapped_column(JSON, default=list)
    period: Mapped[str] = mapped_column(String(10), default="month"); prices: Mapped[dict] = mapped_column(JSON, default=dict)
    active: Mapped[bool] = mapped_column(Boolean, default=True); demo: Mapped[bool] = mapped_column(Boolean, default=False)
    sort: Mapped[int] = mapped_column(Integer, default=0); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class Product(Base):
    __tablename__ = "store_products"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("prd"))
    creator_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(120)); desc: Mapped[str] = mapped_column(Text, default="")
    price: Mapped[int] = mapped_column(Integer, default=0); currency: Mapped[str] = mapped_column(String(3), default="INR")  # minor units
    media_url: Mapped[str | None] = mapped_column(String(200), nullable=True); kind: Mapped[str] = mapped_column(String(10), default="digital")
    stock: Mapped[int | None] = mapped_column(Integer, nullable=True); active: Mapped[bool] = mapped_column(Boolean, default=True)
    demo: Mapped[bool] = mapped_column(Boolean, default=False); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class Order(Base):
    """A payment intent. Only a verified provider webhook moves status to paid (and records the platform fee)."""
    __tablename__ = "orders"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("ord"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(12))  # subscription|product|tip
    ref_id: Mapped[str] = mapped_column(String(40)); creator_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    amount: Mapped[int] = mapped_column(Integer); currency: Mapped[str] = mapped_column(String(3), default="INR")
    provider: Mapped[str] = mapped_column(String(12)); provider_ref: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    pay_url: Mapped[str | None] = mapped_column(String(300), nullable=True); test_mode: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(12), default="created"); fee: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str] = mapped_column(String(200), default=""); at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)
    paid_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

class Subscription(Base):
    __tablename__ = "subscriptions"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("sub"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True); plan_id: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(12), default="active"); renews_at: Mapped[int] = mapped_column(BigInteger)
    order_id: Mapped[str] = mapped_column(String(40)); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class Ad(Base):
    """Admin-created ads only; always shown labelled \"Sponsored\"."""
    __tablename__ = "ads"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("ad"))
    title: Mapped[str] = mapped_column(String(80)); body: Mapped[str] = mapped_column(String(200), default="")
    cta: Mapped[str] = mapped_column(String(30), default="Learn more"); url: Mapped[str] = mapped_column(String(300))
    sponsor: Mapped[str] = mapped_column(String(80)); places: Mapped[list] = mapped_column(JSON, default=list)
    active: Mapped[bool] = mapped_column(Boolean, default=True); demo: Mapped[bool] = mapped_column(Boolean, default=False)
    impressions: Mapped[int] = mapped_column(Integer, default=0); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)


# ======================= v4: uploads, promos, collections =======================
class UploadSession(Base):
    """Resumable upload (≤1 GB). Bytes go to media/uploads/<id>.part until complete."""
    __tablename__ = "upload_sessions"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("up"))
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    filename: Mapped[str] = mapped_column(String(200)); ext: Mapped[str] = mapped_column(String(10)); mime: Mapped[str] = mapped_column(String(100))
    kind: Mapped[str] = mapped_column(String(10)); size: Mapped[int] = mapped_column(BigInteger); received: Mapped[int] = mapped_column(BigInteger, default=0)
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True); duration_sec: Mapped[float | None] = mapped_column(Float, nullable=True)
    done: Mapped[bool] = mapped_column(Boolean, default=False); media_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class Promo(Base):
    """Our own brand promotions (admin controlled), labelled "From VibeLoop"."""
    __tablename__ = "promos"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("promo"))
    title: Mapped[str] = mapped_column(String(120)); body: Mapped[str] = mapped_column(String(500), default="")
    kind: Mapped[str] = mapped_column(String(10), default="card"); media_url: Mapped[str | None] = mapped_column(String(300), nullable=True)
    url: Mapped[str | None] = mapped_column(String(300), nullable=True); cta: Mapped[str | None] = mapped_column(String(30), nullable=True)
    placement: Mapped[list] = mapped_column(JSON, default=list); target: Mapped[dict] = mapped_column(JSON, default=dict)
    start_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True); end_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True); priority: Mapped[int] = mapped_column(Integer, default=0)
    by: Mapped[str] = mapped_column(String(120), default=""); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class Collection(Base):
    """Save Stack: named collections of posts."""
    __tablename__ = "collections"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("col"))
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True); name: Mapped[str] = mapped_column(String(60))
    items: Mapped[list] = mapped_column(JSON, default=list); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)


# ======================= v5: content hub (CMS), reviews, Speak Up =======================
class Page(Base):
    """Admin-managed content page. body = plain text with simple markdown. items: faq [{q,a}] | links [{label,url,platform}] | contacts [{label,value,type}]."""
    __tablename__ = "pages"
    slug: Mapped[str] = mapped_column(String(60), primary_key=True)
    module: Mapped[str] = mapped_column(String(8), default="both")  # glow|hush|both
    kind: Mapped[str] = mapped_column(String(8), default="page")  # page|faq|blog|news|guide|links
    title: Mapped[str] = mapped_column(String(160)); summary: Mapped[str] = mapped_column(String(400), default="")
    body: Mapped[str] = mapped_column(Text, default=""); cover_url: Mapped[str | None] = mapped_column(String(300), nullable=True)
    items_kind: Mapped[str | None] = mapped_column(String(10), nullable=True); items: Mapped[list] = mapped_column(JSON, default=list)
    published: Mapped[bool] = mapped_column(Boolean, default=False); order: Mapped[int] = mapped_column(Integer, default=0)
    version: Mapped[int] = mapped_column(Integer, default=1); updated_at: Mapped[int] = mapped_column(BigInteger, default=now_ms)
    updated_by: Mapped[str] = mapped_column(String(120), default=""); created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class PageVersion(Base):
    """Immutable snapshot of a page at each version (history + restore)."""
    __tablename__ = "page_versions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(60), index=True); version: Mapped[int] = mapped_column(Integer)
    snapshot: Mapped[dict] = mapped_column(JSON); by: Mapped[str] = mapped_column(String(120), default=""); note: Mapped[str] = mapped_column(String(200), default="")
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms)
    __table_args__ = (UniqueConstraint("slug", "version", name="uq_page_version"),)

class Review(Base):
    """type vouch (target = user id) | product (Real Talk, target = product id). One per (type, author, target)."""
    __tablename__ = "reviews"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("rv"))
    type: Mapped[str] = mapped_column(String(8)); author_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    target_id: Mapped[str] = mapped_column(String(40), index=True); rating: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text, default=""); context: Mapped[str | None] = mapped_column(String(10), nullable=True)
    verified_purchase: Mapped[bool] = mapped_column(Boolean, default=False); status: Mapped[str] = mapped_column(String(8), default="visible")
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms); updated_at: Mapped[int] = mapped_column(BigInteger, default=now_ms)
    __table_args__ = (UniqueConstraint("type", "author_id", "target_id", name="uq_review_once"),)

class Ticket(Base):
    """Speak Up report/ticket. priority urgent|high|normal; status open|reviewing|actioned|closed."""
    __tablename__ = "speakup_tickets"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("su"))
    code: Mapped[str] = mapped_column(String(12), unique=True); reporter_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    category: Mapped[str] = mapped_column(String(16)); target_type: Mapped[str] = mapped_column(String(10), default="none")
    target_id: Mapped[str | None] = mapped_column(String(60), nullable=True); details: Mapped[str] = mapped_column(Text, default="")
    evidence: Mapped[list] = mapped_column(JSON, default=list); priority: Mapped[str] = mapped_column(String(8), default="normal", index=True)
    status: Mapped[str] = mapped_column(String(10), default="open", index=True); history: Mapped[list] = mapped_column(JSON, default=list)
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True); updated_at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class StoreClaim(Base):
    """A free Stash product claimed by a user (no payment order) — lets free claimers write Real Talk."""
    __tablename__ = "store_claims"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True); product_id: Mapped[str] = mapped_column(String(40), primary_key=True, index=True)
    creator_id: Mapped[str] = mapped_column(String(40), index=True); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)


# ======================= hardening: webhook replay protection, private chat media, membership indexes =======================
class WebhookEvent(Base):
    """Processed provider webhook events (replay protection). event_id = provider event id, else sha256 of the signed payload."""
    __tablename__ = "webhook_events"
    provider: Mapped[str] = mapped_column(String(12), primary_key=True); event_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class MediaGrant(Base):
    """A media file shared into a conversation. Files with grants (and not public) are served only to that conv's members."""
    __tablename__ = "media_grants"
    media_id: Mapped[str] = mapped_column(ForeignKey("media_files.id"), primary_key=True); conv_id: Mapped[str] = mapped_column(ForeignKey("convs.id"), primary_key=True, index=True)
    at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

# ---------- v6 realtime parity ----------
class MessageReceipt(Base):
    __tablename__ = "message_receipts"
    message_id: Mapped[str] = mapped_column(ForeignKey("chat_messages.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    delivered_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True); read_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

class Call(Base):
    __tablename__ = "calls"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("call"))
    caller_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True); callee_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    media: Mapped[str] = mapped_column(String(8)); status: Mapped[str] = mapped_column(String(10), default="ringing", index=True)
    started_at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)
    answered_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True); ended_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

class PushToken(Base):
    __tablename__ = "push_tokens"
    token: Mapped[str] = mapped_column(String(300), primary_key=True); user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    platform: Mapped[str] = mapped_column(String(10)); provider: Mapped[str] = mapped_column(String(10)); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class PushSend(Base):
    __tablename__ = "push_sends"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True); kind: Mapped[str] = mapped_column(String(20)); provider: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(10))  # sent|failed|skipped
    error: Mapped[str] = mapped_column(String(300), default=""); at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

class DeviceKey(Base):
    __tablename__ = "device_keys"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True); device_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    public_key: Mapped[str] = mapped_column(String(64)); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class SparkView(Base):
    __tablename__ = "spark_views"
    spark_id: Mapped[str] = mapped_column(ForeignKey("sparks.id", ondelete="CASCADE"), primary_key=True)
    viewer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

class FollowRequest(Base):
    __tablename__ = "follow_requests"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: nid("flr"))
    from_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True); to_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(10), default="pending"); at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

# Membership lookups on JSON member lists: GIN index on members::jsonb so `members @> '["uid"]'` is an index scan (Postgres).
from sqlalchemy import cast
from sqlalchemy.dialects.postgresql import JSONB
Index("ix_convs_members_gin", cast(Conv.members, JSONB), postgresql_using="gin")
Index("ix_chats_members_gin", cast(Chat.members, JSONB), postgresql_using="gin")

def has_member(col, uid: str):
    """SQL filter: JSON member list contains uid (uses the GIN index above)."""
    return cast(col, JSONB).contains([uid])
