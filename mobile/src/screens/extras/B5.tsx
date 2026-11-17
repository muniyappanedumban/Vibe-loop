// Add-on batch 5 (Glow): Collab Canvas · Creator Office Hours · Fan Missions · Moodboard Pins · Time-Lock Polls · Thank-You Stories.
// Every screen talks to /addons/b5/* — the server enforces the admin switches (addons.glow.*) and every rule.
import React, { useCallback, useState } from 'react';
import { View, Text, ActivityIndicator, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { C, S, T } from '../../theme/tokens';
import { Screen, Header, Card, Row, Section, Btn, Field, Chip, useToast, Tag, Toggle, Bar } from '../../components/UI';
import { call, useSession } from '../../lib/api';
import { uploadMedia } from '../../lib/uploads';
import { ago, DAY, HOUR } from '../../lib/util';

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
const Empty = ({ t }: { t: string }) => <Text style={T.small}>{t}</Text>;
const when = (t: number) => new Date(t).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const chips = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginVertical: 8 };
function useAct(show: (m: string, k?: 'ok' | 'err') => void, after: () => void) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<any>, ok?: string) => { setBusy(true); try { await fn(); if (ok) show(ok); after(); } catch (e: any) { show(e.message, 'err'); } finally { setBusy(false); } };
  return [busy, run] as const;
}

