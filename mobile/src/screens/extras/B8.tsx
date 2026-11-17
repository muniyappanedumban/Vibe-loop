// Add-on batch 8 (Hush): Emergency Card · Remind Them · Meeting Notes · Memory Jar · Kindness Streak · Quiet Reply.
// Every screen talks to /addons/b8/* — the server enforces switches (addons.hush.*), friendship and chat membership.
import React, { useCallback, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { C, S, T } from '../../theme/tokens';
import { Screen, Header, Card, Row, Section, Btn, Field, Chip, Tag, Toggle, useToast } from '../../components/UI';
import { call, useSession } from '../../lib/api';
import { ago, DAY, HOUR } from '../../lib/util';

export type AddonEntry = { route: string; title: string; sub: string; icon: string; module: 'glow' | 'hush'; flag: string; needsConv?: boolean };
type U = { id: string; name: string; handle: string } | null;
type Friend = { id: string; name: string; handle: string };

function useLoad<X>(path: string | null): [X | null, string | null, () => void] {
  const [d, setD] = useState<X | null>(null); const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => { if (!path) return; setErr(null); call<X>('GET', path).then(setD).catch(e => setErr(e.message)); }, [path]);
  useFocusEffect(load);
  return [d, err, load];
}
const Wait = ({ err, retry }: { err: string | null; retry: () => void }) => err
  ? <Card><Text style={T.body}>{err}</Text><Btn small kind="ghost" title="Try again" onPress={retry} style={{ marginTop: 10 }} /></Card>
  : <ActivityIndicator style={{ marginTop: 30 }} color={C.violet} />;
const Empty = ({ text }: { text: string }) => <Text style={[T.small, { paddingVertical: 8 }]}>{text}</Text>;
const NoConv = () => <Card><Text style={T.body}>Open this from a chat (⋯ › Extras).</Text></Card>;
const when = (t: number) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const parseHM = (s: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim()); if (!m) return null; const v = +m[1] * 60 + +m[2]; return +m[1] < 24 && +m[2] < 60 ? v : null; };
function useFriends() { const [d] = useLoad<{ friends: Friend[] }>('/friends'); return d?.friends ?? null; }
const FriendPick = ({ friends, picked, onPick }: { friends: Friend[] | null; picked: string[]; onPick: (id: string) => void }) => !friends
  ? <ActivityIndicator color={C.violet} /> : friends.length === 0 ? <Empty text="Add friends to your Squad first." />
  : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{friends.map(f => <Chip key={f.id} label={f.name} active={picked.includes(f.id)} onPress={() => onPick(f.id)} />)}</View>;

