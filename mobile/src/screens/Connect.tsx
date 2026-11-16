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

export function Chats({ navigation }: any) {
  const st = useSocial(); const [tab, setTab] = useState<'all' | 'groups' | 'requests'>('all');
  const list = st.chats.filter(c => (tab === 'requests' ? c.request : !c.request) && (tab !== 'groups' || c.group)).sort((a, b) => Number(b.pinned) - Number(a.pinned));
  return (
    <Screen>
      <Header title="Messages" sub="Loop Talk · Circle Chat" right={<IconBtn name="search" label="Search messages" onPress={() => navigation.navigate('Search', { q: '' })} />} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: S.lg }}>
        <Chip label="All" active={tab === 'all'} onPress={() => setTab('all')} /><Chip label="Groups" active={tab === 'groups'} onPress={() => setTab('groups')} />
        <Chip label={`Requests ${st.chats.filter(c => c.request).length}`} icon="shield" active={tab === 'requests'} onPress={() => setTab('requests')} />
      </View>
      {list.map(c => { const last = c.msgs[c.msgs.length - 1]; const who = creator(c.members[0]); return (
        <Card key={c.id} style={{ marginBottom: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }} onPress={() => navigation.navigate('ChatThread', { id: c.id })}>
          {c.group ? <LinearGradient colors={PRISM as any} style={s.groupAv}><Icon name="users" color="#fff" /></LinearGradient> : <Avatar name={who.name} hue={who.hue} size={50} />}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={T.h3} numberOfLines={1}>{c.title}</Text>{c.pinned ? <Icon name="pin" size={14} color={C.violet} /> : null}{c.muted ? <Icon name="bell" size={14} color={C.inkSoft} /> : null}
            </View>
            <Text style={T.small} numberOfLines={1}>{last?.from === 'me' ? 'You: ' : ''}{last?.text}</Text>
          </View>
          <Text style={T.small}>{last ? ago(last.at) : ''}</Text>
        </Card>); })}
      {!list.length ? <Text style={T.small}>No conversations.</Text> : null}
    </Screen>
  );
}

export function ChatThread({ navigation, route }: any) {
  const st = useSocial(); const c = st.chats.find(x => x.id === (route?.params?.id ?? 'c1'));
  const [txt, setTxt] = useState(''); const [pick, setPick] = useState<string | null>(null);
  const [theme, setTheme] = useState(0); const themes: [string, string][] = [['#6C3BFF', '#FF3D9A'], ['#14B88D', '#2B7BF0'], ['#FF8A3D', '#FF3D9A'], ['#120F24', '#3A1B9C']];
  if (!c) return null;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Screen bottom={150}>
        <Header title={c.title} sub={c.group ? `${c.members.length + 1} members` : 'Active recently'} right={<View style={{ flexDirection: 'row', gap: 6 }}>
          <IconBtn name="pin" label={c.pinned ? 'Unpin' : 'Pin'} onPress={() => st.togglePin(c.id)} />
          <IconBtn name="palette" label="Chat theme" onPress={() => setTheme((theme + 1) % themes.length)} />
        </View>} />
        {c.request ? (
          <Card style={{ marginBottom: 16 }}>
            <Text style={T.h3}>Message request</Text><Text style={[T.small, { marginVertical: 6 }]}>This account isn't in your Circle. Safe Inbox holds it until you decide.</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn small title="Accept" kind="ink" onPress={() => st.acceptRequest(c.id)} style={{ flex: 1 }} />
              <Btn small title="Block & report" kind="danger" onPress={() => { st.block(c.members[0]); st.report(c.members[0], 'Spam message request'); st.deleteChat(c.id); navigation.goBack(); }} style={{ flex: 1 }} />
            </View>
          </Card>) : null}
        {c.msgs.map(m => { const me = m.from === 'me'; return (
          <View key={m.id} style={{ alignItems: me ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
            {c.group && !me ? <Text style={[T.small, { marginBottom: 2, marginLeft: 6 }]}>{creator(m.from).name}</Text> : null}
            <Pressable onLongPress={() => setPick(m.id)} onPress={() => setPick(pick === m.id ? null : m.id)}>
              {me ? <LinearGradient colors={themes[theme]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.bub, s.bubMe]}><Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>{m.text}</Text></LinearGradient>
                : <View style={[s.bub, s.bubThem]}><Text style={{ fontWeight: '600', fontSize: 15 }}>{m.text}</Text></View>}
              {m.react ? <View style={[s.reactTag, me ? { left: -8 } : { right: -8 }]}><VibeMoji id={m.react} size={22} /></View> : null}
            </Pressable>
            {pick === m.id ? <View style={s.pick}>{useSocial.getState().reactionPack.slice(0, 6).map(id => <Pressable key={id} onPress={() => { st.reactMsg(c.id, m.id, id); setPick(null); }}><VibeMoji id={id} size={30} /></Pressable>)}</View> : null}
            <Text style={[T.small, { fontSize: 10, marginTop: 3 }]}>{ago(m.at)}</Text>
          </View>); })}
        <Row icon="bell" title={c.muted ? 'Muted (Quiet Mode)' : 'Notifications on'} onPress={() => st.toggleMute(c.id)} />
      </Screen>
      <View style={s.composer}>
        <View style={s.mic}><Icon name="mic" size={20} color={C.inkSoft} /></View>
        <TextInput value={txt} onChangeText={setTxt} placeholder="Message…" placeholderTextColor="#A6A2BC" style={s.input} onSubmitEditing={() => { if (txt.trim()) { st.send(c.id, txt.trim()); setTxt(''); } }} />
        <Pressable onPress={() => { if (txt.trim()) { st.send(c.id, txt.trim()); setTxt(''); } }} accessibilityLabel="Send"><LinearGradient colors={PRISM as any} style={s.send}><Icon name="send" size={18} color="#fff" /></LinearGradient></Pressable>
      </View>
    </View>
  );
}

