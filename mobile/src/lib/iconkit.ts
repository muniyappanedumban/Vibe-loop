// IconKit — 1000 original icons per module, composed from module-specific glyphs × frames × render styles.
// Glow (social) and Hush (chat) use different glyph sets and palettes, so no icon is shared between modules.
export type Kit = 'glow' | 'hush';
const GLOW_GLYPHS: [string, string][] = [
  ['Spark', 'M12 4l1.8 4.6L18 10l-4.2 1.4L12 16l-1.8-4.6L6 10l4.2-1.4z'], ['Loop', 'M8 12a3 3 0 1 1 6 0 3 3 0 1 1 6 0M4 12a3 3 0 0 1 6 0'], ['Flick', 'M8 6l9 6-9 6z'],
  ['Drop', 'M12 4c3 4 5 6.5 5 9a5 5 0 0 1-10 0c0-2.5 2-5 5-9z'], ['Blink', 'M4 12s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5zM12 10v4'], ['Crown', 'M5 16l-1-8 4 3 4-5 4 5 4-3-1 8z'],
  ['Wave', 'M3 13c2-3 4-3 6 0s4 3 6 0 4-3 6 0'], ['Heart', 'M12 18s-6-3.6-6-8a3.4 3.4 0 0 1 6-2 3.4 3.4 0 0 1 6 2c0 4.4-6 8-6 8z'], ['Bolt', 'M13 3L6 13h5l-1 8 7-10h-5z'],
  ['Comet', 'M15 9a3 3 0 1 1-4 4L4 20M9 7l-3-3M17 15l3 3'], ['Prism', 'M12 4l8 14H4z'], ['Orbit', 'M12 12m-2.5 0a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0M4 12c0-2 4-4 8-4s8 2 8 4-4 4-8 4-8-2-8-4'],
  ['Flame', 'M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z'], ['Star', 'M12 4l2.3 4.8 5.2.7-3.8 3.6.9 5.2L12 15.9 7.4 18.3l.9-5.2-3.8-3.6 5.2-.7z'], ['Lens', 'M12 12m-6 0a6 6 0 1 0 12 0 6 6 0 1 0-12 0M12 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0'],
  ['Clap', 'M7 12l4-6 1 1-2 4 5-5 1 1-4 5 4-3 1 1-4 4c-2 2-5 2-6 0z'], ['Music', 'M9 17V6l9-2v11M9 17a2 2 0 1 1-2-2M18 15a2 2 0 1 1-2-2'], ['Pin', 'M12 21s-6-5.6-6-10.5a6 6 0 0 1 12 0C18 15.4 12 21 12 21zM12 10.5m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0'],
  ['Camera', 'M4 8h4l2-3h4l2 3h4v11H4zM12 13.5m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0'], ['Gift', 'M4 10h16v4H4zM6 14h12v6H6zM12 10v10M12 10c-2-4-6-3-5-1M12 10c2-4 6-3 5-1'],
  ['Trophy', 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6'], ['Rocket', 'M12 3c3 2 4 6 3 10l-3 2-3-2c-1-4 0-8 3-10zM9 15l-2 4 3-1M15 15l2 4-3-1'],
  ['Moon', 'M18 14A7 7 0 0 1 10 5a7 7 0 1 0 8 9z'], ['Leaf', 'M5 19C5 10 11 5 19 5c0 8-5 14-14 14zM5 19l7-7'], ['Diamond', 'M7 4h10l3 5-8 11L4 9z'],
];
const HUSH_GLYPHS: [string, string][] = [
  ['Bubble', 'M5 6h14v9H10l-4 3v-3H5z'], ['Hush', 'M8 10a4 4 0 0 1 8 0v4H8zM6 14h12M12 17v3'], ['Squad', 'M8 9m-2.5 0a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0M16 9m-2.5 0a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0M3 19c1-3 3-4 5-4s4 1 5 4M11 19c1-3 3-4 5-4s4 1 5 4'],
  ['Hood', 'M4 20V10l8-6 8 6v10zM10 20v-5h4v5'], ['Mood', 'M12 12m-8 0a8 8 0 1 0 16 0 8 8 0 1 0-16 0M9 10h.01M15 10h.01M8.5 14.5c2 2 5 2 7 0'], ['Ping', 'M12 4v4M12 16v4M4 12h4M16 12h4M12 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0'],
  ['Lock', 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3'], ['Key', 'M8 12m-4 0a4 4 0 1 0 8 0 4 4 0 1 0-8 0M12 12h8M17 12v3'], ['Shield', 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z'],
  ['Clock', 'M12 12m-8 0a8 8 0 1 0 16 0 8 8 0 1 0-16 0M12 8v4l3 2'], ['Fade', 'M12 4a8 8 0 0 1 0 16M12 4a8 8 0 0 0 0 16'], ['Ghost', 'M6 20V11a6 6 0 0 1 12 0v9l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5z'],
  ['Envelope', 'M4 7h16v11H4zM4 7l8 6 8-6'], ['Reply', 'M10 6L4 12l6 6M5 12h9a6 6 0 0 1 6 6'], ['Forward', 'M14 6l6 6-6 6M19 12h-9a6 6 0 0 0-6 6'],
  ['Poll', 'M5 19V9M10 19V5M15 19v-7M20 19v-4'], ['Pin', 'M9 4h6l-1 5 3 3H7l3-3zM12 12v8'], ['StarBox', 'M4 6h16v13H4zM12 9l1.5 3 3.3.5-2.4 2.3.6 3.2L12 16.5 9 18l.6-3.2-2.4-2.3 3.3-.5z'],
  ['Folder', 'M3 7h6l2 2h10v10H3z'], ['Phone', 'M7 4h3l1.5 4-2 1.5a10 10 0 0 0 5 5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15 15 0 0 1 5 6a2 2 0 0 1 2-2z'], ['Video', 'M3 7h12v10H3zM15 11l6-3v8l-6-3'],
  ['Mic', 'M9 4h6v10H9zM6 11a6 6 0 0 0 12 0M12 17v3'], ['Link', 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'], ['Wave', 'M7 12V6a1.5 1.5 0 0 1 3 0v5V5a1.5 1.5 0 0 1 3 0v6-4a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-11 3l-2-3a1.5 1.5 0 0 1 2.4-1.8z'],
  ['QR', 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2z'],
];
const FRAMES = ['none', 'circle', 'squircle', 'hex', 'blob'] as const;
const STYLES = ['line', 'duo', 'solid', 'gradient', 'dashed', 'double', 'glow', 'badge'] as const;
const PAL: Record<Kit, [string, string, string]> = { glow: ['#6C3BFF', '#FF3D9A', '#C8F45A'], hush: ['#00B39B', '#14A8E6', '#FFC93C'] };
const FRAME_D: Record<string, string> = {
  circle: 'M12 1.5a10.5 10.5 0 1 1 0 21 10.5 10.5 0 1 1 0-21z', squircle: 'M7 1.5h10A5.5 5.5 0 0 1 22.5 7v10a5.5 5.5 0 0 1-5.5 5.5H7A5.5 5.5 0 0 1 1.5 17V7A5.5 5.5 0 0 1 7 1.5z',
  hex: 'M12 1.2l9.4 5.4v10.8L12 22.8l-9.4-5.4V6.6z', blob: 'M12 1.5c5 0 10 3 10 9.5 0 7-5 11.5-10.5 11.5S1.5 18 2 11C2.5 5 7 1.5 12 1.5z',
};
export type KitIcon = { id: number; kit: Kit; name: string; glyph: number; frame: number; style: number };
const build = (kit: Kit): KitIcon[] => { const G = kit === 'glow' ? GLOW_GLYPHS : HUSH_GLYPHS; const out: KitIcon[] = [];
  for (let g = 0; g < 25; g++) for (let f = 0; f < 5; f++) for (let st = 0; st < 8; st++) out.push({ id: out.length + 1, kit, glyph: g, frame: f, style: st, name: `${G[g][0]} ${FRAMES[f] === 'none' ? '' : FRAMES[f][0].toUpperCase() + FRAMES[f].slice(1) + ' '}${STYLES[st][0].toUpperCase() + STYLES[st].slice(1)}`.replace(/\s+/g, ' ').trim() });
  return out; };
export const ICONKIT: Record<Kit, KitIcon[]> = { glow: build('glow'), hush: build('hush') };
export const ICON_STYLES = STYLES; export const ICON_FRAMES = FRAMES;

export function kitSvg(kit: Kit, id: number, uid = ''): string {
  const ic = ICONKIT[kit][(id - 1 + 1000) % 1000]; const glyph = (kit === 'glow' ? GLOW_GLYPHS : HUSH_GLYPHS)[ic.glyph][1];
  const [a, b, acc] = PAL[kit]; const st = STYLES[ic.style]; const fr = FRAMES[ic.frame]; const g = `k${kit}${id}${uid}`;
  const onFrame = fr !== 'none' && (st === 'solid' || st === 'gradient' || st === 'badge');
  const stroke = onFrame ? '#fff' : st === 'gradient' ? `url(#${g})` : a;
  const frameEl = fr === 'none' ? '' : `<path d="${FRAME_D[fr]}" fill="${onFrame ? (st === 'gradient' ? `url(#${g})` : st === 'badge' ? b : a) : st === 'duo' ? a + '22' : 'none'}" stroke="${onFrame ? 'none' : a + '55'}" stroke-width="1.2"/>`;
  const scale = fr === 'none' ? '' : ' transform="translate(3.6 3.6) scale(.7)"';
  const glyphFill = st === 'duo' || (st === 'solid' && fr === 'none') ? (st === 'solid' ? a : b + '40') : 'none';
  const extra = st === 'double' ? `<path d="${glyph}" fill="none" stroke="${b}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity=".25"${scale}/>`
    : st === 'glow' ? `<path d="${glyph}" fill="none" stroke="${b}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" opacity=".18"${scale}/>` : '';
  const dot = st === 'badge' ? `<circle cx="19.5" cy="4.5" r="3" fill="${acc}" stroke="#fff" stroke-width="1.2"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>${frameEl}${extra}<path d="${glyph}" fill="${glyphFill}" stroke="${stroke}" stroke-width="${st === 'double' ? 1.6 : 2}" stroke-dasharray="${st === 'dashed' ? '2.4 2' : 'none'}" stroke-linecap="round" stroke-linejoin="round"${scale}/>${dot}</svg>`;
}
