// Renders the VibeLoop app icon (original mark: two interlocking loops on the prism gradient) to PNGs.
import path from 'node:path'; import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const { chromium } = createRequire(path.join(root, 'admin/package.json'))('playwright');
const mark = (s) => `<g fill="none" stroke="#fff" stroke-width="${s * 0.085}" stroke-linecap="round"><circle cx="${s * 0.4}" cy="${s * 0.5}" r="${s * 0.19}"/><circle cx="${s * 0.6}" cy="${s * 0.5}" r="${s * 0.19}"/></g><circle cx="${s * 0.74}" cy="${s * 0.29}" r="${s * 0.05}" fill="#C8F45A"/>`;
const grad = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6C3BFF"/><stop offset=".6" stop-color="#FF3D9A"/><stop offset="1" stop-color="#FF8A3D"/></linearGradient></defs>`;
const files = {
  'icon.png': [1024, `${grad}<rect width="1024" height="1024" fill="url(#g)"/>${mark(1024)}`],
  'android-icon-foreground.png': [1024, `<g transform="translate(205 205) scale(.6)">${mark(1024)}</g>`],
  'android-icon-background.png': [1024, `${grad}<rect width="1024" height="1024" fill="url(#g)"/>`],
  'android-icon-monochrome.png': [1024, `<g transform="translate(205 205) scale(.6)">${mark(1024).replace('#C8F45A', '#fff')}</g>`],
  'splash-icon.png': [1024, `${grad}<rect x="112" y="112" width="800" height="800" rx="220" fill="url(#g)"/>${mark(1024)}`],
  'favicon.png': [196, `${grad}<rect width="196" height="196" rx="48" fill="url(#g)"/>${mark(196)}`],
};
const b = await chromium.launch({ channel: 'chrome' }); const pg = await b.newPage();
for (const [f, [s, body]] of Object.entries(files)) {
  await pg.setViewportSize({ width: s, height: s });
  await pg.setContent(`<html><body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${body}</svg></body></html>`);
  await pg.screenshot({ path: path.join(root, 'mobile/assets', f), omitBackground: true }); console.log('icon', f);
}
await b.close();
