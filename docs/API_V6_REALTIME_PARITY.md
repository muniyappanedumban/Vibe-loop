# v6 — Realtime, receipts, calls, push, E2EE, snaps, story viewers, follow requests (contract)

Every feature below has a config flag in `features` (BASE layer, default **true**, editable in Admin → Feature Dials, checked server-side on every call — a disabled feature answers **403 "Not enabled"** or a WS `error` event).

| flag | what |
|---|---|
| `realtime` | WebSocket gateway `/ws` |
| `readReceipts` | delivered/read receipts + `status` on my messages |
| `typing` | typing relay (no storage) |
| `voiceNotes` | message kind `voice` |
| `calls` | 1:1 voice/video call signaling + call log |
| `push` | push tokens + Expo push sends |
| `e2ee` | key directory + encrypted 1:1 messages |
| `snaps` | message kind `snap` (view-once photo/video, 24 h) |
| `storyViewers` | Blink (spark) viewers + replies |
| `followRequests` | follow requests for private Glow profiles |
| `liveCamera` | client-only: live camera with lens overlays |
| `demoMode` | client-only: "Offline demo" button on sign-in |

`GET /app-config` also returns `rtc: {iceServers: [{urls: ["stun:stun.l.google.com:19302"]}]}` (STUN only, admin-editable in the config layer; TURN credentials never appear here — use `GET /rtc/ice`).
New screen keys in `screens`: `CreatorHub`, `CreateHub`, `Vault` (plus the existing ones).

## 1. Realtime gateway

`GET /ws?token=<access JWT>` (WebSocket). Same checks as REST auth: signature/expiry, user exists, token version current, not suspended. Close codes: **4401** bad/expired token, **4403** suspended or `realtime` off, **4408** too many frames (flood), **1009** frame > 64 KB.
After connect the server sends `{"type":"hello","userId":"…","serverTime":ms}`.

All frames are JSON objects `{type, ...}`.

### Server → client events
| type | payload |
|---|---|
| `message.new` | `{convId, message}` — `message` is exactly the REST message JSON *as seen by the receiving user* (`from:"me"` on your own other devices) |
| `message.updated` | `{convId, message}` (edit, unsend, react, pin, vote, open) |
| `message.screenshot` | `{convId, messageId, userId}` |
| `typing` | `{convId, userId, on}` |
| `receipt` | `{convId, messageId, userId, kind: "delivered"\|"read", at}` — means *every message up to and including* `messageId` |
| `presence` | `{userId, online, lastSeen}` (sent to friends; `lastSeen` null if hidden) |
| `conv.updated` | `{convId}` — refetch `GET /conv` |
| `notice.new` | `{notice: {id, module, kind, title, body, at, read, route, params}}` |
| `call.invite` | `{callId, from, media, sdp}` |
| `call.ringing` | `{callId}` (to caller, callee was notified) |
| `call.answer` | `{callId, sdp}` |
| `call.ice` | `{callId, candidate}` |
| `call.reject` / `call.end` | `{callId, by, status}` |
| `pong` | `{at}` |
| `error` | `{code, message, ref?}` (`ref` = the client frame `type`) |

### Client → server frames
| type | payload |
|---|---|
| `ping` | `{}` → `pong` |
| `typing` | `{convId, on}` |
| `read` | `{convId, upTo: messageId}` (same as `POST /conv/{id}/read`) |
| `delivered` | `{convId, upTo: messageId}` |
| `call.invite` | `{callId?, to: userId, media: "audio"\|"video", sdp}` |
| `call.answer` | `{callId, sdp}` |
| `call.ice` | `{callId, candidate}` |
| `call.reject` | `{callId}` |
| `call.end` | `{callId}` |

Limits: frames ≤ 64 KB; > 30 frames/second per socket → `error {code:"slow_down"}`, sustained → close 4408.

**Scaling:** the connection registry is in-process. With one API process that is all you need. With several processes/nodes set `REDIS_URL`: every event is published on Redis channel `vl:rt` and each process delivers to its own sockets (pub/sub fan-out). Without Redis, a multi-node deploy only reaches sockets on the node that handled the request. Presence is per node too.

