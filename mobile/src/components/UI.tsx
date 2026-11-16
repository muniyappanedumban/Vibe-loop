import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ViewStyle, TextInput, TextInputProps, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, LinearGradient as SG, Stop, Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { C, PRISM, R, S, T } from '../theme/tokens';
import { Icon, IconName } from './Icon';

export const hsl = (h: number, s = 80, l = 62) => `hsl(${h}, ${s}%, ${l}%)`;

export function Screen({ children, scroll = true, pad = true, bottom = 120, style }: { children: React.ReactNode; scroll?: boolean; pad?: boolean; bottom?: number; style?: ViewStyle }) {
  const ins = useSafeAreaInsets();
  const inner = <View style={[{ paddingTop: ins.top + 8, paddingHorizontal: pad ? S.lg + 4 : 0, paddingBottom: bottom }, style]}>{children}</View>;
  return <View style={{ flex: 1, backgroundColor: C.bg }}>{scroll ? <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{inner}</ScrollView> : inner}</View>;
}

export function Header({ title, sub, right, back = true }: { title: string; sub?: string; right?: React.ReactNode; back?: boolean }) {
  const nav = useNavigation<any>();
  return (
    <View style={st.header}>
      {back && nav.canGoBack() ? <IconBtn name="back" onPress={() => nav.goBack()} label="Back" /> : null}
      <View style={{ flex: 1 }}>
        <Text style={T.h2} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={[T.small, { marginTop: 2 }]}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function IconBtn({ name, onPress, label, dark, badge, size = 44 }: { name: IconName; onPress?: () => void; label: string; dark?: boolean; badge?: number; size?: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? 'rgba(255,255,255,0.12)' : C.surface, borderWidth: dark ? 0 : 1, borderColor: C.line, opacity: pressed ? 0.7 : 1 }]}>
      <Icon name={name} size={20} color={dark ? '#fff' : C.ink} />
      {badge ? <View style={st.badge}><Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{badge}</Text></View> : null}
    </Pressable>
  );
}

export function Card({ children, style, dark, onPress }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[]; dark?: boolean; onPress?: () => void }) {
  const base = [st.card, dark && { backgroundColor: C.ink, borderColor: C.ink }, style];
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { transform: [{ scale: 0.985 }] }]}>{children}</Pressable> : <View style={base}>{children}</View>;
}

export function Btn({ title, onPress, kind = 'prism', icon, disabled, style, small }: { title: string; onPress?: () => void; kind?: 'prism' | 'ink' | 'ghost' | 'lime' | 'danger'; icon?: IconName; disabled?: boolean; style?: ViewStyle; small?: boolean }) {
  const h = small ? 40 : 54;
  const fg = kind === 'ghost' ? C.ink : kind === 'lime' ? C.ink : '#fff';
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: h, paddingHorizontal: small ? 14 : 20 }}>
      {icon ? <Icon name={icon} size={small ? 16 : 19} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '800', fontSize: small ? 13 : 15, letterSpacing: -0.2 }}>{title}</Text>
    </View>
  );
  const bg = kind === 'ink' ? C.ink : kind === 'ghost' ? C.surface : kind === 'lime' ? C.lime : kind === 'danger' ? C.danger : undefined;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={({ pressed }) => [{ borderRadius: R.pill, overflow: 'hidden', opacity: disabled ? 0.4 : pressed ? 0.85 : 1, backgroundColor: bg, borderWidth: kind === 'ghost' ? 1 : 0, borderColor: C.line }, style]}>
      {kind === 'prism' ? <LinearGradient colors={PRISM as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>{content}</LinearGradient> : content}
    </Pressable>
  );
}

export function Chip({ label, active, onPress, color = C.violet, icon }: { label: string; active?: boolean; onPress?: () => void; color?: string; icon?: IconName }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!active }} style={[st.chip, active && { backgroundColor: C.ink, borderColor: C.ink }]}>
      {icon ? <Icon name={icon} size={14} color={active ? C.lime : color} /> : null}
      <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#fff' : C.ink }}>{label}</Text>
    </Pressable>
  );
}

