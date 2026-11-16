const P: Record<string, string> = {
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-4 3-6 7-6s7 2 7 6M16 3.5a4 4 0 0 1 0 7.5M18 15c2.5.6 4 2.6 4 6',
  moderation: 'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5zM8.5 12l2.5 2.5 4.5-5',
  payouts: 'M3 7h18v12H3zM3 11h18M7 15h4M16 3l-4 4-4-4',
  health: 'M3 12h4l3-7 4 14 3-7h4',
  costs: 'M12 3v18M17 7c0-2-2.2-3-5-3s-5 1.3-5 3.5S9 11 12 12s5 1.8 5 4.5S14.8 20 12 20s-5-1-5-3',
  flags: 'M5 21V4M5 4h12l-2 4 2 4H5',
  audit: 'M6 3h9l4 4v14H6zM15 3v4h4M9 11h7M9 15h7M9 19h4',
  privacy: 'M6 10V8a6 6 0 0 1 12 0v2M5 10h14v11H5zM12 14v3',
  abuse: 'M12 3l10 18H2zM12 10v5M12 18v.5',
  revenue: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  announcements: 'M3 10v4h4l7 5V5L7 10zM18 8a5 5 0 0 1 0 8',
  roles: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 17h6M17 14v6',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  emoji: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14.5c1 1.3 2.1 2 3.5 2s2.5-.7 3.5-2M9 9.5v.5M15 9.5v.5',
  features: 'M12 2l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 15.5 6.6 18.5l1.2-6-4.5-4.2 6.1-.7z',
  general: 'M4 6h16M4 12h16M4 18h10',
  security: 'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5zM12 8v5M12 16v.5',
  monetisation: 'M12 3v18M17 7c0-2-2.2-3-5-3s-5 1.3-5 3.5S9 11 12 12s5 1.8 5 4.5S14.8 20 12 20s-5-1-5-3',
  notifications: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  content: 'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4',
  integrations: 'M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0zM12 16v5',
  branding: 'M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.5-4-8-9-8zM7.5 11v.5M10 7v.5M15 7.5v.5',
  admins: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.5-6 8-6s8 2 8 6',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  check: 'M5 12l5 5 9-10',
  x: 'M6 6l12 12M18 6L6 18',
  up: 'M12 19V5M5 12l7-7 7 7',
  key: 'M8 14a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM11 11l10 0M18 11v3M21 11v2',
};

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[name]} />
    </svg>
  );
}

export function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6C3BFF" /><stop offset=".55" stopColor="#FF3D9A" /><stop offset="1" stopColor="#FF8A3D" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill="url(#lg)" />
      <path d="M9 16a7 7 0 0 1 12-5M23 16a7 7 0 0 1-12 5" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <circle cx="16" cy="16" r="2.4" fill="#C8F45A" />
    </svg>
  );
}
