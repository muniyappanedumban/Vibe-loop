import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, FlatList, useWindowDimensions, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, PRISM, R, S, T } from '../theme/tokens';
import { Screen, Header, Card, Btn, Chip, Tag, DemoTag, Thumb, Avatar, Section, Field, Row, IconBtn, useToast, hsl } from '../components/UI';
import { Icon } from '../components/Icon';
import { VibeMoji } from '../components/VibeMoji';
import { REACTIONS } from '../lib/vibemoji';
import { useSocial, creator, compact, Post } from '../store/useSocial';
import { useStore } from '../store/useStore';
import { ago } from '../lib/util';

export function SparkRow({ navigation }: any) {
  const sp = useSocial(s => s.sparks); const seen = useSocial(s => s.seenSparks); const me = useStore(s => s.user);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: 20 }} style={{ marginHorizontal: -20 }}>
      <Pressable onPress={() => navigation.navigate('NewPost')} style={{ alignItems: 'center', width: 66 }}>
        <View><Avatar name={me.name} hue={280} size={62} /><View style={s.addSpark}><Icon name="plus" size={14} color={C.ink} stroke={3} /></View></View>
        <Text style={s.sparkName}>Your Spark</Text>
      </Pressable>
      {sp.map((x, i) => { const c = creator(x.by); const on = !seen.includes(x.id); return (
        <Pressable key={x.id} onPress={() => navigation.navigate('Sparks', { start: i })} style={{ alignItems: 'center', width: 66 }} accessibilityLabel={`${c.name} Spark`}>
          <LinearGradient colors={on ? (x.close ? ['#2BD9A8', '#C8F45A'] : (PRISM as any)) : [C.line, C.line]} style={s.sparkRing}><View style={s.sparkInner}><Avatar name={c.name} hue={c.hue} size={54} /></View></LinearGradient>
          <Text style={s.sparkName} numberOfLines={1}>{c.name.split(' ')[0]}</Text>
        </Pressable>); })}
    </ScrollView>
  );
}

