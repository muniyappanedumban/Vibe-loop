import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Icon, IconName } from '../components/Icon';
import { C, PRISM } from '../theme/tokens';
import { useConfig } from '../lib/config';
import { NAV } from '../theme/applyTheme';

const ICONS: Record<string, { icon: IconName; label: string }> = {
  Home: { icon: 'home', label: 'Hub' }, Explore: { icon: 'compass', label: 'Drift' }, Create: { icon: 'plus', label: 'Make' },
  Motion: { icon: 'motion', label: 'Flicks' }, Profile: { icon: 'user', label: 'Me' },
};

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const ins = useSafeAreaInsets(); const strings = useConfig(s => s.cfg.languages.strings); const cfgNav = useConfig(s => s.cfg.nav.social);
  if (NAV.social === 'dock') return (
    <View style={[s.dock, { paddingBottom: Math.max(ins.bottom, 10) }]}>
      {state.routes.map((r, i) => {
        const focused = state.index === i; const base = ICONS[r.name] ?? { icon: 'home' as IconName, label: r.name }; const label = strings[`nav.${r.name}`] ?? cfgNav.find(x => x.key === r.name)?.label ?? base.label;
        const go = () => { const e = navigation.emit({ type: 'tabPress', target: r.key, canPreventDefault: true }); if (!focused && !e.defaultPrevented) navigation.navigate(r.name); };
        return (
          <Pressable key={r.key} onPress={go} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={label} style={s.dockItem}>
            {r.name === 'Create' ? <LinearGradient colors={PRISM as any} style={s.dockOrb}><Icon name="plus" size={22} color="#fff" stroke={2.6} /></LinearGradient>
              : <><Icon name={base.icon} size={22} color={focused ? C.violet : C.inkSoft} /><Text style={[s.dockLbl, focused && { color: C.violet }]}>{label}</Text>{focused ? <View style={s.dockDot} /> : null}</>}
          </Pressable>);
      })}
    </View>
  );
  return (
    <View pointerEvents="box-none" style={[s.wrap, { bottom: Math.max(ins.bottom, 14) }]}>
      <View style={s.bar}>
        {state.routes.map((r, i) => {
          const focused = state.index === i; const base = ICONS[r.name] ?? { icon: 'home' as IconName, label: r.name }; const m = { icon: base.icon, label: strings[`nav.${r.name}`] ?? cfgNav.find(x => x.key === r.name)?.label ?? base.label };
          const go = () => { const e = navigation.emit({ type: 'tabPress', target: r.key, canPreventDefault: true }); if (!focused && !e.defaultPrevented) navigation.navigate(r.name); };
          if (r.name === 'Create') return (
            <Pressable key={r.key} onPress={go} accessibilityRole="button" accessibilityLabel="Create" style={s.orbWrap}>
              <LinearGradient colors={PRISM as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.orb}><Icon name="plus" size={26} color="#fff" stroke={2.6} /></LinearGradient>
            </Pressable>
          );
          return (
            <Pressable key={r.key} onPress={go} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={m.label} style={[s.item, focused && s.itemOn]}>
              <Icon name={m.icon} size={21} color={focused ? C.ink : 'rgba(255,255,255,0.62)'} />
              {focused ? <Text style={s.lbl}>{m.label}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 },
  dockItem: { flex: 1, alignItems: 'center', gap: 3 }, dockLbl: { fontSize: 11, fontWeight: '800', color: C.inkSoft }, dockDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.violet },
  dockOrb: { width: 50, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.ink, borderRadius: 999, padding: 7, width: '100%', maxWidth: 420, shadowColor: '#120F24', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
  item: { height: 50, minWidth: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12 },
  itemOn: { backgroundColor: C.lime, paddingHorizontal: 16 },
  lbl: { color: C.ink, fontWeight: '800', fontSize: 13 },
  orbWrap: { marginTop: -26 },
  orb: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', borderWidth: 5, borderColor: C.bg },
});
