// Content hub (admin-managed CMS): Help Hub, House Rules, Privacy Promise, Data Receipt, Our Story, SOS Lane, Hit Us Up,
// Glow/Hush Guide, Get the Apps, The Loopdown / Hush Notes (blog), Fresh Wire (news). Plus Speak Up, Vouches, Real Talk.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Linking, Image } from 'react-native';
import { C, S, T } from '../theme/tokens';
import { Screen, Header, Card, Btn, Chip, Field, Row, Tag, Avatar, useToast, Section, NotReady } from '../components/UI';
import { Icon, IconName } from '../components/Icon';
import { call, online, useSession } from '../lib/api';
import { useConfig } from '../lib/config';
import { creator, useSocial, followLabel } from '../store/useSocial';
import { isVideoUrl } from '../lib/uploads';
import { Media } from '../components/Lens';
import { mediaUri } from './Studio';
import { ago } from '../lib/util';
import { switchModule } from '../components/ModuleSwitch';
import { chat } from '../chat/useChat';

type Page = { slug: string; module: string; kind: string; title: string; summary?: string; body?: string; coverUrl?: string | null; items?: any[]; updatedAt?: number; version?: number };
const ICON: Record<string, IconName> = { 'help-hub': 'bulb', 'hit-us-up': 'chat', 'house-rules': 'book', 'privacy-promise': 'lock', 'data-receipt': 'archive', 'our-story': 'star', 'sos-lane': 'shield', 'glow-guide': 'spark', 'hush-guide': 'chat', 'get-the-apps': 'download' };

/** Minimal, safe markdown: headings, bullets, **bold**, [links](https://…). No HTML is ever rendered. */
export function Prose({ body }: { body: string }) {
  return (<View>{body.split('\n').map((line, i) => {
    if (line.startsWith('## ')) return <Text key={i} style={[T.h3, { marginTop: 14, marginBottom: 4 }]}>{line.slice(3)}</Text>;
    if (line.startsWith('# ')) return <Text key={i} style={[T.h2, { marginTop: 16, marginBottom: 6 }]}>{line.slice(2)}</Text>;
    const bullet = line.startsWith('- '); const raw = bullet ? line.slice(2) : line;
    const parts = raw.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)]+\))/g).filter(Boolean);
    return (<Text key={i} style={{ fontSize: 15, lineHeight: 22, color: C.ink, marginLeft: bullet ? 12 : 0, marginBottom: line.trim() ? 4 : 8 }}>{bullet ? '•  ' : ''}{parts.map((p, j) => {
      const b = /^\*\*(.+)\*\*$/.exec(p); if (b) return <Text key={j} style={{ fontWeight: '800' }}>{b[1]}</Text>;
      const l = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/.exec(p); if (l) return <Text key={j} style={{ color: C.violet, fontWeight: '700' }} onPress={() => Linking.openURL(l[2])}>{l[1]}</Text>;
      return <Text key={j}>{p}</Text>; })}</Text>);
  })}</View>);
}

export function ContentHub({ navigation, route }: any) {
  const module: 'glow' | 'hush' = route?.params?.module === 'hush' ? 'hush' : 'glow'; const f = useConfig(s => s.cfg.features);
  const [pages, setPages] = useState<Page[]>([]); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { Promise.all([call<Page[]>('GET', '/pages?module=glow'), call<Page[]>('GET', '/pages?module=hush')]).then(([a, b]) => { const seen = new Set<string>(); setPages([...a, ...b].filter(p => (seen.has(p.slug) ? false : (seen.add(p.slug), true)))); }).catch(e => setErr(e.message)); }, []);
  const info = pages.filter(p => !['blog', 'news'].includes(p.kind) && (p.kind !== 'links' || f.appLinks !== false));
  return (
    <Screen>
      <Header title="Help & Support" sub="Help Hub, rules, privacy, guides, support & updates" />
      {err ? <NotReady feature="Content Hub" why={err} /> : null}
      <Card style={{ marginBottom: 12, borderColor: C.danger }} onPress={() => navigation.navigate('PageView', { slug: 'sos-lane' })}>
        <Row icon="shield" tint={C.danger} title="SOS Lane" sub="In danger? Call 112 · Cyber crime 1930 · Women helpline 181" />
      </Card>
      <Card>{info.map(p => <Row key={p.slug} icon={ICON[p.slug] ?? 'book'} title={p.title} sub={p.summary} onPress={() => navigation.navigate('PageView', { slug: p.slug })} />)}</Card>
      <Section title="Speak Up">
        <Card><Row icon="flag" tint={C.danger} title="Report something" sub="Harassment, violations, scams, collab disputes" onPress={() => navigation.navigate('SpeakUp')} />
          <Row icon="clock" title="My tickets" sub="Track what happened to your reports" onPress={() => navigation.navigate('SpeakUp', { tab: 'mine' })} /></Card>
      </Section>
      {f.blog !== false || f.news !== false ? <Section title={module === 'glow' ? 'The Loopdown & Fresh Wire' : 'Hush Notes & Fresh Wire'}>
        <Btn kind="ghost" icon="book" title="Read posts & news" onPress={() => navigation.navigate('Blog', { module })} />
      </Section> : null}
    </Screen>
  );
}