export function PostCard({ p, navigation }: { p: Post; navigation: any }) {
  const st = useSocial(); const c = creator(p.by); const mine = st.myReacts[p.id]; const [pick, setPick] = useState(false); const [cm, setCm] = useState('');
  const total = Object.values(p.reactions).reduce((a, b) => a + b, 0);
  const following = st.following.includes(p.by);
  return (
    <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
        <Avatar name={c.name} hue={c.hue} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '800' }}>{c.name} {'badge' in c && c.badge ? <Icon name="shield" size={13} color={C.violet} /> : null}</Text>
          <Text style={T.small}>{p.place ? `${p.place} · ` : ''}{ago(p.at)} · {p.mood}</Text>
        </View>
        {p.by !== 'me' ? <Chip label={following ? 'Following' : 'Follow'} active={!following} onPress={() => st.follow(p.by)} /> : <Tag label="YOU" />}
      </View>
      {p.kind === 'thought' ? (
        <View style={[s.thought, { backgroundColor: p.bg ?? C.violet }]}><Text style={s.thoughtT}>{p.text}</Text></View>
      ) : (
        <Pressable onPress={() => p.kind === 'motion' && navigation.navigate('Motion')}>
          <Thumb hue={p.hue} w="100%" h={p.kind === 'motion' ? 420 : 340} radius={0}>
            {p.kind === 'motion' ? <View style={s.playBadge}><Icon name="play" size={16} color="#fff" /><Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{compact(p.views)}</Text></View> : null}
            {p.kind === 'carousel' ? <View style={s.dots}>{Array.from({ length: p.slides ?? 3 }).map((_, i) => <View key={i} style={[s.dot, i === 0 && { backgroundColor: '#fff', width: 16 }]} />)}</View> : null}
          </Thumb>
        </Pressable>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingTop: 12 }}>
        <Pressable onPress={() => setPick(!pick)} onLongPress={() => setPick(true)} accessibilityLabel="React" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {mine ? <VibeMoji id={REACTIONS.find(r => r.key === mine)!.id} size={26} /> : <Icon name="heart" size={24} />}
          <Text style={{ fontWeight: '800' }}>{st.privacy.hideLikes && p.by === 'me' ? '' : compact(total)}</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="comment" size={23} /><Text style={{ fontWeight: '800' }}>{p.comments.length}</Text></View>
        <Pressable onPress={() => st.share(p.id)} accessibilityLabel="Share" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="send" size={22} /><Text style={{ fontWeight: '800' }}>{p.shares}</Text></Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => st.save(p.id)} accessibilityLabel="Save"><Icon name="bookmark" size={23} color={st.saved.includes(p.id) ? C.violet : C.ink} /></Pressable>
      </View>
      {pick ? (
        <View style={s.picker}>{REACTIONS.map(r => (
          <Pressable key={r.key} onPress={() => { st.react(p.id, r.key); setPick(false); }} style={[s.pickItem, mine === r.key && { backgroundColor: C.violetSoft }]} accessibilityLabel={r.label}>
            <VibeMoji id={r.id} size={34} /><Text style={{ fontSize: 9, fontWeight: '700', color: C.inkSoft }}>{p.reactions[r.key] ?? 0}</Text>
          </Pressable>))}</View>
      ) : null}
      {p.kind !== 'thought' ? <Text style={{ paddingHorizontal: 14, paddingTop: 8, lineHeight: 20 }}><Text style={{ fontWeight: '800' }}>{c.handle} </Text>{p.text}</Text> : null}
      {p.comments.slice(-2).map((x, i) => <Text key={i} style={{ paddingHorizontal: 14, paddingTop: 4, color: C.inkSoft }}><Text style={{ fontWeight: '800', color: C.ink }}>{creator(x.by).handle} </Text>{x.text}</Text>)}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 }}>
        <TextInput value={cm} onChangeText={setCm} placeholder="Add a comment…" placeholderTextColor="#A6A2BC" style={s.cIn} />
        <Pressable onPress={() => { if (cm.trim()) { st.comment(p.id, cm.trim()); setCm(''); } }} accessibilityLabel="Post comment"><Text style={{ color: C.violet, fontWeight: '800' }}>Post</Text></Pressable>
      </View>
    </Card>
  );
}

