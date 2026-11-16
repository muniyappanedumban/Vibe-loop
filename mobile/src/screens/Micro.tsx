// Small Gen-Z features: Comments (paged, like, delete), Love Trail, Save Stack collections, Mood Drop, Share sheet.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Share, FlatList } from 'react-native';
import { C, S, T } from '../theme/tokens';
import { Screen, Header, Card, Btn, Chip, Field, Row, Avatar, useToast, Tag } from '../components/UI';
import { Icon } from '../components/Icon';
import { VibeMoji } from '../components/VibeMoji';
import { Media } from '../components/Lens';
import { mediaUri } from './Studio';
import { SuggestBar, stickerToken, parseSticker } from '../components/SuggestBar';
import { call, online } from '../lib/api';
import { creator, useSocial } from '../store/useSocial';
import { ago } from '../lib/util';
import { VIBEMOJI } from '../lib/vibemoji';

type Cm = { id: string; by: any; text: string; at: number; likes: number; liked?: boolean; mine?: boolean };
export function Comments({ route }: any) {
  const pid = route?.params?.id; const [items, setItems] = useState<Cm[]>([]); const [cursor, setCursor] = useState<string | null>(null); const [txt, setTxt] = useState(''); const { toast, show } = useToast();
  const load = async (more = false) => { const r = await call<any>('GET', `/posts/${pid}/comments${more && cursor ? `?cursor=${cursor}` : ''}`); setItems(x => (more ? [...x, ...r.items] : r.items)); setCursor(r.nextCursor ?? r.next ?? null); };
  useEffect(() => { if (online()) load().catch(e => show(e.message, 'err')); }, [pid]);
  const send = async (text: string) => { if (!text.trim()) return; try { await call('POST', `/posts/${pid}/comments`, { id: 'cm_' + Date.now().toString(36), text }); setTxt(''); load(); } catch (e: any) { show(e.message, 'err'); } };
  return (
    <View style={{ flex: 1 }}><Screen>
      <Header title="Comments" sub="Be kind — Comment Guard is on" />
      {items.map(c => { const u = (c as any).user ?? (typeof c.by === 'string' ? creator(c.by) : c.by); const st = parseSticker(c.text); return (
        <View key={c.id} style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          <Avatar name={u?.name ?? '?'} hue={u?.hue ?? 200} size={34} uri={u?.avatar} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800' }}>{u?.handle ?? 'someone'} <Text style={T.small}>{ago(c.at)}</Text></Text>
            {st ? <VibeMoji id={st.id} size={44} /> : <Text style={{ marginTop: 2, lineHeight: 20 }}>{c.text}</Text>}
            <View style={{ flexDirection: 'row', gap: 14, marginTop: 4 }}>
              <Pressable onPress={() => call('POST', `/comments/${c.id}/like`).then(load)} accessibilityLabel="Like comment"><Text style={[T.small, c.liked && { color: C.violet }]}>♥ {c.likes || ''}</Text></Pressable>
              {c.mine ? <Pressable onPress={() => call('DELETE', `/comments/${c.id}`).then(load).catch(e => show(e.message, 'err'))}><Text style={T.small}>Delete</Text></Pressable> : null}
            </View>
          </View>
        </View>); })}
      {cursor ? <Btn small kind="ghost" title="Load more" onPress={() => load(true)} /> : null}
      {!items.length ? <Text style={T.small}>No comments yet — start it.</Text> : null}
      <SuggestBar text={txt} kind="vibe" onPick={m => send(stickerToken('vibe', m))} />
      <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Field placeholder="Add a comment…" value={txt} onChangeText={setTxt} maxLength={1000} /></View><Btn small title="Post" onPress={() => send(txt)} style={{ marginTop: 6 }} /></View>
    </Screen>{toast}</View>
  );
}

