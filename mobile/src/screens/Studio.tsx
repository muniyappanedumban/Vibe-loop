// Creation Studio — posts & quick stories with real photos, Vibe Lenses, location, tags, collab, sound tag and audience.
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { C, S, T } from '../theme/tokens';
import { Screen, Header, Card, Btn, Chip, Field, Row, Toggle, NotReady, useToast, Tag } from '../components/UI';
import { Icon } from '../components/Icon';
import { LENSES, Media } from '../components/Lens';
import { VideoClip, VideoEdit, Caption } from '../components/VideoClip';
import { useSocial } from '../store/useSocial';
import { call, online, useSession } from '../lib/api';
import { uid } from '../lib/util';
import { enqueue, isNetworkError } from '../lib/outbox';

const SOUNDS = ['Chai Lofi', 'Monsoon Drums', 'Kovai Nights', 'Sunrise Sitar Loop', 'Desi Beat 92', 'No sound'];
const MOODS = ['Happy', 'Funny', 'Inspiring', 'Relaxing', 'Emotional'];
const BGS = ['#6C3BFF', '#FF3D9A', '#FF8A3D', '#14B88D', '#120F24', '#FFC23D'];
export const mediaUri = (u?: string | null) => (u ? (u.startsWith('/media/') ? useSession.getState().apiUrl + u : u) : null);

async function upload(localUri: string, mime = 'image/jpeg') {
  const { apiUrl, token } = useSession.getState(); const form = new FormData();
  if (Platform.OS === 'web') { const blob = await (await fetch(localUri)).blob(); form.append('file', blob, 'photo'); }
  else form.append('file', { uri: localUri, name: 'photo.jpg', type: mime } as any);
  const r = await fetch(apiUrl + '/media', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.detail ?? 'Upload failed'); return j.url as string;
}

