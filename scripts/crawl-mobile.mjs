// Crawls EVERY mobile screen (Glow tabs, Hush tabs, every STACK screen in App.tsx) against the live API and reports:
// page errors, console errors, failed / 4xx / 5xx API calls (intended 403 "disabled feature" ignored), blank screens, and —
// one level deep — what each visible pressable does (navigates to unregistered route, crashes, errors).
// Usage: (cd mobile && npx expo export -p web) && [DIST=other/dist] node scripts/crawl-mobile.mjs [--only=Name,Name] [--owner=glow|hush] [--from=Name] [--no-click] [--max-clicks=N]
// Writes scripts/../crawl-report.json and prints a summary. Exit 1 if any Glow issue is found.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = process.env.DIST ? path.resolve(process.env.DIST) : path.join(root, 'mobile', 'dist');
const API = process.env.API_URL || 'http://localhost:8787';
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const MAXC = Number(args['max-clicks'] ?? 12);
const { chromium } = createRequire(path.join(root, 'admin', 'package.json'))('playwright');
const app = fs.readFileSync(path.join(root, 'mobile/App.tsx'), 'utf8');
const block = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));
const keysOf = b => b.replace(/^[^{]*\{/, '').replace(/\/\/.*/g, '').replace(/\([^)]*\)/g, '').split(',').map(x => x.split(':')[0].replace(/[{}]/g, '').trim()).filter(k => /^\w+$/.test(k) && !/^(Record|string|React|ComponentType|any|const|STACK)$/.test(k));
const GLOW_TABS = keysOf(block('const SOCIAL_TABS', ';')); const HUSH_TABS = keysOf(block('const CHAT_TABS', ';'));
const STACK = keysOf(block('const STACK', '\n};'));
const REGISTERED = new Set([...GLOW_TABS, ...HUSH_TABS, ...STACK, 'Main', 'ChatMain', 'Onboarding', 'SignIn']);
// Hush-owned screens (reported, not fixed by the Glow pass).
const HUSH = new Set([...HUSH_TABS, 'ChatRoom', 'NewChat', 'ShareToChat', 'ChatSearch', 'Starred', 'MyCode', 'StatusCompose', 'StatusView', 'CreateTown', 'TownRoom', 'ChangeHandle', 'ChatSecurity', 'LanguageRegion', 'BubbleMojiGallery', 'Accounts', 'Call', 'CallLog', 'SnapView', 'LiveCamera']);
// Params for screens that need an id (taken from routes.ts where present).
const routes = fs.readFileSync(path.join(root, 'mobile/src/navigation/routes.ts'), 'utf8');
const Q = {}; for (const m of routes.matchAll(/name: '(\w+)', folder: '[\w-]+', query: '([^']+)'/g)) Q[m[1]] ??= m[2];
Object.assign(Q, { Call: 'media=audio&autostart=false' });
let list = [...GLOW_TABS.map(n => ({ n, kind: 'glow-tab' })), ...HUSH_TABS.map(n => ({ n, kind: 'hush-tab' })), ...STACK.filter(n => !GLOW_TABS.includes(n)).map(n => ({ n, kind: 'stack' }))];
if (args.owner) list = list.filter(x => (HUSH.has(x.n) || /^Hush/.test(x.n) ? 'hush' : 'glow') === args.owner);
if (args.from) list = list.slice(Math.max(0, list.findIndex(x => x.n === args.from)));
if (args.only) { const o = String(args.only).split(','); list = list.filter(x => o.includes(x.n)); }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const PORT = Number(process.env.PORT ?? 0);   // 0 = any free port, so several crawls can run side by side
const server = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(dist) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
}).listen(PORT);
await new Promise(r => server.listening ? r() : server.once('listening', r));
const base = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
let ev = [];
const IGNORE = /favicon|Failed to load resource|Download the React DevTools|Warning: |shadow\*|pointerEvents|useNativeDriver|ResizeObserver|props.pointerEvents/;
page.on('console', m => { if (m.type() === 'error' && !IGNORE.test(m.text())) ev.push({ t: 'console', m: m.text().slice(0, 300) }); });
page.on('pageerror', e => ev.push({ t: 'pageerror', m: e.message.slice(0, 300) }));
page.on('requestfailed', r => { if (r.url().startsWith(API) && !/aborted/i.test(r.failure()?.errorText ?? '')) ev.push({ t: 'netfail', m: `${r.method()} ${r.url().slice(API.length)} ${r.failure()?.errorText}` }); });
page.on('response', async r => {
  if (!r.url().startsWith(API) || r.status() < 400) return;
  let body = ''; try { body = (await r.text()).slice(0, 160); } catch {}
  if (r.status() === 403 && /disabled|switched off|not enabled|turned off|feature/i.test(body)) return;   // intended
  // Business-rule refusals the UI surfaces as a toast (payments not set up by admin, Real Talk needs a purchase): logged as expected.
  if ((r.status() === 409 || r.status() === 403) && /Payments not configured|for people who bought/i.test(body)) { ev.push({ t: 'expected', m: `${r.status()} ${r.request().method()} ${r.url().slice(API.length).split('?')[0]} ${body}` }); return; }
  ev.push({ t: 'http', m: `${r.status()} ${r.request().method()} ${r.url().slice(API.length).split('?')[0]} ${body}` });
});

