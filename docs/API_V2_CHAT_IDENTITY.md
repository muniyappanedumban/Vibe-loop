# VibeLoop v2 — @ID identity, OTP login, multi-account, Chat module (contract)

One app, two modules: **Social** (existing VibeLoop) and **Chat** ("Vibe Chat": Chats · Friends · Vibes · Towns · Me).
Identity is a public **@handle** (never the credential) + an internal immutable user id. No phone numbers anywhere.
Every new endpoint requires `Authorization: Bearer <token>` unless marked public. `me` = the caller in all `from`/`by` fields.

## Auth (public)
- `POST /auth/register` {handle, name, email} → 200 {sent, channel:"email", to:"r***@domain", expiresIn:300, demoCode?}
  - handle: `^[a-z0-9._]{3,20}$` after stripping leading `@`, lowercased; not in reserved list (admin, support, vibeloop, staff, root, help, security, official, mod, moderator) or kv `reserved` entries; unique.
  - max **5 accounts per email** → 409 "This email already has 5 accounts".
  - creates user with role creator (status unverified until OTP verified).
- `POST /auth/otp/request` {identifier: "@handle" | email} → same shape as register. Unknown identifier → **same 200 shape** (no account enumeration) but no code stored.
- `POST /auth/otp/verify` {identifier, code} → {token, user}. 6-digit code, HMAC-hashed at rest, expires 5 min, max 5 attempts per code, single use.
- Demo mode: env `DEMO_OTP=1` (default in dev) → response includes `demoCode`. Email delivery is NOT connected (honest).
- Rate limits (in-memory, per identifier and per client IP): OTP request 5 / 15 min, verify 10 / 15 min, password login 10 / 15 min → 429 with `Retry-After`.
- Existing `POST /auth/login` (password) remains for staff/seed users.
- `POST /auth/logout-all` → bumps user.token_version (all tokens for that user invalid). Access JWT carries `tv`.

## Identity
- `GET /users/lookup?handle=@x` exact match only (ID Finder). Hidden users → 404 unless already friends.
- `GET /me/profile` / `PATCH /me/profile` {name, social_bio, chat_bio, hidden, who_can_message: everyone|friends|nobody, ghost_hours: bool, focus_social_muted: bool, social_private: bool, chat_read_receipts: bool}
- `POST /me/handle` {handle} — 30-day cooldown → 429 "You can change your @ID again on <date>"; old handle reserved 30 days.
- `GET /me/accounts-for-email` → count of accounts for my email (for the 5 cap UI).

## Friends
- `GET /friends` → {friends:[User+{close, bestie, since}], incoming:[{id, from:User, at}], outgoing:[{id, to:User, at}]}
- `POST /friends/request` {handle} → 409 if already friends/pending, 403 if target who_can_message=nobody or blocked.
- `POST /friends/requests/{id}/accept|decline`, `DELETE /friends/{userId}`, `PATCH /friends/{userId}` {close?, bestie?}
- `POST /pings` {to:userId, moji:int, kind:"wave"|"heart"|"ping"} → creates a chat-module notice for the target (Vibe Ping/Wave/Heart Ping).

User shape: {id, handle, name, hue, bio (chat_bio), verified, mood}

## Conversations
Conv: {id, title, group, members:[User], folder: friends|family|work|groups|null, muted, pinned, locked, theme, fadeSec, request, unread, last:{text, at, from}|null}
- `GET /conv` (mine), `POST /conv` {members:[userId], title?} — 1:1 with a non-friend → conv created as `request:true` for the recipient (Request Gate); target with who_can_message=nobody → 403; blocked → 403. Reuses existing 1:1 conv.
- `PATCH /conv/{id}` {folder?, muted?, pinned?, locked?, theme?, fadeSec?(null|3600|86400|604800), accept?:true}
- `GET /conv/{id}/messages` → [Message] (excludes expired fade messages, excludes scheduled-not-yet for others)

Message: {id, convId, from, kind: text|poll|post|draft|viewonce|ping|system, text, replyTo:{id,text,from}|null, reactions:[{moji, by}], starred, pinned, edited, deleted, at, expiresAt|null, sendAt|null, poll:{q, options:[{text, votes}], myVote}|null, ref:{type:"post"|"loop", id, title, hue}|null, opened}
- `POST /conv/{id}/messages` {text, kind?="text", replyTo?, poll?:{q, options:[str]}, viewOnce?, sendAt?(ms future = Send Later)} — request convs: sender can't send a 2nd message until accepted.
- `PATCH /messages/{id}` {text} — own, within 15 min → else 409 (Edit Bubble). `DELETE /messages/{id}` own within 60 min → tombstone deleted:true (Undo Send).
- `POST /messages/{id}/react` {moji}, `/star`, `/pin`, `/forward` {convId}, `/vote` {option:int}, `/open` (view-once: returns text once, then opened:true and text hidden)
- `GET /search/messages?q=` (Find Anything; only my convs)