export function PageView({ navigation, route }: any) {
  const slug = route?.params?.slug; const [p, setP] = useState<Page | null>(null); const [open, setOpen] = useState<number | null>(0); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { call<Page>('GET', `/pages/${slug}`).then(setP).catch(e => setErr(e.message)); }, [slug]);
  if (err) return <Screen><Header title="Page" /><NotReady feature="This page" why={err} /></Screen>;
  if (!p) return <Screen><Header title="Loading…" /></Screen>;
  return (
    <Screen>
      <Header title={p.title} sub={p.updatedAt ? `Updated ${new Date(p.updatedAt).toDateString()}${p.version ? ` · v${p.version}` : ''}` : undefined} />
      {p.coverUrl ? <Image source={{ uri: mediaUri(p.coverUrl)! }} style={{ height: 160, borderRadius: 18, marginBottom: 12 }} /> : null}
      {p.kind === 'faq' && p.items ? p.items.map((it: any, i: number) => (
        <Card key={i} style={{ marginBottom: 8 }} onPress={() => setOpen(open === i ? null : i)}>
          <Text style={T.h3}>{it.q}</Text>{open === i ? <Text style={{ marginTop: 6, lineHeight: 21 }}>{it.a}</Text> : null}
        </Card>)) : null}
      {p.body ? <Prose body={p.body} /> : null}
      {p.kind === 'links' && p.items ? p.items.map((l: any, i: number) => <Btn key={i} kind="ink" icon="download" title={l.label} style={{ marginTop: 8 }} onPress={() => Linking.openURL(l.url)} />) : null}
      {p.items && p.slug === 'hit-us-up' ? p.items.map((c: any, i: number) => <Row key={i} icon={c.type === 'email' ? 'send' : c.type === 'phone' ? 'chat' : 'link'} title={c.label} sub={c.value} onPress={() => Linking.openURL(c.type === 'email' ? `mailto:${c.value}` : c.type === 'phone' ? `tel:${c.value}` : c.value)} />) : null}
      {p.slug === 'sos-lane' ? <View style={{ gap: 8, marginTop: 12 }}>{[['Emergency', '112'], ['Cyber crime', '1930'], ['Women helpline', '181']].map(([l, n]) => <Btn key={n} kind="danger" icon="shield" title={`Call ${l} · ${n}`} onPress={() => Linking.openURL(`tel:${n}`)} />)}</View> : null}
      {p.slug === 'hit-us-up' || p.slug === 'sos-lane' ? <Btn icon="flag" title="Open a Speak Up ticket" style={{ marginTop: 12 }} onPress={() => navigation.navigate('SpeakUp')} /> : null}
    </Screen>
  );
}

