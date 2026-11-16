// Profile editor — Two Faces: separate Glow (social) and Hush (chat) photos; bio, pronouns, links, region, last seen.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { C, S, T } from '../theme/tokens';
import { Screen, Header, Card, Btn, Field, Row, Toggle, Chip, Avatar, useToast } from '../components/UI';
import { call, online, useSession } from '../lib/api';
import { useChat, chat } from '../chat/useChat';
import { useStore } from '../store/useStore';

const STATES = ['TN', 'KA', 'KL', 'MH', 'DL', 'WB', 'TS', 'GJ'];
async function uploadImage(uri: string, mime: string) {
  const { apiUrl, token } = useSession.getState(); const form = new FormData();
  if (typeof document !== 'undefined') form.append('file', await (await fetch(uri)).blob(), 'avatar'); else form.append('file', { uri, name: 'avatar.jpg', type: mime } as any);
  const r = await fetch(apiUrl + '/media', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form }); const j = await r.json(); if (!r.ok) throw new Error(j.detail ?? 'Upload failed'); return j.url as string;
}
export function EditProfile({ navigation, route }: any) {
  const which: 'social' | 'chat' = route?.params?.module === 'chat' ? 'chat' : 'social';
  const p = useChat(s => s.profile); const me = useStore(s => s.user); const { toast, show } = useToast();
  const [f, setF] = useState<any>({}); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!p) chat.loadAll().catch(() => {}); }, []);
  useEffect(() => { if (p) setF({ name: p.name, social_bio: p.social_bio, chat_bio: p.chat_bio, pronouns: p.pronouns ?? '', links: (p.links ?? []).join(' '), state: p.state ?? '', last_seen_visible: p.last_seen_visible !== false, avatar_social: p.avatar_social, avatar_chat: p.avatar_chat, cover: p.cover }); }, [p]);
  if (!online()) return <Screen><Header title="Edit profile" /><Text style={T.small}>Sign in to edit your profile.</Text></Screen>;
  const pick = async (field: 'avatar_social' | 'avatar_chat' | 'cover') => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync(); if (!perm.granted) return show('Photo access is off', 'err');
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: field === 'cover' ? [3, 1] : [1, 1], quality: 0.85 });
    if (r.canceled) return; setBusy(true);
    try { const url = await uploadImage(r.assets[0].uri, r.assets[0].mimeType ?? 'image/jpeg'); setF((x: any) => ({ ...x, [field]: url })); show('Photo ready — tap Save'); } catch (e: any) { show(e.message, 'err'); } finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true);
    try { const links = String(f.links || '').split(/\s+/).filter(Boolean).slice(0, 3); const r = await call<any>('PATCH', '/me/profile', { ...f, links }); useChat.setState({ profile: r }); show('Profile saved'); setTimeout(() => navigation.goBack(), 600); }
    catch (e: any) { show(e.message, 'err'); } finally { setBusy(false); }
  };
  const abs = (u?: string | null) => (u ? (u.startsWith('/') ? useSession.getState().apiUrl + u : u) : null);
  return (
    <View style={{ flex: 1 }}><Screen>
      <Header title="Edit profile" sub={which === 'chat' ? 'Your Hush face' : 'Your Glow face'} />
      <Pressable onPress={() => pick('cover')} style={s.cover} accessibilityLabel="Change cover">{f.cover ? <Image source={{ uri: abs(f.cover)! }} style={StyleSheet.absoluteFill} /> : <Text style={{ color: C.inkSoft, fontWeight: '700' }}>Add a cover photo</Text>}</Pressable>
      <View style={{ flexDirection: 'row', gap: 16, marginTop: -36, paddingHorizontal: 12 }}>
        {(['social', 'chat'] as const).map(m => (
          <Pressable key={m} onPress={() => pick(m === 'social' ? 'avatar_social' : 'avatar_chat')} style={{ alignItems: 'center' }} accessibilityLabel={`Change ${m === 'social' ? 'Glow' : 'Hush'} photo`}>
            <Avatar name={me.name} hue={280} size={78} ring uri={f[m === 'social' ? 'avatar_social' : 'avatar_chat']} />
            <Text style={[T.small, { marginTop: 4, fontWeight: '800' }]}>{m === 'social' ? 'Glow photo' : 'Hush photo'}</Text>
          </Pressable>))}
      </View>
      <Text style={[T.small, { marginTop: 8 }]}>Two Faces: friends in Hush see your Hush photo & bio; everyone in Glow sees the Glow ones.</Text>
      <Card style={{ marginTop: S.lg }}>
        <Field label="Display name" value={f.name ?? ''} onChangeText={v => setF({ ...f, name: v })} maxLength={40} />
        <Field label="Pronouns (optional)" value={f.pronouns ?? ''} onChangeText={v => setF({ ...f, pronouns: v })} maxLength={20} placeholder="she/her" />
        <Field label="Glow bio" value={f.social_bio ?? ''} onChangeText={v => setF({ ...f, social_bio: v })} multiline maxLength={160} />
        <Field label="Hush bio" value={f.chat_bio ?? ''} onChangeText={v => setF({ ...f, chat_bio: v })} maxLength={140} />
        <Field label="Links (up to 3, space separated)" value={f.links ?? ''} onChangeText={v => setF({ ...f, links: v })} autoCapitalize="none" placeholder="https://…" />
        <Text style={T.tiny}>STATE (for local Hoods & promos)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 8 }}>{STATES.map(x => <Chip key={x} label={x} active={f.state === x} onPress={() => setF({ ...f, state: x })} />)}</View>
        <Row icon="clock" title="Show last seen" sub="If off, you also won't see others' last seen" right={<Toggle value={!!f.last_seen_visible} onChange={v => setF({ ...f, last_seen_visible: v })} label="Show last seen" />} />
      </Card>
      <Btn title={busy ? 'Saving…' : 'Save profile'} icon="check" disabled={busy} onPress={save} style={{ marginTop: S.xl }} />
    </Screen>{toast}</View>
  );
}
const s = StyleSheet.create({ cover: { height: 130, borderRadius: 20, backgroundColor: C.line, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' } });
