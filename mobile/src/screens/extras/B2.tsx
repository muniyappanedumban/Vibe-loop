// Add-on batch 2 (Glow): Vibe Meter · Streak Garden · Micro Challenges · Spotlight Wall · Hot Take Duels · Gratitude Jar.
// Every screen talks to /addons/b2/* — the server enforces each switch (addons.glow.*) and every rule.
import React, { useCallback, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { C, S, T } from '../../theme/tokens';
import { Screen, Header, Card, Row, Section, Btn, Field, Chip, Tag, Bar, useToast } from '../../components/UI';
import { call } from '../../lib/api';
import { ago } from '../../lib/util';

export type AddonEntry = { route: string; title: string; sub: string; icon: string; module: 'glow' | 'hush'; flag: string; needsConv?: boolean };
type U = { id: string; name: string; handle: string } | null;

function useLoad<X>(path: string | null): [X | null, string | null, () => void] {
  const [d, setD] = useState<X | null>(null); const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => { if (!path) return; setErr(null); call<X>('GET', path).then(setD).catch(e => setErr(e.message)); }, [path]);
  useFocusEffect(load);
  return [d, err, load];
}
const Wait = ({ err, retry }: { err: string | null; retry: () => void }) => err
  ? <Card><Text style={T.body}>{err}</Text><Btn small kind="ghost" title="Try again" onPress={retry} style={{ marginTop: 10 }} /></Card>
  : <ActivityIndicator style={{ marginTop: 30 }} color={C.violet} />;
const Empty = ({ text }: { text: string }) => <Text style={T.small}>{text}</Text>;
function useAct(show: (m: string, k?: 'ok' | 'err') => void, after: () => void) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<any>, ok?: string) => { setBusy(true); try { await fn(); after(); if (ok) show(ok); } catch (e: any) { show(e.message, 'err'); } finally { setBusy(false); } };
  return { busy, run };
}

// ---------------- Vibe Meter ----------------
type Vibe = { postId: string; count: number; average: number | null; distribution: number[]; mine: number | null };
type VPost = { id: string; text: string; author: U; mine: boolean; vibe: Vibe };
const STEPS = [0, 25, 50, 75, 100];
const FEEL = ['Meh', 'Okay', 'Good', 'Great', 'Wow'];
export function VibeMeter() {
  const { toast, show } = useToast(); const [d, err, reload] = useLoad<VPost[]>('/addons/b2/vibe-posts'); const { busy, run } = useAct(show, reload);
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Vibe Meter" sub="How did a post make you feel? 0–100, one vote each" />
    {!d ? <Wait err={err} retry={reload} /> : !d.length ? <Card><Empty text="No posts to rate yet." /></Card> : d.map(p => <Card key={p.id} style={{ marginBottom: S.md }}>
      <Text style={T.tiny}>{p.author?.name ?? 'Someone'}{p.mine ? ' · YOUR POST' : ''}</Text>
      <Text style={[T.body, { marginTop: 4 }]} numberOfLines={3}>{p.text || '(media post)'}</Text>
      <Text style={[T.small, { marginTop: 8 }]}>{p.vibe.count ? `Average ${p.vibe.average} · ${p.vibe.count} vote${p.vibe.count === 1 ? '' : 's'}` : 'No votes yet'}</Text>
      {p.vibe.count ? <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>{p.vibe.distribution.map((n, i) => <View key={i} style={{ flex: 1 }}>
        <Bar pct={Math.round(100 * n / p.vibe.count)} /><Text style={T.tiny}>{i * 20}+ · {n}</Text></View>)}</View> : null}
      {!p.mine ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        {STEPS.map((v, i) => <Chip key={v} label={`${FEEL[i]} ${v}`} active={p.vibe.mine === v} onPress={() => !busy && run(() => call('PUT', `/addons/b2/vibe/${p.id}`, { value: v }), 'Vibe saved')} />)}
        {p.vibe.mine !== null ? <Chip label="Clear" onPress={() => !busy && run(() => call('DELETE', `/addons/b2/vibe/${p.id}`))} /> : null}
      </View> : null}
    </Card>)}
  </Screen>{toast}</View>;
}

