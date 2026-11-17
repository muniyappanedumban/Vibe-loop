// Login safety screens: Security center, Two-factor (authenticator + recovery codes), Devices, Account activity.
// All data comes from the server (/me/2fa, /me/sessions, /me/security-events); admin switches live in app-config.security.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Linking, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { C, S, T } from '../theme/tokens';
import { Screen, Header, Card, Row, Section, Btn, Field, useToast, Tag } from '../components/UI';
import { call } from '../lib/api';
import { signOut } from '../lib/sync';
import { useConfig } from '../lib/config';
import { ago } from '../lib/util';

type Sec = { twoFactor?: boolean; newDeviceAlerts?: boolean; sessionList?: boolean };
const useSec = (): Sec => useConfig(s => (s.cfg as any).security) ?? { twoFactor: true, newDeviceAlerts: true, sessionList: true };

/** Load once on focus; returns [data, error, reload]. */
function useLoad<X>(path: string): [X | null, string | null, () => void] {
  const [d, setD] = useState<X | null>(null); const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => { setErr(null); call<X>('GET', path).then(setD).catch(e => setErr(e.message)); }, [path]);
  useFocusEffect(load);
  return [d, err, load];
}
const Loading = ({ err, retry }: { err: string | null; retry: () => void }) => err
  ? <Card><Text style={T.body}>{err}</Text><Btn small kind="ghost" title="Try again" onPress={retry} style={{ marginTop: 10 }} /></Card>
  : <ActivityIndicator style={{ marginTop: 30 }} color={C.violet} />;

export function SecurityCenter({ navigation }: any) {
  const sec = useSec(); const [mfa] = useLoad<{ enabled: boolean; recoveryCodesLeft: number; available: boolean }>('/me/2fa');
  return (
    <Screen>
      <Header title="Login & security" sub="Keep your @ID yours" />
      <Card>
        {sec.twoFactor !== false || mfa?.enabled ? <Row icon="lock" title="Two-factor sign-in" sub={mfa ? (mfa.enabled ? `On · ${mfa.recoveryCodesLeft} recovery codes left` : 'Off · add an authenticator app') : '…'}
          right={mfa ? <Tag label={mfa.enabled ? 'ON' : 'OFF'} color={mfa.enabled ? '#12A27C' : C.inkSoft} bg={mfa.enabled ? C.mintSoft : C.line} /> : undefined} onPress={() => navigation.navigate('TwoFactor')} /> : null}
        {sec.sessionList !== false ? <Row icon="layers" title="Your devices" sub="See where you're signed in and sign devices out" onPress={() => navigation.navigate('Devices')} /> : null}
        <Row icon="clock" title="Account activity" sub="Sign-ins, new devices and security changes" onPress={() => navigation.navigate('AccountActivity')} />
      </Card>
      {sec.newDeviceAlerts !== false ? <Text style={[T.small, { marginTop: S.md }]}>You'll get a notification whenever your account signs in on a new device.</Text> : null}
    </Screen>
  );
}

export function TwoFactor({ navigation }: any) {
  const { toast, show } = useToast();
  const [st, err, reload] = useLoad<{ enabled: boolean; recoveryCodesLeft: number; available: boolean }>('/me/2fa');
  const [setup, setSetup] = useState<{ secret: string; otpauth: string } | null>(null);
  const [code, setCode] = useState(''); const [codes, setCodes] = useState<string[] | null>(null); const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e: any) { show(e.message, 'err'); } finally { setBusy(false); } };
  const start = () => run(async () => { setSetup(await call('POST', '/me/2fa/setup')); setCode(''); });
  const enable = () => run(async () => { const r = await call<any>('POST', '/me/2fa/enable', { code: code.trim() }); setCodes(r.recoveryCodes); setSetup(null); setCode(''); reload(); show('Two-factor is on'); });
  const disable = () => run(async () => { await call('POST', '/me/2fa/disable', { code: code.trim() }); setCode(''); setCodes(null); reload(); show('Two-factor is off'); });
  const newCodes = () => run(async () => { const r = await call<any>('POST', '/me/2fa/recovery-codes', { code: code.trim() }); setCodes(r.recoveryCodes); setCode(''); reload(); });
  const copy = async (t: string, what: string) => { await Clipboard.setStringAsync(t); show(`${what} copied`); };

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Header title="Two-factor sign-in" sub="A code from your authenticator app, every new sign-in" />
        {!st ? <Loading err={err} retry={reload} /> : codes ? (
          <Card>
            <Text style={T.h3}>Save your recovery codes</Text>
            <Text style={[T.small, { marginVertical: 8 }]}>Each code works once if you lose your phone. Keep them somewhere safe — we only show them now.</Text>
            {codes.map(c => <Text key={c} selectable style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: '800', color: C.ink, paddingVertical: 3 }}>{c}</Text>)}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Btn small kind="ghost" icon="copy" title="Copy all" onPress={() => copy(codes.join('\n'), 'Recovery codes')} style={{ flex: 1 }} />
              <Btn small kind="ink" title="I saved them" onPress={() => setCodes(null)} style={{ flex: 1 }} />
            </View>
          </Card>
        ) : st.enabled ? (<>
          <Card><Row icon="check" tint="#12A27C" title="Two-factor is on" sub={`${st.recoveryCodesLeft} of 10 recovery codes left`} /></Card>
          <Section title="Change it">
            <Card>
              <Field label="Current authenticator or recovery code" value={code} onChangeText={setCode} autoCapitalize="none" placeholder="123456" />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Btn small kind="ghost" title="New recovery codes" disabled={busy || code.length < 6} onPress={newCodes} style={{ flex: 1 }} />
                <Btn small kind="danger" title="Turn off" disabled={busy || code.length < 6} onPress={disable} style={{ flex: 1 }} />
              </View>
            </Card>
          </Section>
        </>) : !st.available ? (
          <Card><Text style={T.body}>Two-factor sign-in isn't available right now.</Text></Card>
        ) : !setup ? (
          <Card>
            <Text style={T.h3}>Protect your @ID</Text>
            <Text style={[T.small, { marginVertical: 8 }]}>After your email code, you'll also enter a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy…).</Text>
            <Btn title={busy ? 'Starting…' : 'Set up two-factor'} icon="lock" disabled={busy} onPress={start} />
          </Card>
        ) : (
          <Card>
            <Text style={T.h3}>1 · Add VibeLoop to your authenticator</Text>
            <Btn small kind="ghost" title="Open authenticator app" onPress={() => Linking.openURL(setup.otpauth).catch(() => show('No authenticator app found — copy the key instead', 'err'))} style={{ marginTop: 8 }} />
            <Text style={[T.small, { marginTop: 10 }]}>Or enter this key by hand:</Text>
            <Text selectable style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: '800', color: C.ink, marginVertical: 6 }}>{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</Text>
            <Btn small kind="ghost" icon="copy" title="Copy key" onPress={() => copy(setup.secret, 'Key')} />
            <Text style={[T.h3, { marginTop: S.lg }]}>2 · Enter the 6-digit code it shows</Text>
            <Field value={code} onChangeText={t => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="123456" />
            <Btn title={busy ? 'Checking…' : 'Turn on'} icon="check" disabled={busy || code.length !== 6} onPress={enable} />
          </Card>
        )}
      </Screen>
      {toast}
    </View>
  );
}

