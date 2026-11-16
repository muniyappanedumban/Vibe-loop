// Original VibeLoop icon set — hand-drawn SVG paths, rounded 2px strokes on a 24 grid.
import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { C } from '../theme/tokens';

export type IconName =
  | 'home' | 'loops' | 'plus' | 'library' | 'user' | 'bell' | 'search' | 'back' | 'chevron'
  | 'spark' | 'film' | 'mic' | 'wand' | 'graph' | 'wallet' | 'gear' | 'lock' | 'shield'
  | 'send' | 'check' | 'close' | 'clock' | 'play' | 'pause' | 'scissors' | 'layers' | 'text'
  | 'archive' | 'link' | 'globe' | 'eye' | 'cash' | 'copy' | 'trash' | 'wave' | 'fingerprint'
  | 'star' | 'flag' | 'bulb' | 'download' | 'undo' | 'redo' | 'chat' | 'calendar';

const P: Record<IconName, (c: string) => React.ReactNode> = {
  home: c => <><Path d="M4 11.5 12 4l8 7.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9v5.5H5.5A1.5 1.5 0 0 1 4 19z" stroke={c} /></>,
  loops: c => <><Circle cx="9" cy="12" r="5" stroke={c} /><Circle cx="15" cy="12" r="5" stroke={c} /></>,
  plus: c => <Path d="M12 5v14M5 12h14" stroke={c} />,
  library: c => <><Rect x="4" y="4" width="7" height="7" rx="2.5" stroke={c} /><Rect x="13" y="4" width="7" height="7" rx="3.5" stroke={c} /><Rect x="4" y="13" width="7" height="7" rx="3.5" stroke={c} /><Rect x="13" y="13" width="7" height="7" rx="2.5" stroke={c} /></>,
  user: c => <><Circle cx="12" cy="8.5" r="3.8" stroke={c} /><Path d="M4.5 20c1.2-3.6 4-5.3 7.5-5.3s6.3 1.7 7.5 5.3" stroke={c} /></>,
  bell: c => <><Path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" stroke={c} /><Path d="M10 20.5h4" stroke={c} /></>,
  search: c => <><Circle cx="11" cy="11" r="6.5" stroke={c} /><Path d="m16 16 4 4" stroke={c} /></>,
  back: c => <Path d="M14.5 5.5 8 12l6.5 6.5" stroke={c} />,
  chevron: c => <Path d="M9.5 5.5 16 12l-6.5 6.5" stroke={c} />,
  spark: c => <Path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7zM19 16.5c.2 1.4.8 2 2.2 2.2-1.4.2-2 .8-2.2 2.2-.2-1.4-.8-2-2.2-2.2 1.4-.2 2-.8 2.2-2.2z" stroke={c} />,
  film: c => <><Rect x="5" y="3.5" width="14" height="17" rx="3.5" stroke={c} /><Path d="m10.5 9.5 4 2.5-4 2.5z" stroke={c} /></>,
  mic: c => <><Rect x="9" y="3.5" width="6" height="11" rx="3" stroke={c} /><Path d="M6 11.5a6 6 0 0 0 12 0M12 17.5v3" stroke={c} /></>,
  wand: c => <><Path d="m4 20 11-11M13 7l4 4" stroke={c} /><Path d="M18 3v3M16.5 4.5h3M7 4v2M6 5h2" stroke={c} /></>,
  graph: c => <><Circle cx="6" cy="7" r="2.5" stroke={c} /><Circle cx="18" cy="6" r="2.5" stroke={c} /><Circle cx="12" cy="17" r="3" stroke={c} /><Path d="m8 8.5 2.8 6M16.6 8l-3.3 6.4M8.5 7l7-.8" stroke={c} /></>,
  wallet: c => <><Path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" stroke={c} /><Rect x="4" y="8" width="16" height="11" rx="3" stroke={c} /><Circle cx="16" cy="13.5" r="1.2" stroke={c} /></>,
  gear: c => <><Circle cx="12" cy="12" r="3" stroke={c} /><Path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6" stroke={c} /></>,
  lock: c => <><Rect x="5" y="10.5" width="14" height="10" rx="3" stroke={c} /><Path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke={c} /></>,
  shield: c => <><Path d="M12 3.5 19 6v5.5c0 4.2-3 7.6-7 9-4-1.4-7-4.8-7-9V6z" stroke={c} /><Path d="m9 12 2 2 4-4" stroke={c} /></>,
  send: c => <Path d="M20 4 3.5 10.5l7 2.5 2.5 7zM10.5 13 20 4" stroke={c} />,
  check: c => <Path d="m5 12.5 4.5 4.5L19 7.5" stroke={c} />,
  close: c => <Path d="M6 6l12 12M18 6 6 18" stroke={c} />,
  clock: c => <><Circle cx="12" cy="12" r="8" stroke={c} /><Path d="M12 7.5V12l3 2" stroke={c} /></>,
  play: c => <Path d="M7.5 5v14l11-7z" stroke={c} />,
  pause: c => <Path d="M8 5v14M16 5v14" stroke={c} />,
  scissors: c => <><Circle cx="6.5" cy="7" r="2.5" stroke={c} /><Circle cx="6.5" cy="17" r="2.5" stroke={c} /><Path d="M8.5 8.5 20 18M8.5 15.5 20 6" stroke={c} /></>,
  layers: c => <><Path d="m12 4 8.5 4.5L12 13 3.5 8.5z" stroke={c} /><Path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5" stroke={c} /></>,
  text: c => <Path d="M5 6.5V5h14v1.5M12 5v14M9 19h6" stroke={c} />,
  archive: c => <><Rect x="3.5" y="4.5" width="17" height="5" rx="1.5" stroke={c} /><Path d="M5 9.5v8.5A1.5 1.5 0 0 0 6.5 19.5h11A1.5 1.5 0 0 0 19 18V9.5M10 13.5h4" stroke={c} /></>,
  link: c => <Path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" stroke={c} />,
  globe: c => <><Circle cx="12" cy="12" r="8.5" stroke={c} /><Path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z" stroke={c} /></>,
  eye: c => <><Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" stroke={c} /><Circle cx="12" cy="12" r="3" stroke={c} /></>,
  cash: c => <><Rect x="3" y="6" width="18" height="12" rx="3" stroke={c} /><Circle cx="12" cy="12" r="2.5" stroke={c} /><Path d="M6.5 9.5v5M17.5 9.5v5" stroke={c} /></>,
  copy: c => <><Rect x="8" y="8" width="12" height="12" rx="3" stroke={c} /><Path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" stroke={c} /></>,
  trash: c => <Path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5" stroke={c} />,
  wave: c => <Path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 7v10M21 12h0" stroke={c} />,
  fingerprint: c => <Path d="M7 18c1.2-1.8 1.8-3.8 1.8-6a3.2 3.2 0 0 1 6.4 0c0 3-.8 5.6-2.2 8M5 14.5c.4-1 .6-1.8.6-2.5a6.4 6.4 0 0 1 12.8 0c0 1.4-.1 2.7-.4 4M12 12c0 3.2-1 6-3 8.5" stroke={c} />,
  star: c => <Path d="m12 4 2.4 5 5.4.7-4 3.7 1 5.4L12 16.2l-4.8 2.6 1-5.4-4-3.7 5.4-.7z" stroke={c} />,
  flag: c => <Path d="M5.5 21V4.5M5.5 5h11l-2 4 2 4h-11" stroke={c} />,
  bulb: c => <><Path d="M9 17.5h6M10 20.5h4M12 3.5a6 6 0 0 0-3.6 10.8c.5.4.6.9.6 1.5v1.7h6v-1.7c0-.6.2-1.1.6-1.5A6 6 0 0 0 12 3.5z" stroke={c} /></>,
  download: c => <Path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" stroke={c} />,
  undo: c => <Path d="M9 7 4.5 11.5 9 16M5 11.5h9a5 5 0 0 1 0 10h-2" stroke={c} />,
  redo: c => <Path d="m15 7 4.5 4.5L15 16M19 11.5h-9a5 5 0 0 0 0 10h2" stroke={c} />,
  chat: c => <Path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-7l-4.5 3.5V17.5H5A1.5 1.5 0 0 1 3.5 16V7A1.5 1.5 0 0 1 5 5.5z" stroke={c} />,
  calendar: c => <><Rect x="4" y="5.5" width="16" height="15" rx="3" stroke={c} /><Path d="M8 3.5v4M16 3.5v4M4 10.5h16" stroke={c} /></>,
};

export function Icon({ name, size = 22, color = C.ink, stroke = 2 }: { name: IconName; size?: number; color?: string; stroke?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {P[name](color)}
    </Svg>
  );
}
