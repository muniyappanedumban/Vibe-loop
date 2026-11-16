// Live Lane — upcoming lives & reminders (broadcast itself needs a media server). Admin-switchable.
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, PRISM, R, S, T } from '../theme/tokens';
import { Screen, Header, Card, Btn, Chip, Tag, DemoTag, Thumb, Avatar, Section, Row, IconBtn, NotReady, useToast, Field } from '../components/UI';
import { Icon } from '../components/Icon';
import { VibeMoji } from '../components/VibeMoji';
import { VIBEMOJI } from '../lib/vibemoji';
import { ALL_FEATURES } from '../data/features';
import { useSocial, creator, CREATORS, TRIBES, LIVES, compact } from '../store/useSocial';
import { useStore } from '../store/useStore';
import { ago } from '../lib/util';

// (Direct messages live in the Chat module — src/chat/screens. The old Social-side message screens were removed to avoid duplicates.)

export function Live() {
  const st = useSocial();
  const left = (t: number) => { const m = Math.max(0, Math.round((t - Date.now()) / 60000)); return m > 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
  return (
    <Screen>
      <Header title="Live Lane" sub="Broadcasts, audio rooms & countdowns" />
      <LinearGradient colors={['#FF4D5E', '#FF3D9A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.liveHero}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={s.liveDot} /><Text style={{ color: '#fff', fontWeight: '900', letterSpacing: 1 }}>GO LIVE</Text></View>
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 24, marginTop: 10, letterSpacing: -0.6 }}>Talk to your Circle in real time</Text>
        <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '600', marginTop: 6 }}>Live comments, hearts, Q&A and host moderation.</Text>
      </LinearGradient>
      <NotReady feature="Live broadcasting" why="Real-time video needs streaming servers, which aren't connected in this build." fallback="schedule a countdown so followers get reminded." />
      <Section title="Upcoming (Live Countdown)">
        {st.lives.map(l => { const c = creator(l.by); const on = st.reminders.includes(l.id); return (
          <Card key={l.id} style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
            <Thumb hue={l.hue} w={64} h={84} radius={14} />
            <View style={{ flex: 1 }}><Text style={T.h3}>{l.title}</Text><Text style={T.small}>{c.name} · starts in {left(l.at)}</Text></View>
            <Btn small title={on ? 'Reminded' : 'Remind'} kind={on ? 'lime' : 'ghost'} icon="bell" onPress={() => st.remind(l.id)} />
          </Card>); })}
      </Section>
    </Screen>
  );
}


const s = StyleSheet.create({
  liveHero: { borderRadius: 28, padding: 20, marginBottom: 6 }, liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' },
});
