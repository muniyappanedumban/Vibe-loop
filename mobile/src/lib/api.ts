import { Platform } from 'react-native';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// Default API: EXPO_PUBLIC_API_URL at build time, else emulator/localhost. Changeable at runtime on the sign-in screen.
const DEFAULT_URL = process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'android' ? 'http://10.0.2.2:8787' : 'http://localhost:8787');
const TOKEN_KEY = 'vibeloop.token';
const secure = {
  get: async () => (Platform.OS === 'web' ? (globalThis as any).sessionStorage?.getItem(TOKEN_KEY) ?? null : SecureStore.getItemAsync(TOKEN_KEY)),
  set: async (v: string | null) => {
    if (Platform.OS === 'web') { const ss = (globalThis as any).sessionStorage; v ? ss?.setItem(TOKEN_KEY, v) : ss?.removeItem(TOKEN_KEY); return; }
    v ? await SecureStore.setItemAsync(TOKEN_KEY, v) : await SecureStore.deleteItemAsync(TOKEN_KEY);
  },
};

type Session = { apiUrl: string; mode: 'none' | 'online' | 'demo'; email: string | null; token: string | null; lastSync: number | null; error: string | null;
  setApiUrl: (u: string) => void; setMode: (m: Session['mode']) => void };
export const useSession = create<Session>()(persist(set => ({
  apiUrl: DEFAULT_URL, mode: 'none', email: null, token: null, lastSync: null, error: null,
  setApiUrl: apiUrl => set({ apiUrl: apiUrl.replace(/\/$/, '') }), setMode: mode => set({ mode }),
}), { name: 'vibeloop-session', storage: createJSONStorage(() => AsyncStorage), partialize: s => ({ apiUrl: s.apiUrl, mode: s.mode, email: s.email, lastSync: s.lastSync }) as any }));

export const online = () => useSession.getState().mode === 'online' && !!useSession.getState().token;
export async function loadToken() { const t = await secure.get(); useSession.setState({ token: t }); return t; }
export async function saveToken(t: string | null) { await secure.set(t); useSession.setState({ token: t }); }

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
