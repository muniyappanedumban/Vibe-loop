import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Loop, Reaction, Txn, Payout, ApprovalToken, Notice, Audit, Asset, Clip, Insight, Draft, Role } from './types';
import { SEED_LOOPS, SEED_TXNS, SEED_ASSETS, SEED_NOTICES, SEED_CLIPS, MEMBERS } from './seed';
import { uid, now, hash, HOUR, DAY } from '../lib/util';
import { loopScore } from '../lib/score';

export const PLATFORM_FEE = 0.08; // shown before every transaction (PRD #163)

type Settings = {
  pushLoops: boolean; pushReactions: boolean; pushEarnings: boolean; pushSystem: boolean; quietHours: boolean;
  biometric: boolean; mfa: boolean; whoCanJoin: 'invite' | 'request' | 'anyone'; defaultVisibility: 'public' | 'unlisted' | 'supporters';
  aiEnabled: boolean; aiMonthlyCap: number; renderQuality: '720p' | '1080p' | '4K'; autosaveSec: number; language: string; minPayout: number; currency: 'INR' | 'USD' | 'EUR'; dark: boolean;
};
type State = {
  onboarded: boolean; user: { name: string; handle: string; role: Role }; loops: Loop[]; txns: Txn[]; payouts: Payout[];
  tokens: ApprovalToken[]; notices: Notice[]; audit: Audit[]; assets: Asset[]; clips: Clip[]; history: Clip[][]; future: Clip[][];
  insights: Insight[]; neverIdeas: string[]; settings: Settings; published: { loopId: string; at: number; visibility: string; approver: string; tokenId: string }[];
  briefs: { id: string; brief: string; at: number; out: { hooks: string[]; captions: string[]; formats: string[] } }[];
};
type Actions = {
  finishOnboarding: (name: string, handle: string) => void;
  createLoop: (p: { title: string; template: string; sizeLimit: number; minScore: number; draft: Draft; paidOnly?: boolean }) => string;
  addVersionB: (loopId: string, d: Draft) => void;
  react: (loopId: string, r: Omit<Reaction, 'id' | 'at'>) => { ok: boolean; reason?: string };
  makeInvite: (loopId: string) => string;
  setLoopStatus: (loopId: string, s: Loop['status'], reason?: string) => void;
  toggleLoopFlag: (loopId: string, k: 'silent' | 'paidOnly') => void;
  addNote: (loopId: string, n: string) => void;
  cloneLoop: (loopId: string) => string;
  issueToken: (action: ApprovalToken['action'], payload: string) => ApprovalToken;
  consumeToken: (tokenId: string, payload: string) => { ok: boolean; reason?: string };
  publish: (loopId: string, visibility: string, tokenId: string) => { ok: boolean; reason?: string };
  withdraw: (loopId: string) => void;
  requestPayout: (amount: number, tokenId: string) => { ok: boolean; reason?: string };
  readNotice: (id: string) => void; readAll: () => void;
  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  addAssetVersion: (id: string, note: string) => void; toggleCore: (id: string) => void;
  clipOp: (fn: (c: Clip[]) => Clip[], label: string) => void; undo: () => void; redo: () => void;
  correctInsight: (id: string, text: string) => void; neverAgain: (idea: string) => void; noteInsight: (id: string, note: string) => void;
  saveBrief: (brief: string, out: State['briefs'][0]['out']) => void;
  log: (action: string, detail: string) => void;
  reset: () => void;
};

const initial = (): State => ({
  onboarded: false, user: { name: 'Riya Kapoor', handle: '@riya.makes', role: 'creator' }, loops: SEED_LOOPS, txns: SEED_TXNS, payouts: [],
  tokens: [], notices: SEED_NOTICES, audit: [], assets: SEED_ASSETS, clips: SEED_CLIPS, history: [], future: [], insights: [
    { id: 'i1', text: 'Cold opens under 3s beat slow builds for your comedy shorts.', source: 'Loops l1, l3' },
    { id: 'i2', text: 'Your audience saves practical, numbers-first travel guides.', source: 'Loop l2' },
    { id: 'i3', text: 'Videos over 60s get "slow"/"long" feedback from your Loop.', source: 'Loop l3' },
  ], neverIdeas: ['Full-room desk pans over 60s'], published: [{ loopId: 'l2', at: Date.now() - 3 * DAY, visibility: 'public', approver: '@riya.makes', tokenId: 'tok_seed' }], briefs: [],
  settings: { pushLoops: true, pushReactions: true, pushEarnings: true, pushSystem: true, quietHours: false, biometric: true, mfa: false, whoCanJoin: 'invite', defaultVisibility: 'unlisted', aiEnabled: true, aiMonthlyCap: 500, renderQuality: '1080p', autosaveSec: 15, language: 'Hinglish', minPayout: 500, currency: 'INR', dark: false },
});

