// "Aqua Pulse" — the Chat module's own palette (Social keeps "Prism Pulse"). Same ink family so switching feels like one app.
export const CC = {
  bg: '#F3F6F6', surface: '#FFFFFF', ink: '#0B1416', ink2: '#16262A', inkSoft: '#5B6B6E', line: '#E0E7E7',
  teal: '#0D9488', tealSoft: '#DDF3F1', aqua: '#0EA5A0', aquaSoft: '#DCF2F1', coral: '#FF6B4A', coralSoft: '#FFE7E3', sun: '#FF6B4A', sunSoft: '#FFEDE8',
  me: '#0B1F24', them: '#FFFFFF',
};
export const AQUA = ['#0D9488', '#0EA5A0'] as const;
export const BUBBLE_THEMES: Record<string, [string, string]> = {
  aqua: ['#0D9488', '#0EA5A0'], ink: ['#0B1416', '#24363A'], sunset: ['#FF8A5B', '#FF5A8A'], night: ['#0B1F24', '#244E57'], lime: ['#7BD85E', '#14B88D'], grape: ['#7B5CFF', '#14A8E6'],
};
