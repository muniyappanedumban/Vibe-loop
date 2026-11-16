export const C = {
  bg: '#F4F2FA',
  surface: '#FFFFFF',
  ink: '#120F24',
  ink2: '#221D3D',
  inkSoft: '#6B6785',
  line: '#E7E3F3',
  violet: '#6C3BFF',
  violetSoft: '#EEE8FF',
  pink: '#FF3D9A',
  pinkSoft: '#FFE6F2',
  tangerine: '#FF8A3D',
  lime: '#C8F45A',
  mint: '#2BD9A8',
  mintSoft: '#DDF8EF',
  danger: '#FF4D5E',
  dangerSoft: '#FFE5E8',
  amber: '#FFC23D',
  white: '#FFFFFF',
};
export const PRISM = ['#6C3BFF', '#FF3D9A', '#FF8A3D'] as const;
export const NIGHT = ['#1B1538', '#120F24'] as const;
export const R = { sm: 12, md: 20, lg: 28, pill: 999 };
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const T = {
  h1: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.8, color: C.ink },
  h2: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.5, color: C.ink },
  h3: { fontSize: 17, fontWeight: '700' as const, letterSpacing: -0.3, color: C.ink },
  body: { fontSize: 14, fontWeight: '500' as const, color: C.ink },
  small: { fontSize: 12, fontWeight: '600' as const, color: C.inkSoft },
  tiny: { fontSize: 10, fontWeight: '700' as const, color: C.inkSoft, letterSpacing: 0.6 },
};
