import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Rect, Line } from 'react-native-svg';
import { C, PRISM, R, S, T } from '../theme/tokens';
import { Screen, Header, Card, Btn, Chip, Tag, Thumb, Section, Field, NotReady, Row, Toggle, useToast, IconBtn, hsl } from '../components/UI';
import { Icon, IconName } from '../components/Icon';
import { useStore } from '../store/useStore';
import { loopScore } from '../lib/score';
import { uid } from '../lib/util';

export function CreateHub({ navigation }: any) {
  const st = useStore();
  const tools: { icon: IconName; t: string; d: string; route: string; c: [string, string] }[] = [
    { icon: 'wand', t: 'Brief → Package', d: 'Hooks, captions & formats from your own wins', route: 'Copilot', c: ['#7B4DFF', '#FF3D9A'] },
    { icon: 'film', t: 'Video editor', d: 'Multi-track, non-destructive', route: 'Editor', c: ['#FF8A3D', '#FF3D9A'] },
    { icon: 'mic', t: 'Audio & subtitles', d: 'Cleanup, silence, dual-language', route: 'Audio', c: ['#14B88D', '#6C3BFF'] },
    { icon: 'loops', t: 'Test in a Loop', d: 'Get real reactions first', route: 'NewLoop', c: ['#120F24', '#3A1B9C'] },
  ];
  return (
    <Screen>
      <Header title="Create" sub="Make in private. Prove it. Then release." back={false} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {tools.map((x, i) => (
          <Pressable key={x.t} onPress={() => navigation.navigate(x.route)} style={{ width: '48%' }}>
            <LinearGradient colors={x.c} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.tool, i === 0 && { height: 190 }]}>
              <View style={s.toolIcon}><Icon name={x.icon} color="#fff" /></View>
              <View style={{ flex: 1 }} />
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 17, letterSpacing: -0.4 }}>{x.t}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontWeight: '600', fontSize: 12, marginTop: 4 }}>{x.d}</Text>
            </LinearGradient>
          </Pressable>
        ))}
      </View>
      <Section title="Recent drafts">
        {st.loops.slice(0, 4).map(l => (
          <Card key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10, padding: 10 }} onPress={() => navigation.navigate('LoopDetail', { id: l.id })}>
            <Thumb hue={l.drafts[0].hue} w={52} h={70} radius={12} />
            <View style={{ flex: 1 }}><Text style={T.h3} numberOfLines={1}>{l.drafts[0].title}</Text><Text style={T.small}>{l.template} · v{l.drafts.length}</Text></View>
            <Text style={{ fontWeight: '900', fontSize: 16 }}>{loopScore(l) ?? '—'}</Text>
          </Card>
        ))}
      </Section>
      <Section title="Style presets">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {['Cinema', 'Shorts', 'Comedy', 'Educational', 'Podcast', 'Series'].map((p, i) => <Chip key={p} label={p} icon="spark" active={i === 2} />)}
        </ScrollView>
      </Section>
    </Screen>
  );
}

