# VibeLoop — Architecture

**Honest status:** the current build is a single-node development setup — one FastAPI process, one local Postgres, media on local
disk, in-memory rate limits unless `REDIS_URL` is set. It has **not** been load-tested. The "Scaling plan" below is the path to very
large user counts and says what already supports it; it is not a claim that the system runs at that scale today.

## Components (today)

```
 Mobile app (Expo/React Native)        Admin console (React/Vite)
            │  HTTPS JSON + bearer JWT            │
            └──────────────┬──────────────────────┘
                           ▼
                 FastAPI app (backend/app)
   middleware: request id + JSON log + presence → gzip → CORS → security headers / body caps / kill switches / config gates
   routers: identity+auth · chat (convs, messages, Vibes, Towns) · social (posts, feed, comments, sparks) · uploads + media
            · money (plans, tips, store, webhooks) · ads/promos · content hub · reviews · Speak Up · admin
          │                    │                         │                         │
          ▼                    ▼                         ▼                         ▼
   Postgres 16          MEDIA_DIR (disk)          Redis (optional)         Providers (Razorpay, Cashfree,
   SQLAlchemy 2 +       uploads, chunk parts      rate-limit windows        MSG91, Maps) — keys encrypted
   Alembic migrations                                                       in Postgres (Admin → Plugs)
```

- **Stateless API**: no server-side sessions. Auth is a signed JWT + one DB read of the user per request (suspension, token version).
- **Server-driven config**: `/app-config` resolves layered config (base → zone → country → slab) with ETag; kill switches and module/feature gates are enforced in middleware, not just hidden in the UI.
- **Data**: users, posts, comments, reactions, edges (follow/save/block…), convs + chat messages, statuses, towns, orders, audit log, etc. (`app/models.py`). Timestamps are epoch ms `BIGINT`.

## Main data flows

- **Sign-in**: `/auth/register` or `/auth/otp/request` → HMAC'd OTP row (+ MSG91 email when configured) → `/auth/otp/verify` → access JWT (12 h). `/auth/logout-all` bumps `token_version`.
- **App start**: `/app-config` (cacheable) + `/bootstrap` (bounded snapshot: ≤ 100 per list) + `/pulse` (badge counts). Everything larger is paged: `/feed?cursor=`, `/posts/{id}/comments?cursor=`, `/conv/{id}/messages?before=`, `/me/likes?cursor=`.
- **Chat**: `POST /conv/{id}/messages` (idempotent by client id for the offline outbox) → row in `chat_messages` + notices for other members. Clients poll `/conv` and `/conv/{id}/messages` (no push/WebSocket yet).
- **Uploads**: `POST /uploads` → `PUT /uploads/{id}/chunk?offset=` (5 MB, in order, resumable) → `POST /uploads/{id}/complete` → `/media/{id}.{ext}`. Chat attachments get a conv grant and are served only to members (signed link in the message JSON).
- **Payments**: order + provider payment link → user pays on the provider page → signed webhook (replay-protected) marks the order paid. The client never marks anything paid.

## Scale-relevant work already in place
- DB pool sized from env (`POOL_SIZE`, `MAX_OVERFLOW`, `POOL_RECYCLE`, `POOL_TIMEOUT`), `statement_timeout`, `pool_pre_ping`.
- Indexes for every FK/filter/sort used by hot queries (composite `(conv_id, at)`, `(author_id, at)`, `(user_id, at)` for notices, `(kind, target)` for follower counts, GIN on `members::jsonb` for "my conversations"), migration `f903c71a3f8e`.
- N+1 removed on hot paths: conversations list (members batch-loaded, last message + unread count computed in SQL), feed/bootstrap/likes/pinned (reactions, inline comments and comment totals in 3 queries for the whole page), statuses (friend/block sets preloaded), admin lists (owners batch-loaded), announcement fan-out (single `INSERT … SELECT`).
- All list endpoints bounded (≤ 100), pagination by cursor/`before`.
- Rate limiter pluggable; Redis backend shared across replicas.
- `/health` (liveness, no dependencies) vs `/health/ready` (DB + Redis) for orchestrators.

## Scaling plan (the path, not yet built)

1. **Stateless API replicas behind a load balancer.** Run N containers × M uvicorn/gunicorn workers behind an L7 LB (TLS, HSTS, `TRUST_PROXY=1`). Readiness on `/health/ready`. Requires `REDIS_URL` (shared limits) and shared media storage (step 4). Put **PgBouncer** (transaction pooling) between API and Postgres so connections stay bounded as replicas grow.
2. **Postgres primary + read replicas.** Route read-heavy endpoints (feed, profiles, comments, pages, store) to replicas with a second engine; keep writes and read-your-own-write paths (chat send/read, auth) on the primary.
3. **Partition the big tables.** `chat_messages` (by `conv_id` hash or by time) and `posts`/`comments`/`post_reactions` (by time) using native partitioning; archive cold partitions. Replace JSON member arrays with a `conv_members(conv_id, user_id)` table, and move reaction counts to counter columns/rollups. Beyond one primary: shard chat by `conv_id`.
4. **Object storage + CDN for media.** Direct-to-bucket uploads with pre-signed URLs (S3/GCS/R2), CDN in front for public media, short-lived signed CDN URLs for private chat attachments (same model as today's signed links). Background jobs for thumbnails, video transcoding, EXIF stripping, malware scanning.
5. **Redis for more than rate limits.** Presence/last-seen (instead of DB writes), unread counters, hot caches (`/app-config` resolution, profiles, follower counts), feed fan-out lists.
6. **Real-time gateway.** A separate WebSocket/SSE service (horizontally scaled, sticky by user) fed by Redis pub/sub or a stream, replacing client polling for messages, typing, receipts and notifications; plus mobile push (FCM/APNs).
7. **Job queue.** Celery/RQ/Arq (or a managed queue) for announcement fan-out, notification delivery, OTP email, webhooks follow-up, retention/deletion jobs, media processing, search indexing.
8. **Search.** Message/post search moves from `ILIKE` to Postgres full-text (GIN/trigram) and later a dedicated search cluster.
9. **Observability before scale.** Metrics (latency/error per route, pool saturation, queue depth), tracing with the existing request id, SLO alerts; then load-test each step (k6/Locust) against production-like data before claiming capacity numbers.

## Running locally
```
cd backend && .venv/bin/alembic upgrade head          # or: python -m app.seed for demo data, then alembic stamp head
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8787
.venv/bin/python -m pytest -q                          # uses postgresql+psycopg://localhost/vibeloop_test
```
Environment variables: `backend/.env.example`. Security model and production checklist: `docs/SECURITY.md`.

## Realtime (v6)
`app/realtime.py` keeps an in-process registry of WebSocket connections. Single process: complete. Multiple processes/nodes: set `REDIS_URL` — events are published on Redis channel `vl:rt` and each process delivers to its own sockets. Presence and the admin Realtime Monitor counts are per process. Push sends run in a background thread pool (`app/push.py`), never on the request path.
