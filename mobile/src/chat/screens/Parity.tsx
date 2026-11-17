// v6 parity screens: 1:1 calls (WebRTC), live camera + snaps, snap viewer, call log, follow requests, story viewers & replies.
// Every screen is gated by an admin flag (calls, liveCamera, snaps, followRequests, storyViewers) through gate() in App.tsx.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Platform, StyleSheet, Image, TextInput, ScrollView } from 'react-native';
import { CScreen, CHeader, CCard, CBtn, CChip, CRow, CAvatar, CNotReady, useCToast, ct, when } from '../ui';
import { CC } from '../theme';
import { ChatIcon } from '../ChatIcon';
import { call, useSession, online } from '../../lib/api';
import { onEvent, rtSend, useRealtime, connectRealtime } from '../../lib/realtime';
import { useFeature, feature } from '../../lib/config';
import { chat } from '../useChat';
import { useHushPrefs } from '../hushPrefs';
import { LENSES, LensOverlay } from '../../components/Lens';

// ---------- WebRTC (native: react-native-webrtc, web: browser APIs) ----------
const RTC: any = Platform.OS === 'web' ? { RTCPeerConnection: (globalThis as any).RTCPeerConnection, RTCSessionDescription: (globalThis as any).RTCSessionDescription, RTCIceCandidate: (globalThis as any).RTCIceCandidate, mediaDevices: (globalThis as any).navigator?.mediaDevices } : (() => { try { return require('react-native-webrtc'); } catch { return null; } })();
const RTCView: any = Platform.OS === 'web' ? null : RTC?.RTCView;
const newId = () => 'call_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);

