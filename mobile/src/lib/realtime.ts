// Real-time gateway client (WebSocket). Replaces polling when the server's `realtime` feature is on.
// Reconnects with backoff, re-subscribes after network changes, and falls back to polling if the socket can't connect.
import { create } from 'zustand';
import { AppState } from 'react-native';
import { useSession, online } from './api';
import { feature } from './config';

type Handler = (ev: any) => void;
const handlers = new Map<string, Set<Handler>>();
export const onEvent = (type: string, fn: Handler) => { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type)!.add(fn); return () => handlers.get(type)!.delete(fn); };
type RT = { status: 'off' | 'connecting' | 'live' | 'retrying'; typing: Record<string, Record<string, number>>; presence: Record<string, { online: boolean; lastSeen: number | null }> };
export const useRealtime = create<RT>(() => ({ status: 'off', typing: {}, presence: {} }));

let ws: WebSocket | null = null; let tries = 0; let opened = 0; let timer: any = null; let pinger: any = null;
export function rtSend(msg: any) { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(msg)); return true; } return false; }
export function connectRealtime() {
  if (!online() || !feature('realtime')) return;
  const { apiUrl, token } = useSession.getState(); if (!token) return;
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
  useRealtime.setState({ status: tries ? 'retrying' : 'connecting' });
  const url = apiUrl.replace(/^http/, 'ws') + `/ws?token=${encodeURIComponent(token)}`;
  try { ws = new WebSocket(url); } catch { return schedule(); }
  ws.onopen = () => { opened = Date.now(); useRealtime.setState({ status: 'live' }); clearInterval(pinger); pinger = setInterval(() => rtSend({ type: 'ping' }), 25_000); };
  ws.onmessage = e => {
    let ev: any; try { ev = JSON.parse(String(e.data)); } catch { return; }
    if (ev.type === 'typing') useRealtime.setState(s => ({ typing: { ...s.typing, [ev.convId]: { ...(s.typing[ev.convId] ?? {}), [ev.userId]: ev.on ? Date.now() : 0 } } }));
    if (ev.type === 'presence') useRealtime.setState(s => ({ presence: { ...s.presence, [ev.userId]: { online: !!ev.online, lastSeen: ev.lastSeen ?? null } } }));
    handlers.get(ev.type)?.forEach(fn => { try { fn(ev); } catch {} }); handlers.get('*')?.forEach(fn => { try { fn(ev); } catch {} });
  };
  ws.onclose = (e: any) => {
    clearInterval(pinger); ws = null;
    // 4401 = session expired/replaced, 4403 = suspended or realtime switched off by admin → stop and fall back to polling (no reconnect storm).
    if (e?.code === 4401 || e?.code === 4403) { tries = 0; useRealtime.setState({ status: 'off' }); return; }
    if (online()) schedule(); else useRealtime.setState({ status: 'off' });
  };
  ws.onerror = () => { try { ws?.close(); } catch {} };
}
function schedule() { clearTimeout(timer); if (opened && Date.now() - opened > 10_000) tries = 0; opened = 0; tries++; useRealtime.setState({ status: 'retrying' }); timer = setTimeout(connectRealtime, Math.min(30_000, 1000 * 2 ** Math.min(tries, 5))); }
export function disconnectRealtime() { clearTimeout(timer); clearInterval(pinger); tries = 0; try { ws?.close(); } catch {} ws = null; useRealtime.setState({ status: 'off' }); }
export const typingIn = (convId: string) => Object.entries(useRealtime.getState().typing[convId] ?? {}).filter(([, t]) => t && Date.now() - t < 6000).map(([u]) => u);
AppState.addEventListener('change', s => { if (s === 'active') connectRealtime(); });
useSession.subscribe((s, p) => { if (s.token !== p.token) { disconnectRealtime(); if (s.token) setTimeout(connectRealtime, 300); } });
