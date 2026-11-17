import { useLiveSync } from '../lib/sync';
import { SparkExtras } from '../chat/screens/Parity';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, FlatList, useWindowDimensions, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, PRISM, R, S, T } from '../theme/tokens';
import { Screen, Header, Card, Btn, Chip, Tag, DemoTag, Thumb, Avatar, Section, Field, Row, IconBtn, useToast, hsl } from '../components/UI';
import { Icon } from '../components/Icon';
import { VibeMoji } from '../components/VibeMoji';
import { REACTIONS } from '../lib/vibemoji';
import { useSocial, creator, compact, Post, followLabel } from '../store/useSocial';
import { useStore } from '../store/useStore';
import { ago } from '../lib/util';
import { useFeature, useT, useConfig } from '../lib/config';
import { Media } from '../components/Lens';
import { VideoClip } from '../components/VideoClip';
import { isVideoUrl } from '../lib/uploads';
import { ReactionSheet } from '../components/ReactionSheet';
import { AdSlot } from './Money2';
import { PromoSlot } from '../components/PromoSlot';
import { SuggestBar, stickerToken, parseSticker } from '../components/SuggestBar';
import { shareOutside } from './Micro';
import { call as apiCall } from '../lib/api';
import { mediaUri } from './Studio';
import { Linking } from 'react-native';
import { chat } from '../chat/useChat';
import { online } from '../lib/api';
import { switchModule, DSwitch } from '../components/ModuleSwitch';
import { OutboxBanner } from './OutboxScreen';

