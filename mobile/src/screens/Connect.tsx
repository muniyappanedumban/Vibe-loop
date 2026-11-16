import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, PRISM, R, S, T } from '../theme/tokens';
import { Screen, Header, Card, Btn, Chip, Tag, DemoTag, Thumb, Avatar, Section, Row, IconBtn, NotReady, useToast, Field } from '../components/UI';
import { Icon } from '../components/Icon';
import { VibeMoji } from '../components/VibeMoji';
import { VIBEMOJI } from '../lib/vibemoji';
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
    msgs: st.chats.flatMap(c => c.msgs.filter(m => m.text.toLowerCase().includes(k)).map(m => ({ c, m }))),
    moji: VIBEMOJI.filter(m => (m.name + m.category).toLowerCase().includes(k)).slice(0, 12),
  } : null, [k, st.posts, st.chats]);
  const count = r ? Object.values(r).reduce((a, x) => a + x.length, 0) : 0;
  return (
    <Screen>
      <Header title="Seek" sub={k ? `${count} results for “${q}”` : 'People, Drops, Hoods, messages, VibeMoji'} />
      <View style={s.searchBox}><Icon name="search" size={18} color={C.inkSoft} /><TextInput autoFocus value={q} onChangeText={setQ} placeholder="Search VibeLoop" placeholderTextColor="#A6A2BC" style={{ flex: 1, fontSize: 16, fontWeight: '600', color: C.ink }} />{q ? <Pressable onPress={() => setQ('')}><Icon name="close" size={18} color={C.inkSoft} /></Pressable> : null}</View>
      {!k ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>{['chai', 'food', 'Mumbai', 'money', 'cricket', 'Sunny', 'Live'].map(x => <Chip key={x} label={x} icon="search" onPress={() => setQ(x)} />)}</View> : null}
      {r?.creators.length ? <Section title="Creators">{r.creators.map(c => <Row key={c.id} title={c.name} sub={`${c.handle} · ${c.city} · ${compact(c.followers)} followers`} right={<Chip label={st.following.includes(c.id) ? 'Following' : 'Follow'} active={!st.following.includes(c.id)} onPress={() => st.follow(c.id)} />} />)}</Section> : null}
      {r?.posts.length ? <Section title="Posts">{r.posts.map(p => <Row key={p.id} icon={p.kind === 'motion' ? 'film' : p.kind === 'thought' ? 'text' : 'image'} tint={C.pink} title={p.text} sub={`${creator(p.by).handle} · ${p.mood}`} />)}</Section> : null}
      {k ? <Row icon="users" title={`Find Hoods matching “${q}”`} sub="Communities live in Hush → Hoods" onPress={() => navigation.navigate('ChatMain', { screen: 'Towns' })} /> : null}
      {k ? <Row icon="chat" title={`Search messages for “${q}” in Hush`} sub="Opens Find Anything in Hush" onPress={() => navigation.navigate('ChatSearch')} /> : null}
      {r?.moji.length ? <Section title="VibeMoji"><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{r.moji.map(m => <Pressable key={m.id} onPress={() => navigation.navigate('Emoji', { q: m.name })} style={{ alignItems: 'center', width: 70 }}><VibeMoji id={m.id} size={48} /><Text style={{ fontSize: 10, fontWeight: '700', textAlign: 'center' }} numberOfLines={1}>{m.name}</Text></Pressable>)}</View></Section> : null}
      {k && !count ? <Text style={[T.small, { marginTop: 24, textAlign: 'center' }]}>No results. Try another word.</Text> : null}
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
