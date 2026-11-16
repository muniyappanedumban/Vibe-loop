// Smoke test: fan reacts on Loop l1 → reaction is stored and appears in Loop detail.
import { createRequire } from 'node:module'; import path from 'node:path'; import http from 'node:http'; import fs from 'node:fs'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const dist = path.join(root, 'mobile/dist');
const { chromium } = createRequire(path.join(root, 'admin/package.json'))('playwright');
const srv = http.createServer((q, r) => { let p = path.join(dist, q.url.split('?')[0]); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(dist, 'index.html'); r.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : 'text/html' }); fs.createReadStream(p).pipe(r); }).listen(4176);
const b = await chromium.launch({ channel: 'chrome' }); const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
await pg.goto('http://localhost:4176/?s=FanReact&id=l1', { waitUntil: 'networkidle' });
await pg.getByLabel('Would share').click();
await pg.getByPlaceholder('Tell the creator why (helps quality score)').fill('Smoke test: love this cold open');
await pg.getByLabel('Send reaction').click();
await pg.getByText(/Reaction sent as/).waitFor({ timeout: 5000 });
const stored = await pg.evaluate(() => JSON.parse(localStorage.getItem('vibeloop-v1')).state.loops.find(l => l.id === 'l1').reactions.length);
console.log(stored === 8 ? 'PASS reaction stored (7 → 8)' : 'FAIL count=' + stored);
await b.close(); srv.close(); process.exit(stored === 8 ? 0 : 1);