export function SparkRow({ navigation }: any) {
  const sp = useSocial(s => s.sparks); const seen = useSocial(s => s.seenSparks); const me = useStore(s => s.user);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: 20 }} style={{ marginHorizontal: -20 }}>
      <Pressable onPress={() => navigation.navigate('NewPost', { mode: 'story' })} style={{ alignItems: 'center', width: 66 }} accessibilityLabel="Create a Blink">
        <View><Avatar name={me.name} hue={280} size={62} /><View style={s.addSpark}><Icon name="plus" size={14} color={C.ink} stroke={3} /></View></View>
        <Text style={s.sparkName}>Your Blink</Text>
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
  const lastTap = React.useRef(0); const [burst, setBurst] = useState(false); const [lib, setLib] = useState(false); const [hop, setHop] = useState<string | null>(null);
  React.useEffect(() => { if (hop) { const t = setTimeout(() => setHop(null), 2000); return () => clearTimeout(t); } }, [hop]);
  const total = Object.values(p.reactions).reduce((a, b) => a + b, 0); const p2c = useFeature('post2chat') && online();
  const following = st.following.includes(p.by);
  return (
    <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
        <Avatar name={c.name} hue={c.hue} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '800' }} onPress={() => p.by !== 'me' && navigation.navigate('CreatorProfile', { id: p.by })}>{c.name} {'badge' in c && c.badge ? <Icon name="shield" size={13} color={C.violet} /> : null}</Text>
          <Text style={T.small}>{p.place ? `${p.place} · ` : ''}{ago(p.at)} · {p.mood}</Text>
        </View>
        {p.by !== 'me' ? <Chip label={followLabel(st, p.by)} active={followLabel(st, p.by) === 'Follow'} onPress={() => st.follow(p.by)} /> : <Pressable onPress={() => apiCall('POST', `/posts/${p.id}/pin`).then(() => {}).catch(() => {})} accessibilityLabel="Pin to profile (Pin 3)"><Tag label={(p as any).pinned ? 'PINNED' : 'PIN'} /></Pressable>}
      </View>
      {p.kind === 'thought' ? (
        <View style={[s.thought, { backgroundColor: p.bg ?? C.violet }]}><Text style={s.thoughtT}>{p.text}</Text></View>
      ) : (
        <Pressable onPress={() => { const n = Date.now(); if (n - lastTap.current < 320) { if (st.myReacts[p.id] !== 'heart') st.react(p.id, 'heart'); setBurst(true); setTimeout(() => setBurst(false), 650); } lastTap.current = n; }} onLongPress={() => p.kind === 'motion' && navigation.navigate('Main', { screen: 'Motion' })} accessibilityHint="Double tap to like">
          {(p as any).mediaKind === 'video' && p.mediaUrl ? <VideoClip uri={mediaUri(p.mediaUrl)!} edit={(p as any).edit} lens={p.lens} city={p.place} h={440} /> :
          <Media uri={mediaUri(p.mediaUrl)} hue={p.hue} lens={p.lens} city={p.place?.split(',').pop()?.trim()} h={p.kind === 'motion' ? 420 : 340}>
            {burst ? <View style={s.burstSmall}><VibeMoji id={7} size={96} /></View> : null}
            {p.kind === 'motion' ? <View style={s.playBadge}><Icon name="play" size={16} color="#fff" /><Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{compact(p.views)}</Text></View> : null}
            {p.kind === 'carousel' ? <View style={s.dots}>{Array.from({ length: p.slides ?? 3 }).map((_, i) => <View key={i} style={[s.dot, i === 0 && { backgroundColor: '#fff', width: 16 }]} />)}</View> : null}
          </Media>}
        </Pressable>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingTop: 12 }}>
        <Pressable onPress={() => setPick(!pick)} onLongPress={() => setPick(true)} accessibilityLabel="React" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {mine ? <VibeMoji id={mine.startsWith('m') ? Number(mine.slice(1)) : REACTIONS.find(r => r.key === mine)!.id} size={26} /> : <Icon name="heart" size={24} />}
          <Text style={{ fontWeight: '800' }}>{st.privacy.hideLikes && p.by === 'me' ? '' : compact(total)}</Text>
        </Pressable>
        <Pressable onPress={() => online() ? navigation.navigate('Comments', { id: p.id }) : undefined} accessibilityLabel="Comments" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="comment" size={23} /><Text style={{ fontWeight: '800' }}>{p.comments.length}</Text></Pressable>
        <Pressable onPress={() => { st.share(p.id); shareOutside(p); }} accessibilityLabel="Share" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="send" size={22} /><Text style={{ fontWeight: '800' }}>{p.shares}</Text></Pressable>
        <View style={{ flex: 1 }} />
        {p2c ? <Pressable onPress={() => navigation.navigate('ShareToChat', { type: 'post', id: p.id, title: p.text })} onLongPress={() => { const last = [...chat.convsSorted()][0]; if (last) chat.share(last.id, 'post', p.id).then(() => setHop(`Sent to ${last.title}`)).catch(() => {}); }} accessibilityLabel="Send to chat (long-press: Hop Share to your latest chat)" style={{ marginRight: 12 }}><Icon name="chat" size={23} color={C.violet} /></Pressable> : null}
        <Pressable onPress={() => st.save(p.id)} onLongPress={() => online() && navigation.navigate('SaveStack', { add: p.id })} accessibilityLabel="Save (long-press for Save Stack)"><Icon name="bookmark" size={23} color={st.saved.includes(p.id) ? C.violet : C.ink} /></Pressable>
      </View>
      <ReactionSheet kind="vibe" open={lib} onClose={() => setLib(false)} onPick={id => { st.react(p.id, `m${id}`); setPick(false); }} />
      {Object.keys(p.reactions).some(k => k.startsWith('m') && p.reactions[k] > 0) ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingHorizontal: 14, paddingTop: 8 }}>{Object.entries(p.reactions).filter(([k, n]) => k.startsWith('m') && n > 0).slice(0, 8).map(([k, n]) => <View key={k} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 999, paddingRight: 6 }}><VibeMoji id={Number(k.slice(1))} size={22} /><Text style={{ fontSize: 11, fontWeight: '800' }}>{n}</Text></View>)}</View> : null}
      {(p as any).poll ? (
        <View style={{ marginHorizontal: 14, marginTop: 10, padding: 10, borderRadius: 14, backgroundColor: C.bg }}>
          <Text style={{ fontWeight: '900', marginBottom: 6 }}>{(p as any).poll.q}</Text>
          {(p as any).poll.options.map((o: any, i: number) => { const tot = (p as any).poll.options.reduce((a: number, x: any) => a + (x.votes || 0), 0) || 1; return (
            <Pressable key={i} onPress={() => apiCall<any>('POST', `/posts/${p.id}/vote`, { option: i }).then(r => useSocial.setState(s => ({ posts: s.posts.map(x => (x.id === p.id ? { ...x, poll: r.poll ?? r } as any : x)) }))).catch(() => {})} style={{ height: 38, borderRadius: 10, marginTop: 5, overflow: 'hidden', backgroundColor: C.surface, justifyContent: 'center', paddingHorizontal: 10 }} accessibilityLabel={`Vote ${o.text}`}>
              <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${((o.votes || 0) / tot) * 100}%`, backgroundColor: C.violetSoft }} />
              <Text style={{ fontWeight: '800' }}>{(p as any).poll.myVote === i ? '✓ ' : ''}{o.text} · {o.votes || 0}</Text>
            </Pressable>); })}
        </View>) : null}
      {pick ? (
        <View style={s.picker}>{REACTIONS.map(r => (
          <Pressable key={r.key} onPress={() => { st.react(p.id, r.key); setPick(false); }} style={[s.pickItem, mine === r.key && { backgroundColor: C.violetSoft }]} accessibilityLabel={r.label}>
            <VibeMoji id={r.id} size={34} /><Text style={{ fontSize: 9, fontWeight: '700', color: C.inkSoft }}>{p.reactions[r.key] ?? 0}</Text>
          </Pressable>))}
          <Pressable onPress={() => setLib(true)} style={s.pickItem} accessibilityLabel="More reactions"><View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: C.violetSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={18} color={C.violet} /></View><Text style={{ fontSize: 9, fontWeight: '700', color: C.inkSoft }}>1000</Text></Pressable></View>
      ) : null}
      {hop ? <Text style={{ paddingHorizontal: 14, paddingTop: 6, color: '#12A27C', fontWeight: '800' }}>Hop Share · {hop}</Text> : null}
      {p.kind !== 'thought' ? <Text style={{ paddingHorizontal: 14, paddingTop: 8, lineHeight: 20 }}><Text style={{ fontWeight: '800' }}>{c.handle}{p.collab ? ` × ${p.collab}` : ''} </Text>{p.text}</Text> : null}
      {p.sound || (p.lat != null && p.lng != null) || p.audience === 'circle' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingTop: 8 }}>
          {p.sound ? <Tag label={`SOUND · ${p.sound}`} color={C.pink} bg={C.pinkSoft} /> : null}
          {p.audience === 'circle' ? <Tag label="CIRCLE ONLY" color="#12A27C" bg={C.mintSoft} /> : null}
          {p.lat != null && p.lng != null ? <Pressable onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`)} accessibilityRole="link"><Tag label="OPEN MAP" /></Pressable> : null}
        </View>) : null}
      {p.comments.slice(-2).map((x, i) => parseSticker(x.text) ? <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingTop: 4 }}><Text style={{ fontWeight: '800', color: C.ink }}>{creator(x.by).handle}</Text><VibeMoji id={parseSticker(x.text)!.id} size={28} /></View> : <Text key={i} style={{ paddingHorizontal: 14, paddingTop: 4, color: C.inkSoft }}><Text style={{ fontWeight: '800', color: C.ink }}>{creator(x.by).handle} </Text>{x.text}</Text>)}
      <View style={{ paddingHorizontal: 10 }}><SuggestBar text={cm} kind="vibe" onPick={m => { st.comment(p.id, stickerToken('vibe', m)); setCm(''); }} /></View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 }}>
        <TextInput value={cm} onChangeText={setCm} placeholder="Add a comment…" placeholderTextColor="#A6A2BC" style={s.cIn} />
        <Pressable onPress={() => { if (cm.trim()) { st.comment(p.id, cm.trim()); setCm(''); } }} accessibilityLabel="Post comment"><Text style={{ color: C.violet, fontWeight: '800' }}>Post</Text></Pressable>
      </View>
    </Card>
  );
}

