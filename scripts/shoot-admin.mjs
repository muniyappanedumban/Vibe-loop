// Screenshots every admin page. Usage: node scripts/shoot-admin.mjs (after `npm run build` in admin/)
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
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const PORT = 4174;

if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('admin/dist missing — run npm run build in admin/'); process.exit(1); }
const server = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(dist) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(PORT);

const browser = await chromium.launch({ channel: 'chrome' });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(`[${page.url()}] ${m.text()}`); });
page.on('pageerror', e => errors.push(`[${page.url()}] ${e.message}`));

for (const [i, slug] of SLUGS.entries()) {
  const dir = path.join(out, `${String(i + 1).padStart(2, '0')}-${slug}`);
  fs.mkdirSync(dir, { recursive: true });
  await page.goto(`http://localhost:${PORT}/#/${slug}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.content');
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'screen.png') });
  console.log('saved', path.relative(root, path.join(dir, 'screen.png')));
}
await browser.close();
server.close();
if (errors.length) { console.error('Console errors:\n' + errors.join('\n')); process.exitCode = 1; } else console.log('No console errors.');