REST message creation (`POST /conv/{id}/messages`, forward, bridge share, Vibe/Blink replies) publishes `message.new` to every conv member after commit. Scheduled messages (`sendAt` in the future) are **not** pushed when due — clients see them on the next fetch.

## 2. Read receipts (`readReceipts`)
- Stored per message per recipient (`message_receipts`: delivered_at, read_at).
- Delivered is recorded when the recipient fetches `GET /conv/{id}/messages`, sends WS `delivered`, or has a live socket on this node when the message is sent.
- `POST /conv/{id}/read` `{upTo: messageId}` → `{ok, at}`; marks every message from others up to that one read, sets lastRead, emits `receipt`.
- Messages I sent carry `status: "sent"|"delivered"|"read"` (others' messages: `status: null`). Groups: `read` when every other member read, `delivered` when every other member got it.
- **Reciprocal:** if my profile `chat_read_receipts` is false, my reads are not recorded/sent **and** I never see `read` (max `delivered`).
- Flag off: `status` is null and `/read` returns 403.

## 3. Typing (`typing`)
WS only, never stored. Not relayed for users with `ghost_hours` on (presence too: ghosts look offline, and their `last_seen_at` is not updated by the socket).

## 4. Voice notes (`voiceNotes`)
Upload audio with `/uploads` (m4a/mp3/ogg/wav → `kind: audio`), then `POST /conv/{id}/messages` `{kind:"voice", attachment:{url}, durationSec}`. `durationSec` 1–300 required; the file must be yours and `audio/*`. Message `attachment` gains `durationSec`.

## 5. Calls (`calls`)
- Signaling over WS (above). The server creates the log row on `call.invite`.
- Who can call: not blocked either way, and (friends **or** callee `who_can_message == "everyone"` and an accepted 1:1 chat exists). Else `error {code:"call_not_allowed"}`.
- Status: `ringing` → `answered` → `ended`; `rejected`; `missed` (caller ended before answer, or still ringing after 60 s — settled lazily). Missed calls create a `call` notice (+ push).
- `GET /calls?limit=50` → `[{id, peer: user, direction: "out"|"in", media, status, startedAt, answeredAt, endedAt}]` newest first.
- `GET /rtc/ice` (auth, `calls` on) → `{iceServers: [...stun, {urls:[turn…], username, credential}], ttl}`. With a TURN shared secret (coturn `use-auth-secret`): `username = "<expiryUnix>:<userId>"`, `credential = base64(HMAC-SHA1(secret, username))`, ttl 3600 s. Otherwise the static username/credential from Admin → Plugs → turn. No TURN configured → STUN only.

## 6. Push (`push`)
- `POST /push/token` `{token, platform: "ios"|"android"|"web", provider: "expo"|"fcm"}` · `DELETE /push/token` `{token}`.
- Sent via Expo Push API (`https://exp.host/--/api/v2/push/send`, optional access token from Admin → Plugs → expo) in a background worker; requests never wait. `fcm` tokens are stored but **not sent to yet** (recorded as skipped) — use Expo tokens.
- Triggers: new DM / group message (not if conv muted), mention in a group (`@handle`), friend request, follow request, missed call, incoming call when the callee has no live socket.
- Suppressed during **Focus Switch** (`focus_social_muted` suppresses Glow/social pushes) and **quiet hours** (`settings.quietHours = {on: true, from: 22, to: 7, tzOffsetMin: 330}`); notices are still created.
- E2EE conversations: push body is always "New message".
- `DeviceNotRegistered` from Expo deletes the token. Every send is logged (`push_sends`) for admin stats.
- Data payload: `{route, params, kind}`.

## 7. E2EE (`e2ee`)
- `PUT /keys` `{publicKey: base64(32 bytes X25519), deviceId}` (≤ 5 devices) · `GET /users/{id}/keys` → `[{deviceId, publicKey, at}]` · `DELETE /keys/{deviceId}`.
- Conv JSON gains `e2ee: true` for 1:1 convs where both members have published a key.
- Send `{kind:"text", enc:{v:1, nonce: base64(24), box: base64(≤ 8 KB), senderKey: base64(32)}}` (no `text`). Only allowed in `e2ee` convs. The server stores ciphertext opaque, stores text `"[encrypted]"`, never logs it, and returns `enc` to members. Encrypted messages can't be edited, forwarded, searched or moderated by staff.
- Honest scope: NaCl `box` (X25519 + XSalsa20-Poly1305) per message to **one** recipient key (the client picks the newest device key). **No forward secrecy, no multi-device fan-out, no key verification UI yet** — Signal double-ratchet (X3DH + per-device sessions) is the future path. Metadata (who, when, sizes) is visible to the server.

## 8. Snaps (`snaps`)
- `{kind:"snap", attachment:{url}}` image/video you uploaded and haven't used elsewhere. Expires 24 h after send if unopened.
- Receivers see `attachment: {kind, mime, locked: true, url: null}`. `POST /messages/{id}/open` (once) → `{message, mediaUrl}` where `mediaUrl` is signed for **60 s**; after that the media is no longer served to the receiver (only the sender). Also used for view-once text (`viewonce` behaves as before).
- `POST /messages/{id}/screenshot` (receiver of snap/viewonce) → notifies the sender (notice + `message.screenshot`). Best effort: the app reports it; the server can't detect screenshots.

## 9. Story viewers (`storyViewers`)
- `POST /sparks/{id}/view` (records once, idempotent) · `GET /sparks/{id}/viewers` (owner only) → `[{user, viewedAt}]`.
- Bootstrap `social.sparks` items authored by me gain `viewCount`.
- `POST /sparks/{id}/reply` `{text, attachment?: {url}}` → DM to the author (`ref: {type:"spark", id}`); with an image/video attachment it's sent as a snap. → `{conv, message}`.

## 10. Follow requests (`followRequests`)
- `POST /edges/follow/{id}` on a profile with `social_private` → `{on:false, state:"requested"}` (again while pending → cancels, `state:"none"`). Normal: `{on, state:"following"|"none"}`.
- `GET /follow/requests` → `{incoming:[{id, user, at}], outgoing:[…]}` · `POST /follow/requests/{id}/accept|decline`.
- Private users' Drops are visible only to accepted followers (feed, bootstrap, post endpoints). Notices `follow_request` / `follow_accepted`. Flag off → private profiles behave like before (no gate).

## Admin
`GET /admin/realtime` · `GET /admin/calls?status=&media=&q=` · `GET /admin/push/stats` · `POST /admin/push/test {userId}` · `GET /admin/e2ee`. Plugs gains `turn` {urls, username, credential*, sharedSecret*} and `expo` {accessToken*} (* encrypted).

## Hush Control Room enforcement (`/me/hush-settings`, stored in `User.settings.hush`)
- `typingVisible=false` → server silently drops the user's `typing` frames (no relay).
- `photoVisibility` (`everyone|friends|nobody`) → serialized users hide the chat photo (`avatar` null in chat, social photo elsewhere) from viewers not allowed.
- `whoCanCall` (default `friends`; `everyone` keeps the old accepted-DM rule; `nobody`) → `call.invite` fails with `call_not_allowed`.
- `notif.{messages,groups,calls,moods}` → matching pushes are dropped; `notif.previews=false` → message/mention push body is `"New message"`.
- `defaultFadeSec` → applied to convs newly created by that user via `POST /conv`.
- `GET /conv` items carry `archived: bool`; toggle with `POST /conv/{cid}/archive {archived}`.
- Mood photo/video (`Status.media`) is private: the file is granted to a member-less vault conv (`mv-<userId>`), so `/media` serves it only to the owner or via the signed expiring link that `GET /status` hands to viewers the audience allows. Moods posted before this change keep their already-public files.
