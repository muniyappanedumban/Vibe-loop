// Server-driven app config: nav bars, modules, screens, features, limits and UI language come from GET /app-config.
// The last good config is cached so the app still renders offline; built-in defaults apply before first fetch.
import React from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { call, useSession } from './api';
import { syncTheme } from '../theme/applyTheme';

export type NavItem = { key: string; label: string; icon: string; enabled: boolean; order: number };
export type AppConfig = {
  version: number; resolvedFor: { country: string; zone: string; slab: string; lang: string };
  modules: { social: boolean; chat: boolean }; nav: { social: NavItem[]; chat: NavItem[] };
  screens: Record<string, boolean>; features: Record<string, boolean>; limits: Record<string, number>; fees: { platformFee: number };
  languages: { default: string; available: string[]; strings: Record<string, string> }; theme?: import('../theme/applyTheme').Theme; banner: { id: string; text: string; tone?: string; suggestLang?: string } | string | null;
};
const nav = (keys: [string, string, string][]) => keys.map(([key, label, icon], i) => ({ key, label, icon, enabled: true, order: i + 1 }));
export const DEFAULT_CONFIG: AppConfig = {
  version: 0, resolvedFor: { country: 'IN', zone: 'IN', slab: 'starter', lang: 'en' }, modules: { social: true, chat: true },
  nav: { social: nav([['Home', 'Hub', 'home'], ['Explore', 'Drift', 'compass'], ['Create', 'Make', 'plus'], ['Motion', 'Flicks', 'motion'], ['Profile', 'Me', 'user']]),
         chat: nav([['Chats', 'Hush', 'chats'], ['Friends', 'Squad', 'friends'], ['Vibes', 'Moods', 'vibes'], ['Towns', 'Hoods', 'towns'], ['ChatMe', 'Me', 'me']]) },
  screens: {}, features: {}, limits: { maxAccounts: 5, statusHours: 24, editWindowMin: 15, undoWindowMin: 60 }, fees: { platformFee: 0.08 },
  languages: { default: 'en', available: ['en'], strings: {} }, banner: null,
};
export const LANG_NAMES: Record<string, string> = { en: 'English', hi: 'हिन्दी', ta: 'தமிழ்', te: 'తెలుగు', kn: 'ಕನ್ನಡ', ml: 'മലയാളം', mr: 'मराठी', bn: 'বাংলা' };

type S = { cfg: AppConfig; loadedAt: number | null; error: string | null };
export const useConfig = create<S>()(persist((): S => ({ cfg: DEFAULT_CONFIG, loadedAt: null, error: null }), { name: 'vibeloop-config', storage: createJSONStorage(() => AsyncStorage) }));
export async function loadConfig() {
  try { const lang = useConfig.getState().cfg.resolvedFor.lang; const cfg = await call<AppConfig>('GET', `/app-config?lang=${lang}`); useConfig.setState({ cfg: { ...DEFAULT_CONFIG, ...cfg }, loadedAt: Date.now(), error: null }); await syncTheme(cfg.theme); }
  catch (e: any) { useConfig.setState({ error: e.message }); }
}
/** Translate a UI string from the server-provided language pack, falling back to the English text. */
export const t = (key: string, fallback: string) => useConfig.getState().cfg.languages.strings[key] ?? fallback;
export const useT = () => { const strings = useConfig(s => s.cfg.languages.strings); return (key: string, fallback: string) => strings[key] ?? fallback; };
/** Feature flag: unknown keys default ON (base config), admin can switch them off per region / slab. */
export const useFeature = (key: string) => useConfig(s => s.cfg.features[key] !== false);
export const feature = (key: string) => useConfig.getState().cfg.features[key] !== false;
export const useScreenOn = (key: string) => useConfig(s => s.cfg.screens[key] !== false);
export const navItems = (cfg: AppConfig, m: 'social' | 'chat') => [...cfg.nav[m]].filter(n => n.enabled).sort((a, b) => a.order - b.order);
export const _session = useSession; // keep import used (config refetch happens after sign-in)