export function Search({ navigation, route }: any) {
  const [q, setQ] = useState(route?.params?.q ?? 'chai');
  const st = useSocial(); const loops = useStore(s => s.loops);
  const k = q.trim().toLowerCase();
  const r = useMemo(() => k ? {
    creators: CREATORS.filter(c => (c.name + c.handle + c.city + c.bio).toLowerCase().includes(k)),
    posts: st.posts.filter(p => (p.text + p.mood + p.interest + (p.place ?? '')).toLowerCase().includes(k)),
    tribes: TRIBES.filter(t => (t.name + t.kind + t.desc).toLowerCase().includes(k)),
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
      {r?.tribes.length ? <Section title="Tribes">{r.tribes.map(t => <Row key={t.id} icon="users" tint="#14B88D" title={t.name} sub={`${compact(t.members)} members`} onPress={() => navigation.navigate('Tribes')} />)}</Section> : null}
      {r?.msgs.length ? <Section title="Messages">{r.msgs.map(({ c, m }) => <Row key={m.id} icon="chat" title={m.text} sub={c.title} onPress={() => navigation.navigate('ChatThread', { id: c.id })} />)}</Section> : null}
      {r?.features.length ? <Section title="Features">{r.features.map(f => <Row key={f.n} icon={f.icon} tint={C.tangerine} title={f.name} sub={f.desc} onPress={() => f.route && navigation.navigate(f.route)} />)}</Section> : null}
      {r?.moji.length ? <Section title="VibeMoji"><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{r.moji.map(m => <Pressable key={m.id} onPress={() => navigation.navigate('Emoji', { q: m.name })} style={{ alignItems: 'center', width: 70 }}><VibeMoji id={m.id} size={48} /><Text style={{ fontSize: 10, fontWeight: '700', textAlign: 'center' }} numberOfLines={1}>{m.name}</Text></Pressable>)}</View></Section> : null}
      {k && !count ? <Text style={[T.small, { marginTop: 24, textAlign: 'center' }]}>No results. Try another word.</Text> : null}
    </Screen>
  );
}

export function Tribes() {
  const st = useSocial(); const [k, setK] = useState('All');
  const list = TRIBES.filter(t => k === 'All' || t.kind === k || (k === 'Joined' && st.joined.includes(t.id)));
  return (
    <Screen>
      <Header title="Tribes" sub="Interest, city, campus & fan communities" right={<DemoTag />} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{['All', 'Joined', 'Food', 'City', 'Gaming', 'Creative', 'Student', 'Sports'].map(x => <Chip key={x} label={x} active={k === x} onPress={() => setK(x)} />)}</ScrollView>
      <View style={{ marginTop: S.lg, gap: 12 }}>
        {list.map(t => { const on = st.joined.includes(t.id); return (
          <Card key={t.id} style={{ padding: 0, overflow: 'hidden' }}>
            <Thumb hue={t.hue} w="100%" h={96} radius={0} />
            <View style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}><Tag label={t.kind.toUpperCase()} /><Text style={[T.h3, { marginTop: 6 }]}>{t.name}</Text><Text style={T.small}>{t.desc} · {compact(t.members + (on ? 1 : 0))} members</Text></View>
              <Btn small title={on ? 'Joined' : 'Join'} kind={on ? 'ghost' : 'prism'} icon={on ? 'check' : 'plus'} onPress={() => st.join(t.id)} />
            </View>
          </Card>); })}
      </View>
      <NotReady feature="Tribe events, polls & board" why="Community posting needs the backend." />
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
        {LIVES.map(l => { const c = creator(l.by); const on = st.reminders.includes(l.id); return (
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
