// Chat module state. Server-backed only (Chat needs the API — offline demo shows an honest sign-in prompt).
// Real-time: WebSocket gateway (src/lib/realtime.ts) when the admin `realtime` flag is on; 5 s polling is the fallback.
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { call, online, useSession } from '../lib/api';
import { enqueue, isNetworkError, onSent, useOutbox } from '../lib/outbox';
import { UploadFile } from '../lib/uploads';
import { feature } from '../lib/config';
import { onEvent, rtSend } from '../lib/realtime';
import { encryptFor, decrypt } from './e2ee';
const lastRead: Record<string, string> = {};
async function decryptAll(convId: string, ms: Msg[]) {
  const c = useChat.getState().convs.find(x => x.id === convId); const peer = c && !c.group ? c.members[0]?.id : null; if (!peer) return;
  const todo = ms.filter(m => m.enc && m.plain === undefined); if (!todo.length) return;
  const out: Record<string, string> = {}; for (const m of todo) out[m.id] = (await decrypt(m.enc!, peer, m.from === 'me')) ?? '🔒 Can’t decrypt on this device';
  useChat.setState(s => ({ msgs: { ...s.msgs, [convId]: (s.msgs[convId] ?? []).map(m => (out[m.id] !== undefined ? { ...m, plain: out[m.id] } : m)) } }));
}

export type CUser = { id: string; handle: string; name: string; hue: number; bio?: string; verified?: boolean; mood?: number | null; close?: boolean; bestie?: boolean; since?: number; avatar?: string | null; lastSeen?: number | null; flame?: number; moodDrop?: { moji: number; text?: string } | null };
export type Conv = { e2ee?: boolean; id: string; title: string; group: boolean; members: CUser[]; folder: string | null; muted: boolean; pinned: boolean; locked: boolean; theme: string | null; fadeSec: number | null; request: boolean; unread: number; last: { text: string; at: number; from: string } | null };
export type Msg = { id: string; convId: string; from: string; kind: 'text' | 'poll' | 'post' | 'draft' | 'viewonce' | 'ping' | 'system' | 'file' | 'voice' | 'snap' | 'call'; status?: 'sent' | 'delivered' | 'read' | null; durationSec?: number | null; enc?: { v: number; nonce: string; box: string; senderKey: string } | null; plain?: string; attachment?: { url: string | null; name?: string; size?: number; mime: string; kind: string; locked?: boolean } | null; pending?: boolean; text: string; replyTo: { id: string; text: string; from: string } | null;
  reactions: { moji: number; by: string }[]; starred: boolean; pinned: boolean; edited: boolean; deleted: boolean; at: number; expiresAt: number | null; sendAt: number | null;
  poll: { q: string; options: { text: string; votes: number }[]; myVote: number | null } | null; ref: { type: 'post' | 'loop'; id: string; title: string; hue: number } | null; opened: boolean };
