// Add-on batch 3 (Glow): Local Pulse · Skill Swap Board · Ask Box · Memory Lane · Goal Ladder · Wish Shelf.
// Every screen talks to /addons/b3/* — the server enforces the admin switches (addons.glow.*) and every rule.
import React, { useCallback, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { C, S, T } from '../../theme/tokens';
import { Screen, Header, Card, Row, Section, Btn, Field, Chip, Tag, Bar, Toggle, useToast } from '../../components/UI';
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
const Empty = ({ text }: { text: string }) => <Text style={[T.small, { paddingVertical: 8 }]}>{text}</Text>;
const name = (u: U) => u ? `@${u.handle}` : 'Someone';
function useAct() {
  const { toast, show } = useToast(); const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<any>, ok?: string, after?: () => void) => {
    setBusy(true); try { await fn(); if (ok) show(ok); after?.(); } catch (e: any) { show(e.message, 'err'); } finally { setBusy(false); }
  };
  return { toast, show, busy, run };
}

// ---------------- Local Pulse ----------------
type Pulse = { id: string; area: string; text: string; at: number; expiresAt: number; user: U; mine: boolean };
export function LocalPulse() {
  const { toast, busy, run } = useAct(); const [area, setArea] = useState<string | null>(null);
  const [d, err, reload] = useLoad<{ items: Pulse[] }>(`/addons/b3/pulse${area ? `?area=${encodeURIComponent(area)}` : ''}`);
  const [areas, , reloadAreas] = useLoad<{ area: string; count: number }[]>('/addons/b3/pulse/areas');
  const [a, setA] = useState(''); const [txt, setTxt] = useState('');
  const refresh = () => { reload(); reloadAreas(); };
  const post = () => run(() => call('POST', '/addons/b3/pulse', { area: a.trim(), text: txt.trim() }), 'Posted to Local Pulse', () => { setTxt(''); refresh(); });
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Local Pulse" sub="What’s happening around you, right now" />
    <Card>
      <Field label="Area" value={a} onChangeText={setA} maxLength={60} placeholder="e.g. Indiranagar" />
      <Field label="Update" value={txt} onChangeText={setTxt} maxLength={280} multiline placeholder="Road closed near the metro…" />
      <Btn title={busy ? 'Posting…' : 'Post update'} disabled={busy || a.trim().length < 2 || !txt.trim()} onPress={post} />
    </Card>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: S.md }}>
      <Chip label="All areas" active={!area} onPress={() => setArea(null)} />
      {(areas || []).map(x => <Chip key={x.area} label={`${x.area} · ${x.count}`} active={area?.toLowerCase() === x.area.toLowerCase()} onPress={() => setArea(x.area)} />)}
    </View>
    <Section title={area ? `In ${area}` : 'Latest'}>
      {!d ? <Wait err={err} retry={reload} /> : !d.items.length ? <Empty text="No live updates here. Updates fade after a few hours." /> : d.items.map(p =>
        <Card key={p.id} style={{ marginBottom: S.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Tag label={p.area} /><Text style={T.tiny}>{ago(p.at)}</Text></View>
          <Text style={[T.body, { marginVertical: 6 }]}>{p.text}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={T.small}>{name(p.user)} · fades {ago(p.expiresAt).replace(' ago', '')}</Text>
            {p.mine ? <Btn small kind="ghost" title="Delete" onPress={() => run(() => call('DELETE', `/addons/b3/pulse/${p.id}`), 'Deleted', refresh)} />
              : <Btn small kind="ghost" icon="flag" title="Report" onPress={() => run(() => call('POST', `/addons/b3/pulse/${p.id}/report`, { reason: 'Reported from Local Pulse' }), 'Thanks — our team will review it', refresh)} />}
          </View>
        </Card>)}
    </Section>
  </Screen>{toast}</View>;
}

// ---------------- Skill Swap Board ----------------
type Skill = { id: string; teach: string; learn: string; note: string; open: boolean; at: number; user: U; mine: boolean; score?: number; perfect?: boolean };
type Swap = { id: string; status: string; message: string; at: number; from: U; to: U; incoming: boolean; listing: { teach: string; learn: string } | null };
export function SkillSwapBoard() {
  const { toast, busy, run } = useAct(); const [q, setQ] = useState('');
  const [d, err, reload] = useLoad<{ board: Skill[]; mine: Skill[] }>('/addons/b3/skills');
  const [swaps, , reloadSwaps] = useLoad<Swap[]>('/addons/b3/swaps');
  const [teach, setTeach] = useState(''); const [learn, setLearn] = useState('');
  const [matches, setMatches] = useState<{ id: string; rows: Skill[] } | null>(null);
  const refresh = () => { reload(); reloadSwaps(); };
  const add = () => run(() => call('POST', '/addons/b3/skills', { teach: teach.trim(), learn: learn.trim() }), 'Listing added', () => { setTeach(''); setLearn(''); refresh(); });
  const find = (id: string) => run(async () => setMatches({ id, rows: await call<Skill[]>('GET', `/addons/b3/skills/${id}/matches`) }));
  const ask = (s: Skill) => run(() => call('POST', `/addons/b3/skills/${s.id}/request`, { message: `Swap ${s.learn} for ${s.teach}?` }), 'Request sent', refresh);
  const answer = (s: Swap, action: 'accept' | 'decline') => run(() => call('POST', `/addons/b3/swaps/${s.id}`, { action }), action === 'accept' ? 'Accepted — say hi in Hush!' : 'Declined', refresh);
  const shown = (d?.board || []).filter(s => !q.trim() || (s.teach + ' ' + s.learn).toLowerCase().includes(q.trim().toLowerCase()));
  const SkillCard = ({ s, req }: { s: Skill; req?: boolean }) => <Card style={{ marginBottom: S.sm }}>
    <Text style={T.h3}>Teaches {s.teach}</Text><Text style={T.small}>Wants to learn {s.learn} · {name(s.user)}</Text>
    {s.perfect ? <Tag label="PERFECT SWAP" color={C.ink} bg={C.lime} /> : null}
    {req ? <Btn small title="Request swap" disabled={busy} onPress={() => ask(s)} style={{ marginTop: 8 }} /> : null}
  </Card>;
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Skill Swap Board" sub="Teach one thing, learn another" />
    <Card>
      <Field label="I can teach" value={teach} onChangeText={setTeach} maxLength={60} placeholder="Guitar" />
      <Field label="I want to learn" value={learn} onChangeText={setLearn} maxLength={60} placeholder="Python" />
      <Btn title="Add listing" disabled={busy || teach.trim().length < 2 || learn.trim().length < 2} onPress={add} />
    </Card>
    {!d ? <Wait err={err} retry={reload} /> : <>
      <Section title="My listings">{!d.mine.length ? <Empty text="Add a listing to find a match." /> : d.mine.map(s => <Card key={s.id} style={{ marginBottom: S.sm }}>
        <Text style={T.h3}>{s.teach} ⇄ {s.learn}</Text>{!s.open ? <Tag label="CLOSED" color={C.inkSoft} bg={C.line} /> : null}
        {s.open ? <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Btn small title="Find matches" disabled={busy} onPress={() => find(s.id)} />
          <Btn small kind="ghost" title="Close" onPress={() => run(() => call('DELETE', `/addons/b3/skills/${s.id}`), 'Closed', refresh)} />
        </View> : null}
        {matches?.id === s.id ? (matches.rows.length ? matches.rows.map(m => <SkillCard key={m.id} s={m} req />) : <Empty text="No matches yet — check back soon." />) : null}
      </Card>)}</Section>
      <Section title="Requests">{!swaps?.length ? <Empty text="No swap requests yet." /> : swaps.map(s => <Row key={s.id} icon="users"
        title={s.incoming ? `${name(s.from)} wants a swap` : `You asked ${name(s.to)}`} sub={`${s.listing ? `${s.listing.teach} ⇄ ${s.listing.learn} · ` : ''}${s.status}`}
        right={s.incoming && s.status === 'pending' ? <View style={{ flexDirection: 'row', gap: 6 }}>
          <Btn small title="Accept" onPress={() => answer(s, 'accept')} /><Btn small kind="ghost" title="Decline" onPress={() => answer(s, 'decline')} /></View> : undefined} />)}</Section>
      <Section title="Board"><Field value={q} onChangeText={setQ} placeholder="Search skills" />
        {!shown.length ? <Empty text="Nothing on the board yet." /> : shown.map(s => <SkillCard key={s.id} s={s} req />)}</Section>
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Ask Box ----------------
type Q = { id: string; text: string; anon: boolean; at: number; answer: string | null; answeredAt: number | null; asker: U; owner: U; mine: boolean };
export function AskBox({ route }: any) {
  const target: string | undefined = route?.params?.user;
  return target ? <AskBoxOf target={target} /> : <AskInbox />;
}
function AskBoxOf({ target }: { target: string }) {
  const { toast, busy, run } = useAct(); const [d, err, reload] = useLoad<{ owner: U; answered: Q[] }>(`/addons/b3/ask/box/${encodeURIComponent(target)}`);
  const [txt, setTxt] = useState(''); const [anon, setAnon] = useState(false);
  const send = () => run(() => call('POST', `/addons/b3/ask/${encodeURIComponent(target)}`, { text: txt.trim(), anon }), 'Question sent', () => setTxt(''));
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Ask Box" sub={d ? `Ask ${name(d.owner)} anything` : 'Loading…'} />
    {!d ? <Wait err={err} retry={reload} /> : <>
      <Card><Field label="Your question" value={txt} onChangeText={setTxt} maxLength={300} multiline placeholder="What got you started?" />
        <Toggle value={anon} onChange={setAnon} label="Hide my name from them (staff can still see it)" />
        <Btn title={busy ? 'Sending…' : 'Send question'} disabled={busy || txt.trim().length < 3} onPress={send} style={{ marginTop: 8 }} /></Card>
      <Section title="Answered">{!d.answered.length ? <Empty text="No answers yet." /> : d.answered.map(q => <QCard key={q.id} q={q} />)}</Section>
    </>}
  </Screen>{toast}</View>;
}
const QCard = ({ q, children }: { q: Q; children?: React.ReactNode }) => <Card style={{ marginBottom: S.sm }}>
  <Text style={T.tiny}>{q.asker ? name(q.asker) : 'ANONYMOUS'} · {ago(q.at)}</Text>
  <Text style={[T.h3, { marginTop: 4 }]}>{q.text}</Text>
  {q.answer ? <Text style={[T.body, { marginTop: 6 }]}>{q.answer}</Text> : null}{children}
</Card>;
function AskInbox() {
  const { toast, busy, run } = useAct(); const [d, err, reload] = useLoad<{ pending: Q[]; answered: Q[]; sent: Q[] }>('/addons/b3/ask');
  const [drafts, setDrafts] = useState<Record<string, string>>({}); const [who, setWho] = useState(''); const [tab, setTab] = useState<'pending' | 'answered' | 'sent'>('pending');
  const [nav, setNav] = useState<string | null>(null);
  if (nav) return <AskBoxOf target={nav} />;
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Ask Box" sub="Questions from your people" />
    <Card><Field label="Visit someone’s Ask Box" value={who} onChangeText={setWho} placeholder="@handle" autoCapitalize="none" />
      <Btn small title="Open" disabled={!who.trim()} onPress={() => setNav(who.trim().replace(/^@/, ''))} /></Card>
    {!d ? <Wait err={err} retry={reload} /> : <>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: S.md }}>
        {(['pending', 'answered', 'sent'] as const).map(k => <Chip key={k} label={`${k[0].toUpperCase()}${k.slice(1)} · ${d[k].length}`} active={tab === k} onPress={() => setTab(k)} />)}
      </View>
      <View style={{ marginTop: S.md }}>{!d[tab].length ? <Empty text={tab === 'sent' ? 'You haven’t asked anyone yet.' : 'Nothing here yet.'} /> : d[tab].map(q => <QCard key={q.id} q={q}>
        {tab === 'sent' ? <Text style={T.small}>to {name(q.owner)} · {q.answer ? 'answered' : 'waiting'}</Text> : <>
          {tab === 'pending' ? <Field value={drafts[q.id] || ''} onChangeText={t => setDrafts({ ...drafts, [q.id]: t })} maxLength={1000} multiline placeholder="Answer publicly…" /> : null}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            {tab === 'pending' ? <Btn small title="Answer" disabled={busy || !(drafts[q.id] || '').trim()} onPress={() => run(() => call('POST', `/addons/b3/ask/q/${q.id}/answer`, { text: drafts[q.id].trim() }), 'Answered publicly', reload)} /> : null}
            <Btn small kind="ghost" title="Delete" onPress={() => run(() => call('DELETE', `/addons/b3/ask/q/${q.id}`), 'Deleted', reload)} />
          </View></>}
      </QCard>)}</View>
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Memory Lane ----------------
type MPost = { id: string; text: string; at: number; mood: string; year: number; place: string | null; pinId?: string | null };
export function MemoryLane() {
  const { toast, busy, run } = useAct(); const tz = -new Date().getTimezoneOffset();
  const [d, err, reload] = useLoad<{ day: string; onThisDay: MPost[]; pinned: { id: string; note: string; at: number; post: MPost }[] }>(`/addons/b3/memories?tz=${tz}`);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const thisYear = new Date().getFullYear();
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Memory Lane" sub={d ? `On this day · ${d.day}` : 'Your posts from years past'} />
    {!d ? <Wait err={err} retry={reload} /> : <>
      <Section title="On this day">{!d.onThisDay.length ? <Empty text="No posts from this day in earlier years — come back tomorrow." /> : d.onThisDay.map(p => <Card key={p.id} style={{ marginBottom: S.sm }}>
        <Tag label={`${thisYear - p.year} YEAR${thisYear - p.year > 1 ? 'S' : ''} AGO`} /><Text style={[T.body, { marginTop: 6 }]}>{p.text}</Text>
        {p.pinId ? <Text style={[T.small, { marginTop: 6 }]}>Pinned ✓</Text> : <>
          <Field value={notes[p.id] || ''} onChangeText={t => setNotes({ ...notes, [p.id]: t })} maxLength={200} placeholder="Add a note (optional)" />
          <Btn small icon="pin" title="Pin memory" disabled={busy} onPress={() => run(() => call('POST', '/addons/b3/memories', { postId: p.id, note: (notes[p.id] || '').trim() }), 'Pinned', reload)} /></>}
      </Card>)}</Section>
      <Section title="Pinned memories">{!d.pinned.length ? <Empty text="Pin a memory to keep it here." /> : d.pinned.map(m => <Card key={m.id} style={{ marginBottom: S.sm }}>
        <Text style={T.tiny}>{new Date(m.post.at).toDateString()}</Text><Text style={[T.body, { marginTop: 4 }]}>{m.post.text}</Text>
        {m.note ? <Text style={[T.small, { marginTop: 4 }]}>“{m.note}”</Text> : null}
        <Btn small kind="ghost" title="Unpin" onPress={() => run(() => call('DELETE', `/addons/b3/memories/${m.id}`), 'Unpinned', reload)} style={{ marginTop: 6 }} />
      </Card>)}</Section>
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Goal Ladder ----------------
type Goal = { id: string; title: string; why: string; steps: { id: string; text: string; done: boolean }[]; done: number; total: number; complete: boolean; cheers: number; cheered: boolean; user: U; mine: boolean };
export function GoalLadder() {
  const { toast, show, busy, run } = useAct(); const [d, err, reload] = useLoad<{ goals: Goal[]; friends: Goal[] }>('/addons/b3/goals');
  const [title, setTitle] = useState(''); const [steps, setSteps] = useState<string[]>(['']);
  const create = () => run(() => call('POST', '/addons/b3/goals', { title: title.trim(), steps: steps.map(s => s.trim()).filter(Boolean) }), 'Goal added', () => { setTitle(''); setSteps(['']); reload(); });
  const tick = (g: Goal, step: string) => run(async () => { const r = await call<{ celebrate: boolean }>('POST', `/addons/b3/goals/${g.id}/tick`, { step }); if (r.celebrate) show(`🎉 You finished “${g.title}”!`); }, undefined, reload);
  const GoalCard = ({ g }: { g: Goal }) => <Card style={{ marginBottom: S.sm, backgroundColor: g.complete ? C.violetSoft : undefined }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={T.h3}>{g.title}</Text>{g.complete ? <Tag label="DONE" color={C.ink} bg={C.lime} /> : null}</View>
    {!g.mine ? <Text style={T.small}>{name(g.user)}</Text> : null}
    <Bar pct={g.total ? (100 * g.done) / g.total : 0} /><Text style={[T.tiny, { marginTop: 4 }]}>{g.done}/{g.total} MILESTONES · {g.cheers} CHEERS</Text>
    {g.steps.map(s => <Pressable key={s.id} disabled={!g.mine || busy} onPress={() => tick(g, s.id)} style={{ flexDirection: 'row', paddingVertical: 4 }}>
      <Text style={[T.body, { textDecorationLine: s.done ? 'line-through' : 'none' }]}>{s.done ? '☑' : '☐'} {s.text}</Text></Pressable>)}
    {g.mine ? <Btn small kind="ghost" title="Remove" onPress={() => run(() => call('DELETE', `/addons/b3/goals/${g.id}`), 'Removed', reload)} />
      : <Btn small kind={g.cheered ? 'ghost' : 'prism'} icon="flame" title={g.cheered ? 'Cheered' : 'Cheer'} onPress={() => run(() => call('POST', `/addons/b3/goals/${g.id}/cheer`), undefined, reload)} />}
  </Card>;
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Goal Ladder" sub="Climb one milestone at a time" />
    <Card><Field label="Goal" value={title} onChangeText={setTitle} maxLength={100} placeholder="Run a 10K" />
      {steps.map((s, i) => <Field key={i} label={`Milestone ${i + 1}`} value={s} maxLength={80} onChangeText={t => setSteps(steps.map((x, j) => j === i ? t : x))} />)}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {steps.length < 10 ? <Btn small kind="ghost" title="+ Milestone" onPress={() => setSteps([...steps, ''])} /> : null}
        <Btn small title="Create goal" disabled={busy || title.trim().length < 2 || !steps.some(s => s.trim())} onPress={create} />
      </View></Card>
    {!d ? <Wait err={err} retry={reload} /> : <>
      <Section title="My goals">{!d.goals.length ? <Empty text="No goals yet — add your first above." /> : d.goals.map(g => <GoalCard key={g.id} g={g} />)}</Section>
      <Section title="Friends’ goals">{!d.friends?.length ? <Empty text="Your friends haven’t posted goals yet." /> : d.friends.map(g => <GoalCard key={g.id} g={g} />)}</Section>
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Wish Shelf ----------------
type W = { id: string; title: string; link: string | null; note: string; at: number; claimed?: boolean; claimedByMe?: boolean };
export function WishShelf() {
  const { toast, busy, run } = useAct(); const [d, err, reload] = useLoad<{ items: W[]; friends: { user: U; count: number }[] }>('/addons/b3/wishes');
  const [of, setOf] = useState<string | null>(null);
  const [f, ferr, freload] = useLoad<{ owner: U; items: W[] }>(of ? `/addons/b3/wishes/of/${of}` : null);
  const [title, setTitle] = useState(''); const [link, setLink] = useState(''); const [note, setNote] = useState('');
  const add = () => run(() => call('POST', '/addons/b3/wishes', { title: title.trim(), link: link.trim() || null, note: note.trim() }), 'Added to your shelf', () => { setTitle(''); setLink(''); setNote(''); reload(); });
  const Item = ({ w, children }: { w: W; children?: React.ReactNode }) => <Card style={{ marginBottom: S.sm }}>
    <Text style={T.h3}>{w.title}</Text>{w.note ? <Text style={T.small}>{w.note}</Text> : null}
    {w.link ? <Pressable onPress={() => Linking.openURL(w.link!)}><Text style={[T.small, { color: C.violet, marginTop: 4 }]} numberOfLines={1}>{w.link}</Text></Pressable> : null}{children}
  </Card>;
  if (of) return <View style={{ flex: 1 }}><Screen>
    <Header title="Wish Shelf" sub={f ? `${name(f.owner)}’s shelf · claims stay secret` : 'Loading…'} />
    <Btn small kind="ghost" title="‹ My shelf" onPress={() => setOf(null)} />
    {!f ? <Wait err={ferr} retry={freload} /> : !f.items.length ? <Empty text="Their shelf is empty." /> : f.items.map(w => <Item key={w.id} w={w}>
      {w.claimedByMe ? <Btn small kind="ghost" icon="gift" title="Unclaim" onPress={() => run(() => call('DELETE', `/addons/b3/wishes/${w.id}/claim`), 'Released', freload)} style={{ marginTop: 6 }} />
        : w.claimed ? <Tag label="SOMEONE’S GOT THIS" color={C.inkSoft} bg={C.line} />
          : <Btn small icon="gift" title="I’ll gift this" disabled={busy} onPress={() => run(() => call('POST', `/addons/b3/wishes/${w.id}/claim`), 'Claimed — it’s a secret', freload)} style={{ marginTop: 6 }} />}
    </Item>)}
  </Screen>{toast}</View>;
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Wish Shelf" sub="Things you’d love — friends can quietly pick one" />
    <Card><Field label="Wish" value={title} onChangeText={setTitle} maxLength={100} placeholder="Film camera" />
      <Field label="Link (optional)" value={link} onChangeText={setLink} maxLength={300} autoCapitalize="none" placeholder="https://…" />
      <Field label="Note (optional)" value={note} onChangeText={setNote} maxLength={200} placeholder="Size, colour…" />
      <Btn title="Add to shelf" disabled={busy || title.trim().length < 2} onPress={add} /></Card>
    {!d ? <Wait err={err} retry={reload} /> : <>
      <Section title="My shelf">{!d.items.length ? <Empty text="Your shelf is empty." /> : d.items.map(w => <Item key={w.id} w={w}>
        <Btn small kind="ghost" title="Remove" onPress={() => run(() => call('DELETE', `/addons/b3/wishes/${w.id}`), 'Removed', reload)} style={{ marginTop: 6 }} /></Item>)}</Section>
      <Section title="Friends’ shelves">{!d.friends.length ? <Empty text="No friend has a shelf yet." /> : d.friends.map(x => x.user && <Row key={x.user.id} icon="gift"
        title={x.user.name} sub={`${x.count} wish${x.count === 1 ? '' : 'es'}`} onPress={() => setOf(x.user!.id)} />)}</Section>
    </>}
  </Screen>{toast}</View>;
}

export const SCREENS: Record<string, React.ComponentType<any>> = { LocalPulse, SkillSwapBoard, AskBox, MemoryLane, GoalLadder, WishShelf };
export const ENTRIES: AddonEntry[] = [
  { route: 'LocalPulse', title: 'Local Pulse', sub: 'Quick updates tagged to your area — they fade in hours', icon: 'compass', module: 'glow', flag: 'glow.localPulse' },
  { route: 'SkillSwapBoard', title: 'Skill Swap Board', sub: 'Teach what you know, learn what you don’t', icon: 'bulb', module: 'glow', flag: 'glow.skillSwap' },
  { route: 'AskBox', title: 'Ask Box', sub: 'Get questions, answer the best ones publicly', icon: 'comment', module: 'glow', flag: 'glow.askBox' },
  { route: 'MemoryLane', title: 'Memory Lane', sub: 'Your posts from this day in years past', icon: 'clock', module: 'glow', flag: 'glow.memoryLane' },
  { route: 'GoalLadder', title: 'Goal Ladder', sub: 'Public goals, milestone by milestone — friends cheer', icon: 'trophy', module: 'glow', flag: 'glow.goalLadder' },
  { route: 'WishShelf', title: 'Wish Shelf', sub: 'A wishlist friends can secretly claim', icon: 'gift', module: 'glow', flag: 'glow.wishShelf' },
];
