import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Line, Text as SText, Path } from 'react-native-svg';
import { C, PRISM, R, S, T } from '../theme/tokens';
import { Screen, Header, Card, Chip, Tag, Thumb, Section, Field, Row, SyntheticTag, Btn, useToast, IconBtn } from '../components/UI';
import { Icon } from '../components/Icon';
import { useStore } from '../store/useStore';
import { loopScore } from '../lib/score';
import { ago } from '../lib/util';

export function Library({ navigation }: any) {
  const st = useStore();
  const [q, setQ] = useState('');
  const [k, setK] = useState<'all' | 'video' | 'audio' | 'image' | 'script'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const list = st.assets.filter(a => (k === 'all' || a.kind === k) && a.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <Screen>
      <Header title="Asset Locker" sub={`${st.assets.length} assets · every version kept`} right={<IconBtn name="graph" label="Memory Graph" onPress={() => navigation.navigate('Memory')} />} />
      <Pressable onPress={() => navigation.navigate('Memory')}>
        <LinearGradient colors={PRISM as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.mem}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }}>Your Brain Map</Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '600', marginTop: 4 }}>{st.insights.length} insights · {st.loops.length} Loops learned from</Text>
          </View>
          <View style={s.memIcon}><Icon name="graph" color={C.ink} /></View>
        </LinearGradient>
      </Pressable>
      <Field placeholder="Search assets" value={q} onChangeText={setQ} />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{(['all', 'video', 'audio', 'image', 'script'] as const).map(x => <Chip key={x} label={x[0].toUpperCase() + x.slice(1)} active={k === x} onPress={() => setK(x)} />)}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: S.lg }}>
        {list.map(a => (
          <Pressable key={a.id} style={{ width: '48%' }} onPress={() => setOpen(open === a.id ? null : a.id)}>
            <Thumb hue={a.hue} w="100%" h={150} label={a.title}>
              <View style={s.kind}><Icon name={a.kind === 'video' ? 'film' : a.kind === 'audio' ? 'mic' : a.kind === 'image' ? 'eye' : 'text'} size={14} color="#fff" /><Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>v{a.versions.length}</Text></View>
              {a.coreIdentity ? <View style={s.core}><Icon name="star" size={13} color={C.ink} /></View> : null}
            </Thumb>
            {a.synthetic ? <View style={{ marginTop: 6 }}><SyntheticTag /></View> : null}
          </Pressable>
        ))}
      </View>
      {open ? (() => { const a = st.assets.find(x => x.id === open)!; return (
        <Card style={{ marginTop: S.lg }}>
          <Text style={T.h3}>{a.title}</Text>
          <Text style={T.small}>Version history (originals never modified)</Text>
          {[...a.versions].reverse().map(v => <Row key={v.v} icon="layers" title={`v${v.v} · ${v.note}`} sub={ago(v.at)} />)}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Btn small kind={a.coreIdentity ? 'lime' : 'ghost'} icon="star" title={a.coreIdentity ? 'Core identity' : 'Mark core identity'} onPress={() => st.toggleCore(a.id)} style={{ flex: 1 }} />
          </View>
        </Card>); })() : null}
    </Screen>
  );
}

