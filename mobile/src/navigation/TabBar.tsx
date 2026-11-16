import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Icon, IconName } from '../components/Icon';
import { C, PRISM } from '../theme/tokens';

const ICONS: Record<string, { icon: IconName; label: string }> = {
  Home: { icon: 'home', label: 'Home' }, Loops: { icon: 'loops', label: 'Loops' }, Create: { icon: 'plus', label: 'Create' },
  Library: { icon: 'library', label: 'Library' }, Profile: { icon: 'user', label: 'Me' },
};

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const ins = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[s.wrap, { bottom: Math.max(ins.bottom, 14) }]}>
      <View style={s.bar}>
        {state.routes.map((r, i) => {
          const focused = state.index === i; const m = ICONS[r.name];
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
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.ink, borderRadius: 999, padding: 7, width: '100%', maxWidth: 420, shadowColor: '#120F24', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
  item: { height: 50, minWidth: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12 },
  itemOn: { backgroundColor: C.lime, paddingHorizontal: 16 },
  lbl: { color: C.ink, fontWeight: '800', fontSize: 13 },
  orbWrap: { marginTop: -26 },
  orb: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', borderWidth: 5, borderColor: C.bg },
});
