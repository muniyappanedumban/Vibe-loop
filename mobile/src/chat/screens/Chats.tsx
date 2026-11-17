import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as LocalAuthentication from 'expo-local-authentication';
import * as DocumentPicker from 'expo-document-picker';
import { Linking } from 'react-native';
import { useOutbox } from '../../lib/outbox';
import { MAX_UPLOAD } from '../../lib/uploads';
import { useSession } from '../../lib/api';
import { useLimit, useDefaults } from '../../lib/config';
import { CC, AQUA, BUBBLE_THEMES } from '../theme';
import { ChatIcon } from '../ChatIcon';
import { BubbleMoji } from '../BubbleMojiView';
import { CHAT_REACTIONS } from '../bubblemoji';
import { ReactionSheet } from '../../components/ReactionSheet';
import { SuggestBar, stickerToken, parseSticker } from '../../components/SuggestBar';
import { PromoSlot } from '../../components/PromoSlot';
import { RichText, TokenCard, parseToken, tok, SLASH, runSlash, smartReplies, useChatPrefs } from '../smart';
import * as Speech from 'expo-speech';
import * as Clipboard from 'expo-clipboard';
import { polish, phrasebook } from '../textTools';
import { useFeature as useFlag } from '../../lib/config';
import * as Location from 'expo-location';
import { Share } from 'react-native';
import { CScreen, CTop, CHeader, CIconBtn, CAvatar, CCard, CBtn, CChip, CRow, CInput, CNotReady, CToggle, useCToast, ct, when, hue } from '../ui';
import { useChat, chat, Conv, Msg } from '../useChat';
import { useFeature, useT } from '../../lib/config';
import { switchModule } from '../../components/ModuleSwitch';
import { online } from '../../lib/api';
import { useRealtime, typingIn } from '../../lib/realtime';
import { watchConv } from '../useChat';
import { useVoiceRecorder, VoicePlayer } from '../VoiceNote';
import { pickMedia, ChatMediaBubble, isMediaAtt, mediaKind, useMediaViewer } from '../media';
import { useNetInfo } from '@react-native-community/netinfo';
import { useHushPrefs, FONT_SCALE } from '../hushPrefs';

export function SignInNeeded({ navigation }: any) {
  return (
    <CScreen><CTop title="Hush" />
      <CCard style={{ alignItems: 'center', gap: 10, paddingVertical: 30 }}>
        <BubbleMoji id={42} size={72} /><Text style={ct.h3}>Hush needs your @ID</Text>
        <Text style={[ct.small, { textAlign: 'center' }]}>Messages live on the server so friends can reach you. Offline demo covers Glow (social) only.</Text>
        <CBtn title="Sign in with OTP" icon="key" onPress={() => navigation.navigate('SignIn')} />
      </CCard>
    </CScreen>
  );
}

