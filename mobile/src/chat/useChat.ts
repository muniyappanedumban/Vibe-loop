// Chat module state. Server-backed only (Chat needs the API — offline demo shows an honest sign-in prompt).
// Real-time: polls every 5 s while Chat is open (WebSocket push is not implemented yet).
import { create } from 'zustand';
import { call, online } from '../lib/api';

export type CUser = { id: string; handle: string; name: string; hue: number; bio?: string; verified?: boolean; mood?: number | null; close?: boolean; bestie?: boolean; since?: number };
export type Conv = { id: string; title: string; group: boolean; members: CUser[]; folder: string | null; muted: boolean; pinned: boolean; locked: boolean; theme: string | null; fadeSec: number | null; request: boolean; unread: number; last: { text: string; at: number; from: string } | null };
export type Msg = { id: string; convId: string; from: string; kind: 'text' | 'poll' | 'post' | 'draft' | 'viewonce' | 'ping' | 'system'; text: string; replyTo: { id: string; text: string; from: string } | null;
  reactions: { moji: number; by: string }[]; starred: boolean; pinned: boolean; edited: boolean; deleted: boolean; at: number; expiresAt: number | null; sendAt: number | null;
  poll: { q: string; options: { text: string; votes: number }[]; myVote: number | null } | null; ref: { type: 'post' | 'loop'; id: string; title: string; hue: number } | null; opened: boolean };
export type Status = { id: string; by: CUser | string; kind: 'text' | 'mood'; text: string; moji: number | null; bg: string | null; audience: string; at: number; expiresAt: number };
export type Town = { id: string; name: string; open: boolean; hue: number; about: string; members: number; role: string | null; channels: { id: string; name: string }[]; board: { id: string; text: string; at: number }[]; invite: string | null };
export type TMsg = { id: string; from: CUser | string; text: string; at: number };
export type Profile = { name: string; handle: string; social_bio: string; chat_bio: string; hidden: boolean; who_can_message: 'everyone' | 'friends' | 'nobody'; ghost_hours: boolean; focus_social_muted: boolean; social_private: boolean; chat_read_receipts: boolean; handle_changed_at?: number | null; mood?: number | null };

type S = {
  ready: boolean; error: string | null; profile: Profile | null;
  friends: CUser[]; incoming: { id: string; from: CUser; at: number }[]; outgoing: { id: string; to: CUser; at: number }[];
  convs: Conv[]; msgs: Record<string, Msg[]>; statuses: Status[]; towns: Town[]; townMsgs: Record<string, TMsg[]>; pulse: { social: number; chat: number };
};
const init: S = { ready: false, error: null, profile: null, friends: [], incoming: [], outgoing: [], convs: [], msgs: {}, statuses: [], towns: [], townMsgs: {}, pulse: { social: 0, chat: 0 } };
export const useChat = create<S>()(() => init);
const set = useChat.setState; const get = useChat.getState;
// Server sends `by`/`from` as "me" | userId plus a `user` object; the UI wants "me" | User.
const normS = (xs: any[]): Status[] => xs.map(x => ({ ...x, by: x.by === 'me' ? 'me' : x.user ?? x.by }));
const normT = (xs: any[]): TMsg[] => xs.map(x => ({ ...x, from: x.from === 'me' ? 'me' : x.user ?? x.from }));
const wrap = async <T,>(p: Promise<T>) => { try { const r = await p; set({ error: null }); return r; } catch (e: any) { set({ error: e.message }); throw e; } };

