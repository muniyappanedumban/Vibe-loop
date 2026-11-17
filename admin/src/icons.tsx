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
  appeals: 'M4 4h16v12H8l-4 4zM8 9h8M8 12h5',
  scan: 'M3 7V3h4M17 3h4v4M21 17v4h-4M7 21H3v-4M7 12h10',
  incidents: 'M12 2l9 4v6c0 5-4 9-9 10-5-1-9-5-9-10V6zM12 8v5M12 16v.5',
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
  navigation: 'M5 3h14v18H5zM5 16h14M8.5 18.5h.01M12 18.5h.01M15.5 18.5h.01',
  screens: 'M7 2h10v20H7zM11 18h2',
  themes: 'M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A4.6 4.6 0 0 0 21 9.8C21 6 17 3 12 3zM7.5 12.5h.01M9.5 8h.01M14.5 8h.01M17 11.5h.01',
  userapp: 'M7 2h10v20H7zM11 18h2M10 7h4M10 11h4',
  switches: 'M3 7h11M18 7h3M3 17h5M12 17h9M16 5v4M10 15v4',
  limits: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
  zones: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  slabs: 'M12 3l9 5-9 5-9-5zM3 12.5l9 5 9-5M3 17l9 5 9-5',
  languages: 'M4 5h8M8 3v2M6 5c0 4 3 7 6 8M10 5c0 4-3 7-6 8M13 21l4-9 4 9M14.5 18h5',
  preview: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  otp: 'M5 10h14v11H5zM8 10V7a4 4 0 0 1 8 0v3M9 15.5h.01M12 15.5h.01M15 15.5h.01',
  identity: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1',
  chat: 'M4 5h16v11H9l-5 4z',
  realtime: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13',
  calls: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  push: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0',
  e2ee: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4M12 15v2',
  learn: 'M2 7l10-4 10 4-10 4zM6 9v5c0 1.5 3 3 6 3s6-1.5 6-3V9M22 7v6',
  down: 'M12 5v14M5 12l7 7 7-7',
  cashflow: 'M3 17l5-5 4 4 8-8M15 8h5v5',
  money: 'M3 6h18v12H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 9v.01M18 15v.01',
  plans: 'M4 8l8-5 8 5v8l-8 5-8-5zM4 8l8 5 8-5M12 13v8',
  countries: 'M4 21V4M4 4h10l-1 3h7v8h-9l1-3H4',
  boosts: 'M13 2L4 14h7l-1 8 9-12h-7z',
  stash: 'M4 7h16l-1.5 13h-13zM9 7V5a3 3 0 0 1 6 0v2',
  plugs: 'M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5',
  promos: 'M4 9v6h3l8 4V5L7 9zM18 9.5a3.5 3.5 0 0 1 0 5M7 15l1.5 5h2.5l-1.3-4.5',
  pages: 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h5',
  blog: 'M4 4h16v16H4zM8 8h8M8 12h8M8 16h4',
  reviews: 'M12 3l2.5 5.3 5.8.7-4.3 4 1.1 5.7L12 16l-5.1 2.7 1.1-5.7-4.3-4 5.8-.7zM12 8v4',
  speakup: 'M4 5h16v11h-7l-5 4v-4H4zM12 8v3M12 13.5v.01',
  uploads: 'M12 15V4M7.5 8.5L12 4l4.5 4.5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',
  'x-clock': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  't-home': 'M3 11l9-7 9 7v9h-6v-6H9v6H3z',
  't-compass': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z',
  't-plus': 'M12 5v14M5 12h14',
  't-play': 'M7 4l13 8-13 8z',
  't-user': 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.5-6 8-6s8 2 8 6',
  't-users': 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-4 3-6 7-6s7 2 7 6M16 3.5a4 4 0 0 1 0 7.5M18 15c2.5.6 4 2.6 4 6',
  't-message': 'M4 5h16v11H9l-5 4z',
  't-sparkle': 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
  't-town': 'M3 21h18M5 21V10l4-3 4 3v11M13 21V6l3-3 3 3v15M8 13h2M8 17h2M15 9h2M15 13h2',
};

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[name] ?? P['t-sparkle']} />
    </svg>
  );
}

export function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5B4CF5" /><stop offset="1" stopColor="#3F33C9" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill="url(#lg)" />
      <path d="M9 16a7 7 0 0 1 12-5M23 16a7 7 0 0 1-12 5" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <circle cx="16" cy="16" r="2.4" fill="#fff" />
    </svg>
  );
}
