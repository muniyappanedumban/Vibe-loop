import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Share } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import { CC, AQUA } from '../theme';
import { ChatIcon } from '../ChatIcon';
import { BubbleMoji } from '../BubbleMojiView';
import { BUBBLEMOJI, BUBBLE_CATEGORIES } from '../bubblemoji';
import { CScreen, CTop, CHeader, CIconBtn, CAvatar, CCard, CBtn, CChip, CRow, CInput, CToggle, CNotReady, useCToast, ct, when, hue } from '../ui';
import { useChat, chat, Status } from '../useChat';
import { useSession, online } from '../../lib/api';
import { useT } from '../../lib/config';
import { SignInNeeded } from './Chats';

export function Friends({ navigation }: any) {
  const st = useChat(); const tr = useT(); const [h, setH] = useState(''); const { toast, show } = useCToast();
  if (!online()) return <SignInNeeded navigation={navigation} />;
  const run = (p: Promise<any>, ok: string) => p.then(() => show(ok)).catch(e => show(e.message, true));
  const besties = st.friends.filter(f => f.bestie);
  return (
    <View style={{ flex: 1 }}><CScreen>
      <CTop title={tr('nav.Friends', 'Squad')} right={<CIconBtn name="qr" label="My code" onPress={() => navigation.navigate('MyCode')} />} />
      <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><CInput placeholder="Add by exact @ID" value={h} onChangeText={t => setH(t.trim().toLowerCase())} autoCapitalize="none" /></View>
        <CBtn title="Add" icon="plus" onPress={() => run(chat.friendRequest(h.startsWith('@') ? h : '@' + h), 'Friend request sent').then(() => setH(''))} /></View>
      {besties.length ? (<><Text style={[ct.tiny, { marginBottom: 8 }]}>BESTIES</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }} style={{ marginBottom: 14 }}>
          {besties.map(f => <Pressable key={f.id} onPress={() => chat.newConv([f.id]).then(c => navigation.navigate('ChatRoom', { id: c.id }))} style={{ alignItems: 'center', width: 64 }}><CAvatar name={f.name} h={f.hue} size={54} ring online /><Text style={[ct.small, { marginTop: 4 }]} numberOfLines={1}>{f.name.split(' ')[0]}</Text></Pressable>)}
        </ScrollView></>) : null}
      {st.incoming.length ? (<><Text style={[ct.tiny, { marginBottom: 8 }]}>REQUESTS · {st.incoming.length}</Text>
        {st.incoming.map(r => (
          <CCard key={r.id} style={{ marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <CAvatar name={r.from.name} h={r.from.hue} /><View style={{ flex: 1 }}><Text style={ct.h3}>{r.from.name}</Text><Text style={ct.small}>{r.from.handle} · {when(r.at)}</Text></View>
            <CBtn small title="Accept" onPress={() => run(chat.answer(r.id, true), `You and ${r.from.name} are friends`)} />
            <CIconBtn name="close" label="Decline" onPress={() => run(chat.answer(r.id, false), 'Declined')} />
          </CCard>))}</>) : null}
      {st.outgoing.length ? <Text style={[ct.small, { marginVertical: 6 }]}>Waiting on: {st.outgoing.map(o => o.to.handle).join(', ')}</Text> : null}
      <Text style={[ct.tiny, { marginVertical: 8 }]}>ALL FRIENDS · {st.friends.length}</Text>
      {st.friends.map(f => (
        <CCard key={f.id} style={{ marginBottom: 8, padding: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <CAvatar name={f.name} h={f.hue} size={46} />
            <View style={{ flex: 1 }}><Text style={ct.h3}>{f.name} {f.close ? '· Inner Circle' : ''}</Text><Text style={ct.small} numberOfLines={1}>{f.handle}{f.bio ? ` · ${f.bio}` : ''}</Text></View>
            <Pressable onPress={() => run(chat.ping(f.id, 64, 'wave'), `Waved at ${f.name.split(' ')[0]}`)} accessibilityLabel={`Wave at ${f.name}`} style={s.mini}><ChatIcon name="wave" size={18} color={CC.teal} /></Pressable>
            <Pressable onPress={() => run(chat.ping(f.id, 17, 'heart'), 'Heart Ping sent')} accessibilityLabel={`Heart ping ${f.name}`} style={s.mini}><ChatIcon name="heart" size={18} color={CC.coral} /></Pressable>
            <Pressable onPress={() => chat.newConv([f.id]).then(c => navigation.navigate('ChatRoom', { id: c.id })).catch(e => show(e.message, true))} accessibilityLabel={`Message ${f.name}`} style={s.mini}><ChatIcon name="chats" size={18} color={CC.ink} /></Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
            <CChip label="Inner Circle" icon="shield" active={!!f.close} onPress={() => run(chat.friendFlag(f.id, { close: !f.close }), f.close ? 'Removed from Inner Circle' : 'Added to Inner Circle')} />
            <CChip label="Bestie" icon="star" active={!!f.bestie} onPress={() => run(chat.friendFlag(f.id, { bestie: !f.bestie }), 'Updated')} />
          </View>
        </CCard>))}
      {!st.friends.length ? <Text style={ct.small}>No friends yet — add someone by @ID.</Text> : null}
    </CScreen>{toast}</View>
  );
}

export function MyCode() {
  const sess = useSession(); const me = sess.accounts.find(a => a.id === sess.activeId); const handle = me?.handle ?? '@you'; const link = `https://vibeloop.app/${handle}`;
  return (
    <CScreen>
      <CHeader title="My @ID" sub="Share this instead of a phone number" />
      <LinearGradient colors={AQUA as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
        <CAvatar name={me?.name ?? 'You'} h={me?.hue ?? 180} size={64} />
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 22, marginTop: 10 }}>{me?.name}</Text>
        <Text style={{ color: 'rgba(255,255,255,.85)', fontWeight: '800' }}>{handle}</Text>
        <View style={s.qr}><QRCode value={link} size={180} color={CC.ink} backgroundColor="#fff" /></View>
        <Text style={{ color: '#fff', fontWeight: '700', marginTop: 10 }}>{link.replace('https://', '')}</Text>
      </LinearGradient>
      <CBtn title="Share my ID link" icon="share" style={{ marginTop: 16 }} onPress={() => Share.share({ message: `Find me on VibeLoop: ${link}` }).catch(() => {})} />
      <CNotReady what="ScanMe (scan a code)" why="Camera scanning isn't connected yet — use Find by exact @ID instead." />
    </CScreen>
  );
}

const BGS = ['#00B39B', '#14A8E6', '#FF6B5A', '#0B1F24', '#7B5CFF', '#FFC93C'];
export function Vibes({ navigation }: any) {
  const st = useChat(); const tr = useT(); const sess = useSession();
  if (!online()) return <SignInNeeded navigation={navigation} />;
  const mine = st.statuses.filter(x => typeof x.by === 'string' || (x.by as any).id === sess.activeId); const others = st.statuses.filter(x => !mine.includes(x));
  return (
    <CScreen>
      <CTop title={tr('nav.Vibes', 'Moods')} />
      <CCard onPress={() => navigation.navigate('StatusCompose')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <LinearGradient colors={AQUA as any} style={{ width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}><ChatIcon name="plus" color="#fff" /></LinearGradient>
        <View style={{ flex: 1 }}><Text style={ct.h3}>{mine.length ? `Your Vibe · ${mine.length} active` : 'Share a Mood'}</Text><Text style={ct.small}>Text or mood · disappears after 24 hours</Text></View>
      </CCard>
      <Text style={[ct.tiny, { marginBottom: 8 }]}>RECENT · {others.length}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {[...mine, ...others].map(v => <StatusTile key={v.id} v={v} onPress={() => navigation.navigate('StatusView', { id: v.id })} />)}
      </View>
      {!st.statuses.length ? <Text style={ct.small}>No Moods from your Squad right now.</Text> : null}
    </CScreen>
  );
}
function StatusTile({ v, onPress }: { v: Status; onPress: () => void }) {
  const by = typeof v.by === 'string' ? { name: 'You', hue: 180 } : v.by;
  const left = Math.max(0, Math.round((v.expiresAt - Date.now()) / 3600_000));
  return (
    <Pressable onPress={onPress} style={{ width: '48%' }}>
      <View style={[s.tile, { backgroundColor: v.bg ?? CC.teal }]}>
        {v.kind === 'mood' && v.moji ? <BubbleMoji id={v.moji} size={70} /> : <Text style={{ color: '#fff', fontWeight: '900', fontSize: 17 }} numberOfLines={5}>{v.text}</Text>}
        <View style={{ position: 'absolute', left: 10, bottom: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}><CAvatar name={by.name} h={by.hue} size={24} /><Text style={{ color: '#fff', fontWeight: '800', fontSize: 12, flex: 1 }} numberOfLines={1}>{by.name}</Text><Text style={{ color: 'rgba(255,255,255,.8)', fontSize: 10, fontWeight: '800' }}>{left}h · {v.audience}</Text></View>
      </View>
    </Pressable>
  );
}
export function StatusCompose({ navigation }: any) {
  const [kind, setKind] = useState<'text' | 'mood'>('text'); const [text, setText] = useState(''); const [bg, setBg] = useState(BGS[0]); const [moji, setMoji] = useState(17); const [aud, setAud] = useState('friends'); const [cat, setCat] = useState('Chatty');
  const { toast, show } = useCToast();
  return (
    <View style={{ flex: 1 }}><CScreen>
      <CHeader title="New Mood" sub="24 hours · you choose who sees it" />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}><CChip label="Text Mood" icon="edit" active={kind === 'text'} onPress={() => setKind('text')} /><CChip label="Emoji Mood" icon="spark" active={kind === 'mood'} onPress={() => setKind('mood')} /></View>
      <View style={[s.preview, { backgroundColor: bg }]}>{kind === 'mood' ? <BubbleMoji id={moji} size={120} /> : <Text style={{ color: '#fff', fontWeight: '900', fontSize: 24, textAlign: 'center' }}>{text || 'Type your Vibe…'}</Text>}</View>
      <View style={{ flexDirection: 'row', gap: 8, marginVertical: 12 }}>{BGS.map(b => <Pressable key={b} onPress={() => setBg(b)} accessibilityLabel={`Background ${b}`} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: b, borderWidth: bg === b ? 3 : 0, borderColor: CC.sun }} />)}</View>
      {kind === 'text' ? <CInput value={text} onChangeText={setText} placeholder="What's the vibe?" multiline maxLength={200} /> : (<>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{BUBBLE_CATEGORIES.map(c => <CChip key={c} label={c} active={cat === c} onPress={() => setCat(c)} />)}</ScrollView>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 10 }}>{BUBBLEMOJI.filter(b => b.category === cat).slice(0, 30).map(b => <Pressable key={b.id} onPress={() => setMoji(b.id)} style={[s.moji, moji === b.id && { borderColor: CC.teal }]} accessibilityLabel={b.name}><BubbleMoji id={b.id} size={36} /></Pressable>)}</View>
      </>)}
      <Text style={[ct.tiny, { marginBottom: 8 }]}>WHO CAN SEE IT</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>{[['close', 'Inner Circle', 'shield'], ['friends', 'Friends', 'friends'], ['public', 'Everyone', 'globe']].map(([k, l, i]) => <CChip key={k} label={l} icon={i as any} active={aud === k} onPress={() => setAud(k)} />)}</View>
      <CBtn title="Share Mood" icon="send" onPress={() => { if (kind === 'text' && !text.trim()) return show('Write something first', true); chat.postStatus({ kind, text: text.trim(), moji: kind === 'mood' ? moji : undefined, bg, audience: aud }).then(() => { show('Mood shared for 24h'); setTimeout(() => navigation.goBack(), 600); }).catch(e => show(e.message, true)); }} />
    </CScreen>{toast}</View>
  );
}
export function StatusView({ navigation, route }: any) {
  useEffect(() => { chat.ensure(); }, []);
  const st = useChat(); const v = st.statuses.find(x => x.id === route?.params?.id); const [r, setR] = useState(''); const { toast, show } = useCToast();
  if (!v) return <CScreen><CHeader title="Vibe" /><Text style={ct.small}>This Mood has expired.</Text></CScreen>;
  const mine = typeof v.by === 'string'; const by = mine ? { name: 'You', hue: 180 } : (v.by as any);
  return (
    <View style={{ flex: 1, backgroundColor: v.bg ?? CC.teal }}>
      <CScreen>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><CIconBtn name="back" label="Back" onPress={() => navigation.goBack()} /><CAvatar name={by.name} h={by.hue} size={38} /><View style={{ flex: 1 }}><Text style={[ct.h3, { color: '#fff' }]}>{by.name}</Text><Text style={{ color: 'rgba(255,255,255,.8)', fontSize: 12, fontWeight: '700' }}>{when(v.at)} · {v.audience}</Text></View></View>
        <View style={{ alignItems: 'center', justifyContent: 'center', minHeight: 420 }}>{v.kind === 'mood' && v.moji ? <BubbleMoji id={v.moji} size={180} /> : <Text style={{ color: '#fff', fontWeight: '900', fontSize: 30, textAlign: 'center' }}>{v.text}</Text>}</View>
        {mine ? <CBtn kind="ghost" title="Delete Mood" icon="close" onPress={() => chat.deleteStatus(v.id).then(() => navigation.goBack()).catch(e => show(e.message, true))} />
          : <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><CInput placeholder={`Reply privately to ${by.name.split(' ')[0]}`} value={r} onChangeText={setR} /></View><CBtn title="Send" icon="send" onPress={() => r.trim() && chat.replyStatus(v.id, r.trim()).then(() => { setR(''); show('Reply sent to chat'); }).catch(e => show(e.message, true))} /></View>}
      </CScreen>{toast}
    </View>
  );
}