export function Blog({ navigation, route }: any) {
  const module = route?.params?.module ?? 'glow'; const [items, setItems] = useState<Page[]>([]); const [kind, setKind] = useState<'blog' | 'news'>('blog');
  useEffect(() => { call<Page[]>('GET', `/pages?module=${module}&kind=${kind}`).then(setItems).catch(() => setItems([])); }, [module, kind]);
  return (
    <Screen>
      <Header title={kind === 'blog' ? (module === 'hush' ? 'Hush Notes' : 'The Loopdown') : 'Fresh Wire'} sub={kind === 'blog' ? 'Stories from the VibeLoop team' : 'Product news & updates'} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}><Chip label={module === 'hush' ? 'Hush Notes' : 'The Loopdown'} active={kind === 'blog'} onPress={() => setKind('blog')} /><Chip label="Fresh Wire" active={kind === 'news'} onPress={() => setKind('news')} /></View>
      {items.map(p => <Card key={p.slug} style={{ marginBottom: 10 }} onPress={() => navigation.navigate('PageView', { slug: p.slug })}><Text style={T.h3}>{p.title}</Text>{p.summary ? <Text style={[T.small, { marginTop: 4 }]}>{p.summary}</Text> : null}{p.updatedAt ? <Text style={[T.small, { marginTop: 6, fontSize: 11 }]}>{new Date(p.updatedAt).toDateString()}</Text> : null}</Card>)}
      {!items.length ? <Text style={T.small}>Nothing here yet.</Text> : null}
    </Screen>
  );
}

const CATS: [string, string][] = [['harassment', 'Harassment'], ['violation', 'Rule violation'], ['scam', 'Scam / fraud'], ['impersonation', 'Impersonation'], ['collab_dispute', 'Collab dispute'], ['complaint', 'Complaint'], ['self_harm', 'Someone may be at risk'], ['other', 'Other']];
export function SpeakUp({ route }: any) {
  const [tab, setTab] = useState<'new' | 'mine'>(route?.params?.tab === 'mine' ? 'mine' : 'new'); const [cat, setCat] = useState(route?.params?.category ?? 'harassment');
  const [details, setDetails] = useState(''); const [urgent, setUrgent] = useState(false); const [mine, setMine] = useState<any[]>([]); const { toast, show } = useToast();
  const target = route?.params?.target as { type: string; id: string } | undefined;
  useEffect(() => { if (tab === 'mine' && online()) call<any[]>('GET', '/speakup/mine').then(setMine).catch(() => {}); }, [tab]);
  return (
    <View style={{ flex: 1 }}><Screen>
      <Header title="Speak Up" sub="Reports are private. A person on our team reviews them." />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}><Chip label="New report" active={tab === 'new'} onPress={() => setTab('new')} /><Chip label="My tickets" active={tab === 'mine'} onPress={() => setTab('mine')} /></View>
      {tab === 'new' ? (<>
        <Text style={T.tiny}>WHAT'S HAPPENING</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 8 }}>{CATS.map(([k, l]) => <Chip key={k} label={l} active={cat === k} onPress={() => setCat(k)} />)}</View>
        {cat === 'self_harm' ? <Card style={{ borderColor: C.danger, marginBottom: 10 }}><Text style={{ fontWeight: '800' }}>If someone is in immediate danger, call 112 now.</Text><Btn small kind="danger" title="Call 112" style={{ marginTop: 8 }} onPress={() => Linking.openURL('tel:112')} /></Card> : null}
        {target ? <Tag label={`ABOUT ${target.type.toUpperCase()}`} /> : null}
        <View style={{ marginTop: 8 }}><Field label="Details" value={details} onChangeText={setDetails} multiline maxLength={2000} placeholder="What happened? Include @IDs, dates, anything that helps." /></View>
        <Row icon="bolt" title="Mark as urgent" right={<Pressable onPress={() => setUrgent(!urgent)} accessibilityRole="switch" accessibilityState={{ checked: urgent }}><Tag label={urgent ? 'URGENT' : 'NORMAL'} color={urgent ? '#fff' : C.inkSoft} bg={urgent ? C.danger : '#ECE9F5'} /></Pressable>} />
        <Btn title="Send report" icon="flag" onPress={() => { if (details.trim().length < 10) return show('Add a few more details', 'err'); call<any>('POST', '/speakup', { category: cat, targetType: target?.type ?? 'none', targetId: target?.id, details: details.trim(), urgent: urgent || cat === 'self_harm' }).then(r => { show(`Ticket ${r.ticket} opened`); setDetails(''); setTab('mine'); }).catch(e => show(e.message, 'err')); }} />
      </>) : (<>
        {mine.map(t => <Card key={t.id} style={{ marginBottom: 8 }}><Row icon="flag" title={`${t.ticket} · ${t.category.replace('_', ' ')}`} sub={`${t.status}${t.note ? ' · ' + t.note : ''} · ${ago(t.at)}`} right={t.priority === 'urgent' ? <Tag label="URGENT" color="#fff" bg={C.danger} /> : undefined} /></Card>)}
        {!mine.length ? <Text style={T.small}>No tickets yet.</Text> : null}
      </>)}
    </Screen>{toast}</View>
  );
}

