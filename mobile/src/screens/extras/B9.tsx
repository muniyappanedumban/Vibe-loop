// Add-on batch 9 (Hush · chat tools): Confession Box, Time Zone Board, Read-Later Shelf, Study Sprint, Shared Budget, Vote to Pin.
// Every screen needs route.params.convId and talks to /addons/b9/*; the server enforces the addons.hush.* switches.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { C, S, T } from '../../theme/tokens';
import { Screen, Header, Card, Row, Section, Btn, Field, Chip, useToast, Tag, Bar } from '../../components/UI';
import { call } from '../../lib/api';
import { ago } from '../../lib/util';
import { useConfig } from '../../lib/config';

export type AddonEntry = { route: string; title: string; sub: string; icon: string; module: 'glow' | 'hush'; flag: string; needsConv?: boolean };
type U = { id: string; name: string; handle: string } | null;

function useLoad<X>(path: string | null): [X | null, string | null, () => void, (x: X) => void] {
  const [d, setD] = useState<X | null>(null); const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => { if (!path) { setErr('Open this from a chat'); return; } setErr(null); call<X>('GET', path).then(setD).catch(e => setErr(e.message)); }, [path]);
  useFocusEffect(load);
  return [d, err, load, setD];
}
const Wait = ({ err, retry }: { err: string | null; retry: () => void }) => err
  ? <Card><Text style={T.body}>{err}</Text><Btn small kind="ghost" title="Try again" onPress={retry} style={{ marginTop: 10 }} /></Card>
  : <ActivityIndicator style={{ marginTop: 30 }} color={C.violet} />;
const Empty = ({ text }: { text: string }) => <Card><Text style={T.small}>{text}</Text></Card>;
const isOn = (k: string) => (useConfig.getState().cfg as any)?.addons?.hush?.[k] !== false;
const Off = ({ name }: { name: string }) => <Screen><Header title={name} /><Empty text={`${name} is switched off right now.`} /></Screen>;
const money = (minor: number, cur: string) => `${cur === 'INR' ? '₹' : cur + ' '}${(minor / 100).toFixed(2)}`;
const cid = (route: any): string | null => route?.params?.convId ?? null;
function useAct(show: (m: string, k?: 'ok' | 'err') => void) {
  const [busy, setBusy] = useState(false);
  const run = async <R,>(fn: () => Promise<R>, ok?: string): Promise<R | undefined> => {
    setBusy(true); try { const r = await fn(); if (ok) show(ok); return r; } catch (e: any) { show(e.message, 'err'); } finally { setBusy(false); }
  };
  return { busy, run };
}

