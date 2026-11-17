// Add-on batch 6 (Hush) — Check-in Circle · Plan Board · Birthday Buddy · Ride Rota · Decision Dice · Gift Pool.
// Every screen lives inside a chat (route.params.convId), talks to /addons/b6/* and respects addons.hush.* switches (server returns 403 when off).
import React, { useCallback, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, Header, Card, Btn, Field, Chip, Tag, Bar, useToast } from '../../components/UI';
import { call } from '../../lib/api';
import { C, S, T } from '../../theme/tokens';
import { ago } from '../../lib/util';

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
const Empty = ({ text }: { text: string }) => <Text style={[T.small, { marginTop: S.md }]}>{text}</Text>;
const when = (t: number) => new Date(t).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const cur = (minor: number, c: string) => `${c === 'INR' ? '₹' : c + ' '}${(minor / 100).toFixed(minor % 100 ? 2 : 0)}`;
// "2026-11-20 18:30" (or "2026-11-20") → epoch ms; NaN when malformed
const parseWhen = (s: string) => { const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/); return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 18), +(m[5] ?? 0)).getTime() : NaN; };
const useAct = (reload: () => void, show: (m: string, k?: 'ok' | 'err') => void) =>
  (method: string, path: string, body?: any, ok?: string) => call(method, path, body).then(() => { reload(); if (ok) show(ok); }).catch(e => show(e.message, 'err'));

// ---------------- Check-in Circle ----------------
const MOODS = ['😞', '🙁', '😐', '🙂', '😄'];
const MOOD_C = ['#E5484D', '#F76B15', '#C9A400', '#30A46C', '#12A27C'];
type Circle = { prompt: string; day: string; days: string[]; answered: boolean; todayCount: number; members: { user: U; strip: { day: string; mood: number | null; note: string }[] }[] };
export function CheckInCircle({ route }: any) {
  const cid = route?.params?.convId; const { toast, show } = useToast(); const [d, err, reload] = useLoad<Circle>(cid ? `/addons/b6/convs/${cid}/checkins` : null);
  const [mood, setMood] = useState(0); const [note, setNote] = useState(''); const act = useAct(reload, show);
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Check-in Circle" sub="A daily ‘how are you?’ for this group" />
    {!d ? <Wait err={err} retry={reload} /> : <>
      <Card>
        <Text style={T.h3}>{d.prompt}</Text>
        <Text style={[T.small, { marginTop: 4 }]}>{d.answered ? 'You checked in today — tap to update.' : `${d.todayCount} checked in so far`}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: S.md }}>
          {MOODS.map((m, i) => <Pressable key={i} onPress={() => setMood(i + 1)} accessibilityLabel={`Mood ${i + 1} of 5`}
            style={{ padding: 8, borderRadius: 14, borderWidth: 2, borderColor: mood === i + 1 ? MOOD_C[i] : 'transparent' }}><Text style={{ fontSize: 30 }}>{m}</Text></Pressable>)}
        </View>
        <Field value={note} onChangeText={setNote} maxLength={140} placeholder="Add a note (optional)" />
        <Btn title="Check in" icon="smile" disabled={!mood} onPress={() => act('POST', `/addons/b6/convs/${cid}/checkins`, { mood, note: note.trim() }, 'Checked in').then(() => setNote(''))} />
      </Card>
      <Text style={[T.h3, { marginTop: S.lg }]}>Last 7 days</Text>
      {d.members.map(m => <Card key={m.user?.id} style={{ marginTop: S.sm }}>
        <Text style={T.body}>{m.user?.name ?? 'Member'}</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
          {m.strip.map(s => <View key={s.day} style={{ flex: 1, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: s.mood ? MOOD_C[s.mood - 1] : C.line }}>
            <Text style={{ fontSize: 14 }}>{s.mood ? MOODS[s.mood - 1] : ''}</Text></View>)}
        </View>
        {m.strip[6]?.note ? <Text style={[T.small, { marginTop: 6 }]}>“{m.strip[6].note}”</Text> : null}
      </Card>)}
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Plan Board ----------------
type Plan = { id: string; title: string; place: string; startsAt: number; createdBy: U; mine: boolean; me: string | null; counts: Record<'yes' | 'maybe' | 'no', number>; rsvps: { user: U; answer: string }[] };
export function PlanBoard({ route }: any) {
  const cid = route?.params?.convId; const { toast, show } = useToast(); const [d, err, reload] = useLoad<Plan[]>(cid ? `/addons/b6/convs/${cid}/plans` : null);
  const [title, setTitle] = useState(''); const [place, setPlace] = useState(''); const [at, setAt] = useState(''); const act = useAct(reload, show);
  const add = () => { const t = parseWhen(at); if (isNaN(t)) return show('Use the format 2026-12-24 19:00', 'err');
    act('POST', `/addons/b6/convs/${cid}/plans`, { title: title.trim(), place: place.trim(), startsAt: t }, 'Plan added').then(() => { setTitle(''); setPlace(''); setAt(''); }); };
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Plan Board" sub="What’s coming up in this chat" />
    <Card>
      <Field label="What" value={title} onChangeText={setTitle} maxLength={80} placeholder="Sunday brunch" />
      <Field label="Where" value={place} onChangeText={setPlace} maxLength={120} placeholder="Koramangala" />
      <Field label="When (YYYY-MM-DD HH:MM)" value={at} onChangeText={setAt} placeholder="2026-12-24 19:00" autoCapitalize="none" />
      <Btn title="Add plan" icon="calendar" disabled={!title.trim() || !at.trim()} onPress={add} />
    </Card>
    {!d ? <Wait err={err} retry={reload} /> : d.map(p => <Card key={p.id} style={{ marginTop: S.md }}>
      <Text style={T.h3}>{p.title}</Text>
      <Text style={[T.small, { marginTop: 2 }]}>{when(p.startsAt)}{p.place ? ` · ${p.place}` : ''} · by {p.createdBy?.name}</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {(['yes', 'maybe', 'no'] as const).map(a => <Chip key={a} label={`${a === 'yes' ? 'Going' : a === 'maybe' ? 'Maybe' : 'Can’t'} · ${p.counts[a]}`} active={p.me === a}
          onPress={() => act('POST', `/addons/b6/plans/${p.id}/rsvp`, { answer: a })} />)}
      </View>
      {p.rsvps.length ? <Text style={[T.small, { marginTop: 8 }]}>{p.rsvps.filter(r => r.answer === 'yes').map(r => r.user?.name).join(', ') || 'No one confirmed yet'}</Text> : null}
      {p.mine ? <Btn small kind="ghost" title="Remove" onPress={() => act('DELETE', `/addons/b6/plans/${p.id}`, undefined, 'Removed')} style={{ marginTop: 8 }} /> : null}
    </Card>)}
    {d && !d.length ? <Empty text="No upcoming plans. Add the first one." /> : null}
  </Screen>{toast}</View>;
}

