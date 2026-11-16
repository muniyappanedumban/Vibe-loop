// Creator-studio money screens (Go-Live Gate, Bag Check, Cashout) — restored; shown only when admin keeps their screens ON.
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Rect } from 'react-native-svg';
import { C, PRISM, R, S, T } from '../theme/tokens';
import { Screen, Header, Card, Btn, Chip, Tag, DemoTag, ScoreRing, Thumb, Avatar, Section, Row, Field, Toggle, NotReady, useToast, IconBtn } from '../components/UI';
import { Icon } from '../components/Icon';
import { useStore, balanceOf, PLATFORM_FEE } from '../store/useStore';
import { loopScore } from '../lib/score';
import { useSocial, compact } from '../store/useSocial';
import { VibeMoji } from '../components/VibeMoji';
import { ago, money, DAY } from '../lib/util';
import { online } from '../lib/api';
import { switchModule } from '../components/ModuleSwitch';
import { useMoney } from './Money2';
import { publishOnline, payoutOnline } from '../lib/sync';

/** Hold-to-sign: the explicit human approval step that mints a one-time token. */
function SignButton({ title, onSigned, disabled }: { title: string; onSigned: () => void; disabled?: boolean }) {
  const [holding, setHolding] = useState(false);
  return (
    <Pressable disabled={disabled} delayLongPress={900} onPressIn={() => setHolding(true)} onPressOut={() => setHolding(false)} onLongPress={() => { setHolding(false); onSigned(); }} accessibilityRole="button" accessibilityLabel={title} style={{ opacity: disabled ? 0.4 : 1 }}>
      <LinearGradient colors={holding ? ['#C8F45A', '#C8F45A'] : (PRISM as any)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.sign}>
        <Icon name="fingerprint" color={holding ? C.ink : '#fff'} size={22} />
        <Text style={{ color: holding ? C.ink : '#fff', fontWeight: '900', fontSize: 15 }}>{holding ? 'Keep holding…' : title}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export function ReleaseGate({ navigation, route }: any) {
  const st = useStore();
  const l = st.loops.find(x => x.id === (route?.params?.id ?? 'l1'));
  const [vis, setVis] = useState<'public' | 'unlisted' | 'supporters'>(st.settings.defaultVisibility);
  const [checks, setChecks] = useState({ rights: false, music: false, consent: false, synthetic: false });
  const { toast, show } = useToast();
  if (!l) return null;
  const sc = loopScore(l); const passes = sc !== null && sc >= l.minScore;
  const synth = l.drafts.some(d => d.synthetic);
  const allChecked = checks.rights && checks.music && checks.consent && (!synth || checks.synthetic);
  const sign = async () => {
    if (online()) { try { const p = await publishOnline(l.id, vis, checks); show(`Released · server token ${p.tokenId.slice(0, 12)}… consumed`); } catch (e: any) { show(e.message, 'err'); } return; }
    const tok = st.issueToken('publish', `publish:${l.id}:${vis}`);
    const r = st.publish(l.id, vis, tok.id);
    r.ok ? show(`Released · token ${tok.id.slice(0, 12)}… consumed`) : show(r.reason!, 'err');
  };
  const items: [keyof typeof checks, string][] = [['rights', 'I own or have rights to all footage'], ['music', 'Music & sounds are licensed'], ['consent', 'Everyone shown has consented'], ['synthetic', 'AI-generated parts are labelled']];
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Header title="Go-Live Gate" sub="Public only after it earns it" />
        <Card dark style={{ flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: C.ink }}>
          <ScoreRing score={sc} dark size={104} target={l.minScore} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }} numberOfLines={2}>{l.title}</Text>
            <View style={{ marginTop: 8 }}>{passes ? <Tag label={`PASSES ${l.minScore}`} color={C.ink} bg={C.lime} /> : <Tag label={`NEEDS ${l.minScore}`} color="#fff" bg={C.danger} />}</View>
            <Text style={{ color: 'rgba(255,255,255,0.6)', marginTop: 8, fontSize: 12, fontWeight: '600' }}>{l.status === 'released' ? 'Already released' : 'Score from real reactions only'}</Text>
          </View>
        </Card>
        <Section title="Visibility">
          <View style={{ flexDirection: 'row', gap: 8 }}>{(['public', 'unlisted', 'supporters'] as const).map(v => <Chip key={v} icon={v === 'public' ? 'globe' : v === 'unlisted' ? 'link' : 'star'} label={v[0].toUpperCase() + v.slice(1)} active={vis === v} onPress={() => setVis(v)} />)}</View>
        </Section>
        <Section title="Rights checklist">
          <Card>{items.filter(([k]) => k !== 'synthetic' || synth || true).map(([k, t]) => (
            <Row key={k} icon={checks[k] ? 'check' : 'shield'} tint={checks[k] ? '#12A27C' : C.inkSoft} title={t} sub={k === 'synthetic' && !synth ? 'No synthetic media detected in this draft' : undefined} right={<Toggle value={checks[k]} onChange={v => setChecks({ ...checks, [k]: v })} label={t} />} />
          ))}</Card>
        </Section>
        <View style={{ marginTop: S.xl }}>
          {l.status === 'released' ? (<>
            <Btn kind="ghost" icon="archive" title="Archive from public · keep private" onPress={() => { st.withdraw(l.id); show('Withdrawn from public. Private version kept.'); }} />
          </>) : (
            <SignButton title={passes ? (allChecked ? 'Hold to sign & release' : 'Complete the checklist') : 'Score too low to release'} disabled={!passes || !allChecked} onSigned={sign} />
          )}
          <Text style={[T.small, { textAlign: 'center', marginTop: 10 }]}>Signing mints a one-time approval token bound to you, this Loop and this visibility. It expires in 5 minutes.</Text>
        </View>
        <Section title="Publish history">
          {st.published.map(p => { const L = st.loops.find(x => x.id === p.loopId); return <Row key={p.tokenId} icon="send" title={`${L?.title ?? p.loopId} · ${p.visibility}`} sub={`Approved by ${p.approver} · ${ago(p.at)}`} />; })}
        </Section>
        <NotReady feature="External platform posting" why="OAuth connections to other platforms aren't set up yet." fallback="always-available manual export from the Library." />
      </Screen>
      {toast}
    </View>
  );
}