export function Tag({ label, color = C.violet, bg = C.violetSoft }: { label: string; color?: string; bg?: string }) {
  return <View style={{ alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: R.pill, backgroundColor: bg }}><Text style={{ fontSize: 11, fontWeight: '800', color, letterSpacing: 0.2 }}>{label}</Text></View>;
}
export const DemoTag = () => <Tag label="DEMO DATA" color={C.inkSoft} bg="#ECE9F5" />;
export const SyntheticTag = () => <Tag label="AI-GENERATED" color={C.pink} bg={C.pinkSoft} />;

export function NotReady({ feature, why, fallback }: { feature: string; why: string; fallback?: string }) {
  return (
    <View style={st.notReady}>
      <Icon name="flag" size={18} color={C.tangerine} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '800', color: C.ink, fontSize: 13 }}>{feature} — not ready yet</Text>
        <Text style={[T.small, { marginTop: 2 }]}>{why}{fallback ? ` Manual path: ${fallback}` : ''}</Text>
      </View>
    </View>
  );
}

export function ScoreRing({ score, size = 120, stroke = 12, dark, label = 'Loop Score', target }: { score: number | null; size?: number; stroke?: number; dark?: boolean; label?: string; target?: number }) {
  const gid = 'ring' + React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, pct = score === null ? 0 : score / 100;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Defs><SG id={gid} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={PRISM[0]} /><Stop offset="0.6" stopColor={PRISM[1]} /><Stop offset="1" stopColor={PRISM[2]} /></SG></Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={dark ? 'rgba(255,255,255,0.12)' : C.line} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={`url(#${gid})`} strokeWidth={stroke} fill="none" strokeDasharray={`${c * pct} ${c}`} strokeLinecap="round" />
        {target ? <Circle cx={size / 2 + r * Math.cos(2 * Math.PI * target / 100)} cy={size / 2 + r * Math.sin(2 * Math.PI * target / 100)} r={stroke / 2.6} fill={C.lime} /> : null}
      </Svg>
      <Text style={{ fontSize: size * 0.27, fontWeight: '900', color: dark ? '#fff' : C.ink, letterSpacing: -1 }}>{score === null ? '—' : score}</Text>
      <Text style={{ fontSize: Math.max(9, size * 0.08), fontWeight: '700', color: dark ? 'rgba(255,255,255,0.6)' : C.inkSoft }}>{score === null ? 'Need 3+ reactions' : label}</Text>
    </View>
  );
}

export function Avatar({ name, hue = 260, size = 36, ring }: { name: string; hue?: number; size?: number; ring?: boolean }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, padding: ring ? 2 : 0, backgroundColor: ring ? C.lime : 'transparent' }}>
      <LinearGradient colors={[hsl(hue, 85, 68), hsl(hue + 50, 85, 55)]} style={{ flex: 1, borderRadius: size, alignItems: 'center', justifyContent: 'center', borderWidth: ring ? 2 : 0, borderColor: C.bg }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.38 }}>{name.slice(0, 1)}</Text>
      </LinearGradient>
    </View>
  );
}

/** Generated cover art for a draft — abstract shapes, no stock imagery. */
export function Thumb({ hue, w = 120, h = 180, label, children, radius = R.md }: { hue: number; w?: number | string; h?: number; label?: string; children?: React.ReactNode; radius?: number }) {
  return (
    <View style={{ width: w as any, height: h, borderRadius: radius, overflow: 'hidden', backgroundColor: C.ink }}>
      <LinearGradient colors={[hsl(hue, 80, 58), hsl(hue + 40, 85, 45), '#120F24']} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      <Svg width="100%" height="100%" viewBox="0 0 100 150" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
        <Circle cx="78" cy="30" r="26" fill="rgba(255,255,255,0.16)" />
        <Circle cx="20" cy="95" r="34" fill="rgba(255,255,255,0.08)" />
        <Path d="M0 120 Q30 100 55 118 T100 110 V150 H0z" fill="rgba(18,15,36,0.35)" />
        <Rect x="10" y="16" width="26" height="4" rx="2" fill="rgba(255,255,255,0.5)" />
      </Svg>
      {label ? <Text numberOfLines={2} style={{ position: 'absolute', left: 10, right: 10, bottom: 10, color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: -0.2 }}>{label}</Text> : null}
      {children}
    </View>
  );
}