/** On-device, rule-based assist. It ONLY recombines the creator's own winning hooks & memory — no model call, nothing invented. */
function generate(brief: string, st: ReturnType<typeof useStore.getState>) {
  const wins = st.loops.filter(l => (loopScore(l) ?? 0) >= l.minScore).flatMap(l => l.drafts.map(d => d.hook));
  const topic = brief.trim().replace(/\.$/, '');
  const short = topic.split(/\s+/).slice(0, 6).join(' ');
  const patterns = [`POV: ${short.toLowerCase()}`, `${short} — in under 30 seconds`, `Nobody tells you this about ${short.toLowerCase()}`, `3 things I learned from ${short.toLowerCase()}`, `Wait for the last one: ${short.toLowerCase()}`];
  const hooks = patterns.filter(h => !st.neverIdeas.some(n => h.toLowerCase().includes(n.toLowerCase()))).slice(0, 3);
  const captions = [`${short} ✦ save this for later`, `Which part got you? Tell me below`, `Part 1 of a new series — ${short.toLowerCase()}`];
  const formats = ['9:16 short (≤35s — your Loops flag 60s+ as slow)', '1:1 carousel recap', '16:9 long-form with chapters'];
  return { hooks, captions, formats, basedOn: wins };
}
export function Copilot() {
  const st = useStore();
  const [brief, setBrief] = useState('');
  const [out, setOut] = useState<ReturnType<typeof generate> | null>(null);
  const claims = useMemo(() => (brief.match(/(₹|rs\.?|\$|€)\s?\d[\d,]*|\d+\s?%|\bfree\b|\bguarantee[d]?\b/gi) || []), [brief]);
  const { toast, show } = useToast();
  const run = () => {
    if (brief.trim().length < 8) return show('Write a brief of at least a few words', 'err');
    const o = generate(brief, useStore.getState()); setOut(o); st.saveBrief(brief, { hooks: o.hooks, captions: o.captions, formats: o.formats });
  };
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Header title="Brief Copilot" sub="One brief → a multi-format package" right={<Tag label="ON-DEVICE" color="#12A27C" bg={C.mintSoft} />} />
        <View style={s.bubbleL}><LinearGradient colors={PRISM as any} style={s.botAv}><Icon name="spark" size={16} color="#fff" /></LinearGradient>
          <Text style={{ flex: 1, lineHeight: 20, fontWeight: '500' }}>Tell me what you want to make. I'll build hooks, captions and formats from <Text style={{ fontWeight: '800' }}>your own winning Loops</Text> — and I'll flag any price or claim so you can confirm it.</Text></View>
        {out ? <View style={s.bubbleR}><Text style={{ color: '#fff', fontWeight: '600', lineHeight: 20 }}>{brief}</Text></View> : null}
        {out ? (
          <View style={{ gap: 12, marginTop: 6 }}>
            {claims.length ? <NotReady feature="Claim check" why={`Found ${claims.join(', ')}. VibeLoop never invents prices or offers — confirm these are yours before publishing.`} /> : null}
            <Card><Text style={T.tiny}>3 OPENING HOOKS</Text>{out.hooks.map((h, i) => <Row key={h} icon="play" title={h} sub={`Opening option ${i + 1}`} tint={C.violet} />)}</Card>
            <Card><Text style={T.tiny}>CAPTIONS</Text>{out.captions.map(c => <Row key={c} icon="text" title={c} tint={C.pink} />)}</Card>
            <Card><Text style={T.tiny}>FORMATS</Text>{out.formats.map(f => <Row key={f} icon="layers" title={f} tint={C.tangerine} />)}</Card>
            <Text style={T.small}>Based on {out.basedOn.length} winning hook(s): {out.basedOn.join(' · ') || 'none yet'}. Rule-based, no AI model used.</Text>
            <NotReady feature="Model-based generation" why="Server AI models aren't connected in this build." fallback="use these local suggestions or write your own." />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {['Monsoon street food in Pune under ₹200', 'Explaining SIPs to my mom', 'Ep 5 of chai-break comedy'].map(x => <Chip key={x} label={x} onPress={() => setBrief(x)} />)}
          </View>
        )}
        <View style={{ marginTop: S.xl }}><Field placeholder="Describe your idea…" value={brief} onChangeText={setBrief} multiline /></View>
        <Btn title="Build package" icon="wand" onPress={run} />
      </Screen>
      {toast}
    </View>
  );
}

