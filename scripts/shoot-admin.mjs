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

// Every page in the admin nav (read from App.tsx PAGES) so new pages are never missed.
const PAGES_SRC = fs.readFileSync(path.join(root, 'admin/src/App.tsx'), 'utf8').split('export const PAGES = [')[1].split('] as const')[0];
const SLUGS = [...PAGES_SRC.matchAll(/\['([a-z0-9-]+)', '([^']+)'\]/g)].map(m => m[1]);
const LABELS = Object.fromEntries([...PAGES_SRC.matchAll(/\['([a-z0-9-]+)', '([^']+)'\]/g)].map(m => [m[1], m[2].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')]));
const NAMES = { dashboard: 'mission-control', users: 'members', moderation: 'mod-queue', payouts: 'cashouts', health: 'vitals', costs: 'burn-rate', flags: 'switchboard', audit: 'paper-trail', privacy: 'privacy-desk', abuse: 'spam-shield', revenue: 'revenue-pulse', announcements: 'megaphone', roles: 'role-matrix' };
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

for (const slug of SLUGS) {
  await shot(slug, NAMES[slug] ?? LABELS[slug] ?? slug);
  if (slug === 'users') { // member detail drawer (avatar/initials, last seen, profile fields)
    await go('users?open=usr_riya'); await page.waitForSelector('.drawer .mhead'); await page.waitForTimeout(200); await snap('members-drawer');
  }
}
// ---- App control (sidebar order) ----
await shot('navigation', 'nav-builder-base');
// Module names card: rename Chat in the draft (not saved) so the D-Switch preview shows it
await go('navigation');
await page.fill('[aria-label="Chat module name"]', 'Whisper');
await page.waitForTimeout(150);
await page.locator('.modnames').screenshot({ path: file('nav-builder-module-names') });
console.log('saved nav-builder-module-names');
await shot('navigation?layer=country:US', 'nav-builder-country-US');
// server-side validation: switch every Social tab off, save, capture the rejection (nothing is stored)
await go('navigation');
for (const k of ['Home', 'Explore', 'Create', 'Motion', 'Profile']) await page.click(`[data-nav="social-${k}"] .tg`);
expect400 = true;
await page.click('.layerbar .btn.prism');
await page.waitForSelector('.layerbar .errbox');
await page.waitForTimeout(200);
await snap('nav-builder-validation-error');
expect400 = false;
await shot('themes', 'theme-studio-base');
await shot('themes?layer=country:US', 'theme-studio-country-US');
// low-contrast ink on the Chat theme, save, capture the 422 (nothing is stored)
await go('themes');
await page.fill('[data-hex="chat-ink"]', '#D8E4E2');
expect400 = true;
await page.click('.layerbar .btn.prism');
await page.waitForSelector('.layerbar .errbox');
await page.waitForTimeout(200);
await snap('theme-studio-validation-error');
expect400 = false;
await shot('userapp', 'user-app-settings-glow');
await go('userapp'); await page.click('.tabs button:has-text("Hush")'); await page.waitForTimeout(200); await snap('user-app-settings-hush');
await page.click('.tabs button:has-text("Global")'); await page.waitForTimeout(200); await snap('user-app-settings-global');
await shot('userapp?layer=country:US', 'user-app-settings-country-US');
await shot('switches', 'all-switches');
await shot('screens', 'screen-switches-base');
await shot('screens?layer=country:US', 'screen-switches-country-US');
await shot('limits', 'feature-dials-base');
await shot('limits?layer=slab:pro', 'feature-dials-slab-pro');
await shot('zones', 'zones');
await shot('slabs', 'tiers');
await shot('languages?lang=ta', 'lingo-strings-ta');
await shot('preview?country=IN&lang=ta', 'preview-room-IN-ta');
await shot('preview?country=US&lang=en', 'preview-room-US-en');
// ---- Identity & chat ----
await shot('otp', 'login-watch');
await shot('identity', 'id-desk');
await shot('chat', 'hush-hoods');
// ---- Live & reach ----
await shot('realtime', 'realtime-monitor');
await shot('calls', 'call-log');
await shot('push', 'push-center');
await shot('e2ee', 'e2ee-keys');
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
await page.locator('.card:has-text("TURN (calls)")').first().scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
await snap('plugs-turn-expo');
// switch money back OFF through the UI
await go('money');
await page.click('[aria-label="Money master switch"]');
await page.click('.savebar .btn.prism');
await page.waitForSelector('.savebar:not(.dirty)');
await settle();
await snap('money-master-off-again');
// ---- Brand & community ----
async function shotAt(hash, name, sel) { await go(hash); await page.locator(sel).first().scrollIntoViewIfNeeded(); await page.waitForTimeout(250); await snap(name); }
await shot('promos', 'promos-list');
await shotAt('promos?edit=promo_kovai', 'promo-editor-targeting', '.peditor');
await go('promos?edit=promo_kovai'); await page.locator('.peditor .ptarget').scrollIntoViewIfNeeded(); await page.waitForTimeout(250); await page.screenshot({ path: file('promo-editor-full'), fullPage: true }); console.log('saved full-page promo editor');
await shotAt('promos?pc=IN&ps=TN', 'promo-preview-IN-TN', '.card:has-text("Preview as")');
await shotAt('promos?pc=US&ps=', 'promo-preview-US', '.card:has-text("Preview as")');
await shot('uploads', 'uploads');
// Interactive demo steps change data; on re-runs a button may already be disabled (state already applied) — skip it then.
async function tryClick(sel) {
  const l = page.locator(sel).first();
  if (!(await l.count()) || !(await l.isEnabled())) { console.log('  (skip, already applied)', sel); return; }
  await l.click();
}
// ---- Content & trust ----
await shot('pages', 'page-studio-list');
await shotAt('pages?edit=help-hub', 'page-studio-editor-faq-help-hub', '.pgeditor');
await shotAt('pages?edit=get-the-apps', 'page-studio-editor-links-get-the-apps', '.pgeditor');
await shotAt('pages?edit=house-rules', 'page-studio-editor-house-rules', '.pgeditor');
// edit House Rules through the UI → a new version appears in the history
await page.fill('[aria-label="summary"]', `Terms of use — the deal for using VibeLoop (rev ${Date.now() % 100000}).`);  // unique so Save is enabled on re-runs
await page.fill('[aria-label="change note"]', 'Tightened the summary');
await tryClick('.pgeditor .btn.prism');
await page.waitForSelector('.vhist td:has-text("Tightened the summary")');
await page.locator('.vhist').scrollIntoViewIfNeeded(); await page.waitForTimeout(250);
await snap('page-studio-version-history');
await shot('blog', 'loopdown-fresh-wire-list');
await shotAt('blog?edit=loopdown-loops-101', 'loopdown-editor-preview', '.pgeditor');
await shot('reviews', 'reviews-desk');
if (await page.locator('tr:has-text("Super responsive") button:has-text("Hide")').count()) await tryClick('tr:has-text("Super responsive") button:has-text("Hide")');  // already hidden on re-runs
await page.waitForSelector('tr.dim:has-text("Super responsive")');
await page.waitForTimeout(200);
await snap('reviews-desk-hidden-vouch');
await shot('speakup', 'speak-up-desk-queue');
await shot('speakup?open=su_demo_urgent', 'speak-up-desk-urgent-ticket-detail');
await tryClick('.sudetail button:has-text("Reviewing")');
await page.waitForSelector('.sudetail .suhist li:has-text("real human")');
await page.waitForTimeout(250);
await snap('speak-up-desk-urgent-reviewing');
// ---- Platform ----
for (const sec of SETTINGS) await shot(`settings/${sec}`, `control-room-${sec}`);
await shot('emoji', 'vibemoji-vault');
await tryClick('.mcell:nth-child(12)');
await page.waitForSelector('.mdetail');
await page.waitForTimeout(200);
await snap('vibemoji-vault-detail');
await shot('features', 'whats-in-prd');
await shot('features?tab=social', 'whats-in-social');
await shot('search?q=riya', 'seek-riya');
await shot('search?q=ta', 'seek-ta');
await shot('search?q=payout', 'seek-config-key');
await shot('search?q=ocean', 'seek-theme-preset');
await shot('search?q=backstage', 'seek-plans');
await shot('search?q=demo', 'seek-stash-boosts');
await shot('search?q=razorpay', 'seek-plugs');
await shot('search?q=push', 'seek-live-reach');
await shot('search?q=kovai', 'seek-promos');
await shot('search?q=sos', 'seek-pages');
await shot('search?q=harassment', 'seek-speakup-reviews');
await shot('learn', 'level-up');
await page.locator('.card:has-text("Run a brand promo for one state")').scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
await snap('level-up-brand-promo');
await page.locator('.card:has-text("Handle an urgent report")').scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
await snap('level-up-content-trust');
await page.locator('.card:has-text("Turn on calls with your TURN server")').scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
await snap('level-up-calls-push');
await browser.close();
server.close();
if (errors.length) { console.error('Console errors:\n' + errors.join('\n')); process.exitCode = 1; } else console.log('No console errors.');
