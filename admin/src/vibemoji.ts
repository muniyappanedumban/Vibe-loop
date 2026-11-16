// VibeMoji — 1000 original, procedurally composed emoji. Pure function → SVG string (shared by mobile + admin).
// Each emoji = body shape × gradient palette × eyes × mouth × accessory; combinations are de-duplicated.
export type VibeMojiDef = { id: number; name: string; category: string; shape: number; pal: number; eyes: number; mouth: number; acc: number };

const SHAPES = [
  'M24 4c12 0 20 8 20 20s-8 20-20 20S4 36 4 24 12 4 24 4z',                                   // orb
  'M14 4h20a10 10 0 0 1 10 10v20a10 10 0 0 1-10 10H14A10 10 0 0 1 4 34V14A10 10 0 0 1 14 4z', // squircle
  'M24 3c9 0 21 7 21 19 0 13-10 23-21 23S3 36 4 22C5 10 15 3 24 3z',                           // blob
  'M24 3l18 10.5v21L24 45 6 34.5v-21z',                                                         // hex
  'M24 3c10 11 19 18 19 27a19 19 0 0 1-38 0c0-9 9-16 19-27z',                                   // drop
  'M24 5c4 0 6 3 9 4s7 1 9 5-1 7 0 10 3 7 0 10-6 3-8 6-5 5-10 5-7-3-10-5-7-3-8-6 1-7 0-10-3-7 0-10 6-4 9-5 5-4 9-4z', // flower
];
const PALS: [string, string][] = [
  ['#8B5CFF', '#5A2BF0'], ['#FF6FB5', '#FF2E8A'], ['#FFB067', '#FF7A2E'], ['#37E0B4', '#14B88D'], ['#5CC8FF', '#2B7BF0'],
  ['#D8FF7A', '#9ED62B'], ['#FFD45C', '#FFA62E'], ['#B9B5CC', '#8A85A3'], ['#FF8A8A', '#E8384F'], ['#9E8CFF', '#FF5FAE'],
  ['#7BF2E0', '#6C3BFF'], ['#FFC1E3', '#C86BFF'], ['#3D3566', '#120F24'], ['#FFE08A', '#FF6F91'], ['#8EF5A0', '#2BB3D9'],
  ['#FF9E5C', '#C2185B'], ['#A0E7FF', '#7A5CFF'], ['#F5F0FF', '#C9BEF5'], ['#6EE7B7', '#3B82F6'], ['#FDA4AF', '#F97316'],
];
const W = '#fff', K = '#120F24';
const EYES = [
  `<circle cx="17" cy="21" r="2.8" fill="${W}"/><circle cx="31" cy="21" r="2.8" fill="${W}"/>`,
  `<path d="M14 21.5c1.2-2.4 4.8-2.4 6 0M28 21.5c1.2-2.4 4.8-2.4 6 0" stroke="${W}" stroke-width="2.8" stroke-linecap="round" fill="none"/>`,
  `<path d="M14 20h6M28 20h6" stroke="${W}" stroke-width="2.8" stroke-linecap="round"/>`,
  `<circle cx="17" cy="21" r="4.4" fill="${W}"/><circle cx="31" cy="21" r="4.4" fill="${W}"/><circle cx="18" cy="22" r="2" fill="${K}"/><circle cx="32" cy="22" r="2" fill="${K}"/>`,
  `<path d="M17 17.5l1.1 2.3 2.5.3-1.8 1.7.5 2.5-2.3-1.2-2.3 1.2.5-2.5-1.8-1.7 2.5-.3zM31 17.5l1.1 2.3 2.5.3-1.8 1.7.5 2.5-2.3-1.2-2.3 1.2.5-2.5-1.8-1.7 2.5-.3z" fill="${W}"/>`,
  `<path d="M17 24s-3.5-2.2-3.5-4.2c0-2 2.6-2.6 3.5-.9.9-1.7 3.5-1.1 3.5.9 0 2-3.5 4.2-3.5 4.2zM31 24s-3.5-2.2-3.5-4.2c0-2 2.6-2.6 3.5-.9.9-1.7 3.5-1.1 3.5.9 0 2-3.5 4.2-3.5 4.2z" fill="${W}"/>`,
  `<path d="M14 19l6 3M34 19l-6 3" stroke="${W}" stroke-width="2.8" stroke-linecap="round"/>`,
  `<circle cx="17" cy="21" r="2.8" fill="${W}"/><path d="M28 21h6" stroke="${W}" stroke-width="2.8" stroke-linecap="round"/>`,
  `<path d="M14 22.5c1.2 2.2 4.8 2.2 6 0M28 22.5c1.2 2.2 4.8 2.2 6 0" stroke="${W}" stroke-width="2.8" stroke-linecap="round" fill="none"/>`,
  `<rect x="12" y="17" width="10" height="7" rx="3" fill="${K}"/><rect x="26" y="17" width="10" height="7" rx="3" fill="${K}"/><path d="M22 20h4" stroke="${K}" stroke-width="2"/>`,
  `<path d="M14.5 18.5l5 5M19.5 18.5l-5 5M28.5 18.5l5 5M33.5 18.5l-5 5" stroke="${W}" stroke-width="2.6" stroke-linecap="round"/>`,
  `<circle cx="17" cy="21" r="3.6" fill="none" stroke="${W}" stroke-width="2.4"/><circle cx="31" cy="21" r="3.6" fill="none" stroke="${W}" stroke-width="2.4"/>`,
];
const MOUTHS = [
  `<path d="M16 29c2.5 4.5 13.5 4.5 16 0" stroke="${W}" stroke-width="3" stroke-linecap="round" fill="none"/>`,
  `<path d="M16 28h16c0 5-3.6 8-8 8s-8-3-8-8z" fill="${W}"/>`,
  `<path d="M18 31h12" stroke="${W}" stroke-width="3" stroke-linecap="round"/>`,
  `<ellipse cx="24" cy="32" rx="4" ry="4.6" fill="${W}"/>`,
  `<path d="M17 34c4-3.5 10-3.5 14 0" stroke="${W}" stroke-width="3" stroke-linecap="round" fill="none"/>`,
  `<path d="M18 31c2-2 4 2 6 0s4 2 6 0" stroke="${W}" stroke-width="2.6" stroke-linecap="round" fill="none"/>`,
  `<path d="M19 30c3 3 7 3 10 0" stroke="${W}" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M26 32c0 3 3 3 3 0" fill="#FF6F91"/>`,
  `<path d="M20 30a4 3 0 0 0 8 0" fill="${W}"/>`,
  `<path d="M16 30c3 2 5-1 8 0s5 2 8 0" stroke="${W}" stroke-width="2.6" stroke-linecap="round" fill="none"/>`,
  `<path d="M18 29l3 3 3-3 3 3 3-3" stroke="${W}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  `<circle cx="24" cy="31" r="2.4" fill="${W}"/>`,
  `<path d="M17 29h14l-2 5h-10z" fill="${W}"/><path d="M17 29h14" stroke="${W}" stroke-width="2" stroke-linecap="round"/>`,
];
const ACCS = [
  '',
  `<path d="M38 5l1.4 3.2L43 9l-3.6.8L38 13l-1.4-3.2L33 9l3.6-.8z" fill="#C8F45A"/>`,
  `<path d="M39 8.5c-1.2-1.6-3.6-.8-3.6 1.1 0 1.8 3.6 4 3.6 4s3.6-2.2 3.6-4c0-1.9-2.4-2.7-3.6-1.1z" fill="#FF3D9A"/>`,
  `<path d="M38 3l-3 6h4l-3 6" stroke="${K}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  `<path d="M15 8l3 4 6-6 6 6 3-4v6H15z" fill="#FFD45C" stroke="${K}" stroke-width="1"/>`,
  `<ellipse cx="24" cy="4.5" rx="10" ry="2.6" fill="none" stroke="#FFE08A" stroke-width="2.2"/>`,
  `<path d="M36 25c0 2.5 1.5 4 1.5 4s1.5-1.5 1.5-4-1.5-4-1.5-4-1.5 1.5-1.5 4z" fill="#7FD0FF"/>`,
  `<circle cx="12.5" cy="28" r="2.8" fill="#FF6F91" opacity=".7"/><circle cx="35.5" cy="28" r="2.8" fill="#FF6F91" opacity=".7"/>`,
  `<path d="M38 4v7.5a2 2 0 1 1-1.5-1.9V4.5l5-1v2.5z" fill="${K}"/>`,
  `<path d="M36 13c0-5 4-8 8-8 0 5-4 8-8 8z" fill="#2BD9A8"/>`,
  `<path d="M39 3c2 3 4 4 4 7a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 2 1 2s0-3 1-5z" fill="#FF8A3D"/>`,
  `<circle cx="40" cy="9" r="4" fill="${W}" stroke="${K}" stroke-width="1.4"/><path d="M40 7v2.5l1.5 1" stroke="${K}" stroke-width="1.2" stroke-linecap="round"/>`,
];
const CATS = ['Joy', 'Love', 'Chill', 'Wow', 'Feels', 'Fierce', 'Silly', 'Hype', 'Calm', 'Party'];
const ADJ = ['Sunny', 'Velvet', 'Cosmic', 'Minty', 'Electric', 'Cozy', 'Neon', 'Misty', 'Brave', 'Fizzy', 'Lucky', 'Gentle', 'Wild', 'Dreamy', 'Zesty', 'Chill', 'Bouncy', 'Glowy', 'Sleepy', 'Spicy', 'Breezy', 'Sparkly', 'Mellow', 'Jolly', 'Starry'];
const NOUN2 = ['Fizz', 'Glimmer', 'Doodle', 'Sprout', 'Twinkle', 'Nugget', 'Pixel', 'Quokka', 'Ember', 'Marble', 'Tango', 'Ziggy', 'Pudding', 'Breeze', 'Kiwi', 'Lumen', 'Pogo', 'Rumble', 'Sherbet', 'Yonder'];
const NOUN = ['Beam', 'Bloop', 'Pip', 'Nova', 'Puff', 'Zing', 'Mochi', 'Drift', 'Twirl', 'Bolt', 'Pebble', 'Ripple', 'Comet', 'Bubble', 'Spark', 'Echo', 'Petal', 'Wisp', 'Jelly', 'Orbit'];

