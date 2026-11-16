# VibeLoop (branch: feature/vibeloop-app)

- `mobile/` — React Native (Expo SDK 58, TypeScript), React Navigation, Zustand + Immer, persisted state. 19 screens.
- `admin/` — staff Admin Panel (React + Vite + TypeScript). 13 pages.
- `.claude/agents/` — project agents: mobile-ui-builder, admin-builder, screenshot-qa, prd-compliance-reviewer.
- `docs/DESIGN_SYSTEM.md` — the original "Prism Pulse" design system (own icons + "Vibe" reaction stickers).
- `screenshots/user/<NN-screen>/{screen,full}.png`, `screenshots/admin/<NN-page>/screen.png`.

## Run
    cd mobile && npm i && npx expo start        # iOS / Android / web
    cd admin && npm i && npm run dev
## Screenshots & tests
    (cd mobile && npx expo export -p web) && node scripts/shoot-mobile.mjs && node scripts/smoke-mobile.mjs
    (cd admin && npm run build) && node scripts/shoot-admin.mjs

## Honest status
Front-end only. There is no FastAPI/Postgres backend yet: state is on-device (mobile) or in memory (admin).
Approval tokens are minted and checked on-device (one-time use, 5 min expiry, bound to the action) as a stand-in for server-signed JWTs.
Real behaviour: Loop Score from reactions (24h window, low-effort filter, needs at least 3 reactions), A/B scores, health, keyword sentiment,
release gate, payout rules, editor timeline with undo/redo, memory corrections, data export.
Marked "not ready" in the UI: AI model generation, rendering/export, mic recording, payment rail, external posting.
Seed data is labelled DEMO DATA.
