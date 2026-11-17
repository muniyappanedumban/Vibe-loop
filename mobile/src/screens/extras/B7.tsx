// Add-on batch 7 (Hush): Chore Rotation · Watch Queue · Secret Santa · Lend Log · Habit Buddies · Trip Planner.
// Every screen talks to /addons/b7/* — the server enforces membership, turns and the admin switches (addons.hush.*).
import React, { useCallback, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { C, S, T } from '../../theme/tokens';
import { Screen, Header, Card, Row, Section, Btn, Field, Chip, useToast, Tag } from '../../components/UI';
import { call } from '../../lib/api';
import { ago, DAY } from '../../lib/util';
import { useConfig } from '../../lib/config';

export type AddonEntry = { route: string; title: string; sub: string; icon: string; module: 'glow' | 'hush'; flag: string; needsConv?: boolean };
type U = { id: string; name: string; handle: string } | null;

function useLoad<X>(path: string | null): [X | null, string | null, () => void] {
  const [d, setD] = useState<X | null>(null); const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => { if (!path) { setErr('Open this from a chat'); return; } setErr(null); call<X>('GET', path).then(setD).catch(e => setErr(e.message)); }, [path]);
  useFocusEffect(load);
  return [d, err, load];
}
const Wait = ({ err, retry }: { err: string | null; retry: () => void }) => err
  ? <Card><Text style={T.body}>{err}</Text><Btn small kind="ghost" title="Try again" onPress={retry} style={{ marginTop: 10 }} /></Card>
  : <ActivityIndicator style={{ marginTop: 30 }} color={C.violet} />;
const Empty = ({ text }: { text: string }) => <Card><Text style={T.small}>{text}</Text></Card>;
const isOn = (k: string) => (useConfig.getState().cfg as any)?.addons?.hush?.[k] !== false;
const Off = ({ title }: { title: string }) => <Screen><Header title={title} /><Empty text={`${title} is switched off right now.`} /></Screen>;
const day = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
function useAct(reload: () => void) {
  const { toast, show } = useToast(); const [busy, setBusy] = useState(false);
  const run = async (m: string, p: string, body?: any, ok?: string) => {
    setBusy(true); try { await call(m, p, body); if (ok) show(ok); reload(); return true; } catch (e: any) { show(e.message, 'err'); return false; } finally { setBusy(false); }
  };
  return { toast, run, busy };
}

// ---------------- Chore Rotation ----------------
type Chore = { id: string; title: string; everyDays: number; dueAt: number; overdue: boolean; onDuty: U; myTurn: boolean; next: U; rota: U[]; lastBy: U; lastAt: number | null; mine: boolean };
export function ChoreRotation({ route }: any) {
  const cid = route?.params?.convId; const [d, err, reload] = useLoad<Chore[]>(cid ? `/addons/b7/convs/${cid}/chores` : null);
  const { toast, run, busy } = useAct(reload); const [title, setTitle] = useState(''); const [every, setEvery] = useState(7);
  if (!isOn('choreRotation')) return <Off title="Chore Rotation" />;
  const add = async () => { if (await run('POST', `/addons/b7/convs/${cid}/chores`, { title: title.trim(), everyDays: every }, 'Rotation started')) setTitle(''); };
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Chore Rotation" sub="Take turns — done passes it on" />
    <Card><Field label="New chore" value={title} onChangeText={setTitle} maxLength={80} placeholder="Take the bins out" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: S.md }}>{[1, 3, 7, 14, 30].map(n => <Chip key={n} label={n === 1 ? 'Daily' : `Every ${n} days`} active={every === n} onPress={() => setEvery(n)} />)}</View>
      <Btn title="Start rotation" icon="loops" disabled={busy || !title.trim() || !cid} onPress={add} /></Card>
    <Section title="Chores">{!d ? <Wait err={err} retry={reload} /> : !d.length ? <Empty text="No chores yet. Everyone in the chat joins the rotation." /> : d.map(x => <Card key={x.id} style={{ marginBottom: S.sm }}>
      <Row icon="loops" tint={x.overdue ? C.danger : C.violet} title={x.title} sub={`${x.myTurn ? 'Your turn' : `${x.onDuty?.name ?? '—'}'s turn`} · due ${day(x.dueAt)}${x.next ? ` · then ${x.next.name}` : ''}`}
        right={x.overdue ? <Tag label="OVERDUE" color={C.danger} bg="#FDE8EA" /> : undefined} />
      <Text style={T.tiny}>Order: {x.rota.map(r => r?.name).join(' → ')}{x.lastBy ? ` · last done by ${x.lastBy.name} ${x.lastAt ? ago(x.lastAt) : ''}` : ''}</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: S.sm }}>
        {x.myTurn ? <Btn small title="Mark done" icon="check" disabled={busy} onPress={() => run('POST', `/addons/b7/chores/${x.id}/done`, undefined, 'Done — passed to the next person')} style={{ flex: 1 }} /> : null}
        {x.mine ? <Btn small kind="ghost" title="Delete" icon="trash" disabled={busy} onPress={() => run('DELETE', `/addons/b7/chores/${x.id}`, undefined, 'Chore removed')} /> : null}
      </View></Card>)}</Section>
  </Screen>{toast}</View>;
}

