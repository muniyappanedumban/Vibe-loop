# VibeLoop — Security

Scope: the FastAPI backend in `backend/`. The mobile app and admin console are clients of this API; every rule below is enforced
server-side, so a modified client cannot bypass it.

## Threat model (summary)

| Actor | What they want | Main defences |
|---|---|---|
| Anonymous internet client | Account takeover, OTP brute force, scraping, DoS | OTP codes hashed (HMAC), 5 attempts per code, per-identifier + per-IP limits on login/OTP/register, request body caps, per-statement DB timeout |
| Signed-in user | Read or change other users' data (IDOR), escalate to staff, spam | Ownership/membership check on every id-taking route, owner-only `/admin/*`, per-user + per-IP write limits, length caps |
| Conversation outsider | Read private chats or attachments | Conv membership required for messages, search, reactions, forwards; chat attachments served only to members, the uploader, or via a short-lived signed link |
| Payment attacker | Fake or replayed "paid" webhooks | HMAC signature check, Cashfree timestamp tolerance (±5 min), processed-event table (replay → no-op) |
| Malicious upload | Stored XSS / malware via files | Extension allow-list AND magic-byte sniff must agree, executables rejected, random server names, `nosniff`, sandbox CSP, non-image/video served as `attachment` |
| Insider with DB read access | Provider keys, OTP codes | Provider secrets Fernet-encrypted with `MASTER_KEY`; OTPs stored only as HMAC; secrets never returned or logged |
| Operator mistake | Shipping dev defaults | `ENV=prod` refuses to start without real secrets, with `DEMO_OTP=1`, or with `CORS_ORIGINS=*` |

## What is enforced

### Authentication
- Access tokens: HS256 JWT, `exp`/`iat`/`sub` required, `alg=none` and other algorithms rejected, 12 h lifetime (`ACCESS_TTL_MIN`, clamped to ≤ 24 h), 30 s clock-skew leeway.
- Every authenticated request reloads the user from the DB: unknown user → 401, token version mismatch (logout-all, Speak Up suspension) → 401, **suspended → 403 on every authenticated route**; the optional-auth paths (`/app-config`, `/pages`, `/promos`, `/media`, presence) treat a suspended user as anonymous.
- Approval tokens (publish, payout, admin decisions): separate secret, 5 min expiry, bound to actor + action + payload hash, single use.
- OTP: 6-digit code, 5 min TTL, HMAC-hashed with `OTP_SECRET`, 5 wrong tries burns the code; unknown identifiers get an identical response (no account enumeration). Demo codes are only returned when `DEMO_OTP=1` (never in prod).

### Production configuration guard (`app/config.py`)
With `ENV=prod` the process exits at import unless: `DATABASE_URL`, `JWT_SECRET`, `APPROVAL_SECRET`, `OTP_SECRET`, `MASTER_KEY`, `CORS_ORIGINS` are set; the three signing secrets are ≥ 32 chars and all different; `DEMO_OTP=0`; `CORS_ORIGINS` has no `*`.

### Authorization (IDOR)
- Conversations / messages: `get_conv` / `get_msg` require membership (and message visibility) for read, send, edit, unsend, react, star, pin, vote, open, forward (both source and target), bridge, search (SQL-scoped to my convs).
- Legacy `/chats`: membership, and the message must belong to that chat (fixed: previously any message id could be reacted to).
- Posts: react / comment / share / vote / save-to-collection / comment-like go through `viewable_post` → exists, not removed, audience allows the caller (Inner Circle), no block in either direction. `/users/{id}/pinned` applies the same filter. Comment delete: author or post owner only.
- Media: a file shared in a chat gets a `media_grants` row; such a file (unless its uploader also published it) is served only to conv members, the uploader, or a holder of the expiring signed link the API returns in `attachment.url`. Others get 404. Only the uploader can publish a file (post/story/product/avatar); using someone else's private attachment URL is refused.
- Uploads, collections, insights, assets, loops, store products (edit), statuses, friends, towns (roles), reviews (self-review, interaction rules), Speak Up (`/speakup/mine`; message targets must be from your own conversations).
- `/admin/*` and `/pages/{slug}/versions`: owner role only — a test walks **every** registered admin route and asserts 403 (user) / 401 (anonymous). `/admin/kv/integrations` is refused (secrets only via the masked Plugs API).

