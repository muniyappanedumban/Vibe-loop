# VibeLoop Feature Gap Register (Phase 1)

Date: 2026-11-17 · Method: read routes (backend/app), models, mobile screens (mobile/src, mobile/App.tsx) and admin pages (admin/src/App.tsx). Read-only audit.

**Status counts (230 rows):** DONE 108 · PARTIAL 60 · MISSING 49 · BLOCKED 13

Legend: DONE = UI + real endpoint that enforces it · PARTIAL = exists, gaps listed · MISSING = not implemented · BLOCKED = needs external service/infra.
Admin switch: `features.X` = flag in `config_resolver.BASE.features` (admin "All Switches"/"Feature Dials"); `screens.X` = "Screen Switches"; dotted paths = `user_app.SETTINGS` ("User App Settings"). Server-enforced unless noted.

Cross-cutting findings
- Glow feed tabs are filtered client-side (mobile/src/screens/Social.tsx:136); the mobile app only calls `/feed?mode=fresh` (Social.tsx:134) even though backend supports foryou/circle/trending/fresh (backend/app/routes_feed.py:47). There is no ranking model; "foryou" = reverse-chronological.
- A post holds one `media_url` plus a `slides` count (models.py:127,132), so real multi-image carousels can't be stored.
- Admin RBAC: most legacy admin routes use `STAFF = ("owner",)` (main.py:87); trust routes allow owner/admin/moderator/support (routes_trust.py:26). There are no Ops/Security/Finance/Analytics roles, and the "Role Matrix" page isn't backed by enforcement.
- Media lives on local disk (routes_media.py:3). There's no object storage, CDN, transcoding or thumbnail worker. `ffprobe` is used only for duration (routes_uploads.py:24).

## 1. Glow Home

| Feature | Status | Admin switch | Evidence | What's missing |
|---|---|---|---|---|
| Mood preview strip on Home | PARTIAL | N | Social.tsx:32 `SparkRow` (Blinks row) | The strip shows Blinks, not Hush Moods (`/status`). No mood-preview strip. |
| Feed tab: For You | PARTIAL | Y `defaults.glow.feedTabs` (not read by Home) | routes_feed.py:47; Social.tsx:124-138 | Client-side sort by following+time. No ranking. Mobile doesn't call `mode=foryou`. |
| Feed tab: Circle | PARTIAL | Y `defaults.glow.feedTabs` | routes_feed.py:54-56 | Backend mode exists but is unused. Client filters the cached posts only. |
| Feed tab: Trending | PARTIAL | Y `defaults.glow.feedTabs` | routes_feed.py:57-58 | Backend shares*20+views over 7 days, but mobile sorts the local cache. |
| Feed tab: Fresh | DONE | Y `defaults.glow.feedTabs` | routes_feed.py:47; Social.tsx:134 | Tab visibility isn't driven by the setting. |
| Feed tab: Mood / Interests | PARTIAL | N | Social.tsx:137 | Client filter on `mood`/`interest` only. No server mode. |
| Feed visibility filtering (blocked, private, circle) | DONE | Y `features.followRequests` | routes_feed.py:15-45,48-53 | — |
| Pagination (cursor) | PARTIAL | N | routes_feed.py:60-69 | Offset cursor (unstable under inserts). Mobile "Load older" button only, no infinite scroll. |
| Recommendation / ranking | MISSING | N | — | No signals, embeddings or scoring service. `score.py` is for Loops. |
| Image post (single) | DONE | Y `limits.uploadMaxMB` | main.py:343-371; Studio.tsx | — |
| Image gallery / carousel | PARTIAL | Y `limits.maxPhotosPerPost` | main.py:356; models.py:127 | Only a `slides` count and a single `media_url`. No ordered media array or swipe UI. |
| Video post | DONE | Y `limits.postVideoMaxSec` | main.py:367-368; Social.tsx `VideoClip` | Edits are applied client-side only (no render). |
| Audio post | MISSING | N | main.py:351 kinds = photo/carousel/thought/motion | No audio kind or player in the feed. |
| Poll post | DONE | Y `features.polls` (client) | main.py:369-371; routes_micro.py:34 | — |
| Stickers on posts | MISSING | N | — | Lens overlays only (Lens.tsx). No placed stickers. |
| Like / react | DONE | Y `defaults.glow.reactions` (client set) | main.py:376-386 | The server accepts a fixed STD set and ignores the admin reaction list. |
| Comment | DONE | Y `defaults.glow.whoCanComment` | main.py:388-410 | — |
| Save / collections | DONE | N | main.py `/edges/save`; routes_micro.py:66-95 | — |
| Share (count + to chat) | DONE | Y `features.post2chat` | main.py `/posts/{pid}/share`; routes_chat.py:425 | No external share sheet tracking. |
| Report post | DONE | Y `limits.autoHideReports` | main.py `/reports`; admin Mod Queue | — |
| Delete own post | DONE | N | main.py:372-375 (soft hide) | No edit-post endpoint. |
| Pin to profile | DONE | N | routes_micro.py:45 | — |

