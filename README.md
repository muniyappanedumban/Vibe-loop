# VibeLoop (branch: feature/vibeloop-app)
*Your World. Your People. Your Moments.*

| Part | Stack | Where |
|---|---|---|
| Mobile app (iOS / Android / web) | React Native · Expo SDK 58 · TypeScript · React Navigation · Zustand + Immer · SecureStore | `mobile/` |
| Backend API | Python FastAPI · SQLAlchemy 2 · PostgreSQL 16 · Alembic · PyJWT | `backend/` |
| Staff admin panel | React + Vite + TypeScript | `admin/` |
| Screenshots | all user screens in **one folder**, all admin pages in **one folder** | `screenshots/user/*.png`, `screenshots/admin/*.png` |
| Android APK | release build | `build/VibeLoop-1.0.0.apk` |

## Run everything locally
```bash
# 1. database + API (Postgres 16 running locally)
createdb vibeloop
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/alembic upgrade head        # or: .venv/bin/python -m app.seed --reset (creates tables + demo data)
.venv/bin/python -m app.seed          # labelled demo data
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8787
# 2. admin panel
cd admin && npm i && npm run dev       # http://localhost:5173 (VITE_API_URL to override API)
# 3. mobile
cd mobile && npm i && npx expo start   # EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:8787
```
Demo logins (seed data only — change for any shared environment): creator `riya@vibeloop.app`, staff `admin@vibeloop.app`, password `Vibeloop2026`.
Production secrets: set `JWT_SECRET`, `APPROVAL_SECRET`, `DATABASE_URL`, `CORS_ORIGINS` as environment variables (never in code).

## APK
`build/VibeLoop-1.0.0.apk` — install with `adb install build/VibeLoop-1.0.0.apk` or copy to the phone.
Its default server is the build machine's LAN address (`mobile/.env`); the phone must be on the same Wi-Fi with the API running.
The server URL can be changed on the Sign-in screen ("Server: …" → Test connection). Offline demo mode works without a server.
The release APK is signed with the debug keystore — fine for testing, **not for Play Store** (create an upload key / use EAS for that).
Rebuild: `cd mobile && npx expo prebuild -p android && cd android && ./gradlew assembleRelease`.

## How the app talks to the server
Signed in: `/bootstrap` loads everything; actions update the screen immediately and are sent to the API; any server rejection re-syncs from the server.
Publish and payouts are never optimistic: the app asks the server for a one-time signed approval token (5 min, bound to user + action + payload) and spends it.
Server enforces: roles (owner/creator/fan…), Loop Score ≥ minimum and rights checklist before release, one reaction per member per version, payout minimum and balance, kill switches, comment guard / restrict, message requests. Every significant action is written to the append-only audit log.

## Tests & checks
```bash
cd backend && .venv/bin/python -m pytest -q        # API tests (9)
node scripts/e2e-mobile.mjs                         # UI → API end-to-end (8 checks; reseed first)
node scripts/smoke-mobile.mjs                       # offline demo mode
node scripts/verify.mjs                             # catalogs, 500 VibeMoji, routes, navigation, screenshots (18 checks)
node scripts/shoot-mobile.mjs && node scripts/shoot-admin.mjs   # screenshots against the live API
```

## Honest status
Not connected yet (shown as "not ready" in the UI): AI model generation, FFmpeg render/export workers, microphone recording, real payment rail & bank payouts, push notifications, live video streaming, external platform posting, SMS/email verification, password change, TOTP enrolment.
Seed content (posts, sample earnings, creators) is labelled DEMO DATA. ~162 of 337 catalogued capabilities have a working screen; the rest are marked Planned.