export function Memory() {
  const st = useStore();
  const [edit, setEdit] = useState<string | null>(null);
  const [txt, setTxt] = useState('');
  const { toast, show } = useToast();
  const scored = st.loops.map(l => ({ l, sc: loopScore(l) })).filter(x => x.sc !== null);
  const nodes = [
    { x: 150, y: 110, r: 34, label: 'You', c: C.ink },
    { x: 60, y: 50, r: 22, label: 'Comedy', c: C.violet }, { x: 250, y: 55, r: 24, label: 'Travel', c: '#14B88D' },
    { x: 55, y: 180, r: 18, label: 'Cold open', c: C.pink }, { x: 245, y: 180, r: 19, label: 'Numbers-first', c: C.tangerine }, { x: 150, y: 210, r: 14, label: '<35s', c: '#6B6785' },
  ];
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Header title="Brain Map" sub="What works — uniquely for you" />
        <LinearGradient colors={['#17171F', '#120F24']} style={{ borderRadius: 28, padding: 8 }}>
          <Svg width="100%" height={250} viewBox="0 0 300 250">
            {nodes.slice(1).map((n, i) => <Line key={i} x1={150} y1={110} x2={n.x} y2={n.y} stroke="rgba(255,255,255,0.18)" strokeWidth={2} />)}
            <Line x1={60} y1={50} x2={55} y2={180} stroke="rgba(200,244,90,0.4)" strokeWidth={2} strokeDasharray="4 4" />
            <Line x1={250} y1={55} x2={245} y2={180} stroke="rgba(200,244,90,0.4)" strokeWidth={2} strokeDasharray="4 4" />
            {nodes.map(n => (<React.Fragment key={n.label}>
              <Circle cx={n.x} cy={n.y} r={n.r + 6} fill={n.c} opacity={0.25} />
              <Circle cx={n.x} cy={n.y} r={n.r} fill={n.label === 'You' ? C.lime : n.c} />
              <SText x={n.x} y={n.y + 4} fontSize={n.label === 'You' ? 13 : 9} fontWeight="800" fill={n.label === 'You' ? C.ink : '#fff'} textAnchor="middle">{n.label}</SText>
            </React.Fragment>))}
          </Svg>
        </LinearGradient>
        <Section title="Loop Score trend">
          <Card>
            <Svg width="100%" height={90} viewBox="0 0 300 90">
              <Path d={scored.map((x, i) => `${i ? 'L' : 'M'}${20 + i * (260 / Math.max(1, scored.length - 1))} ${80 - (x.sc! / 100) * 70}`).join(' ')} stroke={C.violet} strokeWidth={3} fill="none" strokeLinecap="round" />
              {scored.map((x, i) => <Circle key={i} cx={20 + i * (260 / Math.max(1, scored.length - 1))} cy={80 - (x.sc! / 100) * 70} r={5} fill={C.pink} />)}
            </Svg>
            <Text style={T.small}>{scored.length} scored Loops · confidence: {scored.length < 5 ? 'low (few data points)' : 'medium'}</Text>
          </Card>
        </Section>
        <Section title="Insights you can correct">
          {st.insights.map(i => (
            <Card key={i.id} style={{ marginBottom: 10 }}>
              {edit === i.id ? (<>
                <Field value={txt} onChangeText={setTxt} multiline />
                <Btn small title="Save correction" onPress={() => { st.correctInsight(i.id, txt); setEdit(null); show('Insight corrected'); }} />
              </>) : (<>
                <Text style={[T.body, { lineHeight: 20 }]}>{i.text}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <Text style={[T.small, { flex: 1 }]}>Source: {i.source}</Text>
                  {i.corrected ? <Tag label="CORRECTED BY YOU" color="#12A27C" bg={C.mintSoft} /> : null}
                  <Pressable onPress={() => { setEdit(i.id); setTxt(i.text); }}><Text style={{ color: C.violet, fontWeight: '800' }}>Edit</Text></Pressable>
                </View>
              </>)}
            </Card>
          ))}
        </Section>
        <Section title="Content DNA">
          {st.loops.slice(0, 3).map(l => (
            <Card key={l.id} style={{ marginBottom: 10 }}>
              <Text style={T.h3} numberOfLines={1}>{l.title}</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <Tag label={l.dna.mood.toUpperCase()} /><Tag label={`ENERGY ${l.dna.energy}`} color={C.pink} bg={C.pinkSoft} /><Tag label={`DEPTH ${l.dna.depth}`} color="#12A27C" bg={C.mintSoft} /><Tag label={`PACE ${l.dna.pace}`} color={C.tangerine} bg="#FFEEDF" />
              </View>
            </Card>
          ))}
        </Section>
        <Btn kind="ghost" icon="download" title="Export graph backup (JSON)" style={{ marginTop: S.lg }} onPress={() => {
          const data = JSON.stringify({ insights: st.insights, neverIdeas: st.neverIdeas, loops: st.loops.map(l => ({ id: l.id, title: l.title, dna: l.dna, score: loopScore(l) })) }, null, 2);
          if (typeof document !== 'undefined') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = 'vibeloop-memory.json'; a.click(); show('Backup downloaded'); } else show(`Backup ready (${data.length} bytes)`);
        }} />
      </Screen>
      {toast}
    </View>
  );
}
const s = StyleSheet.create({
  mem: { flexDirection: 'row', alignItems: 'center', borderRadius: 26, padding: 18, marginBottom: S.lg },
  memIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center' },
  kind: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(18,15,36,0.5)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  core: { position: 'absolute', top: 10, right: 10, width: 24, height: 24, borderRadius: 12, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center' },
});