## 2. Explore / Search

| Feature | Status | Admin switch | Evidence | What's missing |
|---|---|---|---|---|
| Search people | DONE | N | routes_feed.py:127-135; Connect.tsx Search | LIKE match only. |
| Search posts | DONE | N | routes_feed.py:136-139 | Max 20 results, no pagination. |
| Search hashtags | PARTIAL | Y `defaults.glow.hashtags` | Discover.tsx tag chips | Tags are taken from cached posts. `/search` doesn't search the `tags` JSON. |
| Search Loops | PARTIAL | N | Connect.tsx (local store) | Client-side only. No server search. |
| Search audio/sounds | MISSING | N | — | No audio catalogue. |
| Search Hoods | PARTIAL | N | Connect.tsx row links to Towns; routes_chat.py:549 | Only a link to the Hoods list. No query. |
| Search locations | PARTIAL | N | routes_feed.py:133,137 (city/place LIKE) | No geo/place entity. |
| Search messages (Hush) | DONE | N | routes_chat.py:410 | Can't search E2EE messages (by design). |
| Search history + clear | MISSING | N | — | Fixed suggestion chips only (Connect.tsx). |
| Suggestions / autocomplete | PARTIAL | N | Connect.tsx 250 ms debounce | Static seed chips. No suggest endpoint. |
| Typo tolerance | MISSING | N | — | Needs trigram/fuzzy search (pg_trgm works in-repo). |
| Trending aggregation | PARTIAL | N | Discover.tsx:17 | Client count over cached posts. No server trending job. |
| Blocked-user exclusion | DONE | N | routes_feed.py:130,134,136 | — |
| Explore grid | DONE | N | Discover.tsx:18-33 | Only covers cached posts. |

## 3. Post detail

| Feature | Status | Admin switch | Evidence | What's missing |
|---|---|---|---|---|
| Media carousel in detail | MISSING | N | — | Depends on the carousel model. |
| Comments list (paginated) | DONE | N | routes_feed.py:77-85; Micro.tsx:19 | — |
| Create comment | DONE | Y `defaults.glow.whoCanComment` | main.py:388 | — |
| Edit comment | MISSING | N | — | No PATCH /comments. |
| Delete own comment | DONE | N | routes_feed.py:87-94; Micro.tsx:33 | Post author can't delete others' comments (not checked). |
| Replies (threaded) | PARTIAL | N | main.py:403-409; routes_feed.py:75 | Backend `replyTo` exists, but Micro.tsx has no reply UI or threading. |
| Comment reactions (like) | DONE | N | routes_feed.py:96; Micro.tsx:32 | Like only, no emoji set. |
| GIF / image / audio comments | MISSING | N | — | Text only. GIF needs a provider. |
| Comment sort (top/new) | MISSING | N | routes_feed.py:79 fixed order | — |
| Pin comment | MISSING | N | — | — |
| Translate | BLOCKED | N | — | Needs a translation API. |
| Related content | MISSING | N | — | — |
| Remix | PARTIAL | N | main.py `/loops/{id}/clone` (Loops only) | No post remix/duet. |

## 4. Creation

