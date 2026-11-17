// Plays a posted/recorded clip with its non-destructive edit: trim window, speed and timed captions (Auto Words style).
// The original file is never modified — the edit is metadata applied at playback (PRD: non-destructive edits).
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LensOverlay } from './Lens';

export type Caption = { text: string; align: 'left' | 'center' | 'right'; at: number; style: 'pop' | 'clean' | 'neon' };
export type VideoEdit = { trimStart: number; trimEnd: number; speed: number; captions: Caption[] };

export function CaptionView({ c }: { c: Caption }) {
  const box = c.style === 'pop' ? s.pop : c.style === 'neon' ? s.neon : s.clean;
  const txt = c.style === 'pop' ? s.popT : c.style === 'neon' ? s.neonT : s.cleanT;
  return <View style={[s.capWrap, { alignItems: c.align === 'left' ? 'flex-start' : c.align === 'right' ? 'flex-end' : 'center' }]}><View style={box}><Text style={[txt, { textAlign: c.align }]}>{c.text}</Text></View></View>;
}

export function VideoClip({ uri, edit, lens, city, h = 420, autoPlay = true, muted = true }: { uri: string; edit?: VideoEdit | null; lens?: string | null; city?: string | null; h?: number; autoPlay?: boolean; muted?: boolean }) {
  const e: VideoEdit = edit ?? { trimStart: 0, trimEnd: 0, speed: 1, captions: [] };
  const player = useVideoPlayer(uri, p => { p.loop = true; p.muted = muted; p.playbackRate = e.speed || 1; if (e.trimStart) p.currentTime = e.trimStart; if (autoPlay) p.play(); });
  const [t, setT] = useState(e.trimStart || 0);
  // Web: expo-video's play() inside the setup runs before the <video> element mounts (no-op) → start it after mount.
  useEffect(() => { if (!autoPlay) return; const h = setTimeout(() => { try { player.muted = muted; player.play(); } catch {} }, 50); return () => clearTimeout(h); }, [player, autoPlay]);
  useEffect(() => {
    const i = setInterval(() => {
      const ct = player.currentTime ?? 0; setT(ct);
      if (e.trimEnd > e.trimStart && ct >= e.trimEnd) player.currentTime = e.trimStart || 0;   // loop inside the trim window
    }, 200);
    return () => clearInterval(i);
  }, [player, e.trimStart, e.trimEnd]);
  useEffect(() => { player.playbackRate = e.speed || 1; }, [e.speed]);
  const active = [...e.captions].filter(c => c.at <= t).sort((a, b) => b.at - a.at)[0];
  return (
    <View style={{ width: '100%', height: h, backgroundColor: '#000', overflow: 'hidden' }}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      <LensOverlay lens={lens} city={city} />
      {active ? <CaptionView c={active} /> : null}
    </View>
  );
}
const s = StyleSheet.create({
  capWrap: { position: 'absolute', left: 16, right: 16, bottom: 70 },
  pop: { backgroundColor: '#C8F45A', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, transform: [{ rotate: '-2deg' }] }, popT: { color: '#120F24', fontWeight: '900', fontSize: 20 },
  clean: { backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }, cleanT: { color: '#fff', fontWeight: '700', fontSize: 17 },
  neon: { paddingHorizontal: 8 }, neonT: { color: '#fff', fontWeight: '900', fontSize: 22, textShadowColor: '#FF3D9A', textShadowRadius: 12 },
});
