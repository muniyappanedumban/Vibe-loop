import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CC, AQUA } from '../theme';
import { ChatIcon } from '../ChatIcon';
import { BubbleMoji } from '../BubbleMojiView';
import { BUBBLEMOJI, BUBBLE_CATEGORIES } from '../bubblemoji';
import { CScreen, CTop, CHeader, CAvatar, CCard, CBtn, CChip, CRow, CInput, CToggle, useCToast, ct, CIconBtn } from '../ui';
import { useChat, chat } from '../useChat';
import { useSession, online, MAX_ACCOUNTS, forgetAccount } from '../../lib/api';
import { switchAccount, signOut, signOutEverywhere } from '../../lib/sync';
const alert = (m: string) => (globalThis as any).alert ? (globalThis as any).alert(m) : require('react-native').Alert.alert('Push', m);
import { useConfig, loadConfig, LANG_NAMES, useT } from '../../lib/config';
import { call } from '../../lib/api';
import { SignInNeeded } from './Chats';

export function ChatMe({ navigation }: any) {
  const st = useChat(); const sess = useSession(); const tr = useT(); const p = st.profile; const { toast, show } = useCToast(); const feats = useConfig(s => s.cfg.features);
  const [chatBio, setChatBio] = useState(p?.chat_bio ?? ''); const [socialBio, setSocialBio] = useState(p?.social_bio ?? '');
  useEffect(() => { setChatBio(p?.chat_bio ?? ''); setSocialBio(p?.social_bio ?? ''); }, [p?.chat_bio, p?.social_bio]);
  if (!online()) return <SignInNeeded navigation={navigation} />;
  const me = sess.accounts.find(a => a.id === sess.activeId);
  const save = (b: any, ok = 'Saved') => chat.saveProfile(b).then(() => show(ok)).catch(e => show(e.message, true));
  return (
    <View style={{ flex: 1 }}><CScreen>
      <CTop title={tr('nav.ChatMe', 'Me')} right={feats.hushSettings !== false ? <CIconBtn name="gear" label="Hush settings" onPress={() => navigation.navigate('HushSettings')} /> : undefined} />
      <LinearGradient colors={AQUA as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.idCard}>
        <Pressable onPress={() => navigation.navigate('EditProfile', { module: 'chat' })} accessibilityLabel="Edit profile"><CAvatar name={me?.name ?? ''} h={me?.hue ?? 180} size={60} uri={p?.avatar_chat ?? p?.avatar_social} /></Pressable>
        <View style={{ flex: 1 }}><Text style={{ color: '#fff', fontWeight: '900', fontSize: 20 }}>{p?.name ?? me?.name}</Text><Text style={{ color: 'rgba(255,255,255,.9)', fontWeight: '800' }}>{p?.handle ?? me?.handle}</Text><Text style={{ color: 'rgba(255,255,255,.8)', fontSize: 12, marginTop: 2 }}>No phone number linked · ever</Text></View>
        <Pressable onPress={() => navigation.navigate('MyCode')} style={s.qrBtn} accessibilityLabel="My code"><ChatIcon name="qr" size={22} color={CC.ink} /></Pressable>
      </LinearGradient>

      <Text style={[ct.tiny, { marginTop: 16, marginBottom: 8 }]}>ACCOUNTS · {sess.accounts.length}/{MAX_ACCOUNTS}</Text>
      <CCard>
        {sess.accounts.map(a => (
          <CRow key={a.id} title={a.name} sub={a.handle + (a.id === sess.activeId ? ' · active' : '')} right={a.id === sess.activeId ? <ChatIcon name="check" size={20} color={CC.teal} /> : (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <CBtn small title="Switch" onPress={() => switchAccount(a.id).then(() => { chat.reset(); chat.loadAll(); loadConfig(); show(`Now using ${a.handle}`); }).catch(e => show(e.message, true))} />
              <Pressable onPress={() => forgetAccount(a.id).then(() => show('Account removed from this device'))} style={s.x} accessibilityLabel={`Remove ${a.handle}`}><ChatIcon name="close" size={16} color={CC.inkSoft} /></Pressable>
            </View>)} />))}
        <CBtn small kind="ghost" icon="plus" title={sess.accounts.length >= MAX_ACCOUNTS ? 'Account limit reached (5)' : 'Add another account'} disabled={sess.accounts.length >= MAX_ACCOUNTS} onPress={() => navigation.navigate('SignIn', { add: true })} />
      </CCard>

      <Text style={[ct.tiny, { marginTop: 16, marginBottom: 8 }]}>TWO FACES · DIFFERENT BIO PER MODULE</Text>
      <CCard>
        <CInput label="Hush bio (your Squad sees this)" value={chatBio} onChangeText={setChatBio} maxLength={140} />
        <CInput label="Glow bio (public profile)" value={socialBio} onChangeText={setSocialBio} maxLength={160} />
        <CBtn small title="Save bios" icon="check" onPress={() => save({ chat_bio: chatBio, social_bio: socialBio }, 'Bios updated')} />
      </CCard>

      <Text style={[ct.tiny, { marginTop: 16, marginBottom: 8 }]}>PRIVACY SPLIT</Text>
      <CCard>
        <Text style={[ct.small, { fontWeight: '800', color: CC.ink }]}>Hush · who can message me</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginVertical: 8 }}>{(['everyone', 'friends', 'nobody'] as const).map(k => <CChip key={k} label={k[0].toUpperCase() + k.slice(1)} active={p?.who_can_message === k} onPress={() => save({ who_can_message: k })} />)}</View>
        <CRow icon="ghost" title="Hidden Identity" sub="Only exact-@ID search by friends finds you" right={<CToggle value={!!p?.hidden} onChange={v => save({ hidden: v })} label="Hidden identity" />} />
        <CRow icon="moon" title="Ghost Hours" sub="Hide online & typing indicators" right={<CToggle value={!!p?.ghost_hours} onChange={v => save({ ghost_hours: v })} label="Ghost hours" />} />
        <CRow icon="clock" title="Last seen" sub="Off = you also won't see others' last seen" right={<CToggle value={p?.last_seen_visible !== false} onChange={v => save({ last_seen_visible: v })} label="Last seen" />} />
        {feats.calls !== false ? <CRow icon="phone" title="Ring Log" sub="Voice & Face Call history" onPress={() => navigation.navigate('CallLog')} /> : null}
        {feats.liveCamera !== false ? <CRow icon="camera" title="Live Lens" sub="Camera with lenses · send Snaps" onPress={() => navigation.navigate('LiveCamera')} /> : null}
        {feats.e2ee !== false ? <CRow icon="lock" title="End-to-end encryption" sub="1:1 text is sealed on your device when both of you are on the app (NaCl box). No forward secrecy yet." /> : null}
        {feats.push !== false ? <CRow icon="bell" title="Push notifications" sub="Tap to (re)register this device" onPress={() => import('../../lib/push').then(m => m.registerPush()).then(r => alert(r.message))} /> : null}
        <CRow icon="check" title="Read receipts" right={<CToggle value={!!p?.chat_read_receipts} onChange={v => save({ chat_read_receipts: v })} label="Read receipts" />} />
        <CRow icon="eye" title="Glow · private profile" sub="Separate from Hush privacy" right={<CToggle value={!!p?.social_private} onChange={v => save({ social_private: v })} label="Private social profile" />} />
      </CCard>

      <Text style={[ct.tiny, { marginTop: 16, marginBottom: 8 }]}>FOCUS SWITCH</Text>
      <CCard><CRow icon="mute" title="Mute Glow, keep Hush" sub="Glow badges & alerts pause; Hush messages still arrive" right={<CToggle value={!!p?.focus_social_muted} onChange={v => save({ focus_social_muted: v }, v ? 'Focus on — Social is quiet' : 'Focus off')} label="Focus switch" />} /></CCard>

      <Text style={[ct.tiny, { marginTop: 16, marginBottom: 8 }]}>MORE</Text>
      <CCard>
        <CRow icon="key" title="New @ID" sub="Once every 30 days" onPress={() => navigation.navigate('ChangeHandle')} />
        <CRow icon="globe" title="Region & Lingo" sub={`${LANG_NAMES[useConfig.getState().cfg.resolvedFor.lang] ?? 'English'} · ${useConfig.getState().cfg.resolvedFor.country}`} onPress={() => navigation.navigate('LanguageRegion')} />
        <CRow icon="spark" title="BubbleMoji" sub="1000 chat emoji" onPress={() => navigation.navigate('BubbleMojiGallery')} />
        <CRow icon="star" title="Star Box" onPress={() => navigation.navigate('Starred')} />
        {feats.hushSettings !== false ? <CRow icon="gear" title="Hush Control Room" sub="All Hush settings: privacy, pings, chats, calls, security" onPress={() => navigation.navigate('HushSettings')} /> : null}
        <CRow icon="shield" title="Lockdown" sub="Sessions, encryption status" onPress={() => navigation.navigate('ChatSecurity')} />
        <CRow icon="board" title="Help & Support" sub="Help Hub, House Rules, Privacy Promise, SOS Lane" onPress={() => navigation.navigate('ContentHub')} />
        <CRow icon="shield" title="Speak Up" sub="Report harassment or a problem" onPress={() => navigation.navigate('SpeakUp')} />
        <CRow icon="clock" title="Outbox" sub="Messages & files waiting to send" onPress={() => navigation.navigate('Outbox')} />
      </CCard>
      <CBtn kind="ghost" icon="close" title="Sign out of this account" style={{ marginTop: 16 }} onPress={() => signOut().then(() => navigation.reset({ index: 0, routes: [{ name: useSession.getState().activeId ? 'ChatMain' : 'SignIn' }] }))} />
    </CScreen>{toast}</View>
  );
}