// ---------------- Watch Queue ----------------
type W = { id: string; title: string; kind: string; addedBy: U; votes: number; voted: boolean; watched: boolean; avg: number | null; ratings: number; myRating: number | null; mine: boolean };
const Stars = ({ v, onPick }: { v: number | null; onPick: (n: number) => void }) => <View style={{ flexDirection: 'row', gap: 2 }}>
  {[1, 2, 3, 4, 5].map(n => <Pressable key={n} onPress={() => onPick(n)} accessibilityRole="button" accessibilityLabel={`${n} stars`} hitSlop={4}><Text style={{ fontSize: 20, color: (v ?? 0) >= n ? C.violet : C.inkSoft }}>{(v ?? 0) >= n ? '★' : '☆'}</Text></Pressable>)}</View>;
export function WatchQueue({ route }: any) {
  const cid = route?.params?.convId; const [d, err, reload] = useLoad<{ queue: W[]; watched: W[] }>(cid ? `/addons/b7/convs/${cid}/watch` : null);
  const { toast, run, busy } = useAct(reload); const [title, setTitle] = useState(''); const [kind, setKind] = useState('movie'); const [rate, setRate] = useState<string | null>(null);
  if (!isOn('watchQueue')) return <Off title="Watch Queue" />;
  const add = async () => { if (await run('POST', `/addons/b7/convs/${cid}/watch`, { title: title.trim(), kind }, 'Added to the queue')) setTitle(''); };
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Watch Queue" sub="What to watch together next" />
    <Card><Field label="Add a title" value={title} onChangeText={setTitle} maxLength={120} placeholder="Movie or show name" />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: S.md }}><Chip label="Movie" icon="film" active={kind === 'movie'} onPress={() => setKind('movie')} /><Chip label="Show" icon="play" active={kind === 'show'} onPress={() => setKind('show')} /></View>
      <Btn title="Add" disabled={busy || !title.trim() || !cid} onPress={add} /></Card>
    {!d ? <Wait err={err} retry={reload} /> : <>
      <Section title="Up next">{!d.queue.length ? <Empty text="Queue is empty — add something above." /> : <Card>{d.queue.map(w => <View key={w.id}>
        <Row icon={w.kind === 'show' ? 'play' : 'film'} title={w.title} sub={`Added by ${w.addedBy?.name ?? 'someone'}`}
          right={<Pressable onPress={() => run('POST', `/addons/b7/watch/${w.id}/vote`)} accessibilityRole="button" accessibilityLabel="Upvote"><Tag label={`▲ ${w.votes}`} color={w.voted ? C.violet : C.inkSoft} bg={w.voted ? C.violetSoft : '#F1F1F4'} /></Pressable>} />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: S.sm }}>
          <Btn small kind="ghost" title={rate === w.id ? 'Pick stars' : 'Watched it'} icon="check" onPress={() => setRate(rate === w.id ? null : w.id)} />
          {w.mine ? <Btn small kind="ghost" title="Remove" icon="trash" onPress={() => run('DELETE', `/addons/b7/watch/${w.id}`, undefined, 'Removed')} /> : null}
        </View>
        {rate === w.id ? <Stars v={null} onPick={n => { setRate(null); run('POST', `/addons/b7/watch/${w.id}/rate`, { stars: n }, 'Rated — moved to Watched'); }} /> : null}
      </View>)}</Card>}</Section>
      <Section title="Watched">{!d.watched.length ? <Empty text="Nothing watched yet." /> : <Card>{d.watched.map(w => <View key={w.id}>
        <Row icon="star" title={w.title} sub={`${w.avg ?? '—'}★ average · ${w.ratings} rating${w.ratings === 1 ? '' : 's'}`} right={<Stars v={w.myRating} onPick={n => run('POST', `/addons/b7/watch/${w.id}/rate`, { stars: n }, 'Rating saved')} />} />
      </View>)}</Card>}</Section>
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Secret Santa ----------------
type Santa = { id: string; title: string; budget: string; status: string; organiser: U; isOrganiser: boolean; joined: boolean; members: U[]; myMatch: U };
export function SecretSanta({ route }: any) {
  const cid = route?.params?.convId; const [d, err, reload] = useLoad<Santa[]>(cid ? `/addons/b7/convs/${cid}/santa` : null);
  const { toast, run, busy } = useAct(reload); const [title, setTitle] = useState(''); const [budget, setBudget] = useState('');
  if (!isOn('secretSanta')) return <Off title="Secret Santa" />;
  const make = async () => { if (await run('POST', `/addons/b7/convs/${cid}/santa`, { title: title.trim(), budget: budget.trim() }, 'Draw opened')) { setTitle(''); setBudget(''); } };
  const act = (s: Santa, action: string, ok: string) => run('POST', `/addons/b7/santa/${s.id}`, { action }, ok);
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Secret Santa" sub="Group gift draw — only you see your match" />
    <Card><Field label="Draw name" value={title} onChangeText={setTitle} maxLength={80} placeholder="Year-end gifts" />
      <Field label="Budget (optional)" value={budget} onChangeText={setBudget} maxLength={40} placeholder="₹500" />
      <Btn title="Open a draw" icon="gift" disabled={busy || !title.trim() || !cid} onPress={make} /></Card>
    <Section title="Draws">{!d ? <Wait err={err} retry={reload} /> : !d.length ? <Empty text="No draws yet. Needs a group chat of 3 or more." /> : d.map(s => <Card key={s.id} style={{ marginBottom: S.sm }}>
      <Row icon="gift" title={s.title} sub={`${s.budget ? s.budget + ' · ' : ''}by ${s.organiser?.name ?? '—'} · ${s.members.length} joined`} right={<Tag label={s.status === 'drawn' ? 'DRAWN' : 'OPEN'} />} />
      <Text style={T.tiny}>{s.members.map(m => m?.name).join(', ')}</Text>
      {s.status === 'drawn' ? (s.myMatch ? <Card style={{ backgroundColor: C.violetSoft, marginTop: S.sm }}><Text style={T.tiny}>YOU’RE GIFTING</Text><Text style={T.h2}>{s.myMatch.name}</Text></Card>
        : <Text style={[T.small, { marginTop: S.sm }]}>You weren’t in this draw.</Text>)
        : <View style={{ flexDirection: 'row', gap: 8, marginTop: S.sm }}>
          {!s.joined ? <Btn small title="Join" disabled={busy} onPress={() => act(s, 'join', 'You’re in')} style={{ flex: 1 }} /> : !s.isOrganiser ? <Btn small kind="ghost" title="Leave" disabled={busy} onPress={() => act(s, 'leave', 'Left the draw')} style={{ flex: 1 }} /> : null}
          {s.isOrganiser ? <Btn small title="Draw names" icon="spark" disabled={busy || s.members.length < 3} onPress={() => act(s, 'draw', 'Drawn — everyone can see their match')} style={{ flex: 1 }} /> : null}
        </View>}
      {s.isOrganiser ? <Btn small kind="ghost" title="Delete draw" icon="trash" disabled={busy} onPress={() => run('DELETE', `/addons/b7/santa/${s.id}`, undefined, 'Draw deleted')} style={{ marginTop: 8 }} /> : null}
    </Card>)}</Section>
  </Screen>{toast}</View>;
}

