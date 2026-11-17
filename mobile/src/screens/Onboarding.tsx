// First-run: a branded loading screen, then 3 swipeable intro slides (Glow · Hush · A product of Dendo) → Sign in.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Animated, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../theme/tokens';
import { Btn, Thumb } from '../components/UI';
import { Vibe } from '../components/Vibe';
import { Icon } from '../components/Icon';

function Logo({ size = 32 }: { size?: number }) {
  return <View style={[s.logo, { width: size, height: size, borderRadius: size * 0.34 }]}><Icon name="loops" size={size * 0.56} color={C.ink} stroke={2.6} /></View>;
}

/** Branded loading screen: logo + name + spinner. */
export function Splash() {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }).start(); }, []);
  return (
    <View style={{ flex: 1, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
      <LinearGradient colors={['#24242E', '#120F24']} style={StyleSheet.absoluteFill} />
      <Animated.View style={{ alignItems: 'center', opacity: fade, transform: [{ scale: fade.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }}>
        <Logo size={84} />
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 38, letterSpacing: -1.4, marginTop: 18 }}>vibeloop</Text>
        <Text style={{ color: 'rgba(255,255,255,0.6)', fontWeight: '700', marginTop: 6 }}>Glow · Hush</Text>
        <ActivityIndicator color={C.lime} size="large" style={{ marginTop: 34 }} accessibilityLabel="Loading" />
      </Animated.View>
      <Text style={{ position: 'absolute', bottom: 48, color: 'rgba(255,255,255,0.5)', fontWeight: '700', fontSize: 12 }}>A product of Dendo</Text>
    </View>
  );
}

const SLIDES = [
  { key: 'glow', tag: 'GLOW', title: 'Share your world.', accent: 'Let it glow.', body: 'Drops, Blinks and Flicks with 36 lenses, auto-edit and music — for your circle or the whole city.',
    points: [['image', 'Photos & 1-minute videos'], ['spark', 'Lenses, captions & auto edit'], ['users', 'Follow creators, collab & vouch']] },
  { key: 'hush', tag: 'HUSH', title: 'Talk freely.', accent: 'Keep it hush.', body: 'Chats, voice notes, calls, Moods and Hoods — one @ID, no phone number needed.',
    points: [['chat', 'Live chat with blue ticks & typing'], ['mic', 'Voice & face calls, voice notes'], ['shield', '1:1 end-to-end encryption']] },
  { key: 'dendo', tag: 'DENDO', title: 'One app.', accent: 'Two vibes.', body: 'Switch between Glow and Hush with one tap. Built with care in India.',
    points: [['loops', 'Up to 5 accounts, one switch'], ['globe', 'Your language, your region'], ['star', 'A product of Dendo']] },
] as const;

function Art({ k }: { k: string }) {
  if (k === 'glow') return (
    <View style={s.collage}>
      <View style={[s.tile, { transform: [{ rotate: '-8deg' }], left: 8, top: 30 }]}><Thumb hue={265} w={112} h={170} label="Golden hour" /></View>
      <View style={[s.tile, { zIndex: 2, left: 104, top: 0 }]}><Thumb hue={330} w={128} h={196} label="New Drop" /></View>
      <View style={[s.tile, { transform: [{ rotate: '8deg' }], left: 214, top: 34 }]}><Thumb hue={40} w={112} h={170} label="Chai run" /></View>
      <View style={[s.vibe, { left: 0, top: 196 }]}><Vibe kind="share" size={46} /></View>
      <View style={[s.vibe, { right: 6, top: 4 }]}><Vibe kind="work" size={38} /></View>
    </View>);
  if (k === 'hush') return (
    <View style={[s.collage, { justifyContent: 'center', gap: 10, paddingHorizontal: 6 }]}>
      <View style={[s.bub, { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.12)' }]}><Text style={s.bubT}>Saturday 8am? ☕</Text></View>
      <View style={[s.bub, { alignSelf: 'flex-end', backgroundColor: '#12A27C' }]}><Text style={s.bubT}>In. Bringing the camera</Text><Text style={{ color: '#9BE7FF', fontSize: 11, fontWeight: '900', alignSelf: 'flex-end' }}>✓✓</Text></View>
      <View style={[s.bub, { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.12)', flexDirection: 'row', alignItems: 'center', gap: 8 }]}><Icon name="mic" size={16} color="#fff" /><View style={{ width: 120, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.4)' }} /><Text style={s.bubT}>0:12</Text></View>
      <Text style={{ color: 'rgba(255,255,255,0.55)', fontWeight: '700', marginLeft: 4 }}>typing…</Text>
    </View>);
  return (
    <View style={[s.collage, { alignItems: 'center', justifyContent: 'center' }]}>
      <Logo size={96} />
      <Text style={{ color: '#fff', fontWeight: '900', fontSize: 30, letterSpacing: -1, marginTop: 16 }}>vibeloop</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontWeight: '700' }}>A product of</Text><Text style={{ color: C.lime, fontWeight: '900', letterSpacing: 1 }}>DENDO</Text>
      </View>
    </View>);
}

export default function Onboarding({ navigation }: any) {
  const ins = useSafeAreaInsets(); const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(true); const [i, setI] = useState(0); const ref = useRef<any>(null);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 1600); return () => clearTimeout(t); }, []);
  if (loading) return <Splash />;
  const go = (n: number) => { ref.current?.scrollTo({ x: n * width, animated: true }); setI(n); };
  const last = i === SLIDES.length - 1;
  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <LinearGradient colors={['#24242E', '#120F24']} style={StyleSheet.absoluteFill} />
      <View style={[s.blob, { backgroundColor: i === 1 ? '#12A27C' : C.pink, top: 60, right: -60 }]} />
      <View style={[s.blob, { backgroundColor: C.violet, top: 240, left: -80 }]} />
      <View style={{ paddingTop: ins.top + 16, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Logo /><Text style={{ color: '#fff', fontWeight: '900', fontSize: 18, letterSpacing: -0.5 }}>vibeloop</Text>
        <View style={{ flex: 1 }} />
        {!last ? <Pressable onPress={() => navigation.navigate('SignIn')} accessibilityRole="button"><Text style={{ color: 'rgba(255,255,255,0.7)', fontWeight: '800' }}>Skip</Text></Pressable> : null}
      </View>
      <ScrollView ref={ref} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={e => setI(Math.round(e.nativeEvent.contentOffset.x / width))} style={{ flex: 1 }}>
        {SLIDES.map(sl => (
          <ScrollView key={sl.key} style={{ width }} contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 20 }}>
            <Art k={sl.key} />
            <Text style={s.tag}>{sl.tag}</Text>
            <Text style={s.h}>{sl.title}{'\n'}<Text style={{ color: sl.key === 'hush' ? '#5EE2B8' : C.lime }}>{sl.accent}</Text></Text>
            <Text style={s.p}>{sl.body}</Text>
            {sl.points.map(([ic, t]) => (
              <View key={t} style={s.point}><View style={s.pointIcon}><Icon name={ic as any} size={18} color={C.lime} /></View><Text style={{ color: '#fff', fontWeight: '700', flex: 1 }}>{t}</Text></View>))}
          </ScrollView>))}
      </ScrollView>
      <View style={{ paddingHorizontal: 22, paddingBottom: ins.bottom + 20 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
          {SLIDES.map((sl, n) => <Pressable key={sl.key} onPress={() => go(n)} accessibilityLabel={`Slide ${n + 1}`}><View style={[s.dot, n === i && s.dotOn]} /></Pressable>)}
        </View>
        <Btn title={last ? 'Get started' : 'Next'} icon={last ? 'spark' : undefined} onPress={() => (last ? navigation.navigate('SignIn') : go(i + 1))} />
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  blob: { position: 'absolute', width: 260, height: 260, borderRadius: 130, opacity: 0.3 },
  logo: { backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center' },
  collage: { height: 260, marginTop: 22, marginBottom: 8 },
  tile: { position: 'absolute', borderRadius: 22, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20 },
  vibe: { position: 'absolute' },
  bub: { maxWidth: 260, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubT: { color: '#fff', fontWeight: '700' },
  tag: { color: 'rgba(255,255,255,0.55)', fontWeight: '900', letterSpacing: 2, fontSize: 12, marginBottom: 6 },
  h: { color: '#fff', fontSize: 38, fontWeight: '900', letterSpacing: -1.5, lineHeight: 42 },
  p: { color: 'rgba(255,255,255,0.7)', fontSize: 15, lineHeight: 22, marginTop: 10, fontWeight: '500' },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  pointIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(200,244,90,0.12)', alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotOn: { width: 26, backgroundColor: C.lime },
});