export function ChangeHandle({ navigation }: any) {
  const p = useChat(s => s.profile); const [h, setH] = useState(''); const { toast, show } = useCToast();
  const next = p?.handle_changed_at ? p.handle_changed_at + 30 * 86400_000 : 0;
  return (
    <View style={{ flex: 1 }}><CScreen>
      <CHeader title="New @ID" sub={`Current: ${p?.handle ?? ''}`} />
      <CCard style={{ marginBottom: 12 }}><Text style={ct.small}>Your @ID is your public username, not your password. To stop impersonation and squatting you can change it once every 30 days, and your old @ID stays reserved for 30 days.{next > Date.now() ? ` Next change: ${new Date(next).toDateString()}.` : ''}</Text></CCard>
      <CInput label="New @ID" value={h} onChangeText={t => setH(t.trim().toLowerCase())} autoCapitalize="none" placeholder="@new.id" />
      <CBtn title="Change @ID" icon="key" onPress={() => chat.changeHandle(h).then(r => { useSession.setState(s => ({ accounts: s.accounts.map(a => (a.id === s.activeId ? { ...a, handle: r.handle ?? h } : a)) })); show('@ID changed'); setTimeout(() => navigation.goBack(), 700); }).catch(e => show(e.message, true))} />
    </CScreen>{toast}</View>
  );
}

