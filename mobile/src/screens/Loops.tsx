import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, R, S, T } from '../theme/tokens';
import { Screen, Header, Card, Btn, Chip, Tag, DemoTag, ScoreRing, Thumb, Avatar, Section, Bar, Field, Toggle, Row, NotReady, useToast, IconBtn } from '../components/UI';
import { Icon } from '../components/Icon';
import { Vibe, VIBE_META, VibeKind } from '../components/Vibe';
import { useStore } from '../store/useStore';
import { loopScore, breakdown, loopHealth, sentiment, counted } from '../lib/score';
import { ago, HOUR } from '../lib/util';
import { online } from '../lib/api';
import { must, replaceLoop } from '../lib/sync';

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  testing: { label: 'TESTING', color: C.violet, bg: C.violetSoft }, locked: { label: 'LOCKED', color: C.inkSoft, bg: '#ECE9F5' },
  released: { label: 'RELEASED', color: '#12A27C', bg: C.mintSoft }, archived: { label: 'ARCHIVED', color: C.tangerine, bg: '#FFEEDF' }, draft: { label: 'DRAFT', color: C.inkSoft, bg: '#ECE9F5' },
};

export function LoopsScreen({ navigation }: any) {
  const loops = useStore(s => s.loops);
  const [f, setF] = useState<'all' | 'testing' | 'released' | 'archived'>('all');
  const list = loops.filter(l => f === 'all' || l.status === f);
  return (
    <Screen>
      <Header title="Your Loops" sub="Private testing groups · real people only" right={<IconBtn name="plus" label="New Loop" onPress={() => navigation.navigate('NewLoop')} />} />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {(['all', 'testing', 'released', 'archived'] as const).map(k => <Chip key={k} label={k[0].toUpperCase() + k.slice(1)} active={f === k} onPress={() => setF(k)} />)}
      </View>
      <View style={{ marginTop: S.lg, gap: 12 }}>
        {list.map(l => {
          const sc = loopScore(l); const b = breakdown(l); const m = STATUS[l.status];
          return (
            <Card key={l.id} onPress={() => navigation.navigate(l.status === 'archived' ? 'Archive' : 'LoopDetail', { id: l.id })} style={{ flexDirection: 'row', gap: 14, padding: 12 }}>
              <Thumb hue={l.drafts[0].hue} w={86} h={118} radius={18} />
              <View style={{ flex: 1, paddingVertical: 4 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}><Tag label={m.label} color={m.color} bg={m.bg} />{l.demo ? <DemoTag /> : null}</View>
                <Text style={[T.h3, { marginTop: 8 }]} numberOfLines={2}>{l.title}</Text>
                <Text style={[T.small, { marginTop: 4 }]}>{l.template} · {l.members.length}/{l.sizeLimit} members · {l.drafts.length > 1 ? 'A/B' : 'single'}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <View style={{ flex: 1 }}><Bar pct={(b.total / Math.max(1, l.members.length * l.drafts.length)) * 100} /></View>
                  <Text style={{ fontWeight: '800', fontSize: 12 }}>{b.total} reactions</Text>
                </View>
              </View>
              <ScoreRing score={sc} size={62} stroke={7} label="" />
            </Card>
          );
        })}
        {!list.length ? <Text style={[T.small, { textAlign: 'center', marginTop: 30 }]}>No Loops here yet.</Text> : null}
      </View>
    </Screen>
  );
}

const TEMPLATES = ['Comedy short', 'Educational', 'Series episode', 'Lifestyle', 'Podcast clip', 'Festival special'];
export function NewLoop({ navigation, route }: any) {
  const create = useStore(s => s.createLoop);
  const [title, setTitle] = useState('');
  const [tpl, setTpl] = useState(TEMPLATES[0]);
  const [size, setSize] = useState(20);
  const [min, setMin] = useState(70);
  const [hook, setHook] = useState('');
  const [paid, setPaid] = useState(false);
  const { toast, show } = useToast();
  const go = () => {
    if (title.trim().length < 3) return show('Give your Loop a title (3+ characters)', 'err');
    const id = create({ title: title.trim(), template: tpl, sizeLimit: size, minScore: min, paidOnly: paid, draft: { version: 'A', title: title.trim(), hook: hook.trim() || title.trim(), caption: '', hue: Math.floor(Math.random() * 360), durationSec: 30, synthetic: false } });
    navigation.replace('LoopDetail', { id });
  };
  const Stepper = ({ v, set, lo, hi, step }: any) => (
    <View style={s.stepper}>
      <Pressable onPress={() => set(Math.max(lo, v - step))} style={s.stepBtn} accessibilityLabel="Decrease"><Text style={s.stepTxt}>–</Text></Pressable>
      <Text style={{ fontWeight: '900', fontSize: 22, minWidth: 44, textAlign: 'center' }}>{v}</Text>
      <Pressable onPress={() => set(Math.min(hi, v + step))} style={s.stepBtn} accessibilityLabel="Increase"><Text style={s.stepTxt}>+</Text></Pressable>
    </View>
  );
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Header title={route?.params?.first ? 'Your first Loop' : 'New Loop'} sub="Small, private, honest feedback" />
        <LinearGradient colors={['#EEE8FF', '#FFE6F2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.tip}>
          <Vibe kind="share" size={36} />
          <Text style={{ flex: 1, fontWeight: '600', color: C.ink, lineHeight: 19 }}>Members react with <Text style={{ fontWeight: '900' }}>Vibes</Text>. Only the first 24 hours count toward the Loop Score.</Text>
        </LinearGradient>
        <Field label="Loop title" placeholder="e.g. Chai-break comedy · Ep 5" value={title} onChangeText={setTitle} />
        <Field label="Opening hook (Version A)" placeholder="The first line viewers hear" value={hook} onChangeText={setHook} />
        <Text style={[T.tiny, { marginBottom: 8 }]}>TEMPLATE</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{TEMPLATES.map(t => <Chip key={t} label={t} active={tpl === t} onPress={() => setTpl(t)} />)}</View>
        <View style={{ flexDirection: 'row', gap: 12, marginTop: S.xl }}>
          <Card style={{ flex: 1, alignItems: 'center' }}><Text style={T.tiny}>LOOP SIZE (8–50)</Text><Stepper v={size} set={setSize} lo={8} hi={50} step={2} /></Card>
          <Card style={{ flex: 1, alignItems: 'center' }}><Text style={T.tiny}>MIN SCORE</Text><Stepper v={min} set={setMin} lo={40} hi={95} step={5} /></Card>
        </View>
        <Card style={{ marginTop: 12 }}>
          <Row icon="cash" title="Paid-only Loop" sub="Members pay to join. Platform fee shown before checkout." tint={C.pink} right={<Toggle value={paid} onChange={setPaid} label="Paid-only Loop" />} />
        </Card>
        <Btn title="Open Loop" icon="loops" onPress={go} style={{ marginTop: S.xl }} />
      </Screen>
      {toast}
    </View>
  );
}

export function LoopDetail({ navigation, route }: any) {
  const id = route?.params?.id ?? 'l1';
  const st = useStore();
  const l = st.loops.find(x => x.id === id);
  const [ver, setVer] = useState<'A' | 'B' | undefined>(undefined);
  const [note, setNote] = useState('');
  const { toast, show } = useToast();
  if (!l) return <Screen><Header title="Loop not found" /></Screen>;
  const sc = loopScore(l, ver); const b = breakdown(l, ver); const h = loopHealth(l); const sen = sentiment(l);
  const left = Math.max(0, l.openedAt + l.windowHours * HOUR - Date.now());
  const recent = [...l.reactions].filter(r => !ver || r.version === ver).sort((a, b) => b.at - a.at);
  const memberName = (mid: string) => l.members.find(m => m.id === mid)?.name ?? 'Member';
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Header title={l.title} sub={`${l.template} · ${l.members.length}/${l.sizeLimit} members`} right={<IconBtn name="link" label="Invite link" onPress={() => { const c = st.makeInvite(l.id); show(`One-time invite ${c} · expires in 24h`); }} />} />
        <LinearGradient colors={['#2A1D63', '#120F24']} style={s.dark}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <ScoreRing score={sc} dark size={124} target={l.minScore} />
            <View style={{ flex: 1, gap: 8 }}>
              {(['share', 'forme', 'work', 'skip'] as VibeKind[]).map(k => (
                <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Vibe kind={k} size={22} />
                  <View style={{ flex: 1 }}><Bar pct={b.total ? (b[k] / b.total) * 100 : 0} color={VIBE_META[k].color === '#6B6785' ? '#B9B5CC' : VIBE_META[k].color} bg="rgba(255,255,255,0.1)" h={6} /></View>
                  <Text style={{ color: '#fff', fontWeight: '800', width: 18, textAlign: 'right' }}>{b[k]}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            <View style={s.pill}><Icon name="clock" size={14} color={C.lime} /><Text style={s.pillT}>{left ? `${Math.ceil(left / HOUR)}h left in window` : 'Window closed'}</Text></View>
            <View style={s.pill}><Icon name="star" size={14} color={C.lime} /><Text style={s.pillT}>Health {h ?? '—'}</Text></View>
          </View>
        </LinearGradient>

        {l.drafts.length > 1 ? (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: S.lg }}>
            {l.drafts.map(d => {
              const v = loopScore(l, d.version); const on = ver === d.version;
              return (
                <Pressable key={d.version} onPress={() => setVer(on ? undefined : d.version)} style={{ flex: 1 }}>
                  <Thumb hue={d.hue} w="100%" h={150} label={`${d.version} · ${d.title}`}>
                    <View style={[s.vScore, on && { backgroundColor: C.lime }]}><Text style={{ fontWeight: '900', color: C.ink }}>{v ?? '—'}</Text></View>
                    {on ? <View style={s.sel} /> : null}
                  </Thumb>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Btn kind="ghost" icon="layers" title="Add Version B for side-by-side test" style={{ marginTop: S.lg }} onPress={() => { st.addVersionB(l.id, { ...l.drafts[0], title: l.drafts[0].title + ' (alt)', hue: (l.drafts[0].hue + 70) % 360 }); show('Version B added'); }} />
        )}

        <Section title="Feedback summary">
          <Card>
            <Text style={T.small}>On-device keyword summary of {counted(l).length} counted reactions</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <View style={[s.sent, { backgroundColor: C.mintSoft }]}><Text style={{ fontWeight: '900', fontSize: 20, color: '#12A27C' }}>{sen.pos}</Text><Text style={T.small}>positive cues</Text><Text style={{ fontWeight: '700', marginTop: 4 }}>{sen.posTop.join(', ') || '—'}</Text></View>
              <View style={[s.sent, { backgroundColor: C.dangerSoft }]}><Text style={{ fontWeight: '900', fontSize: 20, color: C.danger }}>{sen.neg}</Text><Text style={T.small}>concerns</Text><Text style={{ fontWeight: '700', marginTop: 4 }}>{sen.negTop.join(', ') || '—'}</Text></View>
            </View>
          </Card>
        </Section>

        <Section title="Live reactions" action="React as fan" onAction={() => navigation.navigate('FanReact', { id: l.id })}>
          {recent.slice(0, 6).map(r => {
            const m = l.members.find(x => x.id === r.memberId);
            return (
              <View key={r.id} style={s.react}>
                <Avatar name={r.anonymous ? '?' : memberName(r.memberId)} hue={m?.hue ?? 0} size={38} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800' }}>{r.anonymous ? 'Anonymous' : memberName(r.memberId)} <Text style={T.small}>· v{r.version} · {ago(r.at)}</Text></Text>
                  <Text style={{ color: C.ink, marginTop: 2 }}>{r.text || '—'}</Text>
                </View>
                <Vibe kind={r.kind} size={30} />
              </View>
            );
          })}
          {!recent.length ? <Text style={T.small}>No reactions yet. Share your invite link.</Text> : null}
        </Section>

        <Section title="Learning notes">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Field placeholder="Pin a note to this Loop" value={note} onChangeText={setNote} /></View>
            <Btn title="Pin" small kind="ink" style={{ marginTop: 6 }} onPress={() => { if (note.trim()) { st.addNote(l.id, note.trim()); setNote(''); } }} />
          </View>
          {l.notes.map((n, i) => <Row key={i} icon="bulb" title={n} tint={C.tangerine} />)}
        </Section>

        <Card style={{ marginTop: S.lg }}>
          <Row icon="eye" title="Silent mode" sub="Pause reaction notifications while testing" right={<Toggle value={l.silent} onChange={() => st.toggleLoopFlag(l.id, 'silent')} label="Silent mode" />} />
          <Row icon="copy" title="Clone Loop" sub="Reuse settings for a new experiment" onPress={() => { const nid = st.cloneLoop(l.id); navigation.replace('LoopDetail', { id: nid }); }} />
        </Card>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: S.xl }}>
          <Btn title="Archive" kind="ghost" icon="archive" style={{ flex: 1 }} onPress={() => { st.setLoopStatus(l.id, 'archived', `Score ${sc ?? 'n/a'} < ${l.minScore}. ${sen.negTop.length ? 'Concerns: ' + sen.negTop.join(', ') : ''}`); navigation.navigate('Archive'); }} />
          <Btn title="Release gate" icon="shield" style={{ flex: 1.3 }} onPress={() => navigation.navigate('ReleaseGate', { id: l.id })} />
        </View>
      </Screen>
      {toast}
    </View>
  );
}

export function FanReact({ navigation, route }: any) {
  const id = route?.params?.id ?? 'l1';
  const st = useStore(); const l = st.loops.find(x => x.id === id);
  const [ver, setVer] = useState<'A' | 'B'>('A');
  const [kind, setKind] = useState<VibeKind | null>(null);
  const [text, setText] = useState('');
  const [anon, setAnon] = useState(false);
  const [as, setAs] = useState(10);
  const { toast, show } = useToast();
  if (!l) return null;
  const d = l.drafts.find(x => x.version === ver) ?? l.drafts[0];
  const memberPool = st.loops.flatMap(x => x.members);
  const submit = async () => {
    if (!kind) return show('Pick a Vibe first', 'err');
    let m = l.members[as % l.members.length];
    // try each member until one hasn't reacted to this version (testing as several fans on one device)
    for (let i = 0; i < l.members.length; i++) { const c = l.members[(as + i) % l.members.length]; if (!l.reactions.some(r => r.memberId === c.id && r.version === ver)) { m = c; break; } }
    if (online()) { try { replaceLoop(await must('POST', `/loops/${l.id}/reactions`, { memberId: m.id, version: ver, kind, text, anonymous: anon })); } catch (e: any) { return show(e.message, 'err'); } }
    else { const r = st.react(l.id, { memberId: m.id, version: ver, kind, text, anonymous: anon }); if (!r.ok) return show(r.reason!, 'err'); }
    setAs(as + 1); setKind(null); setText(''); show(`Reaction sent as ${anon ? 'Anonymous' : m.name}`);
  };
  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <Screen style={{ backgroundColor: C.ink }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <IconBtn name="back" dark label="Back" onPress={() => navigation.goBack()} />
          <View style={{ flex: 1 }}><Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }} numberOfLines={1}>{l.title}</Text><Text style={{ color: 'rgba(255,255,255,0.55)', fontWeight: '600', fontSize: 12 }}>Private draft · fan view</Text></View>
        </View>
        <Thumb hue={d.hue} w="100%" h={380} radius={30}>
          <View style={{ position: 'absolute', left: 16, right: 16, bottom: 18 }}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 22, letterSpacing: -0.5 }}>{d.hook}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.75)', marginTop: 6, fontWeight: '600' }}>{d.caption || d.title} · {d.durationSec}s</Text>
          </View>
          <View style={s.playBtn}><Icon name="play" color="#fff" size={26} /></View>
          {l.drafts.length > 1 ? (
            <View style={s.abSwitch}>{l.drafts.map(x => <Pressable key={x.version} onPress={() => setVer(x.version)} style={[s.abBtn, ver === x.version && { backgroundColor: C.lime }]}><Text style={{ fontWeight: '900', color: ver === x.version ? C.ink : '#fff' }}>{x.version}</Text></Pressable>)}</View>
          ) : null}
        </Thumb>
        <Text style={{ color: '#fff', fontWeight: '800', marginTop: 18, marginBottom: 10 }}>How does this land?</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['share', 'forme', 'work', 'skip'] as VibeKind[]).map(k => (
            <Pressable key={k} onPress={() => setKind(k)} accessibilityLabel={VIBE_META[k].label} style={[s.vibeBtn, kind === k && { borderColor: C.lime, backgroundColor: 'rgba(200,244,90,0.12)' }]}>
              <Vibe kind={k} size={40} /><Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center' }}>{VIBE_META[k].label}</Text>
            </Pressable>
          ))}
        </View>
        <Field placeholder="Tell the creator why (helps quality score)" value={text} onChangeText={setText} multiline style={{ marginTop: 14, backgroundColor: '#1E1938', borderColor: '#2E2752', color: '#fff' } as any} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Toggle value={anon} onChange={setAnon} label="Anonymous" /><Text style={{ color: '#fff', fontWeight: '700' }}>Send anonymously</Text>
        </View>
        <Btn title="Send reaction" icon="send" kind="lime" onPress={submit} />
        <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 10, textAlign: 'center' }}>Testing mode: you're recording reactions on behalf of Loop members (server-verified when signed in). Low-effort replies (1–2 characters) do not count toward the score.</Text>
      </Screen>
      {toast}
    </View>
  );
}

