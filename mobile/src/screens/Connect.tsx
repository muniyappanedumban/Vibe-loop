import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, PRISM, R, S, T } from '../theme/tokens';
import { Screen, Header, Card, Btn, Chip, Tag, DemoTag, Thumb, Avatar, Section, Row, IconBtn, NotReady, useToast, Field } from '../components/UI';
import { Icon } from '../components/Icon';
import { VibeMoji } from '../components/VibeMoji';
import { VIBEMOJI } from '../lib/vibemoji';
import { ALL_FEATURES } from '../data/features';
import { useSocial, creator, CREATORS, TRIBES, LIVES, compact } from '../store/useSocial';
import { useStore } from '../store/useStore';
import { ago } from '../lib/util';

// (Direct messages live in the Chat module — src/chat/screens. The old Social-side message screens were removed to avoid duplicates.)

export function Search({ navigation, route }: any) {
  const [q, setQ] = useState(route?.params?.q ?? 'chai');
  const st = useSocial(); const loops = useStore(s => s.loops);
  const k = q.trim().toLowerCase();
  const r = useMemo(() => k ? {
    creators: st.creators.filter(c => (c.name + c.handle + c.city + c.bio).toLowerCase().includes(k)),
    posts: st.posts.filter(p => (p.text + p.mood + p.interest + (p.place ?? '')).toLowerCase().includes(k)),
    tribes: st.tribes.filter(t => (t.name + t.kind + t.desc).toLowerCase().includes(k)),
    loops: loops.filter(l => l.title.toLowerCase().includes(k)),
    msgs: st.chats.flatMap(c => c.msgs.filter(m => m.text.toLowerCase().includes(k)).map(m => ({ c, m }))),
    features: ALL_FEATURES.filter(f => (f.name + f.desc).toLowerCase().includes(k)).slice(0, 6),
    moji: VIBEMOJI.filter(m => (m.name + m.category).toLowerCase().includes(k)).slice(0, 12),
  } : null, [k, st.posts, st.chats, loops]);
  const count = r ? Object.values(r).reduce((a, x) => a + x.length, 0) : 0;
  return (
    <Screen>
      <Header title="Search" sub={k ? `${count} results for “${q}”` : 'Creators, posts, tribes, Loops, messages, VibeMoji'} />
      <View style={s.searchBox}><Icon name="search" size={18} color={C.inkSoft} /><TextInput autoFocus value={q} onChangeText={setQ} placeholder="Search VibeLoop" placeholderTextColor="#A6A2BC" style={{ flex: 1, fontSize: 16, fontWeight: '600', color: C.ink }} />{q ? <Pressable onPress={() => setQ('')}><Icon name="close" size={18} color={C.inkSoft} /></Pressable> : null}</View>
      {!k ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>{['chai', 'food', 'Mumbai', 'money', 'cricket', 'Sunny', 'Live'].map(x => <Chip key={x} label={x} icon="search" onPress={() => setQ(x)} />)}</View> : null}
      {r?.creators.length ? <Section title="Creators">{r.creators.map(c => <Row key={c.id} title={c.name} sub={`${c.handle} · ${c.city} · ${compact(c.followers)} followers`} right={<Chip label={st.following.includes(c.id) ? 'Following' : 'Follow'} active={!st.following.includes(c.id)} onPress={() => st.follow(c.id)} />} />)}</Section> : null}
      {r?.loops.length ? <Section title="Your Loops">{r.loops.map(l => <Row key={l.id} icon="loops" title={l.title} sub={l.status} onPress={() => navigation.navigate('LoopDetail', { id: l.id })} />)}</Section> : null}
      {r?.posts.length ? <Section title="Posts">{r.posts.map(p => <Row key={p.id} icon={p.kind === 'motion' ? 'film' : p.kind === 'thought' ? 'text' : 'image'} tint={C.pink} title={p.text} sub={`${creator(p.by).handle} · ${p.mood}`} />)}</Section> : null}
      {k ? <Row icon="users" title={`Find Hoods matching “${q}”`} sub="Communities live in Hush → Hoods" onPress={() => navigation.navigate('ChatMain', { screen: 'Towns' })} /> : null}
      {k ? <Row icon="chat" title={`Search messages for “${q}” in Chat`} sub="Opens Find Anything in the Chat module" onPress={() => navigation.navigate('ChatSearch')} /> : null}
      {r?.features.length ? <Section title="Features">{r.features.map(f => <Row key={f.n} icon={f.icon} tint={C.tangerine} title={f.name} sub={f.desc} onPress={() => f.route && navigation.navigate(f.route)} />)}</Section> : null}
      {r?.moji.length ? <Section title="VibeMoji"><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{r.moji.map(m => <Pressable key={m.id} onPress={() => navigation.navigate('Emoji', { q: m.name })} style={{ alignItems: 'center', width: 70 }}><VibeMoji id={m.id} size={48} /><Text style={{ fontSize: 10, fontWeight: '700', textAlign: 'center' }} numberOfLines={1}>{m.name}</Text></Pressable>)}</View></Section> : null}
      {k && !count ? <Text style={[T.small, { marginTop: 24, textAlign: 'center' }]}>No results. Try another word.</Text> : null}
    </Screen>
  );
}