export function ChatSecurity({ navigation }: any) {
  const { toast, show } = useCToast();
  return (
    <View style={{ flex: 1 }}><CScreen>
      <CHeader title="Lockdown" />
      <CCard style={{ borderColor: CC.sun, backgroundColor: CC.sunSoft }}>
        <View style={{ flexDirection: 'row', gap: 10 }}><ChatIcon name="shield" size={24} color="#C98A00" /><View style={{ flex: 1 }}>
          <Text style={ct.h3}>End-to-end encryption: not yet enabled</Text>
          <Text style={[ct.small, { marginTop: 4 }]}>Messages are protected in transit when the server runs on HTTPS and stored on VibeLoop's server. True end-to-end encryption (an audited protocol such as Signal or MLS) is planned before public launch. We won't claim it until it's real.</Text>
        </View></View>
      </CCard>
      <CCard style={{ marginTop: 12 }}>
        <CRow icon="key" title="Login method" sub="One-time code to your email · no phone number, no password" />
        <CRow icon="lock" title="Codes" sub="6 digits · 5 min expiry · locked after 5 wrong tries · rate limited" />
        <CRow icon="user" title="Passkeys" sub="Not ready yet — planned for passwordless device sign-in" />
        <CRow icon="phone" title="This device" sub="Session token kept in the device's secure storage" />
      </CCard>
      <CBtn kind="coral" icon="close" title="Sign out on all devices" style={{ marginTop: 16 }} onPress={() => signOutEverywhere().then(() => navigation.reset({ index: 0, routes: [{ name: useSession.getState().activeId ? 'ChatMain' : 'SignIn' }] })).catch(e => show(e.message, true))} />
    </CScreen>{toast}</View>
  );
}