export const useStore = create<State & Actions>()(persist(immer((set, get) => ({
  ...initial(),
  log: (action, detail) => set(s => { s.audit.unshift({ id: uid('au'), at: now(), actor: s.user.handle, action, detail }); }),
  finishOnboarding: (name, handle) => set(s => { s.onboarded = true; if (name) s.user.name = name; if (handle) s.user.handle = handle.startsWith('@') ? handle : '@' + handle; }),
  createLoop: p => {
    const id = uid('loop');
    set(s => {
      s.loops.unshift({ id, title: p.title, template: p.template, sizeLimit: Math.min(50, Math.max(8, p.sizeLimit)), minScore: p.minScore, windowHours: 24, members: MEMBERS.slice(0, 6), drafts: [p.draft], reactions: [], status: 'testing', openedAt: now(), notes: [], silent: false, paidOnly: !!p.paidOnly, dna: { mood: 'New', energy: 50, depth: 50, pace: 50 } });
      s.audit.unshift({ id: uid('au'), at: now(), actor: s.user.handle, action: 'loop.create', detail: p.title });
    });
    return id;
  },
  addVersionB: (loopId, d) => set(s => { const l = s.loops.find(x => x.id === loopId); if (l && l.drafts.length < 2) l.drafts.push({ ...d, version: 'B' }); }),
  react: (loopId, r) => {
    const l = get().loops.find(x => x.id === loopId);
    if (!l) return { ok: false, reason: 'Loop not found' };
    if (l.status !== 'testing') return { ok: false, reason: 'This Loop is locked — reactions are closed.' };
    if (l.reactions.some(x => x.memberId === r.memberId && x.version === r.version)) return { ok: false, reason: 'You already reacted to this version.' };
    set(s => {
      const L = s.loops.find(x => x.id === loopId)!;
      L.reactions.push({ ...r, id: uid('r'), at: now() });
      if (!L.silent) s.notices.unshift({ id: uid('n'), kind: 'reaction', title: `New reaction on Version ${r.version}`, body: r.text ? `“${r.text}”` : 'Reaction without text', at: now(), read: false, route: 'LoopDetail', params: { id: loopId } });
    });
    return { ok: true };
  },
  makeInvite: loopId => { const code = uid('inv').slice(4, 12).toUpperCase(); set(s => { const l = s.loops.find(x => x.id === loopId); if (l) l.invite = { code, expiresAt: now() + DAY, used: false }; s.audit.unshift({ id: uid('au'), at: now(), actor: s.user.handle, action: 'loop.invite', detail: code }); }); return code; },
  setLoopStatus: (loopId, st, reason) => set(s => { const l = s.loops.find(x => x.id === loopId); if (l) { l.status = st; if (reason) l.failReason = reason; } s.audit.unshift({ id: uid('au'), at: now(), actor: s.user.handle, action: `loop.${st}`, detail: loopId }); }),
  toggleLoopFlag: (loopId, k) => set(s => { const l = s.loops.find(x => x.id === loopId); if (l) l[k] = !l[k]; }),
  addNote: (loopId, n) => set(s => { const l = s.loops.find(x => x.id === loopId); if (l) l.notes.unshift(n); }),
  cloneLoop: loopId => { const id = uid('loop'); set(s => { const l = s.loops.find(x => x.id === loopId); if (l) s.loops.unshift({ ...JSON.parse(JSON.stringify(l)), id, title: l.title + ' (clone)', reactions: [], status: 'testing', openedAt: now(), failReason: undefined, demo: false }); }); return id; },
  issueToken: (action, payload) => {
    const tok: ApprovalToken = { id: uid('tok'), actor: get().user.handle, action, payloadHash: hash(payload), expiresAt: now() + 5 * 60_000, used: false };
    set(s => { s.tokens.unshift(tok); s.audit.unshift({ id: uid('au'), at: now(), actor: s.user.handle, action: 'token.issue', detail: `${action} · ${tok.id}` }); });
    return tok;
  },
  consumeToken: (tokenId, payload) => {
    const t = get().tokens.find(x => x.id === tokenId);
    if (!t) return { ok: false, reason: 'Unknown approval token' };
    if (t.used) return { ok: false, reason: 'Token already used' };
    if (t.expiresAt < now()) return { ok: false, reason: 'Token expired' };
    if (t.payloadHash !== hash(payload)) return { ok: false, reason: 'Token does not match this action' };
    set(s => { s.tokens.find(x => x.id === tokenId)!.used = true; });
    return { ok: true };
  },
  publish: (loopId, visibility, tokenId) => {
    const l = get().loops.find(x => x.id === loopId); if (!l) return { ok: false, reason: 'Loop not found' };
    const sc = loopScore(l); if (sc === null || sc < l.minScore) return { ok: false, reason: `Loop Score must reach ${l.minScore}` };
    const c = get().consumeToken(tokenId, `publish:${loopId}:${visibility}`); if (!c.ok) return c;
    set(s => { const L = s.loops.find(x => x.id === loopId)!; L.status = 'released'; s.published.unshift({ loopId, at: now(), visibility, approver: s.user.handle, tokenId }); s.audit.unshift({ id: uid('au'), at: now(), actor: s.user.handle, action: 'publish', detail: `${L.title} · ${visibility}` }); });
    return { ok: true };
  },
  withdraw: loopId => set(s => { const l = s.loops.find(x => x.id === loopId); if (l) l.status = 'locked'; s.audit.unshift({ id: uid('au'), at: now(), actor: s.user.handle, action: 'publish.withdraw', detail: loopId }); }),
  requestPayout: (amount, tokenId) => {
    const st = get(); const bal = st.txns.reduce((a, t) => a + t.gross - t.fee, 0) - st.payouts.filter(p => p.status !== 'rejected').reduce((a, p) => a + p.amount, 0);
    if (amount < st.settings.minPayout) return { ok: false, reason: `Minimum payout is ${st.settings.minPayout}` };
    if (amount > bal) return { ok: false, reason: 'Amount exceeds available balance' };
    const c = get().consumeToken(tokenId, `payout:${amount}`); if (!c.ok) return c;
    set(s => { s.payouts.unshift({ id: uid('po'), amount, status: 'pending_review', at: now(), tokenId }); s.audit.unshift({ id: uid('au'), at: now(), actor: s.user.handle, action: 'payout.request', detail: String(amount) }); });
    return { ok: true };
  },
  readNotice: id => set(s => { const n = s.notices.find(x => x.id === id); if (n) n.read = true; }),
  readAll: () => set(s => { s.notices.forEach(n => (n.read = true)); }),
  setSetting: (k, v) => set(s => { (s.settings as any)[k] = v; s.audit.unshift({ id: uid('au'), at: now(), actor: s.user.handle, action: 'settings.change', detail: `${String(k)}=${String(v)}` }); }),
  addAssetVersion: (id, note) => set(s => { const a = s.assets.find(x => x.id === id); if (a) a.versions.push({ v: a.versions.length + 1, at: now(), note }); }),
  toggleCore: id => set(s => { const a = s.assets.find(x => x.id === id); if (a) a.coreIdentity = !a.coreIdentity; }),
  clipOp: (fn, label) => set(s => { s.history.push(JSON.parse(JSON.stringify(s.clips))); s.future = []; s.clips = fn(JSON.parse(JSON.stringify(s.clips))); s.audit.unshift({ id: uid('au'), at: now(), actor: s.user.handle, action: 'edit', detail: label }); }),
  undo: () => set(s => { const p = s.history.pop(); if (p) { s.future.push(s.clips); s.clips = p; } }),
  redo: () => set(s => { const f = s.future.pop(); if (f) { s.history.push(s.clips); s.clips = f; } }),
  correctInsight: (id, text) => set(s => { const i = s.insights.find(x => x.id === id); if (i) { i.text = text; i.corrected = true; } }),
  noteInsight: (id, note) => set(s => { const i = s.insights.find(x => x.id === id); if (i) i.note = note; }),
  neverAgain: idea => set(s => { if (!s.neverIdeas.includes(idea)) s.neverIdeas.unshift(idea); }),
  saveBrief: (brief, out) => set(s => { s.briefs.unshift({ id: uid('b'), brief, at: now(), out }); s.audit.unshift({ id: uid('au'), at: now(), actor: s.user.handle, action: 'copilot.generate', detail: brief.slice(0, 40) }); }),
  reset: () => set(() => initial()),
})), { name: 'vibeloop-v1', storage: createJSONStorage(() => AsyncStorage), partialize: s => ({ ...s, history: [], future: [] }) as any }));

export const balanceOf = (s: State) => s.txns.reduce((a, t) => a + t.gross - t.fee, 0) - s.payouts.filter(p => p.status !== 'rejected').reduce((a, p) => a + p.amount, 0);
