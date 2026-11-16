// Full reaction library picker: 1000 VibeMoji (Glow) or 1000 BubbleMoji (Hush), searchable, lazily rendered small.
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, TextInput, Modal, StyleSheet } from 'react-native';
import { VIBEMOJI } from '../lib/vibemoji';
import { BUBBLEMOJI } from '../chat/bubblemoji';
import { VibeMoji } from './VibeMoji';
import { BubbleMoji } from '../chat/BubbleMojiView';

export function ReactionSheet({ kind, open, onClose, onPick }: { kind: 'vibe' | 'bubble'; open: boolean; onClose: () => void; onPick: (id: number) => void }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => (kind === 'vibe' ? VIBEMOJI : BUBBLEMOJI).filter(m => !q || (m.name + ' ' + m.category).toLowerCase().includes(q.toLowerCase())), [kind, q]);
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close reactions" />
      <View style={s.sheet}>
        <View style={s.grab} />
        <Text style={s.title}>{kind === 'vibe' ? 'VibeMoji' : 'BubbleMoji'} · {list.length}</Text>
        <TextInput value={q} onChangeText={setQ} placeholder="Search 1000 reactions" placeholderTextColor="#999" style={s.search} />
        <FlatList data={list} numColumns={7} keyExtractor={m => String(m.id)} initialNumToRender={70} windowSize={5} columnWrapperStyle={{ gap: 6 }} contentContainerStyle={{ gap: 6, paddingBottom: 30 }}
          renderItem={({ item }) => (
            <Pressable onPress={() => { onPick(item.id); onClose(); }} style={s.cell} accessibilityLabel={item.name}>
              {kind === 'vibe' ? <VibeMoji id={item.id} size={34} /> : <BubbleMoji id={item.id} size={34} />}
            </Pressable>)} />
      </View>
    </Modal>
  );
}
const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%', backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16 },
  grab: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#DDD', marginBottom: 10 },
  title: { fontWeight: '900', fontSize: 17, marginBottom: 8, color: '#120F24' },
  search: { height: 44, borderRadius: 14, backgroundColor: '#F2F1F7', paddingHorizontal: 14, marginBottom: 10, fontWeight: '600' },
  cell: { flex: 1, maxWidth: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#F7F6FB' },
});
