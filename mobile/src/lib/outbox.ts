// Offline outbox: anything created without internet (Hush messages & files, Glow Drops & Blinks) is queued here,
// persisted on the device, and sent automatically when the connection returns. Client ids make retries idempotent.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { call, useSession, ApiError } from './api';
import { uploadResumable, UploadFile, UploadState, fileSize } from './uploads';

export type OutKind = 'msg' | 'post' | 'spark';
export type OutItem = { id: string; account: string; kind: OutKind; path: string; body: any; file?: UploadFile; fileField?: 'mediaUrl' | 'attachment'; up?: UploadState;
  status: 'queued' | 'sending' | 'failed'; error?: string; progress?: number; at: number; label: string };
type S = { items: OutItem[]; online: boolean };
export const useOutbox = create<S>()(persist((): S => ({ items: [], online: true }), { name: 'vibeloop-outbox', storage: createJSONStorage(() => AsyncStorage), partialize: s => ({ items: s.items }) as any }));
const set = (fn: (s: S) => Partial<S>) => useOutbox.setState(fn as any);
const patch = (id: string, p: Partial<OutItem>) => set(s => ({ items: s.items.map(i => (i.id === id ? { ...i, ...p } : i)) }));

export function enqueue(it: Omit<OutItem, 'status' | 'at' | 'account'>) {
  const account = useSession.getState().activeId ?? 'demo';
  set(s => ({ items: [...s.items.filter(x => x.id !== it.id), { ...it, account, status: 'queued', at: Date.now() }] }));
  flush();
}
export const isNetworkError = (e: any) => e instanceof ApiError && e.status === 0;
let running = false; const listeners = new Set<(it: OutItem, result: any) => void>();
export const onSent = (fn: (it: OutItem, result: any) => void) => { listeners.add(fn); return () => listeners.delete(fn); };

export async function flush() {
  if (running) return; const sess = useSession.getState(); if (sess.mode !== 'online' || !sess.token) return;
  running = true;
  try {
    for (const it of useOutbox.getState().items.filter(i => i.account === sess.activeId && i.status !== 'failed')) {
      patch(it.id, { status: 'sending', error: undefined });
      try {
        const body = { ...it.body };
        if (it.file && !it.file.size) { const size = await fileSize(it.file.uri); it.file = { ...it.file, size }; patch(it.id, { file: it.file }); }
        if (it.file) {
          const done = await uploadResumable(it.file, it.up ?? {}, up => patch(it.id, { up }), p => patch(it.id, { progress: p }));
          if (it.fileField === 'attachment') body.attachment = { url: done.url, name: it.file.name, size: it.file.size, mime: done.mime, kind: done.kind };
          else body.mediaUrl = done.url;
        }
        const res = await call<any>('POST', it.path, body);
        set(s => ({ items: s.items.filter(x => x.id !== it.id), online: true }));
        listeners.forEach(fn => fn(it, res));
      } catch (e: any) {
        if (isNetworkError(e)) { patch(it.id, { status: 'queued', error: 'Waiting for connection' }); set(() => ({ online: false })); break; }
        patch(it.id, { status: 'failed', error: e.message });
      }
    }
  } finally { running = false; }
}
export const retry = (id: string) => { patch(id, { status: 'queued', error: undefined }); flush(); };
export const discard = (id: string) => set(s => ({ items: s.items.filter(x => x.id !== id) }));

// Auto-flush on reconnect, foreground and every 10 s.
NetInfo.addEventListener(st => { const on = !!st.isConnected && st.isInternetReachable !== false; set(() => ({ online: on })); if (on) flush(); });
AppState.addEventListener('change', s => { if (s === 'active') flush(); });
setInterval(() => { if (useOutbox.getState().items.length) flush(); }, 10_000);
