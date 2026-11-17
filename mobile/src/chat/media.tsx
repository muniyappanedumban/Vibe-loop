// Hush photos & videos: picker (gallery + camera), inline chat bubble, and a fullscreen viewer.
// Files go through the resumable upload + offline outbox (chat.send / chat.postStatus with a file).
import React, { useState } from 'react';
import { View, Text, Pressable, Image, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSession } from '../lib/api';
import { MAX_UPLOAD, UploadFile } from '../lib/uploads';
import { ChatIcon } from './ChatIcon';
import { limit } from '../lib/config';
import { CC } from './theme';

export const MAX_VIDEO_SEC = 60;
export type PickedMedia = UploadFile & { kind: 'image' | 'video'; durationSec?: number; width?: number; height?: number };

export const absUrl = (u?: string | null) => (!u ? '' : u.startsWith('/') ? useSession.getState().apiUrl + u : u);

const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif']; const VID_EXT = ['mp4', 'mov', 'webm'];
/** Opens the gallery or the camera. Throws a friendly Error for too-long / too-big picks; null when cancelled. */
export async function pickMedia(source: 'gallery' | 'camera', allow: 'all' | 'images' | 'videos' = 'all'): Promise<PickedMedia | null> {
  const mediaTypes: ImagePicker.MediaType[] = allow === 'all' ? ['images', 'videos'] : [allow];
  if (source === 'camera') { const p = await ImagePicker.requestCameraPermissionsAsync(); if (!p.granted) throw new Error('Camera permission is off'); }
  else { const p = await ImagePicker.requestMediaLibraryPermissionsAsync(); if (!p.granted) throw new Error('Photos permission is off'); }
  const maxVid = limit('chatVideoMaxSec', MAX_VIDEO_SEC); const maxBytes = Math.min(MAX_UPLOAD, limit('fileMaxMB', MAX_UPLOAD / 1048576) * 1048576);
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes, quality: 0.85, videoMaxDuration: maxVid, allowsMultipleSelection: false };
  const r = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  const a = r.canceled ? null : r.assets?.[0]; if (!a) return null;
  const isVideo = a.type === 'video' || (a.mimeType ?? '').startsWith('video/');
  const durationSec = isVideo && a.duration ? a.duration / 1000 : undefined;  // expo-image-picker reports ms
  if (isVideo && durationSec && durationSec > maxVid + 0.5) throw new Error(`Videos can be up to ${maxVid} seconds — trim it first`);
  if ((a.fileSize ?? 0) > maxBytes) throw new Error(`Files can be up to ${Math.round(maxBytes / 1048576)} MB`);
  const raw = (a.fileName || a.uri.split('/').pop() || '').split('?')[0]; let ext = (raw.split('.').pop() || '').toLowerCase();
  if (isVideo && !VID_EXT.includes(ext)) ext = 'mp4';
  if (!isVideo && !IMG_EXT.includes(ext)) ext = 'jpg';  // quality < 1 re-encodes to JPEG
  const base = raw.includes('.') ? raw.slice(0, raw.lastIndexOf('.')) : raw || (isVideo ? 'video' : 'photo');
  const mime = isVideo ? (ext === 'mov' ? 'video/quicktime' : ext === 'webm' ? 'video/webm' : 'video/mp4') : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
  return { uri: a.uri, name: `${base.slice(0, 80) || 'media'}.${ext}`, mime, size: a.fileSize ?? 0, kind: isVideo ? 'video' : 'image', durationSec, width: a.width, height: a.height };
}