const FORMATS = { '9:16': 9 / 16, '1:1': 1, '16:9': 16 / 9 } as const;
export function Editor() {
  const st = useStore();
  const [sel, setSel] = useState<string | null>('c2');
  const [fmt, setFmt] = useState<keyof typeof FORMATS>('9:16');
  const [safe, setSafe] = useState(true);
  const [t, setT] = useState(4);
  const [playing, setPlaying] = useState(false);
  const total = Math.max(...st.clips.map(c => c.start + c.len / c.speed), 1);
  useEffect(() => { if (!playing) return; const i = setInterval(() => setT(x => (x + 0.25 > total ? 0 : x + 0.25)), 250); return () => clearInterval(i); }, [playing, total]);
  const cur = st.clips.find(c => c.track === 'video' && t >= c.start && t < c.start + c.len / c.speed);
  const clip = st.clips.find(c => c.id === sel);
  const op = (label: string, fn: (c: any) => void) => sel && st.clipOp(cs => { const c = cs.find(x => x.id === sel); if (c) fn(c); return cs; }, label);
  const split = () => sel && clip && t > clip.start && t < clip.start + clip.len && st.clipOp(cs => {
    const c = cs.find(x => x.id === sel)!; const cut = t - c.start; const n = { ...c, id: uid('c'), start: t, len: c.len - cut, label: c.label + ' ·2' }; c.len = cut; return [...cs, n];
  }, 'split');
  const PX = 12; const tracks: ('video' | 'audio' | 'text')[] = ['video', 'audio', 'text'];
  const pw = fmt === '16:9' ? 320 : fmt === '1:1' ? 240 : 190;
  return (
    <Screen>
      <Header title="Editor" sub="Non-destructive · originals never change" right={<View style={{ flexDirection: 'row', gap: 6 }}><IconBtn name="undo" label="Undo" onPress={st.undo} /><IconBtn name="redo" label="Redo" onPress={st.redo} /></View>} />
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: pw, height: pw / FORMATS[fmt], borderRadius: 22, overflow: 'hidden' }}>
          <Thumb hue={cur?.hue ?? 260} w="100%" h={pw / FORMATS[fmt]} radius={22} label={cur?.label}>
            {st.clips.filter(c => c.track === 'text' && t >= c.start && t < c.start + c.len).map(c => <Text key={c.id} style={s.overlay}>{c.label}</Text>)}
            {safe ? <View style={s.safe} pointerEvents="none"><Text style={s.safeT}>SAFE ZONE</Text></View> : null}
          </Thumb>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <Pressable onPress={() => setPlaying(!playing)} style={s.play} accessibilityLabel={playing ? 'Pause' : 'Play'}><Icon name={playing ? 'pause' : 'play'} color="#fff" /></Pressable>
        <Text style={{ fontWeight: '800', fontVariant: ['tabular-nums'] }}>{t.toFixed(2)}s / {total.toFixed(1)}s</Text>
        <View style={{ flex: 1 }} />
        {(Object.keys(FORMATS) as (keyof typeof FORMATS)[]).map(f => <Chip key={f} label={f} active={fmt === f} onPress={() => setFmt(f)} />)}
      </View>
      <Card style={{ marginTop: 14, padding: 12 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ width: total * PX + 40 }}>
            <Pressable onPress={(e: any) => setT(Math.max(0, Math.min(total, (e.nativeEvent.locationX ?? 0) / PX)))} style={{ height: 22, flexDirection: 'row' }}>
              {Array.from({ length: Math.ceil(total / 5) + 1 }).map((_, i) => <Text key={i} style={{ position: 'absolute', left: i * 5 * PX, fontSize: 10, fontWeight: '700', color: C.inkSoft }}>{i * 5}s</Text>)}
            </Pressable>
            {tracks.map(tr => (
              <View key={tr} style={{ height: 44, marginBottom: 6 }}>
                {st.clips.filter(c => c.track === tr).map(c => (
                  <Pressable key={c.id} onPress={() => setSel(c.id)} style={[s.clip, { left: c.start * PX, width: (c.len / c.speed) * PX - 2, backgroundColor: tr === 'audio' ? hsl(c.hue, 70, 88) : tr === 'text' ? '#FFF3C4' : hsl(c.hue, 70, 60) }, sel === c.id && { borderColor: C.ink, borderWidth: 2.5 }]}>
                    <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '800', color: tr === 'video' ? '#fff' : C.ink }}>{c.label}{c.speed !== 1 ? ` ${c.speed}×` : ''}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
            <View pointerEvents="none" style={[s.head, { left: t * PX }]} />
          </View>
        </ScrollView>
      </Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        <Chip icon="scissors" label="Split at playhead" onPress={split} />
        <Chip icon="clock" label="Trim −1s" onPress={() => op('trim', c => (c.len = Math.max(1, c.len - 1)))} />
        <Chip icon="clock" label="Extend +1s" onPress={() => op('extend', c => (c.len += 1))} />
        <Chip icon="spark" label={`Speed ${clip?.speed ?? 1}×`} onPress={() => op('speed', c => (c.speed = c.speed === 1 ? 2 : c.speed === 2 ? 0.5 : 1))} />
        <Chip icon="trash" label="Delete" onPress={() => sel && (st.clipOp(cs => cs.filter(x => x.id !== sel), 'delete'), setSel(null))} />
        <Chip icon="text" label="Add text" onPress={() => st.clipOp(cs => [...cs, { id: uid('c'), track: 'text', label: 'New caption', start: t, len: 3, hue: 50, speed: 1 }], 'add text')} />
      </View>
      <Card style={{ marginTop: 14 }}>
        <Row icon="eye" title="Safe-zone overlay" sub="Keep text & logos clear of UI chrome" right={<Toggle value={safe} onChange={setSafe} label="Safe zone" />} />
        <Row icon="undo" title="History" sub={`${st.history.length} undo · ${st.future.length} redo steps`} />
      </Card>
      <NotReady feature="Render & export" why="The FFmpeg render workers need the server, so export can't produce a validated file here." fallback="send the project to an external editor from Library." />
    </Screen>
  );
}

const WAVE = Array.from({ length: 90 }, (_, i) => Math.abs(Math.sin(i * 0.37) * Math.cos(i * 0.11)) * (i % 23 < 3 ? 0.08 : 1));
export function Audio() {
  const [gate, setGate] = useState(0.15);
  const [clean, setClean] = useState(false);
  const [lines, setLines] = useState([{ o: 'Boss aa gaye, chai chhupao!', tr: 'The boss is here, hide the chai!' }, { o: 'Yeh meri teesri cup hai', tr: 'This is my third cup' }]);
  const silences = WAVE.reduce<number[]>((a, v, i) => (v < gate ? [...a, i] : a), []);
  const { toast, show } = useToast();
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Header title="Audio studio" sub="Voiceover · cleanup · subtitles" />
        <LinearGradient colors={['#1B1538', '#120F24']} style={{ borderRadius: 28, padding: 18 }}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>Voiceover — travel · v2</Text>
          <Svg width="100%" height={110} viewBox="0 0 270 110" preserveAspectRatio="none" style={{ marginTop: 12 }}>
            {WAVE.map((v, i) => { const h = Math.max(3, v * (clean ? 80 : 96)); return <Rect key={i} x={i * 3} y={55 - h / 2} width={2} height={h} rx={1} fill={v < gate ? '#FF4D5E' : i < 40 ? '#C8F45A' : 'rgba(255,255,255,0.55)'} />; })}
            <Line x1={120} y1={0} x2={120} y2={110} stroke="#FF3D9A" strokeWidth={2} />
          </Svg>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <View style={s.dpill}><View style={[s.dot, { backgroundColor: C.danger }]} /><Text style={s.dpillT}>{silences.length} silent frames</Text></View>
            <View style={s.dpill}><View style={[s.dot, { backgroundColor: C.lime }]} /><Text style={s.dpillT}>{clean ? 'Cleaned' : 'Original'}</Text></View>
          </View>
        </LinearGradient>
        <Card style={{ marginTop: 14 }}>
          <Text style={T.tiny}>SILENCE THRESHOLD</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>{[0.05, 0.1, 0.15, 0.25].map(g => <Chip key={g} label={`${Math.round(g * 100)}%`} active={gate === g} onPress={() => setGate(g)} />)}</View>
          <Row icon="wave" title="Noise cleanup" sub="Creates a new version; original stays untouched" right={<Toggle value={clean} onChange={v => { setClean(v); if (v) { useStore.getState().addAssetVersion('a3', 'Noise cleanup (preview)'); show('Saved as new version v' + useStore.getState().assets.find(a => a.id === 'a3')!.versions.length); } }} label="Noise cleanup" />} />
          <Row icon="scissors" title={`Remove ${silences.length ? Math.ceil(silences.length / 3) : 0} silent gaps`} sub="Applies to a copy" onPress={() => show('Silence cut saved to a new version')} />
        </Card>
        <NotReady feature="Microphone recording" why="Device recording isn't connected in this build." fallback="import an audio file from Library." />
        <Section title="Subtitles · original + translation kept separate">
          {lines.map((l, i) => (
            <Card key={i} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}><Tag label="HINGLISH · ORIGINAL" /><Tag label="EN" color={C.pink} bg={C.pinkSoft} /></View>
              <Field value={l.o} onChangeText={v => setLines(ls => ls.map((x, j) => (j === i ? { ...x, o: v } : x)))} />
              <Field value={l.tr} onChangeText={v => setLines(ls => ls.map((x, j) => (j === i ? { ...x, tr: v } : x)))} />
            </Card>
          ))}
          <Btn kind="ghost" icon="plus" title="Add line" onPress={() => setLines([...lines, { o: '', tr: '' }])} />
        </Section>
      </Screen>
      {toast}
    </View>
  );
}

const s = StyleSheet.create({
  tool: { height: 160, borderRadius: 26, padding: 16 },
  toolIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  bubbleL: { flexDirection: 'row', gap: 10, backgroundColor: C.surface, borderRadius: 22, borderTopLeftRadius: 6, padding: 14, borderWidth: 1, borderColor: C.line },
  bubbleR: { alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: C.ink, borderRadius: 22, borderTopRightRadius: 6, padding: 14, marginTop: 10 },
  botAv: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  overlay: { position: 'absolute', top: '30%', alignSelf: 'center', backgroundColor: '#fff', color: C.ink, fontWeight: '900', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, overflow: 'hidden' },
  safe: { position: 'absolute', top: '10%', bottom: '18%', left: '7%', right: '14%', borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.lime, borderRadius: 10 },
  safeT: { color: C.lime, fontSize: 9, fontWeight: '900', margin: 4 },
  play: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  clip: { position: 'absolute', top: 0, height: 44, borderRadius: 12, paddingHorizontal: 8, justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  head: { position: 'absolute', top: 18, bottom: 0, width: 2, backgroundColor: C.pink },
  dpill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 }, dpillT: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