export function Towns({ navigation }: any) {
  const st = useChat(); const tr = useT(); const [code, setCode] = useState<Record<string, string>>({}); const { toast, show } = useCToast();
  if (!online()) return <SignInNeeded navigation={navigation} />;
  const mine = st.towns.filter(t => t.role); const discover = st.towns.filter(t => !t.role);
  return (
    <View style={{ flex: 1 }}><CScreen>
      <CTop title={tr('nav.Towns', 'Hoods')} right={<CIconBtn name="plus" label="Start a Hood" onPress={() => navigation.navigate('CreateTown')} />} />
      <Text style={[ct.tiny, { marginBottom: 8 }]}>YOUR HOODS · {mine.length}</Text>
      {mine.map(t => (
        <CCard key={t.id} onPress={() => navigation.navigate('TownRoom', { id: t.id })} style={{ marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <LinearGradient colors={[hue(t.hue, 70, 55), hue(t.hue + 50, 70, 40)]} style={s.townIcon}><ChatIcon name="towns" color="#fff" fill="rgba(255,255,255,.3)" /></LinearGradient>
          <View style={{ flex: 1 }}><Text style={ct.h3}>{t.name}</Text><Text style={ct.small}>{t.open ? 'Open Hood' : 'Secret Hood'} · {t.members} members · {t.role}</Text></View>
          {t.role === 'owner' ? <ChatIcon name="crown" size={18} color="#C98A00" /> : null}
        </CCard>))}
      <Text style={[ct.tiny, { marginVertical: 8 }]}>DISCOVER</Text>
      {discover.map(t => (
        <CCard key={t.id} style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <LinearGradient colors={[hue(t.hue, 70, 55), hue(t.hue + 50, 70, 40)]} style={s.townIcon}><ChatIcon name={t.open ? 'towns' : 'lock'} color="#fff" fill="rgba(255,255,255,.3)" /></LinearGradient>
            <View style={{ flex: 1 }}><Text style={ct.h3}>{t.name}</Text><Text style={ct.small}>{t.about || (t.open ? 'Open Hood' : 'Invite only')} · {t.members} members</Text></View>
          </View>
          {t.open ? <CBtn small title="Join" icon="plus" style={{ marginTop: 10 }} onPress={() => chat.joinTown(t.id).then(() => show(`Joined ${t.name}`)).catch(e => show(e.message, true))} />
            : <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}><View style={{ flex: 1 }}><CInput placeholder="Invite code" value={code[t.id] ?? ''} onChangeText={v => setCode({ ...code, [t.id]: v })} autoCapitalize="characters" /></View><CBtn small title="Join" onPress={() => chat.joinTown(t.id, code[t.id]).then(() => show('Joined')).catch(e => show(e.message, true))} style={{ height: 50 }} /></View>}
        </CCard>))}
    </CScreen>{toast}</View>
  );
}
export function CreateTown({ navigation }: any) {
  const [name, setName] = useState(''); const [about, setAbout] = useState(''); const [open, setOpen] = useState(true); const { toast, show } = useCToast();
  return (
    <View style={{ flex: 1 }}><CScreen>
      <CHeader title="Start a Hood" sub="Your community, your rules" />
      <CInput label="Hood name" value={name} onChangeText={setName} placeholder="Coimbatore Creators" />
      <CInput label="About" value={about} onChangeText={setAbout} placeholder="What's this Town for?" multiline />
      <CCard><CRow icon={open ? 'globe' : 'lock'} title={open ? 'Open Hood' : 'Secret Hood'} sub={open ? 'Anyone can find & join' : 'Join only with an invite code'} right={<CToggle value={open} onChange={setOpen} label="Open town" />} /></CCard>
      <CBtn title="Start Hood" icon="towns" style={{ marginTop: 16 }} onPress={() => { if (name.trim().length < 3) return show('Name needs 3+ characters', true); chat.createTown(name.trim(), open, about.trim()).then(t => navigation.replace('TownRoom', { id: t.id })).catch(e => show(e.message, true)); }} />
    </CScreen>{toast}</View>
  );
}
export function TownRoom({ route }: any) {
  const id = route?.params?.id; const st = useChat(); const t = st.towns.find(x => x.id === id); const [ch, setCh] = useState<string | null>(null); const [txt, setTxt] = useState(''); const [board, setBoard] = useState(''); const [newCh, setNewCh] = useState('');
  const { toast, show } = useCToast();
  useEffect(() => { chat.ensure(); chat.town(id).then(tt => setCh(c => c ?? tt.channels[0]?.id ?? null)).catch(() => {}); }, [id]);
  useEffect(() => { if (!ch) return; chat.townMsgs(id, ch).catch(() => {}); const i = setInterval(() => chat.townMsgs(id, ch).catch(() => {}), 5000); return () => clearInterval(i); }, [ch]);
  if (!t) return <CScreen><CHeader title="Town" /><Text style={ct.small}>Loading…</Text></CScreen>;
  const admin = t.role === 'owner' || t.role === 'admin'; const msgs = ch ? st.townMsgs[`${id}/${ch}`] ?? [] : [];
  return (
    <View style={{ flex: 1 }}><CScreen>
      <CHeader title={t.name} sub={`${t.open ? 'Open' : 'Secret'} Town · ${t.members} members · you are ${t.role ?? 'visitor'}`} />
      {t.board.length || admin ? (
        <CCard style={{ marginBottom: 12, backgroundColor: CC.sunSoft, borderColor: CC.sun }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}><ChatIcon name="board" size={18} color="#C98A00" /><Text style={ct.h3}>Hood Board</Text></View>
          {t.board.map(b => <Text key={b.id} style={{ fontWeight: '600', marginBottom: 4 }}>• {b.text}</Text>)}
          {admin ? <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}><View style={{ flex: 1 }}><CInput placeholder="Post an announcement" value={board} onChangeText={setBoard} /></View><CBtn small title="Post" kind="ink" style={{ height: 50 }} onPress={() => board.trim() && chat.townBoard(id, board.trim()).then(() => setBoard('')).catch(e => show(e.message, true))} /></View> : null}
        </CCard>) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginBottom: 12 }}>{t.channels.map(c => <CChip key={c.id} label={c.name} icon="hash" active={ch === c.id} onPress={() => setCh(c.id)} />)}</ScrollView>
      {msgs.map(m => { const by = typeof m.from === 'string' ? { name: 'You', hue: 180 } : m.from; return (
        <View key={m.id} style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}><CAvatar name={by.name} h={by.hue} size={34} /><View style={{ flex: 1 }}><Text style={{ fontWeight: '800' }}>{by.name} <Text style={ct.small}>{when(m.at)}</Text></Text><Text style={{ fontWeight: '500', marginTop: 2 }}>{m.text}</Text></View></View>); })}
      {!msgs.length ? <Text style={ct.small}>No messages in this channel yet.</Text> : null}
      {t.role ? <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}><View style={{ flex: 1 }}><CInput placeholder={`Message #${t.channels.find(c => c.id === ch)?.name ?? ''}`} value={txt} onChangeText={setTxt} /></View><CBtn title="Send" icon="send" style={{ height: 50 }} onPress={() => ch && txt.trim() && chat.townSend(id, ch, txt.trim()).then(() => setTxt('')).catch(e => show(e.message, true))} /></View> : null}
      {admin ? (
        <CCard style={{ marginTop: 14 }}>
          <Text style={ct.h3}>Hood Guard · admin tools</Text>
          <CRow icon="link" title={t.invite ? `Invite code: ${t.invite}` : 'No invite code yet'} sub="Rotating revokes the old code" right={<CBtn small kind="ghost" title={t.invite ? 'Rotate' : 'Create'} onPress={() => chat.townInvite(id).then(() => show('Invite code updated')).catch(e => show(e.message, true))} />} />
          <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><CInput placeholder="New topic room name" value={newCh} onChangeText={setNewCh} /></View><CBtn small title="Add room" kind="ink" style={{ height: 50 }} onPress={() => newCh.trim() && chat.townChannel(id, newCh.trim()).then(() => setNewCh('')).catch(e => show(e.message, true))} /></View>
        </CCard>) : null}
      {t.role && t.role !== 'owner' ? <CBtn kind="ghost" title="Leave Hood" icon="close" style={{ marginTop: 12 }} onPress={() => chat.leaveTown(id).then(() => show('Left town')).catch(e => show(e.message, true))} /> : null}
      <CNotReady what="Voice Lounge & Live Lounge" why="Real-time audio/video rooms need a media server." />
    </CScreen>{toast}</View>
  );
}
const s = StyleSheet.create({
  mini: { width: 36, height: 36, borderRadius: 12, backgroundColor: CC.bg, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 30, padding: 22, alignItems: 'center' }, qr: { marginTop: 16, padding: 14, backgroundColor: '#fff', borderRadius: 22 },
  tile: { height: 200, borderRadius: 22, padding: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  preview: { height: 240, borderRadius: 26, alignItems: 'center', justifyContent: 'center', padding: 20 },
  moji: { padding: 4, borderRadius: 12, borderWidth: 2, borderColor: 'transparent', backgroundColor: CC.surface },
  townIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
