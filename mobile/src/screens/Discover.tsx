import { useLiveSync } from '../lib/sync';
// Drift — discovery grid (Explore): search, trending tags, a 3-column grid of Drops & Flicks, Hoods to join.
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { C, S, T } from '../theme/tokens';
import { Screen, Chip } from '../components/UI';
import { Icon } from '../components/Icon';
import { Media } from '../components/Lens';
import { mediaUri } from './Studio';
import { useSocial } from '../store/useSocial';
import { useT } from '../lib/config';
import { PromoSlot } from '../components/PromoSlot';

export function Explore({ navigation }: any) {
  useLiveSync();
  const so = useSocial(); const tr = useT(); const [tag, setTag] = useState<string | null>(null);
  const tags = useMemo(() => { const c: Record<string, number> = {}; so.posts.forEach(p => [...(p.tags ?? []), '#' + p.interest.toLowerCase()].forEach(t => t.startsWith('#') && (c[t] = (c[t] || 0) + 1))); return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 10).map(x => x[0]); }, [so.posts]);
  const grid = so.posts.filter(p => !so.blocked.includes(p.by) && p.kind !== 'thought' && (!tag || (p.tags ?? []).includes(tag) || '#' + p.interest.toLowerCase() === tag));
  return (
    <Screen>
      <Text style={[T.h1, { marginBottom: S.md }]}>{tr('nav.Explore', 'Drift')}</Text>
      <Pressable onPress={() => navigation.navigate('Search')} style={s.search} accessibilityRole="search"><Icon name="search" size={18} color={C.inkSoft} /><Text style={{ color: C.inkSoft, fontWeight: '600' }}>Seek people, Drops, #tags, Hoods…</Text></Pressable>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginBottom: S.md }}>
        <Chip label="All" active={!tag} onPress={() => setTag(null)} />{tags.map(t => <Chip key={t} label={t} icon="hash" active={tag === t} onPress={() => setTag(t)} />)}
      </ScrollView>
      <PromoSlot placement="explore" />
      <View style={s.grid}>
        {grid.map((p, i) => (
          <Pressable key={p.id} onPress={() => navigation.navigate('Comments', { id: p.id })} style={[s.cell, i % 7 === 0 && s.big]} accessibilityLabel={p.text}>
            <Media uri={mediaUri(p.mediaUrl)} hue={p.hue} lens={p.lens} h={i % 7 === 0 ? 250 : 124} radius={4}>
              {(p as any).mediaKind === 'video' || p.kind === 'motion' ? <View style={s.badge}><Icon name="play" size={12} color="#fff" /></View> : null}
            </Media>
          </Pressable>))}
      </View>
      {!grid.length ? <Text style={T.small}>Nothing for this tag yet.</Text> : null}
    </Screen>
  );
}
const s = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, marginBottom: S.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 }, cell: { width: '32.6%' }, big: { width: '65.6%' },
  badge: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,.45)', borderRadius: 8, padding: 3 },
});