## Bridge (between modules)
- `POST /bridge/share` {convId, type:"post"|"loop", id, note?} → message kind post (Post2Chat / Reel2Talk) or draft (Draft Bridge for loops; only own loops).

## Vibes (status, 24h)
- `POST /status` {kind:"text"|"mood", text?, moji?, bg?, audience:"friends"|"close"|"public"} ; `GET /status` → active (<24h) statuses visible to me, mine first ; `POST /status/{id}/reply` {text} → message in 1:1 conv with author ; `DELETE /status/{id}`.

## Towns (communities)
Town: {id, name, open, hue, about, members:int, role: owner|admin|moderator|member|null, channels:[{id,name}], board:[{id,text,at}], invite: code|null (owner/admin only)}
- `GET /towns` (mine + open ones), `POST /towns` {name, open, about}, `GET /towns/{id}`, `POST /towns/{id}/join` {code?} (secret towns need a valid code), `POST /towns/{id}/leave`
- `POST /towns/{id}/channels` {name} (owner/admin), `GET|POST /towns/{id}/channels/{cid}/messages`, `POST /towns/{id}/board` {text} (owner/admin), `POST /towns/{id}/invite` (rotate/revoke code), `PATCH /towns/{id}/members/{userId}` {role} (owner only)

## Pulse (Dual Pulse badges)
- `GET /pulse` → {social: unread social notices, chat: unread chat messages + friend requests + chat notices}
- Notices gain `module: "social"|"chat"`; `/bootstrap` notices include it (Smart Jump).

## Admin additions (owner)
- `GET /admin/otp` → recent OTP requests [{identifier(masked), at, ip(masked), verified, attempts, rateLimited}] — never codes.
- `GET /admin/identity` → {accountsPerEmail:[{email(masked), count}], handleChanges:[...], reserved:[...]} ; `PUT /admin/kv/reserved/{handle}`
- `GET /admin/towns`, `PATCH /admin/towns/{id}` {suspended}
- `GET /admin/chat-stats` → {convs, messages, requestsPending, statuses24h, towns}
- Kill switches (kv kill): `chat`, `social`, `otp` enforced server-side (503).

## Security notes (honest)
- Transport: run behind HTTPS in production. **End-to-end encryption is NOT implemented** in this build; the app says so on the Security screen. Production should adopt an audited protocol (e.g. Signal/MLS) before launch.
- File/voice/video/calls/QR scanning/location are not implemented server-side → UI shows "not ready".

# Server-driven app config (admin-controlled)
The app renders its navigation bars, screens, modules and feature switches from the server. Admin edits layered overrides; the server resolves them per request.

## Resolution order (later wins, deep-merge)
`base` → `country:<ISO2>` → `zone:<ZONE>` → `slab:<SLAB>` → `lang:<code>` (lang layer may only change `languages.strings` and label text).
- country: user profile `country` (default from `X-Country` header, else "IN"); zone: looked up from kv `zones` (country → zone); slab: computed from the user (see slabs); lang: profile `lang` or `?lang=` or "en".

## `GET /app-config` (public; uses the user's context when a Bearer token is sent; `?country=&lang=` override for anonymous/pre-login)
```json
{ "version": 7, "resolvedFor": {"country":"IN","zone":"IN-SOUTH","slab":"starter","lang":"ta"},
  "modules": {"social": true, "chat": true},
  "nav": { "social": [{"key":"Home","label":"Home","icon":"home","enabled":true,"order":1}, ...Explore, Create, Motion, Profile],
           "chat":   [{"key":"Chats",...},{"key":"Friends"},{"key":"Vibes"},{"key":"Towns"},{"key":"ChatMe"}] },
  "screens": {"Live": true, "Payout": true, "Copilot": true, ...},   // any stack screen key → enabled
  "features": {"dswitch":true,"swipeWorlds":true,"chatBubble":true,"post2chat":true,"draftBridge":true,"focusSwitch":true,"statuses":true,"towns":true,"viewOnce":true,"sendLater":true,"polls":true,"fadeChat":true,"chatLock":true,"payouts":true,"paidLoops":true,"live":true},
  "limits": {"maxAccounts":5,"maxGroupSize":50,"statusHours":24,"editWindowMin":15,"undoWindowMin":60},
  "fees": {"platformFee":0.08},
  "languages": {"default":"en","available":["en","hi","ta","te","kn","ml","mr","bn"],"strings":{"nav.Home":"முகப்பு", "...":"..."}},
  "banner": null }
```
Rules: a module disabled → its whole tab set hidden and DSwitch hidden; nav items with enabled=false hidden; at least one nav item per enabled module must stay enabled (admin save validates); `screens[X]=false` → the app shows "turned off in your region" instead of the screen and the API for that area returns 403 where applicable (payouts, live, towns, statuses).