export const isMediaAtt = (att?: { kind?: string; mime?: string } | null) => !!att && (att.kind === 'image' || att.kind === 'video' || /^(image|video)\//.test(att.mime ?? ''));
export const mediaKind = (att: { kind?: string; mime?: string }) => (att.kind === 'video' || (att.mime ?? '').startsWith('video/') ? 'video' : 'image');

function InlineVideo({ uri, h }: { uri: string; h: number }) {
  const player = useVideoPlayer(uri, p => { p.loop = true; p.muted = true; });  // first frame only; plays fullscreen on tap
  return <VideoView player={player} style={{ width: '100%', height: h }} contentFit="cover" nativeControls={false} />;
}

/** Inline photo/video in a chat bubble. Pending (outbox) items show the local file with an upload overlay. */
export function ChatMediaBubble({ att, caption, me, pending, progress, failed, onOpen, hold, onLoad }: { att: { url: string | null; kind?: string; mime?: string; durationSec?: number; size?: number }; caption?: string; me: boolean; pending?: boolean; progress?: number; failed?: string; onOpen: () => void; hold?: boolean; onLoad?: () => void }) {
  const uri = absUrl(att.url); const kind = mediaKind(att); const h = 220;
  if (hold && !pending) return (  // Hush auto-download off for this network: nothing is fetched until the user taps
    <View style={{ width: 230 }}>
      <Pressable onPress={onLoad} accessibilityRole="button" accessibilityLabel={`Load ${kind === 'video' ? 'video' : 'photo'}`} style={[st.frame, { height: 120, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.08)' }]}>
        <Text style={{ fontWeight: '800', color: me ? '#fff' : CC.ink }}>⬇ Tap to load {kind === 'video' ? 'video' : 'photo'}</Text>
        {att.size ? <Text style={{ fontSize: 11, color: me ? 'rgba(255,255,255,.8)' : CC.inkSoft, marginTop: 4 }}>{(att.size / 1048576).toFixed(1)} MB</Text> : null}
      </Pressable>
      {caption ? <Text style={{ marginTop: 6, color: me ? '#fff' : CC.ink, fontWeight: '600' }}>{caption}</Text> : null}
    </View>
  );
  return (
    <View style={{ width: 230 }}>
      <Pressable onPress={pending ? undefined : onOpen} accessibilityRole="button" accessibilityLabel={kind === 'video' ? 'Play video' : 'Open photo'} style={st.frame}>
        {!uri ? null : kind === 'image' ? <Image source={{ uri }} style={{ width: '100%', height: h }} resizeMode="cover" /> : <InlineVideo uri={uri} h={h} />}
        {kind === 'video' && !pending ? <View style={st.center}><View style={st.play}><Text style={{ color: '#fff', fontSize: 22, marginLeft: 3 }}>▶</Text></View></View> : null}
        {kind === 'video' && att.durationSec ? <View style={st.badge}><Text style={st.badgeT}>{fmtDur(att.durationSec)}</Text></View> : null}
        {pending ? <View style={[st.center, { backgroundColor: 'rgba(0,0,0,.35)' }]}>{failed ? <Text style={st.pendT}>Failed · {failed}</Text> : <><ActivityIndicator color="#fff" /><Text style={st.pendT}>{progress ? `Uploading ${Math.round(progress * 100)}%` : 'Waiting to send…'}</Text></>}</View> : null}
      </Pressable>
      {caption ? <Text style={{ marginTop: 6, color: me ? '#fff' : CC.ink, fontWeight: '600' }}>{caption}</Text> : null}
    </View>
  );
}
/** web: play() returns a promise that rejects with "play() interrupted" when the element is paused/unmounted first — swallow it. */
const safePlay = (p: any) => { try { const r = p.play(); (r as any)?.catch?.(() => {}); } catch { /* ignore */ } };
const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function FullVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, p => { p.loop = true; safePlay(p); });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls />;
}
/** Fullscreen viewer for a photo or video (tap ✕ or back to close). */
export function MediaViewer({ media, onClose }: { media: { uri: string; kind: 'image' | 'video'; caption?: string } | null; onClose: () => void }) {
  return (
    <Modal visible={!!media} transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {media ? (media.kind === 'image' ? <Image source={{ uri: absUrl(media.uri) }} style={StyleSheet.absoluteFill} resizeMode="contain" /> : <FullVideo uri={absUrl(media.uri)} />) : null}
        {media?.caption ? <View style={st.cap}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{media.caption}</Text></View> : null}
        <Pressable onPress={onClose} style={st.close} accessibilityLabel="Close viewer" accessibilityRole="button"><ChatIcon name="close" size={22} color="#fff" /></Pressable>
      </View>
    </Modal>
  );
}
/** Small hook: `open(...)` + `<viewer />` element to drop in any screen. */
export function useMediaViewer() {
  const [media, setMedia] = useState<{ uri: string; kind: 'image' | 'video'; caption?: string } | null>(null);
  return { open: setMedia, viewer: <MediaViewer media={media} onClose={() => setMedia(null)} /> };
}

/** Autoplaying full-bleed video for Mood viewing (sound on, loops). */
export function MoodVideo({ uri, h }: { uri: string; h: number }) {
  const player = useVideoPlayer(absUrl(uri), p => { p.loop = true; safePlay(p); });
  return <VideoView player={player} style={{ width: '100%', height: h, borderRadius: 22 }} contentFit="contain" nativeControls={false} />;
}
export function MoodThumb({ uri, kind }: { uri: string; kind: 'image' | 'video' }) {
  if (kind === 'image') return <Image source={{ uri: absUrl(uri) }} style={StyleSheet.absoluteFill} resizeMode="cover" />;
  return <View style={StyleSheet.absoluteFill}><InlineVideo uri={absUrl(uri)} h={200} /><View style={st.center}><View style={st.play}><Text style={{ color: '#fff', fontSize: 18, marginLeft: 3 }}>▶</Text></View></View></View>;
}

const st = StyleSheet.create({
  frame: { width: '100%', height: 220, borderRadius: 16, overflow: 'hidden', backgroundColor: '#0B1F24' },
  center: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 6 },
  play: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,.55)', alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,.6)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }, badgeT: { color: '#fff', fontSize: 11, fontWeight: '800' },
  pendT: { color: '#fff', fontWeight: '800', fontSize: 12, textAlign: 'center', paddingHorizontal: 10 },
  close: { position: 'absolute', top: 44, right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,.18)', alignItems: 'center', justifyContent: 'center' },
  cap: { position: 'absolute', left: 16, right: 16, bottom: 40, backgroundColor: 'rgba(0,0,0,.5)', borderRadius: 12, padding: 12 },
});
