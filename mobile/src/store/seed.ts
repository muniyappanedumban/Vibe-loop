import type { Loop, Member, Reaction, Txn, Asset, Notice, Clip } from './types';
import { DAY, HOUR } from '../lib/util';
const t = Date.now();
const names = ['Aanya', 'Kabir', 'Meera', 'Rohan', 'Zoya', 'Ishaan', 'Tara', 'Dev', 'Nila', 'Arjun', 'Sana', 'Vihaan'];
export const MEMBERS: Member[] = names.map((n, i) => ({ id: `m${i}`, name: n, hue: (i * 37) % 360, joinedAt: t - (20 - i) * DAY }));
const r = (id: string, m: number, v: 'A' | 'B', kind: Reaction['kind'], text: string, h: number): Reaction => ({ id, memberId: `m${m}`, version: v, kind, text, at: 0 + h, anonymous: false });
const mk = (opened: number, rs: [number, 'A' | 'B', Reaction['kind'], string, number][]) => rs.map((x, i) => ({ ...r(`r${opened}${i}`, x[0], x[1], x[2], x[3], 0), at: opened + x[4] * HOUR }));
const o1 = t - 5 * HOUR, o2 = t - 4 * DAY, o3 = t - 9 * DAY;
export const SEED_LOOPS: Loop[] = [
  { id: 'l1', title: 'Chai-break comedy · Ep 4', template: 'Comedy short', sizeLimit: 20, minScore: 70, windowHours: 24, members: MEMBERS.slice(0, 10), status: 'testing', openedAt: o1, notes: ['Try the cold open from Ep 2'], silent: false, paidOnly: false, demo: true,
    dna: { mood: 'Playful', energy: 82, depth: 35, pace: 76 },
    drafts: [
      { version: 'A', title: 'Cold open: spilled chai', hook: 'POV: your boss walks in mid-sip', caption: 'Monday mood, but make it chai ☕', hue: 265, durationSec: 34, synthetic: false },
      { version: 'B', title: 'Slow build + punchline', hook: 'Three types of office chai drinkers', caption: 'Which one are you?', hue: 330, durationSec: 41, synthetic: false },
    ],
    reactions: mk(o1, [[0, 'A', 'share', 'So relatable, sending to my team', 0.5], [1, 'A', 'forme', 'This is literally me lol great timing', 1], [2, 'B', 'work', 'Punchline lands late, feels slow', 1.4], [3, 'A', 'share', 'Love the cold open', 2], [4, 'B', 'skip', 'Too long for a short', 2.5], [5, 'A', 'work', 'Audio a bit loud at the start', 3], [6, 'B', 'share', 'Fresh idea', 3.6]]) },
  { id: 'l2', title: 'Budget travel: Hampi in ₹3k', template: 'Educational', sizeLimit: 30, minScore: 65, windowHours: 24, members: MEMBERS.slice(2, 12), status: 'released', openedAt: o2, notes: [], silent: false, paidOnly: false, demo: true,
    dna: { mood: 'Curious', energy: 58, depth: 80, pace: 52 },
    drafts: [{ version: 'A', title: 'Map-first walkthrough', hook: '₹3,000. Two days. One stunning ruin town.', caption: 'Save this for your next trip', hue: 160, durationSec: 58, synthetic: false }],
    reactions: mk(o2, [[2, 'A', 'share', 'Super useful, clear breakdown', 1], [3, 'A', 'share', 'Saving this, best budget guide', 2], [4, 'A', 'forme', 'Exactly what I needed', 3], [5, 'A', 'work', 'Add bus timings', 4], [6, 'A', 'share', 'Clear and fresh', 6], [7, 'A', 'share', 'wow great shots', 8]]) },
  { id: 'l3', title: 'Desk setup tour v1', template: 'Lifestyle', sizeLimit: 15, minScore: 70, windowHours: 24, members: MEMBERS.slice(0, 8), status: 'archived', openedAt: o3, notes: ['Never again: 60s+ tours'], silent: false, paidOnly: false, demo: true, failReason: 'Score 31 < 70. Pacing: "slow", "boring" mentioned by 3 members.',
    dna: { mood: 'Calm', energy: 30, depth: 40, pace: 25 },
    drafts: [{ version: 'A', title: 'Full room pan', hook: 'My desk setup for 2026', caption: 'Links in bio', hue: 210, durationSec: 72, synthetic: false }],
    reactions: mk(o3, [[0, 'A', 'skip', 'Slow and boring start', 1], [1, 'A', 'work', 'Too long, cut to the gear', 2], [2, 'A', 'skip', 'Seen this format a lot', 3], [3, 'A', 'work', 'Lighting is nice but slow', 4], [4, 'A', 'share', 'Nice lamp', 5]]) },
];
export const SEED_TXNS: Txn[] = [
  { id: 't1', kind: 'tip', from: 'Meera', gross: 150, fee: 12, at: t - 2 * HOUR, demo: true },
  { id: 't2', kind: 'paid_loop', from: 'Kabir', gross: 99, fee: 8, at: t - 1 * DAY, demo: true },
  { id: 't3', kind: 'product', from: 'Zoya', gross: 499, fee: 40, at: t - 2 * DAY, demo: true },
  { id: 't4', kind: 'membership', from: 'Arjun', gross: 199, fee: 16, at: t - 3 * DAY, demo: true },
  { id: 't5', kind: 'ticket', from: 'Tara', gross: 299, fee: 24, at: t - 6 * DAY, demo: true },
  { id: 't6', kind: 'tip', from: 'Dev', gross: 50, fee: 4, at: t - 8 * DAY, demo: true },
];
export const SEED_ASSETS: Asset[] = [
  { id: 'a1', title: 'Chai cold open', kind: 'video', hue: 265, synthetic: false, coreIdentity: true, versions: [{ v: 1, at: t - 2 * DAY, note: 'Original upload' }, { v: 2, at: t - DAY, note: 'Trimmed 3s' }, { v: 3, at: t - 3 * HOUR, note: 'Audio cleanup' }] },
  { id: 'a2', title: 'Hampi drone b-roll', kind: 'video', hue: 160, synthetic: false, versions: [{ v: 1, at: t - 5 * DAY, note: 'Original upload' }] },
  { id: 'a3', title: 'Voiceover — travel', kind: 'audio', hue: 30, synthetic: false, versions: [{ v: 1, at: t - 5 * DAY, note: 'Recorded' }, { v: 2, at: t - 4 * DAY, note: 'Noise cleanup' }] },
  { id: 'a4', title: 'Thumbnail concept', kind: 'image', hue: 320, synthetic: true, versions: [{ v: 1, at: t - DAY, note: 'Generated · labelled synthetic' }] },
  { id: 'a5', title: 'Ep 5 script', kind: 'script', hue: 200, synthetic: false, versions: [{ v: 1, at: t - 6 * HOUR, note: 'Draft' }] },
];
export const SEED_NOTICES: Notice[] = [
  { id: 'n1', kind: 'reaction', title: 'Zoya reacted to Version B', body: '“Too long for a short”', at: t - 2.5 * HOUR, read: false, route: 'LoopDetail', params: { id: 'l1' } },
  { id: 'n2', kind: 'approval', title: 'Publish approval waiting', body: 'Hampi in ₹3k is ready for public release gate', at: t - 3 * HOUR, read: false, route: 'ReleaseGate', params: { id: 'l2' } },
  { id: 'n3', kind: 'earning', title: 'Meera sent a ₹150 tip', body: 'On “Chai-break comedy · Ep 4”', at: t - 2 * HOUR, read: false, route: 'Earnings' },
  { id: 'n4', kind: 'system', title: 'Voice tone matcher', body: 'Not ready yet — we will tell you when it is.', at: t - DAY, read: true },
];
export const SEED_CLIPS: Clip[] = [
  { id: 'c1', track: 'video', label: 'Cold open', start: 0, len: 6, hue: 265, speed: 1 },
  { id: 'c2', track: 'video', label: 'Desk reveal', start: 6, len: 12, hue: 300, speed: 1 },
  { id: 'c3', track: 'video', label: 'Punchline', start: 18, len: 10, hue: 20, speed: 1 },
  { id: 'c4', track: 'audio', label: 'VO take 3', start: 0, len: 26, hue: 160, speed: 1 },
  { id: 'c5', track: 'text', label: 'POV: boss walks in', start: 1, len: 5, hue: 50, speed: 1 },
];
