// BubbleMoji — the Chat module's own 1000 original emoji: speech-bubble characters (Social uses VibeMoji).
export type BubbleDef = { id: number; name: string; category: string; body: number; pal: number; eyes: number; mouth: number; acc: number };
const BODIES = [
  'M10 6h28a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H20l-9 7v-7h-1a6 6 0 0 1-6-6V12a6 6 0 0 1 6-6z',
  'M10 6h28a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6h-1v7l-9-7H10a6 6 0 0 1-6-6V12a6 6 0 0 1 6-6z',
  'M24 5c11 0 20 7.6 20 17s-9 17-20 17c-2.4 0-4.7-.3-6.8-1L8 43l2.6-8.4C6.6 31.4 4 27 4 22 4 12.6 13 5 24 5z',
  'M13 7c2-3 7-3 9 0 2-2.5 7-2 8.5 1.5 4-.5 7 3 6 6.5 3.5 1.5 4 6.5.5 8.5 1.5 3.5-1.5 7.5-5.5 7-1 3.5-6 4.5-8.5 2l-8 6 1.5-6.5c-3.5.5-6.5-2.5-5.5-6-3.5-1.5-3.5-6.5 0-8-1.5-4 2-7.5 6-6.5z',
];
const PALS: [string, string][] = [['#2EE6C4', '#00A889'], ['#5ED3FF', '#1489E6'], ['#FF9A7A', '#FF5A5A'], ['#FFD86B', '#FFA83C'], ['#A8F06B', '#3CC46E'], ['#B6A4FF', '#6C5CF0'],
  ['#FF8FC8', '#E84A9A'], ['#7FE9F5', '#14B8C8'], ['#2C4B53', '#0B1F24'], ['#E9F7F4', '#B5DCD5'], ['#FFB86B', '#FF6B9A'], ['#6BF0D0', '#14A8E6']];
