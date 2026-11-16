import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, ScrollView, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Rect, Path, Circle } from 'react-native-svg';
import { C, PRISM, R, S, T } from '../theme/tokens';
import { Screen, Header, Card, Btn, Chip, Tag, DemoTag, Section, Row, Toggle, NotReady, useToast, Field, Bar } from '../components/UI';
import { Icon } from '../components/Icon';
import { VibeMoji } from '../components/VibeMoji';
import { VIBEMOJI, VIBEMOJI_CATEGORIES, REACTIONS } from '../lib/vibemoji';
import { SECTIONS, ALL_FEATURES } from '../data/features';
import { PRD, PRD_GROUPS } from '../data/prd';
import { useSocial, creator, CREATORS, compact } from '../store/useSocial';
import { useStore } from '../store/useStore';

export function Emoji({ route }: any) {
  const st = useSocial(); const [cat, setCat] = useState('All'); const [q, setQ] = useState(route?.params?.q ?? ''); const [sel, setSel] = useState<number | null>(null);
  const list = useMemo(() => VIBEMOJI.filter(m => (cat === 'All' || m.category === cat || (cat === 'My Pack' && st.reactionPack.includes(m.id))) && m.name.toLowerCase().includes(q.toLowerCase())), [cat, q, st.reactionPack]);
  const m = sel ? VIBEMOJI[sel - 1] : null;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <FlatList data={list} numColumns={5} keyExtractor={x => String(x.id)} initialNumToRender={60} columnWrapperStyle={{ gap: 8, paddingHorizontal: 20 }} contentContainerStyle={{ gap: 8, paddingBottom: 160 }}
        ListHeaderComponent={<View style={{ paddingHorizontal: 20, paddingTop: 50 }}>
          <Header title="VibeMoji" sub={`500 original emoji · ${list.length} shown`} />
          <LinearGradient colors={['#2A1D63', '#120F24']} style={s.packHero}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>Reaction set</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>{REACTIONS.map(r => <View key={r.key} style={{ alignItems: 'center', width: 52 }}><VibeMoji id={r.id} size={44} /><Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 9, fontWeight: '700', textAlign: 'center', marginTop: 4 }}>{r.label}</Text></View>)}</View>
          </LinearGradient>
          <View style={s.search}><Icon name="search" size={18} color={C.inkSoft} /><TextInput value={q} onChangeText={setQ} placeholder="Search 500 VibeMoji" placeholderTextColor="#A6A2BC" style={{ flex: 1, fontWeight: '600', fontSize: 15, color: C.ink }} /></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>{['All', 'My Pack', ...VIBEMOJI_CATEGORIES].map(c => <Chip key={c} label={c} active={cat === c} onPress={() => setCat(c)} />)}</ScrollView>
        </View>}
        renderItem={({ item }) => (
          <Pressable onPress={() => setSel(item.id)} style={[s.cell, st.reactionPack.includes(item.id) && { borderColor: C.violet }]} accessibilityLabel={item.name}>
            <VibeMoji id={item.id} size={46} />
          </Pressable>)} />
      {m ? (
        <View style={s.sheet}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <VibeMoji id={m.id} size={84} />
            <View style={{ flex: 1 }}><Text style={T.h2}>{m.name}</Text><Text style={T.small}>#{m.id} · {m.category}</Text></View>
            <Pressable onPress={() => setSel(null)} accessibilityLabel="Close"><Icon name="close" /></Pressable>
          </View>
          <Btn style={{ marginTop: 14 }} icon={st.reactionPack.includes(m.id) ? 'check' : 'plus'} kind={st.reactionPack.includes(m.id) ? 'ink' : 'prism'} title={st.reactionPack.includes(m.id) ? 'In your Reaction Pack' : 'Add to Reaction Pack'} onPress={() => st.togglePack(m.id)} />
          <Btn style={{ marginTop: 8 }} kind="ghost" icon="smile" title="Set as Profile Mood" onPress={() => { st.setMood(m.id); setSel(null); }} />
        </View>) : null}
    </View>
  );
}