const FOLDERS = [['all', 'All'], ['friends', 'Friends'], ['family', 'Family'], ['work', 'Work'], ['groups', 'Groups'], ['requests', 'Requests']] as const;
export function ChatList({ navigation }: any) {
  const st = useChat(); const tr = useT(); const [f, setF] = useState<string>('all'); const prefs = useChatPrefs(); const [showArch, setShowArch] = useState(false);
  // one-time migration: chats archived locally (old useChatPrefs) move to the server-side archive
  useEffect(() => { if (!online() || !prefs.archived.length || !st.convs.length) return; const ids = prefs.archived.filter(id => st.convs.some(c => c.id === id && !c.archived)); useChatPrefs.setState({ archived: [] }); ids.forEach(id => chat.archive(id, true).catch(() => {})); }, [st.convs.length]);
  if (!online()) return <SignInNeeded navigation={navigation} />;
  const archived = st.convs.filter(c => c.archived);
  const list = st.convs.filter(c => (showArch ? !!c.archived : !c.archived) && (f === 'requests' ? c.request : !c.request) && (showArch || f === 'all' || f === 'requests' || c.folder === f || (f === 'groups' && c.group)))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.last?.at ?? 0) - (a.last?.at ?? 0));
  const reqs = st.convs.filter(c => c.request).length;
  return (
    <View style={{ flex: 1 }}>
      <CScreen>
        <CTop title={tr('nav.Chats', 'Hush')} right={<View style={{ flexDirection: 'row', gap: 8 }}><CIconBtn name="search" label="Find messages" onPress={() => navigation.navigate('ChatSearch')} /><CIconBtn name="star" label="Starred" onPress={() => navigation.navigate('Starred')} /></View>} />
        {st.statuses.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }} style={{ marginBottom: 14 }}>
            {st.statuses.slice(0, 8).map(s => { const by = typeof s.by === 'string' ? { name: 'You', hue: 180 } : s.by; return (
              <Pressable key={s.id} onPress={() => navigation.navigate('StatusView', { id: s.id })} style={{ alignItems: 'center', width: 60 }}>
                <LinearGradient colors={AQUA as any} style={{ padding: 2.5, borderRadius: 20 }}><View style={{ backgroundColor: CC.bg, borderRadius: 18, padding: 2 }}><CAvatar name={by.name} h={by.hue} size={48} /></View></LinearGradient>
                <Text style={[ct.small, { fontSize: 11, marginTop: 4 }]} numberOfLines={1}>{by.name.split(' ')[0]}</Text>
              </Pressable>); })}
          </ScrollView>) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginBottom: 12 }}>
          {FOLDERS.map(([k, l]) => <CChip key={k} label={tr(`chat.folder.${k}`, l)} icon={k === 'requests' ? 'shield' : 'folder'} active={f === k} count={k === 'requests' ? reqs : undefined} onPress={() => setF(k)} />)}
        </ScrollView>
        <PromoSlot placement="chat_list" />
        {st.error ? <Text style={[ct.small, { color: CC.coral, marginBottom: 8 }]}>{st.error}</Text> : null}
        {archived.length || showArch ? <CCard onPress={() => setShowArch(!showArch)} style={{ marginBottom: 8, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}><ChatIcon name="folder" size={18} color={CC.teal} /><Text style={[ct.h3, { flex: 1 }]}>{showArch ? '← Back to chats' : `Archived (${archived.length})`}</Text></CCard> : null}
        {list.map(c => <ConvRow key={c.id} c={c} marked={prefs.unread.includes(c.id)} onLong={() => chat.archive(c.id, !c.archived).catch(() => {})} onPress={() => navigation.navigate('ChatRoom', { id: c.id })} />)}
        {!list.length ? <CCard style={{ alignItems: 'center', gap: 6 }}><BubbleMoji id={120} size={56} /><Text style={ct.h3}>{f === 'requests' ? 'No message requests' : 'No chats here yet'}</Text><Text style={ct.small}>Find friends by their exact @ID.</Text></CCard> : null}
        <LiveFooter />
      </CScreen>
      <Pressable onPress={() => navigation.navigate('NewChat')} style={s.fab} accessibilityRole="button" accessibilityLabel="New chat"><LinearGradient colors={AQUA as any} style={s.fabIn}><ChatIcon name="plus" size={26} color="#fff" /></LinearGradient></Pressable>
    </View>
  );
}
function ConvRow({ c, onPress, marked, onLong }: { c: Conv; onPress: () => void; marked?: boolean; onLong?: () => void }) {
  const other = c.members[0];
  return (
    <Pressable onLongPress={onLong} delayLongPress={450} accessibilityHint={c.archived ? 'Long-press to unarchive' : 'Long-press to archive'}><CCard onPress={onPress} style={{ marginBottom: 8, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {c.group ? <LinearGradient colors={AQUA as any} style={{ width: 50, height: 50, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}><ChatIcon name="friends" color="#fff" fill="rgba(255,255,255,.3)" /></LinearGradient> : <CAvatar name={other?.name ?? c.title} h={other?.hue ?? 180} size={50} uri={other?.avatar} online={!!other?.lastSeen && Date.now() - other.lastSeen < 120_000} />}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text style={ct.h3} numberOfLines={1}>{c.title}</Text>
          {c.pinned ? <ChatIcon name="pin" size={13} color={CC.teal} /> : null}{c.locked ? <ChatIcon name="lock" size={13} color={CC.ink} /> : null}{c.muted ? <ChatIcon name="mute" size={13} color={CC.inkSoft} /> : null}{c.fadeSec ? <ChatIcon name="fade" size={13} color={CC.aqua} /> : null}
        </View>
        <Text style={ct.small} numberOfLines={1}>{c.locked ? 'Locked chat' : c.request ? 'Message request · tap to review' : c.last ? `${c.last.from === 'me' ? 'You: ' : ''}${parseToken(c.last.text || '') ? 'Sent a card' : /^\[\[(v|b):/.test(c.last.text || '') ? 'Sent a sticker' : c.last.text || 'Shared a post'}` : 'Say hi'}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[ct.small, { fontSize: 11 }]}>{c.last ? when(c.last.at) : ''}</Text>
        {c.unread || marked ? <View style={s.unread}><Text style={{ color: '#fff', fontWeight: '900', fontSize: 11 }}>{c.unread || '•'}</Text></View> : null}
      </View>
    </CCard></Pressable>
  );
}

export function ChatRoom({ navigation, route }: any) {
  const id = route?.params?.id; const st = useChat(); const c = st.convs.find(x => x.id === id); const outbox = useOutbox(s => s.items); const netOn = useOutbox(s => s.online);
  const msgs = [...(st.msgs[id] ?? []), ...chat.pendingFor(id)]; void outbox;
  const [txt, setTxt] = useState(''); const [reply, setReply] = useState<Msg | null>(null); const [sel, setSel] = useState<Msg | null>(null); const [editing, setEditing] = useState<Msg | null>(null);
  const [attach, setAttach] = useState(false); const [pollQ, setPollQ] = useState(''); const [pollO, setPollO] = useState('Yes,No'); const [mode, setMode] = useState<'text' | 'viewonce' | 'later' | 'poll'>('text');
  const [unlocked, setUnlocked] = useState(false); const [lib, setLib] = useState<Msg | null>(null); const [showQuick, setShowQuick] = useState(false); const prefs = useChatPrefs(); const [tr, setTr] = useState<{ text: string; out: string | null } | null>(null);
  const copyOn = useFlag('chatCopy'); const chipsOn = useFlag('smartChips'); const slashOn = useFlag('slashCommands'); const polishOn = useFlag('quickPolish'); const phraseOn = useFlag('phrasebook');
  useEffect(() => { if (id) prefs.toggleUnread(id, false); }, [id]); const [settings, setSettings] = useState(false); const [fwd, setFwd] = useState<Msg | null>(null);
  const { toast, show } = useCToast(); const scroll = useRef<any>(null); const insTop = 50; const lockOn = useFeature('chatLock');
  const rt = useRealtime(s => s.status); const typers = useRealtime(s => s.typing[id]); const callsOn = useFlag('calls'); const voiceOn = useFlag('voiceNotes'); const snapsOn = useFlag('snaps'); const e2eeOn = useFlag('e2ee'); const mediaOn = useFlag('chatMedia'); const viewer = useMediaViewer();
  const callTypes = useDefaults()?.hush?.callTypes; const audioOk = !Array.isArray(callTypes) || callTypes.includes('audio'); const videoOk = !Array.isArray(callTypes) || callTypes.includes('video');
  const editMin = useLimit('editWindowMin', 15); const undoMin = useLimit('undoWindowMin', 60); const fileMB = Math.min(MAX_UPLOAD / 1048576, useLimit('fileMaxMB', MAX_UPLOAD / 1048576));
  const hp = useHushPrefs(s => s.prefs); const net = useNetInfo(); const [loadedMedia, setLoadedMedia] = useState<Record<string, boolean>>({});
  useEffect(() => { useHushPrefs.getState().load(); }, []);
  const autoDl = net.type === 'cellular' ? hp.autoDownload.cellular : net.type === 'wifi' || net.type === 'ethernet' ? hp.autoDownload.wifi : hp.autoDownload.wifi && hp.autoDownload.cellular;
  const fs = FONT_SCALE[hp.fontSize] ?? 1;
  const typingNow = Object.entries(typers ?? {}).some(([, t]) => t && Date.now() - t < 6000); void typingIn;
  const typingT = useRef<any>(null); const onType = (v: string) => { setTxt(v); if (!id) return; if (!typingT.current) chat.typing(id, true); clearTimeout(typingT.current); typingT.current = setTimeout(() => { chat.typing(id, false); typingT.current = null; }, 2500); };
  const voice = useVoiceRecorder(f => run(() => chat.send(id, { text: `Voice note · ${f.durationSec}s`, kind: 'voice', durationSec: Math.max(1, f.durationSec) }, { uri: f.uri, name: `voice-${Date.now()}.m4a`, mime: 'audio/m4a', size: 1 }).then(() => show('Voice note sent'))), m => show(m, true));
  useEffect(() => { chat.ensure(); watchConv(id, true); if (id) chat.openConv(id).then(() => chat.markRead(id)).catch(() => {}); const t = setInterval(() => { if (id && useRealtime.getState().status !== 'live') chat.openConv(id).then(() => chat.markRead(id)).catch(() => {}); }, 5000); return () => { clearInterval(t); watchConv(id, false); }; }, [id]);
  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 50); }, [msgs.length]);
  if (!c) return <CScreen><CHeader title="Hush" /><Text style={ct.small}>Loading…</Text></CScreen>;
  if (c.locked && lockOn && !unlocked) return <LockGate onOpen={() => setUnlocked(true)} title={c.title} />;
  const theme = BUBBLE_THEMES[c.theme ?? hp.bubbleTheme] ?? BUBBLE_THEMES.aqua;
  const run = async (fn: () => Promise<any>, ok?: string) => { try { await fn(); if (ok) show(ok); } catch (e: any) { show(e.message, true); } };
  const send = () => run(async () => {
    if (slashOn && txt.trim().startsWith('/')) { const r = runSlash(txt, 'I'); if (!r) throw new Error('Unknown or incomplete command'); if (r.kind === 'poll') await chat.send(id, { text: r.q, kind: 'poll', poll: { q: r.q, options: r.options } }); else await chat.send(id, { text: r.text, sendAt: r.sendAt }); setTxt(''); return; }
    if (editing) { await chat.edit(id, editing.id, txt); setEditing(null); setTxt(''); return; }
    if (mode === 'poll') { const opts = pollO.split(',').map(x => x.trim()).filter(Boolean); if (!pollQ.trim() || opts.length < 2) throw new Error('A poll needs a question and 2+ options'); await chat.send(id, { text: pollQ, kind: 'poll', poll: { q: pollQ, options: opts } }); setPollQ(''); setMode('text'); return; }
    if (!txt.trim()) return;
    if (e2eeOn && c.e2ee && !c.group && mode === 'text' && !reply) { await chat.sendEncrypted(id, c.members[0].id, txt.trim()); setTxt(''); return; }
    await chat.send(id, { text: txt.trim(), replyTo: reply?.id, viewOnce: mode === 'viewonce', sendAt: mode === 'later' ? Date.now() + 3600_000 : undefined });
    setTxt(''); setReply(null); if (mode !== 'text') { show(mode === 'later' ? 'Scheduled for 1 hour from now' : 'Sent as view-once'); setMode('text'); }
  });
  const sendMedia = (source: 'gallery' | 'camera', allow: 'all' | 'images' | 'videos' = 'all') => { setAttach(false); run(async () => {
    const f = await pickMedia(source, allow); if (!f) return;
    await chat.send(id, { text: txt.trim(), kind: 'file', replyTo: reply?.id }, { uri: f.uri, name: f.name, mime: f.mime, size: f.size });
    setTxt(''); setReply(null); show(netOn ? `${f.kind === 'video' ? 'Video' : 'Photo'} uploading — keep chatting` : 'Saved offline — sends when you reconnect');
  }); };
  const nameOf = (from: string) => (from === 'me' ? 'You' : c.members.find(m => m.id === from)?.name ?? 'Member');
  return (
    <View style={{ flex: 1, backgroundColor: CC.bg }}>
      <View style={{ paddingTop: insTop, paddingHorizontal: 18, backgroundColor: CC.bg }}>
          <CHeader title={c.title} sub={typingNow ? 'typing…' : c.group ? `${c.members.length + 1} members` : c.request ? 'Message request' : c.members[0]?.lastSeen ? (Date.now() - c.members[0].lastSeen < 120_000 ? 'online' : `last seen ${when(c.members[0].lastSeen)}`) : c.fadeSec ? `Fade Chat · ${c.fadeSec / 3600}h` : 'last seen hidden'} right={<View style={{ flexDirection: 'row', gap: 6 }}>
            {callsOn && !c.group && !c.request ? <>{audioOk ? <CIconBtn name="phone" label="Voice call" onPress={() => navigation.navigate('Call', { peer: c.members[0], media: 'audio' })} /> : null}{videoOk ? <CIconBtn name="video" label="Video call" onPress={() => navigation.navigate('Call', { peer: c.members[0], media: 'video' })} /> : null}</> : null}
            <CIconBtn name="more" label="Chat settings" onPress={() => setSettings(!settings)} /></View>} />
      </View>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 18, paddingBottom: 170 }}>
        {settings ? <ConvSettings c={c} onDone={() => setSettings(false)} show={show} /> : null}
        {c.request ? (
          <CCard style={{ marginBottom: 12, borderColor: CC.sun }}>
            <Text style={ct.h3}>Request Gate</Text><Text style={[ct.small, { marginVertical: 6 }]}>{c.title} isn't your friend yet. They can't see if you've read this.</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <CBtn small title="Accept" kind="ink" style={{ flex: 1 }} onPress={() => run(() => chat.patchConv(id, { accept: true }), 'Accepted')} />
              <CBtn small title="Block & report" kind="coral" style={{ flex: 1 }} onPress={() => run(async () => { const { call } = await import('../../lib/api'); await call('POST', `/edges/block/${c.members[0]?.id}`); await call('POST', '/reports', { target: c.members[0]?.id, reason: 'Spam message request' }); await chat.refreshConvs(); navigation.goBack(); }, 'Blocked & reported')} />
            </View>
          </CCard>) : null}
        {msgs.some(m => m.pinned) ? <View style={{ backgroundColor: CC.surface, borderRadius: 14, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: CC.line }}><Text style={ct.tiny}>PINNED</Text>{msgs.filter(m => m.pinned).slice(-3).map(m => <Text key={m.id} numberOfLines={1} style={{ fontWeight: '700', marginTop: 4 }}>• {parseToken(m.text) ? 'Special card' : m.text}</Text>)}</View> : null}
        {!netOn ? <View style={{ backgroundColor: CC.sunSoft, padding: 10, borderRadius: 12, marginBottom: 10 }}><Text style={{ fontWeight: '800', color: CC.ink }}>You're offline — reading saved chats. New messages send automatically when you're back.</Text></View> : null}
        {msgs.map(m =>  <Bubble key={m.id} m={m} me={m.from === 'me'} theme={theme} fs={fs} hold={m.from !== 'me' && !autoDl && !loadedMedia[m.id]} onLoadMedia={() => setLoadedMedia(x => ({ ...x, [m.id]: true }))} name={c.group && m.from !== 'me' ? nameOf(m.from) : undefined} onLong={() => setSel(m)}
          onVote={(i: number) => run(() => chat.msgAction(id, m.id, 'vote', { option: i }))} onOpen={() => run(async () => { const r = await chat.msgAction(id, m.id, 'open'); show(r?.text ? `"${r.text}" — gone after this view` : 'Opened'); })}
          onMedia={() => m.attachment?.url && viewer.open({ uri: m.attachment.url, kind: mediaKind(m.attachment), caption: m.text || undefined })}
          onSnap={() => run(async () => { const r = await chat.openSnap(id, m.id); navigation.navigate('SnapView', { url: r.mediaUrl, kind: r.message?.attachment?.kind ?? m.attachment?.kind, msgId: m.id }); })}
          onRef={() => m.ref && switchModule(navigation, 'social', m.ref.type === 'loop' ? { screen: 'LoopDetail', params: { id: m.ref.id } } : { screen: 'Main' })}
          onId={(h: string) => chat.lookup(h).then(u => chat.newConv([u.id])).then(cv => navigation.navigate('ChatRoom', { id: cv.id })).catch(e => show(e.message, true))} />)}
        {!msgs.length ? <Text style={[ct.small, { textAlign: 'center', marginTop: 30 }]}>No messages yet — say hi.</Text> : null}
      </ScrollView>
      {sel ? (
        <View style={s.sheet}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>{CHAT_REACTIONS.map(r => <Pressable key={r} onPress={() => { run(() => chat.msgAction(id, sel.id, 'react', { moji: r })); setSel(null); }} accessibilityLabel={`React ${r}`}><BubbleMoji id={r} size={40} /></Pressable>)}<Pressable onPress={() => { setLib(sel); setSel(null); }} accessibilityLabel="More reactions" style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: CC.tealSoft, alignItems: 'center', justifyContent: 'center' }}><ChatIcon name="plus" size={20} color={CC.teal} /></Pressable></View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <CChip icon="reply" label="Reply" onPress={() => { setReply(sel); setSel(null); }} />
            <CChip icon="star" label={sel.starred ? 'Unstar' : 'Star'} onPress={() => { run(() => chat.msgAction(id, sel.id, 'star')); setSel(null); }} />
            <CChip icon="pin" label={sel.pinned ? 'Unpin' : 'Pin'} onPress={() => { run(() => chat.msgAction(id, sel.id, 'pin')); setSel(null); }} />
            <CChip icon="forward" label="Forward" onPress={() => { setFwd(sel); setSel(null); }} />
            {copyOn && !sel.deleted ? <CChip icon="share" label="Copy" onPress={() => { Clipboard.setStringAsync(sel.text).then(() => show('Copied')); setSel(null); }} /> : null}
            {phraseOn && sel.kind === 'text' ? <CChip icon="globe" label="Phrasebook" onPress={() => { const hi = phrasebook(sel.text, 'hi'), ta = phrasebook(sel.text, 'ta'), en = phrasebook(sel.text, 'en'); setTr({ text: sel.text, out: [hi && `हिन्दी: ${hi}`, ta && `தமிழ்: ${ta}`, en && `English: ${en}`].filter(Boolean).join('\n') || null }); setSel(null); }} /> : null}
            <CChip icon="clock" label="Info" onPress={() => { show(`${sel.from === 'me' ? 'Sent' : 'Received'} ${new Date(sel.at).toLocaleString()}${sel.edited ? ' · edited' : ''}${sel.expiresAt ? ' · fades' : ''}`); setSel(null); }} />
            {sel.from === 'me' && sel.kind === 'text' && !sel.deleted ? <CChip icon="edit" label={`Edit (${editMin} min)`} onPress={() => { setEditing(sel); setTxt(sel.text); setSel(null); }} /> : null}
            {sel.from === 'me' && !sel.deleted ? <CChip icon="undo" label={`Undo send (${undoMin} min)`} onPress={() => { run(() => chat.undo(id, sel.id), 'Message unsent'); setSel(null); }} /> : null}
            <CChip icon="close" label="Close" onPress={() => setSel(null)} />
          </View>
        </View>) : null}
      <ReactionSheet kind="bubble" open={!!lib} onClose={() => setLib(null)} onPick={m => lib && run(() => chat.msgAction(id, lib.id, 'react', { moji: m }))} />
      {tr ? <View style={s.sheet}><Text style={ct.h3}>Phrasebook</Text><Text style={[ct.small, { marginVertical: 6 }]}>“{tr.text}”</Text><Text style={{ fontWeight: '700', lineHeight: 22 }}>{tr.out ?? 'Not in the phrasebook. Full translation needs a translation service, which isn\'t connected yet.'}</Text><CBtn small kind="ghost" title="Close" style={{ marginTop: 10 }} onPress={() => setTr(null)} /></View> : null}
      {fwd ? (
        <View style={s.sheet}><Text style={[ct.h3, { marginBottom: 8 }]}>Forward to…</Text>
          {st.convs.filter(x => x.id !== id && !x.request).slice(0, 6).map(x => <CRow key={x.id} icon="chats" title={x.title} onPress={() => { run(() => chat.forward(id, fwd.id, x.id), `Forwarded to ${x.title}`); setFwd(null); }} />)}
          <CBtn small kind="ghost" title="Cancel" onPress={() => setFwd(null)} /></View>) : null}
      <View style={s.composerWrap}>
        {reply || editing ? <View style={s.replyBar}><ChatIcon name={editing ? 'edit' : 'reply'} size={16} color={CC.teal} /><Text style={[ct.small, { flex: 1 }]} numberOfLines={1}>{editing ? 'Editing message' : `Replying to ${nameOf(reply!.from)}: ${reply!.text}`}</Text><Pressable onPress={() => { setReply(null); setEditing(null); setTxt(''); }}><ChatIcon name="close" size={16} color={CC.inkSoft} /></Pressable></View> : null}
        {mode !== 'text' ? <View style={s.replyBar}><ChatIcon name={mode === 'poll' ? 'poll' : mode === 'later' ? 'clock' : 'eye'} size={16} color={CC.aqua} /><Text style={[ct.small, { flex: 1 }]}>{mode === 'poll' ? 'Quick Poll' : mode === 'later' ? 'Send Later · delivers in 1 hour' : 'View once · disappears after opening'}</Text><Pressable onPress={() => setMode('text')}><ChatIcon name="close" size={16} color={CC.inkSoft} /></Pressable></View> : null}
        {slashOn && txt.startsWith('/') ? <View style={s.attach}>{SLASH.filter(x => x.cmd.startsWith(txt.split(' ')[0])).map(x => <CChip key={x.cmd} label={x.hint} onPress={() => setTxt(x.cmd + ' ')} />)}</View> : null}
        {!txt && mode === 'text' && !editing ? <View style={s.attach}>{(chipsOn ? smartReplies : () => [])([...msgs].reverse().find(m => m.from !== 'me')?.text).map(r => <CChip key={r} label={r} icon="spark" onPress={() => run(() => chat.send(id, { text: r }))} />)}{showQuick ? prefs.quick.map(q => <CChip key={q} label={q} onPress={() => run(() => chat.send(id, { text: q }))} />) : null}<CChip label={showQuick ? 'Hide quick' : 'Quick replies'} icon="spark" onPress={() => setShowQuick(!showQuick)} /></View> : null}
        {mode === 'text' && !editing ? <SuggestBar text={txt} kind="bubble" onPick={m => run(() => chat.send(id, { text: stickerToken('bubble', m) }))} /> : null}
        {mode === 'poll' ? (<View style={{ paddingHorizontal: 4 }}><CInput placeholder="Poll question" value={pollQ} onChangeText={setPollQ} /><CInput placeholder="Options, comma separated" value={pollO} onChangeText={setPollO} /></View>) : null}
        {attach ? (
          <View style={s.attach}>
            {[['poll', 'Poll', 'poll'], ['viewonce', 'View once', 'eye'], ['later', 'Send later', 'clock']].map(([k, l, i]) => <CChip key={k} icon={i as any} label={l} active={mode === k} onPress={() => { setMode(k as any); setAttach(false); }} />)}
            <CChip icon="globe" label="Place Drop" onPress={async () => { setAttach(false); try { const p = await Location.requestForegroundPermissionsAsync(); if (!p.granted) return show('Location is off', true); const pos = await Location.getCurrentPositionAsync({}); let name = ''; try { const g = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }); name = [g[0]?.district || g[0]?.name, g[0]?.city].filter(Boolean).join(', '); } catch {} await chat.send(id, { text: tok.place(pos.coords.latitude, pos.coords.longitude, name) }); } catch (e: any) { show(e.message, true); } }} />
            {snapsOn ? <CChip icon="eye" label="Snap (opens once)" onPress={() => { setAttach(false); navigation.navigate('LiveCamera', { convId: id, title: c.title }); }} /> : null}
            <CChip icon="qr" label="ID Card" onPress={() => { setAttach(false); const a = useSession.getState(); const me = a.accounts.find(x => x.id === a.activeId); if (me) run(() => chat.send(id, { text: tok.id(me.handle, me.name) })); }} />
            <CChip icon="spark" label="Mystery Drop" onPress={() => { setAttach(false); if (!txt.trim()) return show('Type the secret first, then tap Mystery Drop', true); run(() => chat.send(id, { text: tok.mystery(txt.trim()) })).then(() => setTxt('')); }} />
            <CChip icon="clock" label="Together Timer · 1h" onPress={() => { setAttach(false); run(() => chat.send(id, { text: tok.timer(Date.now() + 3600_000, txt.trim() || 'Starts in') })).then(() => setTxt('')); }} />
            <CChip icon="poll" label="Decision Tap" onPress={() => { setAttach(false); if (!txt.trim()) return show('Type the question first', true); run(() => chat.send(id, { text: txt.trim(), kind: 'poll', poll: { q: txt.trim(), options: ['Yes', 'No'] } })).then(() => setTxt('')); }} />
            {[['Tonight 9pm', () => { const d = new Date(); d.setHours(21, 0, 0, 0); return d.getTime() > Date.now() ? d.getTime() : d.getTime() + 86400_000; }], ['Tomorrow 9am', () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime(); }], ['In a week', () => Date.now() + 7 * 86400_000]].map(([l, f]: any) => <CChip key={l} icon="clock" label={`Future Drop · ${l}`} onPress={() => { setAttach(false); if (!txt.trim()) return show('Type the message first', true); run(() => chat.send(id, { text: txt.trim(), sendAt: f() })).then(() => { setTxt(''); show(`Scheduled · ${l}`); }); }} />)}
            {mediaOn ? <CChip icon="camera" label="Photo / Video" onPress={() => sendMedia('gallery')} /> : null}
            {mediaOn && Platform.OS !== 'web' ? <CChip icon="camera" label="Camera · photo" onPress={() => sendMedia('camera', 'images')} /> : null}
            {mediaOn && Platform.OS !== 'web' ? <CChip icon="video" label="Camera · video (60 s)" onPress={() => sendMedia('camera', 'videos')} /> : null}
            <CChip icon="clip" label={`File (up to ${fileMB >= 1024 ? '1 GB' : fileMB + ' MB'})`} onPress={async () => { setAttach(false); const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false }); const a = !r.canceled ? r.assets[0] : null; if (!a) return; if ((a.size ?? 0) > fileMB * 1048576) return show(`Files can be up to ${fileMB} MB`, true); await chat.send(id, { text: a.name, kind: 'file' }, { uri: a.uri, name: a.name, mime: a.mimeType ?? 'application/octet-stream', size: a.size ?? 0 }); show(netOn ? 'Uploading — you can keep chatting' : 'Saved offline — sends when you reconnect'); }} />
          </View>) : null}
        <View style={s.composer}>
          <Pressable onPress={() => setAttach(!attach)} style={s.round} accessibilityLabel="Attach"><ChatIcon name="plus" size={20} color={CC.ink} /></Pressable>
          {mode !== 'poll' ? <TextInput value={txt} onChangeText={onType} placeholder={voice.on ? 'Recording… release to send' : e2eeOn && c.e2ee ? 'Encrypted message' : c.request && msgs.some(m => m.from === 'me') ? 'Waiting for them to accept…' : 'Message'} placeholderTextColor="#94A9AD" style={[s.input, { fontSize: 15 * fs }]} multiline={!hp.enterToSend} returnKeyType={hp.enterToSend ? 'send' : 'default'} blurOnSubmit={false} onSubmitEditing={hp.enterToSend ? () => { if (txt.trim()) send(); } : undefined} accessibilityLabel="Message" /> : <View style={{ flex: 1 }} />}
          {copyOn && !txt ? <Pressable onPress={() => Clipboard.getStringAsync().then(t => t && setTxt(t.slice(0, 4000)))} style={s.round} accessibilityLabel="Paste"><ChatIcon name="clip" size={18} color={CC.ink} /></Pressable> : null}
          {polishOn && txt.trim().length > 3 ? <Pressable onPress={() => { const p = polish(txt); if (!p.changes) show('Looks good already'); else { setTxt(p.text); show(`Polished · ${p.changes} fix${p.changes > 1 ? 'es' : ''}`); } }} style={s.round} accessibilityLabel="Quick Polish"><ChatIcon name="spark" size={18} color={CC.teal} /></Pressable> : null}
          <Pressable onPress={txt.trim() || mode === 'poll' || !voiceOn ? send : () => show('Hold to record a voice note')} onLongPress={!txt.trim() && mode !== 'poll' && voiceOn && Platform.OS !== 'web' ? voice.start : undefined} onPressOut={() => voice.on && voice.stop(true)} delayLongPress={250} accessibilityLabel={txt.trim() ? 'Send' : 'Send or hold for voice note'} accessibilityRole="button"><LinearGradient colors={voice.on ? ['#E5484D', '#E5484D'] as any : theme} style={s.send}><ChatIcon name={txt.trim() || mode === 'poll' ? 'send' : 'mic'} size={20} color="#fff" fill="rgba(255,255,255,.3)" /></LinearGradient></Pressable>
        </View>
      </View>
      {toast}{viewer.viewer}
    </View>
  );
}
function Bubble({ m, me, theme, name, onLong, onVote, onOpen, onRef, onId, onSnap, onMedia, fs = 1, hold, onLoadMedia }: any) {
  const msg: Msg = m;
  const body = msg.deleted ? <Text style={{ fontStyle: 'italic', color: me ? 'rgba(255,255,255,.8)' : CC.inkSoft }}>Message unsent</Text>
    : msg.kind === 'poll' && msg.poll ? (
      <View style={{ minWidth: 220 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}><ChatIcon name="poll" size={16} color={me ? '#fff' : CC.teal} /><Text style={{ fontWeight: '900', color: me ? '#fff' : CC.ink }}>{msg.poll.q}</Text></View>
        {msg.poll.options.map((o, i) => { const tot = msg.poll!.options.reduce((a, x) => a + x.votes, 0) || 1; return (
          <Pressable key={i} onPress={() => onVote(i)} style={s.pollOpt} accessibilityLabel={`Vote ${o.text}`}>
            <View style={[s.pollFill, { width: `${(o.votes / tot) * 100}%` }]} />
            <Text style={{ fontWeight: '800', flex: 1, color: CC.ink }}>{msg.poll!.myVote === i ? '✓ ' : ''}{o.text}</Text><Text style={{ fontWeight: '900', color: CC.ink }}>{o.votes}</Text>
          </Pressable>); })}
      </View>)
    : msg.kind === 'viewonce' ? (
      <Pressable onPress={me ? undefined : onOpen} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ChatIcon name="eye" size={18} color={me ? '#fff' : CC.aqua} /><Text style={{ fontWeight: '800', color: me ? '#fff' : CC.ink }}>{msg.opened ? 'Opened' : me ? 'View-once message' : 'Tap to view once'}</Text></Pressable>)
    : (msg.kind === 'post' || msg.kind === 'draft') && msg.ref ? (
      <Pressable onPress={onRef} style={{ width: 220 }}>
        <LinearGradient colors={[hue(msg.ref.hue, 75, 60), hue(msg.ref.hue + 40, 75, 40)]} style={{ height: 110, borderRadius: 14, padding: 10, justifyContent: 'flex-end' }}>
          <Text style={{ color: '#fff', fontWeight: '900' }}>{msg.kind === 'draft' ? 'DRAFT · feedback wanted' : 'From Glow'}</Text></LinearGradient>
        <Text style={{ fontWeight: '800', marginTop: 6, color: me ? '#fff' : CC.ink }} numberOfLines={2}>{msg.ref.title}</Text>
        {msg.text ? <Text style={{ color: me ? 'rgba(255,255,255,.85)' : CC.inkSoft, marginTop: 2 }}>{msg.text}</Text> : null}
        <Text style={{ color: me ? CC.sun : CC.teal, fontWeight: '800', marginTop: 4, fontSize: 12 }}>Open in Glow →</Text>
      </Pressable>)
    : msg.kind === 'file' && msg.attachment && isMediaAtt(msg.attachment) ? <ChatMediaBubble att={msg.attachment} caption={msg.text && msg.text !== msg.attachment.name ? msg.text : undefined} me={me} pending={msg.pending} progress={msg.progress} failed={msg.failed} onOpen={onMedia} hold={hold} onLoad={onLoadMedia} />
    : msg.kind === 'file' ? (
      <Pressable onPress={() => msg.attachment?.url && !msg.pending && Linking.openURL(msg.attachment.url.startsWith('/') ? useSession.getState().apiUrl + msg.attachment.url : msg.attachment.url)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200 }} accessibilityRole="button">
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: me ? 'rgba(255,255,255,.18)' : CC.tealSoft, alignItems: 'center', justifyContent: 'center' }}><ChatIcon name="clip" size={20} color={me ? '#fff' : CC.teal} /></View>
        <View style={{ flex: 1 }}><Text style={{ fontWeight: '800', color: me ? '#fff' : CC.ink }} numberOfLines={1}>{msg.attachment?.name ?? msg.text}</Text><Text style={{ fontSize: 11, color: me ? 'rgba(255,255,255,.8)' : CC.inkSoft }}>{msg.attachment ? `${((msg.attachment.size ?? 0) / 1048576).toFixed(1)} MB` : ''}{msg.pending ? ' · uploading' : ' · tap to open'}</Text></View>
      </Pressable>)
    : msg.kind === 'voice' && msg.attachment?.url && !msg.pending ? <VoicePlayer uri={msg.attachment.url.startsWith('/') ? useSession.getState().apiUrl + msg.attachment.url : msg.attachment.url} me={me} durationSec={msg.durationSec ?? undefined} />
    : msg.kind === 'voice' ? <Text style={{ fontWeight: '800', color: me ? '#fff' : CC.ink }}>🎙 Voice note{msg.pending ? ' · sending when online' : ''}</Text>
    : msg.kind === 'snap' ? (
      <Pressable onPress={me ? undefined : onSnap} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityLabel="Open snap"><View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: msg.opened ? 'transparent' : (me ? '#fff' : '#E5484D'), borderWidth: 2, borderColor: me ? '#fff' : '#E5484D' }} /><Text style={{ fontWeight: '800', color: me ? '#fff' : CC.ink }}>{msg.pending ? 'Snap · sending' : msg.opened ? 'Snap opened' : me ? 'Snap delivered' : 'Tap to view Snap'}</Text></Pressable>)
    : msg.kind === 'call' ? <Text style={{ fontWeight: '800', color: me ? '#fff' : CC.ink }}>📞 {msg.text}</Text>
    : msg.enc ? <View><Text style={{ fontSize: 10, fontWeight: '800', color: me ? 'rgba(255,255,255,.8)' : CC.teal }}>🔒 END-TO-END</Text><RichText text={msg.plain ?? 'Decrypting…'} me={me} onMention={onId} scale={fs} /></View>
    : msg.kind === 'ping' ? <Text style={{ fontWeight: '800', color: me ? '#fff' : CC.ink }}>{msg.text}</Text>
    : parseSticker(msg.text) ? <BubbleMoji id={parseSticker(msg.text)!.id} size={84} />
    : parseToken(msg.text) ? <TokenCard tk={parseToken(msg.text)!} me={me} onOpenId={onId} />
    : <RichText text={msg.text} me={me} onMention={onId} scale={fs} />;
  const reacts = msg.reactions.reduce<Record<number, number>>((a, r) => ((a[r.moji] = (a[r.moji] || 0) + 1), a), {});
  return (
    <View style={{ alignItems: me ? 'flex-end' : 'flex-start', marginBottom: Object.keys(reacts).length ? 18 : 8 }}>
      {name ? <Text style={[ct.small, { marginLeft: 8, marginBottom: 2 }]}>{name}</Text> : null}
      <Pressable onLongPress={onLong} onPress={onLong} delayLongPress={300} accessibilityLabel="Message actions" style={{ maxWidth: '82%' }}>
        {me ? <LinearGradient colors={theme} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.bub, { borderBottomRightRadius: 6 }]}>{msg.replyTo ? <View style={[s.quote, { borderLeftColor: '#fff', backgroundColor: 'rgba(255,255,255,.15)' }]}><Text style={{ color: '#fff', fontSize: 12 }} numberOfLines={2}>{msg.replyTo.text}</Text></View> : null}{body}</LinearGradient>
          : <View style={[s.bub, s.them]}>{msg.replyTo ? <View style={s.quote}><Text style={{ fontSize: 12, color: CC.inkSoft }} numberOfLines={2}>{msg.replyTo.text}</Text></View> : null}{body}</View>}
        {Object.keys(reacts).length ? <View style={[s.reacts, me ? { right: 8 } : { left: 8 }]}>{Object.entries(reacts).map(([k, n]) => <View key={k} style={{ flexDirection: 'row', alignItems: 'center' }}><BubbleMoji id={Number(k)} size={20} />{n > 1 ? <Text style={{ fontSize: 10, fontWeight: '900' }}>{n}</Text> : null}</View>)}</View> : null}
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 4, marginTop: 2, alignItems: 'center' }}>
        {msg.starred ? <ChatIcon name="star" size={11} color={CC.sun} /> : null}{msg.pinned ? <ChatIcon name="pin" size={11} color={CC.teal} /> : null}{msg.expiresAt ? <ChatIcon name="fade" size={11} color={CC.aqua} /> : null}
        <Text style={[ct.small, { fontSize: 10 }]}>{msg.pending ? 'Pending · sends when online' : msg.sendAt && msg.sendAt > Date.now() ? `Scheduled ${when(msg.sendAt)}` : when(msg.at)}{msg.edited ? ' · edited' : ''}</Text>{me && msg.status ? <Text accessibilityLabel={`Message ${msg.status}`} style={{ fontSize: 11, fontWeight: '900', color: msg.status === 'read' ? '#2B8CFF' : CC.inkSoft }}>{msg.status === 'sent' ? '✓' : '✓✓'}</Text> : null}
      </View>
    </View>
  );
}
function ConvSettings({ c, onDone, show }: { c: Conv; onDone: () => void; show: (m: string, e?: boolean) => void }) {
  const patch = (b: any, ok?: string) => chat.patchConv(c.id, b).then(() => ok && show(ok)).catch(e => show(e.message, true));
  return (
    <CCard style={{ marginBottom: 12 }}>
      <CRow icon="pin" title="Pin chat" right={<CToggle value={c.pinned} onChange={v => patch({ pinned: v })} label="Pin chat" />} />
      <CRow icon="mute" title="Silent Vibe (mute)" right={<CToggle value={c.muted} onChange={v => patch({ muted: v })} label="Mute" />} />
      <CRow icon="lock" title="Vibe Lock" sub="Needs device authentication to open" right={<CToggle value={c.locked} onChange={v => patch({ locked: v })} label="Lock chat" />} />
      <Text style={[ct.tiny, { marginTop: 8 }]}>FADE CHAT (DISAPPEARING)</Text>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginVertical: 8 }}>{[[null, 'Off'], [3600, '1 hour'], [86400, '24 hours'], [604800, '7 days']].map(([v, l]) => <CChip key={String(v)} label={l as string} icon="fade" active={c.fadeSec === v} onPress={() => patch({ fadeSec: v }, 'Fade timer updated')} />)}</View>
      <Text style={ct.tiny}>FOLDER</Text>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginVertical: 8 }}>{[[null, 'None'], ['friends', 'Friends'], ['family', 'Family'], ['work', 'Work']].map(([v, l]) => <CChip key={String(v)} label={l as string} icon="folder" active={c.folder === v} onPress={() => patch({ folder: v })} />)}</View>
      <Text style={ct.tiny}>CHAT CANVAS (BUBBLE THEME)</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginVertical: 8 }}>{Object.entries(BUBBLE_THEMES).map(([k, g]) => <Pressable key={k} onPress={() => patch({ theme: k })} accessibilityLabel={`Theme ${k}`}><LinearGradient colors={g} style={{ width: 40, height: 40, borderRadius: 12, borderWidth: (c.theme ?? 'aqua') === k ? 3 : 0, borderColor: CC.sun }} /></Pressable>)}</View>
      <Text style={[ct.tiny, { marginTop: 8 }]}>MORE</Text>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginVertical: 8 }}>
        <CChip icon="share" label="Export chat" onPress={() => { const ms = useChat.getState().msgs[c.id] ?? []; Share.share({ message: ms.map(m => `[${new Date(m.at).toLocaleString()}] ${m.from === 'me' ? 'Me' : c.members.find(x => x.id === m.from)?.name ?? m.from}: ${m.text}`).join('\n') }).catch(() => {}); }} />
        <CChip icon="mic" label="Read aloud" onPress={() => { const last = (useChat.getState().msgs[c.id] ?? []).filter(m => m.kind === 'text').slice(-1)[0]; if (last) Speech.speak(last.text); else show('Nothing to read', true); }} />
        <CChip icon="folder" label={c.archived ? 'Unarchive' : 'Archive'} onPress={() => chat.archive(c.id, !c.archived).then(() => show(c.archived ? 'Moved back to Chats' : 'Archived')).catch(e => show(e.message, true))} />
        <CChip icon="bell" label="Mark unread" onPress={() => { useChatPrefs.getState().toggleUnread(c.id, true); show('Marked unread'); }} />
      </View>
      <CBtn small kind="ghost" title="Done" onPress={onDone} />
    </CCard>
  );
}
export function LockGate({ onOpen, title }: { onOpen: () => void; title: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const unlock = async () => {
    if (Platform.OS === 'web' || !(await LocalAuthentication.hasHardwareAsync()) || !(await LocalAuthentication.isEnrolledAsync())) { setMsg('This device has no screen lock / biometrics set up, so the lock cannot be enforced here.'); onOpen(); return; }
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: `Unlock ${title}` }); if (r.success) onOpen(); else setMsg('Not unlocked');
  };
  return (
    <CScreen><CHeader title={title} />
      <CCard style={{ alignItems: 'center', gap: 12, paddingVertical: 34 }}><ChatIcon name="lock" size={54} color={CC.teal} /><Text style={ct.h3}>This chat is locked</Text><Text style={ct.small}>Use your fingerprint, face or screen lock.</Text>
        <CBtn title="Unlock" icon="key" onPress={unlock} />{msg ? <Text style={[ct.small, { textAlign: 'center' }]}>{msg}</Text> : null}</CCard>
    </CScreen>
  );
}

