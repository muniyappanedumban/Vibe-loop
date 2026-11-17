// Screenshots every mobile screen into ONE folder: screenshots/user/<NN-name>.png (+ <NN-name>-full.png for long screens).
// Signs in through the real Sign-in screen against the live API (default http://localhost:8787) first.
// Usage: (cd mobile && npx expo export -p web) && node scripts/shoot-mobile.mjs [folderPrefix]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'mobile', 'dist');
// Two flat folders: Social module → screenshots/vibeloop, Chat module → screenshots/chat
const CHAT = new Set(['Chats', 'ChatRoom', 'NewChat', 'ChatSearch', 'Starred', 'Friends', 'MyCode', 'Vibes', 'StatusCompose', 'StatusView', 'Towns', 'TownRoom', 'CreateTown', 'ChatMe', 'ChangeHandle', 'ChatSecurity', 'BubbleMojiGallery', 'ShareToChat', 'Accounts', 'LanguageRegion', 'Call', 'CallLog', 'SnapView', 'HushSettings', 'HushProfile', 'HushPrivacy', 'HushBlocked', 'HushNotifications', 'HushChats', 'HushArchive', 'HushCalls', 'HushSecurity', 'HushStorage', 'HushAbout', 'HushExtras', 'SafeArrival', 'Pacts', 'HushTab', 'CheckInCircle', 'PlanBoard', 'BirthdayBuddy', 'RideRota', 'DecisionDice', 'GiftPool', 'ChoreRotation', 'WatchQueue', 'SecretSanta', 'LendLog', 'HabitBuddies', 'TripPlanner', 'EmergencyCard', 'RemindThem', 'MeetingNotes', 'MemoryJar', 'KindnessStreak', 'QuietReply', 'ConfessionBox', 'TimeZoneBoard', 'ReadLaterShelf', 'StudySprint', 'SharedBudget', 'VoteToPin']);
const DIRS = { social: path.join(root, 'screenshots', 'vibeloop'), chat: path.join(root, 'screenshots', 'chat') };
const out = DIRS.social;
const API = process.env.API_URL || 'http://localhost:8787';
const { chromium } = createRequire(path.join(root, 'admin', 'package.json'))('playwright');
const src = fs.readFileSync(path.join(root, 'mobile/src/navigation/routes.ts'), 'utf8');
const SCREENS = [...src.matchAll(/name: '(\w+)', folder: '([\w-]+)'(?:, query: '([^']+)')?/g)].map(m => ({ name: m[1], folder: m[2], q: m[3] }));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf' };
const PORT = 4175;
const server = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(dist) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
}).listen(PORT);
const only = process.argv[2];
if (!only) { for (const d of [...Object.values(DIRS), path.join(root, 'screenshots', 'user')]) fs.rmSync(d, { recursive: true, force: true }); }
for (const d of Object.values(DIRS)) fs.mkdirSync(d, { recursive: true });
// Money features are admin-switchable and OFF by default. Turn them on for the shoot (so Stash/Backstage Pass/Props/Cash Flow/Boosts show), restore after.
const apiJ = async (m, p, b, t) => (await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: b && JSON.stringify(b) })).json();
const ADM = (await apiJ('POST', '/auth/login', { email: 'admin@vibeloop.app', password: 'Vibeloop2026' })).token;
const moneyBefore = await apiJ('GET', '/admin/money/settings', null, ADM);
await apiJ('PUT', '/admin/money/settings', { ...moneyBefore, money: true, subscriptions: true, store: true, tips: true, ads: true, platformFees: true }, ADM);
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage(); let errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push(e.message));
const base = `http://localhost:${PORT}`;
// sign in once through the UI (session token lives in this tab's sessionStorage)
await page.goto(`${base}/?s=SignIn`, { waitUntil: 'networkidle' });
await page.evaluate(api => { const k = 'vibeloop-session'; const s = JSON.parse(localStorage.getItem(k) || '{"state":{},"version":0}'); s.state.apiUrl = api; localStorage.setItem(k, JSON.stringify(s)); }, API);
await page.goto(`${base}/?s=SignIn`, { waitUntil: 'networkidle' });
await page.getByPlaceholder('@riya.makes').fill('@riya.makes');
await page.getByRole('button', { name: 'Send login code' }).click();
await page.getByText('Demo mode', { exact: false }).waitFor({ timeout: 10000 });
await page.waitForTimeout(400); await page.screenshot({ path: path.join(out, '01b-otp-code.png') });
await page.getByRole('button', { name: 'Use', exact: true }).click();
await page.getByText('Hub', { exact: true }).first().waitFor({ timeout: 15000 });
console.log('✓ signed in against', API);
let failures = 0;
for (const s of SCREENS.filter(x => !only || x.folder.startsWith(only))) {
  errors = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/?s=${s.name}${s.q ? '&' + s.q : ''}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(/^(5|6)\d-/.test(s.folder) ? 2200 : 900);
  const dir = CHAT.has(s.name) || s.folder.includes('hush') ? DIRS.chat : DIRS.social;  // Hush Hub/Guide/Notes → chat folder
  await page.screenshot({ path: path.join(dir, `${s.folder}.png`) });
  const h = await page.evaluate(() => Math.max(...[...document.querySelectorAll('div')].filter(d => d.offsetParent !== null && getComputedStyle(d).overflowY !== 'visible' && d.getBoundingClientRect().left >= 0 && d.getBoundingClientRect().left < 50).map(d => d.scrollHeight), 844));
  if (h > 900) { await page.setViewportSize({ width: 390, height: Math.min(h, 6000) }); await page.waitForTimeout(400); await page.screenshot({ path: path.join(dir, `${s.folder}-full.png`) }); }
  const real = errors.filter(e => !/favicon/.test(e));
  if (real.length) { failures++; console.log(`✗ ${s.folder}\n   ${real.slice(0, 3).join('\n   ')}`); } else console.log(`✓ ${s.folder}`);
}
// ---- Server-driven theme variant: same account switched to country US → admin's US theme (Ocean social / Coral chat) ----
if (!only) {
  const api = async (m, p, b, t) => (await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: b && JSON.stringify(b) })).json();
  const T = (await api('POST', '/auth/login', { email: 'riya@vibeloop.app', password: 'Vibeloop2026' })).token;
  await api('PATCH', '/me/profile', { country: 'US' }, T);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/?s=Home`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);            // config arrives → theme changed → app reloads itself
  for (const [name, q, file, mod] of [['Home', '', '70-theme-us-home', 'social'], ['Explore', '', '71-theme-us-explore', 'social'], ['Profile', '', '72-theme-us-profile', 'social'],
                                      ['Chats', '', '73-theme-us-chat-list', 'chat'], ['ChatRoom', 'id=cv_u1', '74-theme-us-chat-room', 'chat'], ['ChatMe', '', '75-theme-us-chat-me', 'chat']]) {
    await page.goto(`${base}/?s=${name}${q ? '&' + q : ''}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2200);
    await page.screenshot({ path: path.join(DIRS[mod], `${file}.png`) }); console.log('✓', file);
  }
  await api('PATCH', '/me/profile', { country: 'IN' }, T);
}
await apiJ('PUT', '/admin/money/settings', moneyBefore, ADM);
await browser.close(); server.close(); process.exit(failures ? 1 : 0);
