# VibeLoop — local setup (backend + admin panel + Android APK)

Three parts, all talking to one API:

| Part | Folder | Runs at |
|---|---|---|
| API (FastAPI + Postgres) | `backend/` | `http://<your-mac-ip>:8787` |
| Admin panel (Vite + React) | `admin/` | `http://localhost:5173` |
| Mobile app (Expo / React Native) | `mobile/` | APK in `build/VibeLoop-1.0.0.apk` |

## 1. Prerequisites
- Python 3.11+, Node 20+, PostgreSQL 15+ running locally
- Android SDK + JDK 17 (only to build the APK)

## 2. Backend
```bash
cd backend
createdb vibeloop                      # once
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env                   # edit if needed; dev defaults work
set -a; . ./.env; set +a
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8787
```
Check: `curl localhost:8787/health/ready` → `{"ok":true,"db":"up",...}`
Tests: `.venv/bin/python -m pytest -q`

`--host 0.0.0.0` is required so phones on the same Wi-Fi can reach it.

## 3. Admin panel
```bash
cd admin
npm install
npm run dev                            # http://localhost:5173
```
Uses `VITE_API_URL` (default `http://localhost:8787`).
Sign in as `@vibeloop.staff` (seeded owner). With `DEMO_OTP=1` the code is shown on screen.

## 4. Android APK
1. Find your Mac's Wi-Fi IP: `ipconfig getifaddr en0`
2. Put it in `mobile/.env`:
   ```
   EXPO_PUBLIC_API_URL=http://<your-mac-ip>:8787
   ```
3. Build (the clean step is needed so the new IP is bundled — Gradle caches the JS bundle):
   ```bash
   cd mobile && npm install && npx tsc --noEmit
   cd android
   rm -rf app/build/generated/assets app/build/intermediates/assets
   ./gradlew assembleRelease
   cp app/build/outputs/apk/release/app-release.apk ../../build/VibeLoop-1.0.0.apk
   ```
4. Install: `adb install -r build/VibeLoop-1.0.0.apk` (or copy the file to the phone).

The server address can also be changed inside the app on the sign-in screen, so an APK
built for an old IP still works — change it there.

## 5. Sign in on the app
Enter an @ID (seeded: `@riya.makes`), tap **Send login code**. In demo mode the code
is shown with a **Use** button. Real emails need MSG91 set up in Admin → Plugs.

## Troubleshooting
- **App says "Offline" / can't reach server** — phone and Mac must be on the same Wi-Fi,
  API must run with `--host 0.0.0.0`, and the IP on the sign-in screen must match
  `ipconfig getifaddr en0` (it changes when you switch networks). Allow Python through
  the macOS firewall if prompted.
- **Maintenance / "Update required" screen** — turned on in Admin → User App Settings.

More: `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/SCALING.md`.

## Operations
Backups, restore tests, incident playbooks and privacy requests: `docs/RUNBOOK.md`. Scripts: `scripts/ops/`.
