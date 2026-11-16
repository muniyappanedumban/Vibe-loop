# v4 — profiles, presence, large media, promos, micro-features (contract)

## Profiles (per module — "Two Faces")
- User gains: `avatar_social` (media url|null), `avatar_chat` (media url|null), `cover` (media url|null), `state` (e.g. "TN"), `pronouns`, `links` [≤3 urls], `last_seen_visible` bool (default true), `last_seen_at` ms.
- `PATCH /me/profile` accepts all above (+ existing). Avatar urls must be the caller's own uploaded `/media/...` images.
- `GET /me/profile` returns them. Every User object returned anywhere (creators, friends, conv members, status users) gains `avatar` (module-appropriate: chat routes → avatar_chat||avatar_social; social → avatar_social||avatar_chat) and `lastSeen` (ms) — `lastSeen` is null when that user hides it; if *I* hide mine, I also can't see others' (reciprocal, like common chat apps).
- Presence: any authenticated request updates `last_seen_at` (throttled to once/60s).

## Large uploads (resumable, up to 1 GB)
- `POST /uploads` {filename, size, mime, sha256?} → {uploadId, chunkSize: 5242880, received: 0}. size ≤ 1 GB (413 above). Allowed: images, video (mp4/mov/webm), audio (m4a/mp3/ogg/wav), pdf, zip, docx/xlsx/pptx, txt. Executables/scripts rejected (415) — decided by magic bytes of the first chunk + extension allowlist.
- `PUT /uploads/{id}/chunk?offset=N` raw body (≤ 5 MB + small slack) → {received}. Out-of-order offset → 409 with current `received` (client resumes).
- `GET /uploads/{id}` → {received, size, done}. `POST /uploads/{id}/complete` → {url:"/media/<id>.<ext>", kind: image|video|audio|file, mime, size, name}. sha256 checked if given.
- Videos used for posts/Blinks: client enforces ≤ 60 s; server also checks with `ffprobe` when available (else accepts and records duration from client `durationSec`, capped 60 → 400 if > 60).
- Chat messages gain kind `file` with `attachment {url, name, size, mime, kind}`; posts/sparks keep `mediaUrl`.

## Offline support (server side)
- All create endpoints accept a client-generated `id` (idempotency): re-sending the same id returns the existing row (200) instead of duplicating. Applies to: POST /conv/{id}/messages, /posts, /sparks, /posts/{id}/comments, /status.

## Comments & shares
- `GET /posts/{id}/comments?cursor=` (paged, 20), `POST` {id?, text, replyTo?}, `DELETE /comments/{id}` (author or post owner), `POST /comments/{id}/like`.
- `POST /posts/{id}/share` {to: "chat"|"external"} counts shares.
- `GET /feed?mode=foryou|circle|trending|fresh&cursor=` paged posts (keep /bootstrap as is).

## Promos (our own brand promotions — admin controlled)
- Promo: {id, title, body, kind: banner|card|video|image|link|post, mediaUrl?, url?, cta?, placement: ["home_banner","feed","chat_list","splash","explore"], target: {global: bool, countries: [ISO2], zones: [..], states: [..]}, startAt?, endAt?, active, priority}.
- `GET /promos?placement=` → promos matching caller (country/zone/state from profile; anonymous via ?country=) and active window, ordered by priority. Shown to everyone matching — labelled "From VibeLoop".
- Admin: `GET/POST /admin/promos`, `PATCH/DELETE /admin/promos/{id}`, `GET /admin/promos/preview?country=&state=&placement=`. Config feature `promos` (default true; admin can switch off globally).

## Micro-features (backend parts)
- Post polls ("Mini Vote"): post `poll {q, options[2..4]}`; `POST /posts/{id}/vote` {option}.
- Pin 3: `POST /posts/{id}/pin` (max 3 pinned per user; 409 when full).
- Collections ("Save Stack"): `GET/POST /collections`, `POST /collections/{id}/items` {postId}.
- Love Trail: `GET /me/likes` (posts I reacted to, newest first).
- Friend Flame: streak days per friend pair (consecutive days both messaged) in /friends items as `flame`.
- Mood Drop: `PUT /me/mood` {moji, text?} (24h) shown on profile & friends list.
- Thank You Tap / Celebrate Tap: ping kinds `thanks`, `celebrate` (existing /pings).
- Close friends list for audience "circle" uses Inner Circle (friends.close).

## Engineering
- Request ID middleware (X-Request-ID echo + structured log line), DB indexes on hot paths (posts.at, messages.conv/at, notices.user/read), pagination everywhere lists can grow, GZip responses, ETag/Cache-Control on /app-config and media.
