// Hush Control Room prefs, loaded once from GET /me/hush-settings and refreshed whenever HushSettings saves.
// Chat UI (ChatRoom, CallScreen, app lock) reads them from here.
import { create } from 'zustand';
import { call, online } from '../lib/api';

type Who = 'everyone' | 'friends' | 'nobody';
export type HushPrefs = {
  typingVisible: boolean; photoVisibility: Who; whoCanCall: Who; callDataSaver: boolean;
  notif: { messages: boolean; groups: boolean; calls: boolean; moods: boolean; previews: boolean };
  defaultFadeSec: number | null; bubbleTheme: string; fontSize: 's' | 'm' | 'l' | 'xl'; enterToSend: boolean;
  autoDownload: { wifi: boolean; cellular: boolean }; chatLock: boolean;
};
export const HUSH_DEFAULTS: HushPrefs = {
  typingVisible: true, photoVisibility: 'everyone', whoCanCall: 'friends', callDataSaver: false,
  notif: { messages: true, groups: true, calls: true, moods: true, previews: true },
  defaultFadeSec: null, bubbleTheme: 'aqua', fontSize: 'm', enterToSend: false, autoDownload: { wifi: true, cellular: false }, chatLock: false,
};
export const FONT_SCALE: Record<HushPrefs['fontSize'], number> = { s: 0.88, m: 1, l: 1.15, xl: 1.3 };

type S = { prefs: HushPrefs; loaded: boolean; set: (p: HushPrefs) => void; load: (force?: boolean) => Promise<void> };
export const useHushPrefs = create<S>()((set, get) => ({
  prefs: HUSH_DEFAULTS, loaded: false,
  set: p => set({ prefs: { ...HUSH_DEFAULTS, ...p }, loaded: true }),
  async load(force) {
    if ((get().loaded && !force) || !online()) return;
    try { const r = await call<{ settings: HushPrefs }>('GET', '/me/hush-settings'); get().set(r.settings); } catch { /* keep defaults */ }
  },
}));
