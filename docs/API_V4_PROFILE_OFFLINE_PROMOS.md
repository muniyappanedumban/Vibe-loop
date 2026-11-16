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

## Implementation notes & deviations (v4 build)
- **Promo targeting semantics:** `global` matches everyone; otherwise the non-empty lists (countries, zones, states) are combined with **AND** (e.g. countries [IN] + states [TN] = Tamil Nadu only, so a US "TN" (Tennessee) doesn't match). A promo with global off and no lists is rejected (400). Anonymous callers: `?country=` / `?state=` / `X-Country`; signed-in callers use profile country (default IN) + `state`.
- **`promos` feature off** → `GET /promos` returns `[]` (200), not 403. Admin preview returns `enabled:false`.
- **Idempotent create** returns the existing row with 200 when the same caller re-sends the id; an id owned by someone else → 409 (`POST /posts` previously answered 409 for any duplicate id).
- **Paging** uses an opaque integer `cursor` (offset) and returns `{items, nextCursor}` for `/feed`, `/posts/{id}/comments`, `/me/likes`.
- **60 s video rule** is enforced when a video is attached to a post/Blink (`POST /posts`, `POST /sparks`), using the duration recorded at upload (ffprobe when installed, else client `durationSec`). Chat file videos aren't limited.
- **Pin 3** is a toggle (`POST /posts/{id}/pin` pins/unpins own post). Extra: `GET /users/{id|me}/pinned`. Extra: `DELETE /collections/{id}/items/{postId}`, `DELETE /me/mood`, `GET /admin/users/{id}` (staff member detail; staff always see last seen), `GET /admin/uploads`; `/admin/search` gains `promos` + `uploads`.
- **Share** body is optional (defaults `to:"external"`) so the old no-body call still works.
- **Mood Drop** is stored in `profile.moodDrop` and appears as `moodDrop` on user objects for 24 h. Pings accept `thanks` / `celebrate`.
- **Friend Flame** is stored on `friends` (`flame`, `flame_day`, `last_msg_day`), bumped on 1:1 messages when both sides messaged the same UTC day; shown while the last shared day is today or yesterday.
- **Presence/viewer context:** a request middleware decodes the bearer token, updates `last_seen_at` at most once per 60 s, sets the viewer for reciprocal `lastSeen`, echoes/creates `X-Request-ID`, and logs one JSON line per request. Module for `avatar` = chat for chat-prefixed routes (`/friends`, `/conv`, `/status`, …), social elsewhere.
- **GZip** applies to API responses ≥1 KB; `/media/*` and `/uploads/*` are not gzipped. `/app-config` returns `ETag` + `Cache-Control: private, no-cache` and answers 304 to `If-None-Match`.
- Also fixed: the body-cap middleware used to answer `http.disconnect` right after replaying the request body, which cut large file responses off; it now waits for the real disconnect.
- Theme defaults are now `studio` (social) and `mono` (chat); older presets still work. Lens allowlist has 36 keys and applies to `/sparks` too.
- Seed: riya gets one post (`p9`, pinned), so `/bootstrap` returns 9 posts (test updated from 8).
