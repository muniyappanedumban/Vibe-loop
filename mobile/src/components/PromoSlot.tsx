// VibeLoop's own brand promotions — targeted server-side (global / country / zone / state, time window, placement).
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Linking, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { call, online, useSession } from '../lib/api';
import { useConfig } from '../lib/config';
import { VideoClip } from './VideoClip';

type Promo = { id: string; title: string; body: string; kind: string; mediaUrl?: string | null; url?: string | null; cta?: string | null };
export function PromoSlot({ placement, dark }: { placement: 'home_banner' | 'feed' | 'chat_list' | 'explore' | 'splash'; dark?: boolean }) {
  const on = useConfig(s => s.cfg.features.promos !== false); const [p, setP] = useState<Promo | null>(null); const [hidden, setHidden] = useState(false);
  useEffect(() => { if (on && online()) call<Promo[]>('GET', `/promos?placement=${placement}`).then(r => setP(r[0] ?? null)).catch(() => {}); }, [on, placement]);
  if (!on || !p || hidden) return null;
  const media = p.mediaUrl ? (p.mediaUrl.startsWith('/') ? useSession.getState().apiUrl + p.mediaUrl : p.mediaUrl) : null;
  return (
    <View style={s.wrap}>
      <LinearGradient colors={['#17171F', '#0A0A0F']} style={s.card}>
        {media && p.kind === 'video' ? <View style={{ height: 180, borderRadius: 14, overflow: 'hidden', marginBottom: 10 }}><VideoClip uri={media} h={180} /></View> : media ? <Image source={{ uri: media }} style={{ height: 150, borderRadius: 14, marginBottom: 10 }} /> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={s.badge}><Text style={s.badgeT}>FROM VIBELOOP</Text></View><View style={{ flex: 1 }} /><Pressable onPress={() => setHidden(true)} accessibilityLabel="Hide promo"><Text style={{ color: 'rgba(255,255,255,.5)', fontWeight: '800' }}>Hide</Text></Pressable></View>
        <Text style={s.title}>{p.title}</Text>
        {p.body ? <Text style={s.body}>{p.body}</Text> : null}
        {p.url ? <Pressable onPress={() => Linking.openURL(p.url!)} style={s.cta} accessibilityRole="link"><Text style={{ fontWeight: '900', color: '#0A0A0F' }}>{p.cta || 'Open'}</Text></Pressable> : null}
      </LinearGradient>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { marginBottom: 14 }, card: { borderRadius: 20, padding: 16 },
  badge: { backgroundColor: '#D4FF3F', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }, badgeT: { fontSize: 10, fontWeight: '900', color: '#0A0A0F', letterSpacing: 0.8 },
  title: { color: '#fff', fontWeight: '900', fontSize: 18, marginTop: 10, letterSpacing: -0.3 }, body: { color: 'rgba(255,255,255,.75)', fontWeight: '600', marginTop: 4, lineHeight: 19 },
  cta: { alignSelf: 'flex-start', backgroundColor: '#D4FF3F', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, marginTop: 12 },
});