type Ses = { id: string; device: string; ip: string; createdAt: number; lastSeen: number; current: boolean };
export function Devices({ navigation }: any) {
  const { toast, show } = useToast(); const [d, err, reload] = useLoad<{ items: Ses[] }>('/me/sessions'); const [busy, setBusy] = useState(false);
  const out = async (s: Ses) => {
    setBusy(true);
    try { await call('DELETE', `/me/sessions/${s.id}`); if (s.current) { await signOut(); navigation.reset({ index: 0, routes: [{ name: 'SignIn' }] }); return; } show(`Signed out ${s.device}`); reload(); }
    catch (e: any) { show(e.message, 'err'); } finally { setBusy(false); }
  };
  const others = async () => { setBusy(true); try { const r = await call<any>('POST', '/me/sessions/revoke-others'); show(`Signed out ${r.revoked} other device(s)`); reload(); } catch (e: any) { show(e.message, 'err'); } finally { setBusy(false); } };
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Header title="Your devices" sub="Where your @ID is signed in" />
        {!d ? <Loading err={err} retry={reload} /> : (<>
          <Card>
            {d.items.map(s => <Row key={s.id} icon={s.current ? 'check' : 'layers'} tint={s.current ? '#12A27C' : C.violet} title={s.device} sub={`${s.current ? 'This device · ' : ''}active ${ago(s.lastSeen)} · signed in ${ago(s.createdAt)}${s.ip ? ' · ' + s.ip : ''}`}
              right={<Btn small kind={s.current ? 'ghost' : 'danger'} title="Sign out" disabled={busy} onPress={() => out(s)} />} />)}
            {!d.items.length ? <Text style={T.small}>No active devices.</Text> : null}
          </Card>
          {d.items.filter(s => !s.current).length ? <Btn kind="danger" title="Sign out all other devices" disabled={busy} onPress={others} style={{ marginTop: S.md }} /> : null}
          <Text style={[T.small, { marginTop: S.md }]}>Don't recognise a device? Sign it out, then turn on two-factor sign-in.</Text>
        </>)}
      </Screen>
      {toast}
    </View>
  );
}

const EV: Record<string, { label: string; icon: any; tint: string }> = {
  sign_in: { label: 'Signed in', icon: 'user', tint: C.violet }, new_device: { label: 'New device', icon: 'flag', tint: C.tangerine },
  mfa_failed: { label: 'Wrong two-factor code', icon: 'flag', tint: C.danger }, recovery_code_used: { label: 'Recovery code used', icon: 'lock', tint: C.tangerine },
  '2fa_on': { label: 'Two-factor turned on', icon: 'lock', tint: '#12A27C' }, '2fa_off': { label: 'Two-factor turned off', icon: 'lock', tint: C.danger },
  '2fa_reset_by_staff': { label: 'Two-factor reset by support', icon: 'lock', tint: C.danger }, recovery_codes_new: { label: 'New recovery codes', icon: 'lock', tint: C.violet },
  session_revoked: { label: 'Device signed out', icon: 'layers', tint: C.inkSoft }, sessions_revoked: { label: 'Devices signed out', icon: 'layers', tint: C.inkSoft },
};
export function AccountActivity() {
  const [d, err, reload] = useLoad<{ items: { id: number; at: number; kind: string; detail: string; ip: string }[] }>('/me/security-events');
  return (
    <Screen>
      <Header title="Account activity" sub="Last 50 security events" />
      {!d ? <Loading err={err} retry={reload} /> : (
        <Card>
          {d.items.map(e => { const k = EV[e.kind] ?? { label: e.kind, icon: 'clock', tint: C.inkSoft }; return <Row key={e.id} icon={k.icon} tint={k.tint} title={k.label} sub={[e.detail, e.ip, ago(e.at)].filter(Boolean).join(' · ')} />; })}
          {!d.items.length ? <Text style={T.small}>Nothing yet.</Text> : null}
        </Card>)}
    </Screen>
  );
}