const mix = (k: number) => { let h = (k + 1) * 2654435761; h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16; return h >>> 0; };
export const VIBEMOJI: VibeMojiDef[] = (() => {
  const out: VibeMojiDef[] = []; const seen = new Set<string>();
  for (let k = 0; out.length < 1000; k++) {
    const h = mix(k);
    const d = { shape: h % SHAPES.length, pal: (h >>> 3) % PALS.length, eyes: (h >>> 8) % EYES.length, mouth: (h >>> 13) % MOUTHS.length, acc: (h >>> 18) % ACCS.length };
    const key = `${d.shape}.${d.pal}.${d.eyes}.${d.mouth}.${d.acc}`; if (seen.has(key)) continue; seen.add(key);
    const i = out.length;
    out.push({ id: i + 1, name: `${ADJ[i % 25]} ${[...NOUN, ...NOUN2][Math.floor(i / 25)]}`, category: CATS[(d.mouth + d.eyes) % CATS.length], ...d });
  }
  return out;
})();
export const VIBEMOJI_CATEGORIES = CATS;

export function vibemojiSvg(id: number, uid = ''): string {
  const d = VIBEMOJI[(id - 1 + VIBEMOJI.length) % VIBEMOJI.length];
  const g = `vm${id}${uid}`;
  const [a, b] = PALS[d.pal];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><path d="${SHAPES[d.shape]}" fill="url(#${g})"/><path d="${SHAPES[d.shape]}" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="1.2"/>${EYES[d.eyes]}${MOUTHS[d.mouth]}${ACCS[d.acc]}</svg>`;
}
/** Named reaction set (feature group "Vibe Expression"). */
export const REACTIONS = [
  { key: 'heart', label: 'Vibe Heart', id: 7 }, { key: 'fire', label: 'Heat Wave', id: 42 }, { key: 'laugh', label: 'Giggle Burst', id: 118 },
  { key: 'touch', label: 'Soft Spot', id: 203 }, { key: 'clap', label: 'Big Applause', id: 77 }, { key: 'boom', label: 'Mind Pop', id: 311 },
];