export const chat = {
  reset: () => set(init),
  /** Load chat data if a chat screen is opened directly (deep link, notification, Smart Jump). */
  ensure() { if (!get().ready && online()) return chat.loadAll().catch(() => {}); return Promise.resolve(); },
  async loadAll() {
    if (!online()) return;
    const [fr, convs, statuses, towns, profile, pulse] = await Promise.all([
      call<any>('GET', '/friends'), call<Conv[]>('GET', '/conv'), call<Status[]>('GET', '/status'), call<Town[]>('GET', '/towns'), call<Profile>('GET', '/me/profile'), call<any>('GET', '/pulse'),
    ]);
    set({ ready: true, error: null, friends: fr.friends, incoming: fr.incoming, outgoing: fr.outgoing, convs, statuses: normS(statuses as any), towns, profile, pulse });
  },
  async pulse() { if (online()) set({ pulse: await call('GET', '/pulse') }); },
  async refreshConvs() { if (online()) set({ convs: await call('GET', '/conv') }); },
  async openConv(id: string) { const m = await wrap(call<Msg[]>('GET', `/conv/${id}/messages`)); set(s => ({ msgs: { ...s.msgs, [id]: m } })); },
  async send(convId: string, body: { text: string; kind?: string; replyTo?: string; poll?: { q: string; options: string[] }; viewOnce?: boolean; sendAt?: number }) {
    await wrap(call('POST', `/conv/${convId}/messages`, body)); await Promise.all([chat.openConv(convId), chat.refreshConvs()]);
  },
  async msgAction(convId: string, id: string, action: 'react' | 'star' | 'pin' | 'vote' | 'open', body?: any) { const r = await wrap(call<any>('POST', `/messages/${id}/${action}`, body)); await chat.openConv(convId); return r; },
  async edit(convId: string, id: string, text: string) { await wrap(call('PATCH', `/messages/${id}`, { text })); await chat.openConv(convId); },
  async undo(convId: string, id: string) { await wrap(call('DELETE', `/messages/${id}`)); await chat.openConv(convId); },
  async forward(convId: string, id: string, to: string) { await wrap(call('POST', `/messages/${id}/forward`, { convId: to })); await chat.refreshConvs(); },
  async patchConv(id: string, body: Partial<{ folder: string | null; muted: boolean; pinned: boolean; locked: boolean; theme: string; fadeSec: number | null; accept: boolean }>) {
    const c = await wrap(call<Conv>('PATCH', `/conv/${id}`, body)); set(s => ({ convs: s.convs.map(x => (x.id === id ? { ...x, ...c } : x)) })); return c;
  },
  async newConv(members: string[], title?: string) { const c = await wrap(call<Conv>('POST', '/conv', { members, title })); await chat.refreshConvs(); return c; },
  async lookup(handle: string) { return wrap(call<CUser>('GET', `/users/lookup?handle=${encodeURIComponent(handle)}`)); },
  async friendRequest(handle: string) { await wrap(call('POST', '/friends/request', { handle })); await chat.loadFriends(); },
  async answer(id: string, ok: boolean) { await wrap(call('POST', `/friends/requests/${id}/${ok ? 'accept' : 'decline'}`)); await chat.loadFriends(); },
  async unfriend(id: string) { await wrap(call('DELETE', `/friends/${id}`)); await chat.loadFriends(); },
  async friendFlag(id: string, body: { close?: boolean; bestie?: boolean }) { await wrap(call('PATCH', `/friends/${id}`, body)); await chat.loadFriends(); },
  async loadFriends() { const fr = await call<any>('GET', '/friends'); set({ friends: fr.friends, incoming: fr.incoming, outgoing: fr.outgoing }); },
  async ping(to: string, moji: number, kind: 'wave' | 'heart' | 'ping') { await wrap(call('POST', '/pings', { to, moji, kind })); },
  async postStatus(body: { kind: 'text' | 'mood'; text?: string; moji?: number; bg?: string; audience: string }) { await wrap(call('POST', '/status', body)); set({ statuses: normS(await call('GET', '/status')) }); },
  async replyStatus(id: string, text: string) { await wrap(call('POST', `/status/${id}/reply`, { text })); await chat.refreshConvs(); },
  async deleteStatus(id: string) { await wrap(call('DELETE', `/status/${id}`)); set({ statuses: normS(await call('GET', '/status')) }); },
  async loadTowns() { set({ towns: await call('GET', '/towns') }); },
  async createTown(name: string, open: boolean, about: string) { const t = await wrap(call<Town>('POST', '/towns', { name, open, about })); await chat.loadTowns(); return t; },
  async town(id: string) { const t = await wrap(call<Town>('GET', `/towns/${id}`)); set(s => ({ towns: s.towns.some(x => x.id === id) ? s.towns.map(x => (x.id === id ? t : x)) : [...s.towns, t] })); return t; },
  async joinTown(id: string, code?: string) { await wrap(call('POST', `/towns/${id}/join`, { code })); await chat.loadTowns(); },
  async leaveTown(id: string) { await wrap(call('POST', `/towns/${id}/leave`)); await chat.loadTowns(); },
  async townMsgs(id: string, cid: string) { const m = normT(await call<any[]>('GET', `/towns/${id}/channels/${cid}/messages`)); set(s => ({ townMsgs: { ...s.townMsgs, [`${id}/${cid}`]: m } })); },
  async townSend(id: string, cid: string, text: string) { await wrap(call('POST', `/towns/${id}/channels/${cid}/messages`, { text })); await chat.townMsgs(id, cid); },
  async townBoard(id: string, text: string) { await wrap(call('POST', `/towns/${id}/board`, { text })); await chat.town(id); },
  async townInvite(id: string) { await wrap(call('POST', `/towns/${id}/invite`)); return chat.town(id); },
  async townChannel(id: string, name: string) { await wrap(call('POST', `/towns/${id}/channels`, { name })); return chat.town(id); },
  async share(convId: string, type: 'post' | 'loop', id: string, note?: string) { await wrap(call('POST', '/bridge/share', { convId, type, id, note })); await chat.refreshConvs(); },
  async search(q: string) { return wrap(call<Msg[]>('GET', `/search/messages?q=${encodeURIComponent(q)}`)); },
  async saveProfile(p: Partial<Profile>) { const r = await wrap(call<Profile>('PATCH', '/me/profile', p)); set({ profile: r }); return r; },
  async changeHandle(handle: string) { const r = await wrap(call<any>('POST', '/me/handle', { handle })); await chat.loadAll(); return r; },
};
export const uname = (u: CUser | string | undefined, friends: CUser[] = []) => (typeof u === 'string' ? (u === 'me' ? 'You' : friends.find(f => f.id === u)?.name ?? '') : u?.name ?? '');
export const memberOf = (c: Conv, id: string) => c.members.find(m => m.id === id);