export function Earnings({ navigation }: any) {
  const st = useStore();
  const gross = st.txns.reduce((a, t) => a + t.gross, 0), fees = st.txns.reduce((a, t) => a + t.fee, 0);
  const days = Array.from({ length: 7 }, (_, i) => st.txns.filter(t => Math.floor((Date.now() - t.at) / DAY) === 6 - i).reduce((a, t) => a + t.gross, 0));
  const mx = Math.max(...days, 1);
  const by = st.txns.reduce<Record<string, number>>((a, t) => ((a[t.kind] = (a[t.kind] || 0) + t.gross - t.fee), a), {});
  return (
    <Screen>
      <Header title="Bag Check" sub="Transparent — every fee shown" right={<DemoTag />} />
      <LinearGradient colors={PRISM as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.bal}>
        <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '700' }}>Available balance</Text>
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 40, letterSpacing: -1.5 }}>{money(balanceOf(st))}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '600', marginTop: 4 }}>Gross {money(gross)} · platform fee {money(fees)} ({Math.round(PLATFORM_FEE * 100)}%)</Text>
        <Svg width="100%" height={70} viewBox="0 0 280 70" style={{ marginTop: 12 }}>
          {days.map((d, i) => <Rect key={i} x={i * 40 + 6} y={66 - (d / mx) * 60} width={26} height={Math.max(4, (d / mx) * 60)} rx={8} fill={i === 6 ? '#C8F45A' : 'rgba(255,255,255,0.35)'} />)}
        </Svg>
        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700' }}>Last 7 days · actual transactions only (no estimates)</Text>
      </LinearGradient>
      <Btn title="Request payout" icon="cash" kind="ink" style={{ marginTop: S.lg }} onPress={() => navigation.navigate('Payout')} />
      <Section title="By stream">
        <Card>{Object.entries(by).map(([k, v]) => <Row key={k} icon={k === 'tip' ? 'star' : k === 'product' ? 'download' : k === 'ticket' ? 'calendar' : k === 'membership' ? 'user' : 'loops'} title={k.replace('_', ' ').replace(/^./, c => c.toUpperCase())} right={<Text style={{ fontWeight: '900' }}>{money(v)}</Text>} />)}</Card>
      </Section>
      <Section title="Transactions">
        {st.txns.map(t => <Row key={t.id} icon="cash" tint="#12A27C" title={`${t.from} · ${t.kind.replace('_', ' ')}`} sub={`${ago(t.at)} · fee ${money(t.fee)}`} right={<Text style={{ fontWeight: '900', color: '#12A27C' }}>+{money(t.gross - t.fee)}</Text>} />)}
      </Section>
      <Section title="Payout requests">
        {st.payouts.length ? st.payouts.map(p => <Row key={p.id} icon="send" title={money(p.amount)} sub={`${p.status.replace('_', ' ')} · ${ago(p.at)}`} />) : <Text style={T.small}>No payouts yet.</Text>}
      </Section>
    </Screen>
  );
}

