// Every screen, in screenshot order. Used by scripts/shoot-mobile.mjs (?s=<name>&id=<param>).
export const SCREENS: { name: string; folder: string; params?: Record<string, string> }[] = [
  { name: 'Onboarding', folder: '01-onboarding' },
  { name: 'NewLoop', folder: '02-first-loop-wizard' },
  { name: 'Home', folder: '03-home-command-centre' },
  { name: 'Loops', folder: '04-loops' },
  { name: 'LoopDetail', folder: '05-loop-detail', params: { id: 'l1' } },
  { name: 'FanReact', folder: '06-fan-reaction', params: { id: 'l1' } },
  { name: 'Archive', folder: '07-learning-archive' },
  { name: 'Create', folder: '08-create-studio' },
  { name: 'Copilot', folder: '09-brief-copilot' },
  { name: 'Editor', folder: '10-video-editor' },
  { name: 'Audio', folder: '11-audio-subtitles' },
  { name: 'Library', folder: '12-library' },
  { name: 'Memory', folder: '13-memory-graph' },
  { name: 'ReleaseGate', folder: '14-release-gate', params: { id: 'l1' } },
  { name: 'Profile', folder: '15-profile' },
  { name: 'Earnings', folder: '16-earnings' },
  { name: 'Payout', folder: '17-payout-request' },
  { name: 'Notifications', folder: '18-notifications' },
  { name: 'Settings', folder: '19-settings' },
];
export const TAB_SCREENS = ['Home', 'Loops', 'Create', 'Library', 'Profile'];
