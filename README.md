# VibeLoop — Glow (social) + Hush (chat), one app (branch: feature/vibeloop-app)
*One @ID. Every connection. No phone number.*

| Part | Stack | Where |
|---|---|---|
| Mobile app (Android APK / iOS / web) | React Native · Expo SDK 58 · TypeScript · React Navigation · Zustand + Immer · SecureStore · expo-video/-image-picker/-location | `mobile/` |
| Backend API | FastAPI · SQLAlchemy 2 · PostgreSQL 16 · Alembic · PyJWT · Fernet | `backend/` |
| Staff admin panel | React + Vite + TypeScript | `admin/` |
| Screenshots | `screenshots/admin/` · `screenshots/vibeloop/` (Glow) · `screenshots/chat/` (Hush) — one flat folder each | |
| APK | `build/VibeLoop-1.0.0.apk` (not committed) | |

## Two modules, one app
- **Glow** (social) tabs: Hub · Drift · Make · Flicks · Me. **Hush** (chat) tabs: Hush · Squad · Moods · Hoods · Me. All labels, tabs, screens, features, colours and nav-bar styles come from the server (`/app-config`) and are edited by staff per layer: base → country → zone → slab → language.
- D-Switch (tap/swipe), Dual Pulse badges, Chat Bubble, Post2Chat / Reel2Talk / Draft Bridge, Smart Jump, Focus Switch, Privacy Split, Two Faces bios.
- Phone-free sign-in: @ID or email → 6-digit one-time code (demo code shown while email/MSG91 isn't connected). Up to 5 accounts per device and per email; account switcher.
- Make studio: photos & videos (gallery, camera, recording) uploaded with magic-byte checks; 10 Vibe Lenses; Auto Edit (trim, speed, timed captions with alignment & styles); location tag + map link; #tags/@mentions; Collab; sound tag; Public / Circle only / Quiet share; Blinks (stories) with 1/6/12/24h timer.
- Own emoji & icons: 1000 VibeMoji (Glow) + 1000 BubbleMoji (Hush) + 1000 IconKit icons per module, all procedurally generated, no third-party assets; full-library reactions on posts and messages.
- Money (all OFF until staff enable): Stash store, Backstage Pass subscriptions (₹ first, per-country prices), Props tips, Boosts ads by slab, platform fee, Cash Flow income. Razorpay / Cashfree hosted checkout; verified webhooks.

## Run locally
```bash
createdb vibeloop
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m app.seed --reset && .venv/bin/alembic stamp head
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8787
cd admin && npm i && npm run dev            # http://localhost:5173
cd mobile && npm i && npx expo start        # EXPO_PUBLIC_API_URL=http://<LAN-IP>:8787 in mobile/.env
```
**Test logins (seed only):** app — `@riya.makes` (or riya@vibeloop.app) → "Send login code" → tap *Use* on the demo code; second account `@riya.chats`. Staff admin — admin@vibeloop.app / `Vibeloop2026`.
**Provider keys:** none are included. Put your own *test* keys in Admin → Plugs (Razorpay `rzp_test_…`, Cashfree sandbox, MSG91, Maps). They're encrypted with `MASTER_KEY` and never shown again. Without keys, checkout says "Payments not configured" (no fake success).

## APK
`adb install build/VibeLoop-1.0.0.apk`. The phone must reach the API (same Wi-Fi; default URL baked from `mobile/.env`; change it on the sign-in screen → Server). Signed with the debug key — fine for testing, not for Play Store.

## Tests
`backend: .venv/bin/python -m pytest -q` (52) · `node scripts/e2e-mobile.mjs` (11 UI→API checks) · `node scripts/smoke-mobile.mjs` · `node scripts/verify.mjs` (23) · screenshots: `node scripts/shoot-mobile.mjs`, `node scripts/shoot-admin.mjs`.

## Honest status — not built yet (shown as "not ready" in the app)
End-to-end encryption (planned: audited protocol), voice/video calls & live streaming, voice notes, file sharing in chat, speech-to-captions, AR face lenses, licensed music playback, in-app map view (map link opens the maps app), push notifications & WebSockets (Hush polls every 5 s), passkeys, real email/SMS delivery until MSG91 keys are added, live payments until provider keys are added. Cashfree payment links may require a customer phone; Razorpay links do not — prefer Razorpay to keep the app phone-free.
