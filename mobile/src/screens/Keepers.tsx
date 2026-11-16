// Keepers — quick saved Drops (classic). Save Stack has collections. Admin-switchable.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, FlatList, useWindowDimensions, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, PRISM, R, S, T } from '../theme/tokens';
import { Screen, Header, Card, Btn, Chip, Tag, DemoTag, Thumb, Avatar, Section, Field, Row, IconBtn, useToast, hsl } from '../components/UI';
import { Icon } from '../components/Icon';
import { VibeMoji } from '../components/VibeMoji';
import { REACTIONS } from '../lib/vibemoji';
import { useSocial, creator, compact, Post } from '../store/useSocial';
import { useStore } from '../store/useStore';
import { ago } from '../lib/util';
import { useFeature, useT } from '../lib/config';
import { Media } from '../components/Lens';
import { VideoClip } from '../components/VideoClip';
import { ReactionSheet } from '../components/ReactionSheet';
import { AdSlot } from './Money2';
import { mediaUri } from './Studio';
import { Linking } from 'react-native';
import { chat } from '../chat/useChat';
import { online } from '../lib/api';
import { switchModule } from '../components/ModuleSwitch';

export function Vault({ navigation }: any) {
  const st = useSocial(); const saved = st.posts.filter(p => st.saved.includes(p.id));
  return (
    <Screen>
      <Header title="Keepers" sub={`${saved.length} saved`} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {saved.map(p => (
          <Pressable key={p.id} style={{ width: '48%' }} onPress={() => st.save(p.id)} accessibilityLabel="Remove from vault">
            {p.kind === 'thought' ? <View style={[s.thought, { backgroundColor: p.bg, minHeight: 200, borderRadius: 20, padding: 16 }]}><Text style={[s.thoughtT, { fontSize: 15 }]} numberOfLines={6}>{p.text}</Text></View> : <Thumb hue={p.hue} w="100%" h={200} label={p.text} />}
          </Pressable>
        ))}
      </View>
      {!saved.length ? <Text style={T.small}>Tap the bookmark on any post to save it here.</Text> : <Text style={[T.small, { marginTop: 12 }]}>Tap an item to remove it.</Text>}
    </Screen>
  );
}


const s = StyleSheet.create({
  thought: { minHeight: 220, padding: 24, justifyContent: 'center' }, thoughtT: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: -0.5, lineHeight: 29 },
});
