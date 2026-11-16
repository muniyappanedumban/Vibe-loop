// "Vibe Lenses" — original overlay filters for photos, posts and stories (no third-party filter assets).
// They are overlays rendered on top of the media, saved with the post as a lens key, so every viewer sees the same look.
import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { VibeMoji } from './VibeMoji';

export const LENSES = [
  { key: 'none', name: 'Original' }, { key: 'warm', name: 'Golden Hour' }, { key: 'cool', name: 'Monsoon' }, { key: 'noir', name: 'Noir' },
  { key: 'neon', name: 'Neon Edge' }, { key: 'vintage', name: 'Old Reel' }, { key: 'festival', name: 'Festival' }, { key: 'city', name: 'City Lens' },
  { key: 'mood', name: 'Mood Lens' }, { key: 'sparkle', name: 'Sparkle' },
] as const;
export type LensKey = (typeof LENSES)[number]['key'];

export function LensOverlay({ lens, city, moji = 118 }: { lens?: string | null; city?: string | null; moji?: number }) {
  switch (lens) {
    case 'warm': return <LinearGradient pointerEvents="none" colors={['rgba(255,170,60,0.35)', 'rgba(255,90,60,0.12)']} style={StyleSheet.absoluteFill} />;
    case 'cool': return <LinearGradient pointerEvents="none" colors={['rgba(40,120,255,0.30)', 'rgba(20,200,220,0.12)']} style={StyleSheet.absoluteFill} />;
    case 'noir': return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(20,20,24,0.48)' }]} />;
    case 'vintage': return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(160,110,50,0.30)', borderWidth: 10, borderColor: 'rgba(250,240,220,0.75)' }]} />;
    case 'neon': return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderWidth: 4, borderColor: '#C8F45A', borderRadius: 4, shadowColor: '#C8F45A', shadowOpacity: 0.9, shadowRadius: 14 }]} />;
    case 'festival': return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" viewBox="0 0 100 150" preserveAspectRatio="none">
          {Array.from({ length: 12 }).map((_, i) => <Circle key={i} cx={4 + i * 8.4} cy={4} r={3.4} fill={i % 2 ? '#FFB703' : '#FB8500'} />)}
          {Array.from({ length: 12 }).map((_, i) => <Circle key={'b' + i} cx={4 + i * 8.4} cy={146} r={3.4} fill={i % 2 ? '#FB8500' : '#FFB703'} />)}
          <Path d="M0 10 Q50 26 100 10" stroke="#FFD166" strokeWidth={1.4} fill="none" />
        </Svg>
      </View>);
    case 'city': return (
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderWidth: 6, borderColor: 'rgba(255,255,255,0.9)' }]}>
        <View style={s.cityTag}><Text style={s.cityT}>{(city || 'MY CITY').toUpperCase()}</Text></View>
      </View>);
    case 'mood': return <View pointerEvents="none" style={s.moodSticker}><VibeMoji id={moji} size={64} /></View>;
    case 'sparkle': return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" viewBox="0 0 100 150">
          {[[15, 20], [80, 30], [60, 70], [25, 110], [85, 120], [45, 135]].map(([x, y], i) => <Path key={i} d={`M${x} ${y - 5}l1.4 3.6 3.6 1.4-3.6 1.4L${x} ${y + 5}l-1.4-3.6-3.6-1.4 3.6-1.4z`} fill="#fff" opacity={0.9} />)}
        </Svg>
      </View>);
    default: return null;
  }
}
/** Photo (if uploaded) or generated cover art, with the lens applied. */
export function Media({ uri, hue, lens, city, h = 340, radius = 0, children }: { uri?: string | null; hue: number; lens?: string | null; city?: string | null; h?: number; radius?: number; children?: React.ReactNode }) {
  return (
    <View style={{ width: '100%', height: h, borderRadius: radius, overflow: 'hidden', backgroundColor: '#120F24' }}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors /> : (
        <LinearGradient colors={[`hsl(${hue},80%,58%)`, `hsl(${hue + 40},85%,45%)`, '#120F24']} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />)}
      <LensOverlay lens={lens} city={city} />
      {children}
    </View>
  );
}
const s = StyleSheet.create({
  cityTag: { position: 'absolute', bottom: 14, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 4 },
  cityT: { fontWeight: '900', letterSpacing: 3, color: '#120F24' },
  moodSticker: { position: 'absolute', top: 14, right: 14, transform: [{ rotate: '12deg' }] },
});
