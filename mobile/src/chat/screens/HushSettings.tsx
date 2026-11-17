// Hush Control Room — every Hush (chat) setting in one place, all persisted on the server.
// Profile-level privacy → PATCH /me/profile · Hush prefs + quiet hours → GET/PATCH /me/hush-settings (backend/app/routes_hush_settings.py)
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Platform, Share } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { CC, BUBBLE_THEMES } from '../theme';
import { ChatIcon } from '../ChatIcon';
import { CScreen, CHeader, CAvatar, CCard, CBtn, CChip, CRow, CToggle, useCToast, ct, CNotReady, CInput } from '../ui';
import { useChat, chat } from '../useChat';
import { call, useSession, online } from '../../lib/api';
import { signOutEverywhere } from '../../lib/sync';
import { useFeature } from '../../lib/config';
import { fingerprint, myPublicKey, ensureKeys } from '../e2ee';
import { SignInNeeded } from './Chats';

import { useHushPrefs, HushPrefs } from '../hushPrefs';
export type { HushPrefs };
type Who = HushPrefs['whoCanCall'];
type Quiet = { on: boolean; from: number; to: number; tzOffsetMin: number };
type HushState = { settings: HushPrefs; quietHours: Quiet; storage: { uploads: number; bytes: number }; archived: number; blocked: number };

