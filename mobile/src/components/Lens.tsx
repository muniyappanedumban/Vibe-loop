// "Vibe Lenses" — original overlay filters for photos, posts and stories (no third-party filter assets).
// They are overlays rendered on top of the media, saved with the post as a lens key, so every viewer sees the same look.
import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { VibeMoji } from './VibeMoji';

// 36 Vibe Lenses. `t` = tint overlay, `g` = two-stop gradient wash, `f` = frame; the rest are special renderers below.
type LensDef = { key: string; name: string; t?: string; g?: [string, string]; f?: string };
export const LENSES: LensDef[] = [
  { key: 'none', name: 'Raw' }, { key: 'warm', name: 'Golden Hour' }, { key: 'cool', name: 'Monsoon' }, { key: 'noir', name: 'Noir' }, { key: 'neon', name: 'Neon Edge' },
  { key: 'vintage', name: 'Old Reel' }, { key: 'festival', name: 'Festival' }, { key: 'city', name: 'City Lens' }, { key: 'mood', name: 'Mood Lens' }, { key: 'sparkle', name: 'Sparkle' },
  { key: 'chai', name: 'Chai Tone', t: 'rgba(176,112,60,0.28)' }, { key: 'mint', name: 'Mint Haze', t: 'rgba(80,220,180,0.22)' }, { key: 'dusk', name: 'Dusk Drive', g: ['rgba(255,120,80,0.30)', 'rgba(80,60,160,0.35)'] },
  { key: 'blush', name: 'Blush', t: 'rgba(255,150,180,0.24)' }, { key: 'arctic', name: 'Arctic', t: 'rgba(170,220,255,0.30)' }, { key: 'matcha', name: 'Matcha', t: 'rgba(150,190,90,0.26)' },
  { key: 'velvet', name: 'Velvet Night', g: ['rgba(40,20,80,0.15)', 'rgba(20,10,40,0.55)'] }, { key: 'sunburst', name: 'Sunburst', g: ['rgba(255,210,80,0.40)', 'rgba(255,120,60,0.05)'] },
  { key: 'citrus', name: 'Citrus Pop', t: 'rgba(255,200,40,0.24)' }, { key: 'ocean', name: 'Deep End', g: ['rgba(10,80,160,0.10)', 'rgba(10,40,90,0.50)'] }, { key: 'lilac', name: 'Lilac Fog', t: 'rgba(190,160,255,0.28)' },
  { key: 'ember', name: 'Ember', g: ['rgba(255,60,30,0.05)', 'rgba(255,90,20,0.40)'] }, { key: 'slate', name: 'Slate', t: 'rgba(60,70,90,0.35)' }, { key: 'peach', name: 'Peach Fuzz', t: 'rgba(255,180,140,0.28)' },
  { key: 'volt', name: 'Volt', t: 'rgba(212,255,63,0.18)' }, { key: 'cocoa', name: 'Cocoa', t: 'rgba(90,50,30,0.32)' }, { key: 'aurora', name: 'Aurora', g: ['rgba(80,255,200,0.25)', 'rgba(120,80,255,0.25)'] },
  { key: 'rosegold', name: 'Rose Gold', g: ['rgba(255,190,170,0.30)', 'rgba(200,140,120,0.20)'] }, { key: 'midnight', name: 'Midnight Run', g: ['rgba(0,0,0,0)', 'rgba(5,5,25,0.65)'] },
  { key: 'polaroid', name: 'Snapshot', f: 'polaroid' }, { key: 'film', name: 'Film Strip', f: 'film' }, { key: 'cinema', name: 'Cinema Bars', f: 'cinema' },
  { key: 'grid', name: 'Grid Lines', f: 'grid' }, { key: 'vignette', name: 'Vignette', f: 'vignette' }, { key: 'glitch', name: 'Glitch', f: 'glitch' }, { key: 'heartframe', name: 'Soft Heart', f: 'heart' },
];
export const LENS_KEYS = LENSES.map(l => l.key);
export type LensKey = string;

export function LensOverlay({ lens, city, moji = 118 }: { lens?: string | null; city?: string | null; moji?: number }) {
  const def = LENSES.find(l => l.key === lens);
  if (def?.t) return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: def.t }]} />;
  if (def?.g) return <LinearGradient pointerEvents="none" colors={def.g} style={StyleSheet.absoluteFill} />;
  if (def?.f === 'polaroid') return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderWidth: 10, borderBottomWidth: 34, borderColor: '#FAFAF7' }]} />;
  if (def?.f === 'film') return <View pointerEvents="none" style={StyleSheet.absoluteFill}><View style={[s.filmBar, { top: 0 }]}>{Array.from({ length: 14 }).map((_, i) => <View key={i} style={s.hole} />)}</View><View style={[s.filmBar, { bottom: 0 }]}>{Array.from({ length: 14 }).map((_, i) => <View key={i} style={s.hole} />)}</View></View>;
  if (def?.f === 'cinema') return <View pointerEvents="none" style={StyleSheet.absoluteFill}><View style={[s.bar, { top: 0 }]} /><View style={[s.bar, { bottom: 0 }]} /></View>;
  if (def?.f === 'grid') return <View pointerEvents="none" style={StyleSheet.absoluteFill}>{[33, 66].map(p => <View key={'v' + p} style={{ position: 'absolute', left: `${p}%`, top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,.5)' }} />)}{[33, 66].map(p => <View key={'h' + p} style={{ position: 'absolute', top: `${p}%`, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,.5)' }} />)}</View>;
  if (def?.f === 'vignette') return <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']} locations={[0, 0.25, 0.75, 1]} style={StyleSheet.absoluteFill} />;
  if (def?.f === 'glitch') return <View pointerEvents="none" style={StyleSheet.absoluteFill}>{[18, 42, 61, 83].map((p, i) => <View key={p} style={{ position: 'absolute', top: `${p}%`, left: i % 2 ? '8%' : 0, right: i % 2 ? 0 : '12%', height: 6, backgroundColor: i % 2 ? 'rgba(0,255,230,.35)' : 'rgba(255,0,120,.35)' }} />)}</View>;
  if (def?.f === 'heart') return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}><Svg width="80%" height="80%" viewBox="0 0 24 24"><Path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z" fill="none" stroke="rgba(255,255,255,.75)" strokeWidth={0.6} /></Svg></View>;
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
        <LinearGradient colors={[`hsl(${hue},42%,56%)`, `hsl(${hue + 30},38%,38%)`, '#0A0A0F']} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />)}
      <LensOverlay lens={lens} city={city} />
      {children}
    </View>
  );
}
const s = StyleSheet.create({
  filmBar: { position: 'absolute', left: 0, right: 0, height: 22, backgroundColor: '#0A0A0F', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' }, hole: { width: 10, height: 8, borderRadius: 2, backgroundColor: '#F5F5F7' },
  bar: { position: 'absolute', left: 0, right: 0, height: '11%', backgroundColor: '#000' },
  cityTag: { position: 'absolute', bottom: 14, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 4 },
  cityT: { fontWeight: '900', letterSpacing: 3, color: '#120F24' },
  moodSticker: { position: 'absolute', top: 14, right: 14, transform: [{ rotate: '12deg' }] },
});
