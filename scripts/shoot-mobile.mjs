// Screenshots every mobile screen (Expo web build). Usage: (cd mobile && npx expo export -p web) && node scripts/shoot-mobile.mjs
// Saves screenshots/user/<NN-screen>/screen.png (phone viewport) and full.png (whole scrollable screen).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'mobile', 'dist');
const out = path.join(root, 'screenshots', 'user');
const { chromium } = createRequire(path.join(root, 'admin', 'package.json'))('playwright');
const src = fs.readFileSync(path.join(root, 'mobile/src/navigation/routes.ts'), 'utf8');
const SCREENS = [...src.matchAll(/name: '(\w+)', folder: '([\w-]+)'(?:, params: \{ id: '(\w+)' \})?/g)].map(m => ({ name: m[1], folder: m[2], id: m[3] }));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf' };
const PORT = 4175;
const server = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(dist) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(PORT);

const browser = await chromium.launch({ channel: 'chrome' });
const only = process.argv[2];
let failures = 0;
for (const s of SCREENS.filter(x => !only || x.name === only)) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  const dir = path.join(out, s.folder); fs.mkdirSync(dir, { recursive: true });
  await page.goto(`http://localhost:${PORT}/?s=${s.name}${s.id ? `&id=${s.id}` : ''}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(dir, 'screen.png') });
  const h = await page.evaluate(() => Math.max(...[...document.querySelectorAll('div')].filter(d => d.offsetParent !== null && getComputedStyle(d).overflowY !== 'visible' && d.getBoundingClientRect().left >= 0 && d.getBoundingClientRect().left < 50).map(d => d.scrollHeight), 844));
  await page.setViewportSize({ width: 390, height: Math.min(h, 6000) });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(dir, 'full.png') });
  if (errors.length) { failures++; console.log(`✗ ${s.folder}\n   ${errors.slice(0, 3).join('\n   ')}`); } else console.log(`✓ ${s.folder}`);
  await ctx.close();
}
await browser.close(); server.close();
process.exit(failures ? 1 : 0);
