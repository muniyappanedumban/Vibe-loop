import { ALL_FEATURES } from './features';
import { PRD } from './prd';
export type Role = 'Owner' | 'Creator' | 'Editor' | 'Analyst' | 'Viewer' | 'Fan';
export const ROLES: Role[] = ['Owner', 'Creator', 'Editor', 'Analyst', 'Viewer', 'Fan'];
export const PERMS = [
  'Publish content', 'Create Loops', 'Invite testers', 'Edit drafts', 'View analytics',
  'Request payout', 'Manage team', 'Comment in Loops', 'React with Vibes',
] as const;

export interface User { id: string; name: string; handle: string; role: Role; suspended: boolean; mfa: boolean; joined: string }
export interface ModItem { id: string; title: string; creator: string; reason: string; reports: number; status: 'pending' | 'approved' | 'removed' | 'escalated' }
export interface Payout { id: string; creator: string; amount: number; requested: string; status: 'pending' | 'approved' | 'rejected' | 'paid' }
export interface Flag { key: string; label: string; desc: string; on: boolean; kill?: boolean }
export interface Audit { id: number; ts: string; actor: string; action: string; target: string }
export interface Dsr { id: string; user: string; kind: 'access' | 'deletion'; received: string; status: 'open' | 'completed' | 'rejected' }
export interface Rule { id: string; name: string; desc: string; on: boolean; hits: number }
export interface Flagged { id: string; handle: string; signal: string; score: number; status: 'review' | 'cleared' | 'suspended' }
export interface Announcement { id: string; title: string; body: string; audience: string; sent: string }

export interface State {
  users: User[]; mod: ModItem[]; payouts: Payout[]; flags: Flag[]; audit: Audit[];
  dsr: Dsr[]; rules: Rule[]; flagged: Flagged[]; announcements: Announcement[];
  matrix: Record<Role, string[]>; retentionDays: number; feePct: number; lastDryRun: string | null;
  settings: Settings; emojiOff: number[]; featOn: number[]; prdOn: number[];
}

export interface Staff { id: string; email: string; name: string; role: 'Super admin' | 'Trust & Safety' | 'Finance' | 'Support' | 'Read-only'; mfa: boolean; last: string }
export const STAFF_ROLES: Staff['role'][] = ['Super admin', 'Trust & Safety', 'Finance', 'Support', 'Read-only'];
export interface Settings {
  general: { name: string; tagline: string; language: string; maintenance: boolean };
  security: { minLength: number; requireSymbols: boolean; rotationDays: number; mfa: Record<string, boolean>; sessionMins: number; passkeys: boolean };
  moderation: { holdReports: number; holdRisk: number; reasons: { code: string; label: string }[]; guardWords: string[] };
  monetisation: { feePct: number; minPayout: number; currencies: string[]; schedule: string };
  notifications: { push: Record<string, boolean>; email: Record<string, boolean>; quietOn: boolean; quietFrom: string; quietTo: string };
  content: { maxUploadMb: number; types: Record<string, boolean>; syntheticLabel: boolean; minLoopScore: number };
  privacy: { retentionDays: number; teenDmOff: boolean; teenPrivateDefault: boolean; teenNoLocation: boolean; dsarSlaDays: number };
  integrations: { providers: { key: string; label: string; enabled: boolean; connected: boolean }[] };
  branding: { violet: string; pink: string; tangerine: string; lime: string; mint: string };
  admins: { staff: Staff[] };
}
export type SettingsSection = keyof Settings;

const d = (h: number) => new Date(Date.UTC(2026, 10, 16, 9) - h * 3600e3).toISOString();

const seedMatrix: Record<Role, string[]> = {
  Owner: [...PERMS],
  Creator: ['Publish content', 'Create Loops', 'Invite testers', 'Edit drafts', 'View analytics', 'Request payout'],
  Editor: ['Edit drafts', 'Create Loops', 'View analytics'],
  Analyst: ['View analytics'],
  Viewer: ['Comment in Loops'],
  Fan: ['Comment in Loops', 'React with Vibes'],
};

