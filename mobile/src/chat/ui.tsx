import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ViewStyle, TextInput, TextInputProps, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { CC, AQUA } from './theme';
import { ChatIcon, ChatIconName } from './ChatIcon';
import { DSwitch } from '../components/ModuleSwitch';

export const ct = {
  h1: { fontSize: 28, fontWeight: '900' as const, letterSpacing: -0.8, color: CC.ink }, h3: { fontSize: 16, fontWeight: '800' as const, color: CC.ink },
  small: { fontSize: 12, fontWeight: '600' as const, color: CC.inkSoft }, tiny: { fontSize: 10, fontWeight: '800' as const, color: CC.inkSoft, letterSpacing: 0.7 },
};
export const hue = (h: number, s = 70, l = 55) => `hsl(${h}, ${s}%, ${l}%)`;

export function CScreen({ children, scroll = true, bottom = 120 }: { children: React.ReactNode; scroll?: boolean; bottom?: number }) {
  const ins = useSafeAreaInsets();
  const inner = <View style={{ paddingTop: ins.top + 8, paddingHorizontal: 18, paddingBottom: bottom }}>{children}</View>;
  return <View style={{ flex: 1, backgroundColor: CC.bg }}>{scroll ? <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{inner}</ScrollView> : inner}</View>;
}
export function CTop({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}><DSwitch active="chat" />{right}</View>
      <Text style={ct.h1}>{title}</Text>
    </View>
  );
}
export function CHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  const nav = useNavigation<any>();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      {nav.canGoBack() ? <CIconBtn name="back" label="Back" onPress={() => nav.goBack()} /> : null}
      <View style={{ flex: 1 }}><Text style={[ct.h3, { fontSize: 20 }]} numberOfLines={1}>{title}</Text>{sub ? <Text style={ct.small} numberOfLines={1}>{sub}</Text> : null}</View>
      {right}
    </View>
  );
}
export function CIconBtn({ name, onPress, label, badge, tint = CC.ink, size = 42 }: { name: ChatIconName; onPress?: () => void; label: string; badge?: number; tint?: string; size?: number }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [{ width: size, height: size, borderRadius: 14, backgroundColor: CC.surface, borderWidth: 1, borderColor: CC.line, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 }]}>
      <ChatIcon name={name} size={20} color={tint} />
      {badge ? <View style={s.badge}><Text style={s.badgeT}>{badge}</Text></View> : null}
    </Pressable>
  );
}
export function CAvatar({ name, h = 180, size = 44, ring, online: on, uri }: { name: string; h?: number; size?: number; ring?: boolean; online?: boolean; uri?: string | null }) {
  if (uri) return <View style={{ width: size, height: size }}><Image source={{ uri: uri.startsWith('/') ? require('../lib/api').useSession.getState().apiUrl + uri : uri }} style={{ flex: 1, borderRadius: size * 0.36, borderWidth: ring ? 2.5 : 0, borderColor: CC.teal }} accessibilityLabel={`${name} photo`} />{on ? <View style={s.dot} /> : null}</View>;
  return (
    <View style={{ width: size, height: size }}>
      <LinearGradient colors={[hue(h, 40, 58), hue(h + 30, 36, 42)]} style={{ flex: 1, borderRadius: size * 0.36, alignItems: 'center', justifyContent: 'center', borderWidth: ring ? 2.5 : 0, borderColor: CC.teal }}>
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: size * 0.4 }}>{(name || '?').replace('@', '').slice(0, 1).toUpperCase()}</Text>
      </LinearGradient>
      {on ? <View style={s.dot} /> : null}
    </View>
  );
}
export function CCard({ children, style, onPress }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[]; onPress?: () => void }) {
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.85 }]}>{children}</Pressable> : <View style={[s.card, style]}>{children}</View>;
}
export function CBtn({ title, onPress, icon, kind = 'aqua', disabled, small, style }: { title: string; onPress?: () => void; icon?: ChatIconName; kind?: 'aqua' | 'ink' | 'ghost' | 'coral'; disabled?: boolean; small?: boolean; style?: ViewStyle }) {
  const fg = kind === 'ghost' ? CC.ink : '#fff'; const h = small ? 38 : 50;
  const inner = <View style={{ height: h, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: small ? 14 : 18 }}>{icon ? <ChatIcon name={icon} size={small ? 16 : 18} color={fg} fill="rgba(255,255,255,.25)" /> : null}<Text style={{ color: fg, fontWeight: '900', fontSize: small ? 13 : 15 }}>{title}</Text></View>;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => [{ borderRadius: 16, overflow: 'hidden', opacity: disabled ? 0.4 : pressed ? 0.85 : 1, backgroundColor: kind === 'ink' ? CC.ink : kind === 'coral' ? CC.coral : kind === 'ghost' ? CC.surface : undefined, borderWidth: kind === 'ghost' ? 1 : 0, borderColor: CC.line }, style]}>
      {kind === 'aqua' ? <LinearGradient colors={AQUA as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>{inner}</LinearGradient> : inner}
    </Pressable>
  );
}
export function CChip({ label, active, onPress, icon, count }: { label: string; active?: boolean; onPress?: () => void; icon?: ChatIconName; count?: number }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!active }} style={[s.chip, active && { backgroundColor: CC.ink, borderColor: CC.ink }]}>
      {icon ? <ChatIcon name={icon} size={14} color={active ? CC.sun : CC.teal} /> : null}
      <Text style={{ fontWeight: '800', fontSize: 13, color: active ? '#fff' : CC.ink }}>{label}</Text>
      {count ? <View style={[s.cnt, active && { backgroundColor: CC.teal }]}><Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>{count}</Text></View> : null}
    </Pressable>
  );
}
export function CRow({ icon, title, sub, right, onPress, tint = CC.teal }: { icon?: ChatIconName; title: string; sub?: string; right?: React.ReactNode; onPress?: () => void; tint?: string }) {
  const inner = (<>
    {icon ? <View style={[s.rowIcon, { backgroundColor: tint + '1F' }]}><ChatIcon name={icon} size={19} color={tint} /></View> : null}
    <View style={{ flex: 1 }}><Text style={{ fontWeight: '800', fontSize: 15, color: CC.ink }}>{title}</Text>{sub ? <Text style={[ct.small, { marginTop: 2 }]} numberOfLines={2}>{sub}</Text> : null}</View>
    {right ?? (onPress ? <ChatIcon name="back" size={16} color={CC.inkSoft} /> : null)}
  </>);
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>{inner}</View></Pressable> : <View style={s.row}>{inner}</View>;
}
export function CToggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={{ width: 48, height: 28, borderRadius: 10, padding: 3, backgroundColor: value ? CC.teal : CC.line }}>
      <View style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: '#fff', transform: [{ translateX: value ? 20 : 0 }] }} />
    </Pressable>
  );
}
export function CInput(p: TextInputProps & { label?: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      {p.label ? <Text style={[ct.tiny, { marginBottom: 6 }]}>{p.label.toUpperCase()}</Text> : null}
      <TextInput placeholderTextColor="#94A9AD" {...p} style={[s.input, p.multiline && { height: 90, paddingTop: 12, textAlignVertical: 'top' }, p.style as any]} />
    </View>
  );
}
export function CNotReady({ what, why }: { what: string; why: string }) {
  return <View style={s.nr}><ChatIcon name="clock" size={18} color="#C98A00" /><View style={{ flex: 1 }}><Text style={{ fontWeight: '800', color: CC.ink }}>{what} — not ready yet</Text><Text style={ct.small}>{why}</Text></View></View>;
}
export function useCToast() {
  const [t, setT] = React.useState<{ m: string; err?: boolean } | null>(null);
  const show = (m: string, err?: boolean) => { setT({ m, err }); setTimeout(() => setT(null), 2600); };
  const toast = t ? <View style={[s.toast, { backgroundColor: t.err ? CC.coral : CC.ink }]}><ChatIcon name={t.err ? 'close' : 'check'} size={16} color={t.err ? '#fff' : CC.sun} /><Text style={{ color: '#fff', fontWeight: '800', flex: 1 }}>{t.m}</Text></View> : null;
  return { toast, show };
}
export const when = (t: number) => { const d = new Date(t); const now = new Date(); return d.toDateString() === now.toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short' }); };
const s = StyleSheet.create({
  card: { backgroundColor: CC.surface, borderRadius: 22, padding: 14, borderWidth: 1, borderColor: CC.line },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, height: 36, borderRadius: 12, backgroundColor: CC.surface, borderWidth: 1, borderColor: CC.line },
  cnt: { minWidth: 18, height: 18, borderRadius: 6, backgroundColor: CC.coral, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 }, rowIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  input: { height: 50, borderRadius: 14, backgroundColor: CC.surface, borderWidth: 1, borderColor: CC.line, paddingHorizontal: 14, fontSize: 15, color: CC.ink, fontWeight: '600' },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: CC.coral, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }, badgeT: { color: '#fff', fontSize: 10, fontWeight: '900' },
  dot: { position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: '#2BD9A8', borderWidth: 2, borderColor: CC.bg },
  nr: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 16, backgroundColor: CC.sunSoft, marginVertical: 8 },
  toast: { position: 'absolute', left: 18, right: 18, bottom: 100, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, zIndex: 99 },
});