const FEEDS = ['For You', 'Circle', 'Trending', 'Fresh', 'Mood', 'Interests'] as const;
const MOODS = ['Funny', 'Inspiring', 'Relaxing', 'Emotional', 'Happy'];
export function Explore({ navigation }: any) {
  const st = useSocial();
  const [feed, setFeed] = useState<(typeof FEEDS)[number]>('For You');
  const [mood, setMood] = useState('Funny'); const [interest, setInterest] = useState('Food');
  const visible = st.posts.filter(p => !st.blocked.includes(p.by));
  const score = (p: Post) => Object.values(p.reactions).reduce((a, b) => a + b, 0) + p.shares * 3;
  const list = feed === 'Circle' ? visible.filter(p => st.following.includes(p.by) || p.by === 'me') : feed === 'Trending' ? [...visible].sort((a, b) => score(b) - score(a))
    : feed === 'Fresh' ? [...visible].sort((a, b) => b.at - a.at) : feed === 'Mood' ? visible.filter(p => p.mood === mood) : feed === 'Interests' ? visible.filter(p => p.interest === interest)
    : [...visible].sort((a, b) => (st.following.includes(b.by) ? 1 : 0) - (st.following.includes(a.by) ? 1 : 0) || b.at - a.at);
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: S.lg }}>
        <Text style={[T.h1, { flex: 1 }]}>Explore</Text>
        <IconBtn name="chat" label="Messages" onPress={() => navigation.navigate('Chats')} badge={st.chats.filter(c => c.request).length || undefined} />
        <IconBtn name="bookmark" label="Vault" onPress={() => navigation.navigate('Vault')} />
      </View>
      <Pressable onPress={() => navigation.navigate('Search')} style={s.search} accessibilityRole="search"><Icon name="search" size={18} color={C.inkSoft} /><Text style={{ color: C.inkSoft, fontWeight: '600' }}>Search creators, posts, tribes, VibeMoji…</Text></Pressable>
      <SparkRow navigation={navigation} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginTop: S.lg }}>{FEEDS.map(f => <Chip key={f} label={f} active={feed === f} onPress={() => setFeed(f)} />)}</ScrollView>
      {feed === 'Mood' ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginTop: 8 }}>{MOODS.map(m => <Chip key={m} label={m} icon="smile" active={mood === m} onPress={() => setMood(m)} />)}</ScrollView> : null}
      {feed === 'Interests' ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginTop: 8 }}>{['Food', 'Travel', 'Finance', 'Art', 'Sports'].map(m => <Chip key={m} label={m} icon="hash" active={interest === m} onPress={() => setInterest(m)} />)}</ScrollView> : null}
      <LinearGradient colors={['#EEE8FF', '#FFE6F2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.oneQ}>
        <VibeMoji id={311} size={44} />
        <View style={{ flex: 1 }}><Text style={T.tiny}>ONE QUESTION · TODAY</Text><Text style={[T.h3, { marginTop: 2 }]}>What's a small habit that changed your year?</Text></View>
      </LinearGradient>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: S.lg, marginBottom: 10 }}><Text style={[T.small, { flex: 1 }]}>{list.length} posts · {feed}</Text><DemoTag /></View>
      {list.map(p => <PostCard key={p.id} p={p} navigation={navigation} />)}
      {!list.length ? <Text style={[T.small, { textAlign: 'center', marginTop: 30 }]}>Nothing here yet — follow creators to fill your Circle.</Text> : null}
    </Screen>
  );
}

export function Motion({ navigation }: any) {
  const { height, width } = useWindowDimensions(); const ins = useSafeAreaInsets();
  const st = useSocial(); const reels = st.posts.filter(p => p.kind === 'motion' && !st.blocked.includes(p.by));
  const [burst, setBurst] = useState<string | null>(null);
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <FlatList data={reels} keyExtractor={p => p.id} pagingEnabled showsVerticalScrollIndicator={false} snapToInterval={height} decelerationRate="fast"
        renderItem={({ item: p }) => { const c = creator(p.by); const mine = st.myReacts[p.id]; return (
          <Pressable onPress={() => { st.react(p.id, 'heart'); setBurst(p.id); setTimeout(() => setBurst(null), 700); }} style={{ width, height }}>
            <Thumb hue={p.hue} w="100%" h={height} radius={0} />
            <LinearGradient colors={['rgba(0,0,0,0.35)', 'transparent', 'transparent', 'rgba(0,0,0,0.7)']} style={StyleSheet.absoluteFill} />
            {burst === p.id ? <View style={s.burst}><VibeMoji id={7} size={120} /></View> : null}
            <View style={[s.reelTop, { top: ins.top + 10 }]}><Text style={s.reelTitle}>Motion</Text><View style={{ flex: 1 }} /><Tag label="DEMO DATA" color="#fff" bg="rgba(255,255,255,0.18)" /></View>
            <View style={[s.rail, { bottom: 130 }]}>
              {[{ i: mine ? null : 'heart', moji: mine ? REACTIONS.find(r => r.key === mine)!.id : null, n: compact(Object.values(p.reactions).reduce((a, b) => a + b, 0)), on: () => st.react(p.id, 'heart'), l: 'React' },
                { i: 'comment', n: String(p.comments.length), l: 'Comments' }, { i: 'send', n: String(p.shares), on: () => st.share(p.id), l: 'Share' },
                { i: 'bookmark', n: st.saved.includes(p.id) ? 'Saved' : 'Save', on: () => st.save(p.id), l: 'Save' }].map((b: any) => (
                <Pressable key={b.l} onPress={b.on} accessibilityLabel={b.l} style={{ alignItems: 'center', gap: 4 }}>
                  <View style={s.railBtn}>{b.moji ? <VibeMoji id={b.moji} size={30} /> : <Icon name={b.i} size={26} color="#fff" />}</View>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{b.n}</Text>
                </Pressable>))}
            </View>
            <View style={s.reelInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Avatar name={c.name} hue={c.hue} size={38} ring />
                <Text style={{ color: '#fff', fontWeight: '900' }}>{c.handle}</Text>
                <Pressable onPress={() => st.follow(p.by)} style={s.followBtn}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{st.following.includes(p.by) ? 'Following' : 'Follow'}</Text></Pressable>
              </View>
              <Text style={{ color: '#fff', fontWeight: '600', marginTop: 10, fontSize: 15, lineHeight: 21 }}>{p.text}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}><Icon name="music" size={14} color="#fff" /><Text style={{ color: 'rgba(255,255,255,0.8)', fontWeight: '600', fontSize: 12 }}>Original audio · {c.name}</Text></View>
            </View>
          </Pressable>); }} />
    </View>
  );
}

