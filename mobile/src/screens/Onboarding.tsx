import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, R } from '../theme/tokens';
import { Btn, Thumb, Field } from '../components/UI';
import { Vibe } from '../components/Vibe';
import { Icon } from '../components/Icon';
import { useStore } from '../store/useStore';

export default function Onboarding({ navigation }: any) {
  const ins = useSafeAreaInsets();
  const finish = useStore(s => s.finishOnboarding);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <LinearGradient colors={['#3A1B9C', '#120F24']} style={StyleSheet.absoluteFill} />
      <View style={[s.blob, { backgroundColor: C.pink, top: 60, right: -60 }]} />
      <View style={[s.blob, { backgroundColor: C.violet, top: 220, left: -80 }]} />
      <ScrollView contentContainerStyle={{ paddingTop: ins.top + 16, paddingHorizontal: 22, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={s.logo}><Icon name="loops" size={18} color={C.ink} stroke={2.6} /></View>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18, letterSpacing: -0.5 }}>vibeloop</Text>
          <View style={{ flex: 1 }} />
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontWeight: '700' }}>{step + 1}/2</Text>
        </View>
        {step === 0 ? (<>
          <View style={s.collage}>
            <View style={[s.tile, { transform: [{ rotate: '-8deg' }], left: 8, top: 30 }]}><Thumb hue={265} w={118} h={178} label="Cold open A" /></View>
            <View style={[s.tile, { zIndex: 2, left: 112, top: 0 }]}>
              <Thumb hue={330} w={134} h={206} label="Version B">
                <View style={s.scorePill}><Text style={{ fontWeight: '900', color: C.ink }}>84</Text><Text style={{ fontSize: 10, fontWeight: '700', color: C.ink }}>score</Text></View>
              </Thumb>
            </View>
            <View style={[s.tile, { transform: [{ rotate: '8deg' }], left: 228, top: 34 }]}><Thumb hue={170} w={118} h={178} label="Travel guide" /></View>
            <View style={[s.vibe, { left: 0, top: 200 }]}><Vibe kind="share" size={46} /></View>
            <View style={[s.vibe, { left: 120, top: 214 }]}><Vibe kind="forme" size={40} /></View>
            <View style={[s.vibe, { right: 4, top: 6 }]}><Vibe kind="work" size={38} /></View>
          </View>
          <Text style={s.h}>Test it with{'\n'}your people.{'\n'}<Text style={{ color: C.lime }}>Then let it loop.</Text></Text>
          <Text style={s.p}>Share drafts in a private Loop, collect real reactions, and release only what earns its score. No public algorithm. No fake numbers.</Text>
          {[['loops', 'Private Loops of 8–50 real people'], ['graph', 'A Memory Graph that learns what works for you'], ['shield', 'Nothing publishes without your signed approval']].map(([i, t]) => (
            <View key={t} style={s.point}><View style={s.pointIcon}><Icon name={i as any} size={18} color={C.lime} /></View><Text style={{ color: '#fff', fontWeight: '700', flex: 1 }}>{t}</Text></View>
          ))}
          <Btn title="Get started" icon="spark" onPress={() => navigation.navigate('SignIn')} style={{ marginTop: 22 }} />
        </>) : (<>
          <Text style={[s.h, { marginTop: 36, fontSize: 32 }]}>Who's creating?</Text>
          <Text style={s.p}>This is how your Loop members will see you.</Text>
          <View style={{ backgroundColor: '#fff', borderRadius: R.lg, padding: 16, marginTop: 18 }}>
            <Field label="Display name" placeholder="Riya Kapoor" value={name} onChangeText={setName} />
            <Field label="Handle" placeholder="@riya.makes" value={handle} onChangeText={setHandle} autoCapitalize="none" />
            <Text style={{ color: C.inkSoft, fontSize: 12, fontWeight: '600' }}>Sign-in uses email + password with optional TOTP. Third-party passwords are never stored.</Text>
          </View>
          <Btn title="Create my first Loop" icon="loops" style={{ marginTop: 20 }} onPress={() => { finish(name.trim(), handle.trim()); navigation.reset({ index: 1, routes: [{ name: 'Main' }, { name: 'NewLoop', params: { first: true } }] }); }} />
          <Btn title="Skip for now" kind="ghost" style={{ marginTop: 10 }} onPress={() => { finish(name.trim(), handle.trim()); navigation.reset({ index: 0, routes: [{ name: 'Main' }] }); }} />
        </>)}
      </ScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  blob: { position: 'absolute', width: 260, height: 260, borderRadius: 130, opacity: 0.35 },
  logo: { width: 32, height: 32, borderRadius: 11, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center' },
  collage: { height: 270, marginTop: 26, marginBottom: 6 },
  tile: { position: 'absolute', borderRadius: 22, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20 },
  vibe: { position: 'absolute' },
  scorePill: { position: 'absolute', top: 10, right: 10, backgroundColor: C.lime, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, alignItems: 'center' },
  h: { color: '#fff', fontSize: 40, fontWeight: '900', letterSpacing: -1.6, lineHeight: 44 },
  p: { color: 'rgba(255,255,255,0.7)', fontSize: 15, lineHeight: 22, marginTop: 12, fontWeight: '500' },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  pointIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(200,244,90,0.12)', alignItems: 'center', justifyContent: 'center' },
});