/** Public creator profile — the missing "other people's profile" screen. Vouches, Props, Stash, follow, message. */
export function CreatorProfile({ navigation, route }: any) {
  const id = route?.params?.id; const so = useSocial(); const c0 = creator(id); const f = useConfig(s => s.cfg.features);
  const [v, setV] = useState<any>({ avg: null, count: 0, items: [] }); const [rating, setRating] = useState(5); const [txt, setTxt] = useState(''); const { toast, show } = useToast();
  const load = () => call<any>('GET', `/users/${id}/vouches`).then(setV).catch(() => {});
  useEffect(() => { if (online() && f.vouches !== false) load(); }, [id]);
  // Signed in: profile header, follow state and the full Drops grid come from /users/{id}/posts.
  const [srv, setSrv] = useState<{ user: any; items: any[]; locked: boolean } | null>(null);
  useEffect(() => { if (online() && id) call<any>('GET', `/users/${id}/posts`).then(setSrv).catch(() => {}); }, [id, so.following.length, (so.requested ?? []).length]);
  const posts: any[] = srv ? srv.items : so.posts.filter(p => p.by === id);
  const c = (srv?.user ?? c0) as typeof c0;
  const fl0 = followLabel(so, id); const fl = fl0 === 'Follow' && srv?.user?.followState === 'requested' ? 'Requested' : fl0; const following = fl !== 'Follow';
  return (
    <View style={{ flex: 1 }}><Screen>
      <Header title={c.name} sub={`${c.handle} · ${c.city ?? ''}`} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar name={c.name} hue={c.hue} size={76} ring uri={(c as any).avatar} />
        <View style={{ flex: 1 }}><Text style={{ lineHeight: 20 }}>{c.bio}</Text>{v.count ? <Text style={[T.small, { marginTop: 4 }]}>Vouched {Number(v.avg).toFixed(1)}★ by {v.count}</Text> : null}</View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        <Btn small title={fl} kind={following ? 'ghost' : 'prism'} style={{ flex: 1 }} onPress={() => so.follow(id)} />
        {online() ? <Btn small kind="ink" title="Message" icon="chat" style={{ flex: 1 }} onPress={() => chat.newConv([id]).then(cv => navigation.navigate('ChatRoom', { id: cv.id })).catch(e => show(e.message, 'err'))} /> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        {f.money && f.tips ? <Btn small kind="ghost" title="Send Props" icon="star" style={{ flex: 1 }} onPress={() => navigation.navigate('Props', { to: id })} /> : null}
        {f.money && f.store ? <Btn small kind="ghost" title="Their Stash" icon="shop" style={{ flex: 1 }} onPress={() => navigation.navigate('Stash', { creator: id })} /> : null}
        <Btn small kind="ghost" title="Report" icon="flag" style={{ flex: 1 }} onPress={() => navigation.navigate('SpeakUp', { target: { type: 'user', id } })} />
      </View>
      <Section title={`Drops · ${srv?.user?.posts ?? posts.length}`}>
        {srv?.locked ? <Text style={T.small}>This profile is private — follow to see their Drops.</Text> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{posts.map(p => <Pressable key={p.id} style={{ width: '32%' }} onPress={() => navigation.navigate('Comments', { id: p.id })}><Media uri={p.mediaKind === 'video' || isVideoUrl(p.mediaUrl) ? null : mediaUri(p.mediaUrl)} hue={p.hue} lens={p.lens} h={130} radius={12}>{p.mediaKind === 'video' || isVideoUrl(p.mediaUrl) ? <Icon name="play" size={18} color="#fff" /> : null}</Media></Pressable>)}</View>
      </Section>
      {f.vouches !== false ? <Section title={`Vouches · ${v.count}`}>
        {v.items.map((x: any) => <Card key={x.id} style={{ marginBottom: 8 }}><Text style={{ fontWeight: '800' }}>{'★'.repeat(x.rating)}{'☆'.repeat(5 - x.rating)} · {x.by?.handle ?? ''}</Text><Text style={{ marginTop: 4 }}>{x.text}</Text><Text style={[T.small, { marginTop: 4 }]}>{x.context === 'collab' ? 'Collab' : 'Creator'} · {ago(x.at)}</Text></Card>)}
        {online() ? <Card><Text style={T.tiny}>VOUCH FOR {c.name.split(' ')[0].toUpperCase()}</Text>
          <View style={{ flexDirection: 'row', gap: 4, marginVertical: 8 }}>{[1, 2, 3, 4, 5].map(n => <Pressable key={n} onPress={() => setRating(n)} accessibilityLabel={`${n} stars`}><Text style={{ fontSize: 26, color: n <= rating ? C.violet : C.line }}>★</Text></Pressable>)}</View>
          <Field value={txt} onChangeText={setTxt} placeholder="What was it like to collab / follow them?" maxLength={500} multiline />
          <Btn small title="Post vouch" onPress={() => call('POST', '/vouches', { userId: id, rating, text: txt.trim(), context: 'collab' }).then(() => { setTxt(''); show('Vouch posted'); load(); }).catch(e => show(e.message, 'err'))} />
          <Text style={[T.small, { marginTop: 6 }]}>Only people who've actually interacted with them can vouch.</Text></Card> : null}
      </Section> : null}
    </Screen>{toast}</View>
  );
}

/** Product detail with Real Talk (verified-purchase reviews). */
export function ProductView({ navigation, route }: any) {
  const id = route?.params?.id; const f = useConfig(s => s.cfg.features); const [p, setP] = useState<any>(route?.params?.product ?? null); const [r, setR] = useState<any>({ avg: null, count: 0, items: [] });
  const [rating, setRating] = useState(5); const [txt, setTxt] = useState(''); const { toast, show } = useToast();
  const load = () => call<any>('GET', `/store/products/${id}/reviews`).then(setR).catch(() => {});
  useEffect(() => { if (!p) call<any[]>('GET', '/store').then(xs => setP(xs.find(x => x.id === id))).catch(() => {}); if (f.productReviews !== false) load(); }, [id]);
  if (!p) return <Screen><Header title="Product" /></Screen>;
  return (
    <View style={{ flex: 1 }}><Screen>
      <Header title={p.title} sub={`by ${creator(p.creatorId).name}`} />
      <Media uri={mediaUri(p.mediaUrl)} hue={(p.title.length * 37) % 360} h={200} radius={18} />
      <Text style={[T.h1, { marginTop: 12 }]}>{p.price.amount === 0 ? 'Free' : p.price.display}</Text>
      <Text style={{ marginTop: 6, lineHeight: 21 }}>{p.desc}</Text>
      <Btn title={p.price.amount === 0 ? 'Get it' : 'Buy'} style={{ marginTop: 12 }} onPress={() => navigation.navigate('Stash')} />
      {f.productReviews !== false ? <Section title={`Real Talk · ${r.count}${r.avg ? ` · ${Number(r.avg).toFixed(1)}★` : ''}`}>
        {r.items.map((x: any) => <Card key={x.id} style={{ marginBottom: 8 }}><Text style={{ fontWeight: '800' }}>{'★'.repeat(x.rating)}{'☆'.repeat(5 - x.rating)} {x.verifiedPurchase ? '· Verified buyer' : ''}</Text><Text style={{ marginTop: 4 }}>{x.text}</Text></Card>)}
        <Card><View style={{ flexDirection: 'row', gap: 4, marginBottom: 8 }}>{[1, 2, 3, 4, 5].map(n => <Pressable key={n} onPress={() => setRating(n)}><Text style={{ fontSize: 24, color: n <= rating ? C.violet : C.line }}>★</Text></Pressable>)}</View>
          <Field value={txt} onChangeText={setTxt} placeholder="Honest thoughts after using it" maxLength={500} multiline />
          <Btn small title="Post review" onPress={() => call('POST', `/store/products/${id}/reviews`, { rating, text: txt.trim() }).then(() => { setTxt(''); show('Review posted'); load(); }).catch(e => show(e.message, 'err'))} />
          <Text style={[T.small, { marginTop: 6 }]}>Only verified buyers can post Real Talk.</Text></Card>
      </Section> : null}
    </Screen>{toast}</View>
  );
}
