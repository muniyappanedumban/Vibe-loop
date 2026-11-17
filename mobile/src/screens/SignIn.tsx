import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, R, S, T } from '../theme/tokens';
import { Screen, Btn, Field, Card, useToast, Tag, IconBtn } from '../components/UI';
import { Icon } from '../components/Icon';
import { VibeMoji } from '../components/VibeMoji';
import { BubbleMoji } from '../chat/BubbleMojiView';
import { useSession, call, MAX_ACCOUNTS } from '../lib/api';
import { requestOtp, register, verifyOtp, OtpTicket } from '../lib/sync';
import { useStore } from '../store/useStore';
import { useConfig, useLimit, useAccess } from '../lib/config';
import { ApiError } from '../lib/api';

const HANDLE_RE = /^[a-z0-9._]{3,20}$/;
export const handleProblem = (h: string) => {
  const b = h.replace(/^@/, '').toLowerCase();
  if (!b) return 'Choose your @ID';
  if (!HANDLE_RE.test(b)) return '3–20 characters: a–z, 0–9, dot or underscore';
  return null;
};

export default function SignIn({ navigation, route }: any) {
  const sess = useSession(); const adding = !!route?.params?.add;
  const [tab, setTab] = useState<'in' | 'up'>('in'); const [step, setStep] = useState<'id' | 'code'>('id');
  const [ident, setIdent] = useState(''); const [handle, setHandle] = useState(''); const [name, setName] = useState(''); const [email, setEmail] = useState('');
  const [ticket, setTicket] = useState<OtpTicket | null>(null); const [code, setCode] = useState(''); const [busy, setBusy] = useState(false); const [wait, setWait] = useState(0);
  const [url, setUrl] = useState(sess.apiUrl); const [showUrl, setShowUrl] = useState(false); const [ping, setPing] = useState<string | null>(null);
  const codeRef = useRef<any>(null); const { toast, show } = useToast();
  useEffect(() => { if (!wait) return; const t = setTimeout(() => setWait(w => w - 1), 1000); return () => clearTimeout(t); }, [wait]);
  const maxAcc = Math.min(MAX_ACCOUNTS, useLimit('maxAccounts', MAX_ACCOUNTS)); const resendSec = useLimit('otpResendSec', 0); const signupOpen = useAccess()?.signupOpen !== false;
  useEffect(() => { if (!signupOpen && tab === 'up') setTab('in'); }, [signupOpen, tab]);
  const full = !adding ? false : sess.accounts.length >= maxAcc;
  const identifier = tab === 'up' ? '@' + handle.replace(/^@/, '').toLowerCase() : ident.trim();

  const send = async () => {
    sess.setApiUrl(url);
    if (tab === 'up') { const hp = handleProblem(handle); if (hp) return show(hp, 'err'); if (name.trim().length < 2) return show('Add your display name', 'err'); if (!/^\S+@\S+\.\S+$/.test(email)) return show('Add an email for codes & recovery', 'err'); }
    else if (ident.trim().length < 3) return show('Enter your @ID or email', 'err');
    setBusy(true);
    try { const t = tab === 'up' ? await register(handle, name, email) : await requestOtp(ident); setTicket(t); setStep('code'); setCode(''); setWait(Math.max(30, resendSec)); setTimeout(() => codeRef.current?.focus(), 200); }
    catch (e: any) { show(e.message, 'err'); if (e instanceof ApiError && e.status === 429) setWait(Math.max(e.retryAfter ?? 60, resendSec, 1)); } finally { setBusy(false); }
  };
  const verify = async (c = code) => {
    if (c.length !== 6) return;
    setBusy(true);
    try { await verifyOtp(identifier, c); navigation.reset({ index: 0, routes: [{ name: useSession.getState().module === 'chat' ? 'ChatMain' : 'Main' }] }); }
    catch (e: any) { show(e.message, 'err'); setCode(''); } finally { setBusy(false); }
  };
  const test = async () => { sess.setApiUrl(url); setPing('…'); try { const h = await call<any>('GET', '/health'); setPing(h.ok ? 'Connected' : 'Unhealthy'); } catch (e: any) { setPing(e.message); } };

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        {adding ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}><IconBtn name="back" label="Back" onPress={() => navigation.goBack()} /><Text style={T.h3}>Add account ({sess.accounts.length}/{maxAcc})</Text></View> : null}
        <LinearGradient colors={['#1E1E27', '#0B1F24']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          <View style={{ flexDirection: 'row', gap: 4 }}><VibeMoji id={7} size={42} /><BubbleMoji id={17} size={42} /><VibeMoji id={311} size={42} /><BubbleMoji id={88} size={42} /></View>
          <Text style={s.h}>{step === 'code' ? 'Check your code' : tab === 'in' ? 'Sign in with your @ID' : 'Claim your @ID'}</Text>
          <Text style={s.p}>One ID. Every connection. No phone number needed.</Text>
        </LinearGradient>
        {full ? <Card style={{ marginTop: S.lg }}><Text style={T.h3}>{maxAcc} of {maxAcc} accounts used</Text><Text style={T.small}>Remove an account from Me → Accounts before adding another.</Text></Card> : step === 'id' ? (<>
          <View style={{ flexDirection: 'row', gap: 8, marginVertical: S.lg }}>
            {(signupOpen ? (['in', 'up'] as const) : (['in'] as const)).map(m => <Pressable key={m} onPress={() => setTab(m)} style={[s.seg, tab === m && s.segOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === m }}><Text style={{ fontWeight: '800', color: tab === m ? '#fff' : C.ink }}>{m === 'in' ? 'Sign in' : 'Create account'}</Text></Pressable>)}
          </View>
          {tab === 'in' ? (
            <Field label="@ID or email" value={ident} onChangeText={setIdent} autoCapitalize="none" autoCorrect={false} placeholder="@riya.makes" />
          ) : (<>
            <Field label="Your @ID (public username)" value={handle} onChangeText={t => setHandle(t.replace(/\s/g, '').toLowerCase())} autoCapitalize="none" autoCorrect={false} placeholder="@yourname" />
            <Text style={[T.small, { marginTop: -6, marginBottom: 10, color: handle && handleProblem(handle) ? C.danger : C.inkSoft }]}>{handle ? handleProblem(handle) ?? `✓ dendo.one/@${handle.replace(/^@/, '')} looks good` : 'Your @ID is public. Your sign-in stays private.'}</Text>
            <Field label="Display name" value={name} onChangeText={setName} placeholder="Riya Kapoor" />
            <Field label="Email (for codes & recovery — never shown)" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" />
          </>)}
          <Btn title={busy ? 'Sending…' : wait ? `Try again in ${wait}s` : 'Send login code'} icon="send" disabled={busy || wait > 0} onPress={send} />
          <Text style={[T.small, { textAlign: 'center', marginTop: 10 }]}>We never ask for your phone number. Up to {maxAcc} accounts per email.</Text>
        </>) : (<>
          <Text style={[T.body, { marginTop: S.lg }]}>Enter the 6-digit code sent to <Text style={{ fontWeight: '800' }}>{ticket?.to}</Text> for <Text style={{ fontWeight: '800' }}>{identifier}</Text>.</Text>
          {ticket?.demoCode ? (
            <View style={s.demo}><Icon name="flag" size={18} color={C.tangerine} /><View style={{ flex: 1 }}><Text style={{ fontWeight: '800' }}>Demo mode — email isn't connected</Text><Text style={T.small}>Your code is <Text style={{ fontWeight: '900', color: C.ink, letterSpacing: 2 }}>{ticket.demoCode}</Text></Text></View>
              <Btn small kind="ink" title="Use" onPress={() => { setCode(ticket.demoCode!); verify(ticket.demoCode!); }} /></View>) : null}
          <Pressable onPress={() => codeRef.current?.focus()} style={s.boxes} accessibilityLabel="One-time code">
            {Array.from({ length: 6 }).map((_, i) => <View key={i} style={[s.box, code.length === i && s.boxOn]}><Text style={s.boxT}>{code[i] ?? ''}</Text></View>)}
          </Pressable>
          <TextInput ref={codeRef} value={code} onChangeText={t => { const c = t.replace(/\D/g, '').slice(0, 6); setCode(c); if (c.length === 6) verify(c); }} keyboardType="number-pad" maxLength={6} style={s.hidden} accessibilityLabel="Code input" autoComplete="one-time-code" textContentType="oneTimeCode" placeholder="6-digit code" />
          <Btn title={busy ? 'Checking…' : 'Verify & continue'} icon="lock" disabled={busy || code.length !== 6} onPress={() => verify()} style={{ marginTop: S.lg }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
            <Pressable onPress={() => setStep('id')}><Text style={{ color: C.violet, fontWeight: '800' }}>Change @ID</Text></Pressable>
            <Pressable disabled={wait > 0} onPress={send}><Text style={{ color: wait ? C.inkSoft : C.violet, fontWeight: '800' }}>{wait ? `Resend in ${wait}s` : 'Resend code'}</Text></Pressable>
          </View>
          <Text style={[T.small, { marginTop: 10 }]}>Codes expire in 5 minutes and lock after 5 wrong tries.</Text>
        </>)}
        <Pressable onPress={() => setShowUrl(!showUrl)} style={{ marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="globe" size={16} color={C.inkSoft} /><Text style={T.small}>Server: {url}</Text></Pressable>
        {showUrl ? (
          <Card style={{ marginTop: 10 }}>
            <Field label="API server URL" value={url} onChangeText={setUrl} autoCapitalize="none" />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Btn small kind="ghost" title="Test connection" onPress={test} />{ping ? <Tag label={ping.toUpperCase()} color={ping === 'Connected' ? '#12A27C' : C.danger} bg={ping === 'Connected' ? C.mintSoft : C.dangerSoft} /> : null}</View>
          </Card>) : null}
      {!adding && useConfig.getState().cfg.features.demoMode !== false ? <Btn kind="ghost" title="Peek offline with demo data" icon="eye" style={{ marginTop: 20 }} onPress={() => { sess.setMode('demo'); sess.setModule('social'); useStore.getState().finishOnboarding('', ''); navigation.reset({ index: 0, routes: [{ name: 'Main' }] }); }} /> : null}
      </Screen>
      {toast}
    </View>
  );
}
const s = StyleSheet.create({
  hero: { borderRadius: 30, padding: 22, marginTop: 6 }, h: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: -1, marginTop: 14 }, p: { color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginTop: 4 },
  seg: { flex: 1, height: 46, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.line }, segOn: { backgroundColor: C.ink, borderColor: C.ink },
  demo: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 18, backgroundColor: '#FFF4EA', borderWidth: 1, borderColor: '#FFDDBE', marginTop: 14 },
  boxes: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  box: { width: 48, height: 58, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }, boxOn: { borderColor: C.violet },
  boxT: { fontSize: 24, fontWeight: '900', color: C.ink },
  hidden: { position: 'absolute', opacity: 0.01, height: 1, width: 1 },
});