export function LoveTrail({ navigation }: any) {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { if (online()) call<any>('GET', '/me/likes').then(r => setItems(Array.isArray(r) ? r : r.items ?? [])).catch(() => {}); }, []);
  return (
    <Screen>
      <Header title="Love Trail" sub="Everything you reacted to — private to you" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {items.map(p => <Pressable key={p.id} style={{ width: '31.5%' }} onPress={() => navigation.navigate('Comments', { id: p.id })}><Media uri={mediaUri(p.mediaUrl)} hue={p.hue ?? 200} lens={p.lens} h={130} radius={12} /></Pressable>)}
      </View>
      {!items.length ? <Text style={T.small}>React to Drops and they'll show up here.</Text> : null}
    </Screen>
  );
}

export function SaveStack({ navigation, route }: any) {
  const add = route?.params?.add as string | undefined; const [cols, setCols] = useState<any[]>([]); const [name, setName] = useState(''); const { toast, show } = useToast();
  const load = () => call<any[]>('GET', '/collections').then(setCols).catch(e => show(e.message, 'err'));
  useEffect(() => { if (online()) load(); }, []);
  return (
    <View style={{ flex: 1 }}><Screen>
      <Header title="Save Stack" sub={add ? 'Pick a stack for this Drop' : 'Your collections'} />
      <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Field placeholder="New stack name (e.g. Food spots)" value={name} onChangeText={setName} maxLength={40} /></View><Btn small title="Create" style={{ marginTop: 6 }} onPress={() => name.trim() && call('POST', '/collections', { name: name.trim() }).then(() => { setName(''); load(); }).catch(e => show(e.message, 'err'))} /></View>
      {cols.map(c => (
        <Card key={c.id} style={{ marginBottom: 10 }} onPress={add ? () => call('POST', `/collections/${c.id}/items`, { postId: add }).then(() => { show(`Saved to ${c.name}`); setTimeout(() => navigation.goBack(), 600); }).catch(e => show(e.message, 'err')) : undefined}>
          <Row icon="bookmark" title={c.name} sub={`${c.count ?? (c.items?.length ?? 0)} saved`} right={add ? <Tag label="ADD HERE" /> : undefined} />
        </Card>))}
      {!cols.length ? <Text style={T.small}>No stacks yet — create one above.</Text> : null}
    </Screen>{toast}</View>
  );
}

export function MoodDrop({ navigation }: any) {
  const [moji, setMoji] = useState(118); const [text, setText] = useState(''); const { toast, show } = useToast();
  return (
    <View style={{ flex: 1 }}><Screen>
      <Header title="Mood Drop" sub="Today's vibe in one emoji · lasts 24h" />
      <View style={{ alignItems: 'center', marginVertical: 12 }}><VibeMoji id={moji} size={110} /></View>
      <FlatList data={VIBEMOJI.slice(0, 60)} numColumns={10} scrollEnabled={false} keyExtractor={m => String(m.id)} renderItem={({ item }) => <Pressable onPress={() => setMoji(item.id)} style={{ padding: 2, borderRadius: 8, backgroundColor: moji === item.id ? C.violetSoft : 'transparent' }} accessibilityLabel={item.name}><VibeMoji id={item.id} size={30} /></Pressable>} />
      <View style={{ marginTop: S.lg }}><Field label="Say it in a few words (optional)" value={text} onChangeText={setText} maxLength={40} placeholder="locked in" /></View>
      <Btn title="Drop my mood" icon="smile" onPress={() => call('PUT', '/me/mood', { moji, text }).then(() => { show('Mood dropped for 24h'); setTimeout(() => navigation.goBack(), 600); }).catch(e => show(e.message, 'err'))} />
    </Screen>{toast}</View>
  );
}

/** Share sheet: send in Hush (Post2Chat) or share a link outside the app. */
export async function shareOutside(post: { id: string; text: string }) {
  const url = `https://vibeloop.app/d/${post.id}`;
  await Share.share({ message: `${post.text.slice(0, 80)} — ${url}` }).catch(() => {});
  if (online()) call('POST', `/posts/${post.id}/share`, { to: 'external' }).catch(() => {});
}