async function capBitrate(sender: any, maxBitrate: number) {
  try { const prm = sender?.getParameters?.(); if (!prm) return; if (!prm.encodings?.length) prm.encodings = [{}]; prm.encodings.forEach((e: any) => { e.maxBitrate = maxBitrate; }); await sender.setParameters(prm); } catch { /* not supported on this platform */ }
}
export function CallScreen({ navigation, route }: any) {
  useEffect(() => { useHushPrefs.getState().load(); }, []);
  const { peer, media: m0, incoming } = route?.params ?? {}; const media: 'audio' | 'video' = incoming?.media ?? m0 ?? 'audio';
  const who = incoming?.from ?? peer; const rt = useRealtime(s => s.status);
  const [state, setState] = useState<'idle' | 'calling' | 'ringing' | 'incoming' | 'connected' | 'ended'>(incoming ? 'incoming' : 'idle');
  const [err, setErr] = useState<string | null>(null); const [muted, setMuted] = useState(false); const [secs, setSecs] = useState(0);
  const [local, setLocal] = useState<any>(null); const [remote, setRemote] = useState<any>(null);
  const pc = useRef<any>(null); const callId = useRef<string>(incoming?.callId ?? newId()); const pendingIce = useRef<any[]>([]); const stream = useRef<any>(null);
  const cleanup = () => { try { stream.current?.getTracks().forEach((t: any) => t.stop()); } catch {} try { pc.current?.close(); } catch {} pc.current = null; };
  const end = (send = true) => { if (send) rtSend({ type: state === 'incoming' ? 'call.reject' : 'call.end', callId: callId.current }); cleanup(); setState('ended'); setTimeout(() => navigation.canGoBack() && navigation.goBack(), 900); };
  const setup = async () => {
    if (!RTC?.RTCPeerConnection) throw new Error('Calls need the VibeLoop app build with WebRTC');
    const ice = await call<any>('GET', '/rtc/ice');
    const p = new RTC.RTCPeerConnection({ iceServers: ice.iceServers }); pc.current = p;
    const saver = useHushPrefs.getState().prefs.callDataSaver;  // Hush: Call data saver → 320x240@15fps video, capped bitrates
    const video = media === 'video' ? (saver ? { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15, max: 15 } } : { facingMode: 'user' }) : false;
    const s = await RTC.mediaDevices.getUserMedia({ audio: true, video }); stream.current = s; setLocal(s);
    s.getTracks().forEach((t: any) => { const sender = p.addTrack(t, s); if (saver) capBitrate(sender, t.kind === 'video' ? 150_000 : 24_000); });
    p.onicecandidate = (e: any) => e.candidate && rtSend({ type: 'call.ice', callId: callId.current, candidate: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate });
    p.ontrack = (e: any) => setRemote(e.streams?.[0] ?? null);
    p.onconnectionstatechange = () => { if (p.connectionState === 'connected') setState('connected'); if (p.connectionState === 'failed') setErr('Connection failed — a TURN relay may be needed on this network (Admin → Plugs → turn)'); };
    return p;
  };
  const flushIce = async () => { for (const c of pendingIce.current.splice(0)) { try { await pc.current.addIceCandidate(new RTC.RTCIceCandidate(c)); } catch {} } };
  const start = async () => {
    try { if (rt !== 'live') { connectRealtime(); throw new Error('Calls need the live connection (realtime). Reconnecting — try again in a moment.'); }
      const p = await setup(); const offer = await p.createOffer({}); await p.setLocalDescription(offer);
      rtSend({ type: 'call.invite', callId: callId.current, to: who.id, media, sdp: { type: offer.type, sdp: offer.sdp } }); setState('calling');
    } catch (e: any) { setErr(e?.message ?? 'Could not start the call'); cleanup(); }
  };
  const answer = async () => {
    try { const p = await setup(); await p.setRemoteDescription(new RTC.RTCSessionDescription(incoming.sdp)); await flushIce();
      const a = await p.createAnswer(); await p.setLocalDescription(a); rtSend({ type: 'call.answer', callId: callId.current, sdp: { type: a.type, sdp: a.sdp } }); setState('connected');
    } catch (e: any) { setErr(e?.message ?? 'Could not answer'); end(); }
  };
  useEffect(() => {
    const offs = [
      onEvent('call.ringing', ev => ev.callId === callId.current && setState('ringing')),
      onEvent('call.answer', async ev => { if (ev.callId !== callId.current || !pc.current) return; await pc.current.setRemoteDescription(new RTC.RTCSessionDescription(ev.sdp)); await flushIce(); setState('connected'); }),
      onEvent('call.ice', async ev => { if (ev.callId !== callId.current) return; if (pc.current?.remoteDescription) { try { await pc.current.addIceCandidate(new RTC.RTCIceCandidate(ev.candidate)); } catch {} } else pendingIce.current.push(ev.candidate); }),
      onEvent('call.reject', ev => { if (ev.callId === callId.current) { setErr('Declined'); end(false); } }),
      onEvent('call.end', ev => { if (ev.callId === callId.current) end(false); }),
      onEvent('error', ev => { if (String(ev.ref ?? '').startsWith('call.')) setErr(ev.code === 'call_not_allowed' ? 'You can call friends (or people who allow messages from everyone)' : ev.message); }),
    ];
    if (!incoming && String(route?.params?.autostart) !== 'false') start();
    return () => { offs.forEach(f => f()); cleanup(); };
  }, []);
  useEffect(() => { if (state !== 'connected') return; const t = setInterval(() => setSecs(x => x + 1), 1000); return () => clearInterval(t); }, [state]);
  const label = { idle: 'Starting…', calling: 'Calling…', ringing: 'Ringing…', incoming: `Incoming ${media} call`, connected: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, ended: 'Call ended' }[state];
  return (
    <View style={{ flex: 1, backgroundColor: '#0B1F24' }}>
      {media === 'video' && remote && RTCView ? <RTCView streamURL={remote.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" /> : null}
      {media === 'video' && local && RTCView ? <RTCView streamURL={local.toURL()} style={{ position: 'absolute', right: 16, top: 70, width: 110, height: 160, borderRadius: 16, overflow: 'hidden' }} objectFit="cover" mirror /> : null}
      <View style={{ alignItems: 'center', marginTop: 120, gap: 12 }}>
        <CAvatar name={who?.name ?? 'Friend'} h={who?.hue ?? 190} size={110} />
        <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900' }}>{who?.name ?? 'Friend'}</Text>
        <Text style={{ color: 'rgba(255,255,255,.75)', fontWeight: '700' }}>{media === 'video' ? 'Face Call' : 'Voice Call'} · {label}</Text>
        {err ? <Text style={{ color: '#FFB4B4', fontWeight: '800', textAlign: 'center', paddingHorizontal: 30 }}>{err}</Text> : null}
        {Platform.OS === 'web' && media === 'video' ? <Text style={{ color: 'rgba(255,255,255,.6)', fontSize: 12 }}>Video preview shows in the mobile app</Text> : null}
      </View>
      <View style={{ position: 'absolute', bottom: 60, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 26 }}>
        {state === 'incoming' ? <Pressable onPress={answer} style={[cs.btn, { backgroundColor: '#1DB954' }]} accessibilityLabel="Answer"><ChatIcon name="phone" size={30} color="#fff" /></Pressable> : null}
        {state === 'connected' ? <Pressable onPress={() => { stream.current?.getAudioTracks().forEach((t: any) => (t.enabled = muted)); setMuted(!muted); }} style={[cs.btn, { backgroundColor: muted ? '#fff' : 'rgba(255,255,255,.18)' }]} accessibilityLabel={muted ? 'Unmute' : 'Mute'}><ChatIcon name="mute" size={28} color={muted ? '#0B1F24' : '#fff'} /></Pressable> : null}
        {state !== 'ended' ? <Pressable onPress={() => end()} style={[cs.btn, { backgroundColor: '#E5484D' }]} accessibilityLabel={state === 'incoming' ? 'Decline' : 'End call'}><ChatIcon name="close" size={30} color="#fff" /></Pressable> : null}
      </View>
    </View>
  );
}
const cs = StyleSheet.create({ btn: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' } });

/** Call log (GET /calls). */
export function CallLog({ navigation }: any) {
  const [rows, setRows] = useState<any[] | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (!online()) { setErr('Offline'); return; } call<any[]>('GET', '/calls?limit=50').then(setRows).catch(e => setErr(e.message)); }, []);
  return (
    <CScreen><CHeader title="Ring Log" sub="Voice & Face Calls" />
      {err ? <CNotReady what="Ring Log unavailable" why={err} /> : null}
      {rows?.map(r => <CRow key={r.id} icon={r.media === 'video' ? 'video' : 'phone'} title={r.peer?.name ?? 'Unknown'} sub={`${r.direction === 'out' ? 'Outgoing' : 'Incoming'} · ${r.status} · ${when(r.startedAt)}`} onPress={() => navigation.navigate('Call', { peer: r.peer, media: r.media })} />)}
      {rows && !rows.length ? <Text style={ct.small}>No calls yet. Start one from any 1:1 chat.</Text> : null}
    </CScreen>
  );
}

// ---------- Live camera + lenses → Snap (Hush) or Drop (Glow) ----------
export function LiveCamera({ navigation, route }: any) {
  const convId = route?.params?.convId as string | undefined; const { toast, show } = useCToast();
  const Cam = Platform.OS === 'web' ? null : (() => { try { return require('expo-camera'); } catch { return null; } })();
  const [perm, ask] = Cam ? Cam.useCameraPermissions() : [null, async () => null];
  const [facing, setFacing] = useState<'front' | 'back'>('front'); const [lens, setLens] = useState<string>(LENSES[0].key); const [shot, setShot] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const ref = useRef<any>(null);
  if (!Cam) return <CScreen><CHeader title="Live Lens" /><CNotReady what="Camera works in the mobile app" why="Open VibeLoop on Android or iOS to use the live camera with lenses and send Snaps." /></CScreen>;
  if (!perm?.granted) return <CScreen><CHeader title="Live Lens" /><CCard style={{ alignItems: 'center', gap: 12, paddingVertical: 30 }}><ChatIcon name="camera" size={48} color={CC.teal} /><Text style={ct.h3}>Allow the camera</Text><CBtn title="Allow camera" onPress={ask} /></CCard></CScreen>;
  const snap = async () => { try { const p = await ref.current?.takePictureAsync({ quality: 0.8 }); if (p?.uri) setShot(p.uri); } catch (e: any) { show(e?.message ?? 'Could not take photo', true); } };
  const send = async () => {
    if (!shot) return; setBusy(true);
    try {
      if (convId) { await chat.send(convId, { text: 'Snap', kind: feature('snaps') ? 'snap' : 'file' }, { uri: shot, name: `snap-${Date.now()}.jpg`, mime: 'image/jpeg', size: 1 }); show('Snap sent — opens once'); setTimeout(() => navigation.goBack(), 600); }
      else navigation.navigate('NewPost', { mode: 'post', uri: shot, lens });
    } catch (e: any) { show(e?.message ?? 'Failed', true); } finally { setBusy(false); }
  };
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {shot ? <Image source={{ uri: shot }} style={StyleSheet.absoluteFill} /> : <Cam.CameraView ref={ref} style={StyleSheet.absoluteFill} facing={facing} />}
      <View style={StyleSheet.absoluteFill} pointerEvents="none"><LensOverlay lens={lens} /></View>
      <View style={{ position: 'absolute', top: 50, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
        <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Close" style={lc.round}><ChatIcon name="close" size={22} color="#fff" /></Pressable>
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>{convId ? `Snap to ${route?.params?.title ?? 'chat'}` : 'Live Lens'}</Text>
        <Pressable onPress={() => setFacing(f => (f === 'front' ? 'back' : 'front'))} accessibilityLabel="Flip camera" style={lc.round}><ChatIcon name="switch" size={22} color="#fff" /></Pressable>
      </View>
      <View style={{ position: 'absolute', bottom: 36, left: 0, right: 0 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, marginBottom: 18 }}>
          {LENSES.map(l => <Pressable key={l.key} onPress={() => setLens(l.key)} style={[lc.lens, lens === l.key && { borderColor: '#fff', backgroundColor: 'rgba(255,255,255,.25)' }]}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{(l as any).name ?? l.key}</Text></Pressable>)}
        </ScrollView>
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 30 }}>
          {shot ? <><CBtn title="Retake" kind="ghost" onPress={() => setShot(null)} /><CBtn title={busy ? 'Sending…' : convId ? 'Send Snap' : 'Use for a Drop'} onPress={send} /></>
            : <Pressable onPress={snap} accessibilityLabel="Take photo" style={lc.shutter} />}
        </View>
        <Text style={{ color: 'rgba(255,255,255,.7)', textAlign: 'center', fontSize: 11, marginTop: 10 }}>Lenses are colour & frame overlays. Face-tracking AR masks are planned (needs an on-device face model).</Text>
      </View>
      {toast}
    </View>
  );
}
const lc = StyleSheet.create({ round: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,.35)', alignItems: 'center', justifyContent: 'center' }, lens: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,255,255,.5)' }, shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 6, borderColor: '#fff', backgroundColor: 'rgba(255,255,255,.25)' } });

