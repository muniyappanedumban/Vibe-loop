# VibeLoop — Scaling & capacity plan

**Honest status (2026-11):** the stack in `deploy/` is production-*shaped*: stateless API replicas behind a load balancer,
PgBouncer, a streaming read replica, Redis for every cross-instance concern. It has been smoke-tested on one laptop only
(numbers below). It has **not** been load-tested at scale, the Docker images have not been built in CI, and several pieces
(media on disk, in-process push queue, single Postgres primary) cap it far below "100M users". This document says where
each limit is and what replaces it.

## 1. What is in place

| Concern | Multi-instance safe? | How |
|---|---|---|
| Auth | yes | Stateless JWT; secrets from env/Secret (must be identical on all replicas). |
| Rate limits | yes, with `REDIS_URL` | Sliding window in Redis (Lua, atomic). Without Redis: per process. Redis down → fail open + log. |
| Realtime fan-out (`/ws`) | yes, with `REDIS_URL` | Publish to channel `vl:rt`; every process delivers to its own sockets. No sticky sessions needed. |
| Presence / "online" | yes, with `REDIS_URL` | `vl:on:{uid}` hash of node → heartbeat (90 s TTL, refreshed every 30 s). A crashed node's users age out ≤ 90 s. "Offline" is announced only when no node still holds a socket. |
| App-config resolution | yes | `app/cache.py`: inputs + resolved output cached `CONFIG_CACHE_TTL_SEC` (5 s) in Redis (or per process). Writes invalidate (also after commit). Without Redis other processes may be ≤ 5 s stale. Called on many hot paths (middleware gates, `/app-config`, features) — previously 5–6 queries each. |
| DB pool | yes | `POOL_SIZE`, `MAX_OVERFLOW`, `POOL_RECYCLE`, `POOL_TIMEOUT`, pre-ping, `STATEMENT_TIMEOUT_MS`; `PGBOUNCER=1` disables server-side prepared statements (transaction pooling). |
| Read replica | opt-in | `DATABASE_READ_URL` + `app.db.get_read_db` dependency (falls back to the primary). **Not yet wired into feed/search** (those routers were being edited concurrently) — switching `/feed`, `/search`, `/users/{id}/posts` to `Depends(get_read_db)` is a one-line change each. Never use it for read-your-own-write, auth or money paths. |
| Request timeouts | yes | `REQUEST_TIMEOUT_SEC` (30 s) → 504; uploads/media/ws exempt. Sync handlers' threads can't be killed — `statement_timeout` bounds their DB work. nginx/ingress timeouts sit above it. |
| Health | yes | `/health/live` (process only — never fails on dependencies), `/health/ready` (DB; Redis reported, and Redis-down = `degraded`, still ready, because every Redis user fails open — failing readiness would pull all replicas at once). |
| Graceful shutdown | yes | gunicorn `graceful_timeout` 25 s; k8s preStop 8 s + 40 s grace; lifespan drains the push queue (≤ 10 s) and disposes pools. |
| **Media files** | **no** (one host only) | `MEDIA_DIR` on a shared volume works for compose on one machine. Across machines it must move to object storage — see §4. |
| **Push sends** | partially | In-process `ThreadPoolExecutor` per worker: works on every replica, but queued sends are lost on crash (at-most-once). See §4. |
| Admin realtime stats | per process | `/admin/realtime` counts are this process only (labelled as such). |

## 2. Measured (single laptop, not a capacity number)

Apple M4 (10 cores), local Postgres 16, `uvicorn --workers 4`, no Redis, no nginx, load generator
(`scripts/loadtest/smoke.py`, 20 concurrent readers + 2 writers + 5 socket loops, 20 s) **on the same machine**:

| endpoint | req/s | p50 ms | p95 ms | p99 ms | errors |
|---|---|---|---|---|---|
| `/bootstrap` | 147 | 77 | 123 | 156 | 0 |
| `/feed?limit=20` | 147 | 41 | 74 | 95 | 0 |
| `/app-config` (cached) | 147 | 26 | 51 | 69 | 0 |
| `POST /conv/{id}/messages` (≈1/s/writer) | 1.7 | 100 | 174 | 176 | 0 |
| `/ws` connect + hello | 2.5 | 7 | 44 | 54 | 0 |

≈ 440 HTTP req/s aggregate, generator-bound and competing for the same CPU. Treat it as "works under concurrency, no errors,
no pool exhaustion", not as a per-node ceiling. k6 (`scripts/loadtest/k6-smoke.js`) was not installed, so it was only
syntax-checked. First real step: run k6 `PROFILE=load` from separate machines against staging.

## 3. Per-node planning numbers (estimates — verify with k6)

Planning assumption for a 4 vCPU / 8 GB API pod with 4 workers: **~800–1,500 req/s** of mixed read traffic
(bootstrap is the heaviest at ~10 queries) and **~10–20k idle WebSockets** (each socket costs one asyncio task + buffers; the
bottleneck is fan-out CPU and Redis pub/sub, not memory). A typical social/chat DAU produces ~0.05–0.2 req/s at peak hour.