const COUNTRIES = [['IN', 'India'], ['US', 'United States'], ['GB', 'United Kingdom'], ['AE', 'UAE'], ['SG', 'Singapore'], ['LK', 'Sri Lanka']];
export function LanguageRegion() {
  const cfg = useConfig(s => s.cfg); const [busy, setBusy] = useState(false); const { toast, show } = useCToast();
  const apply = async (body: any, ok: string) => {
    setBusy(true);
    try { if (online()) await call('PATCH', '/me/profile', body); else useConfig.setState(s => ({ cfg: { ...s.cfg, resolvedFor: { ...s.cfg.resolvedFor, ...body } } })); await loadConfig(); show(ok); }
    catch (e: any) { show(e.message, true); } finally { setBusy(false); }
  };
  return (
    <View style={{ flex: 1 }}><CScreen>
      <CHeader title="Region & Lingo" sub="Controls labels, features and availability" />
      <CCard>
        <Text style={ct.tiny}>APP LANGUAGE</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 }}>{cfg.languages.available.map(l => <CChip key={l} label={LANG_NAMES[l] ?? l} active={cfg.resolvedFor.lang === l} onPress={() => !busy && apply({ lang: l }, 'Language updated')} />)}</View>
        <Text style={ct.tiny}>COUNTRY</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 }}>{COUNTRIES.map(([k, l]) => <CChip key={k} label={l} active={cfg.resolvedFor.country === k} onPress={() => !busy && apply({ country: k }, 'Region updated')} />)}</View>
      </CCard>
      <CCard style={{ marginTop: 12 }}>
        <CRow icon="globe" title={`Zone: ${cfg.resolvedFor.zone}`} sub="Set by VibeLoop from your country" />
        <CRow icon="crown" title={`Plan slab: ${cfg.resolvedFor.slab}`} sub="Based on your audience size; affects limits and fees" />
        <CRow icon="spark" title={`Config v${cfg.version}`} sub={`Platform fee ${(cfg.fees.platformFee * 100).toFixed(0)}% · max group ${cfg.limits.maxGroupSize ?? '—'}`} />
      </CCard>
      {cfg.banner ? <CCard style={{ marginTop: 12, backgroundColor: CC.tealSoft }}><Text style={{ fontWeight: '700' }}>{typeof cfg.banner === 'string' ? cfg.banner : cfg.banner.text}</Text></CCard> : null}
    </CScreen>{toast}</View>
  );
}