/** Opens a snap once: the signed URL lives 60 s, then the server stops serving it. */
export function SnapView({ navigation, route }: any) {
  const { url, kind, msgId } = route?.params ?? {}; const base = useSession(s => s.apiUrl); const [left, setLeft] = useState(10);
  useEffect(() => { const t = setInterval(() => setLeft(x => { if (x <= 1) { clearInterval(t); navigation.goBack(); } return x - 1; }), 1000); return () => clearInterval(t); }, []);
  const full = url?.startsWith('/') ? base + url : url;
  return (
    <Pressable style={{ flex: 1, backgroundColor: '#000' }} onPress={() => navigation.goBack()} onLongPress={() => msgId && call('POST', `/messages/${msgId}/screenshot`).catch(() => {})}>
      {full && kind !== 'video' ? <Image source={{ uri: full }} style={StyleSheet.absoluteFill} resizeMode="contain" /> : <Text style={{ color: '#fff', margin: 60 }}>{full ? 'Video snap' : 'This snap is no longer available'}</Text>}
      <Text style={{ position: 'absolute', top: 56, right: 20, color: '#fff', fontWeight: '900', fontSize: 18 }}>{left}</Text>
    </Pressable>
  );
}

/** Follow requests for private Glow profiles. */
export function FollowRequests() {
  const [d, setD] = useState<{ incoming: any[]; outgoing: any[] } | null>(null); const [err, setErr] = useState<string | null>(null); const { toast, show } = useCToast();
  const load = () => call<any>('GET', '/follow/requests').then(setD).catch(e => setErr(e.message));
  useEffect(() => { online() ? load() : setErr('Offline'); }, []);
  const act = (id: string, a: 'accept' | 'decline') => call('POST', `/follow/requests/${id}/${a}`).then(() => { show(a === 'accept' ? 'Accepted' : 'Declined'); load(); }).catch(e => show(e.message, true));
  return (
    <CScreen><CHeader title="Follow Knocks" sub="Requests to follow your private profile" />
      {err ? <CNotReady what="Unavailable" why={err} /> : null}
      <Text style={ct.tiny}>INCOMING</Text>
      {d?.incoming.map(r => <CRow key={r.id} icon="user" title={r.user?.name} sub={`${r.user?.handle ?? ''} · ${when(r.at)}`} right={<View style={{ flexDirection: 'row', gap: 6 }}><CChip label="Accept" active onPress={() => act(r.id, 'accept')} /><CChip label="Decline" onPress={() => act(r.id, 'decline')} /></View>} />)}
      {d && !d.incoming.length ? <Text style={[ct.small, { marginVertical: 8 }]}>No pending requests. Turn on a private profile in Glow settings to approve followers.</Text> : null}
      <Text style={[ct.tiny, { marginTop: 14 }]}>SENT</Text>
      {d?.outgoing.map(r => <CRow key={r.id} icon="clock" title={r.user?.name} sub="Waiting for approval" />)}
      {toast}
    </CScreen>
  );
}

