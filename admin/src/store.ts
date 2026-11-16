export type Role = 'Owner' | 'Creator' | 'Editor' | 'Analyst' | 'Viewer' | 'Fan';
export const ROLES: Role[] = ['Owner', 'Creator', 'Editor', 'Analyst', 'Viewer', 'Fan'];
export const PERMS = [
  'Publish content', 'Create Loops', 'Invite testers', 'Edit drafts', 'View analytics',
  'Request payout', 'Manage team', 'Comment in Loops', 'React with Vibes',
] as const;

export interface Flag { key: string; label: string; desc: string; on: boolean; kill?: boolean }
export interface Rule { id: string; name: string; desc: string; on: boolean; hits: number }
export interface Flagged { id: string; handle: string; signal: string; score: number; status: 'review' | 'cleared' | 'suspended' }

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

export const DEFAULT_MATRIX: Record<Role, string[]> = {
  Owner: [...PERMS],
  Creator: ['Publish content', 'Create Loops', 'Invite testers', 'Edit drafts', 'View analytics', 'Request payout'],
  Editor: ['Edit drafts', 'Create Loops', 'View analytics'],
  Analyst: ['View analytics'],
  Viewer: ['Comment in Loops'],
  Fan: ['Comment in Loops', 'React with Vibes'],
};

export const DEFAULT_FLAGS: Flag[] = [
    { key: 'loops.private_testing', label: 'Private Loops testing', desc: 'Creators can open private test Loops with fans', on: true },
    { key: 'ai.caption_assist', label: 'AI caption assist', desc: 'AI-suggested captions in the editor', on: true },
    { key: 'vibes.bolt_fix', label: 'Bolt-fix reactions', desc: '“Needs work” Vibe sticker in Loops', on: true },
    { key: 'render.4k', label: '4K render tier', desc: 'High-resolution export pipeline', on: false },
    { key: 'publishing', label: 'Kill: all publishing', desc: 'Emergency stop — the API rejects every new post/Loop release', on: false, kill: true },
    { key: 'payouts', label: 'Kill: payouts', desc: 'Emergency stop — the API freezes all payout decisions', on: false, kill: true },
    { key: 'ai_generation', label: 'Kill: AI generation', desc: 'Emergency stop — disables all AI/render jobs', on: false, kill: true },
    { key: 'signups', label: 'Kill: signups', desc: 'Emergency stop — pauses new account registration', on: false, kill: true },
];

export const defaultSettings: Settings = {
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
  };

/* Demo-only state: the backend has no abuse-detection service yet. */
export interface State {
  rules: Rule[]; flagged: Flagged[];
}
export const initialState: State = {
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
};
export type Action = { type: 'rule.toggle'; id: string } | { type: 'flagged.set'; id: string; status: 'cleared' | 'suspended' };
export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'rule.toggle': return { ...s, rules: s.rules.map(x => x.id === a.id ? { ...x, on: !x.on } : x) };
    case 'flagged.set': return { ...s, flagged: s.flagged.map(x => x.id === a.id ? { ...x, status: a.status } : x) };
  }
}