export function Live() {
  const st = useSocial();
  const left = (t: number) => { const m = Math.max(0, Math.round((t - Date.now()) / 60000)); return m > 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
  return (
    <Screen>
      <Header title="Loop Live" sub="Broadcasts, audio rooms & countdowns" />
      <LinearGradient colors={['#FF4D5E', '#FF3D9A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.liveHero}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={s.liveDot} /><Text style={{ color: '#fff', fontWeight: '900', letterSpacing: 1 }}>GO LIVE</Text></View>
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 24, marginTop: 10, letterSpacing: -0.6 }}>Talk to your Circle in real time</Text>
        <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '600', marginTop: 6 }}>Live comments, hearts, Q&A and host moderation.</Text>
      </LinearGradient>
      <NotReady feature="Live broadcasting" why="Real-time video needs streaming servers, which aren't connected in this build." fallback="schedule a countdown so followers get reminded." />
      <Section title="Upcoming (Live Countdown)">
        {st.lives.map(l => { const c = creator(l.by); const on = st.reminders.includes(l.id); return (
          <Card key={l.id} style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
            <Thumb hue={l.hue} w={64} h={84} radius={14} />
            <View style={{ flex: 1 }}><Text style={T.h3}>{l.title}</Text><Text style={T.small}>{c.name} · starts in {left(l.at)}</Text></View>
            <Btn small title={on ? 'Reminded' : 'Remind'} kind={on ? 'lime' : 'ghost'} icon="bell" onPress={() => st.remind(l.id)} />
          </Card>); })}
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  groupAv: { width: 50, height: 50, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  bub: { maxWidth: 270, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22 }, bubMe: { borderBottomRightRadius: 6 }, bubThem: { backgroundColor: C.surface, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: C.line },
  reactTag: { position: 'absolute', bottom: -10, backgroundColor: C.surface, borderRadius: 14, padding: 2, borderWidth: 1, borderColor: C.line },
  pick: { flexDirection: 'row', gap: 6, backgroundColor: C.surface, borderRadius: 999, padding: 6, marginTop: 10, borderWidth: 1, borderColor: C.line },
  composer: { position: 'absolute', left: 12, right: 12, bottom: 24, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: 999, padding: 6, borderWidth: 1, borderColor: C.line },
  mic: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, height: 40, fontSize: 15, fontWeight: '600', color: C.ink }, send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.violet, paddingHorizontal: 16 },
  liveHero: { borderRadius: 28, padding: 20, marginBottom: 6 }, liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' },
});