## Admin (owner)
- `GET /admin/config/layers` → {layerKey: override JSON}; `PUT /admin/config/{layerKey}` (layerKey `base` | `country:XX` | `zone:KEY` | `slab:KEY` | `lang:code`) — validated; bumps version; audit.
- `DELETE /admin/config/{layerKey}` (not base).
- `GET /admin/config/preview?country=&slab=&lang=` → the resolved config for that context.
- `GET|PUT /admin/zones` → {"IN-SOUTH":{"name":"India South","countries":["IN"],"states":["TN","KA","KL","AP","TS"]}, "IN-NORTH":{...}, "GLOBAL":{"name":"Rest of world","countries":["*"]}}  (country→zone uses first match; `*` = fallback)
- `GET|PUT /admin/slabs` → [{"key":"starter","name":"Starter","minFollowers":0,"maxFollowers":999},{"key":"rising","minFollowers":1000,"maxFollowers":9999},{"key":"pro","minFollowers":10000}] (followers = follow edges to the user)
- `GET|PUT /admin/languages` → {"available":[...], "default":"en"}; strings live in layer `lang:<code>` under `languages.strings`.
- Users: `PATCH /me/profile` also accepts `country` (ISO2) and `lang`.
Seed: base config (all on), country:US (paidLoops false, payouts false — "not available in this country yet"), zone:IN-SOUTH (default language ta suggestion via banner), slab:pro (maxGroupSize 200, platformFee 0.06), lang:hi / lang:ta / lang:te strings for nav labels, DSwitch labels and section headers (~40 keys).

## Implementation notes
Backend: `app/routes_identity.py`, `app/routes_chat.py`, `app/routes_config.py`, `app/config_resolver.py`, `app/middleware.py`, `app/ratelimit.py`, `app/v2common.py`. Migration `ec7718784513`. Additions and choices the contract left open:
- **Handles** are stored with a leading `@` (e.g. `"@riya.makes"`). All inputs accept the handle with or without `@`, in any case.
- **Choosing the account from an email identifier**: if the email has an unverified account (just registered), OTP goes to the newest one; otherwise it goes to the oldest account. Send `@handle` to pick an exact account. `/auth/otp/verify` also returns `accounts:[User]`, the verified accounts on that email, for an account switcher. Its `user` also includes `role`.
- **OTP errors**: a wrong, expired, used or unknown code returns 400 "Invalid or expired code". After 5 wrong attempts the code is locked and returns 429. An unknown identifier gets the same 200 shape with a fake masked `to` and a `demoCode` that never verifies. Nothing verifiable is stored for it.
- **Register** also checks the `signups` kill switch and the `otp` kill switch. It has its own rate limit: 5 per email and 5 per IP per 15 min. The 5-account cap (409) is checked before the rate limit. A bad handle format returns 400. A reserved or taken handle returns 409.
- **Password login**: `/auth/login` accepts an email or an `@handle`. With an email, it signs in to the first account (oldest first) whose password matches. Accounts created through OTP have no password.
- **Profile**: `GET /me/profile` returns `{id, handle, name, email(masked), verified, hue, social_bio, chat_bio, hidden, who_can_message, ghost_hours, focus_social_muted, social_private, chat_read_receipts, mood, country, lang, handleChangedAt, nextHandleChangeAt}`. `mood` is an int (moji id).
- **who_can_message**: `friends` also blocks starting a conversation with a non-friend (403). Friend requests are still allowed. `nobody` blocks both. Hidden or unverified users return 404 on lookup and on friend request.
- **`GET /users/lookup`** adds `friend`, `pending` and `me` booleans. `/me/accounts-for-email` returns `{email, count, max, accounts}`.
- **Blocking** uses the existing `POST /edges/block/{userId}`, in either direction. It blocks friend requests, pings and DMs.
- **Pings** are friends-only (403 otherwise).
- **Conv shape**:
  - `members` excludes the caller.
  - 1:1 `title` is the other person's name.
  - Extra field `awaitingAccept`: true when the other side still has the request pending.
  - `folder`, `muted`, `pinned`, `locked` and `theme` are per user. `fadeSec` applies to the whole conversation.
  - `GET /conv/{id}/messages` marks the conversation read, which drives `unread`.
