// Screenshots every mobile screen into ONE folder: screenshots/user/<NN-name>.png (+ <NN-name>-full.png for long screens).
// Signs in through the real Sign-in screen against the live API (default http://localhost:8787) first.
// Usage: (cd mobile && npx expo export -p web) && node scripts/shoot-mobile.mjs [folderPrefix]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'mobile', 'dist'); const out = path.join(root, 'screenshots', 'user');
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
if (!only) { fs.rmSync(out, { recursive: true, force: true }); }
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage(); let errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push(e.message));
const base = `http://localhost:${PORT}`;
// sign in once through the UI (session token lives in this tab's sessionStorage)
await page.goto(`${base}/?s=SignIn`, { waitUntil: 'networkidle' });
await page.evaluate(api => { const k = 'vibeloop-session'; const s = JSON.parse(localStorage.getItem(k) || '{"state":{},"version":0}'); s.state.apiUrl = api; localStorage.setItem(k, JSON.stringify(s)); }, API);
await page.goto(`${base}/?s=SignIn`, { waitUntil: 'networkidle' });
await page.getByPlaceholder('you@example.com').fill('riya@vibeloop.app');
await page.getByPlaceholder('••••••••').fill('Vibeloop2026');
await page.getByRole('button', { name: 'Sign in' }).last().click();
await page.getByText('Good', { exact: false }).first().waitFor({ timeout: 15000 });
console.log('✓ signed in against', API);
let failures = 0;
for (const s of SCREENS.filter(x => !only || x.folder.startsWith(only))) {
  errors = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/?s=${s.name}${s.q ? '&' + s.q : ''}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(out, `${s.folder}.png`) });
  const h = await page.evaluate(() => Math.max(...[...document.querySelectorAll('div')].filter(d => d.offsetParent !== null && getComputedStyle(d).overflowY !== 'visible' && d.getBoundingClientRect().left >= 0 && d.getBoundingClientRect().left < 50).map(d => d.scrollHeight), 844));
  if (h > 900) { await page.setViewportSize({ width: 390, height: Math.min(h, 6000) }); await page.waitForTimeout(400); await page.screenshot({ path: path.join(out, `${s.folder}-full.png`) }); }
  const real = errors.filter(e => !/favicon/.test(e));
  if (real.length) { failures++; console.log(`✗ ${s.folder}\n   ${real.slice(0, 3).join('\n   ')}`); } else console.log(`✓ ${s.folder}`);
}
await browser.close(); server.close(); process.exit(failures ? 1 : 0);