export function Archive({ navigation }: any) {
  const st = useStore();
  const arch = st.loops.filter(l => l.status === 'archived');
  return (
    <Screen>
      <Header title="Learning Archive" sub="Every experiment that didn't make it — and why" />
      <LinearGradient colors={['#FFF0E3', '#FFE6F2']} style={s.tip}><Icon name="bulb" color={C.tangerine} /><Text style={{ flex: 1, fontWeight: '600' }}>Failed experiments stay here permanently. Learnings survive even if you delete the media.</Text></LinearGradient>
      {arch.map(l => (
        <Card key={l.id} style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Thumb hue={l.drafts[0].hue} w={70} h={96} radius={14} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}><Tag label={`SCORE ${loopScore(l) ?? '—'}`} color={C.danger} bg={C.dangerSoft} />{l.demo ? <DemoTag /> : null}</View>
              <Text style={[T.h3, { marginTop: 6 }]}>{l.title}</Text>
              <Text style={[T.small, { marginTop: 4, lineHeight: 17 }]}>{l.failReason ?? 'No reason recorded'}</Text>
            </View>
          </View>
          {l.notes.map((n, i) => <Row key={i} icon="flag" title={n} tint={C.danger} />)}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Btn small kind="ghost" title="Never suggest again" icon="close" onPress={() => st.neverAgain(l.title)} style={{ flex: 1 }} />
            <Btn small kind="ink" title="Retry as clone" icon="copy" onPress={() => { const id = st.cloneLoop(l.id); navigation.navigate('LoopDetail', { id }); }} style={{ flex: 1 }} />
          </View>
        </Card>
      ))}
      {!arch.length ? <Text style={T.small}>Nothing archived yet.</Text> : null}
      <Section title="Never-again list">
        {st.neverIdeas.map(i => <Row key={i} icon="close" title={i} tint={C.danger} />)}
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  tip: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: R.md, marginBottom: S.lg },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.violetSoft, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { fontSize: 20, fontWeight: '900', color: C.violet },
  dark: { borderRadius: 30, padding: 18 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  pillT: { color: '#fff', fontWeight: '700', fontSize: 12 },
  vScore: { position: 'absolute', top: 10, right: 10, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 },
  sel: { ...StyleSheet.absoluteFill as object, borderWidth: 3, borderColor: C.lime, borderRadius: R.md },
  sent: { flex: 1, borderRadius: 18, padding: 12 },
  react: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: 20, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.line },
  playBtn: { position: 'absolute', top: '42%', alignSelf: 'center', width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  abSwitch: { position: 'absolute', top: 14, right: 14, flexDirection: 'row', backgroundColor: 'rgba(18,15,36,0.55)', borderRadius: 999, padding: 4, gap: 4 },
  abBtn: { width: 34, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  vibeBtn: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: 20, borderWidth: 1.5, borderColor: '#2E2752', backgroundColor: '#1A1533' },
});
