// Builds two PDF booklets from HTML with Playwright (Chrome):
//   docs/booklets/VibeLoop-User-Guide.pdf   (end users)
//   docs/booklets/VibeLoop-Admin-Guide.pdf  (staff)
// Usage: node scripts/make-booklets.mjs      (re-runnable; screenshots are read from screenshots/*)
// Screenshots are downscaled + converted to JPEG in the browser canvas (no extra deps) and embedded as data URLs.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(root, 'admin', 'package.json'))('playwright');
const outDir = path.join(root, 'docs', 'booklets');
fs.mkdirSync(outDir, { recursive: true });
const SHOTS = path.join(root, 'screenshots');
const TODAY = new Date().toISOString().slice(0, 10);

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// tiny inline markup: **bold**, `code`
const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');

/* ============================== image pipeline ============================== */
let imgPage;
const imgCache = new Map();
async function img(rel, maxW) {
  const key = rel + '@' + maxW;
  if (imgCache.has(key)) return imgCache.get(key);
  const f = path.join(SHOTS, rel);
  if (!fs.existsSync(f)) { console.warn('  missing screenshot', rel); imgCache.set(key, null); return null; }
  const b64 = fs.readFileSync(f).toString('base64');
  const url = await imgPage.evaluate(async ({ b64, maxW }) => {
    const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
    const s = Math.min(1, maxW / im.naturalWidth);
    const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  }, { b64, maxW });
  imgCache.set(key, url);
  return url;
}
const phone = async rel => { const u = await img(rel, 560); return u ? `<div class="phone"><img src="${u}"></div>` : `<div class="phone missing">Screenshot not available</div>`; };
const desk = async rel => { const u = await img(rel, 1500); return u ? `<div class="desk"><div class="bar"><i></i><i></i><i></i></div><img src="${u}"></div>` : ''; };