const TABS = ['Home', 'Explore', 'Create', 'Motion', 'Profile'];
const go = (navigation: any, r?: string) => r && r !== 'Admin' && (TABS.includes(r) ? navigation.navigate('Main', { screen: r }) : navigation.navigate(r));
export function Features({ navigation, route }: any) {
  const [q, setQ] = useState(''); const [open, setOpen] = useState<string | null>(route?.params?.tab === 'social' ? 'home' : PRD_GROUPS[0]);
  const [tab, setTab] = useState<'prd' | 'social'>(route?.params?.tab === 'social' ? 'social' : 'prd');
  const socialUnique = ALL_FEATURES.filter(f => !f.same);
  const prdLive = PRD.filter(f => f.route && f.route !== 'Admin').length, prdAdmin = PRD.filter(f => f.route === 'Admin').length;
  const socLive = socialUnique.filter(f => f.route).length;
  return (
    <Screen>
      <Header title="All features" sub={`${200 + socialUnique.length} unique capabilities · ${ALL_FEATURES.length - socialUnique.length} social items link to the same PRD feature`} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: S.md }}>
        <Chip label="Creator platform · 200" active={tab === 'prd'} onPress={() => { setTab('prd'); setOpen(PRD_GROUPS[0]); }} />
        <Chip label="Social · 150" active={tab === 'social'} onPress={() => { setTab('social'); setOpen('home'); }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: S.lg }}>
        <Card style={{ flex: 1 }}><Text style={T.h1}>{tab === 'prd' ? prdLive : socLive}</Text><Text style={T.small}>In app (preview)</Text></Card>
        {tab === 'prd' ? <Card style={{ flex: 1 }}><Text style={T.h1}>{prdAdmin}</Text><Text style={T.small}>Admin panel</Text></Card> : null}
        <Card style={{ flex: 1 }}><Text style={T.h1}>{tab === 'prd' ? 200 - prdLive - prdAdmin : socialUnique.length - socLive}</Text><Text style={T.small}>Planned</Text></Card>
      </View>
      <View style={s.search}><Icon name="search" size={18} color={C.inkSoft} /><TextInput value={q} onChangeText={setQ} placeholder="Find a feature" placeholderTextColor="#A6A2BC" style={{ flex: 1, fontWeight: '600', fontSize: 15, color: C.ink }} /></View>
      {tab === 'prd' ? PRD_GROUPS.map((g, gi) => { const fs = PRD.filter(f => f.group === g && f.name.toLowerCase().includes(q.toLowerCase())); if (!fs.length) return null; const isOpen = open === g || !!q; const col = ['#6C3BFF', '#FF3D9A', '#FF8A3D', '#14B88D', '#2B7BF0', '#C86BFF', '#120F24'][gi]; return (
        <Card key={g} style={{ marginBottom: 10, padding: 12 }}>
          <Pressable onPress={() => setOpen(isOpen && !q ? null : g)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[s.secIcon, { backgroundColor: col }]}><Text style={{ color: '#fff', fontWeight: '900' }}>{gi + 1}</Text></View>
            <View style={{ flex: 1 }}><Text style={T.h3}>{g}</Text><Text style={T.small}>#{fs[0].n}–{fs[fs.length - 1].n} · {fs.filter(f => f.route).length}/{fs.length} available</Text></View>
            <Icon name={isOpen ? 'close' : 'chevron'} size={18} color={C.inkSoft} />
          </Pressable>
          {isOpen ? fs.map(f => (
            <Pressable key={f.n} onPress={() => go(navigation, f.route)} style={s.feat}>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: '700' }}>{f.n}. {f.name}</Text>{f.route ? <Text style={T.small}>{f.route === 'Admin' ? 'Staff admin panel' : `Screen: ${f.route}`}</Text> : null}</View>
              {f.route === 'Admin' ? <Tag label="ADMIN" color={C.violet} bg={C.violetSoft} /> : f.route ? <Tag label="PREVIEW" color="#12A27C" bg={C.mintSoft} /> : <Tag label="PLANNED" color={C.inkSoft} bg="#ECE9F5" />}
            </Pressable>)) : null}
        </Card>); }) : null}
      {tab === 'social' ? SECTIONS.map(sec => { const fs = sec.features.filter(f => (f.name + f.desc).toLowerCase().includes(q.toLowerCase())); if (!fs.length) return null; const isOpen = open === sec.key || !!q; return (
        <Card key={sec.key} style={{ marginBottom: 10, padding: 12 }}>
          <Pressable onPress={() => setOpen(isOpen && !q ? null : sec.key)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[s.secIcon, { backgroundColor: sec.color }]}><Icon name={sec.icon} color="#fff" /></View>
            <View style={{ flex: 1 }}><Text style={T.h3}>{sec.title}</Text><Text style={T.small}>{sec.sub} · {sec.features.filter(f => f.route).length}/10 have a screen</Text></View>
            <Icon name={isOpen ? 'close' : 'chevron'} size={18} color={C.inkSoft} />
          </Pressable>
          {isOpen ? fs.map(f => (
            <Pressable key={f.n} onPress={() => go(navigation, f.route)} style={s.feat}>
              <View style={[s.fIcon, { backgroundColor: sec.color + '1A' }]}><Icon name={f.icon} size={18} color={sec.color === '#120F24' ? C.ink : sec.color} /></View>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: '800' }}>{f.n}. {f.name}</Text><Text style={T.small}>{f.desc}</Text></View>
              {f.same ? <Tag label={`SAME AS #${f.same}`} color={C.pink} bg={C.pinkSoft} /> : f.route ? <Tag label="PREVIEW" color="#12A27C" bg={C.mintSoft} /> : <Tag label="PLANNED" color={C.inkSoft} bg="#ECE9F5" />}
            </Pressable>)) : null}
        </Card>); }) : null}
    </Screen>
  );
}