// Sign in through the real Sign-in screen (OTP demo code). Re-run whenever the shared API restarts / the session expires.
const waitApi = async () => { for (let i = 0; i < 60; i++) { try { if ((await fetch(API + '/health')).ok) return; } catch {} await new Promise(r => setTimeout(r, 1000)); } };
async function signIn(tries = 4) {
  try { await signInOnce(); } catch (e) { if (tries <= 1) throw e; await new Promise(r => setTimeout(r, 11000)); return signIn(tries - 1); }  // OTP resend is rate-limited (10 s)
}
async function signInOnce() {
  await waitApi();
  await page.goto(`${base}/?s=SignIn`, { waitUntil: 'networkidle' });
  await page.evaluate(api => { const k = 'vibeloop-session'; const s = JSON.parse(localStorage.getItem(k) || '{"state":{},"version":0}'); s.state.apiUrl = api; localStorage.setItem(k, JSON.stringify(s)); }, API);
  await page.goto(`${base}/?s=SignIn`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('@riya.makes').fill('@riya.makes');
  await page.getByRole('button', { name: 'Send login code' }).click();
  await page.getByText('Demo mode', { exact: false }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Use', exact: true }).click();
  await page.waitForTimeout(2500);
}
await signIn();
console.log('signed in against', API, '—', list.length, 'screens');

const visibleText = () => page.evaluate(() => (document.body.innerText || '').trim().length);
const open = async (s, again = true) => { await waitApi(); ev = []; await page.goto(`${base}/?s=${s.n}${Q[s.n] ? '&' + Q[s.n] : ''}`, { waitUntil: 'load' }).catch(() => {}); await page.waitForTimeout(1600);
  if (again && ev.some(e => /^401 |ERR_CONNECTION_REFUSED/.test(e.m))) { await signIn(); return open(s, false); } };
const SKIP = /sign out|log ?out|delete|remove|block|report|discard|unfollow|leave|end call|hang|clear|reset|wipe|deactivate|pay|send money|withdraw|request payout|publish|post it|share now|go live/i;
const report = [];
// Static pass: every navigate('X') / route: 'X' in app source must be a registered screen (prod builds swallow the runtime error).
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const unregTargets = [];
for (const f of [path.join(root, 'mobile/App.tsx'), ...walk(path.join(root, 'mobile/src')).filter(f => /\.tsx?$/.test(f))]) {
  const t = fs.readFileSync(f, 'utf8');
  for (const m of t.matchAll(/(?:navigation|nav|navRef|n)\.(?:navigate|replace|push)\(\s*'([A-Z]\w+)'|route: '(\w+)'|go\('([A-Z]\w+)'/g)) { const n = m[1] ?? m[2] ?? m[3]; if (!REGISTERED.has(n) && n !== 'Admin') unregTargets.push(`${n} in ${path.relative(root, f)}`); }
}
console.log(unregTargets.length ? `✗ unregistered navigation targets: ${[...new Set(unregTargets)].join(', ')}` : '✓ all static navigation targets are registered');
for (const s of list) {
  await open(s);
  const text = await visibleText();
  const r = { screen: s.n, kind: s.kind, owner: HUSH.has(s.n) || /^Hush/.test(s.n) ? 'hush' : 'glow', blank: text < 15, errors: [...ev], clicks: [] };
  if (!args['no-click']) {
    // Tag the visible pressables in DOM order; re-tagged after every reload so a label always maps to the same control.
    const tag = () => page.evaluate(() => [...document.querySelectorAll('[role=button],[role=link],a[href],[role=tab]')]
      .filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.top < 844 && b.bottom > 0 && getComputedStyle(e).visibility !== 'hidden'; })
      .map((e, i) => { e.setAttribute('data-crawl', String(i)); return { i, label: (e.getAttribute('aria-label') || e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40) }; }));
    const seen = new Set(); const todo = (await tag()).filter(l => l.label && !SKIP.test(l.label) && !seen.has(l.label) && seen.add(l.label)).slice(0, MAXC);
    for (const l of todo) {
      await open(s); const now = await tag(); const hit = now.find(x => x.label === l.label); if (!hit) continue;
      const beforeText = await page.evaluate(() => (document.body.innerText || '').trim()); ev = [];
      try { await page.locator(`[data-crawl="${hit.i}"]`).first().click({ timeout: 1500, noWaitAfter: true }); } catch { continue; }
      await page.waitForTimeout(900);
      const after = await page.evaluate(() => (document.body.innerText || '').trim());
      const unreg = ev.filter(e => /was not handled by any navigator|The action '.*' with payload/i.test(e.m));
      const exp = ev.filter(e => e.t === 'expected'); if (exp.length) (r.expected ??= []).push(...exp.map(e => `${l.label}: ${e.m}`)); ev = ev.filter(e => e.t !== 'expected');
      const c = { label: l.label, errors: ev.map(e => e.m), unregistered: unreg.length > 0, blankAfter: after.length < 15 };
      if (c.errors.length || c.blankAfter) r.clicks.push(c); else if (after === beforeText) (r.noops ??= []).push(l.label);  // informational: press changed nothing visible
    }
  }
  report.push(r);
  const n = r.errors.length + r.clicks.length + (r.blank ? 1 : 0);
  console.log(`${n ? '✗' : '✓'} [${r.owner}] ${s.n}${r.blank ? ' BLANK' : ''}${r.errors.length ? `\n   open: ${r.errors.map(e => e.m).slice(0, 4).join('\n         ')}` : ''}${r.clicks.map(c => `\n   click "${c.label}": ${c.blankAfter ? 'BLANK ' : ''}${c.errors.slice(0, 2).join(' | ')}`).join('')}`);
}
const REPORT = process.env.REPORT ? path.resolve(process.env.REPORT) : path.join(root, 'crawl-report.json');
fs.writeFileSync(REPORT, JSON.stringify({ unregTargets: [...new Set(unregTargets)], screens: report }, null, 1));
const issues = o => report.filter(r => r.owner === o && (r.blank || r.errors.length || r.clicks.length));
console.log(`\nGlow screens with issues: ${issues('glow').length} · Hush screens with issues: ${issues('hush').length} · report → ${path.relative(root, REPORT)}`);
await browser.close(); server.close(); process.exit(issues('glow').length ? 1 : 0);
