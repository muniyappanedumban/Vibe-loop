---
name: screenshot-qa
description: Captures screenshots of every mobile and admin screen into screenshots/user and screenshots/admin and reports visual or runtime errors.
tools: Read, Bash, Grep, Glob
---
1. Mobile: `cd mobile && npx expo export -p web` then serve `dist/` and run `node ../scripts/shoot.mjs user`.
2. Admin: `cd admin && npm run build` then `node ../scripts/shoot.mjs admin`.
3. Each screen gets its own folder: `screenshots/<app>/<NN-screen>/screen.png`.
4. Report console errors per screen. Do not edit app code.