| Feature | Status | Admin switch | Evidence | What's missing |
|---|---|---|---|---|
| Text post (thought) | DONE | N | main.py:351; Studio.tsx | — |
| Photo post | DONE | Y `limits.uploadMaxMB`, `defaults.glow.lenses` | Studio.tsx; main.py:355-363 | — |
| Video post | DONE | Y `limits.postVideoMaxSec` | main.py:367 | — |
| Audio post | MISSING | N | — | — |
| Mixed-media post | MISSING | N | — | Single media per post. |
| Poll post | DONE | Y `features.polls` | main.py:369 | — |
| Drafts + autosave | PARTIAL | Y `features.draftBridge` | Library.tsx / outbox.ts | Offline outbox only. No server draft model or autosave. |
| Photo crop / rotate | MISSING | N | — | — |
| Photo adjust / filters | PARTIAL | Y `defaults.glow.lenses` | Lens.tsx; main.py:352-354 | Overlay lenses only, no pixel adjustments. |
| Photo text / stickers / drawing | MISSING | N | — | — |
| Video trim + speed | PARTIAL | Y `limits.postVideoMaxSec` | main.py:334-340 `VideoEdit` | Metadata only, applied at playback. No render. |
| Video captions | PARTIAL | N | main.py:333; Studio.tsx:149 | Manual captions only. Auto STT is BLOCKED. |
| Video split / merge / cover / music / voice-over | BLOCKED | Y `screens.Editor` | Create.tsx:169 NotReady | Needs an FFmpeg render worker. |
| Audio record / upload / waveform / trim / cover | MISSING | Y `screens.Audio` | Create.tsx:202 NotReady | Mic recording isn't wired. No audio post type. |
| Media order preserved | MISSING | N | models.py:132 | No media array. |
| Upload retry / resumable | DONE | Y `limits.uploadMaxMB` | routes_uploads.py (chunked); outbox.ts:52 | — |
| Idempotent create (offline) | DONE | N | main.py:347-349 | — |
| Location / collab / sound tag | DONE | N | main.py:364 | Sound tag is free text, not a catalogue. |

## 5. Mood (Hush Status, "Vibes")

| Feature | Status | Admin switch | Evidence | What's missing |
|---|---|---|---|---|
| Text Mood | DONE | Y `features.statuses` | routes_chat.py:466-489; People.tsx:115 | — |
| Emoji (VibeMoji) Mood | DONE | Y `features.statuses` | routes_chat.py:474 | — |
| Image / video Mood | DONE | Y `features.moodMedia` | routes_chat.py:476-487 | — |
| Audio Mood | MISSING | N | Literal kinds routes_chat.py:466 | — |
| Mixed Mood | MISSING | N | — | — |
| Appearance (bg) | PARTIAL | N | `bg` field routes_chat.py:467 | No font or layout options. |
| Audience everyone / friends / close | DONE | N | routes_chat.py:467,496-500 | — |
| Audience selected / hide-from | MISSING | N | — | No per-user lists. |
| Expiry | PARTIAL | Y `limits.statusHours` (not enforced) | routes_chat.py:502 hard-codes DAY | The admin setting is ignored server-side. |
| Viewer with progress / pause / next | PARTIAL | N | People.tsx:146 StatusView | Needs to be verified as basic. No progress bar or pause seen. |
| Viewers list | MISSING | Y `features.storyViewers` (Blinks only) | — | No StatusView model. |
| Reactions | MISSING | N | — | Reply-to-DM only. |
| Replies | DONE | N | routes_chat.py:509-517 | — |
| Mute / hide user's Moods | MISSING | N | — | — |
| Report Mood | MISSING | N | — | No report kind for status. |
| Delete own | DONE | N | routes_chat.py:519 | — |
| Retention / purge | PARTIAL | N | main.py:561 retention dry-run | No status purge job. Rows persist past 24 h. |

## 6. Blinks (stories, `Spark`)