### Input
- Pydantic `max_length` / ranges on every model field; free-form JSON bodies (`/settings`, `/social-prefs`, `/admin/kv`, loop drafts) capped by key count and size; dict-bodied routes validate types and lengths explicitly.
- Request bodies: 1 MB default, 5 MB + slack per upload chunk, 50 MB for `/media` — enforced before parsing, also for chunked transfer encoding.
- Lists: every list endpoint and every `/bootstrap` sub-list is capped at 100 (larger `limit`s are clamped); chat/town messages page with `before=`, feed/comments/likes with cursors, admin lists with `limit`/`offset` (audit with `before=`).
- Content pages are plain text + simple markdown; the API only returns JSON, never HTML. Raw HTML tags and `javascript:`/`vbscript:`/`data:text/html` links are refused when pages are written.
- Media names must match `^[A-Za-z0-9]{1,40}\.[a-z0-9]{1,5}$` and resolve inside `MEDIA_DIR` (no traversal).
- Uploads: ≤ 1 GB resumable (in-order 5 MB chunks), ≤ 20 unfinished sessions per user, extension allow-list + magic bytes of the first chunk must agree, executables/scripts (MZ, ELF, Mach-O, `#!`, wasm) rejected with 415, optional SHA-256 check, abandoned sessions removed after 24 h. Served with `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, and `Content-Disposition: attachment` for anything that isn't an image or video.

### Rate limits (`app/ratelimit.py`)
- Auth: login 10, OTP request 5, OTP verify 10, register 5 per 15 min — per identifier and per IP.
- Writes (per user / per IP / window): messages 60/600/min, conversations 20/200/10 min, posts 30/300/10 min, comments 30/300/10 min, reports + Speak Up 20/200/h (+ Speak Up daily cap), friend requests 30/300/h, upload starts 60/600/h, Vibes 30/300/h, pings 60/600/h.
- Over the limit → `429` with `Retry-After`. Backend: Redis (atomic Lua sliding window) when `REDIS_URL` is set, else in-memory. Redis outage → fail open + error log.
- Client IP = socket peer; `X-Forwarded-For` only with `TRUST_PROXY=1`.

### Webhooks
Razorpay: HMAC-SHA256 of the raw body. Cashfree: HMAC of timestamp + body, timestamp must be within ±5 min (seconds or ms). Both: event id (`X-Razorpay-Event-Id` / `x-idempotency-key`, else SHA-256 of the signed payload) stored in `webhook_events`; a repeat returns `{"duplicate": true}` and changes nothing. Only a verified webhook can mark an order paid.

### Transport and headers
`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, restrictive `Permissions-Policy`, `Cache-Control: no-store` on API responses; CORS limited to listed origins, methods and headers. TLS terminates at the load balancer (not in this app).

### Logging
JSON request log (request id, method, path without query, status, ms, user id). A redaction filter on all app and uvicorn loggers scrubs bearer tokens, JWTs, `sig=`/`token=`/`code=`… query values, OTP/secret JSON fields and full email addresses (`r***@domain`). Audit log entries carry handles and ids, never secrets or provider keys.

## Not done yet (known gaps)
- **No end-to-end encryption.** Messages, attachments and statuses are readable by the server and by anyone with DB/disk access. Encryption at rest is whatever the disk/DB provides.
- No refresh tokens / device sessions list; revocation is all-or-nothing (`logout-all`), tokens are bearer-only (no device binding).
- No MFA for owner accounts (the `mfa_required` flag exists but is not enforced); the admin console uses the same password/OTP login.
- Staff is a single `owner` role; no fine-grained admin permissions or 4-eyes approval beyond approval tokens.
- No antivirus/malware scanning or image re-encoding (EXIF/location metadata is not stripped). Video length relies on `ffprobe` when installed.
- Signed attachment links are bearer links until they expire (1–2 × `MEDIA_LINK_TTL_SEC`); anyone a member forwards the link to can open it.
- Rate limits are fixed in code (not admin-tunable); the in-memory backend is per process.
- No WAF / bot detection / CAPTCHA; no automated dependency or container scanning in CI.
- Account deletion requests are recorded but fulfilment is manual; retention is dry-run only.
- Secrets rotation is manual (rotating `JWT_SECRET` signs everyone out; rotating `MASTER_KEY` requires re-entering provider keys).
- Membership is stored as JSON arrays (`convs.members`), indexed with GIN; a normalized membership table is the long-term model.

## Production checklist
1. `ENV=prod` and every secret in `backend/.env.example` set from a secret manager (≥ 32 random chars, all different). Process must start cleanly — it refuses otherwise.
2. `DEMO_OTP=0`, MSG91 configured in Admin → Plugs, and an OTP actually delivered end to end.
3. `CORS_ORIGINS` = exact admin/web origins over https.
4. `DATABASE_URL` with `sslmode=require`, a non-superuser role, automated backups + PITR tested; run `alembic upgrade head` (never `seed`) on deploy.
5. `REDIS_URL` set (with auth/TLS) whenever more than one worker or replica runs; check `/health/ready` reports `rateLimiter: redis`.
6. TLS at the load balancer, HSTS there; `TRUST_PROXY=1` only behind it; API not reachable directly.
7. `MEDIA_DIR` on a persistent, backed-up volume (or object storage + CDN, see ARCHITECTURE.md); not executable, not served by any other web server.
8. Liveness probe → `/health`, readiness probe → `/health/ready`.
9. Payment webhook secrets set in Admin → Plugs; provider dashboards point at `https://…/webhooks/{razorpay|cashfree}`; test with a sandbox payment.
10. Change the seeded demo passwords / remove demo accounts (`seed.py` is for dev only).
11. Ship logs to a central store with retention limits; alert on 5xx rate, 429 spikes, webhook 401s, `rate limiter: redis unavailable`.
12. Run `pytest` against a staging DB before each release.

## v6 realtime parity (see API_V6_REALTIME_PARITY.md)
- `/ws` authenticates exactly like REST (signature, expiry, token version, suspension); frames ≤ 64 KB, 30/s per socket.
- E2EE ciphertext (`chat_messages.enc`) is opaque to the server: never logged, excluded from search, unreadable by moderation. No forward secrecy yet (NaCl box per message).
- Snap media (`media_files.view_once`) is served only to the sender or via a 60 s signed link issued once on open.
- TURN shared secret / static credential and the Expo access token are Fernet-encrypted (Plugs); TURN creds reach clients only via authenticated `GET /rtc/ice`.
