// Level Up — short lessons with "Try it" buttons that open the real feature. Admin-switchable.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, PRISM, T } from '../theme/tokens';
import { Screen, Header, Card, Btn, Row, Section, Bar } from '../components/UI';
import { useSocial } from '../store/useSocial';
const LESSONS: { id: string; track: string; t: string; d: string; mins: number; icon: string; route?: string; params?: any }[] = [
  { id: 's1', track: 'Start here', t: 'Your @ID, no phone number', d: 'Sign in with a one-time code; keep up to 5 accounts', mins: 2, icon: 'fingerprint', route: 'Accounts' },
  { id: 's2', track: 'Start here', t: 'Glow \u21c4 Hush in one tap', d: 'D-Switch, swipe the switch, Chat Bubble, Dual Pulse, Hop Back', mins: 2, icon: 'chat', route: 'Main' },
  { id: 's3', track: 'Start here', t: 'Two Faces profile', d: 'Separate photo & bio for Glow and Hush', mins: 2, icon: 'user', route: 'EditProfile' },
  { id: 'c1', track: 'Create', t: 'Make your first Drop', d: 'Photo or video, 36 lenses, tags, place, sound', mins: 3, icon: 'image', route: 'NewPost' },
  { id: 'c2', track: 'Create', t: 'Auto Edit a Flick', d: '15s hook, speed, timed captions with alignment', mins: 3, icon: 'film', route: 'NewPost' },
  { id: 'c3', track: 'Create', t: 'Blinks with a timer', d: '1/6/12/24h stories, Circle only', mins: 2, icon: 'clock', route: 'NewPost', params: { mode: 'story' } },
  { id: 'c4', track: 'Create', t: 'Test in the Loop Lab first', d: 'Real reactions \u2192 Loop Score \u2192 Go-Live Gate', mins: 4, icon: 'loops', route: 'Loops' },
  { id: 'h1', track: 'Hush', t: 'Chat power moves', d: 'Reply, star, pin, edit (15m), unsend (60m), view once, polls, send later, slash commands', mins: 4, icon: 'send', route: 'ChatMain' },
  { id: 'h2', track: 'Hush', t: 'Works offline', d: 'Read saved chats, queue messages & 1 GB files \u2014 Outbox sends them later', mins: 2, icon: 'download', route: 'Outbox' },
  { id: 'h3', track: 'Hush', t: 'Squad & streaks', d: 'Requests, besties, Inner Circle, Friend Flame, Wave', mins: 2, icon: 'users', route: 'ChatMain' },
  { id: 'p1', track: 'Safety & privacy', t: 'Privacy Split & last seen', d: 'Who can message you, hidden identity, Ghost Hours', mins: 2, icon: 'lock', route: 'ChatMain' },
  { id: 'p2', track: 'Safety & privacy', t: 'Staying safe in Glow', d: 'Comment Guard, restrict, block, Speak Up', mins: 2, icon: 'shield', route: 'Trust' },
  { id: 'm1', track: 'Earn', t: 'Stash, Backstage Pass & Props', d: 'When VibeLoop switches money on in your region', mins: 3, icon: 'wallet', route: 'CashFlow' },
];
export function Learn({ navigation }: any) {
  const st = useSocial(); const done = LESSONS.filter(l => st.lessons.includes(l.id)).length; const tracks = Array.from(new Set(LESSONS.map(l => l.track)));
  return (
    <Screen>
      <Header title="Level Up" sub="Short lessons \u00b7 tap Try it to open the real feature" />
      <LinearGradient colors={PRISM as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 22 }}>{done}/{LESSONS.length} lessons done</Text>
        <View style={{ marginTop: 10 }}><Bar pct={(done / LESSONS.length) * 100} color={C.lime} bg="rgba(255,255,255,0.3)" /></View>
      </LinearGradient>
      {tracks.map(tr => (
        <Section key={tr} title={tr}>
          {LESSONS.filter(l => l.track === tr).map(l => { const on = st.lessons.includes(l.id); return (
            <Card key={l.id} style={{ marginBottom: 8, padding: 10 }}>
              <Row icon={l.icon as any} tint={on ? '#12A27C' : C.violet} title={l.t} sub={`${l.d} \u00b7 ${l.mins} min`} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {l.route ? <Btn small title="Try it" icon="play" style={{ flex: 1 }} onPress={() => navigation.navigate(l.route!, l.params)} /> : null}
                <Btn small kind={on ? 'lime' : 'ghost'} icon={on ? 'check' : undefined} title={on ? 'Done' : 'Mark done'} style={{ flex: 1 }} onPress={() => st.doneLesson(l.id)} />
              </View>
            </Card>); })}
        </Section>))}
    </Screen>
  );
}
const s = StyleSheet.create({ hero: { borderRadius: 24, padding: 20, marginBottom: 16 } });
