// Server is the source of truth when signed in. Screens update local state optimistically, then `bg()` sends the
// change; any failure triggers a full re-sync from /bootstrap so the app never shows a state the server rejected.
import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { call, online, useSession, saveAccountToken, activateAccount, forgetAccount } from './api';
import { useStore } from '../store/useStore';
import { useSocial } from '../store/useSocial';

let refreshing: Promise<void> | null = null;
export async function bootstrap() {
  const d = await call<any>('GET', '/bootstrap');
  useStore.setState(s => ({
    ...s, onboarded: true, user: { name: d.user.name, handle: d.user.handle, role: d.user.role }, loops: d.loops, txns: d.txns, payouts: d.payouts,
    notices: d.notices, audit: d.audit, assets: d.assets, insights: d.insights, published: d.published, settings: { ...s.settings, ...d.settings },
  }));
  const so = d.social;
  useSocial.setState(s => ({
    ...s, creators: so.creators, posts: so.posts, sparks: so.sparks, chats: so.chats, tribes: so.tribes, lives: so.lives, following: so.following, saved: so.saved,
    joined: so.joined, blocked: so.blocked, restricted: so.restricted, reminders: so.reminders, myReacts: so.myReacts,
    privacy: so.privacy ?? s.privacy, reactionPack: so.reactionPack ?? s.reactionPack, lessons: so.lessons ?? s.lessons, profileMood: so.profileMood ?? s.profileMood, bio: so.bio || s.bio,
  }));
  useSession.setState({ lastSync: Date.now(), error: null });
  // Pending follow requests I sent (private accounts) → "Requested" state on follow buttons. 403 = feature off.
  call<any>('GET', '/follow/requests').then(r => useSocial.setState({ requested: (r.outgoing ?? []).map((x: any) => x.user?.id).filter(Boolean) })).catch(() => useSocial.setState({ requested: [] }));
}
export function refresh() { if (!online()) return Promise.resolve(); return (refreshing ??= bootstrap().catch(e => { useSession.setState({ error: e.message }); }).finally(() => { refreshing = null; })); }

/** Fire-and-forget server write (no-op in offline demo mode). */
export function bg<T = any>(method: string, path: string, body?: any, apply?: (r: T) => void) {
  if (!online()) return;
  call<T>(method, path, body).then(r => apply?.(r)).catch(e => { useSession.setState({ error: e.message }); refresh(); });
}
/** Awaited server write for flows that must not be optimistic (publish, payout, reactions). */
export async function must<T = any>(method: string, path: string, body?: any): Promise<T> { return call<T>(method, path, body); }

export const replaceLoop = (l: any) => useStore.setState(s => ({ loops: s.loops.some(x => x.id === l.id) ? s.loops.map(x => (x.id === l.id ? l : x)) : [l, ...s.loops] }));
export const replacePost = (p: any) => useSocial.setState(s => ({ posts: s.posts.map(x => (x.id === p.id ? p : x)) }));
export const replaceChat = (c: any) => useSocial.setState(s => ({ chats: s.chats.map(x => (x.id === c.id ? c : x)) }));

const toAccount = (u: any): import('./api').Account => ({ id: u.id, handle: u.handle, name: u.name, hue: u.hue ?? 280 });
async function finishLogin(r: any) {
  useStore.getState().reset(); useSocial.setState(useSocial.getInitialState?.() ?? {});
  await saveAccountToken(toAccount(r.user), r.token); await bootstrap(); return r.user;
}
export type OtpTicket = { sent: boolean; channel: string; to: string; expiresIn: number; demoCode?: string };
export const requestOtp = (identifier: string) => call<OtpTicket>('POST', '/auth/otp/request', { identifier: identifier.trim() });
export const register = (handle: string, name: string, email: string) => call<OtpTicket>('POST', '/auth/register', { handle: handle.trim(), name: name.trim(), email: email.trim() });
/** Result of a sign-in step: signed in, or the account has two-factor on and needs a second code. */
export type LoginStep = { user: any; mfaTicket?: undefined } | { user?: undefined; mfaTicket: string };
async function loginStep(r: any): Promise<LoginStep> { return r.mfaRequired ? { mfaTicket: r.mfaTicket } : { user: await finishLogin(r) }; }
export async function verifyOtp(identifier: string, code: string) { return loginStep(await call<any>('POST', '/auth/otp/verify', { identifier: identifier.trim(), code })); }
/** Second step for accounts with two-factor: authenticator code or a recovery code. */
export async function verifyMfa(ticket: string, code: string) { return finishLogin(await call<any>('POST', '/auth/mfa/verify', { ticket, code: code.trim() })); }
/** Password login (staff / seeded test users). */
export async function signIn(email: string, password: string) { return loginStep(await call<any>('POST', '/auth/login', { email, password })); }
export async function switchAccount(id: string) {
  await activateAccount(id); useStore.getState().reset(); useSocial.setState(useSocial.getInitialState?.() ?? {}); await bootstrap();
}
/** Sign out of the active account only; other accounts on the device stay signed in. */
export async function signOut() {
  await call('POST', '/auth/logout').catch(() => {});  // end this device's session on the server
  const s = useSession.getState(); if (s.activeId) await forgetAccount(s.activeId);
  useStore.getState().reset(); const next = useSession.getState().accounts[0]; if (next) await switchAccount(next.id).catch(() => {});
}
/** Invalidate every session of the active account on all devices (server bumps token_version). */
export async function signOutEverywhere() { await call('POST', '/auth/logout-all'); await signOut(); }

/** Publish through the server: get a one-time signed approval token, then spend it. */
export async function publishOnline(loopId: string, visibility: string, rights: Record<string, boolean>) {
  const { token } = await must<any>('POST', '/approvals', { action: 'publish', payload: `${loopId}:${visibility}` });
  const r = await must<any>('POST', `/loops/${loopId}/publish`, { visibility, approvalToken: token, rights });
  replaceLoop(r.loop); useStore.setState(s => ({ published: [r.publish, ...s.published] })); return r.publish;
}
export async function payoutOnline(amount: number) {
  const { token } = await must<any>('POST', '/approvals', { action: 'payout', payload: `${amount}` });
  const p = await must<any>('POST', '/payouts', { amount, approvalToken: token }); useStore.setState(s => ({ payouts: [p, ...s.payouts] })); return p;
}

/** Glow screens call this so the feed / pings / Blinks re-pull from the server when focused (at most every 15 s). */
export function useLiveSync() {
  useFocusEffect(useCallback(() => { if (online() && Date.now() - (useSession.getState().lastSync ?? 0) > 15_000) refresh(); }, []));
}
