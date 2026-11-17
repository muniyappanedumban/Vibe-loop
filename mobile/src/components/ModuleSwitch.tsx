// D-Switch (tap) + Swipe Worlds (swipe the track) + Dual Pulse (separate badges) + Chat Bubble (floating shortcut).
import React, { useRef } from 'react';
import { View, Text, Pressable, PanResponder, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useSession } from '../lib/api';
import { useStore } from '../store/useStore';
import { useChat } from '../chat/useChat';
import { Icon } from './Icon';
import { ChatIcon } from '../chat/ChatIcon';
import { PRISM } from '../theme/tokens';
import { AQUA } from '../chat/theme';
import { useT } from '../lib/config';

// Hop Back: each module remembers the screen you were on (e.g. an open chat), so one tap brings you right back.
const lastSpot: Record<'social' | 'chat', { screen: string; params?: any } | undefined> = { social: undefined, chat: undefined };
const CHAT_STACK = new Set(['ChatRoom', 'NewChat', 'ChatSearch', 'Starred', 'MyCode', 'StatusCompose', 'StatusView', 'CreateTown', 'TownRoom', 'ChangeHandle', 'ChatSecurity', 'BubbleMojiGallery']);
export function switchModule(nav0: any, m: 'social' | 'chat', then?: { screen: string; params?: any }) {
  // Always act on the ROOT stack: tab screens hand us their tab navigator, whose reset() can't reach Main/ChatMain.
  let nav = nav0; try { while (nav?.getParent?.()) nav = nav.getParent(); } catch {}
  try { const st = nav.getState?.(); const top = st?.routes?.[st.index ?? 0]; const from = useSession.getState().module;
    if (top && !['Main', 'ChatMain'].includes(top.name)) lastSpot[CHAT_STACK.has(top.name) ? 'chat' : from] = { screen: top.name, params: top.params }; } catch {}
  useSession.getState().setModule(m);
  const root = m === 'chat' ? 'ChatMain' : 'Main'; const target = then ?? (require('../lib/config').feature('hopBack') ? lastSpot[m] : undefined);
  nav.reset({ index: target ? 1 : 0, routes: target ? [{ name: root }, { name: target.screen, params: target.params }] : [{ name: root }] });
}
export const hopBackTarget = (m: 'social' | 'chat') => lastSpot[m];
export function usePulse() {
  const socialUnread = useStore(s => s.notices.filter(n => !n.read && (n as any).module !== 'chat').length);
  const chatPulse = useChat(s => s.pulse.chat); const focus = useChat(s => s.profile?.focus_social_muted);
  return { social: focus ? 0 : socialUnread, chat: chatPulse };
}

export function DSwitch({ dark, active }: { dark?: boolean; active?: 'social' | 'chat' }) {
  const nav = useNavigation<any>(); const stored = useSession(s => s.module); const module = active ?? stored; const tr = useT(); const p = usePulse();
  const go = (m: 'social' | 'chat') => { if (m !== module) switchModule(nav, m); };
  const goRef = useRef(go); goRef.current = go;
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8,
    onPanResponderRelease: (_, g) => { if (g.dx > 24) goRef.current('chat'); else if (g.dx < -24) goRef.current('social'); },
  })).current;
  const Side = ({ m, label, badge }: { m: 'social' | 'chat'; label: string; badge: number }) => {
    const on = module === m;
    return (
      <Pressable onPress={() => go(m)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${m === 'social' ? 'Social' : 'Chat'} module ${label}${badge ? `, ${badge} new` : ''}`} style={{ flex: 1 }}>
        {on ? <LinearGradient colors={(m === 'social' ? PRISM : AQUA) as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.on}>
          {m === 'social' ? <Icon name="spark" size={14} color="#fff" /> : <ChatIcon name="chats" size={15} color="#fff" fill="rgba(255,255,255,.3)" />}
          <Text style={s.onT}>{label}</Text></LinearGradient>
          : <View style={s.off}><Text style={[s.offT, dark && { color: 'rgba(255,255,255,.7)' }]}>{label}</Text></View>}
        {badge ? <View style={[s.badge, { backgroundColor: m === 'social' ? '#FF3D9A' : '#00B39B' }]}><Text style={s.badgeT}>{badge > 99 ? '99+' : badge}</Text></View> : null}
      </Pressable>
    );
  };
  return (
    <View {...pan.panHandlers} style={[s.track, dark && { backgroundColor: 'rgba(255,255,255,.12)', borderColor: 'transparent' }]} accessibilityRole="tablist" accessibilityHint="Tap or swipe to switch between Social and Chat">
      <Side m="social" label={tr('module.social', 'Glow')} badge={p.social} /><Side m="chat" label={tr('module.chat', 'Hush')} badge={p.chat} />
    </View>
  );
}

export function ChatBubble() {
  const nav = useNavigation<any>(); const p = usePulse(); const mode = useSession(s => s.mode);
  if (mode !== 'online') return null;
  return (
    <Pressable onPress={() => switchModule(nav, 'chat')} style={s.bubble} accessibilityRole="button" accessibilityLabel={`Open Hush chat${p.chat ? `, ${p.chat} new` : ''}`}>
      <LinearGradient colors={AQUA as any} style={s.bubbleIn}><ChatIcon name="chats" size={24} color="#fff" fill="rgba(255,255,255,.3)" /></LinearGradient>
      {p.chat ? <View style={[s.badge, { top: -2, right: -2, backgroundColor: '#FF6B5A' }]}><Text style={s.badgeT}>{p.chat}</Text></View> : null}
    </Pressable>
  );
}
const s = StyleSheet.create({
  track: { flexDirection: 'row', width: 176, height: 40, borderRadius: 20, padding: 3, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E3E0EE' },
  on: { flex: 1, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }, onT: { color: '#fff', fontWeight: '900', fontSize: 13 },
  off: { flex: 1, alignItems: 'center', justifyContent: 'center' }, offT: { fontWeight: '800', fontSize: 13, color: '#6B6785' },
  badge: { position: 'absolute', top: -6, right: 2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' }, badgeT: { color: '#fff', fontSize: 10, fontWeight: '900' },
  bubble: { position: 'absolute', right: 18, bottom: 112, zIndex: 50 }, bubbleIn: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center', shadowColor: '#00B39B', shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
});
