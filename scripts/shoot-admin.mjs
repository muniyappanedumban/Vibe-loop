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
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(`[${page.url()}] ${m.text()}`); });
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
async function shot(hash, name) {
  await page.goto(`http://localhost:${PORT}/#/${hash}`, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' }); // hash-only goto doesn't remount; reload gives fresh state (session token survives)
  await settle();
  await snap(name);
}

// 00 — real login page
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.login');
await page.fill('#em', EMAIL);
await page.fill('#pw', PASSWORD);
await snap('login');
await page.click('.login-form button.btn');
await page.waitForSelector('.app', { timeout: 10000 });

for (const slug of SLUGS) await shot(slug, slug);
for (const sec of SETTINGS) await shot(`settings/${sec}`, `settings-${sec}`);
await shot('emoji', 'emoji');
await page.click('.mcell:nth-child(12)');
await page.waitForSelector('.mdetail');
await page.waitForTimeout(200);
await snap('emoji-detail');
await shot('features', 'features-prd');
await shot('features?tab=social', 'features-social');
await shot('search?q=riya', 'search');
await browser.close();
server.close();
if (errors.length) { console.error('Console errors:\n' + errors.join('\n')); process.exitCode = 1; } else console.log('No console errors.');