// ---------------- Collab Canvas ----------------
type Tile = { id: string; text: string; at: number; by: U };
type Cnv = { id: string; title: string; locked: boolean; owner: U; mine: boolean; authors: U[]; isAuthor: boolean; nextUp: U; myTurn: boolean; tiles: Tile[] };
export function CollabCanvas({ route }: any) {
  const { toast, show } = useToast(); const [d, err, reload] = useLoad<{ mine: Cnv[]; final: Cnv[] }>('/addons/b5/canvas');
  const [title, setTitle] = useState(''); const [who, setWho] = useState(''); const [open, setOpen] = useState<string | null>(route?.params?.id ?? null);
  const [tile, setTile] = useState(''); const [busy, run] = useAct(show, reload);
  const create = () => run(() => call('POST', '/addons/b5/canvas', { title: title.trim(), coauthors: who.split(/[\s,]+/).filter(Boolean) }).then(() => { setTitle(''); setWho(''); }), 'Canvas started — invites sent');
  const add = (c: Cnv) => run(() => call('POST', `/addons/b5/canvas/${c.id}/tiles`, { text: tile.trim() }).then(() => setTile('')), 'Tile added');
  const lock = (c: Cnv) => run(() => call('POST', `/addons/b5/canvas/${c.id}/lock`, { locked: !c.locked }), c.locked ? 'Unlocked' : 'Locked — the board is final');
  const Board = ({ c }: { c: Cnv }) => <Card style={{ marginBottom: S.md }}>
    <Row icon={c.locked ? 'lock' : 'layers'} title={c.title} sub={`${c.authors.map(a => a?.name).join(', ')}${c.locked ? ' · final' : c.nextUp ? ` · next: ${c.nextUp.name}` : ''}`} onPress={() => setOpen(open === c.id ? null : c.id)} />
    {open === c.id ? <View>
      {c.tiles.map((t, i) => <View key={t.id} style={{ padding: 10, borderRadius: 12, backgroundColor: C.violetSoft, marginBottom: 6 }}><Text style={T.body}>{t.text}</Text><Text style={T.tiny}>{i + 1} · {t.by?.name}</Text></View>)}
      {!c.tiles.length ? <Empty t="No tiles yet." /> : null}
      {c.isAuthor && !c.locked ? (c.myTurn ? <View style={{ marginTop: 8 }}><Field label="Your tile" value={tile} onChangeText={setTile} maxLength={280} multiline placeholder="Add the next line…" />
        <Btn small title="Add tile" disabled={busy || !tile.trim()} onPress={() => add(c)} /></View> : <Text style={[T.small, { marginTop: 8 }]}>Waiting for {c.nextUp?.name}’s turn.</Text>) : null}
      {c.mine ? <Btn small kind="ghost" title={c.locked ? 'Unlock' : 'Lock as final'} icon="lock" disabled={busy} onPress={() => lock(c)} style={{ marginTop: 8 }} /> : null}
    </View> : null}
  </Card>;
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Collab Canvas" sub="Write a board together, one tile at a time" />
    <Card>
      <Field label="Canvas title" value={title} onChangeText={setTitle} maxLength={80} placeholder="Our monsoon poem" />
      <Field label="Co-authors (up to 8 @IDs)" value={who} onChangeText={setWho} autoCapitalize="none" placeholder="@aanya.eats @dev.codes" />
      <Btn title={busy ? 'Starting…' : 'Start canvas'} icon="layers" disabled={busy || !title.trim()} onPress={create} />
    </Card>
    {!d ? <Wait err={err} retry={reload} /> : <>
      <Section title={`Your canvases · ${d.mine.length}`}>{d.mine.map(c => <Board key={c.id} c={c} />)}{!d.mine.length ? <Card><Empty t="Start one and invite your people." /></Card> : null}</Section>
      {d.final.length ? <Section title="Finished boards">{d.final.map(c => <Board key={c.id} c={c} />)}</Section> : null}
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Creator Office Hours ----------------
type Slot = { id: string; startsAt: number; minutes: number; topic: string; status: string; creator: U; mine: boolean; bookedByMe: boolean; bookedBy: U };
export function OfficeHours() {
  const { toast, show } = useToast(); const [d, err, reload] = useLoad<{ hosting: Slot[]; booked: Slot[]; hosts: { user: U; open: number }[] }>('/addons/b5/office');
  const [host, setHost] = useState<string | null>(null); const [hs, setHs] = useState<{ creator: U; canBook: boolean; slots: Slot[] } | null>(null);
  const [f, setF] = useState({ inDays: 1, hour: 18, minutes: 30, weeks: 1, topic: '' });
  const loadHost = (ref: string) => { setHost(ref); setHs(null); call<any>('GET', `/addons/b5/office/creator/${encodeURIComponent(ref)}`).then(setHs).catch(e => { show(e.message, 'err'); setHost(null); }); };
  const [busy, run] = useAct(show, () => { reload(); if (host) loadHost(host); });
  const start = () => { const t = new Date(Date.now() + f.inDays * DAY); t.setHours(f.hour, 0, 0, 0); return t.getTime(); };
  const open = () => run(() => call('POST', '/addons/b5/office', { startsAt: start(), minutes: f.minutes, weeks: f.weeks, topic: f.topic.trim() }), 'Slots opened');
  const SlotRow = ({ s }: { s: Slot }) => <Row icon="calendar" tint={s.status === 'cancelled' ? C.inkSoft : C.violet} title={`${when(s.startsAt)} · ${s.minutes} min`}
    sub={[s.topic, s.mine ? (s.bookedBy ? `Booked by ${s.bookedBy.name}` : s.status) : s.bookedByMe ? 'You booked this' : s.status === 'booked' ? 'Taken' : `with ${s.creator?.name}`].filter(Boolean).join(' · ')}
    right={s.status === 'cancelled' ? <Tag label="Cancelled" color={C.inkSoft} bg="#F1F1F4" />
      : s.mine ? <Btn small kind="ghost" title="Cancel" disabled={busy} onPress={() => run(() => call('POST', `/addons/b5/office/${s.id}/cancel`), 'Slot cancelled — booker notified')} />
      : s.bookedByMe ? <Btn small kind="ghost" title="Release" disabled={busy} onPress={() => run(() => call('POST', `/addons/b5/office/${s.id}/release`), 'Booking released')} />
      : s.status === 'open' && hs?.canBook ? <Btn small title="Book" disabled={busy} onPress={() => run(() => call('POST', `/addons/b5/office/${s.id}/book`), 'Booked!')} /> : undefined} />;
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Office Hours" sub="Book time with creators you follow" />
    {!d ? <Wait err={err} retry={reload} /> : <>
      <Section title="Creators with open slots"><Card>
        {d.hosts.map(h => <Row key={h.user?.id} icon="user" title={h.user?.name ?? ''} sub={`${h.open} open slot${h.open === 1 ? '' : 's'}`} onPress={() => h.user && loadHost(h.user.id)} />)}
        {!d.hosts.length ? <Empty t="No one you follow has open slots right now." /> : null}
      </Card></Section>
      {host ? <Section title={hs ? `${hs.creator?.name}’s slots` : 'Loading…'}><Card>
        {!hs ? <ActivityIndicator color={C.violet} /> : <>{!hs.canBook ? <Text style={T.small}>Follow this creator to book.</Text> : null}
          {hs.slots.map(s => <SlotRow key={s.id} s={s} />)}{!hs.slots.length ? <Empty t="No upcoming slots." /> : null}</>}
      </Card></Section> : null}
      <Section title="Your bookings"><Card>{d.booked.map(s => <SlotRow key={s.id} s={s} />)}{!d.booked.length ? <Empty t="Nothing booked yet." /> : null}</Card></Section>
      <Section title="Host office hours"><Card>
        <Text style={T.tiny}>DAY</Text><View style={chips}>{[1, 2, 3, 5, 7].map(n => <Chip key={n} label={n === 1 ? 'Tomorrow' : `In ${n} days`} active={f.inDays === n} onPress={() => setF({ ...f, inDays: n })} />)}</View>
        <Text style={T.tiny}>TIME</Text><View style={chips}>{[10, 14, 18, 20].map(n => <Chip key={n} label={`${n}:00`} active={f.hour === n} onPress={() => setF({ ...f, hour: n })} />)}</View>
        <Text style={T.tiny}>LENGTH</Text><View style={chips}>{[15, 30, 60].map(n => <Chip key={n} label={`${n} min`} active={f.minutes === n} onPress={() => setF({ ...f, minutes: n })} />)}</View>
        <Text style={T.tiny}>REPEAT WEEKLY</Text><View style={chips}>{[1, 2, 4, 8].map(n => <Chip key={n} label={n === 1 ? 'Once' : `${n} weeks`} active={f.weeks === n} onPress={() => setF({ ...f, weeks: n })} />)}</View>
        <Field label="Topic (optional)" value={f.topic} onChangeText={t => setF({ ...f, topic: t })} maxLength={120} placeholder="Editing Q&A" />
        <Btn title={busy ? 'Opening…' : 'Open slots'} icon="calendar" disabled={busy} onPress={open} />
      </Card></Section>
      {d.hosting.length ? <Section title="Your slots"><Card>{d.hosting.map(s => <SlotRow key={s.id} s={s} />)}</Card></Section> : null}
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Fan Missions ----------------
type Msn = { id: string; title: string; detail: string; points: number; active: boolean; creator: U; mine: boolean; completed: number; myClaim: { status: string; proof: string } | null };
type Board = { user: U; points: number }[];
export function FanMissions() {
  const { toast, show } = useToast(); const [d, err, reload] = useLoad<{ mine: Msn[]; feed: Msn[]; review: { id: string; proof: string; fan: U; mission: string; points: number }[]; board: Board }>('/addons/b5/missions');
  const [f, setF] = useState({ title: '', detail: '', points: 20 }); const [proof, setProof] = useState<Record<string, string>>({}); const [busy, run] = useAct(show, reload);
  const create = () => run(() => call('POST', '/addons/b5/missions', { title: f.title.trim(), detail: f.detail.trim(), points: f.points }).then(() => setF({ ...f, title: '', detail: '' })), 'Mission posted');
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Fan Missions" sub="Small quests from creators — earn points" />
    {!d ? <Wait err={err} retry={reload} /> : <>
      <Section title="Missions from creators you follow">{d.feed.map(m => <Card key={m.id} style={{ marginBottom: S.md }}>
        <Row icon="flag" title={m.title} sub={`${m.creator?.name} · ${m.points} pts · ${m.completed} done`} right={m.myClaim ? <Tag label={m.myClaim.status} /> : undefined} />
        {m.detail ? <Text style={[T.body, { marginBottom: 8 }]}>{m.detail}</Text> : null}
        {m.myClaim?.status !== 'approved' ? <><Field label={m.myClaim ? 'Update your proof' : 'Proof (what you did)'} value={proof[m.id] ?? ''} onChangeText={t => setProof({ ...proof, [m.id]: t })} maxLength={500} placeholder="Shared it on my story at 9pm" />
          <Btn small title="Mark done" disabled={busy || (proof[m.id] ?? '').trim().length < 3} onPress={() => run(() => call('POST', `/addons/b5/missions/${m.id}/claim`, { proof: proof[m.id].trim() }), 'Sent for approval')} /></> : null}
      </Card>)}{!d.feed.length ? <Card><Empty t="Creators you follow haven’t posted missions yet." /></Card> : null}</Section>
      <Section title="Post a mission"><Card>
        <Field label="Mission" value={f.title} onChangeText={t => setF({ ...f, title: t })} maxLength={80} placeholder="Share my newest loop" />
        <Field label="Details (optional)" value={f.detail} onChangeText={t => setF({ ...f, detail: t })} maxLength={500} multiline />
        <View style={chips}>{[10, 20, 50, 100].map(n => <Chip key={n} label={`${n} pts`} active={f.points === n} onPress={() => setF({ ...f, points: n })} />)}</View>
        <Btn title="Post mission" icon="flag" disabled={busy || f.title.trim().length < 3} onPress={create} />
      </Card></Section>
      {d.review.length ? <Section title={`To review · ${d.review.length}`}><Card>{d.review.map(c => <Row key={c.id} icon="check" title={`${c.fan?.name} · ${c.mission}`} sub={c.proof}
        right={<View style={{ flexDirection: 'row', gap: 6 }}><Btn small title="OK" disabled={busy} onPress={() => run(() => call('POST', `/addons/b5/missions/claims/${c.id}`, { approve: true }), `+${c.points} pts awarded`)} />
          <Btn small kind="ghost" title="No" disabled={busy} onPress={() => run(() => call('POST', `/addons/b5/missions/claims/${c.id}`, { approve: false }), 'Declined')} /></View>} />)}</Card></Section> : null}
      {d.mine.length ? <Section title="Your missions"><Card>{d.mine.map(m => <Row key={m.id} icon="flag" tint={m.active ? C.violet : C.inkSoft} title={m.title} sub={`${m.points} pts · ${m.completed} done${m.active ? '' : ' · closed'}`}
        right={m.active ? <Btn small kind="ghost" title="Close" disabled={busy} onPress={() => run(() => call('POST', `/addons/b5/missions/${m.id}/close`), 'Mission closed')} /> : undefined} />)}</Card></Section> : null}
      <Section title="Your top fans"><Card>{d.board.map((b, i) => <Row key={b.user?.id ?? i} icon="trophy" tint={i < 3 ? C.tangerine : C.violet} title={`${i + 1}. ${b.user?.name}`} right={<Tag label={`${b.points} pts`} />} />)}
        {!d.board.length ? <Empty t="Approve proofs to fill your board." /> : null}</Card></Section>
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Moodboard Pins ----------------
type Pin = { id: string; mediaUrl: string | null; note: string };
type MB = { id: string; name: string; public: boolean; count: number; cover: string | null; pins: Pin[] | null };
const src = (u: string) => ({ uri: u.startsWith('/') ? useSession.getState().apiUrl + u : u });
export function MoodboardPins() {
  const { toast, show } = useToast(); const [d, err, reload] = useLoad<MB[]>('/addons/b5/moodboards');
  const [name, setName] = useState(''); const [pub, setPub] = useState(false); const [openId, setOpenId] = useState<string | null>(null);
  const [b, berr, breload] = useLoad<MB>(openId ? `/addons/b5/moodboards/${openId}` : null); const [note, setNote] = useState(''); const [media, setMedia] = useState<string | null>(null);
  const [busy, run] = useAct(show, () => { reload(); breload(); });
  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 }); if (r.canceled) return;
    const a = r.assets[0]; await run(async () => { const up = await uploadMedia(a.uri, a.mimeType ?? 'image/jpeg', a.fileName ?? 'pin.jpg'); setMedia(up.url); }, 'Photo uploaded');
  };
  const pin = () => run(() => call('POST', `/addons/b5/moodboards/${openId}/pins`, { mediaUrl: media, note: note.trim() }).then(() => { setNote(''); setMedia(null); }), 'Pinned');
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Moodboard Pins" sub="Your photos + notes, gathered by vibe" />
    <Card>
      <Field label="New moodboard" value={name} onChangeText={setName} maxLength={60} placeholder="Desk setup ideas" />
      <Toggle value={pub} onChange={setPub} label="Public (anyone can view)" />
      <Btn title="Create" icon="palette" disabled={busy || !name.trim()} onPress={() => run(() => call('POST', '/addons/b5/moodboards', { name: name.trim(), public: pub }).then(() => setName('')), 'Moodboard created')} style={{ marginTop: 8 }} />
    </Card>
    {!d ? <Wait err={err} retry={reload} /> : <Section title={`Your moodboards · ${d.length}`}><Card>
      {d.map(m => <Row key={m.id} icon={m.public ? 'globe' : 'lock'} title={m.name} sub={`${m.count} pin${m.count === 1 ? '' : 's'} · ${m.public ? 'Public' : 'Private'}`} onPress={() => setOpenId(openId === m.id ? null : m.id)} />)}
      {!d.length ? <Empty t="No moodboards yet." /> : null}
    </Card></Section>}
    {openId ? <Section title={b?.name ?? 'Moodboard'}>{!b ? <Wait err={berr} retry={breload} /> : <Card>
      <Toggle value={b.public} onChange={v => run(() => call('PATCH', `/addons/b5/moodboards/${b.id}`, { public: v }), v ? 'Now public' : 'Now private')} label="Public" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 }}>{(b.pins ?? []).map(p => <View key={p.id} style={{ width: '47%', borderRadius: 12, backgroundColor: C.violetSoft, padding: 6 }}>
        {p.mediaUrl ? <Image source={src(p.mediaUrl)} style={{ width: '100%', height: 110, borderRadius: 8 }} accessibilityLabel={p.note || 'Pinned photo'} /> : null}
        {p.note ? <Text style={[T.small, { marginTop: 4 }]}>{p.note}</Text> : null}
        <Btn small kind="ghost" title="Unpin" disabled={busy} onPress={() => run(() => call('DELETE', `/addons/b5/moodboards/${b.id}/pins/${p.id}`), 'Unpinned')} style={{ marginTop: 4 }} />
      </View>)}</View>
      {!(b.pins ?? []).length ? <Empty t="Pin a photo or a note to start." /> : null}
      {media ? <Image source={src(media)} style={{ width: 80, height: 80, borderRadius: 8, marginBottom: 8 }} accessibilityLabel="Photo to pin" /> : null}
      <Btn small kind="ghost" title={media ? 'Change photo' : 'Add photo'} icon="image" disabled={busy} onPress={pick} />
      <Field label="Note" value={note} onChangeText={setNote} maxLength={300} placeholder="Warm light, wood tones" />
      <Btn small title="Pin it" icon="pin" disabled={busy || (!media && !note.trim())} onPress={pin} />
      <Btn small kind="danger" title="Delete moodboard" disabled={busy} onPress={() => run(() => call('DELETE', `/addons/b5/moodboards/${b.id}`).then(() => setOpenId(null)), 'Deleted')} style={{ marginTop: 10 }} />
    </Card>}</Section> : null}
  </Screen>{toast}</View>;
}

// ---------------- Time-Lock Polls ----------------
type Poll = { id: string; question: string; options: string[]; revealAt: number; revealed: boolean; creator: U; mine: boolean; myVote: number | null; votes: number; results: number[] | null };
const REVEAL = [{ l: '1 hour', ms: HOUR }, { l: '6 hours', ms: 6 * HOUR }, { l: '1 day', ms: DAY }, { l: '3 days', ms: 3 * DAY }, { l: '1 week', ms: 7 * DAY }];
export function TimeLockPolls() {
  const { toast, show } = useToast(); const [d, err, reload] = useLoad<Poll[]>('/addons/b5/polls');
  const [q, setQ] = useState(''); const [opts, setOpts] = useState('');  const [rv, setRv] = useState(DAY); const [busy, run] = useAct(show, reload);
  const make = () => run(() => call('POST', '/addons/b5/polls', { question: q.trim(), options: opts.split('\n').map(s => s.trim()).filter(Boolean), revealAt: Date.now() + rv }).then(() => { setQ(''); setOpts(''); }), 'Poll sealed');
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Time-Lock Polls" sub="Nobody sees results until reveal time" />
    <Card>
      <Field label="Question" value={q} onChangeText={setQ} maxLength={200} placeholder="Which loop should I post next?" />
      <Field label="Options (2–6, one per line)" value={opts} onChangeText={setOpts} multiline placeholder={'Sunset timelapse\nStreet food tour'} />
      <Text style={T.tiny}>REVEAL IN</Text><View style={chips}>{REVEAL.map(r => <Chip key={r.l} label={r.l} active={rv === r.ms} onPress={() => setRv(r.ms)} />)}</View>
      <Btn title={busy ? 'Sealing…' : 'Post poll'} icon="clock" disabled={busy || q.trim().length < 3 || opts.split('\n').filter(s => s.trim()).length < 2} onPress={make} />
    </Card>
    {!d ? <Wait err={err} retry={reload} /> : <Section title="Polls from you + people you follow">
      {d.map(p => <Card key={p.id} style={{ marginBottom: S.md }}>
        <Text style={T.tiny}>{p.creator?.name} · {p.revealed ? 'RESULTS OUT' : `REVEALS ${when(p.revealAt).toUpperCase()}`} · {p.votes} vote{p.votes === 1 ? '' : 's'}</Text>
        <Text style={[T.h2, { marginVertical: 6 }]}>{p.question}</Text>
        {p.options.map((o, i) => <View key={i} style={{ marginBottom: 8 }}>
          {p.revealed && p.results ? <><Text style={T.body}>{o}{p.myVote === i ? ' · your vote' : ''} — {p.results[i]}</Text><Bar pct={p.votes ? (p.results[i] / p.votes) * 100 : 0} /></>
            : p.myVote === null ? <Btn small kind="ghost" title={o} disabled={busy} onPress={() => run(() => call('POST', `/addons/b5/polls/${p.id}/vote`, { choice: i }), 'Vote locked in')} />
            : <Text style={T.body}>{p.myVote === i ? '● ' : '○ '}{o}</Text>}
        </View>)}
        {!p.revealed && p.myVote !== null ? <Tag label="Voted · sealed until reveal" /> : null}
        {p.mine ? <Btn small kind="ghost" title="Delete" disabled={busy} onPress={() => run(() => call('DELETE', `/addons/b5/polls/${p.id}`), 'Poll deleted')} style={{ marginTop: 6 }} /> : null}
      </Card>)}
      {!d.length ? <Card><Empty t="No polls yet — seal the first one." /></Card> : null}
    </Section>}
  </Screen>{toast}</View>;
}

// ---------------- Thank-You Stories ----------------
type Thx = { id: string; text: string; context: string; status: string; at: number; author: U; subject: U };
export function ThankYouStories() {
  const { toast, show } = useToast(); const [d, err, reload] = useLoad<{ inbox: Thx[]; aboutMe: Thx[]; written: Thx[] }>('/addons/b5/thanks');
  const [to, setTo] = useState(''); const [text, setText] = useState(''); const [ctx, setCtx] = useState('help'); const [busy, run] = useAct(show, reload);
  const send = () => run(() => call('POST', '/addons/b5/thanks', { to: to.trim(), text: text.trim(), context: ctx }).then(() => { setTo(''); setText(''); }), 'Sent — it shows once they approve');
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Thank-You Stories" sub="Say thanks out loud — with their OK" />
    <Card>
      <Field label="Who helped you (@ID)" value={to} onChangeText={setTo} autoCapitalize="none" placeholder="@dev.codes" />
      <View style={chips}><Chip label="Helped me" active={ctx === 'help'} onPress={() => setCtx('help')} /><Chip label="We collabed" active={ctx === 'collab'} onPress={() => setCtx('collab')} /></View>
      <Field label="Your story" value={text} onChangeText={setText} multiline maxLength={600} placeholder="They stayed up to help me fix my edit…" />
      <Btn title={busy ? 'Sending…' : 'Send thank-you'} icon="heart" disabled={busy || to.trim().length < 2 || text.trim().length < 10} onPress={send} />
    </Card>
    {!d ? <Wait err={err} retry={reload} /> : <>
      {d.inbox.length ? <Section title={`Waiting for your OK · ${d.inbox.length}`}><Card>{d.inbox.map(t => <View key={t.id} style={{ marginBottom: 10 }}>
        <Row icon="gift" title={`From ${t.author?.name}`} sub={t.text} />
        <View style={{ flexDirection: 'row', gap: 8 }}><Btn small title="Show publicly" disabled={busy} onPress={() => run(() => call('POST', `/addons/b5/thanks/${t.id}/decide`, { approve: true }), 'Now on your profile')} />
          <Btn small kind="ghost" title="Keep private" disabled={busy} onPress={() => run(() => call('POST', `/addons/b5/thanks/${t.id}/decide`, { approve: false }), 'Declined')} /></View>
      </View>)}</Card></Section> : null}
      <Section title="Thanks about you"><Card>{d.aboutMe.map(t => <Row key={t.id} icon="heart" title={t.author?.name ?? ''} sub={`${t.text} · ${ago(t.at)}`} />)}{!d.aboutMe.length ? <Empty t="Approved stories appear here and on your profile." /> : null}</Card></Section>
      <Section title="You wrote"><Card>{d.written.map(t => <Row key={t.id} icon="send" title={`To ${t.subject?.name}`} sub={t.text}
        right={<Tag label={t.status} color={t.status === 'approved' ? '#12A27C' : C.inkSoft} bg={t.status === 'approved' ? '#E3F6EF' : '#F1F1F4'} />} />)}{!d.written.length ? <Empty t="Nothing yet." /> : null}</Card></Section>
    </>}
  </Screen>{toast}</View>;
}

export const SCREENS: Record<string, React.ComponentType<any>> = { CollabCanvas, OfficeHours, FanMissions, MoodboardPins, TimeLockPolls, ThankYouStories };
export const ENTRIES: AddonEntry[] = [
  { route: 'CollabCanvas', title: 'Collab Canvas', sub: 'Write a board with up to 8 co-authors, tile by tile', icon: 'layers', module: 'glow', flag: 'glow.collabCanvas' },
  { route: 'OfficeHours', title: 'Creator Office Hours', sub: 'Book a slot with creators you follow', icon: 'calendar', module: 'glow', flag: 'glow.officeHours' },
  { route: 'FanMissions', title: 'Fan Missions', sub: 'Complete creator quests, climb their board', icon: 'flag', module: 'glow', flag: 'glow.fanMissions' },
  { route: 'MoodboardPins', title: 'Moodboard Pins', sub: 'Your photos + notes in named boards', icon: 'palette', module: 'glow', flag: 'glow.moodboards' },
  { route: 'TimeLockPolls', title: 'Time-Lock Polls', sub: 'Results stay sealed until the reveal', icon: 'clock', module: 'glow', flag: 'glow.timeLockPolls' },
  { route: 'ThankYouStories', title: 'Thank-You Stories', sub: 'Public thanks, shown once they approve', icon: 'gift', module: 'glow', flag: 'glow.thankYouStories' },
];
