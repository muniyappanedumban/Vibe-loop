import { useCallback, useEffect, useState } from 'react';

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:8787';
const KEY = 'vibeloop.admin.token';
const UKEY = 'vibeloop.admin.user';

export interface ApiUser { id: string; email: string; handle: string; name: string; role: string; suspended: boolean; mfaRequired: boolean; createdAt: number }
export interface Overview { users: number; creators: number; loops: number; reactions: number; posts: number; openReports: number; pendingPayouts: number; pendingPrivacy: number; gross: number; fees: number }
export interface Report { id: string; reporter: string; target: string; reason: string; reasonCode: string | null; status: string; at: number }
export interface ApiPayout { id: string; creator: string; amount: number; status: string; at: number; reviewedBy: string | null }
export interface AuditRow { id: number; at: number; actor: string; action: string; detail: string }
export interface PrivacyReq { id: string; user: string; kind: string; status: string; at: number }
export interface ApiAnnouncement { id: string; title: string; body: string; audience: string; by: string; at: number }
export interface SearchResult { users: ApiUser[]; posts: { id: string; text: string }[]; loops: { id: string; title: string }[]; audit: { id: number; action: string; detail: string }[] }
export type KV<T = Record<string, unknown>> = Record<string, T>;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export const getToken = () => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
export const getUser = (): ApiUser | null => { try { return JSON.parse(sessionStorage.getItem(UKEY) ?? 'null'); } catch { return null; } };
export function setSession(token: string | null, user?: ApiUser) {
  try {
    if (token) { sessionStorage.setItem(KEY, token); if (user) sessionStorage.setItem(UKEY, JSON.stringify(user)); }
    else { sessionStorage.removeItem(KEY); sessionStorage.removeItem(UKEY); }
  } catch { /* storage unavailable */ }
  dispatchEvent(new Event('vl-auth'));
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const tok = getToken();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(API_URL + path, { method: opts.method ?? 'GET', headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  } catch {
    throw new ApiError(`Cannot reach the VibeLoop API at ${API_URL}. Is the backend running?`, 0);
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const d = (data as { detail?: unknown } | null)?.detail;
    const msg = typeof d === 'string' ? d : Array.isArray(d) ? d.map((x: { msg?: string }) => x.msg ?? JSON.stringify(x)).join('; ') : `Request failed (${res.status})`;
    if (res.status === 401 && tok) setSession(null);
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export async function login(email: string, password: string) {
  const r = await api<{ token: string; user: ApiUser }>('/auth/login', { method: 'POST', body: { email, password } });
  if (r.user.role !== 'owner') throw new ApiError('This account is not staff (owner role required).', 403);
  setSession(r.token, r.user);
  return r;
}

/** Fetch a GET endpoint; `reload` refetches. `path` null skips fetching. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!path) { setLoading(false); return; }
    let live = true; setLoading(true);
    api<T>(path).then(d => { if (live) { setData(d); setError(null); } }, e => { if (live) setError((e as Error).message); }).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [path, n]);
  const reload = useCallback(() => setN(x => x + 1), []);
  return { data, error, loading, reload };
}