// ---------------- Streak Garden ----------------
type Garden = { streak: number; wateredToday: boolean; stage: number; stageName: string; nextStageAt: number | null; stages: string[]; freezesLeft: number; canFreezeYesterday: boolean; days: { day: string; state: string }[] };
const PLANT = ['🟫', '🌰', '🌱', '🪴', '🌷', '🌸', '🌳'];
export function StreakGarden() {
  const { toast, show } = useToast(); const [d, err, reload] = useLoad<Garden>('/addons/b2/garden'); const { busy, run } = useAct(show, reload);
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Streak Garden" sub="Post or answer something each day to water your plant" />
    {!d ? <Wait err={err} retry={reload} /> : <>
      <Card style={{ alignItems: 'center', backgroundColor: C.violetSoft }}>
        <Text style={{ fontSize: 64 }}>{PLANT[d.stage] ?? '🌱'}</Text>
        <Text style={T.h2}>{d.stageName}</Text>
        <Text style={T.small}>{d.streak}-day streak{d.nextStageAt ? ` · next stage at ${d.nextStageAt} days` : ' · fully grown'}</Text>
        <View style={{ marginTop: 8 }}><Tag label={d.wateredToday ? 'WATERED TODAY' : 'THIRSTY — POST TODAY'} color={d.wateredToday ? '#12A27C' : C.pink} /></View>
      </Card>
      <Section title="Last 14 days"><Card><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {d.days.map(x => <View key={x.day} style={{ alignItems: 'center', width: 36 }}><Text style={{ fontSize: 18 }}>{x.state === 'watered' ? '💧' : x.state === 'frozen' ? '❄️' : '·'}</Text><Text style={T.tiny}>{x.day.slice(8)}</Text></View>)}
      </View></Card></Section>
      <Section title="Freeze tokens"><Card>
        <Row icon="shield" title={`${d.freezesLeft} left this month`} sub="Missed yesterday? A freeze keeps your streak alive." />
        {d.canFreezeYesterday ? <Btn title={busy ? 'Freezing…' : 'Freeze yesterday'} disabled={busy || d.freezesLeft <= 0} onPress={() => run(() => call('POST', '/addons/b2/garden/freeze'), 'Yesterday frozen')} />
          : <Empty text="Yesterday is covered — nothing to freeze." />}
      </Card></Section>
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Micro Challenges ----------------
type Entry = { id: string; text: string; mediaUrl: string | null; at: number; user: U; mine: boolean; votes: number; voted: boolean };
type Chal = { id: string; title: string; rules: string; endsAt: number; ended: boolean; entries: number; list?: Entry[]; mine?: Entry | null; winners?: Entry[] };
export function MicroChallenges({ navigation }: any) {
  const [d, err, reload] = useLoad<{ live: Chal[]; past: Chal[] }>('/addons/b2/challenges');
  const item = (c: Chal) => <Row key={c.id} icon="trophy" title={c.title} sub={`${c.entries} entr${c.entries === 1 ? 'y' : 'ies'} · ${c.ended ? 'ended' : 'ends ' + new Date(c.endsAt).toLocaleDateString()}`} onPress={() => navigation.navigate('MicroChallenge', { id: c.id })} />;
  return <Screen><Header title="Micro Challenges" sub="A new challenge from the VibeLoop team every week" />
    {!d ? <Wait err={err} retry={reload} /> : <>
      <Section title="Live now"><Card>{d.live.map(item)}{!d.live.length ? <Empty text="No live challenge right now — check back soon." /> : null}</Card></Section>
      {d.past.length ? <Section title="Past challenges"><Card>{d.past.map(item)}</Card></Section> : null}
    </>}</Screen>;
}
export function MicroChallenge({ route }: any) {
  const id = route?.params?.id as string | undefined;
  const { toast, show } = useToast(); const [d, err, reload] = useLoad<Chal>(id ? `/addons/b2/challenges/${id}` : null); const { busy, run } = useAct(show, reload);
  const [txt, setTxt] = useState(''); const [media, setMedia] = useState('');
  if (!id) return <Screen><Header title="Challenge" /><Card><Empty text="Open a challenge from the list." /></Card></Screen>;
  return <View style={{ flex: 1 }}><Screen>
    <Header title={d?.title ?? 'Challenge'} sub={d ? (d.ended ? 'Ended — winners below' : `Ends ${new Date(d.endsAt).toLocaleString()}`) : ''} />
    {!d ? <Wait err={err} retry={reload} /> : <>
      <Card style={{ backgroundColor: C.violetSoft }}><Text style={T.tiny}>RULES</Text><Text style={[T.body, { marginTop: 4 }]}>{d.rules}</Text></Card>
      {d.ended ? <Section title="Winners"><Card>{(d.winners ?? []).map((e, i) => <Row key={e.id} icon="trophy" title={`#${i + 1} ${e.user?.name ?? 'Someone'}`} sub={`${e.text} · ${e.votes} upvotes`} />)}
        {!(d.winners ?? []).length ? <Empty text="No entries were submitted." /> : null}</Card></Section>
        : <Card style={{ marginTop: S.md }}>
          <Field label={d.mine ? 'Edit your entry' : 'Your entry'} value={txt} onChangeText={setTxt} multiline maxLength={500} placeholder={d.mine?.text ?? 'Describe your entry…'} />
          <Field label="Media URL (optional — upload it first)" value={media} onChangeText={setMedia} maxLength={200} autoCapitalize="none" placeholder="/media/…" />
          <Btn title={busy ? 'Sending…' : d.mine ? 'Update entry' : 'Submit entry'} disabled={busy || !txt.trim()} onPress={() => run(() => call('POST', `/addons/b2/challenges/${id}/entry`, { text: txt.trim(), mediaUrl: media.trim() || null }).then(() => { setTxt(''); setMedia(''); }), 'Entry saved')} />
        </Card>}
      <Section title={`Entries (${d.list?.length ?? 0})`}><Card>
        {(d.list ?? []).map(e => <Row key={e.id} icon={e.mediaUrl ? 'image' : 'text'} title={`${e.user?.name ?? 'Someone'}${e.mine ? ' (you)' : ''}`} sub={`${e.text} · ${ago(e.at)}`}
          right={e.mine || d.ended ? <Tag label={`▲ ${e.votes}`} /> : <Pressable accessibilityRole="button" accessibilityLabel="Upvote" onPress={() => !busy && run(() => call('POST', `/addons/b2/challenges/entries/${e.id}/vote`))}>
            <Tag label={`${e.voted ? '▲' : '△'} ${e.votes}`} color={e.voted ? C.violet : C.inkSoft} bg={e.voted ? C.violetSoft : '#F1F1F4'} /></Pressable>} />)}
        {!(d.list ?? []).length ? <Empty text="No entries yet — be the first." /> : null}
      </Card></Section>
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Spotlight Wall ----------------
type Spot = { id: string; user: U; reason: string; following: boolean; me: boolean };
export function SpotlightWall() {
  const { toast, show } = useToast(); const [d, err, reload] = useLoad<Spot[]>('/addons/b2/spotlight'); const { busy, run } = useAct(show, reload);
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Spotlight Wall" sub="Creators the VibeLoop team wants you to meet" />
    {!d ? <Wait err={err} retry={reload} /> : <Card>
      {d.map(s => <Row key={s.id} icon="star" title={`${s.user?.name ?? 'Creator'} @${s.user?.handle ?? ''}`} sub={s.reason}
        right={s.me ? <Tag label="YOU" /> : <Btn small kind={s.following ? 'ghost' : 'prism'} title={s.following ? 'Following' : 'Follow'} disabled={busy}
          onPress={() => s.user && run(() => call('POST', `/edges/follow/${s.user!.id}`), s.following ? 'Unfollowed' : 'Following')} />} />)}
      {!d.length ? <Empty text="The wall is empty right now — new creators are added often." /> : null}
    </Card>}
  </Screen>{toast}</View>;
}

// ---------------- Hot Take Duels ----------------
type Take = { id: string; side: 'a' | 'b'; argument: string; at: number; user: U; mine: boolean; backers: number; backed: boolean };
type Duel = { id: string; statement: string; sideA: string; sideB: string; at: number; author: U; mineDuel: boolean; countA: number; countB: number; myTake: Take | null; topA?: Take[]; topB?: Take[] };
export function HotTakeDuels({ navigation }: any) {
  const { toast, show } = useToast(); const [d, err, reload] = useLoad<Duel[]>('/addons/b2/duels'); const { busy, run } = useAct(show, reload);
  const [f, setF] = useState({ statement: '', sideA: 'Agree', sideB: 'Disagree' });
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Hot Take Duels" sub="Post a statement — people pick a side and argue it in one line" />
    <Card>
      <Field label="Your hot take" value={f.statement} onChangeText={v => setF({ ...f, statement: v })} maxLength={200} placeholder="Mornings are overrated" />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Field label="Side A" value={f.sideA} onChangeText={v => setF({ ...f, sideA: v })} maxLength={40} /></View>
        <View style={{ flex: 1 }}><Field label="Side B" value={f.sideB} onChangeText={v => setF({ ...f, sideB: v })} maxLength={40} /></View>
      </View>
      <Btn title={busy ? 'Posting…' : 'Start duel'} disabled={busy || f.statement.trim().length < 5} onPress={() => run(() => call('POST', '/addons/b2/duels', { statement: f.statement.trim(), sideA: f.sideA.trim(), sideB: f.sideB.trim() }).then(() => setF({ ...f, statement: '' })), 'Duel started')} />
    </Card>
    <Section title="Duels">{!d ? <Wait err={err} retry={reload} /> : <Card>
      {d.map(x => <Row key={x.id} icon="flame" title={x.statement} sub={`${x.sideA} ${x.countA} · ${x.sideB} ${x.countB} · ${x.author?.name ?? ''}`} onPress={() => navigation.navigate('HotTakeDuel', { id: x.id })} />)}
      {!d.length ? <Empty text="No duels yet — start the first one." /> : null}
    </Card>}</Section>
  </Screen>{toast}</View>;
}
export function HotTakeDuel({ route, navigation }: any) {
  const id = route?.params?.id as string | undefined;
  const { toast, show } = useToast(); const [d, err, reload] = useLoad<Duel>(id ? `/addons/b2/duels/${id}` : null); const { busy, run } = useAct(show, reload);
  const [side, setSide] = useState<'a' | 'b'>('a'); const [arg, setArg] = useState('');
  if (!id) return <Screen><Header title="Duel" /><Card><Empty text="Open a duel from the list." /></Card></Screen>;
  const col = (title: string, takes: Take[] = []) => <Section title={title}><Card>
    {takes.map(t => <Row key={t.id} icon="comment" title={t.argument} sub={`${t.user?.name ?? 'Someone'}${t.mine ? ' (you)' : ''} · ${ago(t.at)}`}
      right={t.mine ? <Tag label={`+${t.backers}`} /> : <Pressable accessibilityRole="button" accessibilityLabel="Back this argument" onPress={() => !busy && run(() => call('POST', `/addons/b2/duels/takes/${t.id}/back`))}>
        <Tag label={`${t.backed ? '★' : '☆'} ${t.backers}`} color={t.backed ? C.violet : C.inkSoft} bg={t.backed ? C.violetSoft : '#F1F1F4'} /></Pressable>} />)}
    {!takes.length ? <Empty text="No arguments on this side yet." /> : null}</Card></Section>;
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Hot Take" sub={d ? `${d.countA + d.countB} people picked a side` : ''} />
    {!d ? <Wait err={err} retry={reload} /> : <>
      <Card style={{ backgroundColor: C.violetSoft }}><Text style={T.h2}>{d.statement}</Text><Text style={T.small}>by {d.author?.name ?? 'someone'}</Text>
        <View style={{ marginTop: 8 }}><Bar pct={d.countA + d.countB ? Math.round(100 * d.countA / (d.countA + d.countB)) : 50} /></View>
        <Text style={T.tiny}>{d.sideA} {d.countA} · {d.sideB} {d.countB}</Text></Card>
      <Card style={{ marginTop: S.md }}>
        <View style={{ flexDirection: 'row', gap: 8 }}><Chip label={d.sideA} active={side === 'a'} onPress={() => setSide('a')} /><Chip label={d.sideB} active={side === 'b'} onPress={() => setSide('b')} /></View>
        <Field label={d.myTake ? `Your take: “${d.myTake.argument}” — change it` : 'Your one-line argument'} value={arg} onChangeText={setArg} maxLength={140} placeholder="Make it count" />
        <Btn title={busy ? 'Sending…' : d.myTake ? 'Update my take' : 'Take this side'} disabled={busy || arg.trim().length < 2} onPress={() => run(() => call('POST', `/addons/b2/duels/${id}/take`, { side, argument: arg.trim() }).then(() => setArg('')), 'Take posted')} />
      </Card>
      {col(`Top for ${d.sideA}`, d.topA)}{col(`Top for ${d.sideB}`, d.topB)}
      {d.mineDuel ? <Btn kind="danger" title="Delete duel" disabled={busy} onPress={() => run(() => call('DELETE', `/addons/b2/duels/${id}`).then(() => navigation.goBack()), 'Deleted')} /> : null}
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Gratitude Jar ----------------
type Note = { id: string; day: string; text: string; at: number };
export function GratitudeJar() {
  const { toast, show } = useToast();
  const [d, err, reload] = useLoad<{ month: string; notes: Note[] }>('/addons/b2/gratitude');
  const [r, , reloadR] = useLoad<{ month: string; notes: number; days: number; allTime: number; throwback: Note | null }>('/addons/b2/gratitude/recap');
  const { busy, run } = useAct(show, () => { reload(); reloadR(); }); const [txt, setTxt] = useState('');
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Gratitude Jar" sub="Private — only you can see these notes" />
    <Card>
      <Field label="Today I'm grateful for…" value={txt} onChangeText={setTxt} multiline maxLength={300} placeholder="A small good thing" />
      <Btn title={busy ? 'Saving…' : 'Drop it in the jar'} disabled={busy || !txt.trim()} onPress={() => run(() => call('POST', '/addons/b2/gratitude', { text: txt.trim() }).then(() => setTxt('')), 'Added to your jar')} />
    </Card>
    {r ? <Section title="This month"><Card>
      <Row icon="heart" title={`${r.notes} note${r.notes === 1 ? '' : 's'} on ${r.days} day${r.days === 1 ? '' : 's'}`} sub={`${r.allTime} in your jar all-time`} />
      {r.throwback ? <Row icon="archive" title="From your jar" sub={`${r.throwback.text} · ${r.throwback.day}`} /> : null}
    </Card></Section> : null}
    <Section title="Notes">{!d ? <Wait err={err} retry={reload} /> : <Card>
      {d.notes.map(n => <Row key={n.id} icon="smile" title={n.text} sub={n.day} right={<Pressable accessibilityRole="button" accessibilityLabel="Delete note" onPress={() => !busy && run(() => call('DELETE', `/addons/b2/gratitude/${n.id}`), 'Removed')}><Tag label="Remove" color={C.inkSoft} bg="#F1F1F4" /></Pressable>} />)}
      {!d.notes.length ? <Empty text="Your jar is empty this month — add the first note." /> : null}
    </Card>}</Section>
  </Screen>{toast}</View>;
}

export const SCREENS: Record<string, React.ComponentType<any>> = {
  VibeMeter, StreakGarden, MicroChallenges, MicroChallenge, SpotlightWall, HotTakeDuels, HotTakeDuel, GratitudeJar,
};
export const ENTRIES: AddonEntry[] = [
  { route: 'VibeMeter', title: 'Vibe Meter', sub: 'Rate how posts made you feel, 0–100', icon: 'motion', module: 'glow', flag: 'glow.vibeMeter' },
  { route: 'StreakGarden', title: 'Streak Garden', sub: 'Daily activity grows your plant', icon: 'flame', module: 'glow', flag: 'glow.streakGarden' },
  { route: 'MicroChallenges', title: 'Micro Challenges', sub: 'Weekly challenge · enter and upvote', icon: 'trophy', module: 'glow', flag: 'glow.microChallenges' },
  { route: 'SpotlightWall', title: 'Spotlight Wall', sub: 'Featured creators to follow', icon: 'star', module: 'glow', flag: 'glow.spotlightWall' },
  { route: 'HotTakeDuels', title: 'Hot Take Duels', sub: 'Pick a side, argue it in one line', icon: 'comment', module: 'glow', flag: 'glow.hotTakeDuels' },
  { route: 'GratitudeJar', title: 'Gratitude Jar', sub: 'Private daily gratitude + monthly recap', icon: 'heart', module: 'glow', flag: 'glow.gratitudeJar' },
];
