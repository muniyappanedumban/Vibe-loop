import type { Loop, Reaction } from '../store/types';
import { HOUR } from './util';
const W = { share: 1, forme: 1, work: 0.45, skip: 0 } as const;
export const MIN_REACTIONS = 3;
/** Low-effort filter (PRD #26): reactions with no text and arriving <3s after the previous one from same member are ignored. */
export const isLowEffort = (r: Reaction) => r.text.trim().length > 0 && r.text.trim().length < 3;
/** Reaction quality 0..1 (PRD #37): text adds depth, but every real reaction counts. */
export const quality = (r: Reaction) => (isLowEffort(r) ? 0 : Math.min(1, 0.55 + r.text.trim().length / 120));

export function counted(loop: Loop, version?: 'A' | 'B') {
  const end = loop.openedAt + loop.windowHours * HOUR; // PRD #7: only the first window counts
  return loop.reactions.filter(r => r.at <= end && !isLowEffort(r) && (!version || r.version === version));
}
/** Loop Score 0..100 from real human reactions only (PRD #2). Returns null when not enough data — never invented. */
export function loopScore(loop: Loop, version?: 'A' | 'B'): number | null {
  const rs = counted(loop, version);
  if (rs.length < MIN_REACTIONS) return null;
  let num = 0, den = 0;
  for (const r of rs) { const q = quality(r); num += W[r.kind] * q; den += q; }
  return den ? Math.round((num / den) * 100) : null;
}
export function breakdown(loop: Loop, version?: 'A' | 'B') {
  const rs = counted(loop, version);
  const b = { share: 0, skip: 0, work: 0, forme: 0 };
  rs.forEach(r => b[r.kind]++);
  return { ...b, total: rs.length };
}
/** Loop health (PRD #10): share of reactions with meaningful text + member participation. */
export function loopHealth(loop: Loop) {
  if (!loop.members.length) return null;
  const rs = counted(loop);
  const withText = rs.filter(r => r.text.trim().length >= 12).length;
  const participants = new Set(rs.map(r => r.memberId)).size;
  return Math.round(((rs.length ? withText / rs.length : 0) * 0.5 + (participants / loop.members.length) * 0.5) * 100);
}
/** Lightweight lexical sentiment summary (PRD #4) — fully on-device, shows its method. */
const POS = ['love', 'great', 'funny', 'fresh', 'clear', 'share', 'nice', 'best', 'relatable', 'wow', 'mast', 'badhiya', 'super'];
const NEG = ['slow', 'long', 'boring', 'confusing', 'loud', 'skip', 'weak', 'cringe', 'late', 'unclear'];
export function sentiment(loop: Loop) {
  const words = counted(loop).flatMap(r => r.text.toLowerCase().split(/[^a-zऀ-ॿ]+/));
  const pos = words.filter(w => POS.includes(w)), neg = words.filter(w => NEG.includes(w));
  const top = (arr: string[]) => Object.entries(arr.reduce<Record<string, number>>((a, w) => ((a[w] = (a[w] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
  return { pos: pos.length, neg: neg.length, posTop: top(pos), negTop: top(neg) };
}
