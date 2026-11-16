// Server is the source of truth when signed in. Screens update local state optimistically, then `bg()` sends the
// change; any failure triggers a full re-sync from /bootstrap so the app never shows a state the server rejected.
import { call, online, useSession, saveToken } from './api';
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

export async function signIn(email: string, password: string) {
  const r = await call<any>('POST', '/auth/login', { email, password }); await saveToken(r.token);
  useSession.setState({ mode: 'online', email }); await bootstrap(); return r.user;
}
export async function signUp(email: string, password: string, name: string, handle: string) {
  const r = await call<any>('POST', '/auth/signup', { email, password, name, handle }); await saveToken(r.token);
  useSession.setState({ mode: 'online', email }); await bootstrap(); return r.user;
}
export async function signOut() { await saveToken(null); useSession.setState({ mode: 'none', email: null }); useStore.getState().reset(); }

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