export function Sparks({ navigation, route }: any) {
  const st = useSocial(); const ins = useSafeAreaInsets();
  const [i, setI] = useState(Number(route?.params?.start ?? 0)); const [prog, setProg] = useState(0); const [sent, setSent] = useState<number | null>(null);
  const sp = st.sparks[i]; const c = sp ? creator(sp.by) : null;
  useEffect(() => { if (!sp) return; st.seeSpark(sp.id); setProg(0); setSent(null); const t = setInterval(() => setProg(p => p + 0.02), 100); return () => clearInterval(t); }, [i]);
  useEffect(() => { if (prog >= 1) i < st.sparks.length - 1 ? setI(i + 1) : navigation.goBack(); }, [prog]);
  if (!sp || !c) return null;
  const vote = st.votes[sp.id];
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Thumb hue={sp.hue} w="100%" h={2000} radius={0} />
      <Pressable style={StyleSheet.absoluteFill} onPress={e => { const x = (e.nativeEvent as any).locationX ?? 300; x < 120 ? setI(Math.max(0, i - 1)) : i < st.sparks.length - 1 ? setI(i + 1) : navigation.goBack(); }} />
      <View style={{ position: 'absolute', top: ins.top + 8, left: 12, right: 12 }} pointerEvents="box-none">
        <View style={{ flexDirection: 'row', gap: 4 }}>{st.sparks.map((_, j) => <View key={j} style={s.progBg}><View style={[s.progFg, { width: `${j < i ? 100 : j === i ? Math.min(100, prog * 100) : 0}%` }]} /></View>)}</View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <Avatar name={c.name} hue={c.hue} size={36} />
          <Text style={{ color: '#fff', fontWeight: '800' }}>{c.name}</Text><Text style={{ color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>{ago(sp.at)}</Text>
          {sp.close ? <Tag label="CLOSE CIRCLE" color={C.ink} bg="#C8F45A" /> : null}
          <View style={{ flex: 1 }} /><IconBtn dark name="close" label="Close" size={38} onPress={() => navigation.goBack()} />
        </View>
      </View>
      <View style={s.sparkCenter} pointerEvents="box-none">
        <Text style={s.sparkText}>{sp.text}</Text>
        {sp.poll ? (
          <View style={s.poll}>
            <Text style={{ fontWeight: '900', fontSize: 16, textAlign: 'center', marginBottom: 10 }}>{sp.poll.q}</Text>
            {(['a', 'b'] as const).map(k => { const n = k === 'a' ? sp.poll!.va : sp.poll!.vb; const tot = sp.poll!.va + sp.poll!.vb; return (
              <Pressable key={k} onPress={() => st.vote(sp.id, k)} style={s.pollOpt} accessibilityLabel={`Vote ${k === 'a' ? sp.poll!.a : sp.poll!.b}`}>
                {vote ? <View style={[s.pollFill, { width: `${(n / tot) * 100}%`, backgroundColor: vote === k ? C.lime : C.violetSoft }]} /> : null}
                <Text style={{ fontWeight: '800', flex: 1 }}>{k === 'a' ? sp.poll!.a : sp.poll!.b}</Text>
                {vote ? <Text style={{ fontWeight: '900' }}>{Math.round((n / tot) * 100)}%</Text> : null}
              </Pressable>); })}
          </View>
        ) : null}
      </View>
      <View style={[s.sparkReact, { bottom: ins.bottom + 20 }]}>
        {useSocial.getState().reactionPack.slice(0, 6).map(id => (
          <Pressable key={id} onPress={() => setSent(id)} style={[s.sparkMoji, sent === id && { backgroundColor: 'rgba(200,244,90,0.3)' }]} accessibilityLabel={`React ${id}`}><VibeMoji id={id} size={34} /></Pressable>
        ))}
      </View>
      {sent ? <Text style={[s.sentT, { bottom: ins.bottom + 84 }]}>Reaction sent to {c.name.split(' ')[0]}</Text> : null}
    </View>
  );
}

const BGS = ['#6C3BFF', '#FF3D9A', '#FF8A3D', '#14B88D', '#120F24', '#FFC23D'];
export function NewPost({ navigation }: any) {
  const add = useSocial(s => s.addPost);
  const [kind, setKind] = useState<'photo' | 'carousel' | 'thought'>('photo');
  const [text, setText] = useState(''); const [bg, setBg] = useState(BGS[0]); const [mood, setMood] = useState('Happy'); const [place, setPlace] = useState(''); const [hue, setHue] = useState(280);
  const { toast, show } = useToast();
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Header title="New Moment" sub="Photo, carousel or thought" />
        <View style={{ flexDirection: 'row', gap: 8 }}>{([['photo', 'Moment Drop', 'image'], ['carousel', 'Swipe Story', 'layers'], ['thought', 'Thought Drop', 'text']] as const).map(([k, l, i]) => <Chip key={k} label={l} icon={i as any} active={kind === k} onPress={() => setKind(k)} />)}</View>
        <View style={{ marginTop: S.lg }}>
          {kind === 'thought' ? (
            <View style={[s.thought, { backgroundColor: bg, borderRadius: 26, minHeight: 260 }]}><Text style={s.thoughtT}>{text || 'Your thought appears here…'}</Text></View>
          ) : (
            <Pressable onPress={() => setHue((hue + 47) % 360)}><Thumb hue={hue} w="100%" h={300} radius={26} label={kind === 'carousel' ? 'Carousel · 3 slides (tap to change cover)' : 'Tap to change cover'} /></Pressable>
          )}
        </View>
        {kind === 'thought' ? <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>{BGS.map(b => <Pressable key={b} onPress={() => setBg(b)} accessibilityLabel={`Background ${b}`} style={[s.swatch, { backgroundColor: b }, bg === b && { borderColor: C.lime, borderWidth: 3 }]} />)}</View> : null}
        <View style={{ marginTop: S.lg }}><Field label={kind === 'thought' ? 'Thought' : 'Caption'} value={text} onChangeText={setText} multiline placeholder="Say something real…" /></View>
        <Text style={[T.tiny, { marginBottom: 8 }]}>MOOD TAG</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{MOODS.map(m => <Chip key={m} label={m} active={mood === m} onPress={() => setMood(m)} />)}</View>
        <View style={{ marginTop: S.lg }}><Field label="Place pin" value={place} onChangeText={setPlace} placeholder="e.g. Indiranagar, Bengaluru" /></View>
        <View style={s.notice}><Icon name="image" size={16} color={C.tangerine} /><Text style={[T.small, { flex: 1 }]}>Photo upload from the camera roll isn't connected in this preview — covers are generated art.</Text></View>
        <Btn title="Share Moment" icon="send" onPress={() => {
          if (!text.trim()) return show('Write a caption first', 'err');
          add({ kind, text: text.trim(), hue, mood, interest: 'Life', place: place.trim() || undefined, bg: kind === 'thought' ? bg : undefined, slides: kind === 'carousel' ? 3 : undefined });
          show('Posted to your Circle'); setTimeout(() => navigation.navigate('Main', { screen: 'Explore' }), 700);
        }} />
      </Screen>
      {toast}
    </View>
  );
}