const W = '#fff', K = '#0B1F24';
const EYES = [
  `<circle cx="18" cy="19" r="2.6" fill="${W}"/><circle cx="30" cy="19" r="2.6" fill="${W}"/>`,
  `<path d="M15.5 19.5c1-2 4-2 5 0M27.5 19.5c1-2 4-2 5 0" stroke="${W}" stroke-width="2.6" stroke-linecap="round" fill="none"/>`,
  `<path d="M15.5 18.5h5M27.5 18.5h5" stroke="${W}" stroke-width="2.6" stroke-linecap="round"/>`,
  `<circle cx="18" cy="19" r="4" fill="${W}"/><circle cx="30" cy="19" r="4" fill="${W}"/><circle cx="19" cy="20" r="1.8" fill="${K}"/><circle cx="31" cy="20" r="1.8" fill="${K}"/>`,
  `<path d="M18 22s-3.2-2-3.2-3.8c0-1.8 2.4-2.4 3.2-.8.8-1.6 3.2-1 3.2.8 0 1.8-3.2 3.8-3.2 3.8zM30 22s-3.2-2-3.2-3.8c0-1.8 2.4-2.4 3.2-.8.8-1.6 3.2-1 3.2.8 0 1.8-3.2 3.8-3.2 3.8z" fill="${W}"/>`,
  `<circle cx="18" cy="19" r="2.6" fill="${W}"/><path d="M27.5 19.5c1-2 4-2 5 0" stroke="${W}" stroke-width="2.6" stroke-linecap="round" fill="none"/>`,
  `<path d="M15.5 17.5l5 3M32.5 17.5l-5 3" stroke="${W}" stroke-width="2.6" stroke-linecap="round"/>`,
  `<rect x="13.5" y="16" width="9" height="6" rx="3" fill="${K}"/><rect x="25.5" y="16" width="9" height="6" rx="3" fill="${K}"/><path d="M22.5 18.5h3" stroke="${K}" stroke-width="1.8"/>`,
];
const MOUTHS = [
  `<path d="M18 26c2 3.5 10 3.5 12 0" stroke="${W}" stroke-width="2.8" stroke-linecap="round" fill="none"/>`,
  `<path d="M17.5 25h13c0 4-3 6.5-6.5 6.5s-6.5-2.5-6.5-6.5z" fill="${W}"/>`,
  `<path d="M20 27.5h8" stroke="${W}" stroke-width="2.8" stroke-linecap="round"/>`,
  `<ellipse cx="24" cy="28" rx="3.2" ry="3.8" fill="${W}"/>`,
  `<path d="M19 30c3-3 7-3 10 0" stroke="${W}" stroke-width="2.8" stroke-linecap="round" fill="none"/>`,
  `<path d="M19.5 27c1.5-1.5 3 1.5 4.5 0s3 1.5 4.5 0" stroke="${W}" stroke-width="2.4" stroke-linecap="round" fill="none"/>`,
  `<path d="M20 26.5c2.5 2.5 5.5 2.5 8 0" stroke="${W}" stroke-width="2.8" stroke-linecap="round" fill="none"/><path d="M25.5 28.5c0 2.6 2.6 2.6 2.6 0" fill="#FF6B9A"/>`,
  `<circle cx="24" cy="27.5" r="2" fill="${W}"/>`,
];
const ACCS = [
  '', `<circle cx="38" cy="8" r="1.8" fill="${K}"/><circle cx="42" cy="8" r="1.8" fill="${K}"/><circle cx="46" cy="8" r="1.8" fill="${K}"/>`,
  `<path d="M42 2v7M42 12v.5" stroke="#FF5A5A" stroke-width="3" stroke-linecap="round"/>`,
  `<path d="M39 4.5a3 3 0 1 1 3.5 3c-.8.3-1 .8-1 1.8M41.5 12v.5" stroke="${K}" stroke-width="2" stroke-linecap="round" fill="none"/>`,
  `<path d="M38 3h5l-5 5h5M43 9h3l-3 3h3" stroke="${K}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  `<path d="M42 3l1.3 3 3.2.7-3.2.8L42 11l-1.3-3.5-3.2-.8 3.2-.7z" fill="#FFC93C"/>`,
  `<path d="M42 7.5c-1.2-1.6-3.6-.8-3.6 1.1 0 1.8 3.6 4 3.6 4s3.6-2.2 3.6-4c0-1.9-2.4-2.7-3.6-1.1z" fill="#FF5A8A"/>`,
  `<path d="m38 7 3 3 6-6" stroke="#00B39B" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
];
const CATS = ['Chatty', 'Cheer', 'Calm', 'Curious', 'Cozy', 'Cheeky'];
const A = ['Tidal', 'Pebbleo', 'Lagoon', 'Mango', 'Coral', 'Airy', 'Hushy', 'Zippy', 'Comfy', 'Sunlit', 'Foggy', 'Snappy', 'Lofi', 'Beamy', 'Fluffy', 'Spearmint', 'Dozy', 'Perky', 'Wavy', 'Chirpy', 'Toasty', 'Swirly', 'Snoozy', 'Peppy', 'Silky'];
const N = ['Blurb', 'Chirp', 'Murmur', 'Quip', 'Hum', 'Ping', 'Natter', 'Whisper', 'Reverb', 'Gab', 'Buzz', 'Yap', 'Coo', 'Holler', 'Jest', 'Mumble', 'Banter', 'Toot', 'Peep', 'Grumble', 'Chatter', 'Babble', 'Whoop', 'Giggle', 'Drone', 'Squeak', 'Jabber', 'Purr', 'Riff', 'Rustle', 'Prattle', 'Chime', 'Bloopo', 'Warble', 'Gush', 'Hoot', 'Tattle', 'Ditty', 'Zest', 'Tweet'];
const mix = (k: number) => { let h = (k + 7) * 2246822519; h ^= h >>> 15; h = Math.imul(h, 3266489917); h ^= h >>> 13; return h >>> 0; };
export const BUBBLEMOJI: BubbleDef[] = (() => {
  const out: BubbleDef[] = []; const seen = new Set<string>();
  for (let k = 0; out.length < 1000; k++) {
    const h = mix(k); const d = { body: h % 4, pal: (h >>> 3) % 12, eyes: (h >>> 8) % 8, mouth: (h >>> 12) % 8, acc: (h >>> 16) % 8 };
    const key = `${d.body}.${d.pal}.${d.eyes}.${d.mouth}.${d.acc}`; if (seen.has(key)) continue; seen.add(key);
    const i = out.length; out.push({ id: i + 1, name: `${A[i % 25]} ${N[Math.floor(i / 25)]}`, category: CATS[(d.eyes + d.mouth) % 6], ...d });
  }
  return out;
})();
export const BUBBLE_CATEGORIES = CATS;
export function bubbleSvg(id: number, uid = ''): string {
  const d = BUBBLEMOJI[(id - 1 + BUBBLEMOJI.length) % BUBBLEMOJI.length]; const g = `bm${id}${uid}`; const [a, b] = PALS[d.pal];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><path d="${BODIES[d.body]}" fill="url(#${g})"/><path d="${BODIES[d.body]}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.2"/>${EYES[d.eyes]}${MOUTHS[d.mouth]}${ACCS[d.acc]}</svg>`;
}
/** Chat quick-reaction row (Emoji Pop / Emoji Burst). */
export const CHAT_REACTIONS = [3, 17, 42, 88, 120, 233];
