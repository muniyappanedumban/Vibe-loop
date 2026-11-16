import { Platform } from 'react-native';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// Default API: EXPO_PUBLIC_API_URL at build time, else emulator/localhost. Changeable at runtime on the sign-in screen.
const DEFAULT_URL = process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'android' ? 'http://10.0.2.2:8787' : 'http://localhost:8787');
export const MAX_ACCOUNTS = 5;
const tokenKey = (id: string) => `vibeloop.token.${id.replace(/[^\w.-]/g, '_')}`;
const secure = {
  get: async (id: string) => (Platform.OS === 'web' ? (globalThis as any).sessionStorage?.getItem(tokenKey(id)) ?? null : SecureStore.getItemAsync(tokenKey(id))),
  set: async (id: string, v: string | null) => {
    if (Platform.OS === 'web') { const ss = (globalThis as any).sessionStorage; v ? ss?.setItem(tokenKey(id), v) : ss?.removeItem(tokenKey(id)); return; }
    v ? await SecureStore.setItemAsync(tokenKey(id), v) : await SecureStore.deleteItemAsync(tokenKey(id));
  },
};
export type Account = { id: string; handle: string; name: string; hue: number };
type Session = { apiUrl: string; mode: 'none' | 'online' | 'demo'; module: 'social' | 'chat'; accounts: Account[]; activeId: string | null; email: string | null;
  token: string | null; lastSync: number | null; error: string | null;
  setApiUrl: (u: string) => void; setMode: (m: Session['mode']) => void; setModule: (m: Session['module']) => void };
export const useSession = create<Session>()(persist(set => ({
  apiUrl: DEFAULT_URL, mode: 'none', module: 'social', accounts: [], activeId: null, email: null, token: null, lastSync: null, error: null,
  setApiUrl: apiUrl => set({ apiUrl: apiUrl.replace(/\/$/, '') }), setMode: mode => set({ mode }), setModule: module => set({ module }),
}), { name: 'vibeloop-session', storage: createJSONStorage(() => AsyncStorage), partialize: s => ({ apiUrl: s.apiUrl, mode: s.mode, module: s.module, accounts: s.accounts, activeId: s.activeId, email: s.email, lastSync: s.lastSync }) as any }));

export const online = () => useSession.getState().mode === 'online' && !!useSession.getState().token;
/** Load the active account's token from secure storage (tokens never go to AsyncStorage). */
export async function loadToken() { const id = useSession.getState().activeId; const t = id ? await secure.get(id) : null; useSession.setState({ token: t }); return t; }
export async function saveAccountToken(acc: Account, t: string) {
  const s = useSession.getState(); const exists = s.accounts.some(a => a.id === acc.id);
  if (!exists && s.accounts.length >= MAX_ACCOUNTS) throw new ApiError(0, `You can keep up to ${MAX_ACCOUNTS} accounts on this device. Remove one first.`);
  await secure.set(acc.id, t);
  useSession.setState({ accounts: exists ? s.accounts.map(a => (a.id === acc.id ? acc : a)) : [...s.accounts, acc], activeId: acc.id, token: t, mode: 'online' });
}
export async function activateAccount(id: string) { const t = await secure.get(id); if (!t) throw new ApiError(401, 'Session expired for this account — sign in again'); useSession.setState({ activeId: id, token: t, mode: 'online' }); }
export async function forgetAccount(id: string) {
  await secure.set(id, null); const s = useSession.getState(); const rest = s.accounts.filter(a => a.id !== id);
  useSession.setState({ accounts: rest, ...(s.activeId === id ? { activeId: null, token: null, mode: 'none' as const } : {}) });
}
/** @deprecated single-account helper kept for the password path */
export async function saveToken(t: string | null) { useSession.setState({ token: t }); }

export class ApiError extends Error { constructor(public status: number, msg: string) { super(msg); } }
export async function call<T = any>(method: string, path: string, body?: any, timeoutMs = 12000): Promise<T> {
  const { apiUrl, token } = useSession.getState();
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(apiUrl + path, { method, signal: ctl.signal, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new ApiError(r.status, typeof data.detail === 'string' ? data.detail : `Request failed (${r.status})`);
    return data as T;
  } catch (e: any) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, e?.name === 'AbortError' ? 'Server did not respond' : `Can't reach server at ${apiUrl}`);
  } finally { clearTimeout(timer); }
}