// ---------------- Birthday Buddy ----------------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
type Bdays = { upcoming: { user: U; month: number; day: number; mine: boolean; inDays: number }[]; mine: { month: number; day: number } | null };
export function BirthdayBuddy({ route }: any) {
  const cid = route?.params?.convId; const { toast, show } = useToast(); const [d, err, reload] = useLoad<Bdays>(cid ? `/addons/b6/convs/${cid}/birthdays` : null);
  const [month, setMonth] = useState(0); const [day, setDay] = useState(''); const act = useAct(reload, show);
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Birthday Buddy" sub="Share your birthday with this chat — the group gets a heads-up the day before" />
    {!d ? <Wait err={err} retry={reload} /> : <>
      <Card>
        <Text style={T.body}>{d.mine ? `Your birthday here: ${d.mine.day} ${MONTHS[d.mine.month - 1]}` : 'You haven’t shared your birthday with this chat.'}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: S.md }}>
          {MONTHS.map((m, i) => <Chip key={m} label={m} active={month === i + 1} onPress={() => setMonth(i + 1)} />)}
        </View>
        <Field label="Day" value={day} onChangeText={t => setDay(t.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="14" />
        <Btn title={d.mine ? 'Update birthday' : 'Share birthday'} icon="gift" disabled={!month || !day}
          onPress={() => act('PUT', `/addons/b6/convs/${cid}/birthdays`, { month, day: +day }, 'Saved')} />
        {d.mine ? <Btn small kind="ghost" title="Stop sharing" onPress={() => act('DELETE', `/addons/b6/convs/${cid}/birthdays`, undefined, 'Removed')} style={{ marginTop: 8 }} /> : null}
      </Card>
      <Text style={[T.h3, { marginTop: S.lg }]}>Upcoming</Text>
      {d.upcoming.map(b => <Card key={b.user?.id} style={{ marginTop: S.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[T.body, { flex: 1 }]}>{b.user?.name}{b.mine ? ' (you)' : ''} · {b.day} {MONTHS[b.month - 1]}</Text>
          <Tag label={b.inDays === 0 ? 'TODAY' : b.inDays === 1 ? 'TOMORROW' : `IN ${b.inDays} DAYS`} color={b.inDays <= 1 ? C.pink : C.violet} />
        </View>
      </Card>)}
      {!d.upcoming.length ? <Empty text="No birthdays shared in this chat yet." /> : null}
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Ride Rota ----------------
type Ride = { id: string; dest: string; leavesAt: number; seats: number; left: number; closed: boolean; driver: U; isDriver: boolean; riding: boolean; riders: U[] };
export function RideRota({ route }: any) {
  const cid = route?.params?.convId; const { toast, show } = useToast(); const [d, err, reload] = useLoad<Ride[]>(cid ? `/addons/b6/convs/${cid}/rides` : null);
  const [dest, setDest] = useState(''); const [at, setAt] = useState(''); const [seats, setSeats] = useState('3'); const act = useAct(reload, show);
  const add = () => { const t = parseWhen(at); if (isNaN(t)) return show('Use the format 2026-12-24 08:30', 'err');
    act('POST', `/addons/b6/convs/${cid}/rides`, { dest: dest.trim(), leavesAt: t, seats: +seats || 0 }, 'Trip posted').then(() => { setDest(''); setAt(''); }); };
  const ride = (r: Ride, action: string, ok: string) => act('POST', `/addons/b6/rides/${r.id}`, { action }, ok);
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Ride Rota" sub="Who’s driving, and who’s in the car" />
    <Card>
      <Field label="Going to" value={dest} onChangeText={setDest} maxLength={120} placeholder="Office / Airport / Nandi Hills" />
      <Field label="Leaving (YYYY-MM-DD HH:MM)" value={at} onChangeText={setAt} placeholder="2026-12-24 08:30" autoCapitalize="none" />
      <Field label="Free seats" value={seats} onChangeText={t => setSeats(t.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" />
      <Btn title="I’m driving" icon="compass" disabled={!dest.trim() || !at.trim() || !+seats} onPress={add} />
    </Card>
    {!d ? <Wait err={err} retry={reload} /> : d.map(r => <Card key={r.id} style={{ marginTop: S.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={[T.h3, { flex: 1 }]}>{r.dest}</Text>
        <Tag label={r.closed ? 'CLOSED' : `${r.left}/${r.seats} FREE`} color={r.closed ? C.inkSoft : r.left ? '#12A27C' : C.pink} /></View>
      <Text style={[T.small, { marginTop: 2 }]}>{when(r.leavesAt)} · {r.driver?.name} driving</Text>
      <Text style={[T.small, { marginTop: 6 }]}>{r.riders.length ? `Riding: ${r.riders.map(x => x?.name).join(', ')}` : 'No riders yet'}</Text>
      {r.closed ? null : r.isDriver ? <Btn small kind="ink" title="Close trip" onPress={() => ride(r, 'close', 'Trip closed')} style={{ marginTop: 8 }} />
        : r.riding ? <Btn small kind="ghost" title="Give up my seat" onPress={() => ride(r, 'release', 'Seat released')} style={{ marginTop: 8 }} />
        : <Btn small title="Claim a seat" disabled={!r.left} onPress={() => ride(r, 'claim', 'Seat claimed')} style={{ marginTop: 8 }} />}
    </Card>)}
    {d && !d.length ? <Empty text="No trips yet. Driving somewhere? Post it." /> : null}
  </Screen>{toast}</View>;
}

// ---------------- Decision Dice ----------------
type Dice = { id: string; question: string; createdBy: U; mine: boolean; myVote: number | null; options: { i: number; text: string; votes: number }[]; result: number | null; resultText: string | null; method: string; settledAt: number | null; at: number };
export function DecisionDice({ route }: any) {
  const cid = route?.params?.convId; const { toast, show } = useToast(); const [d, err, reload] = useLoad<Dice[]>(cid ? `/addons/b6/convs/${cid}/dice` : null);
  const [q, setQ] = useState(''); const [opts, setOpts] = useState(''); const act = useAct(reload, show);
  const list = opts.split('\n').map(s => s.trim()).filter(Boolean);
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Decision Dice" sub="Vote it out — or let the dice decide" />
    <Card>
      <Field label="Question" value={q} onChangeText={setQ} maxLength={120} placeholder="Where do we eat?" />
      <Field label="Options (one per line)" value={opts} onChangeText={setOpts} multiline placeholder={'Dosa\nPizza\nMomos'} />
      <Btn title="Ask the chat" icon="bolt" disabled={!q.trim() || list.length < 2}
        onPress={() => act('POST', `/addons/b6/convs/${cid}/dice`, { question: q.trim(), options: list }, 'Posted').then(() => { setQ(''); setOpts(''); })} />
    </Card>
    {!d ? <Wait err={err} retry={reload} /> : d.map(x => { const total = x.options.reduce((a, o) => a + o.votes, 0); return <Card key={x.id} style={{ marginTop: S.md }}>
      <Text style={T.h3}>{x.question}</Text>
      <Text style={[T.small, { marginTop: 2 }]}>{x.createdBy?.name} · {ago(x.at)}</Text>
      {x.result !== null ? <View style={{ marginTop: 10 }}><Tag label={x.method === 'roll' ? 'ROLLED' : 'VOTED'} color="#12A27C" /><Text style={[T.h2, { marginTop: 6 }]}>{x.resultText}</Text></View> : null}
      {x.options.map(o => <Pressable key={o.i} disabled={x.result !== null} onPress={() => act('POST', `/addons/b6/dice/${x.id}/vote`, { option: o.i })}
        accessibilityRole="radio" accessibilityState={{ selected: x.myVote === o.i }} style={{ marginTop: 10 }}>
        <View style={{ flexDirection: 'row' }}><Text style={[T.body, { flex: 1, fontWeight: x.myVote === o.i || x.result === o.i ? '800' : '400' }]}>{x.myVote === o.i ? '● ' : '○ '}{o.text}</Text><Text style={T.small}>{o.votes}</Text></View>
        <Bar pct={total ? (100 * o.votes) / total : 0} color={x.result === o.i ? '#12A27C' : C.violet} />
      </Pressable>)}
      {x.mine && x.result === null ? <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <Btn small kind="ink" title="Settle by votes" disabled={!total} onPress={() => act('POST', `/addons/b6/dice/${x.id}/settle`, { method: 'vote' }, 'Decided')} />
        <Btn small title="Roll the dice" onPress={() => act('POST', `/addons/b6/dice/${x.id}/settle`, { method: 'roll' }, 'Rolled!')} />
      </View> : null}
    </Card>; })}
    {d && !d.length ? <Empty text="Nothing to decide yet." /> : null}
  </Screen>{toast}</View>;
}

// ---------------- Gift Pool ----------------
type Gift = { id: string; forName: string; idea: string; target: number; currency: string; purchased: boolean; organiser: U; isOrganiser: boolean; pledged: number; pct: number; myPledge: number; pledges: { user: U; amount: number }[] };
export function GiftPool({ route }: any) {
  const cid = route?.params?.convId; const { toast, show } = useToast(); const [d, err, reload] = useLoad<Gift[]>(cid ? `/addons/b6/convs/${cid}/gifts` : null);
  const [who, setWho] = useState(''); const [idea, setIdea] = useState(''); const [target, setTarget] = useState(''); const [pl, setPl] = useState<Record<string, string>>({});
  const act = useAct(reload, show);
  const make = () => { const minor = Math.round(parseFloat(target) * 100); if (!(minor > 0)) return show('Enter a target amount', 'err');
    act('POST', `/addons/b6/convs/${cid}/gifts`, { forName: who.trim(), idea: idea.trim(), target: minor }, 'Gift Pool started').then(() => { setWho(''); setIdea(''); setTarget(''); }); };
  const pledge = (g: Gift) => { const minor = Math.round(parseFloat(pl[g.id] ?? '0') * 100); if (!(minor >= 0)) return show('Enter an amount', 'err');
    act('POST', `/addons/b6/gifts/${g.id}/pledge`, { amount: minor }, minor ? 'Pledged' : 'Pledge withdrawn').then(() => setPl({ ...pl, [g.id]: '' })); };
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Gift Pool" sub="Chip in on a group gift — pledges only, no money moves here" />
    <Card>
      <Field label="Gift for" value={who} onChangeText={setWho} maxLength={80} placeholder="Aarav" />
      <Field label="Idea" value={idea} onChangeText={setIdea} maxLength={140} placeholder="Noise-cancelling headphones" />
      <Field label="Target (₹)" value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="3000" />
      <Btn title="Start pool" icon="gift" disabled={!who.trim() || !target.trim()} onPress={make} />
    </Card>
    {!d ? <Wait err={err} retry={reload} /> : d.map(g => <Card key={g.id} style={{ marginTop: S.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={[T.h3, { flex: 1 }]}>For {g.forName}</Text>
        {g.purchased ? <Tag label="BOUGHT" color="#12A27C" /> : <Tag label={`${g.pct}%`} />}</View>
      {g.idea ? <Text style={[T.small, { marginTop: 2 }]}>{g.idea}</Text> : null}
      <Text style={[T.body, { marginTop: 8 }]}>{cur(g.pledged, g.currency)} of {cur(g.target, g.currency)}</Text>
      <Bar pct={g.pct} color={g.purchased ? '#12A27C' : C.violet} />
      <Text style={[T.small, { marginTop: 6 }]}>Organised by {g.organiser?.name}{g.pledges.length ? ` · ${g.pledges.map(p => `${p.user?.name} ${cur(p.amount, g.currency)}`).join(', ')}` : ''}</Text>
      {!g.purchased ? <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginTop: 8 }}>
        <View style={{ flex: 1 }}><Field value={pl[g.id] ?? ''} onChangeText={t => setPl({ ...pl, [g.id]: t })} keyboardType="decimal-pad" placeholder={g.myPledge ? `Yours: ${(g.myPledge / 100).toFixed(0)} — 0 to withdraw` : 'Your pledge'} /></View>
        <Btn small title="Pledge" disabled={!(pl[g.id] ?? '').trim()} onPress={() => pledge(g)} style={{ marginBottom: 12 }} />
      </View> : null}
      {g.isOrganiser && !g.purchased ? <Btn small kind="ink" title="Mark as bought" onPress={() => act('POST', `/addons/b6/gifts/${g.id}/purchased`, undefined, 'Marked bought')} /> : null}
    </Card>)}
    {d && !d.length ? <Empty text="No gift pools in this chat yet." /> : null}
  </Screen>{toast}</View>;
}

export const SCREENS: Record<string, React.ComponentType<any>> = { CheckInCircle, PlanBoard, BirthdayBuddy, RideRota, DecisionDice, GiftPool };
export const ENTRIES: AddonEntry[] = [
  { route: 'CheckInCircle', title: 'Check-in Circle', sub: 'A daily mood check-in for group chats', icon: 'smile', module: 'hush', flag: 'hush.checkInCircle', needsConv: true },
  { route: 'PlanBoard', title: 'Plan Board', sub: 'Shared plans with RSVPs', icon: 'calendar', module: 'hush', flag: 'hush.planBoard', needsConv: true },
  { route: 'BirthdayBuddy', title: 'Birthday Buddy', sub: 'Never miss a birthday in the chat', icon: 'gift', module: 'hush', flag: 'hush.birthdayBuddy', needsConv: true },
  { route: 'RideRota', title: 'Ride Rota', sub: 'Who’s driving and who’s riding', icon: 'compass', module: 'hush', flag: 'hush.rideRota', needsConv: true },
  { route: 'DecisionDice', title: 'Decision Dice', sub: 'Vote or roll to decide', icon: 'bolt', module: 'hush', flag: 'hush.decisionDice', needsConv: true },
  { route: 'GiftPool', title: 'Gift Pool', sub: 'Pledge toward a group gift', icon: 'heart', module: 'hush', flag: 'hush.giftPool', needsConv: true },
];
