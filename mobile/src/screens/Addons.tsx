// VibeLoop add-ons (batch 1). Every screen talks to /addons/* and respects the admin switches (addons.glow.* / addons.hush.*).
// Glow: Daily Spark · Time Capsules · Kudos.  Hush: Pacts · Hush Tab · Safe Arrival.  Hubs: GlowExtras · HushExtras.
import React, { useCallback, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { C, S, T } from '../theme/tokens';
import { Screen, Header, Card, Row, Section, Btn, Field, Chip, useToast, Tag } from '../components/UI';
import { call } from '../lib/api';
import { useConfig } from '../lib/config';
import { ago } from '../lib/util';
import { ADDON_ENTRIES } from './extras/index';

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
const addon = (path: string) => { const a = (useConfig.getState().cfg as any).addons; const [m, k] = path.split('.'); return a?.[m]?.[k] !== false; };
const money = (minor: number, cur: string) => `${cur === 'INR' ? '₹' : cur + ' '}${(minor / 100).toFixed(2)}`;
const when = (t: number) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// ---------------- hubs ----------------
export function GlowExtras({ navigation }: any) {
  const items = [
    { k: 'glow.dailySpark', route: 'DailySpark', icon: 'spark', title: 'Daily Spark', sub: 'One question a day — answer to see everyone else’s' },
    { k: 'glow.capsules', route: 'Capsules', icon: 'lock', title: 'Time Capsules', sub: 'Seal a note today, open it on a date you choose' },
    { k: 'glow.kudos', route: 'Kudos', icon: 'heart', title: 'Kudos', sub: 'Thank people with a badge · weekly Kudos Board' },
    ...ADDON_ENTRIES.filter(e => e.module === 'glow').map(e => ({ k: e.flag, route: e.route, icon: e.icon, title: e.title, sub: e.sub })),
  ].filter(i => addon(i.k));
  return <Screen><Header title="Glow Extras" sub={`${items.length} extras · little rituals that make Glow yours`} />
    <Card>{items.map(i => <Row key={i.route} icon={i.icon as any} title={i.title} sub={i.sub} onPress={() => navigation.navigate(i.route)} />)}
      {!items.length ? <Text style={T.small}>Extras are switched off right now.</Text> : null}</Card></Screen>;
}
export function HushExtras({ navigation }: any) {
  const sa = addon('hush.safeArrival');
  return <Screen><Header title="Hush Extras" sub="Practical tools for your people" />
    <Card>
      {sa ? <Row icon="clock" title="Safe Arrival" sub="Check in when you get there — or your people get a nudge" onPress={() => navigation.navigate('SafeArrival')} /> : null}
      {addon('hush.pacts') ? <Row icon="check" title="Pacts" sub="Shared checklists — open any chat › ⋯ › Pacts" /> : null}
      {addon('hush.tab') ? <Row icon="cash" title="Hush Tab" sub="Split costs in a chat — open any chat › ⋯ › Hush Tab" /> : null}
      {ADDON_ENTRIES.filter(e => e.module === 'hush' && addon(e.flag)).map(e => <Row key={e.route} icon={e.icon as any} title={e.title} sub={e.needsConv ? `${e.sub} — open a chat › ⋯ › Extras` : e.sub} onPress={e.needsConv ? undefined : () => navigation.navigate(e.route)} />)}
    </Card></Screen>;
}

// ---------------- Glow · Daily Spark ----------------
type Ans = { id: string; text: string; at: number; user: U; mine: boolean; cheers: number; cheered: boolean };
export function DailySpark() {
  const { toast, show } = useToast(); const [d, err, reload] = useLoad<{ day: string; question: string; answered: boolean; mine: Ans | null; total: number; answers: Ans[] }>('/addons/spark');
  const [txt, setTxt] = useState(''); const [busy, setBusy] = useState(false); const [edit, setEdit] = useState(false);
  const send = async () => { setBusy(true); try { await call('POST', '/addons/spark', { text: txt.trim() }); setTxt(''); setEdit(false); reload(); show('Answer posted'); } catch (e: any) { show(e.message, 'err'); } finally { setBusy(false); } };
  const cheer = (a: Ans) => call('POST', `/addons/spark/${a.id}/cheer`).then(reload).catch(e => show(e.message, 'err'));
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Daily Spark" sub={d ? `${d.total} answer${d.total === 1 ? '' : 's'} today` : 'Today’s question'} />
    {!d ? <Wait err={err} retry={reload} /> : <>
      <Card style={{ backgroundColor: C.violetSoft }}><Text style={T.tiny}>TODAY · {d.day}</Text><Text style={[T.h2, { marginTop: 6 }]}>{d.question}</Text></Card>
      {!d.answered || edit ? <Card style={{ marginTop: S.md }}>
        <Field label={d.answered ? 'Edit your answer' : 'Your answer (others’ answers unlock after you post)'} value={txt} onChangeText={setTxt} multiline maxLength={280} placeholder="Keep it real…" />
        <Btn title={busy ? 'Posting…' : d.answered ? 'Save' : 'Post answer'} disabled={busy || !txt.trim()} onPress={send} />
      </Card> : <Card style={{ marginTop: S.md }}><Row icon="check" tint="#12A27C" title="You answered" sub={d.mine?.text} right={<Btn small kind="ghost" title="Edit" onPress={() => { setTxt(d.mine?.text ?? ''); setEdit(true); }} />} /></Card>}
      {d.answered ? <Section title="Everyone’s answers"><Card>
        {d.answers.filter(a => !a.mine).map(a => <Row key={a.id} icon="user" title={a.user?.name ?? 'Someone'} sub={a.text}
          right={<Pressable onPress={() => cheer(a)} accessibilityRole="button" accessibilityLabel="Cheer"><Tag label={`${a.cheered ? '★' : '☆'} ${a.cheers}`} color={a.cheered ? C.violet : C.inkSoft} bg={a.cheered ? C.violetSoft : '#F1F1F4'} /></Pressable>} />)}
        {d.answers.filter(a => !a.mine).length === 0 ? <Text style={T.small}>You’re first today — check back later.</Text> : null}
      </Card></Section> : null}
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Glow · Time Capsules ----------------
type Cap = { id: string; title: string; audience: string; unlockAt: number; at: number; sealed: boolean; mine: boolean; owner: U; text: string | null };
const SEAL = [{ l: '1 week', d: 7 }, { l: '1 month', d: 30 }, { l: '6 months', d: 182 }, { l: '1 year', d: 365 }, { l: '5 years', d: 1826 }];
export function Capsules() {
  const { toast, show } = useToast(); const [d, err, reload] = useLoad<{ mine: Cap[]; opened: Cap[] }>('/addons/capsules');
  const [f, setF] = useState({ title: '', text: '', days: 30, audience: 'me' }); const [busy, setBusy] = useState(false); const [open, setOpen] = useState<string | null>(null);
  const make = async () => { setBusy(true); try { await call('POST', '/addons/capsules', { title: f.title.trim(), text: f.text.trim(), audience: f.audience, unlockAt: Date.now() + f.days * 86_400_000 }); setF({ ...f, title: '', text: '' }); show('Sealed — see you then'); reload(); } catch (e: any) { show(e.message, 'err'); } finally { setBusy(false); } };
  const del = (c: Cap) => call('DELETE', `/addons/capsules/${c.id}`).then(() => { show('Capsule deleted'); reload(); }).catch(e => show(e.message, 'err'));
  const Item = ({ c }: { c: Cap }) => <View>
    <Row icon={c.sealed ? 'lock' : 'spark'} tint={c.sealed ? C.inkSoft : C.violet} title={c.title} sub={c.sealed ? `Sealed · opens ${when(c.unlockAt)}` : `Opened ${ago(c.unlockAt)}${c.mine ? '' : ` · from ${c.owner?.name}`}`}
      onPress={() => !c.sealed && setOpen(open === c.id ? null : c.id)} right={c.mine ? <Btn small kind="ghost" title="Delete" onPress={() => del(c)} /> : undefined} />
    {open === c.id && c.text ? <Text style={[T.body, { marginLeft: 52, marginBottom: 10 }]}>{c.text}</Text> : null}
  </View>;
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Time Capsules" sub="Write now, open later" />
    <Card>
      <Field label="Title" value={f.title} onChangeText={t => setF({ ...f, title: t })} maxLength={80} placeholder="Dear future me" />
      <Field label="Message (sealed until it opens)" value={f.text} onChangeText={t => setF({ ...f, text: t })} multiline maxLength={5000} placeholder="What do you hope has changed?" />
      <Text style={T.tiny}>OPENS IN</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>{SEAL.map(s => <Chip key={s.d} label={s.l} active={f.days === s.d} onPress={() => setF({ ...f, days: s.d })} />)}</View>
      <Text style={T.tiny}>WHO CAN OPEN IT</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginVertical: 8 }}><Chip label="Only me" active={f.audience === 'me'} onPress={() => setF({ ...f, audience: 'me' })} /><Chip label="My Squad" active={f.audience === 'friends'} onPress={() => setF({ ...f, audience: 'friends' })} /></View>
      <Btn title={busy ? 'Sealing…' : 'Seal capsule'} icon="lock" disabled={busy || !f.title.trim() || !f.text.trim()} onPress={make} />
    </Card>
    {!d ? <Wait err={err} retry={reload} /> : <>
      <Section title={`Your capsules · ${d.mine.length}`}><Card>{d.mine.map(c => <Item key={c.id} c={c} />)}{!d.mine.length ? <Text style={T.small}>None yet.</Text> : null}</Card></Section>
      {d.opened.length ? <Section title="Opened by your Squad"><Card>{d.opened.map(c => <Item key={c.id} c={c} />)}</Card></Section> : null}
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Glow · Kudos ----------------
export function Kudos() {
  const { toast, show } = useToast(); const [d, err, reload] = useLoad<{ kinds: Record<string, string>; left: number; board: { user: U; count: number }[]; received: { id: string; label: string; note: string; at: number; from: U }[]; totals: Record<string, number> }>('/addons/kudos');
  const [to, setTo] = useState(''); const [kind, setKind] = useState('helpful'); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const give = async () => { setBusy(true); try { const r = await call<any>('POST', '/addons/kudos', { to: to.trim(), kind, note: note.trim() }); show(`Kudos sent · ${r.left} left today`); setTo(''); setNote(''); reload(); } catch (e: any) { show(e.message, 'err'); } finally { setBusy(false); } };
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Kudos" sub={d ? `${d.left} left to give today` : 'Thank someone'} />
    {!d ? <Wait err={err} retry={reload} /> : <>
      <Card>
        <Field label="To (@ID)" value={to} onChangeText={setTo} autoCapitalize="none" placeholder="@aanya.eats" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>{Object.entries(d.kinds).map(([k, l]) => <Chip key={k} label={l} active={kind === k} onPress={() => setKind(k)} />)}</View>
        <Field label="Note (optional)" value={note} onChangeText={setNote} maxLength={140} placeholder="Your tips saved my trip" />
        <Btn title={busy ? 'Sending…' : 'Send kudos'} icon="heart" disabled={busy || to.trim().length < 2 || d.left < 1} onPress={give} />
      </Card>
      <Section title="Kudos Board · this week"><Card>{d.board.map((b, i) => <Row key={b.user?.id ?? i} icon="star" tint={i < 3 ? C.tangerine : C.violet} title={`${i + 1}. ${b.user?.name}`} sub={b.user?.handle} right={<Tag label={String(b.count)} />} />)}
        {!d.board.length ? <Text style={T.small}>No kudos this week yet — be the first.</Text> : null}</Card></Section>
      <Section title="Your badges"><Card><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{Object.entries(d.totals).map(([l, n]) => <Tag key={l} label={`${l} · ${n}`} />)}</View></Card></Section>
      {d.received.length ? <Section title="Received"><Card>{d.received.map(k => <Row key={k.id} icon="heart" title={`${k.label} from ${k.from?.name}`} sub={[k.note, ago(k.at)].filter(Boolean).join(' · ')} />)}</Card></Section> : null}
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Hush · Pacts ----------------
type PItem = { id: string; text: string; done: boolean; by: string | null };
type Pct = { id: string; title: string; dueAt: number | null; items: PItem[]; done: number; total: number; createdBy: U };
export function Pacts({ route }: any) {
  const cid = route?.params?.convId; const { toast, show } = useToast(); const [d, err, reload] = useLoad<Pct[]>(cid ? `/addons/convs/${cid}/pacts` : null);
  const [title, setTitle] = useState(''); const [items, setItems] = useState(''); const [adds, setAdds] = useState<Record<string, string>>({});
  const act = (p: Pct, body: any) => call('PATCH', `/addons/pacts/${p.id}`, body).then(reload).catch(e => show(e.message, 'err'));
  const make = () => call('POST', `/addons/convs/${cid}/pacts`, { title: title.trim(), items: items.split('\n').map(s => s.trim()).filter(Boolean) }).then(() => { setTitle(''); setItems(''); reload(); show('Pact created'); }).catch(e => show(e.message, 'err'));
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Pacts" sub="Shared checklists for this chat" />
    <Card>
      <Field label="New Pact" value={title} onChangeText={setTitle} maxLength={80} placeholder="Goa trip prep" />
      <Field label="Items (one per line)" value={items} onChangeText={setItems} multiline placeholder={'Book train\nPack sunscreen'} />
      <Btn title="Create Pact" icon="check" disabled={!title.trim()} onPress={make} />
    </Card>
    {!d ? <Wait err={err} retry={reload} /> : d.map(p => <Card key={p.id} style={{ marginTop: S.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={[T.h3, { flex: 1 }]}>{p.title}</Text><Tag label={`${p.done}/${p.total}`} color={p.done === p.total && p.total ? '#12A27C' : C.violet} /></View>
      {p.items.map(i => <Pressable key={i.id} onPress={() => act(p, { toggle: i.id })} accessibilityRole="checkbox" accessibilityState={{ checked: i.done }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
        <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: i.done ? '#12A27C' : C.line, backgroundColor: i.done ? '#12A27C' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{i.done ? <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text> : null}</View>
        <Text style={[T.body, { flex: 1, textDecorationLine: i.done ? 'line-through' : 'none', color: i.done ? C.inkSoft : C.ink }]}>{i.text}</Text>
        <Pressable onPress={() => act(p, { remove: i.id })} accessibilityLabel="Remove item"><Text style={{ color: C.inkSoft, fontSize: 18 }}>×</Text></Pressable>
      </Pressable>)}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}><View style={{ flex: 1 }}><Field value={adds[p.id] ?? ''} onChangeText={t => setAdds({ ...adds, [p.id]: t })} placeholder="Add an item" /></View>
        <Btn small title="Add" disabled={!(adds[p.id] ?? '').trim()} onPress={() => { act(p, { add: adds[p.id] }); setAdds({ ...adds, [p.id]: '' }); }} style={{ marginBottom: 12 }} /></View>
    </Card>)}
    {d && !d.length ? <Text style={[T.small, { marginTop: S.md }]}>No Pacts in this chat yet.</Text> : null}
  </Screen>{toast}</View>;
}

// ---------------- Hush · Tab ----------------
type TabT = { id: string; title: string; amount: number; currency: string; at: number; paidBy: U; split: { user: U; share: number; settled: boolean }[] };
export function HushTab({ route }: any) {
  const cid = route?.params?.convId; const { toast, show } = useToast();
  const [d, err, reload] = useLoad<{ tabs: TabT[]; balances: { user: U; net: number }[]; myNet: number }>(cid ? `/addons/convs/${cid}/tabs` : null);
  const [title, setTitle] = useState(''); const [amt, setAmt] = useState('');
  const add = () => { const minor = Math.round(parseFloat(amt) * 100); if (!(minor > 0)) return show('Enter an amount', 'err');
    call('POST', `/addons/convs/${cid}/tabs`, { title: title.trim(), amount: minor }).then(() => { setTitle(''); setAmt(''); reload(); show('Added and split equally'); }).catch(e => show(e.message, 'err')); };
  const settle = (t: TabT, uid?: string) => call('POST', `/addons/tabs/${t.id}/settle${uid ? `?uid=${uid}` : ''}`).then(() => { reload(); show('Marked settled'); }).catch(e => show(e.message, 'err'));
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Hush Tab" sub="Who paid, who owes — no money moves here" />
    {d ? <Card style={{ backgroundColor: d.myNet >= 0 ? C.mintSoft : '#FFE9EC' }}><Text style={T.tiny}>YOUR BALANCE IN THIS CHAT</Text>
      <Text style={[T.h2, { marginTop: 4 }]}>{d.myNet === 0 ? 'All square' : d.myNet > 0 ? `You’re owed ${money(d.myNet, 'INR')}` : `You owe ${money(-d.myNet, 'INR')}`}</Text></Card> : null}
    <Card style={{ marginTop: S.md }}>
      <Field label="What for" value={title} onChangeText={setTitle} maxLength={80} placeholder="Dinner at Toit" />
      <Field label="Total you paid (₹)" value={amt} onChangeText={t => setAmt(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="1200" />
      <Btn title="Add & split equally" icon="cash" disabled={!title.trim() || !amt} onPress={add} />
    </Card>
    {!d ? <Wait err={err} retry={reload} /> : d.tabs.map(t => <Card key={t.id} style={{ marginTop: S.md }}>
      <View style={{ flexDirection: 'row' }}><Text style={[T.h3, { flex: 1 }]}>{t.title}</Text><Text style={T.h3}>{money(t.amount, t.currency)}</Text></View>
      <Text style={T.small}>Paid by {t.paidBy?.name} · {ago(t.at)}</Text>
      {t.split.map(s => <Row key={s.user?.id} icon={s.settled ? 'check' : 'clock'} tint={s.settled ? '#12A27C' : C.tangerine} title={s.user?.name ?? '—'} sub={money(s.share, t.currency)}
        right={!s.settled ? <Btn small kind="ghost" title="Settled" onPress={() => settle(t, s.user?.id)} /> : <Tag label="SETTLED" color="#12A27C" bg={C.mintSoft} />} />)}
    </Card>)}
    {d && !d.tabs.length ? <Text style={[T.small, { marginTop: S.md }]}>Nothing on the Tab yet.</Text> : null}
  </Screen>{toast}</View>;
}

// ---------------- Hush · Safe Arrival ----------------
type SA = { id: string; note: string; dueAt: number; status: string; user: U; watchers: U[] };
export function SafeArrival() {
  const { toast, show } = useToast(); const [d, err, reload] = useLoad<{ mine: SA | null; watching: SA[] }>('/addons/safe-arrival');
  const [fr] = useLoad<{ friends: { id: string; name: string; handle: string }[] }>('/friends');
  const [mins, setMins] = useState(30); const [w, setW] = useState<string[]>([]); const [note, setNote] = useState('');
  const start = () => call('POST', '/addons/safe-arrival', { minutes: mins, watchers: w, note: note.trim() }).then(() => { reload(); show('Safe Arrival started'); }).catch(e => show(e.message, 'err'));
  const act = (action: string, minutes?: number) => d?.mine && call('POST', `/addons/safe-arrival/${d.mine.id}`, { action, minutes }).then(() => { reload(); show(action === 'arrived' ? 'Glad you’re safe — your people know' : action === 'extend' ? 'Extended' : 'Cancelled'); }).catch(e => show(e.message, 'err'));
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Safe Arrival" sub="Your people get a nudge if you don’t check in" />
    {!d ? <Wait err={err} retry={reload} /> : d.mine ? <Card style={{ borderColor: d.mine.status === 'alerted' ? C.danger : C.violet }}>
      <Text style={T.tiny}>{d.mine.status === 'alerted' ? 'OVERDUE — YOUR WATCHERS WERE ALERTED' : 'ACTIVE'}</Text>
      <Text style={[T.h2, { marginTop: 4 }]}>Check in by {when(d.mine.dueAt)}</Text>
      <Text style={T.small}>{d.mine.note || 'No note'} · watching: {d.mine.watchers.map(x => x?.name).join(', ')}</Text>
      <Btn title="I’ve arrived safely" icon="check" style={{ marginTop: S.md }} onPress={() => act('arrived')} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}><Btn small kind="ghost" title="+15 min" onPress={() => act('extend', 15)} style={{ flex: 1 }} /><Btn small kind="ghost" title="+1 hour" onPress={() => act('extend', 60)} style={{ flex: 1 }} /><Btn small kind="danger" title="Cancel" onPress={() => act('cancel')} style={{ flex: 1 }} /></View>
    </Card> : <Card>
      <Text style={T.tiny}>I SHOULD BE THERE IN</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>{[15, 30, 60, 120, 240].map(m => <Chip key={m} label={m < 60 ? `${m} min` : `${m / 60} h`} active={mins === m} onPress={() => setMins(m)} />)}</View>
      <Field label="Note (optional)" value={note} onChangeText={setNote} maxLength={120} placeholder="Cab from airport · KA-01-1234" />
      <Text style={T.tiny}>WHO SHOULD KNOW (UP TO 5)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>{(fr?.friends ?? []).map(f => <Chip key={f.id} label={f.name} active={w.includes(f.id)} onPress={() => setW(w.includes(f.id) ? w.filter(x => x !== f.id) : w.length < 5 ? [...w, f.id] : w)} />)}</View>
      {fr && !fr.friends.length ? <Text style={T.small}>Add friends in Squad first.</Text> : null}
      <Btn title="Start Safe Arrival" icon="clock" disabled={!w.length} onPress={start} />
    </Card>}
    {d?.watching.length ? <Section title="You’re watching"><Card>{d.watching.map(s => <Row key={s.id} icon={s.status === 'alerted' ? 'flag' : 'clock'} tint={s.status === 'alerted' ? C.danger : C.violet}
      title={`${s.user?.name}${s.status === 'alerted' ? ' — overdue' : ''}`} sub={`Due ${when(s.dueAt)}${s.note ? ' · ' + s.note : ''}`} />)}</Card></Section> : null}
  </Screen>{toast}</View>;
}