| Feature | Status | Admin switch | Evidence | What's missing |
|---|---|---|---|---|
| Create Blink (text / photo / video, lens, place) | DONE | Y `limits.blinkHours`, `limits.blinkVideoMaxSec` | routes_media.py:128; Studio.tsx:75 | — |
| Blink poll | DONE | Y `features.polls` | main.py `/sparks/{sid}/vote` | — |
| Viewer (tap next/prev) | PARTIAL | N | Social.tsx:206-260 | No progress bar or hold-to-pause. |
| Viewers list | DONE | Y `features.storyViewers` | routes_v6.py:65-82 | — |
| Reply | DONE | N | routes_v6.py:84 | Reaction moji in the UI isn't persisted (Social.tsx:~243 local `setSent`). |
| Audience (circle / close) | PARTIAL | N | Studio.tsx:75 `close` | Only public/close. No selected/hide-from. |
| Archive | MISSING | N | — | — |
| Highlights | MISSING | N | — | — |

## 7. Loops (collaborative Loops + Flicks/Motion short video)

| Feature | Status | Admin switch | Evidence | What's missing |
|---|---|---|---|---|
| Loops list / detail / create / publish / withdraw / clone / invite | DONE | Y `screens.Loops`, `screens.LoopDetail`, `screens.NewLoop` | main.py `/loops*`; Loops.tsx | — |
| Loop fan reactions + score | DONE | Y `screens.FanReact` | main.py `/loops/{id}/reactions`; score.py | — |
| Flicks (short-video) feed | PARTIAL | N | Social.tsx:167 Motion | Filters cached posts. No dedicated feed endpoint. |
| Player actions (like / comment / share / follow / to-chat) | DONE | Y `features.post2chat` | Social.tsx:177-196 | — |
| Not interested | MISSING | N | — | — |
| Studio multi-clip | BLOCKED | Y `screens.Editor` | Create.tsx:169 | Render worker. |
| Audio discovery / use-audio | MISSING | N | — | Sound is free text. |
| Watch-time events | MISSING | N | — | `Post.views` exists, but there's no event ingestion. |

## 8. Media Studio

| Feature | Status | Admin switch | Evidence | What's missing |
|---|---|---|---|---|
| Camera capture | PARTIAL | Y `features.liveCamera` | Parity.tsx:107 LiveCamera | Verify flash, zoom and camera switch. None found. |
| Flash / zoom / switch camera | MISSING | N | — | — |
| Sticker studio | MISSING | N | — | BubbleMoji gallery exists (Me.tsx:148) but there's no creation. |
| Audio studio | PARTIAL | Y `screens.Audio` | Create.tsx:175-205 | Mic recording is NotReady. |
| Draft manager | PARTIAL | Y `screens.Library` | Library.tsx; OutboxScreen.tsx | Local only. No server sync. |
| AI copilot | BLOCKED | Y `screens.Copilot` | Create.tsx:88 | Model server. |

## 9. Hush chat