// ---------------- Confession Box ----------------
type Note = { id: string; text: string; at: number; mine: boolean; reactions: Record<string, number>; myReactions: string[] };
type Box = { id: string; title: string; open: boolean; count: number; at: number; canClose: boolean; createdBy: U; notes?: Note[] };
const REACTS: [string, string][] = [['hug', 'Hug'], ['same', 'Same'], ['wow', 'Wow'], ['laugh', 'Ha']];
export function ConfessionBox({ route }: any) {
  const c = cid(route); const { toast, show } = useToast(); const { busy, run } = useAct(show);
  const [boxes, err, reload] = useLoad<Box[]>(c ? `/addons/b9/convs/${c}/confession-boxes` : null);
  const [openId, setOpenId] = useState<string | null>(null); const [box, setBox] = useState<Box | null>(null);
  const [title, setTitle] = useState(''); const [txt, setTxt] = useState('');
  const loadBox = useCallback((id: string) => call<Box>('GET', `/addons/b9/confession-boxes/${id}`).then(setBox).catch(e => show(e.message, 'err')), [show]);
  useEffect(() => { if (openId) loadBox(openId); else setBox(null); }, [openId, loadBox]);
  if (!isOn('confessionBox')) return <Off name="Confession Box" />;
  const create = () => run(() => call('POST', `/addons/b9/convs/${c}/confession-boxes`, { title: title.trim() }), 'Box opened').then(r => { if (r) { setTitle(''); reload(); } });
  const drop = () => run(() => call('POST', `/addons/b9/confession-boxes/${openId}/notes`, { text: txt.trim() }), 'Dropped anonymously').then(r => { if (r) { setTxt(''); loadBox(openId!); } });
  const react = (n: Note, k: string) => run(() => call('POST', `/addons/b9/confessions/${n.id}/react`, { kind: k })).then(r => r && loadBox(openId!));
  const close = () => run(() => call<Box>('POST', `/addons/b9/confession-boxes/${openId}/close`), 'Box closed').then(r => { if (r) { setBox(r); reload(); } });
  const del = (n: Note) => run(() => call('DELETE', `/addons/b9/confessions/${n.id}`), 'Removed').then(r => r && loadBox(openId!));
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Confession Box" sub="Members never see who wrote a note" />
    {box ? <>
      <Card><Text style={T.h2}>{box.title}</Text><View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}><Tag label={box.open ? 'OPEN' : 'CLOSED'} /><Tag label={`${box.count} notes`} /></View>
        <Btn small kind="ghost" title="Back to boxes" onPress={() => setOpenId(null)} style={{ marginTop: 10 }} /></Card>
      {box.open ? <Card style={{ marginTop: S.md }}><Field label="Your anonymous note" value={txt} onChangeText={setTxt} multiline maxLength={500} placeholder="Say what you couldn't…" />
        <Btn title={busy ? 'Dropping…' : 'Drop note'} disabled={busy || !txt.trim()} onPress={drop} /></Card> : null}
      <Section title="Notes">{!box.notes?.length ? <Empty text="No notes yet." /> : box.notes.map(n => <Card key={n.id} style={{ marginBottom: S.sm }}>
        <Text style={T.body}>{n.text}</Text><Text style={[T.tiny, { marginTop: 4 }]}>{ago(n.at)}{n.mine ? ' · yours' : ''}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {REACTS.map(([k, l]) => <Chip key={k} label={`${l} ${n.reactions[k] || ''}`} active={n.myReactions.includes(k)} onPress={() => react(n, k)} />)}
          {n.mine ? <Chip label="Remove" icon="trash" onPress={() => del(n)} /> : null}</View></Card>)}</Section>
      {box.canClose && box.open ? <Btn kind="danger" title="Close this box" onPress={close} disabled={busy} /> : null}
    </> : !boxes ? <Wait err={err} retry={reload} /> : <>
      <Card><Field label="Open a new box (group chats)" value={title} onChangeText={setTitle} maxLength={80} placeholder="e.g. Things we never said" />
        <Btn title="Open box" disabled={busy || !title.trim()} onPress={create} /></Card>
      <Section title="Boxes">{!boxes.length ? <Empty text="No boxes in this chat yet." /> : <Card>{boxes.map(b =>
        <Row key={b.id} icon="lock" title={b.title} sub={`${b.count} notes · ${b.open ? 'open' : 'closed'} · ${ago(b.at)}`} onPress={() => setOpenId(b.id)} />)}</Card>}</Section>
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Time Zone Board ----------------
type TzP = { user: U; city: string; offsetMin: number; wake: number; sleep: number; localMinute: number };
type Tz = { people: TzP[]; overlapUtcHours: number[]; missing: number };
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fmtOff = (m: number) => `UTC${m < 0 ? '−' : '+'}${hhmm(Math.abs(m))}`;
export function TimeZoneBoard({ route }: any) {
  const c = cid(route); const { toast, show } = useToast(); const { busy, run } = useAct(show);
  const [d, err, reload, setD] = useLoad<Tz>(c ? `/addons/b9/convs/${c}/timezones` : null);
  const [city, setCity] = useState(''); const [off, setOff] = useState(String(-new Date().getTimezoneOffset()));
  const [wake, setWake] = useState('9'); const [sleep, setSleep] = useState('22');
  if (!isOn('timeZoneBoard')) return <Off name="Time Zone Board" />;
  const save = () => run(() => call<Tz>('PUT', `/addons/b9/convs/${c}/timezones`, { city: city.trim(), offsetMin: parseInt(off, 10), wake: parseInt(wake, 10), sleep: parseInt(sleep, 10) }), 'Saved').then(r => r && setD(r));
  const clear = () => run(() => call<Tz>('DELETE', `/addons/b9/convs/${c}/timezones`), 'Removed').then(r => r && setD(r));
  const myOff = -new Date().getTimezoneOffset();
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Time Zone Board" sub="Everyone's clock, and when you're all awake" />
    {!d ? <Wait err={err} retry={reload} /> : <>
      <Section title="Right now">{!d.people.length ? <Empty text="Nobody has shared a city yet — be first." /> : <Card>{d.people.map(p =>
        <Row key={p.user?.id} icon="globe" title={`${p.user?.name ?? '—'} · ${p.city}`} sub={`${fmtOff(p.offsetMin)} · awake ${p.wake}:00–${p.sleep}:00`} right={<Text style={T.h2}>{hhmm(p.localMinute)}</Text>} />)}</Card>}
        {d.missing ? <Text style={[T.tiny, { marginTop: 6 }]}>{d.missing} member{d.missing > 1 ? 's' : ''} haven't shared yet</Text> : null}</Section>
      <Section title="Good overlap (your time)">{!d.people.length ? null : !d.overlapUtcHours.length ? <Empty text="No hour suits everyone — try shifting wake/sleep hours." /> :
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{d.overlapUtcHours.map(h => <Tag key={h} label={hhmm((((h * 60 + myOff) % 1440) + 1440) % 1440)} />)}</View>}</Section>
      <Card style={{ marginTop: S.md }}>
        <Field label="Your city" value={city} onChangeText={setCity} maxLength={60} placeholder="e.g. Pune" />
        <Field label="UTC offset in minutes (330 = India)" value={off} onChangeText={setOff} keyboardType="numbers-and-punctuation" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Field label="Wake hour" value={wake} onChangeText={setWake} keyboardType="number-pad" /></View>
          <View style={{ flex: 1 }}><Field label="Sleep hour" value={sleep} onChangeText={setSleep} keyboardType="number-pad" /></View></View>
        <Btn title="Share my time" disabled={busy || !city.trim() || isNaN(parseInt(off, 10))} onPress={save} />
        <Btn small kind="ghost" title="Remove me from the board" onPress={clear} disabled={busy} style={{ marginTop: 8 }} />
      </Card>
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Read-Later Shelf ----------------
type Item = { id: string; url: string; title: string; note: string; at: number; by: U; mine: boolean; read: boolean; readCount: number };
export function ReadLaterShelf({ route }: any) {
  const c = cid(route); const { toast, show } = useToast(); const { busy, run } = useAct(show);
  const [d, err, reload] = useLoad<{ items: Item[]; unread: number; members: number }>(c ? `/addons/b9/convs/${c}/shelf` : null);
  const [url, setUrl] = useState(''); const [title, setTitle] = useState(''); const [note, setNote] = useState(''); const [only, setOnly] = useState(false);
  if (!isOn('readLaterShelf')) return <Off name="Read-Later Shelf" />;
  const add = () => run(() => call('POST', `/addons/b9/convs/${c}/shelf`, { url: url.trim(), title: title.trim(), note: note.trim() }), 'Shelved').then(r => { if (r) { setUrl(''); setTitle(''); setNote(''); reload(); } });
  const mark = (i: Item) => run(() => call('POST', `/addons/b9/shelf/${i.id}/read`)).then(r => r && reload());
  const del = (i: Item) => run(() => call('DELETE', `/addons/b9/shelf/${i.id}`), 'Removed').then(r => r && reload());
  const items = d ? d.items.filter(i => !only || !i.read) : [];
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Read-Later Shelf" sub={d ? `${d.unread} unread for you` : 'Links saved in this chat'} />
    <Card><Field label="Link" value={url} onChangeText={setUrl} autoCapitalize="none" placeholder="https://…" maxLength={500} />
      <Field label="Title" value={title} onChangeText={setTitle} maxLength={120} /><Field label="Note (optional)" value={note} onChangeText={setNote} maxLength={280} />
      <Btn title="Add to shelf" disabled={busy || !/^https?:\/\/\S+$/.test(url.trim()) || !title.trim()} onPress={add} /></Card>
    {!d ? <Wait err={err} retry={reload} /> : <Section title="Shelf">
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}><Chip label="All" active={!only} onPress={() => setOnly(false)} /><Chip label="Unread" active={only} onPress={() => setOnly(true)} /></View>
      {!items.length ? <Empty text={only ? 'All caught up.' : 'Nothing shelved yet.'} /> : items.map(i => <Card key={i.id} style={{ marginBottom: S.sm }}>
        <Text style={T.h3} onPress={() => Linking.openURL(i.url)}>{i.title}</Text>
        <Text style={T.tiny} numberOfLines={1}>{i.url}</Text>{i.note ? <Text style={[T.small, { marginTop: 4 }]}>{i.note}</Text> : null}
        <Text style={[T.tiny, { marginTop: 4 }]}>{i.by?.name} · {ago(i.at)} · read by {i.readCount}/{d.members}</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}><Chip label={i.read ? 'Read ✓' : 'Mark read'} active={i.read} onPress={() => mark(i)} />
          {i.mine ? <Chip label="Remove" icon="trash" onPress={() => del(i)} /> : null}</View></Card>)}</Section>}
  </Screen>{toast}</View>;
}

// ---------------- Study Sprint ----------------
type Sp = { id: string; goal: string; minutes: number; endsAt: number; status: string; at: number; startedBy: U; members: U[]; quit: U[]; completed: U[]; joined: boolean };
export function StudySprint({ route }: any) {
  const c = cid(route); const { toast, show } = useToast(); const { busy, run } = useAct(show);
  const [d, err, reload] = useLoad<{ current: Sp | null; past: Sp[]; board: { user: U; minutes: number }[] }>(c ? `/addons/b9/convs/${c}/sprints` : null);
  const [mins, setMins] = useState(25); const [goal, setGoal] = useState(''); const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const cur = d?.current; const left = cur ? Math.max(0, cur.endsAt - now) : 0;
  useEffect(() => { if (cur && left === 0) reload(); }, [cur, left === 0]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!isOn('studySprint')) return <Off name="Study Sprint" />;
  const start = () => run(() => call('POST', `/addons/b9/convs/${c}/sprints`, { minutes: mins, goal: goal.trim() }), 'Sprint started').then(r => { if (r) { setGoal(''); reload(); } });
  const act = (action: 'join' | 'leave') => run(() => call('POST', `/addons/b9/sprints/${cur!.id}`, { action }), action === 'join' ? 'Joined — focus!' : 'You left this sprint').then(r => r && reload());
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Study Sprint" sub="Focus together; finish to earn minutes" />
    {!d ? <Wait err={err} retry={reload} /> : <>
      {cur ? <Card style={{ backgroundColor: C.violetSoft }}>
        <Text style={T.tiny}>{cur.minutes}-MIN SPRINT · {cur.startedBy?.name}</Text>{cur.goal ? <Text style={[T.h2, { marginTop: 4 }]}>{cur.goal}</Text> : null}
        <Text style={[T.h1, { marginTop: 8 }]}>{hhmm(Math.floor(left / 60000))}:{String(Math.floor(left / 1000) % 60).padStart(2, '0')}</Text>
        <Bar pct={100 - (left / (cur.minutes * 60000)) * 100} />
        <Text style={[T.small, { marginTop: 8 }]}>In: {cur.members.filter(m => !cur.quit.some(q => q?.id === m?.id)).map(m => m?.name).join(', ')}</Text>
        <Btn title={cur.joined ? 'Leave sprint' : 'Join sprint'} kind={cur.joined ? 'ghost' : 'prism'} disabled={busy} onPress={() => act(cur.joined ? 'leave' : 'join')} style={{ marginTop: 10 }} />
      </Card> : <Card>
        <Text style={T.small}>Length</Text><View style={{ flexDirection: 'row', gap: 6, marginVertical: 8 }}>{[25, 50].map(m => <Chip key={m} label={`${m} min`} active={mins === m} onPress={() => setMins(m)} />)}</View>
        <Field label="Goal (optional)" value={goal} onChangeText={setGoal} maxLength={120} placeholder="e.g. Finish chapter 4" />
        <Btn title="Start sprint" icon="clock" disabled={busy} onPress={start} /></Card>}
      <Section title="This week's minutes">{!d.board.length ? <Empty text="Complete a sprint to get on the board." /> : <Card>{d.board.map((b, i) =>
        <Row key={b.user?.id} icon="trophy" title={`${i + 1}. ${b.user?.name}`} right={<Text style={T.body}>{b.minutes} min</Text>} />)}</Card>}</Section>
      <Section title="Past sprints">{!d.past.length ? <Empty text="No finished sprints yet." /> : <Card>{d.past.map(s =>
        <Row key={s.id} icon="check" title={`${s.minutes} min${s.goal ? ' · ' + s.goal : ''}`} sub={`${ago(s.at)} · completed: ${s.completed.map(x => x?.name).join(', ') || 'nobody'}`} />)}</Card>}</Section>
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Shared Budget ----------------
type Cat = { id: string; name: string; limit: number; spent: number; remaining: number };
type Bud = { id: string; title: string; currency: string; at: number; createdBy: U; categories: Cat[]; totalLimit: number; totalSpent: number; spends: { id: string; category: string; amount: number; note: string; at: number; by: U }[] };
export function SharedBudget({ route }: any) {
  const c = cid(route); const { toast, show } = useToast(); const { busy, run } = useAct(show);
  const [list, err, reload] = useLoad<Bud[]>(c ? `/addons/b9/convs/${c}/budgets` : null);
  const [title, setTitle] = useState(''); const [cats, setCats] = useState('Food:5000, Travel:3000');
  const [sel, setSel] = useState<Record<string, string>>({}); const [amt, setAmt] = useState<Record<string, string>>({}); const [note, setNote] = useState<Record<string, string>>({});
  if (!isOn('sharedBudget')) return <Off name="Shared Budget" />;
  const parsed = cats.split(',').map(s => s.split(':')).filter(p => p.length === 2 && p[0].trim() && +p[1] > 0).map(([n, l]) => ({ name: n.trim(), limit: Math.round(+l * 100) }));
  const create = () => run(() => call('POST', `/addons/b9/convs/${c}/budgets`, { title: title.trim(), categories: parsed }), 'Budget created').then(r => { if (r) { setTitle(''); reload(); } });
  const spend = (b: Bud) => run(() => call('POST', `/addons/b9/budgets/${b.id}/spends`, { category: sel[b.id], amount: Math.round(parseFloat(amt[b.id]) * 100), note: (note[b.id] || '').trim() }), 'Logged')
    .then(r => { if (r) { setAmt({ ...amt, [b.id]: '' }); setNote({ ...note, [b.id]: '' }); reload(); } });
  const delSpend = (id: string) => run(() => call('DELETE', `/addons/b9/budget-spends/${id}`), 'Removed').then(r => r && reload());
  const delBudget = (b: Bud) => run(() => call('DELETE', `/addons/b9/budgets/${b.id}`), 'Budget deleted').then(r => r && reload());
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Shared Budget" sub="Plan together — nothing is charged" />
    {!list ? <Wait err={err} retry={reload} /> : <>
      {!list.length ? <Empty text="No budgets in this chat yet." /> : list.map(b => <Card key={b.id} style={{ marginBottom: S.md }}>
        <Text style={T.h2}>{b.title}</Text><Text style={T.tiny}>{money(b.totalSpent, b.currency)} of {money(b.totalLimit, b.currency)} · by {b.createdBy?.name}</Text>
        {b.categories.map(k => <View key={k.id} style={{ marginTop: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={T.body}>{k.name}</Text>
            <Text style={[T.small, k.remaining < 0 ? { color: C.pink } : null]}>{k.remaining < 0 ? 'over by ' + money(-k.remaining, b.currency) : money(k.remaining, b.currency) + ' left'}</Text></View>
          <Bar pct={Math.min(100, (k.spent / k.limit) * 100)} color={k.remaining < 0 ? C.pink : C.violet} /></View>)}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>{b.categories.map(k => <Chip key={k.id} label={k.name} active={sel[b.id] === k.id} onPress={() => setSel({ ...sel, [b.id]: k.id })} />)}</View>
        <Field label="Amount" value={amt[b.id] || ''} onChangeText={v => setAmt({ ...amt, [b.id]: v })} keyboardType="decimal-pad" />
        <Field label="Note" value={note[b.id] || ''} onChangeText={v => setNote({ ...note, [b.id]: v })} maxLength={120} />
        <Btn small title="Log spend" disabled={busy || !sel[b.id] || !(parseFloat(amt[b.id]) > 0)} onPress={() => spend(b)} />
        {b.spends.slice(0, 8).map(s => <Row key={s.id} icon="cash" title={`${money(s.amount, b.currency)} · ${b.categories.find(k => k.id === s.category)?.name ?? ''}`}
          sub={`${s.by?.name} · ${ago(s.at)}${s.note ? ' · ' + s.note : ''}`} onPress={() => delSpend(s.id)} right={<Text style={T.tiny}>remove</Text>} />)}
        <Btn small kind="ghost" title="Delete budget" onPress={() => delBudget(b)} style={{ marginTop: 8 }} />
      </Card>)}
      <Card style={{ marginTop: S.md }}><Field label="New budget title" value={title} onChangeText={setTitle} maxLength={80} placeholder="e.g. Goa trip" />
        <Field label="Categories (name:limit, comma separated)" value={cats} onChangeText={setCats} />
        <Btn title="Create budget" disabled={busy || !title.trim() || !parsed.length} onPress={create} /></Card>
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Vote to Pin ----------------
type Prop = { id: string; text: string; status: string; at: number; pinnedAt: number | null; by: U; mine: boolean; yes: number; need: number; voted: boolean };
type Pins = { pinned: Prop | null; proposals: Prop[]; members: number };
export function VoteToPin({ route }: any) {
  const c = cid(route); const { toast, show } = useToast(); const { busy, run } = useAct(show);
  const [d, err, reload, setD] = useLoad<Pins>(c ? `/addons/b9/convs/${c}/pins` : null); const [txt, setTxt] = useState('');
  if (!isOn('voteToPin')) return <Off name="Vote to Pin" />;
  const propose = () => run(() => call<Pins>('POST', `/addons/b9/convs/${c}/pins`, { text: txt.trim() }), 'Proposed').then(r => { if (r) { setTxt(''); setD(r); } });
  const vote = (p: Prop) => run(() => call<Pins>('POST', `/addons/b9/pins/${p.id}/vote`)).then(r => r && setD(r));
  const drop = (p: Prop) => run(() => call<Pins>('DELETE', `/addons/b9/pins/${p.id}`), p.status === 'pinned' ? 'Unpinned' : 'Withdrawn').then(r => r && setD(r));
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Vote to Pin" sub="Half the chat says yes → it's pinned" />
    {!d ? <Wait err={err} retry={reload} /> : <>
      <Section title="Pinned note">{d.pinned ? <Card style={{ backgroundColor: C.violetSoft }}><Text style={T.body}>{d.pinned.text}</Text>
        <Text style={[T.tiny, { marginTop: 4 }]}>by {d.pinned.by?.name} · pinned {ago(d.pinned.pinnedAt || d.pinned.at)}</Text>
        <Btn small kind="ghost" title="Unpin" onPress={() => drop(d.pinned!)} disabled={busy} style={{ marginTop: 8 }} /></Card> : <Empty text="Nothing pinned yet." />}</Section>
      <Card style={{ marginTop: S.md }}><Field label="Propose a note to pin" value={txt} onChangeText={setTxt} multiline maxLength={300} />
        <Btn title="Propose" icon="pin" disabled={busy || !txt.trim()} onPress={propose} /></Card>
      <Section title="Open votes">{!d.proposals.length ? <Empty text="No open proposals." /> : d.proposals.map(p => <Card key={p.id} style={{ marginBottom: S.sm }}>
        <Text style={T.body}>{p.text}</Text><Text style={[T.tiny, { marginTop: 4 }]}>{p.by?.name} · {ago(p.at)} · {p.yes}/{p.need} yes needed</Text>
        <Bar pct={(p.yes / p.need) * 100} />
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}><Chip label={p.voted ? 'Voted yes ✓' : 'Vote yes'} active={p.voted} onPress={() => vote(p)} />
          {p.mine ? <Chip label="Withdraw" icon="trash" onPress={() => drop(p)} /> : null}</View></Card>)}</Section>
    </>}
  </Screen>{toast}</View>;
}

export const SCREENS: Record<string, React.ComponentType<any>> = { ConfessionBox, TimeZoneBoard, ReadLaterShelf, StudySprint, SharedBudget, VoteToPin };
export const ENTRIES: AddonEntry[] = [
  { route: 'ConfessionBox', title: 'Confession Box', sub: 'Anonymous notes in a group chat', icon: 'lock', module: 'hush', flag: 'hush.confessionBox', needsConv: true },
  { route: 'TimeZoneBoard', title: 'Time Zone Board', sub: "Everyone's local time + overlap hours", icon: 'globe', module: 'hush', flag: 'hush.timeZoneBoard', needsConv: true },
  { route: 'ReadLaterShelf', title: 'Read-Later Shelf', sub: 'Save links for the chat, mark read', icon: 'bookmark', module: 'hush', flag: 'hush.readLaterShelf', needsConv: true },
  { route: 'StudySprint', title: 'Study Sprint', sub: '25/50-min focus sprints + weekly board', icon: 'clock', module: 'hush', flag: 'hush.studySprint', needsConv: true },
  { route: 'SharedBudget', title: 'Shared Budget', sub: 'Category limits, log spends together', icon: 'wallet', module: 'hush', flag: 'hush.sharedBudget', needsConv: true },
  { route: 'VoteToPin', title: 'Vote to Pin', sub: 'Half the chat agrees → pinned note', icon: 'pin', module: 'hush', flag: 'hush.voteToPin', needsConv: true },
];