// ---------------- Emergency Card ----------------
type Card8 = { user: U; mine: boolean; blood: string; allergies: string; meds: string; notes: string; contacts: { name: string; phone: string; relation: string }[]; updatedAt: number; sharedWith: U[] | null };
const BLOODS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
function CardView({ c }: { c: Card8 }) {
  return <Card style={{ marginTop: S.md, backgroundColor: '#FFF1F1' }}>
    <Text style={T.tiny}>EMERGENCY CARD · {c.user?.name} · updated {ago(c.updatedAt)}</Text>
    <Text style={[T.h2, { marginTop: 4 }]}>Blood group: {c.blood || '—'}</Text>
    <Text style={T.body}>Allergies: {c.allergies || 'None listed'}</Text>
    <Text style={T.body}>Medication: {c.meds || 'None listed'}</Text>
    {c.notes ? <Text style={T.body}>Notes: {c.notes}</Text> : null}
    {c.contacts.map((x, i) => <Row key={i} icon="user" title={`${x.name}${x.relation ? ` (${x.relation})` : ''}`} sub={x.phone} />)}
  </Card>;
}
export function EmergencyCard({ route }: any) {
  const { toast, show } = useToast(); const friends = useFriends();
  const [d, err, reload] = useLoad<{ card: Card8 | null; sharedWithMe: { user: U; updatedAt: number }[] }>('/addons/b8/emergency');
  const [f, setF] = useState<{ blood: string; allergies: string; meds: string; notes: string; cName: string; cPhone: string; cRel: string; shared: string[] } | null>(null);
  const [view, setView] = useState<Card8 | null>(null); const [busy, setBusy] = useState(false);
  const startEdit = () => { const c = d?.card; const k = c?.contacts[0]; setF({ blood: c?.blood ?? '', allergies: c?.allergies ?? '', meds: c?.meds ?? '', notes: c?.notes ?? '', cName: k?.name ?? '', cPhone: k?.phone ?? '', cRel: k?.relation ?? '', shared: (c?.sharedWith ?? []).map(x => x!.id) }); };
  const save = async () => { if (!f) return; setBusy(true);
    try { await call('PUT', '/addons/b8/emergency', { blood: f.blood, allergies: f.allergies, meds: f.meds, notes: f.notes, sharedWith: f.shared,
      contacts: f.cName.trim() && f.cPhone.trim() ? [{ name: f.cName.trim(), phone: f.cPhone.trim(), relation: f.cRel.trim() }] : [] });
      setF(null); reload(); show('Emergency Card saved'); } catch (e: any) { show(e.message, 'err'); } finally { setBusy(false); } };
  const open = (id: string) => call<Card8>('GET', `/addons/b8/emergency/${id}`).then(setView).catch(e => show(e.message, 'err'));
  const remove = () => call('DELETE', '/addons/b8/emergency').then(() => { reload(); show('Card deleted'); }).catch(e => show(e.message, 'err'));
  React.useEffect(() => { if (route?.params?.userId) open(route.params.userId); }, [route?.params?.userId]);
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Emergency Card" sub="Only the Squad friends you pick can see it" />
    {!d ? <Wait err={err} retry={reload} /> : f ? <Card>
      <Text style={T.tiny}>BLOOD GROUP</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 6 }}>{BLOODS.map(b => <Chip key={b} label={b} active={f.blood === b} onPress={() => setF({ ...f, blood: f.blood === b ? '' : b })} />)}</View>
      <Field label="Allergies" value={f.allergies} onChangeText={v => setF({ ...f, allergies: v })} maxLength={300} placeholder="Penicillin, peanuts…" />
      <Field label="Medication" value={f.meds} onChangeText={v => setF({ ...f, meds: v })} maxLength={300} />
      <Field label="Other notes" value={f.notes} onChangeText={v => setF({ ...f, notes: v })} maxLength={500} multiline />
      <Field label="Emergency contact name" value={f.cName} onChangeText={v => setF({ ...f, cName: v })} maxLength={60} />
      <Field label="Phone" value={f.cPhone} onChangeText={v => setF({ ...f, cPhone: v })} keyboardType="phone-pad" maxLength={20} />
      <Field label="Relation" value={f.cRel} onChangeText={v => setF({ ...f, cRel: v })} maxLength={30} />
      <Text style={[T.tiny, { marginVertical: 6 }]}>WHO CAN SEE IT</Text>
      <FriendPick friends={friends} picked={f.shared} onPick={id => setF({ ...f, shared: f.shared.includes(id) ? f.shared.filter(x => x !== id) : [...f.shared, id] })} />
      <Btn title={busy ? 'Saving…' : 'Save card'} disabled={busy} onPress={save} style={{ marginTop: S.md }} />
      <Btn kind="ghost" title="Cancel" onPress={() => setF(null)} style={{ marginTop: 6 }} />
    </Card> : <>
      {d.card ? <><CardView c={d.card} /><Text style={[T.small, { marginTop: 6 }]}>Shared with: {d.card.sharedWith?.map(x => x?.name).join(', ') || 'nobody yet'}</Text></>
        : <Card><Text style={T.body}>You haven't set up your card yet.</Text></Card>}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: S.md }}><Btn title={d.card ? 'Edit card' : 'Create card'} icon="shield" onPress={startEdit} />
        {d.card ? <Btn kind="danger" title="Delete" onPress={remove} /> : null}</View>
      <Section title="Cards shared with you"><Card>
        {d.sharedWithMe.map(s => <Row key={s.user?.id} icon="shield" tint={C.pink} title={s.user?.name ?? 'Friend'} sub={`Updated ${ago(s.updatedAt)}`} onPress={() => open(s.user!.id)} />)}
        {!d.sharedWithMe.length ? <Empty text="No friend has shared a card with you." /> : null}
      </Card></Section>
      {view && !view.mine ? <CardView c={view} /> : null}
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Remind Them ----------------
type Rem = { id: string; note: string; dueAt: number; status: string; snoozes: number; at: number; sentAt: number | null; mine: boolean; from: U; to: U };
const LATER = [{ l: '15 min', ms: 15 * 60_000 }, { l: '1 hour', ms: HOUR }, { l: '3 hours', ms: 3 * HOUR }, { l: 'Tomorrow', ms: DAY }, { l: '1 week', ms: 7 * DAY }];
export function RemindThem() {
  const { toast, show } = useToast(); const friends = useFriends();
  const [d, err, reload] = useLoad<{ inbox: Rem[]; sent: Rem[] }>('/addons/b8/reminders');
  const [to, setTo] = useState<string | null>(null); const [note, setNote] = useState(''); const [ms, setMs] = useState(HOUR); const [busy, setBusy] = useState(false);
  const make = async () => { setBusy(true); try { await call('POST', '/addons/b8/reminders', { to, note: note.trim(), dueAt: Date.now() + ms }); setNote(''); reload(); show('Reminder scheduled'); } catch (e: any) { show(e.message, 'err'); } finally { setBusy(false); } };
  const act = (r: Rem, action: string, minutes?: number) => call('POST', `/addons/b8/reminders/${r.id}`, { action, minutes }).then(() => { reload(); show(action === 'snooze' ? 'Snoozed' : action === 'done' ? 'Done' : 'Cancelled'); }).catch(e => show(e.message, 'err'));
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Remind Them" sub="Send a friend a nudge at just the right time" />
    <Card>
      <Text style={[T.tiny, { marginBottom: 6 }]}>WHO</Text>
      <FriendPick friends={friends} picked={to ? [to] : []} onPick={id => setTo(id)} />
      <Field label="Note" value={note} onChangeText={setNote} maxLength={200} placeholder="Carry the tickets!" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: S.md }}>{LATER.map(x => <Chip key={x.l} label={x.l} active={ms === x.ms} onPress={() => setMs(x.ms)} />)}</View>
      <Btn title={busy ? 'Scheduling…' : 'Schedule reminder'} icon="clock" disabled={busy || !to || !note.trim()} onPress={make} />
    </Card>
    {!d ? <Wait err={err} retry={reload} /> : <>
      <Section title="Reminders for you"><Card>
        {d.inbox.map(r => <View key={r.id}><Row icon="bell" title={r.note} sub={`From ${r.from?.name} · ${r.sentAt ? ago(r.sentAt) : ''}`} />
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}><Btn small kind="ghost" title="Snooze 15m" onPress={() => act(r, 'snooze', 15)} />
            <Btn small kind="ghost" title="Snooze 1h" onPress={() => act(r, 'snooze', 60)} /><Btn small title="Done" onPress={() => act(r, 'done')} /></View></View>)}
        {!d.inbox.length ? <Empty text="No reminders waiting for you." /> : null}
      </Card></Section>
      <Section title="You scheduled"><Card>
        {d.sent.map(r => <Row key={r.id} icon="clock" title={`${r.to?.name}: ${r.note}`} sub={`${when(r.dueAt)}${r.snoozes ? ` · snoozed ${r.snoozes}×` : ''}`}
          right={r.status === 'pending' ? <Btn small kind="ghost" title="Cancel" onPress={() => act(r, 'cancel')} /> : <Tag label={r.status} />} />)}
        {!d.sent.length ? <Empty text="Nothing scheduled yet." /> : null}
      </Card></Section>
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Meeting Notes ----------------
type Item = { id: string; text: string; assignee: U; done: boolean; canTick: boolean };
type Note = { id: string; title: string; body: string; at: number; by: U; mine: boolean; items: Item[]; done: number; total: number };
export function MeetingNotes({ route }: any) {
  const cid = route?.params?.convId; const { toast, show } = useToast();
  const [d, err, reload] = useLoad<Note[]>(cid ? `/addons/b8/convs/${cid}/notes` : null);
  const [convs] = useLoad<{ id: string; members: Friend[] }[]>(cid ? '/conv' : null);
  const members = convs?.find(c => c.id === cid)?.members ?? [];
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [items, setItems] = useState<{ text: string; assignee: string }[]>([]);
  const [it, setIt] = useState(''); const [who, setWho] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const meId = '__me__';
  const addItem = () => { if (!it.trim() || !who) return; setItems([...items, { text: it.trim(), assignee: who }]); setIt(''); };
  const save = async () => { setBusy(true); try {
    const me = useSession.getState().activeId;
    await call('POST', `/addons/b8/convs/${cid}/notes`, { title: title.trim(), body: body.trim(), items: items.map(i => ({ ...i, assignee: i.assignee === meId ? me : i.assignee })) });
    setTitle(''); setBody(''); setItems([]); reload(); show('Notes saved'); } catch (e: any) { show(e.message, 'err'); } finally { setBusy(false); } };
  const tick = (n: Note, i: Item) => call('PATCH', `/addons/b8/notes/${n.id}`, { tick: i.id }).then(reload).catch(e => show(e.message, 'err'));
  const del = (n: Note) => call('DELETE', `/addons/b8/notes/${n.id}`).then(() => { reload(); show('Deleted'); }).catch(e => show(e.message, 'err'));
  if (!cid) return <Screen><Header title="Meeting Notes" /><NoConv /></Screen>;
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Meeting Notes" sub="Write it down, hand out the to-dos" />
    <Card>
      <Field label="Title" value={title} onChangeText={setTitle} maxLength={100} placeholder="Sunday trip sync" />
      <Field label="Notes" value={body} onChangeText={setBody} maxLength={5000} multiline />
      <Text style={[T.tiny, { marginBottom: 6 }]}>ACTION ITEMS</Text>
      {items.map((x, i) => <Row key={i} icon="check" title={x.text} sub={x.assignee === meId ? 'Me' : members.find(m => m.id === x.assignee)?.name} right={<Btn small kind="ghost" title="✕" onPress={() => setItems(items.filter((_, j) => j !== i))} />} />)}
      <Field label="New item" value={it} onChangeText={setIt} maxLength={140} placeholder="Book the cab" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        <Chip label="Me" active={who === meId} onPress={() => setWho(meId)} />
        {members.map(m => <Chip key={m.id} label={m.name} active={who === m.id} onPress={() => setWho(m.id)} />)}</View>
      <Btn small kind="ghost" title="Add item" disabled={!it.trim() || !who} onPress={addItem} />
      <Btn title={busy ? 'Saving…' : 'Save notes'} icon="book" disabled={busy || !title.trim()} onPress={save} style={{ marginTop: S.md }} />
    </Card>
    {!d ? <Wait err={err} retry={reload} /> : <>
      {d.map(n => <Card key={n.id} style={{ marginTop: S.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={[T.h3, { flex: 1 }]}>{n.title}</Text><Tag label={`${n.done}/${n.total}`} /></View>
        <Text style={T.small}>{n.by?.name} · {ago(n.at)}</Text>
        {n.body ? <Text style={[T.body, { marginTop: 6 }]}>{n.body}</Text> : null}
        {n.items.map(i => <Row key={i.id} icon={i.done ? 'check' : 'clock'} tint={i.done ? '#12A27C' : C.inkSoft} title={i.text} sub={i.assignee?.name}
          right={i.canTick ? <Btn small kind={i.done ? 'ghost' : 'prism'} title={i.done ? 'Undo' : 'Tick'} onPress={() => tick(n, i)} /> : undefined} />)}
        {n.mine ? <Btn small kind="danger" title="Delete" onPress={() => del(n)} style={{ marginTop: 6 }} /> : null}
      </Card>)}
      {!d.length ? <Card style={{ marginTop: S.md }}><Empty text="No notes in this chat yet." /></Card> : null}
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Memory Jar ----------------
type Jar = { id: string; msgId: string; text: string; msgAt: number; at: number; sender: U; savedBy: U; mine: boolean };
type Cand = { id: string; text: string; at: number; sender: U; saved: boolean };
export function MemoryJar({ route }: any) {
  const cid = route?.params?.convId; const { toast, show } = useToast();
  const [d, err, reload] = useLoad<{ items: Jar[]; total: number }>(cid ? `/addons/b8/convs/${cid}/jar` : null);
  const [cands, setCands] = useState<Cand[] | null>(null); const [pickErr, setPickErr] = useState<string | null>(null);
  const pick = () => { setPickErr(null); call<Cand[]>('GET', `/addons/b8/convs/${cid}/jar/candidates`).then(setCands).catch(e => setPickErr(e.message)); };
  const save = (c: Cand) => call('POST', `/addons/b8/convs/${cid}/jar`, { msgId: c.id }).then(() => { reload(); pick(); show('Dropped in the jar'); }).catch(e => show(e.message, 'err'));
  const remove = (j: Jar) => call('DELETE', `/addons/b8/jar/${j.id}`).then(() => { reload(); show('Removed'); }).catch(e => show(e.message, 'err'));
  if (!cid) return <Screen><Header title="Memory Jar" /><NoConv /></Screen>;
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Memory Jar" sub={d ? `${d.total} saved moment${d.total === 1 ? '' : 's'} in this chat` : 'Favourite messages, kept together'} />
    {cands ? <Card>
      <Text style={[T.tiny, { marginBottom: 6 }]}>PICK A MESSAGE</Text>
      {cands.map(c => <Row key={c.id} icon="chat" title={c.text} sub={`${c.sender?.name} · ${ago(c.at)}`} right={c.saved ? <Tag label="In jar" /> : <Btn small title="Save" onPress={() => save(c)} />} />)}
      {!cands.length ? <Empty text="No recent text messages here." /> : null}
      <Btn small kind="ghost" title="Close" onPress={() => setCands(null)} />
    </Card> : <Btn title="Add a message" icon="bookmark" onPress={pick} />}
    {pickErr ? <Text style={[T.small, { color: C.pink }]}>{pickErr}</Text> : null}
    {!d ? <Wait err={err} retry={reload} /> : <Section title="The jar"><Card>
      {d.items.map(j => <Row key={j.id} icon="heart" tint={C.pink} title={`“${j.text}”`} sub={`${j.sender?.name ?? 'Someone'} · ${when(j.msgAt)} · saved by ${j.mine ? 'you' : j.savedBy?.name}`}
        right={j.mine ? <Btn small kind="ghost" title="Remove" onPress={() => remove(j)} /> : undefined} />)}
      {!d.items.length ? <Empty text="The jar is empty — save a message you love." /> : null}
    </Card></Section>}
  </Screen>{toast}</View>;
}

// ---------------- Kindness Streak ----------------
type Pair = { user: U; streak: number; sentToday: boolean };
type KN = { id: string; text: string; day: string; at: number; mine: boolean; from: U; to: U };
export function KindnessStreak() {
  const { toast, show } = useToast(); const friends = useFriends();
  const [d, err, reload] = useLoad<{ pairs: Pair[]; today: string }>('/addons/b8/kindness');
  const [to, setTo] = useState<string | null>(null); const [text, setText] = useState(''); const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState<{ user: U; streak: number; notes: KN[] } | null>(null);
  const send = async () => { setBusy(true); try { const r = await call<{ streak: number }>('POST', '/addons/b8/kindness', { to, text: text.trim() }); setText(''); reload(); show(`Sent · ${r.streak}-day streak`); } catch (e: any) { show(e.message, 'err'); } finally { setBusy(false); } };
  const open = (id: string) => call<any>('GET', `/addons/b8/kindness/${id}`).then(setHist).catch(e => show(e.message, 'err'));
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Kindness Streak" sub="One kind note a day keeps the streak alive" />
    <Card>
      <Text style={[T.tiny, { marginBottom: 6 }]}>TO</Text>
      <FriendPick friends={friends} picked={to ? [to] : []} onPick={setTo} />
      <Field label="Kind note" value={text} onChangeText={setText} maxLength={280} multiline placeholder="You made today easier, thank you" />
      <Btn title={busy ? 'Sending…' : 'Send kindness'} icon="heart" disabled={busy || !to || text.trim().length < 3} onPress={send} />
    </Card>
    {!d ? <Wait err={err} retry={reload} /> : <Section title="Your streaks"><Card>
      {d.pairs.map(p => <Row key={p.user?.id} icon="flame" tint={p.streak ? '#F07B1F' : C.inkSoft} title={p.user?.name ?? 'Friend'} sub={p.sentToday ? 'Sent today ✓' : 'Not sent today'}
        right={<Tag label={`${p.streak} day${p.streak === 1 ? '' : 's'}`} />} onPress={() => open(p.user!.id)} />)}
      {!d.pairs.length ? <Empty text="No kind notes yet — start a streak above." /> : null}
    </Card></Section>}
    {hist ? <Section title={`With ${hist.user?.name} · ${hist.streak}-day streak`}><Card>
      {hist.notes.map(n => <Row key={n.id} icon={n.mine ? 'send' : 'heart'} title={n.text} sub={`${n.mine ? 'You' : n.from?.name} · ${n.day}`} />)}
      {!hist.notes.length ? <Empty text="No notes yet." /> : null}
    </Card></Section> : null}
  </Screen>{toast}</View>;
}

// ---------------- Quiet Reply ----------------
type Away = { text: string; enabled: boolean; startMin: number; endMin: number; tzMin: number; quietNow: boolean };
export function QuietReply() {
  const { toast, show } = useToast();
  const [w, setW] = useState<{ v: Away | null } | null>(null); const [err, setErr] = useState<string | null>(null);
  const reload = useCallback(() => { setErr(null); call<Away | null>('GET', '/addons/b8/away').then(v => setW({ v })).catch(e => setErr(e.message)); }, []);
  useFocusEffect(reload);
  const [f, setF] = useState<{ text: string; start: string; end: string } | null>(null); const [busy, setBusy] = useState(false);
  const d = w?.v ?? null;
  React.useEffect(() => { if (d && !f) setF({ text: d.text, start: hhmm(d.startMin), end: hhmm(d.endMin) }); }, [d]);
  const form = f ?? { text: '', start: '22:00', end: '07:00' };
  const save = async () => { const s = parseHM(form.start), e = parseHM(form.end); if (s === null || e === null) return show('Use HH:MM times', 'err');
    setBusy(true); try { await call('PUT', '/addons/b8/away', { text: form.text.trim(), enabled: d?.enabled ?? true, startMin: s, endMin: e, tzMin: -new Date().getTimezoneOffset() }); reload(); show('Away note saved'); } catch (x: any) { show(x.message, 'err'); } finally { setBusy(false); } };
  const toggle = (v: boolean) => call('POST', '/addons/b8/away/toggle', { enabled: v }).then(reload).catch(e => show(e.message, 'err'));
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Quiet Reply" sub="Friends who message you 1:1 see your away note during these hours" />
    {!w ? <Wait err={err} retry={reload} /> : <>
      {d ? <Card style={{ backgroundColor: d.quietNow ? C.violetSoft : undefined }}>
        <Toggle label="Quiet Reply on" value={d.enabled} onChange={toggle} />
        <Text style={[T.small, { marginTop: 6 }]}>{d.quietNow ? 'You are quiet right now — senders see your note.' : `Quiet from ${hhmm(d.startMin)} to ${hhmm(d.endMin)}.`}</Text>
      </Card> : <Card><Text style={T.body}>No away note yet — write one below.</Text></Card>}
      <Card style={{ marginTop: S.md }}>
        <Field label="Away note" value={form.text} onChangeText={v => setF({ ...form, text: v })} maxLength={280} multiline placeholder="Offline for the evening — I'll reply tomorrow" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Field label="From (HH:MM)" value={form.start} onChangeText={v => setF({ ...form, start: v })} maxLength={5} /></View>
          <View style={{ flex: 1 }}><Field label="Until (HH:MM)" value={form.end} onChangeText={v => setF({ ...form, end: v })} maxLength={5} /></View></View>
        <Text style={[T.small, { marginBottom: 8 }]}>Same start and end = quiet all day.</Text>
        <Btn title={busy ? 'Saving…' : 'Save away note'} icon="clock" disabled={busy || !form.text.trim()} onPress={save} />
      </Card>
    </>}
  </Screen>{toast}</View>;
}

export const SCREENS: Record<string, React.ComponentType<any>> = { EmergencyCard, RemindThem, MeetingNotes, MemoryJar, KindnessStreak, QuietReply };
export const ENTRIES: AddonEntry[] = [
  { route: 'EmergencyCard', title: 'Emergency Card', sub: 'Blood group, allergies and contacts — only for friends you pick', icon: 'shield', module: 'hush', flag: 'hush.emergencyCard' },
  { route: 'RemindThem', title: 'Remind Them', sub: 'Schedule a nudge to a friend at the right moment', icon: 'bell', module: 'hush', flag: 'hush.remindThem' },
  { route: 'MeetingNotes', title: 'Meeting Notes', sub: 'Chat notes with action items for each member', icon: 'book', module: 'hush', flag: 'hush.meetingNotes', needsConv: true },
  { route: 'MemoryJar', title: 'Memory Jar', sub: 'Keep the chat’s favourite messages in one jar', icon: 'bookmark', module: 'hush', flag: 'hush.memoryJar', needsConv: true },
  { route: 'KindnessStreak', title: 'Kindness Streak', sub: 'A kind note a day — keep the streak going with each friend', icon: 'flame', module: 'hush', flag: 'hush.kindnessStreak' },
  { route: 'QuietReply', title: 'Quiet Reply', sub: 'An away note your 1:1 chats see during your quiet hours', icon: 'clock', module: 'hush', flag: 'hush.quietReply' },
];
