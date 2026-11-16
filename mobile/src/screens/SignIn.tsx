import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, R, S, T } from '../theme/tokens';
import { Screen, Btn, Field, Card, useToast, Tag } from '../components/UI';
import { Icon } from '../components/Icon';
import { VibeMoji } from '../components/VibeMoji';
import { useSession, call } from '../lib/api';
import { signIn, signUp } from '../lib/sync';
import { useStore } from '../store/useStore';

export default function SignIn({ navigation }: any) {
  const sess = useSession();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState(sess.email ?? ''); const [pw, setPw] = useState(''); const [name, setName] = useState(''); const [handle, setHandle] = useState('');
  const [url, setUrl] = useState(sess.apiUrl); const [busy, setBusy] = useState(false); const [ping, setPing] = useState<string | null>(null); const [showUrl, setShowUrl] = useState(false);
  const { toast, show } = useToast();
  const go = async () => {
    if (!email.includes('@') || pw.length < 1) return show('Enter your email and password', 'err');
    setBusy(true); sess.setApiUrl(url);
    try { mode === 'in' ? await signIn(email.trim(), pw) : await signUp(email.trim(), pw, name.trim() || email.split('@')[0], handle.trim() || email.split('@')[0]); navigation.reset({ index: 0, routes: [{ name: 'Main' }] }); }
    catch (e: any) { show(e.message, 'err'); } finally { setBusy(false); }
  };
  const test = async () => { sess.setApiUrl(url); setPing('…'); try { const h = await call<any>('GET', '/health'); setPing(h.ok ? 'Connected' : 'Unhealthy'); } catch (e: any) { setPing(e.message); } };
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <LinearGradient colors={['#2A1D63', '#120F24']} style={s.hero}>
          <View style={{ flexDirection: 'row', gap: -8 }}>{[7, 118, 311].map(id => <VibeMoji key={id} id={id} size={46} />)}</View>
          <Text style={s.h}>{mode === 'in' ? 'Welcome back' : 'Create your account'}</Text>
          <Text style={s.p}>Your World. Your People. Your Moments.</Text>
        </LinearGradient>
        <View style={{ flexDirection: 'row', gap: 8, marginVertical: S.lg }}>
          {(['in', 'up'] as const).map(m => <Pressable key={m} onPress={() => setMode(m)} style={[s.seg, mode === m && s.segOn]}><Text style={{ fontWeight: '800', color: mode === m ? '#fff' : C.ink }}>{m === 'in' ? 'Sign in' : 'Sign up'}</Text></Pressable>)}
        </View>
        {mode === 'up' ? (<><Field label="Display name" value={name} onChangeText={setName} placeholder="Riya Kapoor" /><Field label="Handle" value={handle} onChangeText={setHandle} autoCapitalize="none" placeholder="@riya.makes" /></>) : null}
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" />
        <Field label="Password" value={pw} onChangeText={setPw} secureTextEntry placeholder={mode === 'up' ? '8+ chars, upper & lower case, a number' : '••••••••'} />
        <Btn title={busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'} icon="lock" disabled={busy} onPress={go} />
        <Pressable onPress={() => setShowUrl(!showUrl)} style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="globe" size={16} color={C.inkSoft} /><Text style={T.small}>Server: {url}</Text></Pressable>
        {showUrl ? (
          <Card style={{ marginTop: 10 }}>
            <Field label="API server URL" value={url} onChangeText={setUrl} autoCapitalize="none" />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Btn small kind="ghost" title="Test connection" onPress={test} />{ping ? <Tag label={ping.toUpperCase()} color={ping === 'Connected' ? '#12A27C' : C.danger} bg={ping === 'Connected' ? C.mintSoft : C.dangerSoft} /> : null}</View>
          </Card>) : null}
        <Btn kind="ghost" title="Explore offline with demo data" icon="eye" style={{ marginTop: 20 }} onPress={() => { sess.setMode('demo'); useStore.getState().finishOnboarding('', ''); navigation.reset({ index: 0, routes: [{ name: 'Main' }] }); }} />
        <Text style={[T.small, { textAlign: 'center', marginTop: 8 }]}>Offline demo keeps everything on this device and is clearly labelled.</Text>
      </Screen>
      {toast}
    </View>
  );
}
const s = StyleSheet.create({
  hero: { borderRadius: 30, padding: 22, marginTop: 6 }, h: { color: '#fff', fontSize: 30, fontWeight: '900', letterSpacing: -1, marginTop: 14 }, p: { color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginTop: 4 },
  seg: { flex: 1, height: 46, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.line }, segOn: { backgroundColor: C.ink, borderColor: C.ink },
});