- **Request Gate**: the recipient of a request cannot send until they accept (409). Accepting a friend request clears the gate between the two people.
- **Messages**:
  - `from` is `"me"` or a user id. `reactions[].by` likewise.
  - A user has at most one reaction per message. Reacting with the same moji again removes it.
  - `starred` is per user. `pinned` applies to the whole conversation.
  - Send Later sets `at = sendAt` (max 30 days ahead).
  - View-once text is always `""` for recipients in lists. `/open` returns it once, and a second `/open` returns 409. The sender sees their own text.
  - Forwarding a poll sends a text "Poll: <q>". View-once, ping and system messages cannot be forwarded.
  - Deleting returns a tombstone with `text:""`.
- **Notice routes and params** for chat-module notices:
  - Friend request or accept: `route:"Friends"`, `params:{requestId}`.
  - Ping: `route:"Friends"`, `params:{from, moji, kind}`.
  - New DM: `route:"ChatThread"`, `params:{id}`. 1:1 only, skipped if the recipient muted the conversation.
  - Town invite: `route:"Town"`, `params:{id, code}`.
- **Town invite to a person**: `POST /towns/{id}/invite` accepts `{revoke?:bool, to?:userId}` and returns `{invite}`. Without `to` it rotates the code (or revokes it). With `to` it reuses the current code, or creates one, and sends a chat notice. Invite codes are not case-sensitive.
- **Town rules**: owners cannot leave (409). The owner's role cannot be changed (409). Channel names are lowercased with dashes. Secret towns, and towns suspended by admin, return 404 to non-members. Only members can read or post in channels.
- **Status**: `GET /status` items are `{id, by:"me"|userId, user:User, kind, text, moji, bg, audience, at, expiresAt}`. A reply is posted as a text message in the 1:1 conversation ("Replied to your Vibe “…”: …") and returns `{conv, message}`. A close-audience status is visible to people the author marked close.
- **Pulse**: `chat` = unread DM messages + pending incoming friend requests + unread chat notices. Extra field `detail:{messages, requests, notices}`.
- **Kill switches** are enforced in middleware:
  - `chat` covers `/friends /pings /conv /messages /search/messages /bridge /status /towns`.
  - `social` covers `/posts`.
  - `otp` covers `/auth/otp/request` and `/auth/register`.
  - `PUT /admin/kv/reserved/{handle}` with `{"on":true}` reserves a handle. `{"on":false}` releases it.
- **App config**:
  - Layers are stored in kv ns `config`. Version is in `config_meta/version`. Zones, slabs and languages are in kv ns `appcfg`. Saving a layer, zones, slabs or languages bumps the version.
  - Nav lists deep-merge by item `key`.
  - Country comes from `?country`, then profile `country`, then the `X-Country` header, then `IN`. Zone matching follows the doc. The `states` field is stored but unused because the server does not know the user's state.
  - Validation checks the base layer alone and the base layer plus each other layer, so no enabled module is left without nav items. It does not check combinations of 3 or more layers.
  - The lang layer may contain only `languages.strings` and `nav[].{key,label}`. `languages.strings["nav.<Key>"]` overrides nav labels automatically.
  - Enforcement keys: `/payouts` uses `screens.Payout` or `features.payouts`. `/towns` uses `screens.Towns` or `features.towns`. `/status` uses `screens.Vibes` or `features.statuses`. All return 403. `/live` is mapped but no live API exists yet. A module set to false returns 503 on chat routes or `/posts`.
  - Seeded strings cover 42 keys (`nav.*`, `module.*`, `dswitch.*`, `tab.*`, `section.*`, `action.*`, `common.TurnedOff`) in hi, ta and te.
- **Security**:
  - The rate limiter is in-memory per process; production should use Redis.
  - Client IP is the socket peer; `X-Forwarded-For` is not trusted.
  - Bodies over 1 MB return 413.
  - Every response gets nosniff, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a Permissions-Policy and `Cache-Control: no-store`.
- **Not implemented**:
  - Email delivery. Demo mode returns the code.
  - E2EE.
  - File, voice and calls.
  - Read receipts (the flag is stored only).
  - `ghost_hours` and `focus_social_muted` are stored only and not enforced server-side.
  - Purging unverified accounts.