export function NewChat({ navigation }: any) {
  useEffect(() => { chat.ensure(); }, []);
  const st = useChat(); const [h, setH] = useState(''); const [found, setFound] = useState<any>(null); const [pick, setPick] = useState<string[]>([]); const [title, setTitle] = useState(''); const maxGroup = useLimit('maxGroupSize', 50);
  const { toast, show } = useCToast();
  const find = async () => { setFound(null); const v = h.trim().replace(/^@+/, ''); if (v.length < 2) { show('Type their @ID first', true); return; } try { setFound(await chat.lookup(h.startsWith('@') ? h : '@' + h)); } catch (e: any) { show(e.message, true); } };
  const open = async (members: string[], t?: string) => { try { const c = await chat.newConv(members, t); navigation.replace('ChatRoom', { id: c.id }); } catch (e: any) { show(e.message, true); } };
  const isFriend = found && st.friends.some(f => f.id === found.id);
  return (
    <View style={{ flex: 1 }}><CScreen>
      <CHeader title="Start a Hush" sub="Find people by their exact @ID" right={<CIconBtn name="qr" label="My code" onPress={() => navigation.navigate('MyCode')} />} />
      <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><CInput placeholder="@exact.id" value={h} onChangeText={t => setH(t.trim().toLowerCase())} autoCapitalize="none" /></View><CBtn title="Find" icon="search" onPress={find} style={{ marginTop: 0, height: 50 }} /></View>
      {found ? (
        <CCard style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><CAvatar name={found.name} h={found.hue} size={54} /><View style={{ flex: 1 }}><Text style={ct.h3}>{found.name} {found.verified ? '✓' : ''}</Text><Text style={ct.small}>{found.handle}</Text>{found.bio ? <Text style={[ct.small, { marginTop: 2 }]}>{found.bio}</Text> : null}</View></View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <CBtn small title={isFriend ? 'Message' : 'Send request message'} icon="chats" style={{ flex: 1 }} onPress={() => open([found.id])} />
            {!isFriend ? <CBtn small kind="ghost" title="Add friend" icon="friends" style={{ flex: 1 }} onPress={() => chat.friendRequest(found.handle).then(() => show('Friend request sent')).catch(e => show(e.message, true))} /> : null}
          </View>
          {!isFriend ? <Text style={[ct.small, { marginTop: 8 }]}>Not friends yet: your first message lands in their Request Gate.</Text> : null}
        </CCard>) : null}
      <Text style={[ct.tiny, { marginBottom: 8 }]}>NEW GROUP · PICK FRIENDS</Text>
      {st.friends.map(f => <CRow key={f.id} title={f.name} sub={f.handle} right={<CToggle value={pick.includes(f.id)} onChange={v => { if (v && pick.length + 1 >= maxGroup) return show(`Groups can have up to ${maxGroup} people`, true); setPick(v ? [...pick, f.id] : pick.filter(x => x !== f.id)); }} label={`Add ${f.name}`} />} />)}
      {pick.length >= 2 ? (<><CInput label="Group name" value={title} onChangeText={setTitle} placeholder="Weekend plan" /><CBtn title={`Create group (${pick.length + 1})`} icon="friends" onPress={() => open(pick, title || 'New group')} /><CBtn kind="ghost" style={{ marginTop: 8 }} title="Party Chat · vanishes in 24h" icon="fade" onPress={async () => { try { const cv = await chat.newConv(pick, title || 'Party Chat'); await chat.patchConv(cv.id, { fadeSec: 86400 }); navigation.replace('ChatRoom', { id: cv.id }); } catch (e: any) { show(e.message, true); } }} /></>) : <Text style={ct.small}>Pick 2+ friends to start a group.</Text>}
    </CScreen>{toast}</View>
  );
}