| Feature | Status | Admin switch | Evidence | What's missing |
|---|---|---|---|---|
| Chat list (folders, mute, pin, archive) | DONE | Y `features.hushSettings` | routes_chat.py:111-157; routes_hush_settings.py:95 | — |
| Create DM / group | DONE | Y `limits.maxGroupSize` | routes_chat.py:120 | — |
| Text / emoji | DONE | Y `defaults.hush.whoCanMessage` | routes_chat.py:244-320 | — |
| Image / video / files | DONE | Y `features.chatMedia`, `limits.fileMaxMB`, `limits.chatVideoMaxSec` | routes_chat.py:271-290 | — |
| Voice notes | DONE | Y `features.voiceNotes`, `limits.voiceNoteMaxSec` | routes_chat.py:244; VoiceNote.tsx | — |
| GIFs | BLOCKED | N | — | GIF provider. |
| Stickers (BubbleMoji) | PARTIAL | N | Chats.tsx:263 `parseSticker` | Encoded as text tokens. No sticker kind or packs. |
| Polls | DONE | Y `features.polls` | routes_chat.py:371 | — |
| Shared posts / Loops | DONE | Y `features.post2chat` | routes_chat.py:424-440 | — |
| Shared Moods | MISSING | N | — | Only the reply text snippet. |
| Location | PARTIAL | N | Chats.tsx:204 "Place Drop" | Sent as text. No location kind or map. |
| View-once / snaps | DONE | Y `features.viewOnce`, `features.snaps` | routes_chat.py:380-408 | — |
| Reply | DONE | N | models.py:284 `reply_to` | — |
| React | DONE | N | routes_chat.py:339 | — |
| Forward | DONE | N | routes_chat.py:359 | — |
| Copy | DONE | N | Chats.tsx Clipboard | Client only (fine). |
| Edit | DONE | Y `limits.editWindowMin` | routes_chat.py:321 | — |
| Delete (unsend) | DONE | Y `limits.undoWindowMin` | routes_chat.py:330 | — |
| Pin / star | DONE | N | routes_chat.py:347-357; Chats.tsx:373 | — |
| Report message | PARTIAL | N | `/reports` generic | No message-context report flow. |
| Send later / fade timer | DONE | Y `features.sendLater`, `features.fadeChat`, `defaults.hush.fadeTimer` | models.py:289 | — |
| Composer + attachment panel | DONE | N | Chats.tsx:~195-210 | — |
| Delivered / read receipts | DONE | Y `features.readReceipts`, `defaults.hush.readReceipts` | receipts.py:10-40 | — |
| Typing | DONE | Y `features.typing`, `defaults.hush.typing` | realtime.py:237 | — |
| E2EE (1:1) | PARTIAL | Y `features.e2ee` | routes_v6.py:22-60; routes_chat.py:240-262; e2ee.ts | Device keys + box only. No ratchet, group E2EE or key-change UX. |
| Offline outbox | DONE | N | outbox.ts; Chats.tsx offline | — |
| Chat lock | DONE | Y `features.chatLock` | Chats.tsx:306 | Client only. |

## 10. Calls

| Feature | Status | Admin switch | Evidence | What's missing |
|---|---|---|---|---|
| 1:1 voice call | DONE | Y `features.calls`, `defaults.hush.callTypes` | calls.py:38-110; Parity.tsx:23-93 | — |
| 1:1 video call | DONE | Y `features.calls` | Parity.tsx:38-41 | — |
| Controls (mute, end, data saver) | PARTIAL | N | Parity.tsx:28 | No camera switch, speaker toggle or video off. |
| Call history | DONE | N | calls.py `/calls`; Parity.tsx:94; admin Call Log | — |
| TURN | BLOCKED | Y (integration) | calls.py `/rtc/ice` REST creds | Needs a coturn deployment. Code is ready. |
| Reconnection / ICE restart | MISSING | N | Parity.tsx only listens for connectionstatechange | No restartIce. |
| Group calls | BLOCKED | N | — | SFU. |

## 11. Squad & Hoods

| Feature | Status | Admin switch | Evidence | What's missing |
|---|---|---|---|---|
| Squad (friends, requests, close) | DONE | Y `screens.Friends` | routes `/friends*`; People.tsx:18 | — |
| Find by @ID / QR | PARTIAL | N | `/users/lookup`; People.tsx:75 | QR scan is NotReady. |
| Hoods discover | PARTIAL | Y `features.towns`, `screens.Towns` | routes_chat.py:549 | Plain list. No search or categories. |
| Hoods create | DONE | Y `features.towns` | routes_chat.py:558; People.tsx:193 | — |
| Hood detail / channels / board | DONE | N | routes_chat.py:565-628 | — |
| Members list | PARTIAL | N | routes_chat.py:565 | Verify pagination. No member mgmt UI beyond role. |
| Rules | PARTIAL | N | board posts | No rules entity or acceptance step. |
| Moderators (roles) | DONE | N | routes_chat.py:641-648 | Owner-only changes. |
| Join approval | PARTIAL | N | routes_chat.py:575-577 | Invite code only. No request/approve queue. |
| Ban / kick | MISSING | N | — | Only admin suspend of the whole Hood (`/admin/towns/{tid}`). |
| Voice / Live lounge | BLOCKED | N | People.tsx:233 | SFU / media server. |

## 12. VibeMoji