export const initialState: State = {
  users: [
    { id: 'u1', name: 'Mara Okafor', handle: '@maradraws', role: 'Creator', suspended: false, mfa: true, joined: '2026-03-02' },
    { id: 'u2', name: 'Theo Lindqvist', handle: '@theobeats', role: 'Creator', suspended: false, mfa: false, joined: '2026-04-19' },
    { id: 'u3', name: 'Priya Raman', handle: '@priyacuts', role: 'Editor', suspended: false, mfa: true, joined: '2026-05-08' },
    { id: 'u4', name: 'Jonah Reyes', handle: '@jonah.r', role: 'Analyst', suspended: false, mfa: false, joined: '2026-06-11' },
    { id: 'u5', name: 'Sasha Novak', handle: '@sashaloops', role: 'Owner', suspended: false, mfa: true, joined: '2026-01-15' },
    { id: 'u6', name: 'Kai Brennan', handle: '@kaib', role: 'Fan', suspended: true, mfa: false, joined: '2026-07-22' },
    { id: 'u7', name: 'Lena Fischer', handle: '@lenafilms', role: 'Creator', suspended: false, mfa: false, joined: '2026-08-30' },
    { id: 'u8', name: 'Omar Haddad', handle: '@omarh', role: 'Viewer', suspended: false, mfa: false, joined: '2026-09-14' },
  ],
  mod: [
    { id: 'm1', title: 'Late-night synth jam (Loop draft)', creator: '@theobeats', reason: 'R-COPY · possible copyrighted sample', reports: 3, status: 'pending' },
    { id: 'm2', title: 'Street prank compilation', creator: '@kaib', reason: 'R-HARASS · harassment of bystanders', reports: 7, status: 'pending' },
    { id: 'm3', title: '“Free giveaway” link post', creator: '@omarh', reason: 'R-SPAM · off-platform link bait', reports: 12, status: 'pending' },
    { id: 'm4', title: 'Cooking short: knife skills', creator: '@lenafilms', reason: 'R-SELFHARM · auto-flag, likely false positive', reports: 1, status: 'pending' },
    { id: 'm5', title: 'Fan comment thread #4821', creator: '@kaib', reason: 'R-HATE · slur in comment', reports: 4, status: 'escalated' },
  ],
  payouts: [
    { id: 'p1', creator: '@maradraws', amount: 1240.5, requested: d(5), status: 'pending' },
    { id: 'p2', creator: '@theobeats', amount: 310, requested: d(20), status: 'pending' },
    { id: 'p3', creator: '@lenafilms', amount: 88.25, requested: d(30), status: 'pending' },
    { id: 'p4', creator: '@maradraws', amount: 960, requested: d(200), status: 'paid' },
    { id: 'p5', creator: '@priyacuts', amount: 45, requested: d(260), status: 'rejected' },
  ],
  flags: [
    { key: 'loops.private_testing', label: 'Private Loops testing', desc: 'Creators can open private test Loops with fans', on: true },
    { key: 'ai.caption_assist', label: 'AI caption assist', desc: 'AI-suggested captions in the editor', on: true },
    { key: 'vibes.bolt_fix', label: 'Bolt-fix reactions', desc: '“Needs work” Vibe sticker in Loops', on: true },
    { key: 'render.4k', label: '4K render tier', desc: 'High-resolution export pipeline', on: false },
    { key: 'kill.publishing', label: 'Kill: all publishing', desc: 'Emergency stop — blocks every public release', on: false, kill: true },
    { key: 'kill.payouts', label: 'Kill: payouts', desc: 'Emergency stop — freezes all payout approvals', on: false, kill: true },
    { key: 'kill.ai', label: 'Kill: AI generation', desc: 'Emergency stop — disables all AI/render jobs', on: false, kill: true },
  ],
  audit: [
    { id: 3, ts: d(2), actor: 'system', action: 'flag.auto', target: 'm4 (R-SELFHARM)' },
    { id: 2, ts: d(26), actor: 'admin@vibeloop', action: 'payout.reject', target: 'p5 @priyacuts' },
    { id: 1, ts: d(50), actor: 'admin@vibeloop', action: 'user.suspend', target: '@kaib' },
  ],
  dsr: [
    { id: 'dsr-104', user: '@omarh', kind: 'access', received: d(8), status: 'open' },
    { id: 'dsr-103', user: '@kaib', kind: 'deletion', received: d(40), status: 'open' },
    { id: 'dsr-099', user: '@jonah.r', kind: 'access', received: d(300), status: 'completed' },
  ],
  rules: [
    { id: 'r1', name: 'Link burst', desc: '>5 external links in 10 minutes', on: true, hits: 14 },
    { id: 'r2', name: 'Duplicate comment', desc: 'Same comment text across ≥3 Loops', on: true, hits: 31 },
    { id: 'r3', name: 'Vibe flooding', desc: '>200 reactions/hour from one account', on: true, hits: 6 },
    { id: 'r4', name: 'New-account DM spray', desc: 'Accounts <24h messaging ≥20 creators', on: false, hits: 0 },
  ],
  flagged: [
    { id: 'f1', handle: '@omarh', signal: 'Link burst ×4', score: 82, status: 'review' },
    { id: 'f2', handle: '@kaib', signal: 'Duplicate comment ×11', score: 91, status: 'suspended' },
    { id: 'f3', handle: '@vibe_bot_221', signal: 'Vibe flooding', score: 97, status: 'review' },
  ],
  announcements: [
    { id: 'a1', title: 'Loop Score v2 is live', body: 'Scores now weight Spark reactions higher.', audience: 'Creators', sent: d(72) },
  ],
  matrix: seedMatrix,
  retentionDays: 90,
  feePct: 10,
  lastDryRun: null,
  settings: {
    general: { name: 'VibeLoop', tagline: 'Your World. Your People. Your Moments.', language: 'English (India)', maintenance: false },
    security: { minLength: 12, requireSymbols: true, rotationDays: 0, mfa: { Owner: true, Creator: false, Editor: true, Analyst: false, Viewer: false, Fan: false, Staff: true }, sessionMins: 30, passkeys: true },
    moderation: { holdReports: 5, holdRisk: 80, reasons: [
      { code: 'R-COPY', label: 'Copyright / unlicensed audio' }, { code: 'R-HARASS', label: 'Harassment or bullying' }, { code: 'R-SPAM', label: 'Spam or link bait' },
      { code: 'R-SELFHARM', label: 'Self-harm risk' }, { code: 'R-HATE', label: 'Hate speech' }, { code: 'R-SYNTH', label: 'Unlabelled synthetic media' }],
      guardWords: ['free giveaway', 'dm for promo', 'click my bio', 'crypto double'] },
    monetisation: { feePct: 10, minPayout: 25, currencies: ['INR', 'USD'], schedule: 'Weekly (Monday)' },
    notifications: { push: { Reactions: true, Comments: true, 'New followers': true, 'Loop invites': true, Marketing: false }, email: { 'Weekly digest': true, 'Payout receipts': true, 'Security alerts': true, Marketing: false }, quietOn: true, quietFrom: '22:00', quietTo: '07:00' },
    content: { maxUploadMb: 512, types: { 'JPEG / PNG': true, HEIC: true, 'MP4 / MOV': true, GIF: true, 'WebM': false, 'Audio (AAC/MP3)': true }, syntheticLabel: true, minLoopScore: 60 },
    privacy: { retentionDays: 90, teenDmOff: true, teenPrivateDefault: true, teenNoLocation: true, dsarSlaDays: 30 },
    integrations: { providers: [
      { key: 'google', label: 'Google', enabled: true, connected: false }, { key: 'apple', label: 'Sign in with Apple', enabled: true, connected: false },
      { key: 'phone', label: 'Phone OTP (SMS)', enabled: true, connected: false }, { key: 'meta', label: 'Meta / Instagram import', enabled: false, connected: false },
      { key: 'x', label: 'X (Twitter)', enabled: false, connected: false }, { key: 'spotify', label: 'Spotify (music)', enabled: false, connected: false }] },
    branding: { violet: '#6C3BFF', pink: '#FF3D9A', tangerine: '#FF8A3D', lime: '#C8F45A', mint: '#2BD9A8' },
    admins: { staff: [
      { id: 's1', email: 'admin@vibeloop', name: 'Platform admin', role: 'Super admin', mfa: true, last: d(1) },
      { id: 's2', email: 'riya.t@vibeloop', name: 'Riya Thomas', role: 'Trust & Safety', mfa: true, last: d(4) },
      { id: 's3', email: 'arjun.m@vibeloop', name: 'Arjun Mehta', role: 'Finance', mfa: true, last: d(30) },
      { id: 's4', email: 'neha.s@vibeloop', name: 'Neha Shah', role: 'Support', mfa: false, last: d(70) },
      { id: 's5', email: 'auditor@vibeloop', name: 'External auditor', role: 'Read-only', mfa: true, last: d(400) }] },
  },
  emojiOff: [],
  featOn: ALL_FEATURES.filter(f => f.route && !f.same).map(f => f.n),
  prdOn: PRD.filter(f => f.route).map(f => f.n),
};

