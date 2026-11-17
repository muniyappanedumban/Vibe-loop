// Add-on batch 5 — screens. Builder fills this file.
import type React from 'react';
export type AddonEntry = { route: string; title: string; sub: string; icon: string; module: 'glow' | 'hush'; flag: string; needsConv?: boolean };
export const SCREENS: Record<string, React.ComponentType<any>> = {};
export const ENTRIES: AddonEntry[] = [];
