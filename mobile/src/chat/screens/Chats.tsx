import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as LocalAuthentication from 'expo-local-authentication';
import { CC, AQUA, BUBBLE_THEMES } from '../theme';
import { ChatIcon } from '../ChatIcon';
import { BubbleMoji } from '../BubbleMojiView';
import { CHAT_REACTIONS } from '../bubblemoji';
import { ReactionSheet } from '../../components/ReactionSheet';
import { CScreen, CTop, CHeader, CIconBtn, CAvatar, CCard, CBtn, CChip, CRow, CInput, CNotReady, CToggle, useCToast, ct, when, hue } from '../ui';
import { useChat, chat, Conv, Msg } from '../useChat';
import { useFeature, useT } from '../../lib/config';
import { switchModule } from '../../components/ModuleSwitch';
import { online } from '../../lib/api';

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
  const st = useChat(); const tr = useT(); const [f, setF] = useState<string>('all');
  if (!online()) return <SignInNeeded navigation={navigation} />;
  const list = st.convs.filter(c => (f === 'requests' ? c.request : !c.request) && (f === 'all' || f === 'requests' || c.folder === f || (f === 'groups' && c.group)))
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
        {st.error ? <Text style={[ct.small, { color: CC.coral, marginBottom: 8 }]}>{st.error}</Text> : null}
        {list.map(c => <ConvRow key={c.id} c={c} onPress={() => navigation.navigate('ChatRoom', { id: c.id })} />)}
        {!list.length ? <CCard style={{ alignItems: 'center', gap: 6 }}><BubbleMoji id={120} size={56} /><Text style={ct.h3}>{f === 'requests' ? 'No message requests' : 'No chats here yet'}</Text><Text style={ct.small}>Find friends by their exact @ID.</Text></CCard> : null}
        <Text style={[ct.small, { textAlign: 'center', marginTop: 16 }]}>Updates every 5 seconds · end-to-end encryption not yet enabled</Text>
      </CScreen>
      <Pressable onPress={() => navigation.navigate('NewChat')} style={s.fab} accessibilityRole="button" accessibilityLabel="New chat"><LinearGradient colors={AQUA as any} style={s.fabIn}><ChatIcon name="plus" size={26} color="#fff" /></LinearGradient></Pressable>
    </View>
  );
}
function ConvRow({ c, onPress }: { c: Conv; onPress: () => void }) {
  const other = c.members[0];
  return (
    <CCard onPress={onPress} style={{ marginBottom: 8, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {c.group ? <LinearGradient colors={AQUA as any} style={{ width: 50, height: 50, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}><ChatIcon name="friends" color="#fff" fill="rgba(255,255,255,.3)" /></LinearGradient> : <CAvatar name={other?.name ?? c.title} h={other?.hue ?? 180} size={50} />}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text style={ct.h3} numberOfLines={1}>{c.title}</Text>
          {c.pinned ? <ChatIcon name="pin" size={13} color={CC.teal} /> : null}{c.locked ? <ChatIcon name="lock" size={13} color={CC.ink} /> : null}{c.muted ? <ChatIcon name="mute" size={13} color={CC.inkSoft} /> : null}{c.fadeSec ? <ChatIcon name="fade" size={13} color={CC.aqua} /> : null}
        </View>
        <Text style={ct.small} numberOfLines={1}>{c.locked ? 'Locked chat' : c.request ? 'Message request · tap to review' : c.last ? `${c.last.from === 'me' ? 'You: ' : ''}${c.last.text || 'Shared a post'}` : 'Say hi'}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[ct.small, { fontSize: 11 }]}>{c.last ? when(c.last.at) : ''}</Text>
        {c.unread ? <View style={s.unread}><Text style={{ color: '#fff', fontWeight: '900', fontSize: 11 }}>{c.unread}</Text></View> : null}
      </View>
    </CCard>
  );
}

export function ChatRoom({ navigation, route }: any) {
  const id = route?.params?.id; const st = useChat(); const c = st.convs.find(x => x.id === id); const msgs = st.msgs[id] ?? [];
  const [txt, setTxt] = useState(''); const [reply, setReply] = useState<Msg | null>(null); const [sel, setSel] = useState<Msg | null>(null); const [editing, setEditing] = useState<Msg | null>(null);
  const [attach, setAttach] = useState(false); const [pollQ, setPollQ] = useState(''); const [pollO, setPollO] = useState('Yes,No'); const [mode, setMode] = useState<'text' | 'viewonce' | 'later' | 'poll'>('text');
  const [unlocked, setUnlocked] = useState(false); const [lib, setLib] = useState<Msg | null>(null); const [settings, setSettings] = useState(false); const [fwd, setFwd] = useState<Msg | null>(null);
  const { toast, show } = useCToast(); const scroll = useRef<any>(null); const insTop = 50; const lockOn = useFeature('chatLock');
  useEffect(() => { chat.ensure(); if (id) chat.openConv(id).catch(() => {}); const t = setInterval(() => id && chat.openConv(id).catch(() => {}), 5000); return () => clearInterval(t); }, [id]);
  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 50); }, [msgs.length]);
  if (!c) return <CScreen><CHeader title="Chat" /><Text style={ct.small}>Loading…</Text></CScreen>;
  if (c.locked && lockOn && !unlocked) return <LockGate onOpen={() => setUnlocked(true)} title={c.title} />;
  const theme = BUBBLE_THEMES[c.theme ?? 'aqua'] ?? BUBBLE_THEMES.aqua;
  const run = async (fn: () => Promise<any>, ok?: string) => { try { await fn(); if (ok) show(ok); } catch (e: any) { show(e.message, true); } };
  const send = () => run(async () => {
    if (editing) { await chat.edit(id, editing.id, txt); setEditing(null); setTxt(''); return; }
    if (mode === 'poll') { const opts = pollO.split(',').map(x => x.trim()).filter(Boolean); if (!pollQ.trim() || opts.length < 2) throw new Error('A poll needs a question and 2+ options'); await chat.send(id, { text: pollQ, kind: 'poll', poll: { q: pollQ, options: opts } }); setPollQ(''); setMode('text'); return; }
    if (!txt.trim()) return;
    await chat.send(id, { text: txt.trim(), replyTo: reply?.id, viewOnce: mode === 'viewonce', sendAt: mode === 'later' ? Date.now() + 3600_000 : undefined });
    setTxt(''); setReply(null); if (mode !== 'text') { show(mode === 'later' ? 'Scheduled for 1 hour from now' : 'Sent as view-once'); setMode('text'); }
  });
  const nameOf = (from: string) => (from === 'me' ? 'You' : c.members.find(m => m.id === from)?.name ?? 'Member');
  return (
    <View style={{ flex: 1, backgroundColor: CC.bg }}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insTop, paddingHorizontal: 18, paddingBottom: 170 }}>
        <CHeader title={c.title} sub={c.group ? `${c.members.length + 1} members` : c.request ? 'Message request' : c.fadeSec ? `Fade Chat · ${c.fadeSec / 3600}h` : 'Tap ⋯ for chat settings'} right={<View style={{ flexDirection: 'row', gap: 6 }}>
          <CIconBtn name="phone" label="Voice call" onPress={() => show('Calls need a media server — not ready yet', true)} />
          <CIconBtn name="more" label="Chat settings" onPress={() => setSettings(!settings)} /></View>} />
        {settings ? <ConvSettings c={c} onDone={() => setSettings(false)} show={show} /> : null}
        {c.request ? (
          <CCard style={{ marginBottom: 12, borderColor: CC.sun }}>
            <Text style={ct.h3}>Request Gate</Text><Text style={[ct.small, { marginVertical: 6 }]}>{c.title} isn't your friend yet. They can't see if you've read this.</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <CBtn small title="Accept" kind="ink" style={{ flex: 1 }} onPress={() => run(() => chat.patchConv(id, { accept: true }), 'Accepted')} />
              <CBtn small title="Block & report" kind="coral" style={{ flex: 1 }} onPress={() => run(async () => { const { call } = await import('../../lib/api'); await call('POST', `/edges/block/${c.members[0]?.id}`); await call('POST', '/reports', { target: c.members[0]?.id, reason: 'Spam message request' }); await chat.refreshConvs(); navigation.goBack(); }, 'Blocked & reported')} />
            </View>
          </CCard>) : null}
        {msgs.map(m => <Bubble key={m.id} m={m} me={m.from === 'me'} theme={theme} name={c.group && m.from !== 'me' ? nameOf(m.from) : undefined} onLong={() => setSel(m)}
          onVote={(i: number) => run(() => chat.msgAction(id, m.id, 'vote', { option: i }))} onOpen={() => run(async () => { const r = await chat.msgAction(id, m.id, 'open'); show(r?.text ? `"${r.text}" — gone after this view` : 'Opened'); })}
          onRef={() => m.ref && switchModule(navigation, 'social', m.ref.type === 'loop' ? { screen: 'LoopDetail', params: { id: m.ref.id } } : { screen: 'Main' })} />)}
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
            {sel.from === 'me' && sel.kind === 'text' && !sel.deleted ? <CChip icon="edit" label="Edit (15 min)" onPress={() => { setEditing(sel); setTxt(sel.text); setSel(null); }} /> : null}
            {sel.from === 'me' && !sel.deleted ? <CChip icon="undo" label="Undo send (60 min)" onPress={() => { run(() => chat.undo(id, sel.id), 'Message unsent'); setSel(null); }} /> : null}
            <CChip icon="close" label="Close" onPress={() => setSel(null)} />
          </View>
        </View>) : null}
      <ReactionSheet kind="bubble" open={!!lib} onClose={() => setLib(null)} onPick={m => lib && run(() => chat.msgAction(id, lib.id, 'react', { moji: m }))} />
      {fwd ? (
        <View style={s.sheet}><Text style={[ct.h3, { marginBottom: 8 }]}>Forward to…</Text>
          {st.convs.filter(x => x.id !== id && !x.request).slice(0, 6).map(x => <CRow key={x.id} icon="chats" title={x.title} onPress={() => { run(() => chat.forward(id, fwd.id, x.id), `Forwarded to ${x.title}`); setFwd(null); }} />)}
          <CBtn small kind="ghost" title="Cancel" onPress={() => setFwd(null)} /></View>) : null}
      <View style={s.composerWrap}>
        {reply || editing ? <View style={s.replyBar}><ChatIcon name={editing ? 'edit' : 'reply'} size={16} color={CC.teal} /><Text style={[ct.small, { flex: 1 }]} numberOfLines={1}>{editing ? 'Editing message' : `Replying to ${nameOf(reply!.from)}: ${reply!.text}`}</Text><Pressable onPress={() => { setReply(null); setEditing(null); setTxt(''); }}><ChatIcon name="close" size={16} color={CC.inkSoft} /></Pressable></View> : null}
        {mode !== 'text' ? <View style={s.replyBar}><ChatIcon name={mode === 'poll' ? 'poll' : mode === 'later' ? 'clock' : 'eye'} size={16} color={CC.aqua} /><Text style={[ct.small, { flex: 1 }]}>{mode === 'poll' ? 'Quick Poll' : mode === 'later' ? 'Send Later · delivers in 1 hour' : 'View once · disappears after opening'}</Text><Pressable onPress={() => setMode('text')}><ChatIcon name="close" size={16} color={CC.inkSoft} /></Pressable></View> : null}
        {mode === 'poll' ? (<View style={{ paddingHorizontal: 4 }}><CInput placeholder="Poll question" value={pollQ} onChangeText={setPollQ} /><CInput placeholder="Options, comma separated" value={pollO} onChangeText={setPollO} /></View>) : null}
        {attach ? (
          <View style={s.attach}>
            {[['poll', 'Poll', 'poll'], ['viewonce', 'View once', 'eye'], ['later', 'Send later', 'clock']].map(([k, l, i]) => <CChip key={k} icon={i as any} label={l} active={mode === k} onPress={() => { setMode(k as any); setAttach(false); }} />)}
            <CChip icon="clip" label="File" onPress={() => { setAttach(false); show('File sharing needs encrypted storage — not ready yet', true); }} />
            <CChip icon="camera" label="Photo" onPress={() => { setAttach(false); show('Camera & photo upload — not ready yet', true); }} />
          </View>) : null}
        <View style={s.composer}>
          <Pressable onPress={() => setAttach(!attach)} style={s.round} accessibilityLabel="Attach"><ChatIcon name="plus" size={20} color={CC.ink} /></Pressable>
          {mode !== 'poll' ? <TextInput value={txt} onChangeText={setTxt} placeholder={c.request && msgs.some(m => m.from === 'me') ? 'Waiting for them to accept…' : 'Message'} placeholderTextColor="#94A9AD" style={s.input} multiline accessibilityLabel="Message" /> : <View style={{ flex: 1 }} />}
          <Pressable onPress={send} accessibilityLabel="Send" accessibilityRole="button"><LinearGradient colors={theme} style={s.send}><ChatIcon name={txt.trim() || mode === 'poll' ? 'send' : 'mic'} size={20} color="#fff" fill="rgba(255,255,255,.3)" /></LinearGradient></Pressable>
        </View>
      </View>
      {toast}
    </View>
  );
}
function Bubble({ m, me, theme, name, onLong, onVote, onOpen, onRef }: any) {
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
          <Text style={{ color: '#fff', fontWeight: '900' }}>{msg.kind === 'draft' ? 'DRAFT · feedback wanted' : 'From Social'}</Text></LinearGradient>
        <Text style={{ fontWeight: '800', marginTop: 6, color: me ? '#fff' : CC.ink }} numberOfLines={2}>{msg.ref.title}</Text>
        {msg.text ? <Text style={{ color: me ? 'rgba(255,255,255,.85)' : CC.inkSoft, marginTop: 2 }}>{msg.text}</Text> : null}
        <Text style={{ color: me ? CC.sun : CC.teal, fontWeight: '800', marginTop: 4, fontSize: 12 }}>Open in Social →</Text>
      </Pressable>)
    : msg.kind === 'ping' ? <Text style={{ fontWeight: '800', color: me ? '#fff' : CC.ink }}>{msg.text}</Text>
    : <Text style={{ fontSize: 15, fontWeight: '500', color: me ? '#fff' : CC.ink, lineHeight: 21 }}>{msg.text}</Text>;
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
        <Text style={[ct.small, { fontSize: 10 }]}>{msg.sendAt && msg.sendAt > Date.now() ? `Scheduled ${when(msg.sendAt)}` : when(msg.at)}{msg.edited ? ' · edited' : ''}</Text>
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
      <CBtn small kind="ghost" title="Done" onPress={onDone} />
    </CCard>
  );
}
function LockGate({ onOpen, title }: { onOpen: () => void; title: string }) {
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
  const st = useChat(); const [h, setH] = useState(''); const [found, setFound] = useState<any>(null); const [pick, setPick] = useState<string[]>([]); const [title, setTitle] = useState('');
  const { toast, show } = useCToast();
  const find = async () => { setFound(null); try { setFound(await chat.lookup(h.startsWith('@') ? h : '@' + h)); } catch (e: any) { show(e.message, true); } };
  const open = async (members: string[], t?: string) => { try { const c = await chat.newConv(members, t); navigation.replace('ChatRoom', { id: c.id }); } catch (e: any) { show(e.message, true); } };
  const isFriend = found && st.friends.some(f => f.id === found.id);
  return (
    <View style={{ flex: 1 }}><CScreen>
      <CHeader title="New chat" sub="Find people by their exact @ID" right={<CIconBtn name="qr" label="My code" onPress={() => navigation.navigate('MyCode')} />} />
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
      {st.friends.map(f => <CRow key={f.id} title={f.name} sub={f.handle} right={<CToggle value={pick.includes(f.id)} onChange={v => setPick(v ? [...pick, f.id] : pick.filter(x => x !== f.id))} label={`Add ${f.name}`} />} />)}
      {pick.length >= 2 ? (<><CInput label="Group name" value={title} onChangeText={setTitle} placeholder="Weekend plan" /><CBtn title={`Create group (${pick.length + 1})`} icon="friends" onPress={() => open(pick, title || 'New group')} /></>) : <Text style={ct.small}>Pick 2+ friends to start a group.</Text>}
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
