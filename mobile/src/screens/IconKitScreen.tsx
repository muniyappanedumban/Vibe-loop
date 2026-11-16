import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, TextInput, StyleSheet, ScrollView } from 'react-native';
import { ICONKIT, ICON_STYLES, Kit } from '../lib/iconkit';
import { KitIconView } from '../components/KitIcon';
import { Header, Chip } from '../components/UI';
import { C, T } from '../theme/tokens';

export function IconKitScreen({ route }: any) {
  const [kit, setKit] = useState<Kit>(route?.params?.kit === 'hush' ? 'hush' : 'glow'); const [q, setQ] = useState(''); const [style, setStyle] = useState<string>('all'); const [sel, setSel] = useState<number | null>(null);
  const list = useMemo(() => ICONKIT[kit].filter(i => (style === 'all' || ICON_STYLES[i.style] === style) && i.name.toLowerCase().includes(q.toLowerCase())), [kit, q, style]);
  const item = sel ? ICONKIT[kit][sel - 1] : null;
  return (
    <View style={{ flex: 1, backgroundColor: kit === 'glow' ? C.bg : '#EEF7F5' }}>
      <FlatList data={list} numColumns={6} keyExtractor={i => kit + i.id} initialNumToRender={72} windowSize={5} columnWrapperStyle={{ gap: 8, paddingHorizontal: 18 }} contentContainerStyle={{ gap: 8, paddingBottom: 140 }}
        ListHeaderComponent={<View style={{ paddingHorizontal: 18, paddingTop: 50 }}>
          <Header title="IconKit" sub={`1000 original icons per module · ${list.length} shown`} />
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}><Chip label="Glow kit" active={kit === 'glow'} onPress={() => { setKit('glow'); setSel(null); }} /><Chip label="Hush kit" active={kit === 'hush'} onPress={() => { setKit('hush'); setSel(null); }} /></View>
          <TextInput value={q} onChangeText={setQ} placeholder="Search icons (e.g. spark, hood, glow)" placeholderTextColor="#999" style={s.search} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 12 }}>{['all', ...ICON_STYLES].map(st => <Chip key={st} label={st[0].toUpperCase() + st.slice(1)} active={style === st} onPress={() => setStyle(st)} />)}</ScrollView>
        </View>}
        renderItem={({ item: i }) => <Pressable onPress={() => setSel(i.id)} style={[s.cell, sel === i.id && { borderColor: kit === 'glow' ? C.violet : '#00B39B' }]} accessibilityLabel={i.name}><KitIconView kit={kit} id={i.id} size={28} /></Pressable>} />
      {item ? <View style={s.sheet}><KitIconView kit={kit} id={item.id} size={64} /><View style={{ flex: 1 }}><Text style={T.h3}>{item.name}</Text><Text style={T.small}>#{item.id} · {kit === 'glow' ? 'Glow' : 'Hush'} kit</Text></View><Pressable onPress={() => setSel(null)}><Text style={{ fontWeight: '900', color: C.violet }}>Close</Text></Pressable></View> : null}
    </View>
  );
}
const s = StyleSheet.create({
  search: { height: 46, borderRadius: 14, backgroundColor: '#fff', paddingHorizontal: 14, marginBottom: 10, fontWeight: '600', borderWidth: 1, borderColor: '#E7E3F3' },
  cell: { flex: 1, maxWidth: '16.66%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E7E3F3' },
  sheet: { position: 'absolute', left: 12, right: 12, bottom: 24, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderRadius: 24, padding: 16, borderWidth: 1, borderColor: '#E7E3F3' },
});