export function Vault({ navigation }: any) {
  const st = useSocial(); const saved = st.posts.filter(p => st.saved.includes(p.id));
  return (
    <Screen>
      <Header title="My Vault" sub={`${saved.length} saved`} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {saved.map(p => (
          <Pressable key={p.id} style={{ width: '48%' }} onPress={() => st.save(p.id)} accessibilityLabel="Remove from vault">
            {p.kind === 'thought' ? <View style={[s.thought, { backgroundColor: p.bg, minHeight: 200, borderRadius: 20, padding: 16 }]}><Text style={[s.thoughtT, { fontSize: 15 }]} numberOfLines={6}>{p.text}</Text></View> : <Thumb hue={p.hue} w="100%" h={200} label={p.text} />}
          </Pressable>
        ))}
      </View>
      {!saved.length ? <Text style={T.small}>Tap the bookmark on any post to save it here.</Text> : <Text style={[T.small, { marginTop: 12 }]}>Tap an item to remove it.</Text>}
    </Screen>
  );
}

const s = StyleSheet.create({
  addSpark: { position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.bg },
  sparkRing: { width: 66, height: 66, borderRadius: 33, padding: 3 }, sparkInner: { flex: 1, borderRadius: 33, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  sparkName: { fontSize: 11, fontWeight: '700', marginTop: 6, color: C.ink },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, paddingHorizontal: 16, marginBottom: S.lg },
  oneQ: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: R.md, marginTop: S.lg },
  thought: { minHeight: 220, padding: 24, justifyContent: 'center' }, thoughtT: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: -0.5, lineHeight: 29 },
  playBadge: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(18,15,36,0.55)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  dots: { position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', gap: 4 }, dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  picker: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 12, marginTop: 10, padding: 6, borderRadius: 999, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line },
  pickItem: { alignItems: 'center', padding: 4, borderRadius: 16 },
  cIn: { flex: 1, height: 40, borderRadius: 20, backgroundColor: C.bg, paddingHorizontal: 14, fontWeight: '600', color: C.ink },
  reelTop: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center' }, reelTitle: { color: '#fff', fontWeight: '900', fontSize: 24, letterSpacing: -0.6 },
  rail: { position: 'absolute', right: 14, gap: 18, alignItems: 'center' }, railBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  reelInfo: { position: 'absolute', left: 18, right: 90, bottom: 120 }, followBtn: { borderWidth: 1.5, borderColor: '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  burst: { position: 'absolute', top: '38%', alignSelf: 'center' },
  progBg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' }, progFg: { height: 3, backgroundColor: '#fff' },
  sparkCenter: { position: 'absolute', top: '30%', left: 24, right: 24, alignItems: 'center' }, sparkText: { color: '#fff', fontSize: 30, fontWeight: '900', textAlign: 'center', letterSpacing: -0.8 },
  poll: { marginTop: 24, width: '100%', backgroundColor: '#fff', borderRadius: 24, padding: 16 },
  pollOpt: { height: 48, borderRadius: 16, borderWidth: 1, borderColor: C.line, marginTop: 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, overflow: 'hidden' },
  pollFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  sparkReact: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'rgba(18,15,36,0.55)', borderRadius: 999, padding: 6 },
  sparkMoji: { padding: 4, borderRadius: 20 }, sentT: { position: 'absolute', alignSelf: 'center', color: '#fff', fontWeight: '800', backgroundColor: 'rgba(18,15,36,0.7)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, overflow: 'hidden' },
  swatch: { width: 40, height: 40, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  notice: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 16, backgroundColor: '#FFF4EA', marginVertical: 12 },
});