export function NewPost({ navigation, route }: any) {
  const so = useSocial(); const isOnline = online();
  const [mode, setMode] = useState<'post' | 'thought' | 'story'>(route?.params?.mode ?? 'post');
  const [text, setText] = useState(''); const [lens, setLens] = useState<string>('none'); const [hue, setHue] = useState(280); const [bg, setBg] = useState(BGS[0]);
  const [local, setLocal] = useState<{ uri: string; mime?: string; kind: 'image' | 'video'; duration?: number } | null>(null);
  const [vEdit, setVEdit] = useState<VideoEdit>({ trimStart: 0, trimEnd: 0, speed: 1, captions: [] }); const [capText, setCapText] = useState(''); const [capAlign, setCapAlign] = useState<Caption['align']>('center'); const [capStyle, setCapStyle] = useState<Caption['style']>('pop'); const [capAt, setCapAt] = useState(0); const [mood, setMood] = useState('Happy');
  const [place, setPlace] = useState(''); const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null); const [locBusy, setLocBusy] = useState(false);
  const [collab, setCollab] = useState(''); const [sound, setSound] = useState<string | null>(null); const [audience, setAudience] = useState<'public' | 'circle' | 'quiet'>('public');
  const [hours, setHours] = useState(24); const [pollQ, setPollQ] = useState(''); const [pollO, setPollO] = useState(''); const [toChat, setToChat] = useState(false); const [busy, setBusy] = useState(false);
  const { toast, show } = useToast();
  const tags = useMemo(() => Array.from(new Set((text.match(/[#@][\w.]{2,30}/g) ?? []).map(t => t.toLowerCase()))), [text]);

  const pick = async (camera: boolean, video = false) => {
    try {
      const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return show(camera ? 'Camera permission is off — enable it in Settings' : 'Photo access is off — enable it in Settings', 'err');
      const r = camera ? await ImagePicker.launchCameraAsync(video ? { mediaTypes: ['videos'], videoMaxDuration: 60, quality: 0.8 } : { quality: 0.8, allowsEditing: true }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.8, videoMaxDuration: 180 });
      const a = !r.canceled ? r.assets[0] : null;
      if (a) { const isVid = a.type === 'video'; const dur = a.duration ? a.duration / 1000 : 0; setLocal({ uri: a.uri, mime: a.mimeType ?? (isVid ? 'video/mp4' : 'image/jpeg'), kind: isVid ? 'video' : 'image', duration: dur }); setVEdit({ trimStart: 0, trimEnd: dur, speed: 1, captions: [] }); }
    } catch (e: any) { show(e.message ?? 'Could not open the picker', 'err'); }
  };
  const locate = async () => {
    setLocBusy(true);
    try {
      const p = await Location.requestForegroundPermissionsAsync(); if (!p.granted) { show('Location is off — your post stays untagged', 'err'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }); const c = { lat: +pos.coords.latitude.toFixed(4), lng: +pos.coords.longitude.toFixed(4) }; setCoords(c);
      try { const g = await Location.reverseGeocodeAsync({ latitude: c.lat, longitude: c.lng }); const a = g[0]; setPlace([a?.district || a?.name, a?.city || a?.subregion].filter(Boolean).join(', ') || `${c.lat}, ${c.lng}`); }
      catch { setPlace(`${c.lat}, ${c.lng}`); }
    } catch (e: any) { show(e.message ?? 'Could not get location', 'err'); } finally { setLocBusy(false); }
  };
  const publish = async () => {
    if (!text.trim()) return show(mode === 'story' ? 'Add a line of text to your Blink' : 'Write a caption first', 'err');
    if (local?.kind === 'video' && (local.duration ?? 0) > 60.5 && (vEdit.trimEnd - vEdit.trimStart) > 60.5) return show('Videos can be up to 1 minute — use Auto Cut or trim', 'err');
    setBusy(true);
    const fileOf = () => (local ? { uri: local.uri, name: local.kind === 'video' ? 'clip.mp4' : 'photo.jpg', mime: local.mime ?? (local.kind === 'video' ? 'video/mp4' : 'image/jpeg'), size: 0 } : undefined);
    try {
      let mediaUrl: string | null = null;
      try { if (local && isOnline) mediaUrl = await upload(local.uri, local.mime ?? 'image/jpeg'); }
      catch (e: any) { if (!/Failed to fetch|Network|offline/i.test(e.message ?? '')) throw e; mediaUrl = null; (e as any).offline = true; throw Object.assign(new Error('offline'), { offline: true }); }
      if (mode === 'story') {
        const spBody = { id: uid('s'), text: text.trim(), hue, lens: lens === 'none' ? null : lens, mediaUrl, place: place || null, hours, close: audience === 'circle' };
        if (isOnline) { try { const sp = await call<any>('POST', '/sparks', spBody); useSocial.setState(s => ({ sparks: [sp, ...s.sparks] })); } catch (e: any) { if (!isNetworkError(e)) throw e; enqueue({ id: spBody.id, kind: 'spark', path: '/sparks', body: spBody, file: fileOf(), fileField: local ? 'mediaUrl' : undefined, label: `Blink · ${spBody.text.slice(0, 30)}` }); show('Saved offline — your Blink goes live when you reconnect'); setTimeout(() => navigation.goBack(), 900); return; } }
        else useSocial.setState(s => ({ sparks: [{ id: uid('s'), by: 'me', hue, text: text.trim(), at: Date.now(), lens, mediaUrl: local?.uri ?? null, place, close: audience === 'circle', expiresAt: Date.now() + hours * 3600_000 }, ...s.sparks] }));
        show(`Blink live for ${hours}h`); setTimeout(() => navigation.goBack(), 700); return;
      }
      const body: any = { id: uid('p'), kind: mode === 'thought' ? 'thought' : 'photo', text: text.trim(), hue, mood, interest: 'Life', place: place || undefined, bg: mode === 'thought' ? bg : undefined,
        mediaUrl: mediaUrl ?? undefined, lens: lens === 'none' ? undefined : lens, lat: coords?.lat, lng: coords?.lng, tags, collab: collab.trim() || undefined, sound: sound && sound !== 'No sound' ? sound : undefined, audience, mediaKind: local?.kind, edit: local?.kind === 'video' ? vEdit : undefined, poll: pollQ.trim() && pollO.split(',').filter(x => x.trim()).length >= 2 ? { q: pollQ.trim(), options: pollO.split(',').map(x => x.trim()).filter(Boolean).slice(0, 4) } : undefined };
      if (isOnline) { try { const p = await call<any>('POST', '/posts', body); useSocial.setState(s => ({ posts: [p, ...s.posts] })); } catch (e: any) { if (!isNetworkError(e)) throw e; enqueue({ id: body.id, kind: 'post', path: '/posts', body, file: fileOf(), fileField: local ? 'mediaUrl' : undefined, label: `Drop · ${body.text.slice(0, 30)}` }); show('Saved offline — your Drop posts when you reconnect'); setTimeout(() => navigation.goBack(), 900); return; } }
      else useSocial.setState(s => ({ posts: [{ ...body, mediaUrl: local?.uri ?? null, by: 'me', at: Date.now(), reactions: { heart: 0, fire: 0, laugh: 0, touch: 0, clap: 0, boom: 0 }, comments: [], shares: 0, views: 0, mine: true }, ...s.posts] }));
      show(audience === 'quiet' ? 'Saved as a Quiet Share' : 'Posted');
      setTimeout(() => (toChat && isOnline ? navigation.replace('ShareToChat', { type: 'post', id: body.id, title: body.text }) : navigation.navigate('Main', { screen: 'Home' })), 700);
    } catch (e: any) {
      if (e?.offline) {   // couldn't upload the photo/video: queue the whole Drop/Blink with its file
        const id = uid(mode === 'story' ? 's' : 'p'); const isStory = mode === 'story';
        const body: any = isStory ? { id, text: text.trim(), hue, lens: lens === 'none' ? null : lens, place: place || null, hours, close: audience === 'circle' }
          : { id, kind: 'photo', text: text.trim(), hue, mood, interest: 'Life', place: place || undefined, lens: lens === 'none' ? undefined : lens, lat: coords?.lat, lng: coords?.lng, tags, collab: collab.trim() || undefined, sound: sound && sound !== 'No sound' ? sound : undefined, audience, mediaKind: local?.kind, edit: local?.kind === 'video' ? vEdit : undefined };
        enqueue({ id, kind: isStory ? 'spark' : 'post', path: isStory ? '/sparks' : '/posts', body, file: fileOf(), fileField: 'mediaUrl', label: `${isStory ? 'Blink' : 'Drop'} · ${text.trim().slice(0, 30)}` });
        show('Saved offline — uploads automatically when you reconnect'); setTimeout(() => navigation.goBack(), 900);
      } else show(e.message, 'err');
    } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Header title="Make" sub="Drop, thought or Blink" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="Drop" icon="image" active={mode === 'post'} onPress={() => setMode('post')} />
          <Chip label="Thought" icon="text" active={mode === 'thought'} onPress={() => setMode('thought')} />
          <Chip label="Blink" icon="clock" active={mode === 'story'} onPress={() => setMode('story')} />
        </View>

        <View style={{ marginTop: S.lg }}>
          {mode === 'thought' ? (
            <View style={[s.thought, { backgroundColor: bg }]}><Text style={s.thoughtT}>{text || 'Your thought appears here…'}</Text></View>
          ) : (
            local?.kind === 'video' ? <View style={{ borderRadius: 26, overflow: 'hidden' }}><VideoClip uri={local.uri} edit={vEdit} lens={lens} city={place.split(',').pop()?.trim()} h={mode === 'story' ? 420 : 380} /></View> :
            <Media uri={local?.uri} hue={hue} lens={lens} city={place.split(',').pop()?.trim()} h={mode === 'story' ? 420 : 330} radius={26}>
              {mode === 'story' && text ? <Text style={s.storyText}>{text}</Text> : null}
              {!local ? <Pressable onPress={() => setHue((hue + 47) % 360)} style={s.coverBtn} accessibilityLabel="Change cover colour"><Text style={{ color: '#fff', fontWeight: '800' }}>Generated cover · tap to change</Text></Pressable> : null}
            </Media>
          )}
        </View>

        {mode !== 'thought' ? (<>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Btn small kind="ink" icon="image" title="Gallery" onPress={() => pick(false)} style={{ flex: 1 }} />
            <Btn small kind="ink" icon="camera" title="Photo" onPress={() => pick(true)} style={{ flex: 1 }} />
            <Btn small kind="ink" icon="film" title="Record" onPress={() => pick(true, true)} style={{ flex: 1 }} />
            {local ? <Btn small kind="ghost" icon="close" title="Remove" onPress={() => setLocal(null)} /> : null}
          </View>
          {!isOnline && local ? <Text style={[T.small, { marginTop: 6 }]}>Offline demo: the photo stays on this device and isn't uploaded.</Text> : null}
          {local?.kind === 'video' ? (
            <Card style={{ marginTop: 12 }}>
              <Text style={T.h3}>Auto Edit</Text>
              <Text style={T.small}>Non-destructive: your original clip is kept; trims & captions are saved as an edit.</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <Btn small title="Auto Cut · 15s hook" icon="scissors" onPress={() => { const d = local.duration || 15; setVEdit(v => ({ ...v, trimStart: 0, trimEnd: Math.min(d, 15), captions: v.captions.length ? v.captions : (text.trim() ? [{ text: text.trim().slice(0, 60), align: 'center', at: 0, style: 'pop' }] : []) })); show('Trimmed to a 15s hook' + (text.trim() ? ' with your caption' : '')); }} />
                {[0.5, 1, 1.5, 2].map(sp => <Chip key={sp} label={`${sp}×`} active={vEdit.speed === sp} onPress={() => setVEdit(v => ({ ...v, speed: sp }))} />)}
              </View>
              <Text style={[T.small, { marginTop: 8 }]}>Trim {vEdit.trimStart.toFixed(1)}s → {(vEdit.trimEnd || local.duration || 0).toFixed(1)}s of {(local.duration ?? 0).toFixed(1)}s</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                <Chip label="Start −1s" onPress={() => setVEdit(v => ({ ...v, trimStart: Math.max(0, v.trimStart - 1) }))} /><Chip label="Start +1s" onPress={() => setVEdit(v => ({ ...v, trimStart: Math.min(v.trimEnd - 1, v.trimStart + 1) }))} />
                <Chip label="End −1s" onPress={() => setVEdit(v => ({ ...v, trimEnd: Math.max(v.trimStart + 1, v.trimEnd - 1) }))} /><Chip label="End +1s" onPress={() => setVEdit(v => ({ ...v, trimEnd: Math.min(local.duration || v.trimEnd + 1, v.trimEnd + 1) }))} />
              </View>
              <Text style={[T.tiny, { marginTop: 12, marginBottom: 6 }]}>CAPTIONS</Text>
              <Field placeholder="Caption text (shows on the video)" value={capText} onChangeText={setCapText} maxLength={80} />
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {(['left', 'center', 'right'] as const).map(a => <Chip key={a} label={a === 'left' ? 'Align left' : a === 'center' ? 'Centre' : 'Align right'} active={capAlign === a} onPress={() => setCapAlign(a)} />)}
                {(['pop', 'clean', 'neon'] as const).map(st => <Chip key={st} label={st[0].toUpperCase() + st.slice(1)} active={capStyle === st} onPress={() => setCapStyle(st)} />)}
                {[0, 2, 5, 8].map(at => <Chip key={at} label={`at ${at}s`} active={capAt === at} onPress={() => setCapAt(at)} />)}
              </View>
              <Btn small kind="ghost" icon="plus" title="Add caption" style={{ marginTop: 8 }} onPress={() => { if (!capText.trim()) return; setVEdit(v => ({ ...v, captions: [...v.captions, { text: capText.trim(), align: capAlign, at: capAt, style: capStyle }].slice(0, 20) })); setCapText(''); }} />
              {vEdit.captions.map((c, i) => <Row key={i} icon="text" title={c.text} sub={`${c.align} · ${c.style} · at ${c.at}s`} right={<Chip label="Remove" onPress={() => setVEdit(v => ({ ...v, captions: v.captions.filter((_, j) => j !== i) }))} />} />)}
              <NotReady feature="Speech-to-captions" why="Automatic transcription needs a speech model on the server." fallback="type captions above." />
            </Card>) : null}
          <Text style={[T.tiny, { marginTop: S.lg, marginBottom: 8 }]}>VIBE LENSES</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {LENSES.map(l => (
              <Pressable key={l.key} onPress={() => setLens(l.key)} style={{ alignItems: 'center', width: 70 }} accessibilityRole="button" accessibilityLabel={`Lens ${l.name}`} accessibilityState={{ selected: lens === l.key }}>
                <View style={[s.lensThumb, lens === l.key && { borderColor: C.violet }]}><Media uri={local?.uri} hue={hue} lens={l.key} city="CITY" h={80} radius={14} /></View>
                <Text style={[T.small, { fontSize: 10, marginTop: 4, color: lens === l.key ? C.violet : C.inkSoft }]} numberOfLines={1}>{l.name}</Text>
              </Pressable>))}
          </ScrollView>
          <NotReady feature="Live face lenses (AR)" why="Real-time face tracking needs an AR engine; lenses here are overlays saved with your post." />
        </>) : (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>{BGS.map(b => <Pressable key={b} onPress={() => setBg(b)} accessibilityLabel={`Background ${b}`} style={[s.swatch, { backgroundColor: b }, bg === b && { borderColor: C.lime, borderWidth: 3 }]} />)}</View>
        )}

        <View style={{ marginTop: S.lg }}><Field label={mode === 'story' ? 'Blink text' : 'Caption — use #tags and @mentions'} value={text} onChangeText={setText} multiline placeholder={mode === 'story' ? 'Say it in a line' : 'Say something real… #chai @aanya.eats'} maxLength={mode === 'story' ? 200 : 2200} /></View>
        {tags.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -4, marginBottom: 10 }}>{tags.map(t => <Tag key={t} label={t} color={t.startsWith('@') ? C.pink : C.violet} bg={t.startsWith('@') ? C.pinkSoft : C.violetSoft} />)}</View> : null}

        <Card>
          <Row icon="pin" title={place ? place : 'Add location'} sub={coords ? `${coords.lat}, ${coords.lng} · only the place name is shown publicly` : 'Uses your location only when you tap'} right={<Btn small kind="ghost" title={locBusy ? '…' : place ? 'Update' : 'Locate'} onPress={locate} />} />
          {coords ? <Row icon="globe" title="Open in maps" sub="Opens your maps app" onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`)} /> : null}
          <Field placeholder="…or type a place (e.g. RS Puram, Coimbatore)" value={place} onChangeText={t => { setPlace(t); setCoords(null); }} />
          {mode !== 'story' ? (<>
            <Text style={[T.tiny, { marginBottom: 8 }]}>MOOD TAG</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>{MOODS.map(m => <Chip key={m} label={m} active={mood === m} onPress={() => setMood(m)} />)}</View>
            <Text style={[T.tiny, { marginBottom: 8 }]}>MINI VOTE (OPTIONAL POLL)</Text>
            <Field placeholder="Question (e.g. Dosa or idli?)" value={pollQ} onChangeText={setPollQ} maxLength={80} />
            <Field placeholder="Options, comma separated (2–4)" value={pollO} onChangeText={setPollO} />
            <Field label="Collab Drop — co-creator @ID" placeholder="@aanya.eats" value={collab} onChangeText={t => setCollab(t.trim().toLowerCase())} autoCapitalize="none" />
            <Text style={[T.tiny, { marginBottom: 8 }]}>SOUND TAG</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{SOUNDS.map(x => <Chip key={x} icon="music" label={x} active={sound === x} onPress={() => setSound(x)} />)}</View>
            <Text style={[T.small, { marginTop: 6 }]}>Sound tags are labels for now — licensed music playback isn't connected yet.</Text>
          </>) : (<>
            <Text style={[T.tiny, { marginBottom: 8 }]}>BLINK TIMER</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>{[1, 6, 12, 24].map(h => <Chip key={h} icon="clock" label={`${h}h`} active={hours === h} onPress={() => setHours(h)} />)}</View>
          </>)}
        </Card>

        <Text style={[T.tiny, { marginTop: S.lg, marginBottom: 8 }]}>WHO SEES IT</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Chip icon="globe" label="Public" active={audience === 'public'} onPress={() => setAudience('public')} />
          <Chip icon="heart" label="Circle only" active={audience === 'circle'} onPress={() => setAudience('circle')} />
          {mode !== 'story' ? <Chip icon="lock" label="Quiet share" active={audience === 'quiet'} onPress={() => setAudience('quiet')} /> : null}
        </View>
        {mode !== 'story' && isOnline ? <Card style={{ marginTop: 12 }}><Row icon="chat" title="Also send to a chat" sub="Post2Chat after publishing" right={<Toggle value={toChat} onChange={setToChat} label="Also send to chat" />} /></Card> : null}
        <Btn title={busy ? 'Publishing…' : mode === 'story' ? `Share Blink · ${hours}h` : 'Publish'} icon="send" disabled={busy} onPress={publish} style={{ marginTop: S.xl }} />
      </Screen>
      {toast}
    </View>
  );
}
const s = StyleSheet.create({
  thought: { minHeight: 260, padding: 24, justifyContent: 'center', borderRadius: 26 }, thoughtT: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: -0.5, lineHeight: 29 },
  storyText: { position: 'absolute', top: '40%', left: 20, right: 20, color: '#fff', fontWeight: '900', fontSize: 26, textAlign: 'center', textShadowColor: 'rgba(0,0,0,.4)', textShadowRadius: 8 },
  coverBtn: { position: 'absolute', bottom: 12, alignSelf: 'center', backgroundColor: 'rgba(18,15,36,.5)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  lensThumb: { width: 66, height: 80, borderRadius: 16, borderWidth: 2.5, borderColor: 'transparent', overflow: 'hidden' },
  swatch: { width: 40, height: 40, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
});
