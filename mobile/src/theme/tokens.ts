export const C = {
  bg: '#F5F5F7',
  surface: '#FFFFFF',
  ink: '#0A0A0F',
  ink2: '#1C1C24',
  inkSoft: '#62626E',
  line: '#E6E6EB',
  violet: '#5B4CF5',
  violetSoft: '#ECEAFE',
  pink: '#7C6CFF',
  pinkSoft: '#EFEDFF',
  tangerine: '#A99BFF',
  lime: '#D4FF3F',
  mint: '#2BD9A8',
  mintSoft: '#DDF8EF',
  danger: '#FF4D5E',
  dangerSoft: '#FFE5E8',
  amber: '#FFC23D',
  white: '#FFFFFF',
};
export const PRISM = ['#5B4CF5', '#7C6CFF', '#A99BFF'] as const;
/** Neutral dark surface for hero cards (replaces the old purple gradient). */
export const NIGHT_CARD = ['#17171F', '#0A0A0F'] as const;
export const NIGHT = ['#17171F', '#0A0A0F'] as const;
export const R = { sm: 10, md: 16, lg: 22, pill: 999 };
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const T = {
  h1: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.8, color: C.ink },
  h2: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.5, color: C.ink },
  h3: { fontSize: 17, fontWeight: '700' as const, letterSpacing: -0.3, color: C.ink },
  body: { fontSize: 14, fontWeight: '500' as const, color: C.ink },
  small: { fontSize: 12, fontWeight: '600' as const, color: C.inkSoft },
  tiny: { fontSize: 10, fontWeight: '700' as const, color: C.inkSoft, letterSpacing: 0.6 },
};