export function Growth() {
  const st = useSocial(); const mine = st.posts.filter(p => p.mine); const all = st.posts;
  const sum = (ps: typeof all, f: (p: any) => number) => ps.reduce((a, p) => a + f(p), 0);
  const base = mine.length ? mine : all;
  const hearts = sum(base, p => Object.values(p.reactions as Record<string, number>).reduce((a, b) => a + b, 0)); const views = sum(base, p => p.views); const shares = sum(base, p => p.shares);
  const hours = [2, 3, 1, 1, 2, 4, 7, 9, 8, 6, 5, 6, 7, 6, 5, 6, 8, 10, 12, 14, 13, 10, 7, 4];
  const top = [...base].sort((a, b) => b.shares - a.shares).slice(0, 3);
  return (
    <Screen>
      <Header title="Pulse Board" sub={mine.length ? 'Your posts' : 'Sample posts — you haven’t posted yet'} right={<DemoTag />} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {[['eye', 'Views', compact(views)], ['heart', 'Reactions', compact(hearts)], ['send', 'Shares', compact(shares)], ['users', 'Circle', String(st.following.length)]].map(([i, l, v]) => (
          <Card key={l} style={{ width: '48%' }}><Icon name={i as any} color={C.violet} /><Text style={[T.h1, { marginTop: 8 }]}>{v}</Text><Text style={T.small}>{l}</Text><Text style={[T.small, { fontSize: 10, marginTop: 4 }]}>Confidence: {base.length < 5 ? 'low' : 'medium'} · updated now</Text></Card>))}
      </View>
      <Section title="Active hours">
        <Card><Svg width="100%" height={110} viewBox="0 0 288 110">{hours.map((h, i) => <Rect key={i} x={i * 12 + 1} y={100 - h * 6.5} width={9} height={h * 6.5} rx={4} fill={h > 11 ? C.pink : C.violet} opacity={h > 11 ? 1 : 0.55} />)}</Svg>
          <Text style={T.small}>Your audience peaks around 7–9 pm (sample distribution).</Text></Card>
      </Section>
      <Section title="Engagement rate">
        <Card><Text style={T.h1}>{views ? ((hearts + shares) / views * 100).toFixed(1) : '—'}%</Text><Bar pct={views ? (hearts + shares) / views * 100 * 4 : 0} /><Text style={[T.small, { marginTop: 6 }]}>(reactions + shares) ÷ views — real counts only, no estimated reach</Text></Card>
      </Section>
      <Section title="Top drops">{top.map((p, i) => <Row key={p.id} icon="trophy" tint={C.tangerine} title={`${i + 1}. ${p.text}`} sub={`${p.shares} shares · ${compact(p.views)} views`} />)}</Section>
      <NotReady feature="Audience map" why="Aggregated geography needs server analytics." />
    </Screen>
  );
}