export function ShareToChat({ navigation, route }: any) {
  const { type, id, title } = route?.params ?? {}; const st = useChat(); const [note, setNote] = useState(''); const { toast, show } = useCToast();
  useEffect(() => { if (!st.ready) chat.loadAll().catch(() => {}); }, []);
  if (!online()) return <SignInNeeded navigation={navigation} />;
  return (
    <View style={{ flex: 1 }}><CScreen>
      <CHeader title={type === 'loop' ? 'Draft Bridge' : 'Post2Chat'} sub={type === 'loop' ? 'Send an unpublished draft to a friend for feedback' : 'Share privately into a chat'} />
      <CCard style={{ marginBottom: 12 }}><Text style={ct.tiny}>{type === 'loop' ? 'PRIVATE DRAFT' : 'POST'}</Text><Text style={[ct.h3, { marginTop: 4 }]}>{title ?? id}</Text></CCard>
      <CInput label="Add a note (optional)" value={note} onChangeText={setNote} placeholder={type === 'loop' ? 'Be honest — does the hook land?' : 'Thought of you'} />
      {st.convs.filter(c => !c.request).map(c => <CRow key={c.id} icon={c.group ? 'friends' : 'chats'} title={c.title} sub={c.group ? 'Group' : c.members[0]?.handle} onPress={() => chat.share(c.id, type, id, note).then(() => { show(`Sent to ${c.title}`); setTimeout(() => navigation.goBack(), 700); }).catch(e => show(e.message, true))} />)}
    </CScreen>{toast}</View>
  );
}