export function Payout({ navigation }: any) {
  const st = useStore(); const bal = balanceOf(st);
  const [amt, setAmt] = useState(String(Math.max(0, Math.floor(bal))));
  const { toast, show } = useToast();
  const n = Number(amt) || 0;
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Header title="Cashout" sub="Requires your signed approval" />
        <Card style={{ alignItems: 'center', paddingVertical: 26 }}>
          <Text style={T.small}>Amount</Text>
          <Text style={{ fontSize: 48, fontWeight: '900', letterSpacing: -2, color: C.ink }}>{money(n)}</Text>
          <Text style={T.small}>Available {money(bal)} · minimum {money(st.settings.minPayout)}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>{[500, 1000].map(v => <Chip key={v} label={money(v)} onPress={() => setAmt(String(v))} />)}<Chip label="Max" onPress={() => setAmt(String(Math.floor(bal)))} /></View>
        </Card>
        <View style={{ marginTop: S.lg }}><Field label="Custom amount" keyboardType="numeric" value={amt} onChangeText={setAmt} /></View>
        <Card>
          <Row icon="cash" title="Payout method" sub="Bank account ending 4021" />
          <Row icon="shield" title="Review" sub="Admins approve payouts before release" />
        </Card>
        <View style={{ marginTop: S.xl }}>
          <SignButton title="Hold to sign request" disabled={n <= 0} onSigned={async () => {
            if (online()) { try { await payoutOnline(n); show('Payout requested · pending admin review'); setTimeout(() => navigation.navigate('Earnings'), 900); } catch (e: any) { show(e.message, 'err'); } return; }
            const tok = st.issueToken('payout', `payout:${n}`); const r = st.requestPayout(n, tok.id);
            if (r.ok) { show('Payout requested · pending admin review'); setTimeout(() => navigation.navigate('Earnings'), 900); } else show(r.reason!, 'err');
          }} />
        </View>
        <NotReady feature="Bank transfer" why="The payment rail isn't connected, so approved payouts won't move money yet." />
      </Screen>
      {toast}
    </View>
  );
}

const s = StyleSheet.create({
  sign: { height: 60, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  prof: { borderRadius: 32, padding: 18, overflow: 'hidden' },
  glow: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: C.pink, opacity: 0.22, left: -80, bottom: -120 },
  cover: { height: 170, paddingTop: 50, paddingHorizontal: 20 },
  mood: { position: 'absolute', right: -6, bottom: -4, backgroundColor: C.bg, borderRadius: 20, padding: 2 },
  hl: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: C.line, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  gridT: { height: 150, borderRadius: 14, padding: 10, justifyContent: 'center' },
  go: { width: 52, height: 52, borderRadius: 18, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center' },
  bal: { borderRadius: 30, padding: 20 },
});