export function Trust() {
  const st = useSocial(); const p = st.privacy; const [w, setW] = useState(''); const { toast, show } = useToast();
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Header title="Trust & safety" sub="Privacy Lock · Block Shield · Comment Guard" />
        <LinearGradient colors={['#2A1D63', '#120F24']} style={s.trustHero}><Icon name="shield" color={C.lime} size={30} /><View style={{ flex: 1 }}><Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }}>You're in control</Text><Text style={{ color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>{st.blocked.length} blocked · {st.restricted.length} restricted · {st.reports.length} reports</Text></View></LinearGradient>
        <Card style={{ marginTop: S.lg }}>
          <Row icon="lock" title="Private account" sub="Only approved followers see your posts" right={<Toggle value={p.privateAccount} onChange={v => st.setPrivacy('privateAccount', v)} label="Private account" />} />
          <Row icon="heart" title="Hide reaction counts" right={<Toggle value={p.hideLikes} onChange={v => st.setPrivacy('hideLikes', v)} label="Hide counts" />} />
          <Row icon="chat" title="Message requests" sub="Hold messages from people outside your Circle" right={<Toggle value={p.msgRequests} onChange={v => st.setPrivacy('msgRequests', v)} label="Message requests" />} />
          <Row icon="user" title="Teen Space" sub="Stricter defaults for under-18 accounts" right={<Toggle value={p.teenSpace} onChange={v => st.setPrivacy('teenSpace', v)} label="Teen Space" />} />
        </Card>
        <Section title="Comment Guard">
          <Card>
            <Row icon="shield" title="Filter comments" sub="Comments with these words are hidden" right={<Toggle value={p.commentGuard} onChange={v => st.setPrivacy('commentGuard', v)} label="Comment guard" />} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>{p.guardWords.map(x => <Chip key={x} label={x} icon="close" onPress={() => st.setPrivacy('guardWords', p.guardWords.filter(y => y !== x))} />)}</View>
            <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Field placeholder="Add a word" value={w} onChangeText={setW} /></View><Btn small kind="ink" title="Add" style={{ marginTop: 6 }} onPress={() => { if (w.trim()) { st.setPrivacy('guardWords', [...p.guardWords, w.trim()]); setW(''); } }} /></View>
          </Card>
        </Section>
        <Section title="Accounts">
          {CREATORS.slice(0, 4).map(c => (
            <Card key={c.id} style={{ marginBottom: 8, padding: 10 }}>
              <Row title={c.name} sub={c.handle} right={<View style={{ flexDirection: 'row', gap: 6 }}>
                <Chip label={st.restricted.includes(c.id) ? 'Restricted' : 'Restrict'} active={st.restricted.includes(c.id)} onPress={() => st.restrict(c.id)} />
                <Chip label={st.blocked.includes(c.id) ? 'Blocked' : 'Block'} active={st.blocked.includes(c.id)} onPress={() => st.block(c.id)} />
              </View>} />
            </Card>))}
        </Section>
        <Section title="Report Hub">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{['Spam', 'Harassment', 'Impersonation', 'Misinformation', 'Copyright'].map(r => <Chip key={r} label={r} icon="flag" onPress={() => { st.report('general', r); show(`Report filed: ${r} — sent to moderation`); }} />)}</View>
          {st.reports.slice(0, 4).map(r => <Row key={r.id} icon="flag" tint={C.danger} title={r.reason} sub={`Target: ${r.target} · in review`} />)}
        </Section>
      </Screen>
      {toast}
    </View>
  );
}