| Feature | Status | Admin switch | Evidence | What's missing |
|---|---|---|---|---|
| 1000-VibeMoji library + search | DONE | N | Extras.tsx:15; lib/vibemoji.ts | — |
| Emoji picker categories | PARTIAL | N | Extras.tsx:15-47 | Gallery screen, not a reusable keyboard picker. |
| Post reactions with VibeMoji | DONE | N | main.py:374 `VMOJI_RE` | — |
| Mood / chat integration | DONE | N | routes_chat.py:466 `moji`; Chats.tsx stickers | — |
| Comments / bios integration | MISSING | N | — | — |
| Admin VibeMoji vault | PARTIAL | N | admin page `emoji` | Viewer only. No upload. |

## 13. Profile

| Feature | Status | Admin switch | Evidence | What's missing |
|---|---|---|---|---|
| Public profile + posts | DONE | Y `defaults.glow.privateProfile` | routes_feed.py:110-125 | — |
| Private profile + follow requests | DONE | Y `features.followRequests` | routes_v6.py:108-139 | — |
| Cover image | DONE | N | routes_profile.py:18-26 | — |
| Edit profile | DONE | N | `/me/profile`; EditProfile.tsx | — |
| Handle change | DONE | N | `/me/handle` | — |
| Login history / security events | DONE | Y `security.newDeviceAlerts` | routes_security.py; Security.tsx | — |
| Sessions list / revoke | DONE | Y `security.sessionList` | routes_security.py:183-200 | — |
| 2FA (TOTP + recovery) | DONE | Y `security.twoFactor` | routes_security.py:115-178 | — |
| Blocked list | DONE | N | `/me/blocked`; HushSettings.tsx:139 | — |
| Download data | DONE | Y `privacy.selfExport` | routes_trust.py:146 | Synchronous JSON. No media archive. |
| Delete account (grace) | DONE | Y `privacy.selfDelete`, `privacy.deletionGraceDays` | routes_trust.py:59-142 | — |
| Multiple accounts | DONE | Y `limits.maxAccounts` | `/me/accounts-for-email`; Me.tsx:170 | — |

## 14. Notifications

| Feature | Status | Admin switch | Evidence | What's missing |
|---|---|---|---|---|
| In-app list (social / chat module) | DONE | N | models.py:88-96; main.py:171 | — |
| Categories | PARTIAL | N | `Notice.kind` | No category filter UI or API. |
| Mark read / mark all | DONE | N | main.py:291 | — |
| Delete notification | MISSING | N | — | — |
| Mute category | PARTIAL | Y `features.hushSettings` | HushSettings.tsx:156 | Hush prefs only. No per-category server enforcement for Glow. |
| Push (Expo) | DONE | Y `features.push` | push.py:60-100; admin Push Center | — |
| Push (FCM / APNs direct) | BLOCKED | Y `features.push` | push.py:73 | FCM credentials. |
| Dedupe / collapse | MISSING | N | — | No collapse key or dedupe window. |
| Notification pagination | MISSING | N | main.py:171 bootstrap only | — |

## 15. Backend platform

| Feature | Status | Admin switch | Evidence | What's missing |
|---|---|---|---|---|
| API conventions (errors, validation) | PARTIAL | N | pydantic models; docs/API_V*.md | Mixed `dict` bodies (main.py:377,389). No versioned prefix or OpenAPI contract tests. |
| Pagination | PARTIAL | N | offset cursors routes_feed.py | Offset-based, not keyset. |
| Rate limiting | DONE | N | ratelimit.py:120 `write_limit` | Per-bucket config isn't admin-tunable. |
| WebSocket auth | DONE | Y `features.realtime` | realtime.py:160-170 | — |
| Recovery / resync after reconnect | PARTIAL | N | lib/sync.ts `useLiveSync` refetch | No event replay or sequence. |
| Acks / ordering | MISSING | N | realtime.py | No per-event seq or ack. |
| Multi-node fan-out | DONE | N | realtime.py:98-118 Redis pub/sub | Needs Redis in prod. |
| Multi-device delivery | PARTIAL | N | realtime.py presence per uid | E2EE is per-device keys, but there's no device fan-out of encrypted boxes. |
| Object storage | BLOCKED | N | routes_media.py:3 | S3/GCS. |
| Signed URLs | DONE | N | routes_media.py:60-80 | HMAC links served by the app, not a CDN. |
| Transcoding | BLOCKED | N | — | Worker + FFmpeg. |
| Thumbnails / poster frames | BLOCKED | N | — | Worker. |
| Waveform generation | MISSING | N | — | Can be done in-repo (client or server). |
| Malware / content scan | PARTIAL | Y `safety.scanUploads`, `safety.hashBlocklist` | routes_trust.py:386-458 | Hash blocklist + held queue in-repo. The scanner engine is an external plug. |
| CDN | BLOCKED | N | — | — |
| Health / readiness | DONE | N | main.py `/health/*` | — |

