// Screenshots every admin page against the live backend (default http://localhost:8787, baked in at build time via VITE_API_URL).
// Usage: node scripts/shoot-admin.mjs (after `npm run build` in admin/). Logs in through the real login page first.
// All PNGs land flat in screenshots/admin/<NN>-<name>.png
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'admin', 'dist');
const out = path.join(root, 'screenshots', 'admin');
// playwright is a devDependency of admin/, resolve it from there
const { chromium } = createRequire(path.join(root, 'admin', 'package.json'))('playwright');

const SLUGS = ['dashboard', 'users', 'moderation', 'payouts', 'health', 'costs', 'flags', 'audit', 'privacy', 'abuse', 'revenue', 'announcements', 'roles'];
const SETTINGS = ['general', 'security', 'moderation', 'monetisation', 'notifications', 'content', 'privacy', 'integrations', 'branding', 'admins'];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const PORT = 4174;

if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('admin/dist missing — run npm run build in admin/'); process.exit(1); }
const server = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(dist) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(PORT);

const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@vibeloop.app';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'Vibeloop2026';
fs.rmSync(out, { recursive: true, force: true }); // one flat folder, fresh every run
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
const errors = [];
let expect400 = false; // the validation shots deliberately trigger a 400 / 422
page.on('console', m => { if (m.type() === 'error' && !(expect400 && /40[0]|422/.test(m.text()))) errors.push(`[${page.url()}] ${m.text()}`); });
page.on('pageerror', e => errors.push(`[${page.url()}] ${e.message}`));

let n = 0;
const file = name => path.join(out, `${String(n++).padStart(2, '0')}-${name}.png`);
async function snap(name) {
  const f = file(name);
  await page.screenshot({ path: f });
  console.log('saved', path.relative(root, f));
}
async function settle() {
  await page.waitForSelector('.content');
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);
}
async function go(hash) {
  await page.goto(`http://localhost:${PORT}/#/${hash}`, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' }); // hash-only goto doesn't remount; reload gives fresh state (session token survives)
  await settle();
}
async function shot(hash, name) { await go(hash); await snap(name); }

// 00 — real login page
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.login');
await page.fill('#em', EMAIL);
await page.fill('#pw', PASSWORD);
await snap('login');
await page.click('.login-form button.btn');
await page.waitForSelector('.app', { timeout: 10000 });

for (const slug of SLUGS) await shot(slug, slug);
// ---- App control (sidebar order) ----
await shot('navigation', 'navigation-base');
await shot('navigation?layer=country:US', 'navigation-country-US');
// server-side validation: switch every Social tab off, save, capture the rejection (nothing is stored)
await go('navigation');
for (const k of ['Home', 'Explore', 'Create', 'Motion', 'Profile']) await page.click(`[data-nav="social-${k}"] .tg`);
expect400 = true;
await page.click('.layerbar .btn.prism');
await page.waitForSelector('.layerbar .errbox');
await page.waitForTimeout(200);
await snap('navigation-validation-error');
expect400 = false;
await shot('themes', 'themes-base');
await shot('themes?layer=country:US', 'themes-country-US');
// low-contrast ink on the Chat theme, save, capture the 422 (nothing is stored)
await go('themes');
await page.fill('[data-hex="chat-ink"]', '#D8E4E2');
expect400 = true;
await page.click('.layerbar .btn.prism');
await page.waitForSelector('.layerbar .errbox');
await page.waitForTimeout(200);
await snap('themes-validation-error');
expect400 = false;
await shot('screens', 'screens-base');
await shot('screens?layer=country:US', 'screens-country-US');
await shot('limits', 'features-limits-base');
await shot('limits?layer=slab:pro', 'features-limits-slab-pro');
await shot('zones', 'zones');
await shot('slabs', 'slabs');
await shot('languages?lang=ta', 'languages-strings-ta');
await shot('preview?country=IN&lang=ta', 'preview-IN-ta');
await shot('preview?country=US&lang=en', 'preview-US-en');
// ---- Identity & chat ----
await shot('otp', 'otp-login');
await shot('identity', 'identity');
await shot('chat', 'chat-towns');
// ---- Money & growth (seed: every money switch OFF, no Plugs connected) ----
await shot('cashflow', 'cashflow-empty');
await shot('money', 'money-switches-off');
for (const l of ['Money master switch', 'Backstage Pass', 'Stash', 'Props', 'Boosts', 'Platform fee']) await page.click(`[aria-label="${l}"]`);
await page.click('.savebar .btn.prism');
await page.waitForSelector('.savebar:not(.dirty)');
await settle();
await snap('money-switches-on');
await shot('cashflow', 'cashflow-money-on');
await shot('plans', 'backstage-pass-plans');
await shot('countries', 'country-pricing');
await shot('boosts', 'boosts-ads-slabs');
await shot('stash', 'stash-moderation');
await shot('plugs', 'plugs');
await page.click('.card:has-text("Razorpay") button:has-text("Test connection")');
await page.waitForSelector('[data-test-result]');
await page.waitForTimeout(200);
await snap('plugs-test-not-configured');
// switch money back OFF through the UI
await go('money');
await page.click('[aria-label="Money master switch"]');
await page.click('.savebar .btn.prism');
await page.waitForSelector('.savebar:not(.dirty)');
await settle();
await snap('money-master-off-again');
// ---- Platform ----
for (const sec of SETTINGS) await shot(`settings/${sec}`, `settings-${sec}`);
await shot('emoji', 'emoji');
await page.click('.mcell:nth-child(12)');
await page.waitForSelector('.mdetail');
await page.waitForTimeout(200);
await snap('emoji-detail');
await shot('features', 'features-prd');
await shot('features?tab=social', 'features-social');
await shot('search?q=riya', 'search-riya');
await shot('search?q=ta', 'search-ta');
await shot('search?q=payout', 'search-config-key');
await shot('search?q=ocean', 'search-theme-preset');
await shot('search?q=backstage', 'search-plans');
await shot('search?q=demo', 'search-stash-boosts');
await shot('search?q=razorpay', 'search-plugs');
await shot('learn', 'learn');
await browser.close();
server.close();
if (errors.length) { console.error('Console errors:\n' + errors.join('\n')); process.exitCode = 1; } else console.log('No console errors.');