export function BubbleMojiGallery() {
  const [cat, setCat] = useState('All'); const list = useMemo(() => BUBBLEMOJI.filter(b => cat === 'All' || b.category === cat), [cat]); const [sel, setSel] = useState<number | null>(null);
  return (
    <View style={{ flex: 1, backgroundColor: CC.bg }}>
      <FlatList data={list} numColumns={5} keyExtractor={b => String(b.id)} columnWrapperStyle={{ gap: 8, paddingHorizontal: 18 }} contentContainerStyle={{ gap: 8, paddingBottom: 140 }} initialNumToRender={50}
        ListHeaderComponent={<View style={{ paddingHorizontal: 18, paddingTop: 50 }}>
          <CHeader title="BubbleMoji" sub={`1000 original chat emoji · ${list.length} shown`} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 12 }}>{['All', ...BUBBLE_CATEGORIES].map(c => <CChip key={c} label={c} active={cat === c} onPress={() => setCat(c)} />)}</ScrollView>
        </View>}
        renderItem={({ item }) => <Pressable onPress={() => setSel(item.id)} style={s.cell} accessibilityLabel={item.name}><BubbleMoji id={item.id} size={46} /></Pressable>} />
      {sel ? <View style={s.sheet}><BubbleMoji id={sel} size={80} /><View style={{ flex: 1 }}><Text style={ct.h3}>{BUBBLEMOJI[sel - 1].name}</Text><Text style={ct.small}>#{sel} · {BUBBLEMOJI[sel - 1].category}</Text></View><Pressable onPress={() => setSel(null)} accessibilityLabel="Close"><ChatIcon name="close" /></Pressable></View> : null}
    </View>
  );
}
const s = StyleSheet.create({
  idCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 26 }, qrBtn: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  x: { width: 38, height: 38, borderRadius: 12, backgroundColor: CC.bg, alignItems: 'center', justifyContent: 'center' },
  cell: { flex: 1, maxWidth: '20%', aspectRatio: 1, borderRadius: 16, backgroundColor: CC.surface, borderWidth: 1, borderColor: CC.line, alignItems: 'center', justifyContent: 'center' },
  sheet: { position: 'absolute', left: 12, right: 12, bottom: 24, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: CC.surface, borderRadius: 24, padding: 16, borderWidth: 1, borderColor: CC.line },
});

/** Shared account switcher (reachable from both modules). Max 5 accounts per device. */
export function Accounts({ navigation }: any) {
  const sess = useSession(); const { toast, show } = useCToast();
  return (
    <View style={{ flex: 1 }}><CScreen>
      <CHeader title="Five Faces" sub={`${sess.accounts.length} of ${MAX_ACCOUNTS} on this device`} />
      {sess.accounts.map(a => (
        <CCard key={a.id} style={{ marginBottom: 8 }}>
          <CRow title={a.name} sub={a.handle} right={a.id === sess.activeId ? <ChatIcon name="check" size={22} color={CC.teal} /> : <CBtn small title="Switch" onPress={() => switchAccount(a.id).then(() => { chat.reset(); loadConfig(); navigation.reset({ index: 0, routes: [{ name: sess.module === 'chat' ? 'ChatMain' : 'Main' }] }); }).catch(e => show(e.message, true))} />} />
          {a.id !== sess.activeId ? <CBtn small kind="ghost" title="Remove from this device" onPress={() => forgetAccount(a.id).then(() => show('Removed'))} /> : null}
        </CCard>))}
      {!sess.accounts.length ? <Text style={ct.small}>No signed-in accounts. Offline demo mode is active.</Text> : null}
      <CBtn icon="plus" title={sess.accounts.length >= MAX_ACCOUNTS ? 'Limit reached — remove one to add' : 'Add account'} disabled={sess.accounts.length >= MAX_ACCOUNTS} onPress={() => navigation.navigate('SignIn', { add: true })} style={{ marginTop: 8 }} />
      <Text style={[ct.small, { marginTop: 10 }]}>Each account signs in with its own @ID and one-time code. Up to 5 accounts can share one email.</Text>
    </CScreen>{toast}</View>
  );
}
