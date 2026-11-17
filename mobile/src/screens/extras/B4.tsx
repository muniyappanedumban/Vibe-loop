// Add-on batch 4 (Glow): Photo Prompt · Mentor Match · Hidden Gems · Recipe Box · Book Nook · Meetup Board.
// Every screen talks to /addons/b4/* — the server enforces the admin switches (addons.glow.*) and every rule.
import React, { useCallback, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { C, S, T } from '../../theme/tokens';
import { Screen, Header, Card, Row, Section, Btn, Field, Chip, useToast, Tag } from '../../components/UI';
import { call } from '../../lib/api';
import { ago } from '../../lib/util';
import { uploadMedia } from '../../lib/uploads';
import { pickMedia } from '../../chat/media';
import { mediaUri } from '../Studio';

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
const Chips = ({ children }: { children: React.ReactNode }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>{children}</View>;
const when = (t: number) => new Date(t).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function useAct() {
  const { toast, show } = useToast(); const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<any>, ok?: string) => { setBusy(true); try { await fn(); if (ok) show(ok); } catch (e: any) { show(e.message, 'err'); } finally { setBusy(false); } };
  return { toast, show, busy, run };
}

// ---------------- Photo Prompt Weekly ----------------
type Entry = { id: string; mediaUrl: string; caption: string; at: number; user: U; mine: boolean; votes: number; voted: boolean };
export function PhotoPrompt() {
  const { toast, busy, run } = useAct();
  const [d, err, reload] = useLoad<{ week: string; theme: { title: string; hint: string } | null; votesLeft: number; votesPerWeek: number; myEntry: Entry | null; entries: Entry[] }>('/addons/b4/photo-prompt');
  const [caption, setCaption] = useState('');
  const enter = () => run(async () => {
    const p = await pickMedia('gallery', 'images'); if (!p) return;
    const up = await uploadMedia(p.uri, p.mime, p.name);
    await call('POST', '/addons/b4/photo-prompt/entries', { mediaUrl: up.url, caption: caption.trim() }); setCaption(''); reload();
  }, 'Entry submitted');
  const vote = (e: Entry) => run(async () => { await call('POST', `/addons/b4/photo-prompt/entries/${e.id}/vote`); reload(); });
  const withdraw = (e: Entry) => run(async () => { await call('DELETE', `/addons/b4/photo-prompt/entries/${e.id}`); reload(); }, 'Entry withdrawn');
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Photo Prompt" sub={d ? `${d.week} · ${d.votesLeft} of ${d.votesPerWeek} votes left` : 'This week’s theme'} />
    {!d ? <Wait err={err} retry={reload} /> : <>
      <Card style={{ backgroundColor: C.violetSoft }}><Text style={T.tiny}>THIS WEEK’S THEME</Text>
        <Text style={[T.h2, { marginTop: 6 }]}>{d.theme?.title ?? 'No theme yet'}</Text>
        <Text style={T.small}>{d.theme ? d.theme.hint || 'Shoot it your way.' : 'The VibeLoop team hasn’t set this week’s theme — check back soon.'}</Text></Card>
      {d.theme ? <Card style={{ marginTop: S.md }}>
        {d.myEntry ? <Row icon="image" title="Your entry is in" sub={`${d.myEntry.votes} vote${d.myEntry.votes === 1 ? '' : 's'}${d.myEntry.caption ? ' · ' + d.myEntry.caption : ''}`} right={<Btn small kind="ghost" title="Withdraw" onPress={() => withdraw(d.myEntry!)} />} /> : null}
        <Field label="Caption (optional)" value={caption} onChangeText={setCaption} maxLength={140} placeholder="Where, when, why" />
        <Btn title={busy ? 'Uploading…' : d.myEntry ? 'Replace my photo' : 'Pick a photo & enter'} icon="camera" disabled={busy} onPress={enter} />
      </Card> : null}
      <Section title={`Gallery · ${d.entries.length}`}>
        {d.entries.map(e => <Card key={e.id} style={{ marginBottom: S.sm }}>
          <Image source={{ uri: mediaUri(e.mediaUrl)! }} style={{ height: 220, borderRadius: 14, backgroundColor: C.line }} resizeMode="cover" accessibilityLabel={e.caption || 'Entry photo'} />
          <Row icon="user" title={e.user?.name ?? 'Someone'} sub={[e.caption, ago(e.at)].filter(Boolean).join(' · ')}
            right={e.mine ? <Tag label={`${e.votes} votes`} /> : <Pressable onPress={() => vote(e)} accessibilityRole="button" accessibilityLabel={e.voted ? 'Remove vote' : 'Vote'}>
              <Tag label={`${e.voted ? '★' : '☆'} ${e.votes}`} color={e.voted ? C.violet : C.inkSoft} bg={e.voted ? C.violetSoft : '#F1F1F4'} /></Pressable>} />
        </Card>)}
        {!d.entries.length ? <Card><Empty text="No entries yet this week." /></Card> : null}
      </Section>
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Mentor Match ----------------
type Ship = { id: string; topic: string; note: string; status: string; mentor: U; mentee: U; iAmMentor: boolean };
type MData = { capacity: number; topics: string[]; mentors: { id: string; topic: string; bio: string; user: U; openSlots: number }[]; profiles: { id: string; role: string; topic: string; bio: string }[]; mentorships: Ship[] };
export function MentorMatch({ navigation }: any) {
  const { toast, busy, run } = useAct(); const [topic, setTopic] = useState<string | null>(null);
  const [d, err, reload] = useLoad<MData>(`/addons/b4/mentors${topic ? `?topic=${encodeURIComponent(topic)}` : ''}`);
  const [f, setF] = useState({ role: 'mentor', topic: '', bio: '' });
  const save = () => run(async () => { await call('POST', '/addons/b4/mentors/profile', { role: f.role, topic: f.topic.trim(), bio: f.bio.trim() }); setF({ ...f, topic: '', bio: '' }); reload(); }, 'Profile saved');
  const drop = (id: string) => run(async () => { await call('DELETE', `/addons/b4/mentors/profile/${id}`); reload(); });
  const ask = (id: string) => run(async () => { await call('POST', '/addons/b4/mentors/request', { profileId: id }); reload(); }, 'Request sent');
  const act = (m: Ship, action: string) => run(async () => { await call('POST', `/addons/b4/mentorships/${m.id}`, { action }); reload(); });
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Mentor Match" sub="Learn from someone, or pass it on" />
    {!d ? <Wait err={err} retry={reload} /> : <>
      <Card>
        <Chips><Chip label="I can mentor" active={f.role === 'mentor'} onPress={() => setF({ ...f, role: 'mentor' })} /><Chip label="I want a mentor" active={f.role === 'mentee'} onPress={() => setF({ ...f, role: 'mentee' })} /></Chips>
        <Field label="Topic" value={f.topic} onChangeText={t => setF({ ...f, topic: t })} maxLength={40} placeholder="Photo editing" />
        <Field label="About you (optional)" value={f.bio} onChangeText={t => setF({ ...f, bio: t })} maxLength={280} multiline />
        <Btn title="Save" icon="check" disabled={busy || f.topic.trim().length < 2} onPress={save} />
        {d.profiles.map(p => <Row key={p.id} icon={p.role === 'mentor' ? 'star' : 'book'} title={p.topic} sub={p.role === 'mentor' ? 'You mentor' : 'You’re learning'} right={<Btn small kind="ghost" title="Remove" onPress={() => drop(p.id)} />} />)}
      </Card>
      <Section title="Your mentorships"><Card>
        {d.mentorships.map(m => <Row key={m.id} icon="users" title={`${m.topic} · ${m.iAmMentor ? m.mentee?.name : m.mentor?.name}`} sub={`${m.iAmMentor ? 'You mentor' : 'Your mentor'} · ${m.status}${m.note ? ' · ' + m.note : ''}`}
          onPress={m.status === 'active' ? () => navigation.navigate('MentorNotes', { id: m.id }) : undefined}
          right={m.status === 'pending' && m.iAmMentor ? <View style={{ flexDirection: 'row', gap: 6 }}><Btn small title="Accept" onPress={() => act(m, 'accept')} /><Btn small kind="ghost" title="Decline" onPress={() => act(m, 'decline')} /></View>
            : <Btn small kind="ghost" title="End" onPress={() => act(m, 'end')} />} />)}
        {!d.mentorships.length ? <Empty text="No mentorships yet." /> : null}
      </Card></Section>
      <Section title="Find a mentor">
        <Chips><Chip label="All topics" active={!topic} onPress={() => setTopic(null)} />{d.topics.map(t => <Chip key={t} label={t} active={topic === t} onPress={() => setTopic(t)} />)}</Chips>
        <Card>{d.mentors.map(m => <Row key={m.id} icon="star" title={`${m.user?.name} · ${m.topic}`} sub={`${m.openSlots} of ${d.capacity} slots open${m.bio ? ' · ' + m.bio : ''}`}
          right={<Btn small title="Ask" disabled={busy || !m.openSlots} onPress={() => ask(m.id)} />} />)}
          {!d.mentors.length ? <Empty text="No mentors for this topic yet." /> : null}</Card>
      </Section>
    </>}
  </Screen>{toast}</View>;
}

export function MentorNotes({ route }: any) {
  const id = route?.params?.id; const { toast, busy, run } = useAct();
  const [d, err, reload] = useLoad<{ mentorship: Ship; notes: { id: string; text: string; at: number; user: U; mine: boolean }[] }>(id ? `/addons/b4/mentorships/${id}/notes` : null);
  const [txt, setTxt] = useState('');
  const add = () => run(async () => { await call('POST', `/addons/b4/mentorships/${id}/notes`, { text: txt.trim() }); setTxt(''); reload(); }, 'Note saved');
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Session notes" sub={d ? `${d.mentorship.topic} · ${d.mentorship.mentor?.name} & ${d.mentorship.mentee?.name}` : 'Mentorship'} />
    {!id ? <Card><Empty text="Open notes from Mentor Match." /></Card> : !d ? <Wait err={err} retry={reload} /> : <>
      {d.mentorship.status === 'active' ? <Card><Field label="What did you cover?" value={txt} onChangeText={setTxt} multiline maxLength={2000} />
        <Btn title="Add note" disabled={busy || !txt.trim()} onPress={add} /></Card> : null}
      <Section title={`Notes · ${d.notes.length}`}><Card>{d.notes.map(n => <Row key={n.id} icon="comment" title={n.user?.name ?? ''} sub={`${n.text} · ${ago(n.at)}`} />)}
        {!d.notes.length ? <Empty text="No notes yet." /> : null}</Card></Section>
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Hidden Gems ----------------
type Gem = { id: string; name: string; area: string; category: string; categoryLabel: string; why: string; at: number; user: U; mine: boolean; upvotes: number; upvoted: boolean };
export function HiddenGems() {
  const { toast, busy, run } = useAct(); const [area, setArea] = useState<string | null>(null); const [cat, setCat] = useState<string | null>(null); const [sort, setSort] = useState('top');
  const qs = [area && `area=${encodeURIComponent(area)}`, cat && `category=${cat}`, `sort=${sort}`].filter(Boolean).join('&');
  const [d, err, reload] = useLoad<{ categories: Record<string, string>; areas: string[]; topMonth: Gem[]; gems: Gem[] }>(`/addons/b4/gems?${qs}`);
  const [f, setF] = useState({ name: '', area: '', category: 'food', why: '' });
  const add = () => run(async () => { await call('POST', '/addons/b4/gems', { ...f, name: f.name.trim(), area: f.area.trim(), why: f.why.trim() }); setF({ ...f, name: '', why: '' }); reload(); }, 'Gem shared');
  const up = (g: Gem) => run(async () => { await call('POST', `/addons/b4/gems/${g.id}/upvote`); reload(); });
  const del = (g: Gem) => run(async () => { await call('DELETE', `/addons/b4/gems/${g.id}`); reload(); }, 'Removed');
  const G = ({ g }: { g: Gem }) => <Row icon="pin" title={g.name} sub={`${g.categoryLabel} · ${g.area} · ${g.why}`}
    right={g.mine ? <Btn small kind="ghost" title="Delete" onPress={() => del(g)} /> : <Pressable onPress={() => up(g)} accessibilityRole="button" accessibilityLabel="Upvote">
      <Tag label={`▲ ${g.upvotes}`} color={g.upvoted ? C.violet : C.inkSoft} bg={g.upvoted ? C.violetSoft : '#F1F1F4'} /></Pressable>} />;
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Hidden Gems" sub="Places locals actually love" />
    {!d ? <Wait err={err} retry={reload} /> : <>
      <Card>
        <Field label="Place name" value={f.name} onChangeText={t => setF({ ...f, name: t })} maxLength={80} />
        <Field label="Area" value={f.area} onChangeText={t => setF({ ...f, area: t })} maxLength={60} placeholder="Bandra West" />
        <Chips>{Object.entries(d.categories).map(([k, l]) => <Chip key={k} label={l} active={f.category === k} onPress={() => setF({ ...f, category: k })} />)}</Chips>
        <Field label="Why it’s a gem" value={f.why} onChangeText={t => setF({ ...f, why: t })} maxLength={400} multiline />
        <Btn title="Share gem" icon="pin" disabled={busy || f.name.trim().length < 2 || f.area.trim().length < 2 || f.why.trim().length < 10} onPress={add} />
      </Card>
      {d.topMonth.length ? <Section title="Top this month"><Card>{d.topMonth.map(g => <G key={g.id} g={g} />)}</Card></Section> : null}
      <Section title="Browse">
        <Chips><Chip label="All areas" active={!area} onPress={() => setArea(null)} />{d.areas.map(a => <Chip key={a} label={a} active={area === a} onPress={() => setArea(a)} />)}</Chips>
        <Chips><Chip label="Any type" active={!cat} onPress={() => setCat(null)} />{Object.entries(d.categories).map(([k, l]) => <Chip key={k} label={l} active={cat === k} onPress={() => setCat(k)} />)}</Chips>
        <Chips><Chip label="Top" active={sort === 'top'} onPress={() => setSort('top')} /><Chip label="Newest" active={sort === 'new'} onPress={() => setSort('new')} /></Chips>
        <Card>{d.gems.map(g => <G key={g.id} g={g} />)}{!d.gems.length ? <Empty text="No gems here yet — add the first." /> : null}</Card>
      </Section>
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Recipe Box ----------------
type Rcp = { id: string; title: string; minutes: number; servings: number; user: U; mine: boolean; cooked: number; saves: number; saved: boolean; ingredients?: string[]; steps?: string[] };
export function RecipeBox({ navigation }: any) {
  const { toast, busy, run } = useAct(); const [tab, setTab] = useState('all'); const [q, setQ] = useState('');
  const [d, err, reload] = useLoad<Rcp[]>(`/addons/b4/recipes?tab=${tab}${q.trim().length > 1 ? `&q=${encodeURIComponent(q.trim())}` : ''}`);
  const [f, setF] = useState({ title: '', ingredients: '', steps: '', minutes: '30', servings: '2' });
  const lines = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean);
  const add = () => run(async () => {
    await call('POST', '/addons/b4/recipes', { title: f.title.trim(), ingredients: lines(f.ingredients), steps: lines(f.steps), minutes: Number(f.minutes) || 0, servings: Number(f.servings) || 0 });
    setF({ title: '', ingredients: '', steps: '', minutes: '30', servings: '2' }); setTab('mine'); reload();
  }, 'Recipe added');
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Recipe Box" sub="Cook, save, share" />
    <Card>
      <Field label="Recipe name" value={f.title} onChangeText={t => setF({ ...f, title: t })} maxLength={80} />
      <Field label="Ingredients (one per line)" value={f.ingredients} onChangeText={t => setF({ ...f, ingredients: t })} multiline placeholder={'2 cups rice\n1 onion'} />
      <Field label="Steps (one per line)" value={f.steps} onChangeText={t => setF({ ...f, steps: t })} multiline />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Field label="Minutes" value={f.minutes} onChangeText={t => setF({ ...f, minutes: t.replace(/\D/g, '') })} keyboardType="number-pad" /></View>
        <View style={{ flex: 1 }}><Field label="Servings" value={f.servings} onChangeText={t => setF({ ...f, servings: t.replace(/\D/g, '') })} keyboardType="number-pad" /></View>
      </View>
      <Btn title="Add recipe" icon="book" disabled={busy || f.title.trim().length < 2 || !lines(f.ingredients).length || !lines(f.steps).length} onPress={add} />
    </Card>
    <Chips>{[['all', 'Everyone'], ['mine', 'Mine'], ['saved', 'Saved']].map(([k, l]) => <Chip key={k} label={l} active={tab === k} onPress={() => setTab(k)} />)}</Chips>
    <Field label="Search" value={q} onChangeText={setQ} maxLength={60} placeholder="chai, dal…" />
    {!d ? <Wait err={err} retry={reload} /> : <Card>
      {d.map(r => <Row key={r.id} icon="book" title={r.title} sub={`${r.minutes} min · serves ${r.servings} · cooked ${r.cooked}× · by ${r.user?.name}`} onPress={() => navigation.navigate('RecipeDetail', { id: r.id })} right={r.saved ? <Tag label="Saved" /> : undefined} />)}
      {!d.length ? <Empty text={tab === 'saved' ? 'Nothing saved yet.' : 'No recipes yet.'} /> : null}
    </Card>}
  </Screen>{toast}</View>;
}

export function RecipeDetail({ route, navigation }: any) {
  const id = route?.params?.id; const { toast, busy, run } = useAct();
  const [r, err, reload] = useLoad<Rcp>(id ? `/addons/b4/recipes/${id}` : null);
  const save = () => run(async () => { await call('POST', `/addons/b4/recipes/${id}/save`); reload(); });
  const cooked = () => run(async () => { await call('POST', `/addons/b4/recipes/${id}/cooked`); reload(); }, 'Logged — nice cooking');
  const del = () => run(async () => { await call('DELETE', `/addons/b4/recipes/${id}`); navigation.goBack(); }, 'Recipe deleted');
  return <View style={{ flex: 1 }}><Screen>
    <Header title={r?.title ?? 'Recipe'} sub={r ? `${r.minutes} min · serves ${r.servings} · by ${r.user?.name}` : undefined} />
    {!id ? <Card><Empty text="Open a recipe from Recipe Box." /></Card> : !r ? <Wait err={err} retry={reload} /> : <>
      <Card><Chips><Tag label={`Cooked ${r.cooked}×`} /><Tag label={`${r.saves} saves`} /></Chips>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Btn small title="I cooked it" icon="flame" disabled={busy} onPress={cooked} />
          {r.mine ? <Btn small kind="danger" title="Delete" disabled={busy} onPress={del} /> : <Btn small kind="ghost" title={r.saved ? 'Unsave' : 'Save'} icon="bookmark" disabled={busy} onPress={save} />}
        </View></Card>
      <Section title="Ingredients"><Card>{(r.ingredients ?? []).map((i, n) => <Text key={n} style={[T.body, { marginBottom: 4 }]}>• {i}</Text>)}</Card></Section>
      <Section title="Steps"><Card>{(r.steps ?? []).map((s, n) => <Text key={n} style={[T.body, { marginBottom: 8 }]}>{n + 1}. {s}</Text>)}</Card></Section>
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Book Nook ----------------
type Book = { id: string; title: string; author: string; status: 'want' | 'reading' | 'done'; rating: number | null; review: string; updatedAt: number; user?: U };
const SHELF = { want: 'Want to read', reading: 'Reading', done: 'Finished' } as const;
const stars = (n: number | null) => n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '';
export function BookNook() {
  const { toast, busy, run } = useAct(); const [view, setView] = useState<'mine' | 'squad'>('mine');
  const [d, err, reload] = useLoad<{ books: Book[]; counts: Record<string, number> }>('/addons/b4/books');
  const [feed, ferr, refeed] = useLoad<Book[]>('/addons/b4/books/feed');
  const [f, setF] = useState({ title: '', author: '', status: 'want' as Book['status'] });
  const [edit, setEdit] = useState<{ id: string; rating: number; review: string } | null>(null);
  const add = () => run(async () => { await call('POST', '/addons/b4/books', { title: f.title.trim(), author: f.author.trim(), status: f.status }); setF({ title: '', author: '', status: 'want' }); reload(); }, 'Added to your shelf');
  const patch = (id: string, body: any) => run(async () => { await call('PATCH', `/addons/b4/books/${id}`, body); setEdit(null); reload(); });
  const del = (id: string) => run(async () => { await call('DELETE', `/addons/b4/books/${id}`); reload(); });
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Book Nook" sub={d ? `${d.counts.reading ?? 0} reading · ${d.counts.done ?? 0} finished` : 'Your reading log'} />
    <Chips><Chip label="My shelf" active={view === 'mine'} onPress={() => setView('mine')} /><Chip label="Squad reading" active={view === 'squad'} onPress={() => { setView('squad'); refeed(); }} /></Chips>
    {view === 'squad' ? (!feed ? <Wait err={ferr} retry={refeed} /> : <Card>
      {feed.map(b => <Row key={b.id} icon="book" title={`${b.user?.name} · ${SHELF[b.status]}`} sub={[`${b.title}${b.author ? ' — ' + b.author : ''}`, stars(b.rating), b.review, ago(b.updatedAt)].filter(Boolean).join(' · ')} />)}
      {!feed.length ? <Empty text="Your Squad hasn’t logged any books lately." /> : null}</Card>) : <>
      <Card>
        <Field label="Title" value={f.title} onChangeText={t => setF({ ...f, title: t })} maxLength={120} />
        <Field label="Author" value={f.author} onChangeText={t => setF({ ...f, author: t })} maxLength={80} />
        <Chips>{(Object.keys(SHELF) as Book['status'][]).filter(k => k !== 'done').map(k => <Chip key={k} label={SHELF[k]} active={f.status === k} onPress={() => setF({ ...f, status: k })} />)}</Chips>
        <Btn title="Add book" icon="book" disabled={busy || !f.title.trim()} onPress={add} />
      </Card>
      {!d ? <Wait err={err} retry={reload} /> : (['reading', 'want', 'done'] as const).map(s => <Section key={s} title={`${SHELF[s]} · ${d.counts[s] ?? 0}`}><Card>
        {d.books.filter(b => b.status === s).map(b => <View key={b.id}>
          <Row icon="book" title={b.title} sub={[b.author, stars(b.rating), b.review].filter(Boolean).join(' · ')}
            right={<View style={{ flexDirection: 'row', gap: 6 }}>
              {s === 'want' ? <Btn small title="Start" onPress={() => patch(b.id, { status: 'reading' })} /> : null}
              {s === 'reading' ? <Btn small title="Finish" onPress={() => setEdit({ id: b.id, rating: 4, review: '' })} /> : null}
              {s === 'done' ? <Btn small kind="ghost" title="Review" onPress={() => setEdit({ id: b.id, rating: b.rating ?? 4, review: b.review })} /> : null}
              <Btn small kind="ghost" title="✕" onPress={() => del(b.id)} /></View>} />
          {edit?.id === b.id ? <View style={{ marginLeft: 52, marginBottom: 10 }}>
            <Chips>{[1, 2, 3, 4, 5].map(n => <Chip key={n} label={'★'.repeat(n)} active={edit.rating === n} onPress={() => setEdit({ ...edit, rating: n })} />)}</Chips>
            <Field label="Short review" value={edit.review} onChangeText={t => setEdit({ ...edit, review: t })} maxLength={500} multiline />
            <Btn small title="Save" disabled={busy} onPress={() => patch(b.id, { status: 'done', rating: edit.rating, review: edit.review.trim() })} />
          </View> : null}
        </View>)}
        {!d.books.some(b => b.status === s) ? <Empty text="Nothing here." /> : null}
      </Card></Section>)}
    </>}
  </Screen>{toast}</View>;
}

// ---------------- Meetup Board ----------------
type Meet = { id: string; title: string; place: string; startsAt: number; capacity: number; note: string; status: string; host: U; isHost: boolean; going: number; waitlist: number; my: string | null; myWaitPos: number | null };
const STARTS = [{ l: 'In 3 hours', h: 3 }, { l: 'Tomorrow', h: 24 }, { l: 'In 3 days', h: 72 }, { l: 'Next week', h: 168 }];
export function MeetupBoard() {
  const { toast, busy, run } = useAct();
  const [d, err, reload] = useLoad<{ upcoming: Meet[]; mine: Meet[]; maxCapacity: number }>('/addons/b4/meetups');
  const [f, setF] = useState({ title: '', place: '', hours: 24, capacity: '8', note: '' });
  const make = () => run(async () => {
    await call('POST', '/addons/b4/meetups', { title: f.title.trim(), place: f.place.trim(), startsAt: Date.now() + f.hours * 3_600_000, capacity: Number(f.capacity) || 0, note: f.note.trim() });
    setF({ ...f, title: '', place: '', note: '' }); reload();
  }, 'Meetup posted');
  const rsvp = (m: Meet) => run(async () => { const r = await call<Meet>('POST', `/addons/b4/meetups/${m.id}/rsvp`); reload(); return r; }, 'RSVP saved');
  const leave = (m: Meet) => run(async () => { await call('DELETE', `/addons/b4/meetups/${m.id}/rsvp`); reload(); }, 'RSVP removed');
  const cancel = (m: Meet) => run(async () => { await call('POST', `/addons/b4/meetups/${m.id}/cancel`); reload(); }, 'Meetup cancelled — attendees notified');
  const Item = ({ m }: { m: Meet }) => <Row icon="calendar" tint={m.status === 'cancelled' ? C.inkSoft : C.violet} title={`${m.title}${m.status === 'cancelled' ? ' (cancelled)' : ''}`}
    sub={`${when(m.startsAt)} · ${m.place} · ${m.going}/${m.capacity} going${m.waitlist ? ` · ${m.waitlist} waiting` : ''}${m.isHost ? ' · you host' : ` · by ${m.host?.name}`}${m.my === 'waitlist' ? ` · you’re #${m.myWaitPos} on waitlist` : ''}`}
    right={m.status === 'cancelled' ? undefined : m.isHost ? <Btn small kind="danger" title="Cancel" disabled={busy} onPress={() => cancel(m)} />
      : m.my ? <Btn small kind="ghost" title="Leave" disabled={busy} onPress={() => leave(m)} />
      : <Btn small title={m.going >= m.capacity ? 'Waitlist' : 'RSVP'} disabled={busy} onPress={() => rsvp(m)} />} />;
  return <View style={{ flex: 1 }}><Screen>
    <Header title="Meetup Board" sub="Small, local, in person" />
    {!d ? <Wait err={err} retry={reload} /> : <>
      <Card>
        <Field label="What’s happening" value={f.title} onChangeText={t => setF({ ...f, title: t })} maxLength={80} placeholder="Sunday sketch walk" />
        <Field label="Where" value={f.place} onChangeText={t => setF({ ...f, place: t })} maxLength={120} placeholder="Carter Road promenade, near the café" />
        <Text style={T.tiny}>WHEN</Text>
        <Chips>{STARTS.map(s => <Chip key={s.h} label={s.l} active={f.hours === s.h} onPress={() => setF({ ...f, hours: s.h })} />)}</Chips>
        <Field label={`Spots (2–${d.maxCapacity})`} value={f.capacity} onChangeText={t => setF({ ...f, capacity: t.replace(/\D/g, '') })} keyboardType="number-pad" />
        <Field label="Note (optional)" value={f.note} onChangeText={t => setF({ ...f, note: t })} maxLength={400} multiline />
        <Btn title="Post meetup" icon="calendar" disabled={busy || f.title.trim().length < 3 || f.place.trim().length < 2} onPress={make} />
      </Card>
      {d.mine.length ? <Section title="Yours"><Card>{d.mine.map(m => <Item key={m.id} m={m} />)}</Card></Section> : null}
      <Section title={`Upcoming · ${d.upcoming.length}`}><Card>{d.upcoming.map(m => <Item key={m.id} m={m} />)}
        {!d.upcoming.length ? <Empty text="No meetups yet — host the first one." /> : null}</Card></Section>
    </>}
  </Screen>{toast}</View>;
}

export const SCREENS: Record<string, React.ComponentType<any>> = { PhotoPrompt, MentorMatch, MentorNotes, HiddenGems, RecipeBox, RecipeDetail, BookNook, MeetupBoard };
export const ENTRIES: AddonEntry[] = [
  { route: 'PhotoPrompt', title: 'Photo Prompt', sub: 'A new photo theme every week · enter and vote', icon: 'camera', module: 'glow', flag: 'glow.photoPrompt' },
  { route: 'MentorMatch', title: 'Mentor Match', sub: 'Find a mentor or become one, by topic', icon: 'users', module: 'glow', flag: 'glow.mentorMatch' },
  { route: 'HiddenGems', title: 'Hidden Gems', sub: 'Local places worth knowing · upvote favourites', icon: 'pin', module: 'glow', flag: 'glow.hiddenGems' },
  { route: 'RecipeBox', title: 'Recipe Box', sub: 'Share recipes, save others’, log what you cook', icon: 'flame', module: 'glow', flag: 'glow.recipeBox' },
  { route: 'BookNook', title: 'Book Nook', sub: 'Your reading log · see what your Squad reads', icon: 'book', module: 'glow', flag: 'glow.bookNook' },
  { route: 'MeetupBoard', title: 'Meetup Board', sub: 'Small local meetups with RSVP and waitlist', icon: 'calendar', module: 'glow', flag: 'glow.meetupBoard' },
];