const FEEDS = ['For You', 'Circle', 'Trending', 'Fresh', 'Mood', 'Interests'] as const;
const MOODS = ['Funny', 'Inspiring', 'Relaxing', 'Emotional', 'Happy'];
export function Home({ navigation }: any) {
  useLiveSync();
  const st = useSocial(); const tr = useT();
  const [feed, setFeed] = useState<(typeof FEEDS)[number]>('For You');
  const [mood, setMood] = useState('Funny'); const [interest, setInterest] = useState('Food');
  const visible = st.posts.filter(p => !st.blocked.includes(p.by));
  // Older Drops page in from the server (/feed?mode=fresh) beyond what /bootstrap carries. null = no more pages, -1 = loading.
  const [more, setMore] = useState<number | null>(0);
  const loadMore = () => { const at = more ?? 0; setMore(-1); apiCall<any>('GET', `/feed?mode=fresh&cursor=${Math.max(at, st.posts.length)}`).then(r => {
    useSocial.setState(x => ({ posts: [...x.posts, ...r.items.filter((p: any) => !x.posts.some(q => q.id === p.id))] })); setMore(r.nextCursor ?? null); }).catch(() => setMore(at)); };
  // Server-driven tabs: each tab is its own ranked page from /feed?mode=… (admin decides which tabs exist).
  const MODE: Record<string, string> = { 'For You': 'foryou', Circle: 'circle', Trending: 'trending', Fresh: 'fresh', Mood: 'mood', Interests: 'interests' };
  const LEGACY: Record<string, string> = { following: 'circle', nearby: 'trending' };
  const allowed = useConfig(c => c.cfg.defaults?.glow?.feedTabs);
  const tabs = FEEDS.filter(f => !allowed?.length || allowed.map(t => (LEGACY[t] ?? t).toLowerCase()).includes(MODE[f]));
  useEffect(() => { if (tabs.length && !tabs.includes(feed)) setFeed(tabs[0]); }, [tabs.join()]);
  const [srv, setSrv] = useState<{ key: string; items: Post[]; next: number | null; loading: boolean; err?: string }>({ key: '', items: [], next: null, loading: false });
  const tag = feed === 'Mood' ? mood : feed === 'Interests' ? interest : '';
  const key = `${feed}|${tag}`;
  const fetchTab = (cursor = 0) => {
    const q = `/feed?mode=${MODE[feed]}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}&cursor=${cursor}`;
    setSrv(x => ({ ...x, key, loading: true, err: undefined, ...(cursor ? {} : { items: [] }) }));
    apiCall<any>('GET', q).then(r => setSrv(x => x.key !== key ? x : { key, items: cursor ? [...x.items, ...r.items.filter((p: any) => !x.items.some(q2 => q2.id === p.id))] : r.items, next: r.nextCursor ?? null, loading: false }))
      .catch(e => setSrv(x => x.key !== key ? x : { ...x, loading: false, err: e.message }));
  };
  useEffect(() => { if (online()) fetchTab(0); }, [key]);
  const score = (p: Post) => Object.values(p.reactions).reduce((a, b) => a + b, 0) + p.shares * 3;
  const local = feed === 'Circle' ? visible.filter(p => st.following.includes(p.by) || p.by === 'me') : feed === 'Trending' ? [...visible].sort((a, b) => score(b) - score(a))
    : feed === 'Fresh' ? [...visible].sort((a, b) => b.at - a.at) : feed === 'Mood' ? visible.filter(p => p.mood === mood) : feed === 'Interests' ? visible.filter(p => p.interest === interest)
    : [...visible].sort((a, b) => (st.following.includes(b.by) ? 1 : 0) - (st.following.includes(a.by) ? 1 : 0) || b.at - a.at);
  const live = online() && srv.key === key && !srv.err;
  const sparkOn = (useConfig(c => (c.cfg as any).addons?.glow?.dailySpark)) !== false;
  const [spark, setSpark] = useState<{ question: string; answered: boolean; total: number } | null>(null);
  useEffect(() => { if (sparkOn && online()) apiCall<any>('GET', '/addons/spark').then(setSpark).catch(() => {}); }, [sparkOn]);
  // live posts carry the same shape as /bootstrap posts; re-read from the store when present so likes/saves stay in sync
  const list = live ? srv.items.map(p => st.posts.find(q => q.id === p.id) ?? p).filter(p => !st.blocked.includes(p.by)) : local;
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: S.md }}>
        <Text style={s.logo}>vibeloop</Text>
        <View style={{ flex: 1 }} />
        <IconBtn name="heart" label="Pings" badge={useStore.getState().notices.filter(n => !n.read).length || undefined} onPress={() => navigation.navigate('Notifications')} />
        <IconBtn name="chat" label="Open Hush" onPress={() => switchModule(navigation, 'chat')} />
      </View>
      <View style={{ alignItems: 'center', marginBottom: S.md }}><DSwitch active="social" /></View>
      <OutboxBanner onPress={() => navigation.navigate('Outbox')} />
      <PromoSlot placement="home_banner" />
      <SparkRow navigation={navigation} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginTop: S.lg }}>{tabs.map(f => <Chip key={f} label={f} active={feed === f} onPress={() => setFeed(f)} />)}</ScrollView>
      {feed === 'Mood' ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginTop: 8 }}>{MOODS.map(m => <Chip key={m} label={m} icon="smile" active={mood === m} onPress={() => setMood(m)} />)}</ScrollView> : null}
      {feed === 'Interests' ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginTop: 8 }}>{['Food', 'Travel', 'Finance', 'Art', 'Sports'].map(m => <Chip key={m} label={m} icon="hash" active={interest === m} onPress={() => setInterest(m)} />)}</ScrollView> : null}
      {sparkOn ? <Pressable onPress={() => navigation.navigate('DailySpark')} accessibilityRole="button" accessibilityLabel="Open Daily Spark">
        <LinearGradient colors={[C.violetSoft, C.bg]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.oneQ}>
          <VibeMoji id={311} size={44} />
          <View style={{ flex: 1 }}><Text style={T.tiny}>DAILY SPARK · {spark?.answered ? `${spark.total} ANSWERS` : 'ANSWER TO SEE OTHERS'}</Text><Text style={[T.h3, { marginTop: 2 }]}>{spark?.question ?? "What's a small habit that changed your year?"}</Text></View>
        </LinearGradient>
      </Pressable> : null}
      <Pressable onPress={() => navigation.navigate('GlowExtras')} accessibilityRole="button" style={{ marginTop: 8, alignSelf: 'flex-start' }}><Text style={{ color: C.violet, fontWeight: '800' }}>Glow Extras · Time Capsules, Kudos →</Text></Pressable>
      <View style={{ height: S.lg }} />
      {list.map((p, i) => <React.Fragment key={p.id}><PostCard p={p} navigation={navigation} />{i === 0 ? <PromoSlot placement="feed" /> : null}{i === 2 ? <AdSlot place="feed" /> : null}</React.Fragment>)}
      {live && srv.loading && !list.length ? <Text style={[T.small, { textAlign: 'center', marginTop: 30 }]}>Loading {feed}…</Text>
        : !list.length ? <Text style={[T.small, { textAlign: 'center', marginTop: 30 }]}>{feed === 'Circle' ? 'Nothing here yet — follow creators to fill your Circle.' : `No Drops in ${feed}${tag ? ` · ${tag}` : ''} yet.`}</Text> : null}
      {srv.err && online() ? <Btn small kind="ghost" title={`Couldn't load ${feed} — retry`} icon="clock" onPress={() => fetchTab(0)} style={{ marginTop: 8 }} /> : null}
      {live && srv.next !== null ? <Btn small kind="ghost" title={srv.loading ? 'Loading…' : 'Load more'} icon="clock" disabled={srv.loading} onPress={() => fetchTab(srv.next!)} style={{ marginTop: 8 }} />
        : !live && online() && more !== null ? <Btn small kind="ghost" title={more === -1 ? 'Loading…' : 'Load older Drops'} icon="clock" disabled={more === -1} onPress={loadMore} style={{ marginTop: 8 }} /> : null}
    </Screen>
  );
}