const LESSONS = [
  { id: 'l1', t: 'How Loops work', d: 'Test privately, earn a score, then release', mins: 3, icon: 'loops' },
  { id: 'l2', t: 'Writing a 2-second hook', d: 'Patterns from your own winners', mins: 4, icon: 'bolt' },
  { id: 'l3', t: 'Reading your Loop Score', d: 'Why 3+ reactions and a 24h window', mins: 2, icon: 'chart' },
  { id: 'l4', t: 'Sparks, polls & Close Circle', d: 'Daily touchpoints with fans', mins: 3, icon: 'clock' },
  { id: 'l5', t: 'Rights & AI labels', d: 'What the release gate checks', mins: 3, icon: 'shield' },
  { id: 'l6', t: 'Earning on VibeLoop', d: 'Tips, paid Loops, memberships — fees shown', mins: 4, icon: 'wallet' },
  { id: 'l7', t: 'Staying safe', d: 'Comment Guard, restrict, block, report', mins: 2, icon: 'lock' },
];
export function Learn() {
  const st = useSocial(); const done = st.lessons.length;
  return (
    <Screen>
      <Header title="Learn" sub="Short creator lessons" />
      <LinearGradient colors={PRISM as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.learnHero}>
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 22 }}>{done}/{LESSONS.length} lessons done</Text>
        <View style={{ marginTop: 10 }}><Bar pct={(done / LESSONS.length) * 100} color={C.lime} bg="rgba(255,255,255,0.3)" /></View>
        <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '600', marginTop: 8 }}>About {LESSONS.reduce((a, l) => a + l.mins, 0)} minutes total</Text>
      </LinearGradient>
      {LESSONS.map((l, i) => { const on = st.lessons.includes(l.id); return (
        <Card key={l.id} style={{ marginBottom: 10, padding: 10 }}>
          <Row icon={l.icon as any} tint={on ? '#12A27C' : C.violet} title={`${i + 1}. ${l.t}`} sub={`${l.d} · ${l.mins} min`} right={<Chip label={on ? 'Done' : 'Mark done'} icon={on ? 'check' : undefined} active={on} onPress={() => st.doneLesson(l.id)} />} />
        </Card>); })}
    </Screen>
  );
}

const SET_SECTIONS = [
  { key: 'account', t: 'Account & security', d: 'Profile, two-factor, biometrics, sessions', icon: 'lock' },
  { key: 'privacy', t: 'Privacy & data', d: 'Who can join, visibility, export, deletion', icon: 'eye' },
  { key: 'notifications', t: 'Notifications', d: 'Push categories, quiet hours', icon: 'bell' },
  { key: 'creation', t: 'Creation & costs', d: 'AI caps, render quality, language', icon: 'wand' },
  { key: 'monetisation', t: 'Monetisation', d: 'Payout minimum, currency', icon: 'wallet' },
  { key: 'audit', t: 'Audit trail', d: 'Everything you did on this device', icon: 'shield' },
];
export function SettingsHub({ navigation }: any) {
  return (
    <Screen>
      <Header title="Settings" sub="Everything, in one place" />
      <Card>{SET_SECTIONS.map(x => <Row key={x.key} icon={x.icon as any} title={x.t} sub={x.d} onPress={() => navigation.navigate('Settings', { section: x.key })} />)}</Card>
      <Card style={{ marginTop: 12 }}>
        <Row icon="shield" tint={C.pink} title="Trust & safety" sub="Privacy Lock, block, restrict, Comment Guard, reports" onPress={() => navigation.navigate('Trust')} />
        <Row icon="smile" tint={C.tangerine} title="VibeMoji & Reaction Pack" sub="500 original emoji" onPress={() => navigation.navigate('Emoji')} />
        <Row icon="book" tint="#12A27C" title="Learn" sub="Short creator lessons" onPress={() => navigation.navigate('Learn')} />
        <Row icon="library" tint={C.violet} title="All features" sub="The 150-feature roadmap and its status" onPress={() => navigation.navigate('Features')} />
      </Card>
    </Screen>
  );
}
export const SETTINGS_SECTIONS = SET_SECTIONS.map(s => s.key);

const s = StyleSheet.create({
  packHero: { borderRadius: 26, padding: 16, marginBottom: 14 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, paddingHorizontal: 16, marginBottom: 12 },
  cell: { flex: 1, aspectRatio: 1, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'center', maxWidth: '20%' },
  sheet: { position: 'absolute', left: 12, right: 12, bottom: 24, backgroundColor: C.surface, borderRadius: 28, padding: 18, borderWidth: 1, borderColor: C.line, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20 },
  secIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  feat: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.line, marginTop: 6 },
  fIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  trustHero: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 26, padding: 18 },
  learnHero: { borderRadius: 26, padding: 20, marginBottom: S.lg },
});