export type Status = { id: string; by: CUser | string; kind: 'text' | 'mood'; text: string; moji: number | null; bg: string | null; audience: string; at: number; expiresAt: number };
export type Town = { id: string; name: string; open: boolean; hue: number; about: string; members: number; role: string | null; channels: { id: string; name: string }[]; board: { id: string; text: string; at: number }[]; invite: string | null };
export type TMsg = { id: string; from: CUser | string; text: string; at: number };
export type Profile = { name: string; handle: string; social_bio: string; chat_bio: string; hidden: boolean; who_can_message: 'everyone' | 'friends' | 'nobody'; ghost_hours: boolean; focus_social_muted: boolean; social_private: boolean; chat_read_receipts: boolean; handle_changed_at?: number | null; mood?: number | null; avatar_social?: string | null; avatar_chat?: string | null; cover?: string | null; state?: string; pronouns?: string; links?: string[]; last_seen_visible?: boolean; country?: string; lang?: string };

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
  convsSorted: () => get().convs.filter(c => !c.request).sort((a, b) => (b.last?.at ?? 0) - (a.last?.at ?? 0)),
  /** Offline cache: restore the last synced chats for the active account (read old chats without internet). */
  async hydrate() { const id = useSession.getState().activeId; if (!id) return; try { const raw = await AsyncStorage.getItem(`vibeloop-chat-cache-${id}`); if (raw && !get().ready) set({ ...JSON.parse(raw), ready: true, error: 'Offline — showing saved chats' }); } catch {} },
  /** Load chat data if a chat screen is opened directly (deep link, notification, Smart Jump). */
  ensure() { if (!get().ready && online()) return chat.loadAll().catch(() => {}); return Promise.resolve(); },
  async loadAll() {
    if (!online()) return;
    await chat.hydrate();
    const [fr, convs, statuses, towns, profile, pulse] = await Promise.all([
      call<any>('GET', '/friends'), call<Conv[]>('GET', '/conv'), call<Status[]>('GET', '/status'), call<Town[]>('GET', '/towns'), call<Profile>('GET', '/me/profile'), call<any>('GET', '/pulse'),
    ]);
    set({ ready: true, error: null, friends: fr.friends, incoming: fr.incoming, outgoing: fr.outgoing, convs, statuses: normS(statuses as any), towns, profile, pulse });
  },
  async pulse() { if (online()) set({ pulse: await call('GET', '/pulse') }); },
  async refreshConvs() { if (online()) set({ convs: await call('GET', '/conv') }); },
  async openConv(id: string) { const m = await wrap(call<Msg[]>('GET', `/conv/${id}/messages`)); set(s => ({ msgs: { ...s.msgs, [id]: m } })); decryptAll(id, m); },
  /** Read receipts: tell the server everything up to the newest message from others is read (blue ticks for them). */
  async markRead(id: string) { const last = [...(get().msgs[id] ?? [])].reverse().find(m => m.from !== 'me' && !m.pending); if (!last || !feature('readReceipts') || lastRead[id] === last.id) return; lastRead[id] = last.id; if (!rtSend({ type: 'read', convId: id, upTo: last.id })) call('POST', `/conv/${id}/read`, { upTo: last.id }).catch(() => {}); },
  typing(id: string, on: boolean) { if (feature('typing')) rtSend({ type: 'typing', convId: id, on }); },
  /** End-to-end encrypted 1:1 text (NaCl box). Falls back to a clear error — never silently sends plaintext. */
  async sendEncrypted(convId: string, peerId: string, text: string) { const enc = await encryptFor(peerId, text); await call('POST', `/conv/${convId}/messages`, { id: 'm_' + Math.random().toString(36).slice(2, 12), kind: 'text', enc }); await Promise.all([chat.openConv(convId), chat.refreshConvs()]); },
  async openSnap(convId: string, id: string) { const r = await wrap(call<any>('POST', `/messages/${id}/open`)); await chat.openConv(convId); return r as { message: Msg; mediaUrl: string }; },
  /** Send now if possible; otherwise queue in the outbox (shows as pending, sends automatically later). */
  async send(convId: string, body: { text: string; kind?: string; replyTo?: string; poll?: { q: string; options: string[] }; viewOnce?: boolean; sendAt?: number; durationSec?: number; enc?: any }, file?: UploadFile) {
    const id = 'm_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    const full = { ...body, id };
    if (!file) {
      try { await call('POST', `/conv/${convId}/messages`, full); await Promise.all([chat.openConv(convId), chat.refreshConvs()]); return; }
      catch (e: any) { if (!isNetworkError(e)) { set({ error: e.message }); throw e; } }
    }
    enqueue({ id, kind: 'msg', path: `/conv/${convId}/messages`, body: { ...full, kind: body.kind ?? (file ? 'file' : 'text') }, file, fileField: file ? 'attachment' : undefined, label: file ? `${body.kind === 'voice' ? 'Voice note' : body.kind === 'snap' ? 'Snap' : 'File'} · ${file.name}` : `Message · ${body.text.slice(0, 40)}` });
  },
  /** Pending (outbox) messages for a conversation, rendered after the synced ones. */
  pendingFor(convId: string): Msg[] {
    return useOutbox.getState().items.filter(i => i.kind === 'msg' && i.path === `/conv/${convId}/messages`).map(i => ({ id: i.id, convId, from: 'me', kind: i.body.kind ?? 'text', text: i.body.text, replyTo: null, reactions: [], starred: false, pinned: false, edited: false, deleted: false, at: i.at, expiresAt: null, sendAt: null, poll: null, ref: null, opened: false, pending: true, attachment: i.file ? { url: i.file.uri, name: i.file.name, size: i.file.size, mime: i.file.mime, kind: 'file' } : null }));
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

// Persist a compact cache per account so Hush works offline (last 200 messages per chat).
let saveT: any = null;
useChat.subscribe(st => {
  const id = useSession.getState().activeId; if (!id || !st.ready) return;
  clearTimeout(saveT); saveT = setTimeout(() => {
    const msgs = Object.fromEntries(Object.entries(st.msgs).map(([k, v]) => [k, v.slice(-200)]));
    AsyncStorage.setItem(`vibeloop-chat-cache-${id}`, JSON.stringify({ profile: st.profile, friends: st.friends, incoming: st.incoming, outgoing: st.outgoing, convs: st.convs, msgs, statuses: st.statuses, towns: st.towns, townMsgs: st.townMsgs })).catch(() => {});
  }, 800);
});
// When the outbox delivers a message, refresh that chat.
onSent(it => { if (it.kind === 'msg') { const conv = it.path.split('/')[2]; chat.openConv(conv).catch(() => {}); chat.refreshConvs().catch(() => {}); } });

// Live updates from the WebSocket gateway: refetch only what changed.
const live = new Set<string>(); export const watchConv = (id: string | null, on: boolean) => { if (id) on ? live.add(id) : live.delete(id); };
onEvent('message.new', ev => { if (live.has(ev.convId)) chat.openConv(ev.convId).then(() => chat.markRead(ev.convId)).catch(() => {}); else rtSend({ type: 'delivered', convId: ev.convId, upTo: ev.message?.id }); chat.refreshConvs().catch(() => {}); });
onEvent('message.updated', ev => { if (live.has(ev.convId)) chat.openConv(ev.convId).catch(() => {}); });
onEvent('receipt', ev => { if (live.has(ev.convId)) chat.openConv(ev.convId).catch(() => {}); });
onEvent('conv.updated', () => { chat.refreshConvs().catch(() => {}); });