// ---------------- Lend Log ----------------
type Lend = { id: string; item: string; dueAt: number | null; returned: boolean; overdue: boolean; lender: U; borrower: U; iLent: boolean; remindedAt: number | null };
export function LendLog({ route }: any) {
  const cid = route?.params?.convId; const [d, err, reload] = useLoad<{ entries: Lend[]; members: U[] }>(cid ? `/addons/b7/convs/${cid}/lends` : null);
  const { toast, run, busy } = useAct(reload);
  const [item, setItem] = useState(''); const [other, setOther] = useState<string | null>(null); const [dir, setDir] = useState('lent'); const [due, setDue] = useState<number | null>(7);
  if (!isOn('lendLog')) return <Off title="Lend Log" />;
  const add = async () => { if (await run('POST', `/addons/b7/convs/${cid}/lends`, { item: item.trim(), other, direction: dir, dueAt: due ? Date.now() + due * DAY : null }, 'Logged')) setItem(''); };
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Lend Log" sub="Who has what, and when it comes back" />
    {!d ? <Wait err={err} retry={reload} /> : <>
      <Card><Field label="Item" value={item} onChangeText={setItem} maxLength={120} placeholder="Camping tent" />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: S.sm }}><Chip label="I lent" active={dir === 'lent'} onPress={() => setDir('lent')} /><Chip label="I borrowed" active={dir === 'borrowed'} onPress={() => setDir('borrowed')} /></View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: S.sm }}>{d.members.map(m => m && <Chip key={m.id} label={m.name} icon="user" active={other === m.id} onPress={() => setOther(m.id)} />)}</View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: S.md }}>{[null, 3, 7, 14, 30].map(n => <Chip key={String(n)} label={n ? `Back in ${n}d` : 'No due date'} active={due === n} onPress={() => setDue(n)} />)}</View>
        <Btn title="Log it" icon="book" disabled={busy || !item.trim() || !other} onPress={add} /></Card>
      <Section title="Entries">{!d.entries.length ? <Empty text="Nothing lent or borrowed yet." /> : <Card>{d.entries.map(x => <View key={x.id} style={{ marginBottom: S.sm }}>
        <Row icon={x.returned ? 'check' : 'archive'} tint={x.overdue ? C.danger : x.returned ? C.inkSoft : C.violet} title={x.item}
          sub={`${x.iLent ? `Lent to ${x.borrower?.name}` : `Borrowed from ${x.lender?.name}`}${x.returned ? ' · returned' : x.dueAt ? ` · due ${day(x.dueAt)}` : ''}`}
          right={x.overdue ? <Tag label="OVERDUE" color={C.danger} bg="#FDE8EA" /> : undefined} />
        {x.iLent ? <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn small kind="ghost" title={x.returned ? 'Not returned' : 'Got it back'} icon="check" disabled={busy} onPress={() => run('POST', `/addons/b7/lends/${x.id}/returned`, undefined, 'Updated')} />
          {!x.returned ? <Btn small kind="ghost" title="Remind" icon="bell" disabled={busy} onPress={() => run('POST', `/addons/b7/lends/${x.id}/remind`, undefined, 'Reminder sent')} /> : null}
          <Btn small kind="ghost" title="" icon="trash" disabled={busy} onPress={() => run('DELETE', `/addons/b7/lends/${x.id}`, undefined, 'Deleted')} />
        </View> : null}
      </View>)}</Card>}</Section>
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Habit Buddies ----------------
type Habit = { id: string; title: string; status: string; buddy: U; invitedMe: boolean; meToday: boolean; buddyToday: boolean; streak: number; bothDays: number; week: { day: string; me: boolean; buddy: boolean }[] };
export function HabitBuddies() {
  const [d, err, reload] = useLoad<Habit[]>('/addons/b7/habits'); const [fr] = useLoad<{ friends: { id: string; name: string }[] }>('/friends');
  const { toast, run, busy } = useAct(reload); const [title, setTitle] = useState(''); const [buddy, setBuddy] = useState<string | null>(null);
  if (!isOn('habitBuddies')) return <Off title="Habit Buddies" />;
  const add = async () => { if (await run('POST', '/addons/b7/habits', { title: title.trim(), buddy }, 'Invite sent')) setTitle(''); };
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Habit Buddies" sub="A streak only counts when you both show up" />
    <Card><Field label="Habit" value={title} onChangeText={setTitle} maxLength={80} placeholder="Read 20 pages" />
      <Text style={[T.tiny, { marginBottom: 6 }]}>BUDDY (FROM YOUR SQUAD)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: S.md }}>{!fr ? <ActivityIndicator color={C.violet} /> : !fr.friends.length ? <Text style={T.small}>Add friends first.</Text> : fr.friends.map(f => <Chip key={f.id} label={f.name} active={buddy === f.id} onPress={() => setBuddy(f.id)} />)}</View>
      <Btn title="Invite buddy" icon="users" disabled={busy || !title.trim() || !buddy} onPress={add} /></Card>
    <Section title="Shared habits">{!d ? <Wait err={err} retry={reload} /> : !d.length ? <Empty text="No shared habits yet." /> : d.map(h => <Card key={h.id} style={{ marginBottom: S.sm }}>
      <Row icon="flame" title={h.title} sub={`with ${h.buddy?.name ?? '—'}${h.status === 'pending' ? (h.invitedMe ? ' · invited you' : ' · waiting for them') : ''}`} right={<Tag label={`🔥 ${h.streak}`} />} />
      {h.status === 'active' ? <>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: S.sm }}>{h.week.map(w => <View key={w.day} style={{ alignItems: 'center' }}>
          <Text style={T.tiny}>{w.day.slice(8)}</Text><View style={{ width: 22, height: 22, borderRadius: 11, marginTop: 2, backgroundColor: w.me && w.buddy ? C.violet : w.me || w.buddy ? C.violetSoft : '#F1F1F4' }} /></View>)}</View>
        <Text style={T.small}>You {h.meToday ? '✓' : '·'}  {h.buddy?.name} {h.buddyToday ? '✓' : '·'} today · {h.bothDays} days together</Text>
        {!h.meToday ? <Btn small title="Check in today" icon="check" disabled={busy} onPress={() => run('POST', `/addons/b7/habits/${h.id}/checkin`, undefined, 'Checked in')} style={{ marginTop: S.sm }} /> : null}
      </> : h.invitedMe ? <Btn small title="Accept" disabled={busy} onPress={() => run('POST', `/addons/b7/habits/${h.id}/accept`, undefined, 'Let’s go')} style={{ marginTop: S.sm }} /> : null}
      <Btn small kind="ghost" title={h.status === 'pending' && !h.invitedMe ? 'Cancel invite' : h.invitedMe ? 'Decline' : 'End habit'} disabled={busy} onPress={() => run('DELETE', `/addons/b7/habits/${h.id}`, undefined, 'Removed')} style={{ marginTop: 8 }} />
    </Card>)}</Section>
  </Screen>{toast}</View>;
}