export type Action =
  | { type: 'user.role'; id: string; role: Role }
  | { type: 'user.suspend'; id: string }
  | { type: 'user.mfa'; id: string }
  | { type: 'mod.resolve'; id: string; status: 'approved' | 'removed' | 'escalated' }
  | { type: 'payout.decide'; id: string; status: 'approved' | 'rejected'; token: string }
  | { type: 'flag.toggle'; key: string }
  | { type: 'dsr.resolve'; id: string; status: 'completed' | 'rejected' }
  | { type: 'retention.set'; days: number }
  | { type: 'retention.dryrun' }
  | { type: 'rule.toggle'; id: string }
  | { type: 'flagged.set'; id: string; status: 'cleared' | 'suspended' }
  | { type: 'announce'; title: string; body: string; audience: string }
  | { type: 'matrix.toggle'; role: Role; perm: string }
  | { type: 'fee.set'; pct: number }
  | { type: 'settings.save'; section: SettingsSection; value: Settings[SettingsSection] }
  | { type: 'emoji.toggle'; id: number; name: string }
  | { type: 'feature.toggle'; n: number; name: string }
  | { type: 'prd.toggle'; n: number; name: string };

const ACTOR = 'admin@vibeloop';

function log(s: State, action: string, target: string): State {
  const id = (s.audit[0]?.id ?? 0) + 1;
  return { ...s, audit: [{ id, ts: new Date().toISOString(), actor: ACTOR, action, target }, ...s.audit] };
}

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'user.role': {
      const u = s.users.find(x => x.id === a.id)!;
      return log({ ...s, users: s.users.map(x => x.id === a.id ? { ...x, role: a.role } : x) }, 'user.role', `${u.handle} ${u.role} → ${a.role}`);
    }
    case 'user.suspend': {
      const u = s.users.find(x => x.id === a.id)!;
      return log({ ...s, users: s.users.map(x => x.id === a.id ? { ...x, suspended: !x.suspended } : x) }, u.suspended ? 'user.unsuspend' : 'user.suspend', u.handle);
    }
    case 'user.mfa': {
      const u = s.users.find(x => x.id === a.id)!;
      return log({ ...s, users: s.users.map(x => x.id === a.id ? { ...x, mfa: true } : x) }, 'user.enforce_mfa', u.handle);
    }
    case 'mod.resolve': {
      const m = s.mod.find(x => x.id === a.id)!;
      return log({ ...s, mod: s.mod.map(x => x.id === a.id ? { ...x, status: a.status } : x) }, `moderation.${a.status}`, `${m.id} ${m.reason.split(' ')[0]}`);
    }
    case 'payout.decide': {
      const p = s.payouts.find(x => x.id === a.id)!;
      return log({ ...s, payouts: s.payouts.map(x => x.id === a.id ? { ...x, status: a.status } : x) }, `payout.${a.status === 'approved' ? 'approve' : 'reject'}`, `${p.id} ${p.creator} $${p.amount.toFixed(2)} · token ${a.token}`);
    }
    case 'flag.toggle': {
      const f = s.flags.find(x => x.key === a.key)!;
      return log({ ...s, flags: s.flags.map(x => x.key === a.key ? { ...x, on: !x.on } : x) }, f.kill ? 'killswitch.' + (f.on ? 'disarm' : 'ENGAGE') : 'flag.' + (f.on ? 'off' : 'on'), f.key);
    }
    case 'dsr.resolve':
      return log({ ...s, dsr: s.dsr.map(x => x.id === a.id ? { ...x, status: a.status } : x) }, `privacy.dsr_${a.status}`, a.id);
    case 'retention.set':
      return log({ ...s, retentionDays: a.days }, 'privacy.retention_set', `${a.days} days`);
    case 'retention.dryrun':
      return log({ ...s, lastDryRun: new Date().toISOString() }, 'privacy.retention_dryrun', `${s.retentionDays}d policy (no data deleted)`);
    case 'rule.toggle': {
      const r = s.rules.find(x => x.id === a.id)!;
      return log({ ...s, rules: s.rules.map(x => x.id === a.id ? { ...x, on: !x.on } : x) }, `abuse.rule_${r.on ? 'off' : 'on'}`, r.name);
    }
    case 'flagged.set': {
      const f = s.flagged.find(x => x.id === a.id)!;
      return log({ ...s, flagged: s.flagged.map(x => x.id === a.id ? { ...x, status: a.status } : x) }, `abuse.${a.status === 'cleared' ? 'clear' : 'suspend'}`, f.handle);
    }
    case 'announce': {
      const id = 'a' + (s.announcements.length + 1);
      return log({ ...s, announcements: [{ id, title: a.title, body: a.body, audience: a.audience, sent: new Date().toISOString() }, ...s.announcements] }, 'announcement.broadcast', `${a.title} → ${a.audience}`);
    }
    case 'matrix.toggle': {
      const has = s.matrix[a.role].includes(a.perm);
      const next = has ? s.matrix[a.role].filter(p => p !== a.perm) : [...s.matrix[a.role], a.perm];
      return log({ ...s, matrix: { ...s.matrix, [a.role]: next } }, has ? 'role.revoke' : 'role.grant', `${a.role}: ${a.perm}`);
    }
    case 'fee.set':
      return log({ ...s, feePct: a.pct, settings: { ...s.settings, monetisation: { ...s.settings.monetisation, feePct: a.pct } } }, 'revenue.fee_set', `${a.pct}%`);
    case 'settings.save': {
      const prev = s.settings[a.section] as unknown as Record<string, unknown>, next = a.value as unknown as Record<string, unknown>;
      const changed = Object.keys(next).filter(k => JSON.stringify(prev[k]) !== JSON.stringify(next[k]));
      const ns = { ...s, settings: { ...s.settings, [a.section]: a.value } };
      if (a.section === 'monetisation') ns.feePct = (a.value as Settings['monetisation']).feePct;
      if (a.section === 'privacy') ns.retentionDays = (a.value as Settings['privacy']).retentionDays;
      return log(ns, `settings.${a.section}_save`, changed.length ? changed.join(', ') : 'no changes');
    }
    case 'emoji.toggle': {
      const off = s.emojiOff.includes(a.id);
      return log({ ...s, emojiOff: off ? s.emojiOff.filter(x => x !== a.id) : [...s.emojiOff, a.id] }, off ? 'emoji.enable' : 'emoji.disable', `#${a.id} ${a.name}`);
    }
    case 'prd.toggle': {
      const on = s.prdOn.includes(a.n);
      return log({ ...s, prdOn: on ? s.prdOn.filter(x => x !== a.n) : [...s.prdOn, a.n] }, 'feature.prd_' + (on ? 'off' : 'on'), `PRD #${a.n} ${a.name}`);
    }
    case 'feature.toggle': {
      const on = s.featOn.includes(a.n);
      return log({ ...s, featOn: on ? s.featOn.filter(x => x !== a.n) : [...s.featOn, a.n] }, 'feature.' + (on ? 'off' : 'on'), `#${a.n} ${a.name}`);
    }
  }
}