/** Loads /me/hush-settings on focus; `patch` is optimistic and rolls back on error. */
function useHush() {
  const [st, setSt] = useState<HushState | null>(null); const [err, setErr] = useState<string | null>(null); const { toast, show } = useCToast();
  const load = useCallback(() => { if (online()) call<HushState>('GET', '/me/hush-settings').then(r => { setSt(r); setErr(null); useHushPrefs.getState().set(r.settings); }).catch(e => setErr(e.message)); }, []);
  useFocusEffect(load);
  const patch = async (body: any, ok = 'Saved') => {
    const prev = st;
    if (st) setSt({ ...st, settings: { ...st.settings, ...Object.fromEntries(Object.entries(body).filter(([k]) => k !== 'quietHours').map(([k, v]) => [k, typeof v === 'object' && v && !Array.isArray(v) ? { ...(st.settings as any)[k], ...v } : v])) } as HushPrefs, quietHours: body.quietHours ? { ...st.quietHours, ...body.quietHours } : st.quietHours });
    try { const r = await call<HushState>('PATCH', '/me/hush-settings', body); setSt(r); useHushPrefs.getState().set(r.settings); show(ok); } catch (e: any) { setSt(prev); show(e.message, true); }
  };
  return { st, err, patch, toast, show, reload: load };
}
function useProfileSave() {
  const p = useChat(s => s.profile); const { toast, show } = useCToast();
  useEffect(() => { if (!p && online()) chat.loadAll().catch(() => {}); }, [p]);
  const save = (b: any, ok = 'Saved') => chat.saveProfile(b).then(() => show(ok)).catch(e => show(e.message, true));
  return { p, save, toast, show };
}
const Sec = ({ t }: { t: string }) => <Text style={[ct.tiny, { marginTop: 16, marginBottom: 8 }]}>{t}</Text>;
const Chips = <T extends string | number | null>({ opts, value, onPick }: { opts: [T, string][]; value: T; onPick: (v: T) => void }) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 8 }}>{opts.map(([v, l]) => <CChip key={String(v)} label={l} active={value === v} onPress={() => onPick(v)} />)}</View>
);
const WHO: [Who, string][] = [['everyone', 'Everyone'], ['friends', 'Squad only'], ['nobody', 'Nobody']];
const Loading = ({ err, title }: { err: string | null; title: string }) => <CScreen><CHeader title={title} />{err ? <CNotReady what="Couldn't load your settings" why={err} /> : <Text style={ct.small}>Loading…</Text>}</CScreen>;
function Off({ title }: { title: string }) { return <CScreen><CHeader title={title} /><CNotReady what="Hush Control Room is switched off" why="VibeLoop turned this area off for now. Your existing settings still apply." /></CScreen>; }
const mb = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(1)} MB`);

// ---------------- hub ----------------
export function HushSettings({ navigation }: any) {
  const on = useFeature('hushSettings'); const sess = useSession(); const p = useChat(s => s.profile); const { st } = useHush();
  if (!on) return <Off title="Hush Control Room" />;
  if (!online()) return <SignInNeeded navigation={navigation} />;
  const me = sess.accounts.find(a => a.id === sess.activeId); const go = (r: string, params?: any) => () => navigation.navigate(r, params);
  return (
    <CScreen>
      <CHeader title="Hush Control Room" sub="Your quiet side, your rules" />
      <CCard onPress={go('HushProfile')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <CAvatar name={p?.name ?? me?.name ?? ''} h={me?.hue ?? 180} size={52} uri={p?.avatar_chat ?? p?.avatar_social} />
        <View style={{ flex: 1 }}><Text style={ct.h3}>{p?.name ?? me?.name}</Text><Text style={ct.small}>{p?.handle ?? me?.handle} · {p?.chat_bio || 'No Hush bio yet'}</Text></View>
        <ChatIcon name="edit" size={18} color={CC.inkSoft} />
      </CCard>
      <Sec t="ACCOUNT" />
      <CCard>
        <CRow icon="user" title="Hush profile" sub="Name, Hush bio, Hush photo" onPress={go('HushProfile')} />
        <CRow icon="key" title="Change @ID" sub="Once every 30 days" onPress={go('ChangeHandle')} />
        <CRow icon="switch" title="Accounts" sub={`Switch between up to 5 · ${sess.accounts.length} on this device`} onPress={go('Accounts')} />
      </CCard>
      <Sec t="VIBE CHECK" />
      <CCard>
        <CRow icon="ghost" title="Privacy" sub="Who can DM, last seen, ghost hours, receipts" onPress={go('HushPrivacy')} />
        <CRow icon="shield" title="Blocked" sub={st ? `${st.blocked} blocked` : 'People you blocked'} onPress={go('HushBlocked')} />
        <CRow icon="bell" title="Notifications" sub={st?.quietHours.on ? `Quiet hours ${st.quietHours.from}:00–${st.quietHours.to}:00` : 'Pings, groups, calls, moods'} onPress={go('HushNotifications')} />
        <CRow icon="chats" title="Chats" sub="Fade timer, bubbles, font size, downloads" onPress={go('HushChats')} />
        <CRow icon="folder" title="Archive" sub={st ? `${st.archived} archived` : 'Archived chats'} onPress={go('HushArchive')} />
        <CRow icon="phone" title="Calls" sub="Who can ring you, data saver" onPress={go('HushCalls')} />
        <CRow icon="lock" title="Security" sub="Encryption key, chat lock, sessions" onPress={go('HushSecurity')} />
        <CRow icon="clip" title="Storage & data" sub={st ? `${st.storage.uploads} uploads · ${mb(st.storage.bytes)}` : 'Outbox, uploads, cache'} onPress={go('HushStorage')} />
      </CCard>
      <Sec t="MORE" />
      <CCard>
        <CRow icon="globe" title="Language & region" onPress={go('LanguageRegion')} />
        <CRow icon="board" title="Help" sub="Hush Guide, House Rules, SOS Lane" onPress={go('ContentHub', { module: 'hush' })} />
        <CRow icon="spark" title="About Hush" onPress={go('HushAbout')} />
      </CCard>
    </CScreen>
  );
}

// ---------------- profile ----------------
export function HushProfile({ navigation }: any) {
  const { p, save, toast } = useProfileSave(); const [name, setName] = useState(p?.name ?? ''); const [bio, setBio] = useState(p?.chat_bio ?? '');
  useEffect(() => { setName(p?.name ?? ''); setBio(p?.chat_bio ?? ''); }, [p?.name, p?.chat_bio]);
  return (
    <View style={{ flex: 1 }}><CScreen>
      <CHeader title="Hush profile" sub="What your Squad sees" />
      <CCard style={{ alignItems: 'center', gap: 8 }}>
        <CAvatar name={p?.name ?? ''} h={(p as any)?.hue ?? 180} size={84} uri={p?.avatar_chat ?? p?.avatar_social} />
        <CBtn small kind="ghost" icon="camera" title={p?.avatar_chat ? 'Change Hush photo' : 'Add a Hush-only photo'} onPress={() => navigation.navigate('EditProfile', { module: 'chat' })} />
        {p?.avatar_chat ? <CBtn small kind="ghost" icon="close" title="Use my Glow photo instead" onPress={() => save({ avatar_chat: '' }, 'Hush photo removed')} /> : null}
      </CCard>
      <CCard style={{ marginTop: 12 }}>
        <CInput label="Name" value={name} onChangeText={setName} maxLength={60} />
        <CInput label="Hush bio (140)" value={bio} onChangeText={setBio} maxLength={140} placeholder="lowkey online" />
        <CBtn small title="Save" icon="check" disabled={!name.trim()} onPress={() => save({ name: name.trim(), chat_bio: bio }, 'Profile updated')} />
      </CCard>
    </CScreen>{toast}</View>
  );
}

// ---------------- privacy ----------------
export function HushPrivacy({ navigation }: any) {
  const { p, save, toast: t1 } = useProfileSave(); const { st, err, patch, toast } = useHush();
  const fRR = useFeature('readReceipts'); const fTyping = useFeature('typing');
  if (!st) return <Loading err={err} title="Privacy" />;
  const s = st.settings;
  return (
    <View style={{ flex: 1 }}><CScreen>
      <CHeader title="Privacy" sub="Vibe check who gets in" />
      <CCard>
        <Text style={[ct.small, { fontWeight: '800', color: CC.ink }]}>Who can slide into my DMs</Text>
        <Chips opts={WHO} value={(p?.who_can_message ?? 'everyone') as Who} onPick={v => save({ who_can_message: v })} />
        <Text style={[ct.small, { fontWeight: '800', color: CC.ink }]}>Who sees my Hush photo</Text>
        <Chips opts={WHO} value={s.photoVisibility} onPick={v => patch({ photoVisibility: v })} />
      </CCard>
      <CCard style={{ marginTop: 12 }}>
        <CRow icon="clock" title="Last seen" sub="Off = you won't see others' last seen either" right={<CToggle value={p?.last_seen_visible !== false} onChange={v => save({ last_seen_visible: v })} label="Last seen" />} />
        <CRow icon="moon" title="Ghost hours" sub="Hide online status & typing" right={<CToggle value={!!p?.ghost_hours} onChange={v => save({ ghost_hours: v })} label="Ghost hours" />} />
        {fRR ? <CRow icon="check" title="Read receipts" sub="Off = no seen ticks both ways" right={<CToggle value={p?.chat_read_receipts !== false} onChange={v => save({ chat_read_receipts: v })} label="Read receipts" />} /> : null}
        {fTyping ? <CRow icon="edit" title="Show when I'm typing" sub="Let people see the typing dots" right={<CToggle value={s.typingVisible} onChange={v => patch({ typingVisible: v })} label="Typing indicator" />} /> : null}
        <CRow icon="ghost" title="Hidden identity" sub="Only friends with your exact @ID find you" right={<CToggle value={!!p?.hidden} onChange={v => save({ hidden: v })} label="Hidden identity" />} />
      </CCard>
      <CCard style={{ marginTop: 12 }}><CRow icon="shield" title="Blocked" sub={`${st.blocked} blocked`} onPress={() => navigation.navigate('HushBlocked')} /></CCard>
    </CScreen>{toast}{t1}</View>
  );
}

export function HushBlocked() {
  const [list, setList] = useState<any[] | null>(null); const [err, setErr] = useState<string | null>(null); const { toast, show } = useCToast();
  const load = useCallback(() => { call<any[]>('GET', '/me/blocked').then(setList).catch(e => setErr(e.message)); }, []);
  useFocusEffect(load);
  const unblock = (x: any) => call<any>('POST', `/edges/block/${x.id}`).then(r => { if (r.on) return call('POST', `/edges/block/${x.id}`); }).then(() => { setList(l => (l ?? []).filter(y => y.id !== x.id)); show(`Unblocked ${x.handle}`); }).catch(e => show(e.message, true));
  return (
    <View style={{ flex: 1 }}><CScreen>
      <CHeader title="Blocked" sub="They can't message, call or find you" />
      {err ? <CNotReady what="Couldn't load" why={err} /> : !list ? <Text style={ct.small}>Loading…</Text> : list.length === 0 ? <CCard><Text style={ct.small}>Nobody blocked. Peaceful.</Text></CCard> : (
        <CCard>{list.map(x => <CRow key={x.id} title={x.name} sub={x.handle} right={<CBtn small kind="ghost" title="Unblock" onPress={() => unblock(x)} />} />)}</CCard>
      )}
    </CScreen>{toast}</View>
  );
}

// ---------------- notifications ----------------
const HOURS = Array.from({ length: 24 }, (_, i) => i);
export function HushNotifications() {
  const { st, err, patch, toast, show } = useHush(); const fPush = useFeature('push'); const fCalls = useFeature('calls');
  if (!st) return <Loading err={err} title="Notifications" />;
  const n = st.settings.notif; const q = st.quietHours;
  const tz = -new Date().getTimezoneOffset();
  const N = (k: keyof typeof n, icon: any, title: string, sub: string) => <CRow icon={icon} title={title} sub={sub} right={<CToggle value={n[k]} onChange={v => patch({ notif: { [k]: v } })} label={title} />} />;
  const test = async () => {
    try {
      const reg = await import('../../lib/push').then(m => m.registerPush());
      const r = await call<any>('POST', '/me/push-test');
      show(r.sent ? `Test ping sent to ${r.devices} device${r.devices > 1 ? 's' : ''}` : reg.message || 'No device registered yet', !r.sent);
    } catch (e: any) { show(e.message, true); }
  };
  return (
    <View style={{ flex: 1 }}><CScreen>
      <CHeader title="Notifications" sub="Pings, on your terms" />
      <CCard>
        {N('messages', 'chats', 'Messages', '1:1 chats')}
        {N('groups', 'friends', 'Groups & Hoods', 'Group chats and Town channels')}
        {fCalls ? N('calls', 'phone', 'Calls', 'Voice & face calls') : null}
        {N('moods', 'vibes', 'Moods', 'When your Squad drops a Mood')}
        {N('previews', 'eye', 'Message previews', 'Show text in the banner')}
      </CCard>
      <Sec t="QUIET HOURS" />
      <CCard>
        <CRow icon="moon" title="Quiet hours" sub="No push pings in this window (calls too)" right={<CToggle value={q.on} onChange={v => patch({ quietHours: { on: v, tzOffsetMin: tz } }, v ? 'Quiet hours on' : 'Quiet hours off')} label="Quiet hours" />} />
        {q.on ? <>
          <Text style={[ct.small, { marginTop: 6 }]}>From</Text>
          <Chips opts={HOURS.filter(h => h >= 18 || h <= 2).map(h => [h, `${h}:00`] as [number, string])} value={q.from} onPick={v => patch({ quietHours: { from: v, tzOffsetMin: tz } })} />
          <Text style={ct.small}>Until</Text>
          <Chips opts={HOURS.filter(h => h >= 5 && h <= 11).map(h => [h, `${h}:00`] as [number, string])} value={q.to} onPick={v => patch({ quietHours: { to: v, tzOffsetMin: tz } })} />
        </> : null}
      </CCard>
      {fPush ? <CBtn kind="ghost" icon="bell" title="Register this device & send a test ping" style={{ marginTop: 16 }} onPress={test} /> : null}
    </CScreen>{toast}</View>
  );
}

// ---------------- chats ----------------
export function HushChats({ navigation }: any) {
  const { st, err, patch, toast, show } = useHush(); const fFade = useFeature('fadeChat'); const fExport = useFeature('chatExport');
  if (!st) return <Loading err={err} title="Chats" />;
  const s = st.settings;
  const exportAll = async () => {
    try {
      const data = await call<any>('GET', '/me/hush-export', undefined, 60000); const json = JSON.stringify(data, null, 2);
      if (Platform.OS === 'web') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = `hush-export-${Date.now()}.json`; a.click(); }
      else await Share.share({ title: 'Hush export', message: json });
      show(`Exported ${data.conversations.length} chats`);
    } catch (e: any) { show(e.message, true); }
  };
  const clearCache = async () => { const id = useSession.getState().activeId; await AsyncStorage.removeItem(`vibeloop-chat-cache-${id}`).catch(() => {}); show('Offline cache cleared — chats reload from the server'); chat.loadAll().catch(() => {}); };
  return (
    <View style={{ flex: 1 }}><CScreen>
      <CHeader title="Chats" sub="How Hush looks & behaves" />
      {fFade ? <CCard>
        <Text style={[ct.small, { fontWeight: '800', color: CC.ink }]}>Default fade timer for new chats</Text>
        <Chips opts={[[null, 'Off'], [3600, '1 hour'], [86400, '24 hours'], [604800, '7 days']]} value={s.defaultFadeSec} onPick={v => patch({ defaultFadeSec: v })} />
      </CCard> : null}
      <CCard style={{ marginTop: 12 }}>
        <Text style={[ct.small, { fontWeight: '800', color: CC.ink }]}>Bubble drip (default theme)</Text>
        <Chips opts={Object.keys(BUBBLE_THEMES).map(k => [k, k[0].toUpperCase() + k.slice(1)] as [string, string])} value={s.bubbleTheme} onPick={v => patch({ bubbleTheme: v })} />
        <View style={{ flexDirection: 'row', gap: 6 }}>{Object.entries(BUBBLE_THEMES).map(([k, [a]]) => <View key={k} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: a, opacity: k === s.bubbleTheme ? 1 : 0.3 }} />)}</View>
        <Text style={[ct.small, { fontWeight: '800', color: CC.ink, marginTop: 12 }]}>Text size</Text>
        <Chips opts={[['s', 'Small'], ['m', 'Normal'], ['l', 'Large'], ['xl', 'Huge']]} value={s.fontSize} onPick={v => patch({ fontSize: v })} />
        <CRow icon="send" title="Enter to send" sub="Return key sends instead of new line" right={<CToggle value={s.enterToSend} onChange={v => patch({ enterToSend: v })} label="Enter to send" />} />
      </CCard>
      <Sec t="MEDIA AUTO-DOWNLOAD" />
      <CCard>
        <CRow icon="globe" title="On Wi-Fi" right={<CToggle value={s.autoDownload.wifi} onChange={v => patch({ autoDownload: { wifi: v } })} label="Auto-download on Wi-Fi" />} />
        <CRow icon="phone" title="On mobile data" right={<CToggle value={s.autoDownload.cellular} onChange={v => patch({ autoDownload: { cellular: v } })} label="Auto-download on mobile data" />} />
      </CCard>
      <Sec t="HISTORY" />
      <CCard>
        <CRow icon="folder" title="Archived chats" sub={`${st.archived} archived`} onPress={() => navigation.navigate('HushArchive')} />
        {fExport ? <CRow icon="share" title="Export all chats" sub="JSON file · encrypted messages stay sealed" onPress={exportAll} /> : null}
        <CRow icon="undo" title="Clear offline cache" sub="Removes chats saved on this device only" onPress={clearCache} />
      </CCard>
    </CScreen>{toast}</View>
  );
}

export function HushArchive({ navigation }: any) {
  const [list, setList] = useState<any[] | null>(null); const [err, setErr] = useState<string | null>(null); const { toast, show } = useCToast();
  const load = useCallback(() => { call<any[]>('GET', '/me/hush-archive').then(setList).catch(e => setErr(e.message)); }, []);
  useFocusEffect(load);
  const unarchive = (c: any) => chat.archive(c.id, false).then(() => { setList(l => (l ?? []).filter(x => x.id !== c.id)); show('Moved back to Chats'); }).catch(e => show(e.message, true));
  return (
    <View style={{ flex: 1 }}><CScreen>
      <CHeader title="Archive" sub="Out of sight, not deleted" />
      {err ? <CNotReady what="Couldn't load" why={err} /> : !list ? <Text style={ct.small}>Loading…</Text> : list.length === 0 ? <CCard><Text style={ct.small}>Nothing archived yet.</Text></CCard> : (
        <CCard>{list.map(c => <CRow key={c.id} icon="chats" title={c.title} sub={c.last?.text || (c.group ? 'Group' : 'Chat')} onPress={() => navigation.navigate('ChatRoom', { id: c.id })} right={<CBtn small kind="ghost" title="Unarchive" onPress={() => unarchive(c)} />} />)}</CCard>
      )}
    </CScreen>{toast}</View>
  );
}

// ---------------- calls ----------------
export function HushCalls({ navigation }: any) {
  const { st, err, patch, toast } = useHush(); const fCalls = useFeature('calls');
  if (!fCalls) return <CScreen><CHeader title="Calls" /><CNotReady what="Calls are switched off" why="VibeLoop hasn't turned on voice & face calls yet." /></CScreen>;
  if (!st) return <Loading err={err} title="Calls" />;
  return (
    <View style={{ flex: 1 }}><CScreen>
      <CHeader title="Calls" sub="Who gets to ring you" />
      <CCard>
        <Text style={[ct.small, { fontWeight: '800', color: CC.ink }]}>Who can call me</Text>
        <Chips opts={WHO} value={st.settings.whoCanCall} onPick={v => patch({ whoCanCall: v })} />
        <CRow icon="spark" title="Data saver" sub="Lower call quality to use less data" right={<CToggle value={st.settings.callDataSaver} onChange={v => patch({ callDataSaver: v })} label="Call data saver" />} />
        <CRow icon="clock" title="Ring Log" sub="Call history" onPress={() => navigation.navigate('CallLog')} />
      </CCard>
    </CScreen>{toast}</View>
  );
}

// ---------------- security ----------------
export function HushSecurity({ navigation }: any) {
  const { st, err, patch, toast, show } = useHush(); const fE2ee = useFeature('e2ee'); const fLock = useFeature('chatLock');
  const [pk, setPk] = useState<string | null>(myPublicKey());
  useEffect(() => { if (fE2ee && !pk) ensureKeys().then(() => setPk(myPublicKey())).catch(() => {}); }, [fE2ee]);
  if (!st) return <Loading err={err} title="Security" />;
  return (
    <View style={{ flex: 1 }}><CScreen>
      <CHeader title="Security" sub="Locks, keys & sessions" />
      <CCard style={fE2ee ? { borderColor: CC.teal } : { borderColor: CC.sun, backgroundColor: CC.sunSoft }}>
        <View style={{ flexDirection: 'row', gap: 10 }}><ChatIcon name="lock" size={22} color={fE2ee ? CC.teal : '#C98A00'} /><View style={{ flex: 1 }}>
          <Text style={ct.h3}>End-to-end encryption: {fE2ee ? 'on for 1:1 text' : 'off'}</Text>
          <Text style={[ct.small, { marginTop: 4 }]}>{fE2ee ? '1:1 text is sealed on your device (NaCl box) when both people have the app. Groups, media and calls are not end-to-end yet. No forward secrecy yet.' : 'VibeLoop has encryption switched off right now.'}</Text>
          {fE2ee ? <Text style={[ct.small, { marginTop: 8, fontWeight: '800', color: CC.ink, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]}>My key: {fingerprint(pk)}</Text> : null}
        </View></View>
      </CCard>
      <CCard style={{ marginTop: 12 }}>
        {fLock ? <CRow icon="lock" title="Lock Hush" sub="Ask for device unlock when opening locked chats" right={<CToggle value={st.settings.chatLock} onChange={v => patch({ chatLock: v })} label="Chat lock" />} /> : null}
        <CRow icon="shield" title="Lockdown details" sub="Login method, codes, this device" onPress={() => navigation.navigate('ChatSecurity')} />
      </CCard>
      <CBtn kind="coral" icon="close" title="Sign out on all devices" style={{ marginTop: 16 }} onPress={() => signOutEverywhere().then(() => navigation.reset({ index: 0, routes: [{ name: useSession.getState().activeId ? 'ChatMain' : 'SignIn' }] })).catch(e => show(e.message, true))} />
      <Text style={[ct.small, { marginTop: 8 }]}>Kicks every session, including this one, by rotating your token version.</Text>
    </CScreen>{toast}</View>
  );
}

// ---------------- storage ----------------
export function HushStorage({ navigation }: any) {
  const { st, err } = useHush(); const fOutbox = useFeature('outbox');
  if (!st) return <Loading err={err} title="Storage & data" />;
  return (
    <CScreen>
      <CHeader title="Storage & data" />
      <CCard>
        <CRow icon="clip" title="Your uploads" sub={`${st.storage.uploads} files · ${mb(st.storage.bytes)} on VibeLoop`} />
        {fOutbox ? <CRow icon="clock" title="Outbox" sub="Messages & files waiting to send" onPress={() => navigation.navigate('Outbox')} /> : null}
        <CRow icon="chats" title="Chat settings" sub="Auto-download, cache, export" onPress={() => navigation.navigate('HushChats')} />
      </CCard>
    </CScreen>
  );
}

// ---------------- about ----------------
export function HushAbout({ navigation }: any) {
  const ver = (() => { try { return require('../../../app.json').expo.version; } catch { return '—'; } })();
  return (
    <CScreen>
      <CHeader title="About Hush" />
      <CCard>
        <Text style={ct.h3}>Hush · the quiet side of VibeLoop</Text>
        <Text style={[ct.small, { marginTop: 6 }]}>Private chats, your Squad, Moods and Hoods. No phone number, ever. Version {ver}.</Text>
      </CCard>
      <CCard style={{ marginTop: 12 }}>
        <CRow icon="board" title="Hush Guide & House Rules" onPress={() => navigation.navigate('ContentHub', { module: 'hush' })} />
        <CRow icon="shield" title="Speak Up" sub="Report a problem" onPress={() => navigation.navigate('SpeakUp')} />
      </CCard>
    </CScreen>
  );
}