// ---------------- Trip Planner ----------------
type Stop = { id: string; time: string; title: string; note: string };
type Trip = { id: string; mine: boolean; title: string; createdBy: U; days: { id: string; label: string; items: Stop[] }[]; stops: number };
export function TripPlanner({ route }: any) {
  const cid = route?.params?.convId; const [d, err, reload] = useLoad<Trip[]>(cid ? `/addons/b7/convs/${cid}/trips` : null);
  const { toast, run, busy } = useAct(reload); const [title, setTitle] = useState(''); const [n, setN] = useState('2');
  const [open, setOpen] = useState<string | null>(null); const [f, setF] = useState<{ dayId: string; time: string; title: string; note: string } | null>(null);
  if (!isOn('tripPlanner')) return <Off title="Trip Planner" />;
  const make = async () => { if (await run('POST', `/addons/b7/convs/${cid}/trips`, { title: title.trim(), days: Math.max(1, parseInt(n, 10) || 1) }, 'Trip created')) setTitle(''); };
  const patch = (t: Trip, body: any, ok?: string) => run('PATCH', `/addons/b7/trips/${t.id}`, body, ok);
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Trip Planner" sub="Plan the days together" />
    <Card><Field label="Trip name" value={title} onChangeText={setTitle} maxLength={80} placeholder="Hampi weekend" />
      <Field label="Days" value={n} onChangeText={setN} keyboardType="number-pad" maxLength={2} />
      <Btn title="Create trip" icon="compass" disabled={busy || !title.trim() || !cid} onPress={make} /></Card>
    <Section title="Trips">{!d ? <Wait err={err} retry={reload} /> : !d.length ? <Empty text="No trips planned in this chat yet." /> : d.map(t => <Card key={t.id} style={{ marginBottom: S.sm }}>
      <Row icon="compass" title={t.title} sub={`${t.days.length} days · ${t.stops} stops · by ${t.createdBy?.name ?? '—'}`} onPress={() => setOpen(open === t.id ? null : t.id)} />
      {open === t.id ? <>
        {t.days.map(dy => <View key={dy.id} style={{ marginTop: S.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={T.h3}>{dy.label}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}><Btn small kind="ghost" title="+ Stop" onPress={() => setF({ dayId: dy.id, time: '', title: '', note: '' })} />
              {t.days.length > 1 ? <Btn small kind="ghost" title="" icon="trash" disabled={busy} onPress={() => patch(t, { op: 'removeDay', dayId: dy.id }, 'Day removed')} /> : null}</View></View>
          {!dy.items.length ? <Text style={T.small}>No stops yet.</Text> : dy.items.map((it, k) => <Row key={it.id} icon="pin" title={`${it.time ? it.time + ' · ' : ''}${it.title}`} sub={it.note || undefined}
            right={<View style={{ flexDirection: 'row', gap: 10 }}>
              {k > 0 ? <Pressable onPress={() => patch(t, { op: 'moveItem', itemId: it.id, dir: -1 })} accessibilityLabel="Move up" hitSlop={6}><Text style={T.body}>▲</Text></Pressable> : null}
              {k < dy.items.length - 1 ? <Pressable onPress={() => patch(t, { op: 'moveItem', itemId: it.id, dir: 1 })} accessibilityLabel="Move down" hitSlop={6}><Text style={T.body}>▼</Text></Pressable> : null}
              <Pressable onPress={() => patch(t, { op: 'deleteItem', itemId: it.id }, 'Stop removed')} accessibilityLabel="Delete stop" hitSlop={6}><Text style={[T.body, { color: C.danger }]}>✕</Text></Pressable>
            </View>} />)}
          {f?.dayId === dy.id ? <View style={{ marginTop: S.sm }}>
            <Field label="Time (HH:MM, optional)" value={f.time} onChangeText={v => setF({ ...f, time: v })} maxLength={5} placeholder="09:30" />
            <Field label="What" value={f.title} onChangeText={v => setF({ ...f, title: v })} maxLength={100} placeholder="Breakfast at the river café" />
            <Field label="Note" value={f.note} onChangeText={v => setF({ ...f, note: v })} maxLength={300} />
            <Btn small title="Add stop" disabled={busy || !f.title.trim()} onPress={async () => { if (await patch(t, { op: 'addItem', dayId: dy.id, time: f.time.trim(), title: f.title.trim(), note: f.note.trim() }, 'Stop added')) setF(null); }} />
          </View> : null}
        </View>)}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: S.md }}>
          <Btn small kind="ghost" title="Add day" icon="calendar" disabled={busy} onPress={() => patch(t, { op: 'addDay' }, 'Day added')} style={{ flex: 1 }} />
{t.mine ? <Btn small kind="danger" title="Delete trip" disabled={busy} onPress={() => run('DELETE', `/addons/b7/trips/${t.id}`, undefined, 'Trip deleted')} style={{ flex: 1 }} /> : null}
        </View>
      </> : null}
    </Card>)}</Section>
  </Screen>{toast}</View>;
}

