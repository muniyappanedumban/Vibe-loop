// "Vibes" — VibeLoop's original reaction stickers (replace generic emoji).
import React from 'react';
import Svg, { Circle, Path, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

export type VibeKind = 'share' | 'skip' | 'work' | 'forme';
export const VIBE_META: Record<VibeKind, { label: string; color: string; soft: string }> = {
  share: { label: 'Would share', color: '#6C3BFF', soft: '#EEE8FF' },
  skip: { label: 'Would skip', color: '#6B6785', soft: '#EFEDF5' },
  work: { label: 'Needs work', color: '#FF8A3D', soft: '#FFEEDF' },
  forme: { label: 'This is for me', color: '#FF3D9A', soft: '#FFE6F2' },
};

export function Vibe({ kind, size = 40 }: { kind: VibeKind; size?: number }) {
  const id = `g-${kind}-` + React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const stops: Record<VibeKind, [string, string]> = {
    share: ['#8B5CFF', '#5A2BF0'], skip: ['#B9B5CC', '#8A85A3'], work: ['#FFB067', '#FF7A2E'], forme: ['#FF6FB5', '#FF2E8A'],
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={stops[kind][0]} />
          <Stop offset="1" stopColor={stops[kind][1]} />
        </LinearGradient>
      </Defs>
      <Rect x="3" y="3" width="42" height="42" rx="16" fill={`url(#${id})`} />
      {/* face */}
      {kind === 'share' && (<>
        <Circle cx="18" cy="20" r="2.6" fill="#fff" /><Circle cx="30" cy="20" r="2.6" fill="#fff" />
        <Path d="M16 27c2.5 4.5 13.5 4.5 16 0" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" />
        <Path d="M36 7l1.4 3.2L41 11l-3.6.8L36 15l-1.4-3.2L31 11l3.6-.8z" fill="#C8F45A" />
      </>)}
      {kind === 'skip' && (<>
        <Path d="M15 20h6M27 20h6" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        <Path d="M17 30h14" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        <Path d="M33 35c2 0 3-1 3-3" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      </>)}
      {kind === 'work' && (<>
        <Circle cx="18" cy="20" r="2.6" fill="#fff" /><Path d="M27 19.5h6" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        <Path d="M17 30c4-2 10-2 14 0" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" />
        <Path d="M33 6l-3 6h4l-3 6" stroke="#120F24" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </>)}
      {kind === 'forme' && (<>
        <Path d="M15 20.5c1-2 4-2 5 0M28 20.5c1-2 4-2 5 0" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" />
        <Path d="M17 27c2.5 5 11.5 5 14 0z" fill="#fff" />
        <Path d="M37 8.5c-1.2-1.6-3.6-.8-3.6 1.1 0 1.8 3.6 4 3.6 4s3.6-2.2 3.6-4c0-1.9-2.4-2.7-3.6-1.1z" fill="#C8F45A" />
      </>)}
    </Svg>
  );
}