## 16. Admin

| Feature | Status | Admin switch | Evidence | What's missing |
|---|---|---|---|---|
| Mission control counts | PARTIAL | N | main.py:467-473 | Totals only. No DAU/WAU/MAU. |
| DAU / WAU / MAU | MISSING | N | — | No activity table. |
| API performance | PARTIAL | N | middleware.py; admin "Vitals" | Verify. No latency percentiles store. |
| Media processing metrics | PARTIAL | N | `/admin/uploads`, `/admin/scan-queue` | No pipeline metrics. |
| User management (search, suspend, role) | DONE | N | main.py:474-492; `/admin/users/{uid}/security` | — |
| Content management (posts) | PARTIAL | N | Mod Queue via reports | No browse/takedown of arbitrary posts. |
| Moderation center (reports, appeals, spam) | DONE | Y `safety.appeals`, `spam.*` | main.py:495-505; routes_trust.py:249-350 | — |
| Media ops (scan queue, rescan, hash blocklist) | DONE | Y `safety.scanUploads` | routes_trust.py:433-458 | — |
| Security center (2FA reset, revoke, OTP watch, E2EE) | DONE | Y `security.*` | `/admin/users/{uid}/2fa-reset`; `/admin/otp`; routes_v6.py:46 | — |
| Incidents | DONE | N | `/admin/incidents` | — |
| Payments (plans, orders, webhooks) | DONE | Y `features.money`, `features.subscriptions` | routes_money.py; webhooks cashfree/razorpay | — |
| Payouts approval | DONE | Y `features.payouts` | main.py:507-520 | — |
| Reconciliation | MISSING | N | — | No settlement-vs-ledger job. |
| Refunds | MISSING | N | — | — |
| Analytics: retention / cohorts / funnels | MISSING | N | — | "Revenue Pulse" only. |
| Role permissions (Super / Ops / Mod / Sec / Finance / Analytics / Support) | PARTIAL | N | main.py:87; routes_trust.py:26; security.py:61 | Legacy routes are owner-only. Trust routes allow owner/admin/moderator/support. No Ops/Security/Finance/Analytics roles. Role Matrix page isn't enforced. |
| Audit logs | DONE | N | security.py:89; `/admin/audit` | Coverage is partial (not every admin mutation). |
| Config / switches / screens / dials / preview | DONE | — | routes_config.py; config_resolver.py | — |

## 17. Section 20 extras

| Feature | Status | Admin switch | Evidence | What's missing |
|---|---|---|---|---|
| Account recovery (OTP, recovery codes) | DONE | Y `security.twoFactor` | `/auth/otp/*`; routes_security.py:52-75 | — |
| Age gate / teen defaults | DONE | Y `safety.ageGate`, `safety.minAge`, `safety.teenDefaults` | routes_trust.py:177-203 | No age verification provider (BLOCKED for KYC-grade). |
| Deletion (grace + purge loop) | DONE | Y `privacy.selfDelete` | routes_trust.py:95-142 | — |
| Incidents | DONE | N | models.py:599; routes_trust.py:39 | — |
| Key lifecycle (E2EE device keys) | PARTIAL | Y `features.e2ee` | routes_v6.py:22-45 | No rotation policy or safety-number verify. |
| Sessions | DONE | Y `security.sessionList` | routes_security.py:87-200 | — |
| Backup + restore testing | DONE | N | deploy/k8s/backup-cronjob.yaml | Infra-side. Needs a cluster. |
| Anti-bot / anti-spam | PARTIAL | Y `spam.*` | routes_trust.py:337-350 | Heuristics only. No CAPTCHA/attestation (BLOCKED). |
| Drafts sync across devices | MISSING | N | — | — |
| Accessibility | PARTIAL | N | accessibilityLabel throughout | No audit, dynamic type or alt text on media. |
| Copyright (DMCA flow) | MISSING | N | — | Report kind only. |
| Creator KYC | PARTIAL | N | `/admin/identity`; routes_identity.py | ID desk exists. Provider KYC is BLOCKED. |
| Performance testing | MISSING | N | — | No load-test scripts. |
| Rollback (config / pages) | PARTIAL | N | page versions `/admin/pages/{slug}/restore` | No config-layer version rollback. |
| Multi-device | PARTIAL | N | sessions + device keys | No E2EE device fan-out. |
| Wellbeing (time limits, quiet mode) | MISSING | N | — | — |
| Community governance | PARTIAL | Y `features.speakUp` | routes_speakup.py; reviews | No community-moderator escalation. |
| Maintenance / force update | DONE | Y `access.maintenance`, `access.minAppVersion` | user_app.py SETTINGS | — |

