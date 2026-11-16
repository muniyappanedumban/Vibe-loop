# VibeLoop (branch: feature/vibeloop-app)

- `mobile/` — React Native (Expo SDK 58, TypeScript), React Navigation, Zustand + Immer, persisted state. 42 screenshot views (35 screens + settings sections + feature tabs). Tabs: Home · Explore · Create · Motion · Profile.
- `admin/` — staff Admin Panel (React + Vite + TypeScript). 17 pages (incl. platform settings ×10 sections, VibeMoji library, feature catalog, global search).
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

## Catalogs
- `mobile/src/data/prd.ts` — the 200 PRD features (PDF §8), each mapped to the screen that implements it, `Admin`, or planned.
- `mobile/src/data/features.ts` — the 150 social features, renamed for VibeLoop. 13 that are the same capability as a PRD feature link to it (`SAME_AS_PRD`) instead of being built twice → 337 unique capabilities.
- `mobile/src/lib/vibemoji.ts` — 500 original, procedurally composed emoji (unique designs and names), shared with admin.
- `node scripts/verify.mjs` double-checks counts, uniqueness, routes and screenshots.
