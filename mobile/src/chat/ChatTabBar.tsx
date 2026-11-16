import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { ChatIcon, ChatIconName } from './ChatIcon';
import { CC } from './theme';
import { useConfig } from '../lib/config';
import { useChat } from './useChat';
import { NAV } from '../theme/applyTheme';
// Chat module tab bar: a light "dock" with square duotone icons (Social uses the dark pill bar).
export function ChatTabBar({ state, navigation }: BottomTabBarProps) {
  const ins = useSafeAreaInsets(); const items = useConfig(s => s.cfg.nav.chat); const strings = useConfig(s => s.cfg.languages.strings);
  const chatBadge = useChat(s => s.convs.reduce((a, c) => a + (c.muted ? 0 : c.unread), 0)); const reqs = useChat(s => s.incoming.length);
  return (
    <View style={NAV.chat === 'pill' ? [s.pill, { bottom: Math.max(ins.bottom, 14) }] : [s.dock, { paddingBottom: Math.max(ins.bottom, 10) }]}>
      {state.routes.map((r, i) => {
        const on = state.index === i; const it = items.find(x => x.key === r.name); const label = strings[`nav.${r.name}`] ?? it?.label ?? r.name;
        const badge = r.name === 'Chats' ? chatBadge : r.name === 'Friends' ? reqs : 0;
        return (
          <Pressable key={r.key} onPress={() => { const e = navigation.emit({ type: 'tabPress', target: r.key, canPreventDefault: true }); if (!on && !e.defaultPrevented) navigation.navigate(r.name); }} style={s.item} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label}>
            <View style={[s.iconWrap, on && { backgroundColor: NAV.chat === 'pill' ? CC.teal : CC.ink }]}><ChatIcon name={(({ Chats: 'chats', Friends: 'friends', Vibes: 'vibes', Towns: 'towns', ChatMe: 'me' } as Record<string, ChatIconName>)[r.name] ?? 'chats')} size={22} color={on ? '#fff' : NAV.chat === 'pill' ? 'rgba(255,255,255,.7)' : CC.inkSoft} fill={on ? (NAV.chat === 'pill' ? 'rgba(255,255,255,.3)' : CC.teal) : undefined} />
              {badge ? <View style={s.badge}><Text style={s.badgeT}>{badge}</Text></View> : null}</View>
            <Text style={[s.lbl, NAV.chat === 'pill' && { color: 'rgba(255,255,255,.7)' }, on && { color: NAV.chat === 'pill' ? '#fff' : CC.ink }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
const s = StyleSheet.create({
  pill: { position: 'absolute', left: 14, right: 14, flexDirection: 'row', backgroundColor: CC.ink, borderRadius: 26, paddingVertical: 8, paddingHorizontal: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, elevation: 10 },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.97)', borderTopWidth: 1, borderTopColor: CC.line, paddingTop: 8, paddingHorizontal: 8 },
  item: { flex: 1, alignItems: 'center', gap: 3 }, iconWrap: { width: 46, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  lbl: { fontSize: 11, fontWeight: '800', color: CC.inkSoft },
  badge: { position: 'absolute', top: -4, right: 0, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: CC.coral, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#fff' }, badgeT: { color: '#fff', fontSize: 10, fontWeight: '900' },
});