| Scale (DAU) | Peak req/s | API pods (4 vCPU) | Postgres | Redis | Notes |
|---|---|---|---|---|---|
| 100k | ~2k | 3 | 1 primary (8 vCPU) + 1 replica | 1 small | the compose stack, or k8s minReplicas |
| 1M | ~20k | 15–25 | 16–32 vCPU primary + 2–3 replicas, PgBouncer | 1 primary + replica, ~4 GB | wire feed/search to replicas; media to S3+CDN; push to a queue |
| 10M | ~200k | 150–250 across zones | messages partitioned; reads on replicas; consider Citus/sharding | Redis Cluster; split pub/sub from cache | fan-out via per-user channels, not one global channel |
| 100M | ~2M | thousands, multi-region | sharded by user/conv id; separate stores per domain | dedicated realtime tier | an architecture change, not a config change |

DB connection budget: `replicas × WEB_CONCURRENCY × (POOL_SIZE + MAX_OVERFLOW)` must fit PgBouncer `max_client_conn`;
PgBouncer `default_pool_size` × pools must fit Postgres `max_connections`. HPA `maxReplicas: 60` is set from that budget.

## 4. Path to tens of millions — in order

1. **Media → object storage + CDN.** Replace `MEDIA_DIR` writes with S3-compatible PUTs (S3/GCS/R2/MinIO), serve public media
   from a CDN, private chat attachments via short-lived signed URLs (the app already signs links — keep the TTL logic, change
   the backend). Resumable chunks → S3 multipart upload. Until then the API cannot run on more than one machine.
2. **Read replicas on hot reads.** `Depends(get_read_db)` on feed/search/profile posts. Watch replication lag (`pg_stat_replication`);
   route to primary if lag > 1–2 s.
3. **Push via a durable queue.** Push currently runs in-process. Move to Redis Streams / SQS / Pub/Sub with a separate worker
   Deployment (at-least-once, retries, dedupe on notice id). Same for other background work (abandoned upload cleanup → CronJob).
4. **Partition the messages table.** `chat_msgs` grows fastest. Range-partition by time (monthly) with `conv_id, at` index per
   partition, or hash-partition by `conv_id` (keeps a conversation in one partition; good for "latest N in conv"). Plan the
   migration with pg_partman; old partitions to cheaper storage/archival.
5. **Realtime tier.** One global `vl:rt` channel means every node receives every event — fine to ~tens of nodes. Next: per-node
   channels with a `user → node` directory in Redis (presence already records nodes), or a dedicated gateway (e.g. Centrifugo /
   NATS) so API pods don't hold sockets. Redis Cluster sharded pub/sub (`SPUBLISH`) for throughput.
6. **Caching.** Short-TTL Redis caches for public profiles, post counters, follower counts (`config_resolver.followers` is a
   COUNT per call). Counters as denormalised columns updated asynchronously.
7. **Sharding (later).** At ~10M+ DAU, single-primary write throughput (messages, reactions, edges) is the wall. Shard by
   user id / conv id (Citus, or application-level shards with a directory). This is a substantial rewrite of query paths that
   currently join freely.
8. **Multi-region.** Geo-DNS / anycast LB, regional API + replicas, single write region first; then per-region write ownership.

## 5. Current hard limits (know these before launch)

- Single Postgres primary for all writes. Every write path (messages, reactions, presence `last_seen_at` — throttled to 1/min/user) lands on it.
- `touch_presence` in middleware does one user read per authenticated request (plus ≤ 1 write/min/user).
- `/bootstrap` issues ~10 queries; it's the heaviest hot endpoint.
- Media on local disk (single machine). In-process push queue (lossy on crash). `/admin/realtime` stats per process.
- nginx in compose resolves `api` replicas at start — reload nginx after `--scale`. Use k8s Service/ingress for dynamic scaling.
- No CDN, no WAF, no autoscaling for Postgres/Redis in this repo — use managed services.

## 6. Files

- `deploy/Dockerfile`, `deploy/gunicorn.conf.py` — non-root image, gunicorn + uvicorn workers, healthcheck.
- `deploy/docker-compose.prod.yml`, `deploy/nginx/nginx.conf`, `deploy/postgres/*`, `deploy/pgbouncer.ini.example`, `deploy/.env.prod.example`.
- `deploy/k8s/` — Deployment (probes, preStop, spread), Service, HPA (CPU 60 %), PDB, Ingress (WebSocket timeouts, body size), migrate Job, Secret example.
- `scripts/loadtest/k6-smoke.js` (k6), `scripts/loadtest/smoke.py` (no-install fallback).
- Backend: `app/cache.py`, `app/db.py` (read engine, PgBouncer mode), `app/realtime.py` (shared presence), `app/middleware.py` (`TimeoutMiddleware`), `app/main.py` (health, shutdown), tests in `tests/test_scale.py`.