/** Story (Spark) extras: records a view; owners see who viewed; others can reply privately to Hush. */
export function SparkExtras({ id, mine, bottom, onSent }: { id: string; mine: boolean; bottom: number; onSent?: (m: string) => void }) {
  const on = useFeature('storyViewers'); const [viewers, setViewers] = useState<any[] | null>(null); const [open, setOpen] = useState(false); const [txt, setTxt] = useState('');
  useEffect(() => { if (on && online() && !mine && !id.startsWith('s')) call('POST', `/sparks/${id}/view`).catch(() => {}); if (on && mine && online()) call<any[]>('GET', `/sparks/${id}/viewers`).then(setViewers).catch(() => setViewers([])); }, [id]);
  if (!on || !online()) return null;
  if (mine) return (
    <View style={{ position: 'absolute', left: 16, right: 16, bottom }}>
      <Pressable onPress={() => setOpen(!open)} accessibilityLabel="Seen by" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><ChatIcon name="eye" size={18} color="#fff" /><Text style={{ color: '#fff', fontWeight: '800' }}>Seen by {viewers?.length ?? 0}</Text></Pressable>
      {open ? <View style={{ backgroundColor: 'rgba(0,0,0,.7)', borderRadius: 16, padding: 12, marginTop: 8, maxHeight: 260 }}>{(viewers ?? []).map(v => <Text key={v.user?.id} style={{ color: '#fff', fontWeight: '700', paddingVertical: 4 }}>{v.user?.name} · {when(v.viewedAt)}</Text>)}{!viewers?.length ? <Text style={{ color: '#fff' }}>No views yet</Text> : null}</View> : null}
    </View>);
  return (
    <View style={{ position: 'absolute', left: 16, right: 16, bottom, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <TextInput value={txt} onChangeText={setTxt} placeholder="Reply privately…" placeholderTextColor="rgba(255,255,255,.7)" style={{ flex: 1, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: 'rgba(255,255,255,.7)', color: '#fff', paddingHorizontal: 16, fontWeight: '700' }} accessibilityLabel="Reply to story" />
      {txt.trim() ? <Pressable onPress={() => call('POST', `/sparks/${id}/reply`, { text: txt.trim() }).then(() => { setTxt(''); onSent?.('Reply sent to Hush'); }).catch(e => onSent?.(e.message))} accessibilityLabel="Send reply" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}><ChatIcon name="send" size={20} color="#0B1F24" /></Pressable> : null}
    </View>);
}

/** App-wide: incoming calls open the call screen; keys + push register after sign-in. */
export function startParity(nav: { navigate: (r: string, p?: any) => void; isReady: () => boolean }) {
  onEvent('call.invite', ev => { if (feature('calls') && nav.isReady()) nav.navigate('Call', { incoming: ev }); });
  const boot = async () => {
    if (!useSession.getState().token || !online()) return;
    connectRealtime();
    if (feature('e2ee')) { const { ensureKeys } = await import('../e2ee'); ensureKeys().catch(() => {}); }
    if (feature('push') && Platform.OS !== 'web') { const { registerPush } = await import('../../lib/push'); registerPush().catch(() => {}); }
  };
  boot(); useSession.subscribe((s, p) => { if (s.token && s.token !== p.token) setTimeout(boot, 500); });
}

/** Admin on/off: shows an honest "switched off" screen when the feature flag is off. */
export const needs = (flag: string, Comp: React.ComponentType<any>) => function Flagged(p: any) {
  return useFeature(flag) ? <Comp {...p} /> : <CScreen><CHeader title="Switched off" /><CNotReady what="This feature is switched off" why={`VibeLoop turned off “${flag}” for your region in Admin → Feature Dials.`} /></CScreen>;
};