/* ============================== shared styles ============================== */
const CSS = (accent, accent2) => `
@page { size: A4; margin: 18mm 16mm 18mm 16mm; }
@page :first { margin: 0; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: "Inter", "Helvetica Neue", Arial, sans-serif; color: #15131f; font-size: 10.2pt; line-height: 1.5; background: #fff; }
h1, h2, h3 { font-family: "Inter", "Helvetica Neue", Arial, sans-serif; letter-spacing: -0.02em; line-height: 1.15; }
h2 { font-size: 17pt; margin: 0 0 4mm; }
h3 { font-size: 12pt; margin: 5mm 0 2mm; color: ${accent}; }
p { margin: 0 0 2.5mm; }
ul { margin: 0 0 3mm; padding-left: 5mm; } li { margin-bottom: 1mm; }
code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 8.6pt; background: #f1effa; padding: 0 1.2mm; border-radius: 1mm; color: #3b2fb0; }
b { font-weight: 650; }
.cover { height: 297mm; width: 210mm; padding: 26mm 22mm; color: #fff; position: relative; overflow: hidden;
  background: radial-gradient(circle at 85% 15%, ${accent2} 0, transparent 45%), radial-gradient(circle at 10% 90%, #ff3d9a55 0, transparent 40%), linear-gradient(160deg, #120f24, ${accent} 140%); page-break-after: always; }
.cover .brand { font-size: 14pt; font-weight: 700; letter-spacing: .02em; display: flex; align-items: center; gap: 3mm; }
.cover .brand i { width: 9mm; height: 9mm; border-radius: 2.6mm; background: ${accent2}; display: inline-block; }
.cover h1 { font-size: 46pt; margin: 62mm 0 4mm; font-weight: 800; }
.cover .sub { font-size: 15pt; opacity: .85; max-width: 140mm; }
.cover .by { position: absolute; left: 22mm; bottom: 26mm; font-size: 11pt; opacity: .85; }
.cover .by b { display: block; font-size: 15pt; opacity: 1; color: ${accent2}; }
.cover .tag { display: inline-block; margin-top: 10mm; padding: 1.5mm 4mm; border-radius: 10mm; border: .3mm solid #ffffff66; font-size: 9pt; }
.toc { page-break-after: always; }
.toc h2 { font-size: 24pt; margin-bottom: 8mm; }
.toc ol { list-style: none; padding: 0; counter-reset: c; }
.toc li { counter-increment: c; display: flex; gap: 4mm; padding: 2.6mm 0; border-bottom: .2mm solid #e7e4f2; font-size: 11.5pt; }
.toc li::before { content: counter(c, decimal-leading-zero); color: ${accent}; font-weight: 700; width: 9mm; }
.toc li small { margin-left: auto; color: #77738a; font-size: 9pt; align-self: center; text-align: right; max-width: 85mm; }
.divider { page-break-before: always; page-break-after: always; height: 255mm; display: flex; flex-direction: column; justify-content: flex-end; padding: 0 0 20mm;
  background: linear-gradient(180deg, #fff 0, #fff 40%, #f4f2fd 100%); border-left: 2.5mm solid ${accent}; padding-left: 10mm; }
.divider .n { font-size: 80pt; font-weight: 800; color: ${accent}; line-height: 1; opacity: .9; }
.divider h2 { font-size: 30pt; margin: 2mm 0 3mm; }
.divider p { font-size: 12pt; color: #4e4a63; max-width: 140mm; }
.sec { page-break-before: always; }
.screen { display: grid; grid-template-columns: 62mm 1fr; gap: 9mm; page-break-inside: avoid; break-inside: avoid; margin-bottom: 9mm; padding-bottom: 7mm; border-bottom: .2mm solid #ece9f6; }
.screen:last-child { border-bottom: 0; }
.phone { width: 62mm; border-radius: 7mm; padding: 2.2mm; background: #15131f; box-shadow: 0 2mm 6mm #15131f33; }
.phone img { width: 100%; display: block; border-radius: 5mm; }
.phone.missing { height: 100mm; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 9pt; }
.screen h3 { margin-top: 0; font-size: 14pt; color: #15131f; }
.screen .where { font-size: 8.6pt; color: #77738a; margin-bottom: 3mm; text-transform: uppercase; letter-spacing: .06em; }
.lbl { font-size: 8pt; font-weight: 700; color: ${accent}; letter-spacing: .08em; text-transform: uppercase; margin: 3mm 0 1mm; }
.note { border-left: 1mm solid #f5a524; background: #fff8eb; padding: 2.5mm 3.5mm; border-radius: 0 2mm 2mm 0; font-size: 9.2pt; margin: 3mm 0; }
.note.soon::before { content: "Coming soon / needs setup — "; font-weight: 700; color: #b26b00; }
.note.info { border-color: ${accent}; background: #f4f2fd; }
.note.warn { border-color: #e5484d; background: #fff0f0; }
.note.warn::before { content: "TEST ONLY — "; font-weight: 700; color: #c4262c; }
.desk { border-radius: 2.5mm; overflow: hidden; border: .3mm solid #ddd9ea; box-shadow: 0 1.5mm 5mm #15131f22; margin: 2mm 0 4mm; }
.desk .bar { height: 4.5mm; background: #ece9f6; display: flex; gap: 1.2mm; align-items: center; padding-left: 2.5mm; }
.desk .bar i { width: 1.8mm; height: 1.8mm; border-radius: 50%; background: #c9c3dd; }
.desk img { width: 100%; display: block; }
.apage { page-break-inside: avoid; break-inside: avoid; margin-bottom: 8mm; }
.apage h3 { font-size: 14pt; color: #15131f; margin: 0 0 1mm; }
.apage .where { font-size: 8.6pt; color: #77738a; margin-bottom: 1mm; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
table { width: 100%; border-collapse: collapse; margin: 2mm 0 5mm; font-size: 8.8pt; }
th { text-align: left; background: #15131f; color: #fff; padding: 1.8mm 2.4mm; font-weight: 600; }
td { padding: 1.6mm 2.4mm; border-bottom: .2mm solid #e7e4f2; vertical-align: top; }
tr { page-break-inside: avoid; }
tr:nth-child(even) td { background: #faf9fe; }
.on { color: #0a7f4f; font-weight: 700; } .off { color: #c4262c; font-weight: 700; }
.pill { display: inline-block; padding: .3mm 2mm; border-radius: 3mm; background: #f1effa; color: #3b2fb0; font-size: 8pt; margin: 0 1mm 1mm 0; }
.layers { display: flex; gap: 2mm; align-items: center; margin: 3mm 0 5mm; flex-wrap: wrap; }
.layers span { background: ${accent}; color: #fff; padding: 2.5mm 4mm; border-radius: 2mm; font-weight: 650; font-size: 9.5pt; }
.layers em { color: #77738a; font-style: normal; }
.steps { counter-reset: s; list-style: none; padding: 0; }
.steps li { counter-increment: s; padding-left: 9mm; position: relative; margin-bottom: 2.5mm; }
.steps li::before { content: counter(s); position: absolute; left: 0; top: 0; width: 6mm; height: 6mm; border-radius: 50%; background: ${accent}; color: #fff; font-size: 8.5pt; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.faq b { display: block; margin-top: 3mm; }
`;
const headerFooter = title => ({
  displayHeaderFooter: true,
  headerTemplate: `<div style="font-size:7.5px;width:100%;padding:0 16mm;color:#8a86a0;font-family:Helvetica,Arial;display:flex;justify-content:space-between"><span>VibeLoop · ${title}</span><span>A product of Dendo</span></div>`,
  footerTemplate: `<div style="font-size:7.5px;width:100%;padding:0 16mm;color:#8a86a0;font-family:Helvetica,Arial;display:flex;justify-content:space-between"><span>Generated ${TODAY}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
});
const cover = (title, sub, tag) => `<section class="cover"><div class="brand"><i></i>VibeLoop</div><h1>${title}</h1><div class="sub">${sub}</div><div class="tag">${tag}</div>
  <div class="by">A product of<b>Dendo</b></div></section>`;
const toc = items => `<section class="toc"><h2>Contents</h2><ol>${items.map(([t, s]) => `<li>${esc(t)}<small>${esc(s || '')}</small></li>`).join('')}</ol></section>`;
const divider = (n, t, s) => `<section class="divider"><div class="n">${String(n).padStart(2, '0')}</div><h2>${esc(t)}</h2><p>${esc(s)}</p></section>`;
const ul = xs => `<ul>${xs.map(x => `<li>${md(x)}</li>`).join('')}</ul>`;
const tbl = (head, rows) => `<table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const note = (t, kind = 'soon') => `<div class="note ${kind}">${md(t)}</div>`;

/** A two-column screen page: phone-framed screenshot left, what/how right. */
async function screen(s) {
  return `<div class="screen">${await phone(s.img)}<div><h3>${esc(s.t)}</h3><div class="where">${esc(s.where || '')}</div>
    <div class="lbl">What it is</div><p>${md(s.what)}</p>
    ${s.how ? `<div class="lbl">How to use it</div>${ul(s.how)}` : ''}
    ${(s.soon || []).map(x => note(x)).join('')}${(s.info || []).map(x => note(x, 'info')).join('')}</div></div>`;
}

/* ============================== USER GUIDE content ============================== */
const G = 'vibeloop/', H = 'chat/';
const GLOW = [
  { img: G + '03-home-command-centre.png', t: 'Hub (home feed)', where: 'Glow · tab 1 — Hub', what: 'Your home feed. At the top: the Glow ⇄ Hush switch (D-Switch) with unread badges, a "From VibeLoop" promo card, the Blinks (stories) row and feed tabs **For You · Circle · Trending · Fresh**. Below: a daily question card and Drops from people you follow.', how: ['Tap a Blink circle to watch stories; tap **Your Blink** (+) to post one.', 'Switch feed tabs to change what you see.', 'Double-tap a Drop to love it (D-Love); long-press for the full emoji reaction set.', 'The floating chat bubble opens Hush without leaving Glow.'] },
  { img: G + '20-explore-feed.png', t: 'Drift (explore)', where: 'Glow · tab 2 — Drift', what: 'Discover creators, places and vibes. A search bar ("Seek people, Drops, #tags, Hoods…"), #tag chips and a grid of photos and videos (videos show a play icon).', how: ['Tap a #tag chip to filter.', 'Tap any tile to open the Drop or Flick.', 'Search opens **Seek** (see below).'] },
  { img: G + '23-create-studio-post.png', t: 'Make (create)', where: 'Glow · tab 3 — Make', what: 'Post something new. Three modes: **Drop** (photo, video, carousel), **Thought** (text) and **Blink** (a story that fades). Pick media from the gallery or camera, add a caption, #tags and @mentions, a place tag, a collab partner and a sound tag, then pick the audience: Public, Circle only or Quiet share.', how: ['Choose Drop, Thought or Blink at the top.', 'Apply one of the Vibe Lenses (colour / frame overlays) or Auto Edit for video (trim, speed, timed captions).', 'Optional: "Also send to a chat" shares it into Hush right after posting (Post2Chat).', 'Post / video length limits are set by staff (default 60 s video).'], soon: ['Live face-tracking AR lenses are not built. Lenses are overlays saved with your post.'] },
  { img: G + '23b-create-quick-story.png', t: 'Blinks (stories)', where: 'Make → Blink', what: 'A Blink is a short story that disappears after a timer of **1, 6, 12 or 24 hours** (staff can cap the longest timer).', how: ['Pick Blink, choose media or text, set the timer and post.', 'You can see who viewed your Blink, and viewers can reply — replies arrive as a private Hush message.'] },
  { img: G + '22-sparks-stories.png', t: 'Watching Blinks', where: 'Hub → Blink row', what: 'Full-screen story viewer with progress bars at the top. Some Blinks carry a quick poll (e.g. "Dosa or idli?").', how: ['Tap right/left to move between Blinks, × to close.', 'Reply from the bottom to send a private message.'] },
  { img: G + '21-motion-reels.png', t: 'Flicks (short videos)', where: 'Glow · tab 4 — Flicks', what: 'A vertical feed of short videos (up to 60 seconds by default).', how: ['Swipe up for the next Flick.', 'Tap the heart to react; share into a Hush chat with Reel2Talk.'] },
  { img: G + '15-profile.png', t: 'Me (your Glow profile)', where: 'Glow · tab 5 — Me', what: 'Your profile: cover, photo, name, @ID, role badge, counts (Drops, Saved, Following), bio, links and your shop link if you sell. Your Drops grid includes up to **3 pinned** posts (Pin 3).', how: ['Tap the search / settings icons at the top-right.', 'Use Edit profile to change photos, bio, links and pronouns.'] },
  { img: G + '15b-edit-profile-two-faces.png', t: 'Edit profile — Two Faces', where: 'Me → Edit profile', what: 'Set a cover, a **Glow photo** and a separate **Hush photo**. Friends in Hush see your Hush photo and bio; everyone in Glow sees the Glow ones.', how: ['Tap each photo circle to pick a new image.', 'Edit display name, bio, pronouns and up to 3 links, then save.'] },
  { img: G + '20b-comments.png', t: 'Comments', where: 'Any Drop → comment icon', what: 'Comment thread under a Drop. "Comment Guard" hides comments with blocked words.', how: ['Type and tap **Post**. Like a comment with the heart.', 'You can delete your own comments; the post owner can delete any comment on their post.'] },
  { img: G + '27-search.png', t: 'Seek (search)', where: 'Drift → search', what: 'Search across Glow posts, people, Hoods and your Hush messages from one box.', how: ['Type a word; results are grouped (Posts, Hoods, messages in Hush).'] },
  { img: G + '18-notifications.png', t: 'Pings (notifications)', where: 'Heart icon on Hub', what: 'All your alerts in one list, filterable by **All · Unread · Reaction · Approval · Earning · System**.', how: ['Tap a Ping to jump to the thing it is about.', 'Tap **Mark all read** to clear the badge.'] },
  { img: G + '15c-love-trail.png', t: 'Love Trail', where: 'Me → Love Trail', what: 'Everything you reacted to, newest first. Private to you.' },
  { img: G + '15d-save-stack.png', t: 'Save Stack', where: 'Me → Save Stack', what: 'Your own collections of saved Drops (for example "Food spots").', how: ['Type a stack name and tap **Create**, then save Drops into it.'] },
  { img: G + '24-my-vault.png', t: 'Keepers', where: 'Me → Keepers', what: 'Drops you saved for later.', how: ['Tap an item to remove it.'] },
  { img: G + '15e-mood-drop.png', t: 'Mood Drop', where: 'Me → Mood Drop', what: 'Show today\'s vibe as one emoji (plus optional text). It appears on your profile and on friends lists for 24 hours.' },
  { img: G + '24e-follow-knocks.png', t: 'Follow Knocks', where: 'Me → Follow Knocks', what: 'If your Glow profile is private, people must "knock" (request) to follow. Approve or decline here; sent requests are listed too.' },
  { img: G + '62-creator-profile-vouches.png', t: 'Creator profile & Vouches', where: 'Tap any creator', what: 'Another person\'s profile: bio, location, follow, Message (opens Hush), Send Props, their Stash, Report. **Vouches** are star reviews from people who actually worked with them (friends, a collab Drop, or a purchase).' },
  { img: G + '29-live.png', t: 'Live Lane', where: 'Creator Studio → Live Lane', what: 'Planned home for broadcasts, audio rooms and countdowns.', soon: ['Live broadcasting is not ready yet: real-time video needs streaming servers that are not connected in this build. You can schedule a countdown so followers get reminded.'] },
  { img: G + '24d-live-lens-camera.png', t: 'Live Lens camera', where: 'Make → camera', what: 'A live camera with lens overlays that can send Snaps.', info: ['Works in the installed Android/iOS app only, not in the web preview.'] },
  { img: G + '30-vibemoji-1000.png', t: 'VibeMoji', where: 'Glow emoji library', what: '1000 original emoji drawn for VibeLoop (no third-party sets), grouped in packs. Use any of them as a reaction on Drops.' },
  { img: G + '30b-iconkit-glow-1000.png', t: 'IconKit', where: 'Creator Studio → IconKit', what: '1000 original icons per module (Glow kit and Hush kit) in Line, Duo, Solid and Gradient styles. Searchable.' },
  { img: G + '31-features-prd-200.png', t: "What's In", where: 'Creator Studio → What\'s In', what: 'A browsable list of every capability and whether it is live in the app, admin-only or planned — honest status labels (LIVE, PREVIEW, Planned).' },
  { img: G + '35-learn.png', t: 'Level Up', where: 'Creator Studio → Level Up', what: 'Short lessons. Each has **Try it**, which opens the real feature, and **Mark done**. A progress bar tracks how many you finished.' },
  { img: G + '49-outbox-offline.png', t: 'Outbox (offline)', where: 'Shown when you\'re offline', what: 'Anything you create while offline (messages, Drops, comments, Blinks, Moods) waits here and sends itself when you\'re back online. Each item is sent once — re-sending never duplicates.', how: ['Tap **Try sending now** to retry immediately.'] },
];
const CREATOR = [
  { img: G + '24b-creator-studio.png', t: 'Creator Studio', where: 'Me → Creator Studio', what: 'The creator dashboard: your live Loop with its Loop Score, quick actions (New Loop, Idea Engine, Cut Room, Sound Booth) and tiles for Loop Lab, Locker, Brain Map, Flop Files, Bag Check, Tools, Live Lane, Insights, VibeMoji, IconKit, Level Up and What\'s In. Some cards are labelled **DEMO DATA**.' },
  { img: G + '24c-create-hub.png', t: 'Creator Tools', where: 'Creator Studio → Tools', what: '"Make in private. Prove it. Then go live." Shortcuts to Idea Engine, Cut Room, Sound Booth and Loop Lab.' },
  { img: G + '04-loops.png', t: 'Loop Lab', where: 'Creator Studio → Loop Lab', what: 'A **Loop** is a private test of a Drop with a small group of real people before it goes public. Filter by Testing, Released, Archived. Each card shows its Loop Score (0–100), members and reactions.' },
  { img: G + '02-first-loop-wizard.png', t: 'New Loop', where: 'Loop Lab → +', what: 'Start a test: title, opening hook (Version A, optionally Version B for an A/B test) and template (Comedy short, Educational…). Members react with Vibes; only the first 24 hours count toward the Loop Score.' },
  { img: G + '05-loop-detail.png', t: 'Loop detail', where: 'Tap a Loop', what: 'Loop Score, reaction breakdown, time left in the 24 h window and a health score; per-version results for A/B tests.' },
  { img: G + '06-fan-reaction.png', t: 'Fan view', where: 'What testers see', what: 'The private draft as a tester sees it, with A/B switch, so they can react.' },
  { img: G + '14-release-gate.png', t: 'Go-Live Gate', where: 'Loop → release', what: 'A Loop goes public only after it earns it (e.g. passes Loop Score 70). Choose visibility (Public, Unlisted, Supporters) and complete the rights checklist.' },
  { img: G + '07-learning-archive.png', t: 'Flop Files', where: 'Creator Studio → Flop Files', what: 'Experiments that didn\'t land, with why. Learnings survive even if you delete the media. Options: "Never suggest again" or "Retry as clone".' },
  { img: G + '09-brief-copilot.png', t: 'Idea Engine', where: 'Quick action', what: 'One brief → a package of hooks, captions and formats based on your own winning Loops. Marked **ON-DEVICE**; it flags any price or claim for you to confirm.' },
  { img: G + '10-video-editor.png', t: 'Cut Room', where: 'Quick action', what: 'Non-destructive video editor (originals never change) with safe-zone guides, undo/redo, captions.' },
  { img: G + '11-audio-subtitles.png', t: 'Sound Booth', where: 'Quick action', what: 'Voiceover and cleanup: waveform, silent-frame detection with a silence threshold, subtitles.', soon: ['Automatic speech-to-captions is not connected; captions are typed/timed by you.'] },
  { img: G + '12-library.png', t: 'Asset Locker', where: 'Creator Studio → Locker', what: 'Your assets (video, audio, image, script) with every version kept.' },
  { img: G + '13-memory-graph.png', t: 'Brain Map', where: 'Creator Studio → Brain Map', what: 'A map of what works for you — topics and formats linked to your results — plus a Loop Score trend.' },
  { img: G + '33-pulse-board.png', t: 'Pulse Board', where: 'Creator Studio → Insights', what: 'Views, reactions, shares and Circle size for your posts, each with a confidence label.' },
];
const MONEY = [
  { img: G + '45-cash-flow.png', t: 'Cash Flow', where: 'Me → Cash Flow', what: 'Your real income from paid orders only: Props, Stash, Passes, Fees and Net. Demo orders are excluded.' },
  { img: G + '46-stash-store.png', t: 'Stash (creator store)', where: 'Profile → Stash', what: 'Creator drops such as presets, zines and guides — free (**Get**) or paid (**Buy**). Pay with Razorpay or Cashfree via the provider\'s hosted checkout page.' },
  { img: G + '63-product-real-talk.png', t: 'Product & Real Talk reviews', where: 'Tap a Stash item', what: 'Product page with price and Buy. **Real Talk** reviews can only be written by verified buyers (or people who claimed a free item).' },
  { img: G + '47-backstage-pass.png', t: 'Backstage Pass', where: 'Creator profile', what: 'A monthly subscription to a creator for extras such as members-only Drops. Prices are set per country by staff.' },
  { img: G + '48-props-tip.png', t: 'Props (tips)', where: 'Creator profile → Send Props', what: 'A small thank-you straight to the creator (₹20 / ₹50 / ₹100 / ₹250) with an optional note.' },
  { img: G + '16-earnings.png', t: 'Bag Check (earnings)', where: 'Creator Studio → Bag Check', what: 'Available balance with every fee shown (gross, platform fee 8% by default), last 7 days.' },
  { img: G + '17-payout-request.png', t: 'Cashout', where: 'Bag Check → Request payout', what: 'Request a payout above the minimum. Requires your signed approval.' },
];
const HUSH = [
  { img: H + '50-chat-list.png', t: 'Hush (chat list)', where: 'Hush · tab 1 — Hush', what: 'All your conversations. Top row: friends\' Moods. Filters: **All · Friends · Family · Work**. Search and Star Box icons at the top.', how: ['Tap a chat to open it; long-press for pin, mute, archive, lock.', 'Archived chats live in Control Room → Chats.'] },
  { img: H + '51-chat-room-dm.png', t: 'A 1:1 chat', where: 'Tap a conversation', what: 'Messages with replies (quoted), pinned messages, reactions from the full BubbleMoji set, ticks for sent / delivered / read, edit (15 min) and unsend (60 min) windows.', how: ['Long-press a message: reply, react, star, pin, forward, edit, unsend.', 'Attach photos, videos, files (up to 1 GB, resumable), place cards or a poll.', 'Send Later schedules a message; Fade timer makes messages disappear.', 'Smart reply chips, slash commands, Quick Polish and Phrasebook help you type.'] },
  { img: H + '91-apk-chat-ticks-voice.png', t: 'Photos, videos & voice notes', where: 'Inside a chat (Android app)', what: 'Photos and videos appear inline; a Glow post shared into a chat shows as a "From Glow" card. **Voice notes**: hold the mic to record up to 5 minutes (staff can lower it).', how: ['Tap the attachment icon for gallery / camera / file.', 'Hold the mic, release to send; slide away to cancel.', '**Snaps**: view-once photo/video — the receiver can open it once, then it\'s gone. Unopened snaps expire after 24 h.'] },
  { img: H + '68e-snap-view-expired.png', t: 'Snap view', where: 'Tap a snap', what: 'A view-once photo/video opens for a short countdown. After that you see "This snap is no longer available". If the receiver screenshots it, the sender is told (best effort — the app reports it).' },
  { img: H + '52-chat-room-group.png', t: 'Group chats & polls', where: 'Start a Hush → pick 2+ friends', what: 'Groups up to 50 members by default. Polls show live vote counts.' },
  { img: H + '53-chat-request-gate.png', t: 'Request Gate', where: 'Messages from non-friends', what: 'Someone who isn\'t your friend lands behind the Request Gate. They can\'t see if you read it. Choose **Accept** or **Block & report**.' },
  { img: H + '54-new-chat-id-finder.png', t: 'Start a Hush', where: 'Hush → new chat', what: 'Find people by their **exact** @ID (no phone numbers, no contact upload). Or pick 2+ friends to start a group.' },
  { img: H + '55-chat-search.png', t: 'Find Anything', where: 'Hush → search', what: 'Search your messages. Encrypted messages are not searchable.' },
  { img: H + '56-star-box.png', t: 'Star Box', where: 'Hush → star', what: 'Messages you starred, across chats.' },
  { img: H + '68b-ring-log.png', t: 'Ring Log (calls)', where: 'Hush → Calls', what: 'History of Voice and Face (video) calls. Start a call from any 1:1 chat.' },
  { img: H + '68c-voice-call.png', t: 'Voice & Face calls', where: '1:1 chat → phone / camera icon', what: '1:1 voice and video calls (WebRTC). By default only friends can call you (change in Control Room → Calls). Missed calls show as a Ping.', soon: ['Calls connect directly on most networks; on strict mobile / office networks a TURN relay server must be configured by VibeLoop staff, otherwise you may see "Connection failed". Video preview shows only in the installed app.'] },
  { img: H + '57-friends.png', t: 'Squad (friends)', where: 'Hush · tab 2 — Squad', what: 'Your friends, Besties (close friends) and friend requests. Friend Flame shows a streak for days you both messaged.', how: ['Add by exact @ID, or scan someone\'s ID Card QR.', 'Accept or dismiss incoming requests.'] },
  { img: H + '58-my-id-qr.png', t: 'ID Card', where: 'Squad / Me → QR icon', what: 'Your @ID as a QR code — share this instead of a phone number.' },
  { img: H + '59-vibes-status.png', t: 'Moods', where: 'Hush · tab 3 — Moods', what: '24-hour status updates (text, emoji, photo or video) with an audience you pick. Recent friends\' Moods below.', how: ['Tap **Your Vibe** (+) to post.', 'Mood photos/videos are private files: only people your audience allows can open them.'] },
  { img: H + '60-new-vibe.png', t: 'New Mood', where: 'Moods → +', what: 'Text Mood or Emoji Mood with a background colour; choose who sees it; lasts 24 hours.' },
  { img: H + '60a-vibe-view.png', t: 'Viewing a Mood', where: 'Tap a friend\'s Mood', what: 'Full-screen Mood. Reply privately from the bottom.' },
  { img: H + '61-towns.png', t: 'Hoods (communities)', where: 'Hush · tab 4 — Hoods', what: 'Community spaces. Your Hoods (with your role) and Discover. Open Hoods anyone can join; Secret Hoods are invite-only.' },
  { img: H + '62-town-room.png', t: 'Inside a Hood', where: 'Tap a Hood', what: 'A Hood Board for announcements (owners/admins post) and channels such as #collabs and #general.' },
  { img: H + '63-create-town.png', t: 'Start a Hood', where: 'Hoods → +', what: 'Name, about, and Open Hood on/off.' },
  { img: H + '64-chat-me.png', t: 'Me (Hush profile)', where: 'Hush · tab 5 — Me', what: 'Your Hush card ("No phone number linked · ever"), your accounts (up to 5), Two Faces bio and links to settings, Control Room, BubbleMoji and Help.' },
  { img: H + '65-change-id.png', t: 'Change @ID', where: 'Me → Change @ID', what: 'Your @ID is your public username, not your password. You can change it once every 30 days; your old @ID stays reserved for 30 days.' },
  { img: H + '66-chat-security.png', t: 'Lockdown (security)', where: 'Me → Security', what: 'Login method (one-time code to email — no phone, no password), code rules (6 digits, 5-minute expiry, locked after 5 wrong tries), sign out everywhere, chat lock.', info: ['This screenshot was captured before encryption was switched on. In the current build, 1:1 text is end-to-end encrypted when both people have the app (see "Encryption" below).'] },
  { img: H + '67-bubblemoji-1000.png', t: 'BubbleMoji', where: 'Me → BubbleMoji', what: '1000 original chat emoji grouped by mood (Chatty, Cheer, Calm, Curious…). React to messages with any of them.' },
  { img: H + '68-post2chat.png', t: 'Post2Chat', where: 'Glow → Share → to a chat', what: 'Share a Glow Drop privately into a Hush chat with an optional note.' },
  { img: H + '43-accounts-switcher.png', t: 'Five Faces (accounts)', where: 'Me → Accounts', what: 'Up to 5 @IDs on one device (and per email). Each signs in with its own @ID and one-time code.' },
  { img: H + '44-language-region.png', t: 'Region & Lingo', where: 'Me → Language', what: 'App language (English, हिन्दी, தமிழ், తెలుగు, ಕನ್ನಡ, മലയാളം, मराठी, বাংলা) and country. These decide labels, features and availability for you.' },
];
const HELP = [
  { img: G + '50-glow-hub.png', t: 'Help & Support', where: 'Settings → Help & Support', what: 'One place for SOS Lane, Help Hub, Hit Us Up, House Rules, Privacy Promise, Data Receipt, Our Story, Guides, Get the Apps and news.' },
  { img: G + '56-sos-lane.png', t: 'SOS Lane', where: 'Help & Support', what: '**If you\'re in danger, call 112.** India helplines: 112 emergency, 1930 cyber crime (also cybercrime.gov.in), 181 women helpline. Plus how to report inside VibeLoop.' },
  { img: G + '61-speak-up.png', t: 'Speak Up (report)', where: 'Help, or Report on a profile/Drop/message', what: 'Private reports reviewed by a person on the team. Categories: Harassment, Rule violation, Scam/fraud, Impersonation, Collab dispute, Complaint, Someone may be at risk, Other. You get a ticket (SU-XXXXX) and updates under **My tickets**.', info: ['"Someone may be at risk" or "urgent" reports are top priority and show SOS Lane info immediately.'] },
  { img: G + '51-help-hub-faq.png', t: 'Help Hub (FAQ)', where: 'Help & Support', what: 'Quick answers: logging in with your @ID, Glow vs Hush, what happens offline, who can see your stuff…' },
  { img: G + '57-hit-us-up.png', t: 'Hit Us Up (contact)', where: 'Help & Support', what: 'Fastest: open an in-app ticket. Email is also listed.', soon: ['The support email shown is a placeholder until the team replaces it.'] },
  { img: G + '52-house-rules.png', t: 'House Rules', where: 'Help & Support', what: 'The terms for using VibeLoop: be real (one person, own accounts, up to 5 per email), be kind, etc.', info: ['Currently marked "Draft — review with your lawyer before launch".'] },
  { img: G + '53-privacy-promise.png', t: 'Privacy Promise', where: 'Help & Support', what: 'We collect what the app needs to work, we don\'t sell your data, and you can ask for a copy or deletion. Marked as a draft.' },
  { img: G + '54-data-receipt.png', t: 'Data Receipt', where: 'Help & Support', what: 'Exactly what is stored: email, @ID, display name, profile photos/bios, what you create, location only when you tag a place, reactions/follows, short-lived security logs (IP/device) and payment order ids — no card data.' },
  { img: G + '58-glow-guide.png', t: 'Glow Guide / Hush Guide', where: 'Help & Support', what: 'Plain tours of each module\'s tabs.' },
  { img: G + '59-get-the-apps.png', t: 'Get the Apps', where: 'Help & Support', what: 'Android (APK) and Web links.', soon: ['iPhone app: coming soon.'] },
  { img: G + '60-the-loopdown.png', t: 'The Loopdown / Hush Notes / Fresh Wire', where: 'Help & Support', what: 'Stories from the VibeLoop team (blog) and Fresh Wire (news).' },
  { img: G + '34-trust-safety.png', t: 'Privacy & Safety', where: 'Settings', what: 'Private account, hide reaction counts, message requests, Block Shield, Comment Guard (blocked words).' },
];
const SETTINGS = [
  { img: G + '19-settings.png', t: 'Control Room (Glow settings)', where: 'Me → settings', what: 'Everything in one place: Account & security, Privacy & data, Notifications, Creation & costs, Monetisation, Audit trail.' },
  { img: G + '37-settings-account.png', t: 'Account & security', where: 'Control Room', what: 'Profile, two-factor (TOTP) toggle, biometric lock for publish & payout, active sessions.' },
  { img: G + '38-settings-privacy.png', t: 'Privacy & data', where: 'Control Room', what: 'Who can join your Loops, default visibility, Download my data, consent records.' },
  { img: G + '39-settings-notifications.png', t: 'Notifications', where: 'Control Room', what: 'Turn Ping categories on/off (Loops, Reactions, Earnings, System).' },
  { img: G + '40-settings-creation.png', t: 'Creation & costs', where: 'Control Room', what: 'AI features with a monthly cap, render quality (720p/1080p/4K), language mode (Hinglish, English, Tamil).' },
  { img: G + '41-settings-monetisation.png', t: 'Monetisation', where: 'Control Room', what: 'Minimum payout, currency, payout method, default tip jar.' },
  { img: G + '42-settings-audit.png', t: 'Audit trail', where: 'Control Room', what: 'Security events on this device (logins, code logins).' },
];

const GLOSSARY = [
  ['Glow', 'The social module (posts, videos, stories)'], ['Hush', 'The chat module (messages, friends, communities)'], ['D-Switch', 'The Glow ⇄ Hush toggle at the top'],
  ['Hub', 'Home feed'], ['Drift', 'Explore / discover'], ['Make', 'Create a post'], ['Flicks', 'Short videos (reels)'], ['Me', 'Your profile'],
  ['Drop', 'A post'], ['Thought', 'A text-only post'], ['Blink', 'A story that disappears (1–24 h)'], ['Squad', 'Friends'], ['Besties', 'Close friends (Inner Circle)'],
  ['Moods', 'Status updates (24 h)'], ['Hoods', 'Communities / groups with channels'], ['Pings', 'Notifications'], ['Seek', 'Search'], ['Find Anything', 'Message search'],
  ['Star Box', 'Starred messages'], ['Ring Log', 'Call history'], ['Face Call', 'Video call'], ['Snap', 'View-once photo/video'], ['Fade', 'Disappearing messages'],
  ['Request Gate', 'Message requests from non-friends'], ['Follow Knocks', 'Follow requests'], ['Five Faces', 'Account switcher (up to 5 accounts)'], ['Two Faces', 'Different photo/bio for Glow and Hush'],
  ['ID Card', 'Your QR code'], ['Loop', 'A private test of a post with a small group'], ['Loop Score', 'A 0–100 score from real tester reactions'], ['Go-Live Gate', 'Release check before going public'],
  ['Flop Files', 'Archive of tests that didn\'t work'], ['Brain Map', 'What works for you'], ['Bag Check', 'Earnings'], ['Cashout', 'Payout'], ['Stash', 'Creator store'],
  ['Backstage Pass', 'Subscription'], ['Props', 'Tip'], ['Boosts', 'Sponsored posts / ads'], ['Vouches', 'Reviews of a creator'], ['Real Talk', 'Product reviews'],
  ['Speak Up', 'Report / support ticket'], ['SOS Lane', 'Emergency help'], ['Hit Us Up', 'Contact us'], ['House Rules', 'Terms'], ['Privacy Promise', 'Privacy policy'], ['Data Receipt', 'What data we store'],
  ['The Loopdown / Hush Notes', 'Blog'], ['Fresh Wire', 'News'], ['Control Room', 'Settings'], ['Lockdown', 'Security settings'], ['Ghost Hours', 'Hide online & typing'],
  ['Friend Flame', 'Messaging streak'], ['Love Trail', 'Everything you liked'], ['Save Stack', 'Collections'], ['Keepers', 'Saved items'], ['Pin 3', 'Pin up to 3 posts'], ['Mood Drop', 'Today\'s mood emoji'],
  ['Post2Chat / Reel2Talk', 'Share a post / Flick into a chat'], ['Outbox', 'Things waiting to send while offline'], ['VibeMoji / BubbleMoji', 'Our own emoji for Glow / Hush'],
];

async function userGuide() {
  const parts = [];
  parts.push(cover('User Guide', 'One @ID. Every connection. No phone number. Everything you need to get going with Glow and Hush.', 'For people using the VibeLoop app · v1.0'));
  parts.push(toc([['Getting started', 'Install, sign in, accounts, switching'], ['Glow — the social side', 'Hub · Drift · Make · Flicks · Me'], ['Hush — the chat side', 'Chats, media, voice, calls, Squad, Moods, Hoods'],
    ['Hush Control Room, privacy & encryption'], ['Creator tools', 'Loops, Studio, editing'], ['Money features', 'May be switched off in your region'], ['Settings'], ['Safety, help & SOS'], ['Offline behaviour'], ['FAQ'], ['Glossary', 'Gen-Z names → plain meaning']]));

  parts.push(divider(1, 'Getting started', 'Install the app, sign in with your @ID and a one-time code, and learn the switch between Glow and Hush.'));
  parts.push(`<section>
    <h2>Install the app</h2>
    <ol class="steps"><li><b>Android:</b> get the APK file (<code>VibeLoop-1.0.0.apk</code>) from the team or the Get the Apps page, open it and allow "Install unknown apps" when Android asks.</li>
    <li>Make sure your phone has internet access to the VibeLoop server. On test builds your phone must be on the same Wi-Fi as the server; the server address can be changed on the sign-in screen → <b>Server</b>.</li>
    <li><b>Web:</b> open the web link in any browser.</li></ol>
    ${note('iPhone app is coming soon. The current Android test build is signed for testing, not yet published on Google Play.')}
    <div class="screen">${await phone(G + '00-onboarding.png')}<div><h3>First open</h3><p>A short intro shows what VibeLoop is: test ideas with real people (Loops), share in Glow, talk in Hush. Swipe through and tap continue.</p></div></div>
    <div class="screen">${await phone(G + '01-sign-in.png')}<div><h3>Sign in with your @ID</h3><div class="where">No phone number needed</div>
      <ol class="steps"><li>New here? Tap <b>Create account</b>: choose an @ID (3–20 letters, numbers, dots or underscores), your name and email.</li>
      <li>Returning? Type your <b>@ID</b> (e.g. <code>@riya.makes</code>) or your email.</li><li>Tap <b>Send login code</b>.</li></ol></div></div>
    <div class="screen">${await phone(G + '01b-otp-code.png')}<div><h3>Enter your code</h3>
      <p>A 6-digit code is sent to your email. It expires after <b>5 minutes</b> and is locked after 5 wrong tries. Too many requests in a short time gives "Too many attempts" — wait 15 minutes.</p>
      ${note('Email/SMS delivery of codes needs provider keys set up by VibeLoop staff. Until then the app shows a **Demo mode** box with your code — tap **Use** to fill it in.')}</div></div>
    <h3>Up to 5 accounts</h3><p>One device can hold up to 5 @IDs (and one email can own up to 5 accounts). Add and switch them in Hush → Me → Accounts (<b>Five Faces</b>). Each one signs in with its own code.</p>
    <h3>Switching Glow ⇄ Hush</h3><p>Tap <b>Glow</b> or <b>Hush</b> in the pill at the top of the screen (the D-Switch), or swipe between them. Badges on each side show unread counts. While in Glow, the floating chat bubble opens Hush. <b>Focus Switch</b> mutes the other side\'s notifications when you want quiet.</p>
    ${note('VibeLoop staff can rename tabs, switch screens or features on/off, and change colours per country, region and language. If a screen says "Switched off" or "Turned off in your region", that is why.', 'info')}
  </section>`);

  parts.push(divider(2, 'Glow — the social side', 'Five tabs: Hub, Drift, Make, Flicks, Me. Share Drops, Blinks and Flicks with your people.'));
  parts.push(`<section>${(await Promise.all(GLOW.map(screen))).join('')}</section>`);

  parts.push(divider(3, 'Hush — the chat side', 'Five tabs: Hush, Squad, Moods, Hoods, Me. Private conversations, friends, 24-hour Moods and communities.'));
  parts.push(`<section>${(await Promise.all(HUSH.map(screen))).join('')}</section>`);

  parts.push(divider(4, 'Hush Control Room, privacy & encryption', 'Your quiet side, your rules.'));
  parts.push(`<section><h2>Hush Control Room</h2>
    <p>Open Hush → Me → <b>Control Room</b>. Sections: Hush profile, Privacy, Blocked, Notifications, Chats, Archive, Calls, Security, Storage & data, About Hush.</p>
    ${tbl(['Setting', 'What it does'], [
      ['Typing visible', 'Off: others never see you typing.'], ['Read receipts', 'Off: your reads aren\'t sent — and you won\'t see others\' "read" either (reciprocal).'],
      ['Last seen', 'Hide it from everyone/friends; if you hide yours, you can\'t see others\'.'], ['Photo visibility', 'Everyone / friends / nobody can see your Hush photo.'],
      ['Ghost Hours', 'Hide online status & typing.'], ['Who can message', 'Everyone / friends / nobody (others go to the Request Gate).'],
      ['Who can call', 'Friends (default), everyone, or nobody.'], ['Notifications', 'Messages, groups, calls, Moods on/off; hide message previews; quiet hours.'],
      ['Default fade timer', 'New chats you start disappear after 1h / 24h / 7d, or off.'], ['Chat lock', 'Lock Hush (or a chat) behind your device unlock.'],
      ['Archive', 'Hide chats from the list without deleting them.'], ['Storage & data', 'Auto-download, clear offline cache, export all chats (JSON; encrypted messages stay sealed).'],
      ['Blocked', 'People you blocked — they can\'t message, call or see you.']])}
    <h2>Encryption — honest status</h2>
    ${ul(['All traffic uses HTTPS when the server is set up with TLS.', '**1:1 text messages are end-to-end encrypted** when both people have the app and have published a key: the message is sealed on your phone (NaCl box: X25519 + XSalsa20-Poly1305) and the server only stores "[encrypted]".', 'Encrypted messages can\'t be edited, forwarded, searched, or read by moderators. Push previews just say "New message".'])}
    ${note('Not yet: forward secrecy (Signal-style double ratchet), multi-device encryption, key-verification screen, encrypted group chats, photos/files/voice notes. The server still sees who talks to whom and when.')}
    <h2>Push notifications</h2><p>When you first open the Android app it asks to allow notifications. You get Pings for new messages, mentions, friend and follow requests, missed and incoming calls.</p>
    <div class="screen">${await phone(G + '90-apk-glow-push-prompt.png')}<div><h3>Allow notifications</h3><p>Tap Allow. You can turn categories off any time.</p>
    ${note('Push on Android needs the team to add Firebase (FCM) / Expo push credentials to the build. Without them the app says "This build has no push credentials yet" and messages still arrive while the app is open.')}</div></div>
  </section>`);

  parts.push(divider(5, 'Creator tools', 'Make in private. Prove it with real people. Then go live.'));
  parts.push(`<section>${(await Promise.all(CREATOR.map(screen))).join('')}</section>`);

  parts.push(divider(6, 'Money features', 'Stash, Backstage Pass, Props, Cash Flow and Cashouts.'));
  parts.push(`<section>${note('All money features are **off by default** and VibeLoop staff can switch each one on or off per country, region or creator tier. If you don\'t see them, they aren\'t available to you yet. Payments only work once staff have connected a payment provider; otherwise checkout says "Payments not configured" — it never fakes a payment.')}
    <p>Payments open the provider's own hosted page (Razorpay or Cashfree). VibeLoop never sees your card details. Purchases are marked paid only after the provider confirms.</p>
    ${(await Promise.all(MONEY.map(screen))).join('')}</section>`);

  parts.push(divider(7, 'Settings', 'Glow Control Room and the Settings hub.'));
  parts.push(`<section>${(await Promise.all(SETTINGS.map(screen))).join('')}</section>`);

  parts.push(divider(8, 'Safety, help & SOS', 'Reports go to a real person. In danger? Call 112.'));
  parts.push(`<section>${(await Promise.all(HELP.map(screen))).join('')}</section>`);

  parts.push(divider(9, 'Offline behaviour', 'Keep creating with no signal.'));
  parts.push(`<section><h2>What happens offline</h2>${ul([
    'The app keeps your last-loaded feed, chats and config on the device, so you can still read them.',
    'Messages, Drops, comments, Blinks and Moods you create offline go to the **Outbox** and send automatically when you\'re back online. Each item carries its own id, so retrying never posts twice.',
    'Hush checks for new messages over a live connection; if that drops, it re-checks every few seconds.',
    'Calls, payments, sign-in codes and uploads need a connection.',
    '**Clear offline cache** (Hush Control Room → Storage) removes chats saved on this device only — nothing on the server.'])}</section>`);

  parts.push(divider(10, 'FAQ', 'Quick answers.'));
  parts.push(`<section class="faq"><h2>Frequently asked questions</h2>
    ${[['Do I need a phone number?', 'No. You sign in with your @ID or email and a one-time code. No phone number is ever required.'],
      ['I didn\'t get my code.', 'Codes are sent by email once the team connects the email provider. In demo/test builds the code appears on screen — tap Use. Codes expire after 5 minutes.'],
      ['It says "Too many attempts".', 'You requested or entered codes too many times. Wait about 15 minutes and try again.'],
      ['The app can\'t reach the server (test APK).', 'Your phone must reach the server address — usually the same Wi-Fi. Change the address on the sign-in screen → Server.'],
      ['What\'s the difference between Glow and Hush?', 'Glow is public-ish social sharing; Hush is private chat. Same @ID, separate photos and bios if you like (Two Faces).'],
      ['Can I change my @ID?', 'Yes, once every 30 days. Your old @ID stays reserved for 30 days.'],
      ['Are my chats encrypted?', '1:1 text between two app users is end-to-end encrypted. Groups, media and voice notes are not yet. See Chapter 4.'],
      ['A call won\'t connect.', 'Some networks need a relay (TURN) server that the team must set up. Try Wi-Fi, or another network.'],
      ['Why can\'t I see Stash / tips / Backstage Pass?', 'Money features are off unless staff turn them on for your region.'],
      ['Why does a screen say "Switched off"?', 'Staff can switch screens and features off per country, region, tier or language.'],
      ['How do I report someone?', 'Use Report on their profile, Drop or message, or Help → Speak Up. For danger call 112.'],
      ['How do I delete my account or get my data?', 'Control Room → Privacy & data → Download my data, or request deletion via Speak Up. Deletion is handled by the team.']]
      .map(([q, a]) => `<b>${esc(q)}</b><p>${esc(a)}</p>`).join('')}</section>`);

  parts.push(divider(11, 'Glossary', 'Our own names, in plain words.'));
  parts.push(`<section><h2>Gen-Z name → plain meaning</h2>${tbl(['VibeLoop name', 'Means'], GLOSSARY.map(([a, b]) => [`<b>${esc(a)}</b>`, esc(b)]))}
    <p style="color:#77738a;font-size:9pt">Staff can rename some labels per country or language, so your app may show a translated or different name.</p></section>`);
  return parts.join('\n');
}

/* ============================== ADMIN GUIDE content ============================== */
const A = 'admin/';
const ADMIN_GROUPS = [
  ['Overview & operations', [
    ['Mission Control', '01-mission-control.png', 'dashboard', 'Home dashboard: KPI tiles (accounts, Loops, fan reactions, kill switches engaged), Loops-per-day chart (labelled Demo data) and quick configuration status.', ['KPI tiles read live counts from the API.', 'Kill-switch tile turns red when any emergency kill switch is engaged — check Switchboard.'], 'Read-only.'],
    ['Members', '02-members.png', 'users', 'Searchable list of every account with role, status and last seen.', ['Click a row to open the member drawer (next).', 'Staff always see last seen, even if the user hides it.'], 'Suspending a member signs them out everywhere and blocks every authenticated call (403).'],
    ['Member drawer', '03-members-drawer.png', 'users?open=…', 'Detail for one member: avatar/initials, @ID, email (masked), profile fields, last seen, accounts.', [], ''],
    ['Mod Queue', '04-mod-queue.png', 'moderation', 'Content held for review. KPIs: Open, Escalated to T&S lead, Resolved.', ['Pick a reason code, then Approve, Remove or Escalate.', 'Reason codes are edited in Control Room → Moderation.'], 'Removed content disappears from feeds; the author is notified.'],
    ['Cashouts', '05-cashouts.png', 'payouts', 'Creator payout requests awaiting decision.', ['Approve or reject; decisions need a short-lived approval token (5 min, single use).'], 'Creator sees the status in Bag Check / Pings.'],
    ['Vitals', '06-vitals.png', 'health', 'Service health: API, database, rate limiter (Redis or in-memory), queue status.', [], 'Read-only.'],
    ['Burn Rate', '07-burn-rate.png', 'costs', 'AI and render spend against a monthly budget.', [], 'Figures are labelled Demo data.'],
    ['Switchboard', '08-switchboard.png', 'flags', 'Feature flags (flag/…) and emergency kill switches (kill/…).', ['Toggle a flag; engaging a kill switch asks for confirmation (arm, then confirm).'], 'Kill switches stop the matching area immediately for everyone.'],
    ['Paper Trail', '09-paper-trail.png', 'audit', 'The audit log: every staff action and security event with actor, action, target and time. Pages with "before=".', [], 'Entries contain handles/ids, never secrets or provider keys.'],
    ['Privacy Desk', '10-privacy-desk.png', 'privacy', 'Data requests (export/deletion) and retention settings.', ['Retention runs as dry-run only.'], 'Deletion fulfilment is manual today.'],
    ['Spam Shield', '11-spam-shield.png', 'abuse', 'Detection rules with hit counts and on/off toggles.', [], 'Rules panel is labelled Demo data.'],
    ['Revenue Pulse', '12-revenue-pulse.png', 'revenue', 'Gross creator sales, platform fee %, fees collected, paid to creators (live, all time).', [], 'Read-only.'],
    ['Megaphone', '13-megaphone.png', 'announcements', 'Announcements: title, message and audience (Everyone, Creators, Fans, Staff).', [], 'Appears as a System Ping for the chosen audience.'],
    ['Role Matrix', '14-role-matrix.png', 'roles', 'Roles × permissions grid. Owner row is locked.', [], 'Note: the API currently enforces a single owner role for /admin; the matrix documents intended permissions.'],
  ]],
  ['App control (server-driven config)', [
    ['Nav Builder', '15-nav-builder-base.png', 'navigation', 'Tabs for each module: label, icon, order, on/off — edited per layer (layer picker at top).', ['Pick a layer (base, country:XX, zone:…, slab:…, lang:xx).', 'Rename, reorder or disable tabs; Save.'], 'App bottom bars change on next config load. At least one tab per enabled module must stay on (validation).'],
    ['Nav Builder — module names', '16-nav-builder-module-names.png', 'navigation', 'Rename the modules (default Glow / Hush) with a live D-Switch preview. 1–16 characters, at least one letter/number.', [], 'Language layers rename via strings module.social / module.chat instead.'],
    ['Nav Builder — country layer', '17-nav-builder-country-US.png', 'navigation', 'Example: a country:US layer overriding labels. Inherited values are shown faded.', [], ''],
    ['Nav Builder — validation', '18-nav-builder-validation-error.png', 'navigation', 'A rejected save shows the server\'s exact reason.', [], 'Nothing changes in the app until a valid save.'],
    ['Theme Studio', '19-theme-studio-base.png', 'themes', 'Colours, nav-bar style (pill / dock), corner radius and density per module, from presets (Glow: studio, prism, sunset, ocean · Hush: mono, aqua, midnight, coral) or custom hex.', ['Pick a preset or edit colours; the phone preview updates.'], 'Text contrast must be ≥ 4.5:1 (WCAG AA) on every layer combination or the save is refused. Language layers cannot change themes.'],
    ['Theme Studio — country', '20-theme-studio-country-US.png', 'themes', 'Country-specific theme (e.g. US uses a different preset).', [], ''],
    ['Theme Studio — validation', '21-theme-studio-validation-error.png', 'themes', 'Example contrast failure message.', [], ''],
    ['Screen Switches', '22-screen-switches-base.png', 'screens', 'Every app screen key with an on/off per layer.', ['Toggle a screen off for a layer.'], 'Switched-off screens show "Switched off / Turned off in your region" in the app.'],
    ['Screen Switches — country', '23-screen-switches-country-US.png', 'screens', 'Same, for a country layer.', [], ''],
    ['Feature Dials', '24-feature-dials-base.png', 'limits', 'Feature flags and limits per layer (see the catalogue chapter).', [], 'Checked server-side on every call — a disabled feature answers 403 "Not enabled".'],
    ['Feature Dials — tier', '25-feature-dials-slab-pro.png', 'limits', 'Example: the slab:pro tier layer.', [], ''],
    ['Zones', '26-zones.png', 'zones', 'Named groups of countries and states (defaults: IN-SOUTH, IN-NORTH, GLOBAL).', [], 'Users are matched to the first zone listing their country, else the "*" zone.'],
    ['Tiers', '27-tiers.png', 'slabs', 'Creator tiers by follower count (Starter 0–999, Rising 1k–9,999, Pro 10k+).', [], 'Used by slab layers and Boost slabs.'],
    ['Lingo', '28-lingo-strings-ta.png', 'languages', 'Available languages (en, hi, ta, te, kn, ml, mr, bn), default language and per-language strings/labels.', [], 'Language layers may only change strings and nav labels.'],
    ['Preview Room', '29-preview-room-IN-ta.png', 'preview', 'Resolve the config as a given country / state / tier / language would see it.', [], 'Read-only; use before saving risky changes.'],
    ['Preview Room — US', '30-preview-room-US-en.png', 'preview', 'Same preview for US / English.', [], ''],
  ]],
  ['Identity & chat', [
    ['Login Watch', '31-login-watch.png', 'otp', 'OTP and login activity: requests, verifies, failures, rate-limit hits.', [], 'Helps diagnose "Too many attempts" reports.'],
    ['ID Desk', '32-id-desk.png', 'identity', 'Handle (@ID) management: reserved handles, lookups, changes.', [], 'Reserved words (admin, support, vibeloop, staff, …) can\'t be registered.'],
    ['Hush & Hoods', '33-hush-hoods.png', 'chat', 'Chat and Hood overview with kill switches for chat features.', [], 'Suspending a Hood hides it for members.'],
  ]],
  ['Live & reach', [
    ['Realtime Monitor', '34-realtime-monitor.png', 'realtime', 'Live WebSocket connections and events per minute.', [], 'Counts are for this API process only (labelled).'],
    ['Call Log', '35-call-log.png', 'calls', 'All calls with status (ringing, answered, ended, rejected, missed) and media type; filter by status/media/@ID.', [], 'Metadata only — no call content.'],
    ['Push Center', '36-push-center.png', 'push', 'Registered push tokens and send stats; send a test push to a user.', [], 'Sends go via Expo Push. FCM tokens are stored but not sent to yet.'],
    ['E2EE & Keys', '37-e2ee-keys.png', 'e2ee', 'Public-key directory stats and encrypted conversation counts.', [], 'Staff can never read ciphertext.'],
  ]],
  ['Money & growth', [
    ['Cash Flow (empty)', '38-cashflow-empty.png', 'cashflow', 'Platform income: fees, subscriptions, ads by day — real paid orders only.', [], ''],
    ['Money switches (off)', '39-money-switches-off.png', 'money', 'Master money switch plus Backstage Pass, Stash, Props, Boosts, platform fee; fee %, minimum payout, currency.', ['Turn the master on first, then individual features.'], 'Mirrors into config base features. When off, the app hides money UI and the API returns 403.'],
    ['Money switches (on)', '40-money-switches-on.png', 'money', 'All money features enabled.', [], ''],
    ['Cash Flow (money on)', '41-cashflow-money-on.png', 'cashflow', 'Same page once orders come in.', [], ''],
    ['Backstage Pass plans', '42-backstage-pass-plans.png', 'plans', 'Subscription plans: name, perks, period, per-country prices (minor units).', [], 'Plans only exist if you create them — no invented prices.'],
    ['Country pricing', '43-country-pricing.png', 'countries', 'Currency and symbol per country (IN → INR ₹, US → USD $…).', [], ''],
    ['Boosts', '44-boosts-ads-slabs.png', 'boosts', 'Sponsored cards and which tiers/places (feed, explore, chat list) may show them, with frequency.', [], 'Shown labelled "Sponsored". Admin-created only.'],
    ['Stash moderation', '45-stash-moderation.png', 'stash', 'Creator products and orders; deactivate a product.', [], 'Inactive products disappear from Stash.'],
    ['Plugs', '46-plugs.png', 'plugs', 'Provider keys: Razorpay, Cashfree, MSG91 (email/SMS OTP), Maps, TURN, Expo push.', ['Enter keys and Save; use Test to make a real lightweight API call.'], 'Secrets are Fernet-encrypted with MASTER_KEY and only ever shown masked (••••last4).'],
    ['Plugs — test not configured', '47-plugs-test-not-configured.png', 'plugs', 'Test result when no key is set: "not configured".', [], ''],
    ['Plugs — TURN & Expo', '48-plugs-turn-expo.png', 'plugs', 'TURN urls + username/credential or shared secret (coturn use-auth-secret), and the Expo access token.', [], 'TURN creds reach the app only via authenticated GET /rtc/ice.'],
    ['Money master off again', '49-money-master-off-again.png', 'money', 'Switching the master off hides every money feature again.', [], ''],
  ]],
  ['Brand & community', [
    ['Promos', '50-promos-list.png', 'promos', 'VibeLoop\'s own brand promotions (labelled "From VibeLoop").', [], 'Feature flag promos off → no promos anywhere.'],
    ['Promo editor — targeting', '51-promo-editor-targeting.png', 'promos', 'Kind (banner, card, video, image, link, post), placements (home_banner, feed, chat_list, splash, explore), targeting: global or countries + zones + states (AND), dates, priority.', [], 'A non-global promo with no targets is rejected.'],
    ['Promo editor — full', '52-promo-editor-full.png', 'promos', 'Title, body, media, CTA and URL with preview.', [], ''],
    ['Promo preview — IN/TN', '53-promo-preview-IN-TN.png', 'promos', 'What a viewer in Tamil Nadu, India sees.', [], ''],
    ['Promo preview — US', '54-promo-preview-US.png', 'promos', 'What a US viewer sees.', [], ''],
    ['Uploads', '55-uploads.png', 'uploads', 'Every uploaded file: owner, kind, size, mime.', [], ''],
  ]],
  ['Content & trust', [
    ['Page Studio', '56-page-studio-list.png', 'pages', 'CMS pages per module (glow / hush / both): Help Hub, House Rules, Privacy Promise, Data Receipt, Our Story, SOS Lane, Hit Us Up, Guides, Get the Apps.', [], 'Published pages show in the app\'s Help & Support.'],
    ['Page editor — FAQ', '57-page-studio-editor-faq-help-hub.png', 'pages', 'Plain text + simple markdown, with FAQ items.', [], 'HTML and javascript: links are refused.'],
    ['Page editor — links', '58-page-studio-editor-links-get-the-apps.png', 'pages', 'Link items (android / ios / web).', [], ''],
    ['Page editor — House Rules', '59-page-studio-editor-house-rules.png', 'pages', 'Legal drafts are marked as drafts.', [], ''],
    ['Version history', '60-page-studio-version-history.png', 'pages', 'Every save is a version; restore creates a new version with old content.', [], ''],
    ['The Loopdown / Fresh Wire', '61-loopdown-fresh-wire-list.png', 'blog', 'Blog posts (The Loopdown for Glow, Hush Notes for Hush) and news (Fresh Wire).', [], ''],
    ['Blog editor', '62-loopdown-editor-preview.png', 'blog', 'Edit with live preview.', [], ''],
    ['Reviews Desk', '63-reviews-desk.png', 'reviews', 'Vouches and Real Talk reviews; hide, show or delete.', [], 'Hidden reviews disappear from the app.'],
    ['Reviews Desk — hidden', '64-reviews-desk-hidden-vouch.png', 'reviews', 'A hidden Vouch.', [], ''],
    ['Speak Up Desk', '65-speak-up-desk-queue.png', 'speakup', 'Reports and tickets by status, category, priority (urgent / high / normal).', [], ''],
    ['Ticket detail', '66-speak-up-desk-urgent-ticket-detail.png', 'speakup', 'Ticket with history, evidence; set status (open, reviewing, actioned, closed), public note and action (warn, remove_content, suspend_user).', [], 'Reporter is notified; suspend signs the user out; staff can\'t be suspended here.'],
    ['Ticket reviewing', '67-speak-up-desk-urgent-reviewing.png', 'speakup', 'Urgent ticket being reviewed.', [], ''],
  ]],
  ['Platform', [
    ['Control Room — General', '68-control-room-general.png', 'settings/general', 'Platform name, tagline, default language, maintenance mode.', [], ''],
    ['Control Room — Security', '69-control-room-security.png', 'settings/security', 'Password policy, session timeout, passkeys, MFA per role.', [], 'MFA and passkeys are not enforced by the API yet.'],
    ['Control Room — Moderation', '70-control-room-moderation.png', 'settings/moderation', 'Auto-hold thresholds, reason codes, Comment Guard blocked phrases.', [], ''],
    ['Control Room — Monetisation', '71-control-room-monetisation.png', 'settings/monetisation', 'Platform fee, minimum payout, schedule, currencies.', [], ''],
    ['Control Room — Notifications', '72-control-room-notifications.png', 'settings/notifications', 'Push/email categories and quiet hours.', [], ''],
    ['Control Room — Content', '73-control-room-content.png', 'settings/content', 'Upload size, file types, synthetic-media labelling, minimum Loop Score.', [], ''],
    ['Control Room — Privacy', '74-control-room-privacy.png', 'settings/privacy', 'Retention, DSAR SLA, teen protections.', [], ''],
    ['Control Room — Integrations', '75-control-room-integrations.png', 'settings/integrations', 'Integration overview (keys themselves live in Plugs).', [], ''],
    ['Control Room — Branding', '76-control-room-branding.png', 'settings/branding', 'Brand assets and colours for the console.', [], ''],
    ['Control Room — Admins', '77-control-room-admins.png', 'settings/admins', 'Staff list and invites.', [], ''],
    ['VibeMoji Vault', '78-vibemoji-vault.png', 'emoji', 'All 1000 VibeMoji / BubbleMoji.', [], ''],
    ['VibeMoji detail', '79-vibemoji-vault-detail.png', 'emoji', 'One emoji\'s details.', [], ''],
    ["What's In", '80-whats-in-prd.png', 'features', 'Capability catalogue with live / planned status.', [], ''],
    ["What's In — social", '81-whats-in-social.png', 'features', 'Glow × Hush capability list.', [], ''],
    ['Seek', '82-seek-riya.png', 'search', 'Global admin search across members, config keys, themes, plans, stash, plugs, promos, pages, reviews.', [], ''],
    ['Level Up', '93-level-up.png', 'learn', 'Staff lessons for the console.', [], ''],
  ]],
];
const FLAG_EXTRA_DEFAULT_ON = ['chatCopy', 'quickPolish', 'phrasebook', 'smartChips', 'slashCommands', 'mysteryDrop', 'togetherTimer', 'placeDrop', 'partyChat', 'readAloud', 'chatExport', 'hopBack', 'hopShare', 'outbox', 'fileDrop', 'lenses', 'autoEdit', 'miniVote', 'pin3', 'saveStack', 'loveTrail', 'moodDrop', 'emojiSuggest'];

function readFlags() {
  // Parse the catalogue straight from the sources so the table never drifts from the code.
  const app = fs.readFileSync(path.join(root, 'admin/src/App.tsx'), 'utf8');
  const keys = JSON.parse(app.match(/const FEATURE_KEYS = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  const descSrc = app.match(/const FEATURE_DESC[^=]*= \{([\s\S]*?)\n\};/)[1];
  const desc = {}; for (const m of descSrc.matchAll(/(\w+): (['"])(.*?)\2(?=,|\s*$)/gm)) desc[m[1]] = m[3].replace(/\\'/g, "'");
  const py = fs.readFileSync(path.join(root, 'backend/app/config_resolver.py'), 'utf8');
  const onList = [...py.match(/"features": \{k: True for k in \[([\s\S]*?)\]\}/)[1].matchAll(/"(\w+)"/g)].map(m => m[1]);
  const money = [...py.match(/MONEY_FLAGS = \[(.*?)\]/)[1].matchAll(/"(\w+)"/g)].map(m => m[1]);
  return keys.map(k => [k, desc[k] || '', money.includes(k) ? 'Off' : onList.includes(k) ? 'On' : 'On (not set)']);
}
function readScreens() {
  const app = fs.readFileSync(path.join(root, 'admin/src/App.tsx'), 'utf8');
  return JSON.parse(app.match(/const SCREEN_KEYS = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
}

async function adminGuide() {
  const parts = [];
  parts.push(cover('Admin Guide', 'Run VibeLoop: members, moderation, server-driven app config, money, realtime and security — page by page.', 'For VibeLoop staff · Admin Panel'));
  parts.push(toc([['Login & roles'], ['Admin pages, in sidebar order', ADMIN_GROUPS.map(g => g[0]).join(' · ')], ['Server-driven config layers', 'global → country → zone → tier → language'],
    ['Feature switches catalogue'], ['Screen switches, themes & module names'], ['Promotions & admin posting'], ['Moderation, reports & reviews'], ['Money & Plugs'],
    ['Realtime, calls, push & E2EE'], ['Audit log & security notes'], ['Deployment & scaling'], ['Troubleshooting'], ['Demo credentials (TEST ONLY)']]));

  parts.push(divider(1, 'Login & roles', 'Who can get into the Admin Panel and how.'));
  parts.push(`<section><h2>Signing in</h2>${await desk(A + '00-login.png')}
    <ol class="steps"><li>Open the Admin Panel URL (local dev: <code>http://localhost:5173</code>).</li><li>Enter your staff email and password and sign in.</li><li>Sessions are JWTs with a 12-hour lifetime; "logout everywhere" invalidates every token.</li></ol>
    <h3>Roles</h3>${ul(['All `/admin/*` API routes require the **owner** role; a test walks every admin route and asserts 403 for users and 401 for anonymous callers.', 'Role Matrix shows intended finer permissions (moderator, finance…), but fine-grained admin permissions are **not enforced** yet — every staff member is effectively owner.', 'Sensitive decisions (publish, payout, admin decisions) require an approval token bound to actor + action + payload, valid 5 minutes, single use.'])}
    ${note('MFA for staff is not enforced yet (the flag exists). Use strong unique passwords and restrict who has owner accounts.')}</section>`);

  parts.push(divider(2, 'Admin pages', 'Every page in sidebar order: what you see, what each control does and what changes in the app.'));
  for (const [g, pages] of ADMIN_GROUPS) {
    parts.push(`<section class="sec"><h2>${esc(g)}</h2>`);
    for (const [t, file, route, what, how, effect] of pages) {
      parts.push(`<div class="apage"><h3>${esc(t)}</h3><div class="where">Sidebar route <code>#/${esc(route)}</code></div>${await desk(A + file)}
        <p>${md(what)}</p>${how.length ? ul(how) : ''}${effect ? `<p><b>Effect in the app:</b> ${md(effect)}</p>` : ''}</div>`);
    }
    parts.push('</section>');
  }
  parts.push(`<section class="sec"><h2>User App Settings & All Switches</h2>
    <p><b>User App Settings</b> (<code>#/userapp</code>) is one schema-driven form for every user-facing default and limit, grouped Glow / Hush / Global — e.g. Blink max hours (24), post video max (60 s), max photos per post (10), upload cap (1024 MB), allowed lenses, feed tabs, reaction set, default who-can-message, read receipts, last seen, fade timer, max group size (50), chat file size (100 MB), voice note max (300 s), call types, Mood duration (24 h), edit window (15 min), unsend window (60 min), sign-up open, OTP resend cooldown, max accounts per email (5), maintenance mode and message, minimum app version + force update, auto-hide after N reports (5). Settings marked enforced are checked server-side.</p>
    <p><b>All Switches</b> (<code>#/switches</code>) lists every feature switch in one place (see the catalogue chapter). These two pages have no screenshot in this edition.</p></section>`);

  parts.push(divider(3, 'Server-driven config layers', 'One config, resolved per viewer.'));
  parts.push(`<section><h2>How a user's config is built</h2>
    <p>The app downloads <code>GET /app-config</code> on start and when it returns to the foreground. The server deep-merges layers in this order — later layers win:</p>
    <div class="layers"><span>built-in BASE</span><em>→</em><span>base (global)</span><em>→</em><span>country:XX</span><em>→</em><span>zone:KEY</span><em>→</em><span>slab:tier</span><em>→</em><span>lang:xx</span></div>
    ${ul(['**Country** comes from the user\'s profile (default IN). **Zone** is the first zone listing that country (else the "*" zone). Zones can also list **states** (used by promo targeting).', '**Slab (tier)** is picked from follower count (Starter / Rising / Pro).', '**Language** from the profile or the default.', 'Objects merge key by key; nav lists merge by item key; other values replace.', 'Language layers may only change strings and nav labels — never themes or other settings.', 'Every save bumps a version and invalidates caches; other API processes may serve the old config for up to 5 s without Redis.', 'Each layer is validated before saving: unknown keys, wrong types, nav with zero enabled tabs, bad module names, STUN-only rtc, theme contrast. The exact error is shown in the console.'])}
    ${tbl(['Top-level key', 'What it controls'], [['modules', 'Glow/Hush on/off'], ['nav', 'Tabs per module'], ['screens', 'Screen on/off'], ['features', 'Feature flags'], ['limits', 'Numbers (group size, timers, upload caps…)'], ['fees', 'platformFee (0.08)'], ['languages', 'available, default, strings'], ['banner', 'Optional banner'], ['theme', 'Colours / nav style per module'], ['moduleNames', 'Glow / Hush display names'], ['rtc', 'Public STUN servers only'], ['defaults / access', 'User App Settings values']])}
    <p>Use <b>Preview Room</b> to see the merged result for any country / state / tier / language before you ship.</p></section>`);

  const flags = readFlags();
  parts.push(divider(4, 'Feature switches catalogue', `${flags.length} flag keys, with meaning and default.`));
  parts.push(`<section><h2>Feature flags</h2><p>Edited in Feature Dials / All Switches per layer. Server-enforced flags answer <b>403 "Not enabled"</b> when off; client-only flags (<code>liveCamera</code>, <code>demoMode</code>) just hide UI. "On (not set)" means the key is not in the built-in base, so the app treats it as on until a layer sets it to false.</p>
    ${tbl(['Key', 'Meaning', 'Default'], flags.map(([k, d, def]) => [`<code>${k}</code>`, esc(d), `<span class="${def === 'Off' ? 'off' : 'on'}">${def}</span>`]))}
    ${note('`money`, `subscriptions`, `store`, `tips`, `ads`, `platformFees` default **off** and are mirrored from the Money switches page. `productReviews` additionally needs money + store on. `reviews` is a master over `vouches` and `productReviews`.', 'info')}</section>`);

  parts.push(divider(5, 'Screens, themes & module names', 'What the app looks like and which screens exist, per layer.'));
  parts.push(`<section><h2>Screen switches</h2><p>Every screen key below can be switched off per layer in <b>Screen Switches</b>. Tabs are controlled in Nav Builder. Some stack screens are also gated by their feature (Call → calls, Snap view → snaps, Live Lens → liveCamera, Follow Knocks → followRequests, Hush settings → hushSettings).</p>
    <p>${readScreens().map(s => `<span class="pill">${esc(s)}</span>`).join('')}</p>
    <h2>Themes</h2>${tbl(['Module', 'Presets', 'Default'], [['Glow (social)', 'studio · prism · sunset · ocean', 'studio'], ['Hush (chat)', 'mono · aqua · midnight · coral', 'mono']])}
    ${ul(['Editable: primary, secondary, tertiary (Glow), accent, bg, surface, ink as #RRGGBB; navStyle pill|dock; radius sharp|soft|round; density compact|comfy.', 'Ink on bg must reach 4.5:1 contrast on every layer combination.'])}
    <h2>Module names & labels</h2>${ul(['Default names: **Glow** and **Hush**. Rename in Nav Builder → Module names (1–16 chars).', 'Default tabs — Glow: Hub, Drift, Make, Flicks, Me · Hush: Hush, Squad, Moods, Hoods, Me.', 'Default content names: Drops (posts), Blinks (stories), Stash (store), Backstage Pass (subscription), Props (tip), Cashout (payout), Boosts (ads).', 'Screen keys never change — only labels/strings.'])}</section>`);

  parts.push(divider(6, 'Promotions & admin posting', 'Brand promos, announcements and CMS content.'));
  parts.push(`<section><h2>Promos</h2>${ul(['Create in **Promos**: kind, placements, targeting, schedule, priority, active.', 'Targeting: **global**, or any of countries / zones / states — non-empty lists combine with AND (countries [IN] + states [TN] = Tamil Nadu only).', 'Shown to matching users labelled "From VibeLoop", ordered by priority, within the start/end window.', 'Use the preview (country/state/placement) before activating.', 'Feature `promos` off → the app receives no promos.'])}
    <h2>Admin posting</h2>${ul(['**Megaphone** — announcements to Everyone / Creators / Fans / Staff.', '**Page Studio** — Help Hub, rules, privacy, SOS Lane, guides, Get the Apps (versioned, restore any version, publish toggle).', '**The Loopdown / Hush Notes / Fresh Wire** — blog and news (features `blog`, `news`).'])}</section>`);

  parts.push(divider(7, 'Moderation, reports & reviews', 'Keeping people safe.'));
  parts.push(`<section>${tbl(['Where', 'What you do', 'Result'], [
    ['Mod Queue', 'Approve / Remove / Escalate with a reason code', 'Content hidden or restored; author notified'],
    ['Speak Up Desk', 'Triage by priority; status open → reviewing → actioned → closed; public note; action warn / remove_content / suspend_user', 'Reporter gets updates; remove_content hides posts, deletes messages, unlists products, suspends Hoods; suspend signs the user out'],
    ['Reviews Desk', 'Hide / show / delete Vouches and Real Talk', 'Hidden reviews vanish from the app'],
    ['Stash', 'Deactivate products', 'Product unlisted'],
    ['Control Room → Moderation', 'Auto-hold thresholds, reason codes, blocked phrases', 'Applies to new content'],
    ['User App Settings', 'Auto-hide a post after N reports (default 5)', 'Enforced server-side']])}
    ${ul(['Priorities: **urgent** (self-harm or marked urgent — reporter sees SOS Lane info), **high** (harassment, scam, impersonation), **normal**. Non-urgent reports are capped at 20/day per user.', 'End-to-end encrypted messages cannot be read or moderated by staff; act on reports using the reporter\'s evidence.'])}
    ${note('No automated malware scanning or image re-encoding yet (EXIF/location metadata is not stripped). Uploads are checked by extension + magic bytes; executables are rejected.')}</section>`);

  parts.push(divider(8, 'Money & Plugs', 'Everything money is off until you switch it on.'));
  parts.push(`<section>${ul(['Order of operations: add provider keys in **Plugs** → test → set prices (**Country pricing**, **Backstage Pass** plans) → turn on the **Money** master → turn on individual features.', 'Prices are stored in minor units (paise / cents); INR first, per-country overrides.', 'Checkout opens the provider\'s hosted payment link. Without keys, the app says "Payments not configured by admin" (409) — never a fake success.', 'Only a verified webhook marks an order paid (Razorpay HMAC-SHA256 of body; Cashfree HMAC of timestamp + body within ±5 min); replays are no-ops.', 'Platform fee default 8%; Cash Flow counts real paid orders only (seed demo orders excluded).', 'Prefer Razorpay to stay phone-free — Cashfree links may require a customer phone.'])}
    <h2>Plugs</h2>${tbl(['Plug', 'Fields (* = encrypted, shown masked)'], [['razorpay', 'mode test|live, keyId, keySecret*, webhookSecret*'], ['cashfree', 'mode, appId, secretKey*, webhookSecret*'], ['msg91', 'mode, authKey*, templateId, sender — email/SMS OTP delivery'], ['maps', 'provider google|mapbox, key*'], ['turn', 'urls, username, credential*, sharedSecret*'], ['expo', 'accessToken*']])}
    ${note('Secrets are encrypted with `MASTER_KEY` (Fernet), never returned or logged, and shown only as ••••last4. Rotating MASTER_KEY means re-entering every provider key. `/admin/kv/integrations` is refused — keys only go through Plugs.', 'info')}
    ${note('No provider keys ship with VibeLoop. Email/SMS OTP, payments, maps, TURN and push credentials all need setup before launch.')}</section>`);

  parts.push(divider(9, 'Realtime, calls, push & E2EE', 'The v6 realtime layer and its honest limits.'));
  parts.push(`<section>${tbl(['Area', 'What exists', 'Needs setup / not yet'], [
    ['Realtime (/ws)', 'WebSocket gateway: messages, receipts, typing, presence, call signaling. Same auth as REST; 64 KB frames, 30/s.', 'Multiple API processes need REDIS_URL for fan-out. Realtime Monitor counts are per process.'],
    ['Calls', '1:1 voice & video (WebRTC), call log, missed-call notices. Public STUN by default.', '**TURN server** must be configured in Plugs → turn, or calls fail on strict NATs/mobile networks.'],
    ['Push', 'Expo push sends for DMs, mentions, requests, calls; quiet hours & Focus Switch respected; per-send log; test push.', '**Firebase (FCM) credentials** must be in the Android build; FCM-direct tokens are stored but not sent. Optional Expo access token in Plugs. Push queue is in-process (lost on crash).'],
    ['E2EE', '1:1 text via NaCl box (X25519 + XSalsa20-Poly1305); key directory ≤ 5 devices; server stores "[encrypted]".', '**No forward secrecy**, no multi-device fan-out, no key verification, no group/media encryption. Metadata visible to server.'],
    ['Snaps / view-once', 'Media served once via a 60 s signed link; expires after 24 h.', 'Screenshot detection is best effort (client reports).'],
    ['Live streaming', '—', 'Not built (Live Lane shows "not ready yet"). Face-tracking AR lenses not built.']])}</section>`);

  parts.push(divider(10, 'Audit log & security', 'What is enforced today and the known gaps.'));
  parts.push(`<section><h2>Paper Trail</h2><p>Every staff action and auth event is written to the audit log (actor, action, target, time). Entries use handles/ids and never contain secrets. Logs redact tokens, codes and full email addresses.</p>
    <h2>Enforced</h2>${ul(['OTP: 6 digits, HMAC-hashed, 5-minute TTL, 5 wrong tries burns the code, no account enumeration.', 'Rate limits: login 10, OTP request 5, OTP verify 10, register 5 per 15 min (per identifier and per IP) → 429 with Retry-After. Write limits on messages, posts, comments, reports, uploads.', 'Ownership/membership checks on every id-taking route; chat attachments only for members or via short-lived signed links.', 'Uploads ≤ 1 GB resumable; extension + magic bytes must agree; served with nosniff and a sandbox CSP.', '`ENV=prod` refuses to start with weak/missing secrets, DEMO_OTP=1 or CORS `*`.', 'Security headers, CORS allow-list, request body caps, statement timeouts.'])}
    <h2>Known gaps</h2>${ul(['No refresh tokens / device session list (revocation is logout-all).', 'No staff MFA enforcement; single owner role.', 'No antivirus scanning; EXIF not stripped.', 'Rate limits fixed in code; in-memory limiter is per process without Redis.', 'No WAF/CAPTCHA; no dependency scanning in CI.', 'Account deletion fulfilment is manual; retention is dry-run.', 'Secret rotation is manual.'])}</section>`);

  parts.push(divider(11, 'Deployment & scaling', 'Production-shaped, not yet load-tested at scale.'));
  parts.push(`<section>${ul(['Stack: FastAPI + PostgreSQL 16 (+ PgBouncer, read replica) + Redis; admin is React/Vite; mobile is Expo React Native. Files in `deploy/` (Dockerfile, compose, nginx, k8s with probes, HPA, PDB).', 'Health: `/health/live` (process) and `/health/ready` (DB; Redis reported as degraded but still ready).', 'Measured on one laptop: ~440 req/s aggregate with zero errors — not a capacity number.', 'Planning: ~800–1,500 req/s and 10–20k idle WebSockets per 4 vCPU pod (estimate). 100k DAU ≈ 3 API pods.'])}
    <h3>Hard limits before launch</h3>${ul(['Media is on local disk — one machine only until moved to object storage + CDN.', 'Push queue is in-process (at-most-once).', 'Single Postgres primary for all writes; read replica not yet wired into feed/search.', 'Hush falls back to polling every 5 s when the socket is down.'])}
    <h3>Production checklist (short)</h3><ol class="steps"><li>ENV=prod with all secrets from a secret manager (≥ 32 chars, different).</li><li>DEMO_OTP=0, MSG91 configured and an OTP delivered end to end.</li><li>Exact CORS origins over https; TLS + HSTS at the load balancer; TRUST_PROXY=1 only behind it.</li><li>DATABASE_URL with sslmode=require, backups + PITR; run alembic upgrade head (never seed).</li><li>REDIS_URL whenever more than one worker/replica runs.</li><li>Persistent MEDIA_DIR (or object storage); payment webhooks pointing at /webhooks/razorpay|cashfree.</li><li>Change or remove the seeded demo accounts.</li></ol></section>`);

  parts.push(divider(12, 'Troubleshooting', 'Common issues and fixes.'));
  parts.push(`<section>${tbl(['Symptom', 'Cause', 'Fix'], [
    ['"Too many attempts" on login / code', 'Rate limit: OTP request 5, verify 10, login 10 per 15 min per identifier and per IP (429 + Retry-After).', 'Wait 15 min. In dev, restarting the API clears the in-memory limiter (with Redis, keys expire on their own). Check Login Watch.'],
    ['Users get no code', 'MSG91 not configured; demo code only appears with DEMO_OTP=1 (never in prod).', 'Add MSG91 keys in Plugs and Test.'],
    ['APK can\'t reach the server', 'APK baked with a URL the phone can\'t reach (localhost).', 'Use the computer\'s LAN IP (e.g. http://192.168.x.x:8787) in mobile/.env EXPO_PUBLIC_API_URL, run uvicorn with --host 0.0.0.0, same Wi-Fi; or change it on the sign-in screen → Server.'],
    ['Calls: "Connection failed"', 'No TURN relay; STUN only.', 'Configure Plugs → turn (coturn shared secret recommended).'],
    ['No push on Android', 'Build lacks Firebase/EAS push credentials, or `push` flag off.', 'Add credentials to the build; use Push Center → test.'],
    ['Checkout says "Payments not configured"', 'No provider keys.', 'Add Razorpay/Cashfree keys in Plugs.'],
    ['Money UI missing', 'Money master or feature off for that layer.', 'Money switches + Feature Dials; check Preview Room.'],
    ['Config save rejected', 'Validation (unknown key, no enabled tab, contrast < 4.5:1, TURN in rtc…).', 'Read the error; fix and save again.'],
    ['Change not visible in app', 'Config cached ≤ 5 s per process; app reloads on foreground.', 'Wait a few seconds, background/foreground the app.'],
    ['API won\'t start in prod', 'Production guard: missing/weak secrets, DEMO_OTP=1 or CORS *.', 'Fix env per SECURITY.md checklist.'],
    ['403 "Not enabled"', 'Feature flag off for that user\'s layer.', 'Feature Dials / Preview Room.']])}</section>`);

  parts.push(divider(13, 'Demo credentials', 'TEST ONLY — seed data for local development.'));
  parts.push(`<section><h2>Demo credentials</h2>${note('These accounts exist only in the development seed (`python -m app.seed`). Never use them in production — change or delete them before launch (production checklist item 10). Demo OTP codes are shown only when DEMO_OTP=1.', 'warn')}
    ${tbl(['Where', 'Login', 'How'], [
      ['Admin Panel', '<code>admin@vibeloop.app</code> / <code>Vibeloop2026</code>', 'Email + password on the admin login page'],
      ['App — account 1', '<code>@riya.makes</code>', '"Send login code" → tap <b>Use</b> on the demo code'],
      ['App — account 2', '<code>@riya.chats</code>', 'Add another account → same demo-code flow']])}
    <p>The app also has an "Offline demo" button on sign-in while the <code>demoMode</code> flag is on — switch it off for launch.</p></section>`);
  return parts.join('\n');
}

/* ============================== render ============================== */
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const ctx = await browser.newContext();
  imgPage = await ctx.newPage();
  await imgPage.setContent('<html><body></body></html>');
  const jobs = [
    ['VibeLoop-User-Guide.pdf', 'User Guide', userGuide, ['#5B4CF5', '#D4FF3F']],
    ['VibeLoop-Admin-Guide.pdf', 'Admin Guide', adminGuide, ['#0D9488', '#7CF5E0']],
  ];
  for (const [file, title, build, [a1, a2]] of jobs) {
    console.log('building', file);
    const body = await build();
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>VibeLoop ${title}</title><style>${CSS(a1, a2)}</style></head><body>${body}</body></html>`;
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const out = path.join(outDir, file);
    await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true, ...headerFooter(title) });
    await page.close();
    const mb = (fs.statSync(out).size / 1048576).toFixed(1);
    const pages = (fs.readFileSync(out, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    console.log(`  ${path.relative(root, out)} — ${pages} pages, ${mb} MB`);
  }
} finally { await browser.close(); }