export function Section({ title, action, onAction, children }: { title: string; action?: string; onAction?: () => void; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: S.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: S.md }}>
        <Text style={[T.h3, { flex: 1 }]}>{title}</Text>
        {action ? <Pressable onPress={onAction}><Text style={{ color: C.violet, fontWeight: '800', fontSize: 13 }}>{action}</Text></Pressable> : null}
      </View>
      {children}
    </View>
  );
}

export function Bar({ pct, color = C.violet, h = 8, bg = C.line }: { pct: number; color?: string; h?: number; bg?: string }) {
  return <View style={{ height: h, borderRadius: h, backgroundColor: bg, overflow: 'hidden' }}><View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: h, borderRadius: h, backgroundColor: color }} /></View>;
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={{ width: 50, height: 30, borderRadius: 15, padding: 3, backgroundColor: value ? C.violet : C.line, justifyContent: 'center' }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', transform: [{ translateX: value ? 20 : 0 }], shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }} />
    </Pressable>
  );
}

export function Field(p: TextInputProps & { label?: string }) {
  return (
    <View style={{ marginBottom: S.md }}>
      {p.label ? <Text style={[T.tiny, { marginBottom: 6 }]}>{p.label.toUpperCase()}</Text> : null}
      <TextInput placeholderTextColor="#A6A2BC" {...p} style={[st.input, p.multiline && { height: 96, textAlignVertical: 'top', paddingTop: 14 }, p.style as any]} />
    </View>
  );
}

export function Row({ icon, title, sub, right, onPress, tint = C.violet }: { icon?: IconName; title: string; sub?: string; right?: React.ReactNode; onPress?: () => void; tint?: string }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [st.row, pressed && { opacity: 0.7 }]}>
      {icon ? <View style={[st.rowIcon, { backgroundColor: tint + '1A' }]}><Icon name={icon} size={19} color={tint} /></View> : null}
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '700', fontSize: 15, color: C.ink }}>{title}</Text>
        {sub ? <Text style={[T.small, { marginTop: 2 }]} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron" size={18} color={C.inkSoft} /> : null)}
    </Pressable>
  );
}

export function Toast({ msg, kind = 'ok' }: { msg: string | null; kind?: 'ok' | 'err' }) {
  if (!msg) return null;
  return (
    <View style={[st.toast, { backgroundColor: kind === 'ok' ? C.ink : C.danger }]}>
      <Icon name={kind === 'ok' ? 'check' : 'close'} size={16} color={kind === 'ok' ? C.lime : '#fff'} />
      <Text style={{ color: '#fff', fontWeight: '700', flex: 1 }}>{msg}</Text>
    </View>
  );
}
export function useToast() {
  const [t, setT] = React.useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);
  const show = (msg: string, kind: 'ok' | 'err' = 'ok') => { setT({ msg, kind }); setTimeout(() => setT(null), 2600); };
  return { toast: <Toast msg={t?.msg ?? null} kind={t?.kind} />, show };
}

export const shadow = Platform.select<ViewStyle>({ web: { boxShadow: '0 10px 30px rgba(39,22,96,0.08)' } as any, default: { shadowColor: '#2A1A6B', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 } });

const st = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: S.lg },
  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: S.lg, borderWidth: 1, borderColor: C.line, ...(shadow as object) },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: R.pill, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  badge: { position: 'absolute', top: 6, right: 6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  notReady: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: R.md, backgroundColor: '#FFF4EA', borderWidth: 1, borderColor: '#FFDDBE', marginVertical: S.sm },
  input: { height: 52, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, paddingHorizontal: 16, fontSize: 15, color: C.ink, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', left: 20, right: 20, bottom: 110, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 18, zIndex: 99 },
});
