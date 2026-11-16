// Server-driven theming. Admin edits theme layers → /app-config returns `theme` (+hash).
// Styles across the app are created at module load, so a theme is applied BEFORE the app modules load (see index.ts),
// and a changed theme triggers one app reload. No secrets, no remote code — only validated colour values and variants.
import { Platform, DevSettings } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, PRISM, R } from './tokens';
import { CC, AQUA, BUBBLE_THEMES } from '../chat/theme';

export type ModTheme = { preset?: string; primary: string; secondary: string; tertiary?: string; accent: string; bg: string; surface: string; ink: string; navStyle: string; radius: 'sharp' | 'soft' | 'round'; density?: 'compact' | 'comfy' };
export type Theme = { social: ModTheme; chat: ModTheme; hash?: string };
const KEY = 'vibeloop-theme-applied';
const HEX = /^#[0-9a-fA-F]{6}$/;
const mix = (hex: string, w: number) => { const n = parseInt(hex.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (255 - v) * w)); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); };
const soften = (hex: string, w = 0.86) => (HEX.test(hex) ? mix(hex, w) : hex);
export const NAV = { social: 'pill', chat: 'dock' } as Record<'social' | 'chat', string>;

export function applyTheme(t: Theme | null) {
  if (!t) return;
  const s = t.social, c = t.chat;
  if (s && [s.primary, s.secondary, s.accent, s.bg, s.surface, s.ink].every(x => HEX.test(x))) {
    Object.assign(C, { violet: s.primary, violetSoft: soften(s.primary), pink: s.secondary, pinkSoft: soften(s.secondary, 0.88), tangerine: s.tertiary && HEX.test(s.tertiary) ? s.tertiary : C.tangerine, lime: s.accent, bg: s.bg, surface: s.surface, ink: s.ink, line: mix(s.ink, 0.88) });
    (PRISM as any)[0] = s.primary; (PRISM as any)[1] = s.secondary; (PRISM as any)[2] = s.tertiary && HEX.test(s.tertiary) ? s.tertiary : s.secondary;
    Object.assign(R, s.radius === 'sharp' ? { sm: 6, md: 10, lg: 14 } : s.radius === 'soft' ? { sm: 10, md: 16, lg: 22 } : { sm: 12, md: 20, lg: 28 });
    NAV.social = s.navStyle === 'dock' ? 'dock' : 'pill';
  }
  if (c && [c.primary, c.secondary, c.accent, c.bg, c.surface, c.ink].every(x => HEX.test(x))) {
    Object.assign(CC, { teal: c.primary, tealSoft: soften(c.primary), aqua: c.secondary, aquaSoft: soften(c.secondary), sun: c.accent, sunSoft: soften(c.accent, 0.82), bg: c.bg, surface: c.surface, ink: c.ink, me: c.ink, line: mix(c.ink, 0.86), inkSoft: mix(c.ink, 0.38) });
    (AQUA as any)[0] = c.primary; (AQUA as any)[1] = c.secondary; BUBBLE_THEMES.aqua = [c.primary, c.secondary];
    NAV.chat = c.navStyle === 'pill' ? 'pill' : 'dock';
  }
}
export async function loadAppliedTheme(): Promise<Theme | null> {
  try { const raw = await AsyncStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
let reloading = false;
/** Called when a new /app-config arrives. Returns true if the app is reloading to apply a new theme. */
export async function syncTheme(t: Theme | undefined) {
  if (!t?.hash || reloading) return false;
  const cur = await loadAppliedTheme();
  if (cur?.hash === t.hash) return false;
  await AsyncStorage.setItem(KEY, JSON.stringify(t));
  if (!cur) { applyTheme(t); return false; } // first run: tokens not yet used heavily; next launch is fully themed
  reloading = true;
  if (Platform.OS === 'web') { (globalThis as any).location?.reload(); return true; }
  try { const U = require('expo-updates'); await U.reloadAsync(); } catch { try { DevSettings.reload(); } catch { reloading = false; } }
  return true;
}