export function ChatSearch({ navigation }: any) {
  const [q, setQ] = useState(''); const [res, setRes] = useState<Msg[] | null>(null); const st = useChat();
  useEffect(() => { if (q.trim().length < 2) { setRes(null); return; } const t = setTimeout(() => chat.search(q.trim()).then(setRes).catch(() => {}), 300); return () => clearTimeout(t); }, [q]);
  return (
    <CScreen>
      <CHeader title="Find Anything" sub="Search your messages" />
      <CInput placeholder="Search messages" value={q} onChangeText={setQ} autoFocus />
      {res?.map(m => { const c = st.convs.find(x => x.id === m.convId); return <CRow key={m.id} icon="chats" title={m.text} sub={`${c?.title ?? 'Chat'} · ${when(m.at)}`} onPress={() => navigation.navigate('ChatRoom', { id: m.convId })} />; })}
      {res && !res.length ? <Text style={ct.small}>No messages match “{q}”.</Text> : null}
    </CScreen>
  );
}
export function Starred({ navigation }: any) {
  const st = useChat(); const [all, setAll] = useState<Msg[]>([]);
  useEffect(() => { chat.ensure().then(() => Promise.all(useChat.getState().convs.map(c => chat.openConv(c.id).catch(() => {}))).then(() => setAll(Object.values(useChat.getState().msgs).flat().filter(m => m.starred)))); }, []);
  return (
    <CScreen><CHeader title="Star Box" sub={`${all.length} saved messages`} />
      {all.map(m => <CRow key={m.id} icon="star" tint="#C98A00" title={m.text} sub={`${st.convs.find(c => c.id === m.convId)?.title ?? ''} · ${when(m.at)}`} onPress={() => navigation.navigate('ChatRoom', { id: m.convId })} />)}
      {!all.length ? <Text style={ct.small}>Long-press a message and choose Star.</Text> : null}
    </CScreen>
  );
}
const s = StyleSheet.create({
  fab: { position: 'absolute', right: 18, bottom: 110 }, fabIn: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  unread: { minWidth: 22, height: 22, borderRadius: 8, backgroundColor: CC.teal, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  bub: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 }, them: { backgroundColor: CC.surface, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: CC.line },
  quote: { borderLeftWidth: 3, borderLeftColor: CC.teal, backgroundColor: CC.tealSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 6 },
  reacts: { position: 'absolute', bottom: -14, flexDirection: 'row', gap: 2, backgroundColor: CC.surface, borderRadius: 12, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 1, borderColor: CC.line },
  pollOpt: { height: 40, borderRadius: 12, backgroundColor: CC.surface, marginTop: 6, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, overflow: 'hidden', borderWidth: 1, borderColor: CC.line },
  pollFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: CC.tealSoft },
  sheet: { position: 'absolute', left: 10, right: 10, bottom: 100, backgroundColor: CC.surface, borderRadius: 24, padding: 14, borderWidth: 1, borderColor: CC.line, zIndex: 60, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 18, elevation: 10 },
  composerWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 10, paddingBottom: 22, paddingTop: 6, backgroundColor: CC.bg },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, backgroundColor: CC.surface, borderRadius: 22, padding: 6, borderWidth: 1, borderColor: CC.line },
  round: { width: 40, height: 40, borderRadius: 14, backgroundColor: CC.bg, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 40, maxHeight: 110, fontSize: 15, fontWeight: '500', color: CC.ink, paddingTop: 10 }, send: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: CC.surface, borderRadius: 14, padding: 8, marginBottom: 6, borderWidth: 1, borderColor: CC.line },
  attach: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
});

function LiveFooter() {
  const st = useRealtime(s => s.status); const e2ee = useFlag('e2ee');
  return <Text style={[ct.small, { textAlign: 'center', marginTop: 16 }]}>{st === 'live' ? 'Live · instant delivery' : st === 'off' ? 'Updates every 5 seconds' : 'Reconnecting… (updates every 5 seconds meanwhile)'}{e2ee ? ' · 1:1 chats sealed end-to-end when both sides have keys' : ''}</Text>;
}
