// Voice notes: hold-to-record (expo-audio), sent via the offline-safe outbox; playback with 1×/1.5×/2× speed (Voice Speed).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useAudioRecorder, RecordingPresets, AudioModule, useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { CC } from './theme';
import { ChatIcon } from './ChatIcon';
import { useLimit } from '../lib/config';

export function useVoiceRecorder(onDone: (file: { uri: string; durationSec: number }) => void, onError: (m: string) => void) {
  const rec = useAudioRecorder(RecordingPresets.HIGH_QUALITY); const [on, setOn] = useState(false); const started = useRef(0); const maxSec = useLimit('voiceNoteMaxSec', 300);
  const start = async () => {
    try { const p = await AudioModule.requestRecordingPermissionsAsync(); if (!p.granted) return onError('Microphone permission is off');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }); await rec.prepareToRecordAsync(); rec.record(); started.current = Date.now(); setOn(true); }
    catch (e: any) { onError(e?.message ?? 'Could not start recording'); }
  };
  const stop = async (send = true) => {
    if (!on) return; setOn(false);
    try { await rec.stop(); const dur = (Date.now() - started.current) / 1000; if (send && rec.uri && dur >= 0.7) onDone({ uri: rec.uri, durationSec: Math.min(maxSec, Math.round(dur)) }); else if (send) onError('Hold a little longer to record'); }
    catch (e: any) { onError(e?.message ?? 'Recording failed'); }
  };
  const stopRef = useRef(stop); stopRef.current = stop;
  useEffect(() => { if (!on) return; const t = setTimeout(() => stopRef.current(true), maxSec * 1000); return () => clearTimeout(t); }, [on, maxSec]);  // auto-stop at the admin limit
  return { on, start, stop };
}
export function VoicePlayer({ uri, me, durationSec }: { uri: string; me: boolean; durationSec?: number }) {
  const player = useAudioPlayer(uri); const st = useAudioPlayerStatus(player); const [rate, setRate] = useState(1);
  useEffect(() => { try { player.setPlaybackRate(rate); } catch {} }, [rate]);
  const fg = me ? '#fff' : CC.ink; const pct = st.duration ? (st.currentTime / st.duration) * 100 : 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 220 }}>
      <Pressable onPress={() => (st.playing ? player.pause() : (st.currentTime >= (st.duration || 0) - 0.1 && player.seekTo(0), player.play()))} accessibilityLabel={st.playing ? 'Pause voice note' : 'Play voice note'} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: me ? 'rgba(255,255,255,.2)' : CC.tealSoft, alignItems: 'center', justifyContent: 'center' }}>
        <ChatIcon name={st.playing ? 'mute' : 'mic'} size={18} color={me ? '#fff' : CC.teal} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: me ? 'rgba(255,255,255,.3)' : CC.line }}><View style={{ width: `${pct}%`, height: 4, borderRadius: 2, backgroundColor: me ? '#fff' : CC.teal }} /></View>
        <Text style={{ color: fg, fontSize: 11, marginTop: 4 }}>{Math.round(st.currentTime || 0)}s / {Math.round(st.duration || durationSec || 0)}s</Text>
      </View>
      <Pressable onPress={() => setRate(r => (r === 1 ? 1.5 : r === 1.5 ? 2 : 1))} accessibilityLabel="Voice speed"><Text style={{ color: fg, fontWeight: '900' }}>{rate}×</Text></Pressable>
    </View>
  );
}