export function Motion({ navigation }: any) {
  useLiveSync();
  const tr = useT();
  const { height, width } = useWindowDimensions(); const ins = useSafeAreaInsets();
  const st = useSocial(); const reels = st.posts.filter(p => (p.kind === 'motion' || (p as any).mediaKind === 'video') && !st.blocked.includes(p.by));
  const [burst, setBurst] = useState<string | null>(null);
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <FlatList data={reels} keyExtractor={p => p.id} pagingEnabled showsVerticalScrollIndicator={false} snapToInterval={height} decelerationRate="fast"
        renderItem={({ item: p }) => { const c = creator(p.by); const mine = st.myReacts[p.id]; return (
          <Pressable onPress={() => { st.react(p.id, 'heart'); setBurst(p.id); setTimeout(() => setBurst(null), 700); }} style={{ width, height }}>
            {(p as any).mediaKind === 'video' && p.mediaUrl ? <View style={StyleSheet.absoluteFill}><VideoClip uri={mediaUri(p.mediaUrl)!} edit={(p as any).edit} lens={p.lens} h={height} /></View> : <Thumb hue={p.hue} w="100%" h={height} radius={0} />}
            <LinearGradient colors={['rgba(0,0,0,0.35)', 'transparent', 'transparent', 'rgba(0,0,0,0.7)']} style={StyleSheet.absoluteFill} />
            {burst === p.id ? <View style={s.burst}><VibeMoji id={7} size={120} /></View> : null}
            <View style={[s.reelTop, { top: ins.top + 10 }]}><Text style={s.reelTitle}>{tr('nav.Motion', 'Flicks')}</Text><View style={{ flex: 1 }} /></View>
            <View style={[s.rail, { bottom: 130 }]}>
              {[{ i: mine ? null : 'heart', moji: mine ? REACTIONS.find(r => r.key === mine)!.id : null, n: compact(Object.values(p.reactions).reduce((a, b) => a + b, 0)), on: () => st.react(p.id, 'heart'), l: 'React' },
                { i: 'comment', n: String(p.comments.length), l: 'Comments' }, { i: 'send', n: String(p.shares), on: () => st.share(p.id), l: 'Share' },
                { i: 'bookmark', n: st.saved.includes(p.id) ? 'Saved' : 'Save', on: () => st.save(p.id), l: 'Save' },
                ...(online() ? [{ i: 'chat', n: 'Talk', on: () => navigation.navigate('ShareToChat', { type: 'post', id: p.id, title: p.text }), l: 'Reel2Talk' }] : [])].map((b: any) => (
                <Pressable key={b.l} onPress={b.on} accessibilityLabel={b.l} style={{ alignItems: 'center', gap: 4 }}>
                  <View style={s.railBtn}>{b.moji ? <VibeMoji id={b.moji} size={30} /> : <Icon name={b.i} size={26} color="#fff" />}</View>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{b.n}</Text>
                </Pressable>))}
            </View>
            <View style={s.reelInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Avatar name={c.name} hue={c.hue} size={38} ring />
                <Text style={{ color: '#fff', fontWeight: '900' }}>{c.handle}</Text>
                <Pressable onPress={() => st.follow(p.by)} style={s.followBtn}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{followLabel(st, p.by)}</Text></Pressable>
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
  const [i, setI] = useState(Number(route?.params?.start ?? 0)); const [prog, setProg] = useState(0); const [sent, setSent] = useState<number | null>(null); const [sentMsg, setSentMsg] = useState<string | null>(null);
  const sp = st.sparks[i]; const c = sp ? creator(sp.by) : null;
  useEffect(() => { if (!sp) return; st.seeSpark(sp.id); setProg(0); setSent(null); const t = setInterval(() => setProg(p => p + 0.02), 100); return () => clearInterval(t); }, [i]);
  useEffect(() => { if (prog >= 1) i < st.sparks.length - 1 ? setI(i + 1) : navigation.goBack(); }, [prog]);
  if (!sp || !c) return null;
  const vote = st.votes[sp.id];
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={StyleSheet.absoluteFill}>{isVideoUrl(sp.mediaUrl) ? <VideoClip key={sp.id} uri={mediaUri(sp.mediaUrl)!} lens={sp.lens} city={sp.place} h={2000} /> : <Media uri={mediaUri(sp.mediaUrl)} hue={sp.hue} lens={sp.lens} city={sp.place} h={2000} />}</View>
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
      <SparkExtras id={sp.id} mine={sp.by === 'me'} bottom={ins.bottom + 140} onSent={m => setSentMsg(m)} />
      {sentMsg ? <Text style={[s.sentT, { bottom: ins.bottom + 196 }]}>{sentMsg}</Text> : null}
      {sent ? <Text style={[s.sentT, { bottom: ins.bottom + 84 }]}>Reaction sent to {c.name.split(' ')[0]}</Text> : null}
      {online() && sp.by !== 'me' && !sent ? <Pressable onPress={() => chat.newConv([sp.by]).then(cv => navigation.navigate('ChatRoom', { id: cv.id })).catch(() => {})} style={[s.replyChat, { bottom: ins.bottom + 84 }]} accessibilityRole="button"><Icon name="chat" size={16} color="#fff" /><Text style={{ color: '#fff', fontWeight: '800' }}>Reply in Chat</Text></Pressable> : null}
    </View>
  );
}

export { NewPost } from './Studio';

const s = StyleSheet.create({
  logo: { fontSize: 26, fontWeight: '900', letterSpacing: -1, color: C.ink },
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
  burstSmall: { position: 'absolute', top: '35%', alignSelf: 'center' },
  replyChat: { position: 'absolute', right: 16, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(18,15,36,0.7)', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  sparkCenter: { position: 'absolute', top: '30%', left: 24, right: 24, alignItems: 'center' }, sparkText: { color: '#fff', fontSize: 30, fontWeight: '900', textAlign: 'center', letterSpacing: -0.8 },
  poll: { marginTop: 24, width: '100%', backgroundColor: '#fff', borderRadius: 24, padding: 16 },
  pollOpt: { height: 48, borderRadius: 16, borderWidth: 1, borderColor: C.line, marginTop: 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, overflow: 'hidden' },
  pollFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  sparkReact: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'rgba(18,15,36,0.55)', borderRadius: 999, padding: 6 },
  sparkMoji: { padding: 4, borderRadius: 20 }, sentT: { position: 'absolute', alignSelf: 'center', color: '#fff', fontWeight: '800', backgroundColor: 'rgba(18,15,36,0.7)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, overflow: 'hidden' },
  swatch: { width: 40, height: 40, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  notice: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 16, backgroundColor: '#FFF4EA', marginVertical: 12 },
});