export const SCREENS: Record<string, React.ComponentType<any>> = { ChoreRotation, WatchQueue, SecretSanta, LendLog, HabitBuddies, TripPlanner };
export const ENTRIES: AddonEntry[] = [
  { route: 'ChoreRotation', title: 'Chore Rotation', sub: 'Take turns on chores — done passes it on', icon: 'loops', module: 'hush', flag: 'hush.choreRotation', needsConv: true },
  { route: 'WatchQueue', title: 'Watch Queue', sub: 'Shared watch list with votes and ratings', icon: 'film', module: 'hush', flag: 'hush.watchQueue', needsConv: true },
  { route: 'SecretSanta', title: 'Secret Santa', sub: 'Gift draw for group chats', icon: 'gift', module: 'hush', flag: 'hush.secretSanta', needsConv: true },
  { route: 'LendLog', title: 'Lend Log', sub: 'Track what you lent and borrowed', icon: 'book', module: 'hush', flag: 'hush.lendLog', needsConv: true },
  { route: 'HabitBuddies', title: 'Habit Buddies', sub: 'Share a daily habit and a joint streak', icon: 'flame', module: 'hush', flag: 'hush.habitBuddies' },
  { route: 'TripPlanner', title: 'Trip Planner', sub: 'Day-by-day itinerary for the chat', icon: 'compass', module: 'hush', flag: 'hush.tripPlanner', needsConv: true },
];