## Top 15 to build next (in-repo, no external services)

1. **Server-driven feed tabs.** Wire mobile tabs to `/feed?mode=` and honour `defaults.glow.feedTabs`. Add a Mood mode server-side and a simple ranking (engagement + recency + affinity) for For You.
2. **Real carousel.** Add a `media[]` ordered array on Post, multi-upload in Studio, a swipe viewer and the `maxPhotosPerPost` check on the array. This also fixes "media order preserved".
3. **Granular admin RBAC.** Add Super/Ops/Moderator/Security/Finance/Analytics/Support roles with a permission map enforced in `require()`. Replace `STAFF=("owner",)` and back the Role Matrix page with it.
4. **Comments v2.** Add reply UI/threading, edit, sort (top/new), pin by post author, author-delete and VibeMoji reactions.
5. **Mood completeness.** Add a views table + viewers list, reactions, report, mute user, enforcement of `limits.statusHours`, a status purge job and selected/hide-from audiences.
6. **Blink archive + highlights.** Use the existing Spark rows: add a highlights model and profile row.
7. **Activity analytics.** Add an activity/event table, DAU/WAU/MAU, retention cohorts and funnels in Mission Control. Ingest watch-time and view events.
8. **Search v2.** Use pg_trgm typo tolerance, hashtag/tag search, Hoods/Loops server search, persisted search history + clear, and a suggest endpoint.
9. **Hoods moderation.** Add join request/approve queue, ban/kick, rules entity with acceptance, and member list with pagination.
10. **Notifications v2.** Add delete, category filter, per-category mute enforced server-side, dedupe/collapse window and pagination.
11. **Realtime reliability.** Add per-user event sequence numbers, acks and a replay-since-seq endpoint on reconnect.
12. **Server drafts + autosave** with cross-device sync. Add a Draft model and drafts sync.
13. **Audio posts + audio Mood.** Add the kind, upload path (existing chunked uploads), player, and waveform computed client-side or with in-repo numpy. Wire mic recording via expo-av.
14. **Payments reconciliation + refunds.** Add a ledger-vs-webhook reconciliation job and admin refund records (provider refund call can follow).
15. **Call robustness + controls.** Add ICE restart/reconnect, camera switch, speaker and video-off toggles.

## Blocked on infrastructure

- Object storage (S3/GCS) + CDN for media delivery
- Transcoding / thumbnail / poster worker (FFmpeg queue) for video render, split/merge, multi-clip Loops studio, music/voice-over
- TURN server (coturn): code is ready via `/rtc/ice`
- SFU for group calls and Hood voice/live lounges
- GIF provider (Tenor/Giphy) for chat and comment GIFs
- Translation API for post/comment translate
- Speech-to-text model for auto-captions
- AI model server for Copilot generation
- Malware/CSAM scanner engine (Scanner plug); the hash blocklist works today
- FCM/APNs credentials for direct push (Expo works)
- CAPTCHA / device attestation for anti-bot
- KYC / age-verification provider for creator KYC and verified age
- AR engine for live face lenses
- Kubernetes cluster for backup/restore-test cronjob execution
