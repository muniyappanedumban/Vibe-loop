import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, PRISM, R, S, T } from '../theme/tokens';
import { Screen, IconBtn, Card, ScoreRing, Avatar, Thumb, Section, Tag, DemoTag, Bar } from '../components/UI';
import { Icon, IconName } from '../components/Icon';
import { Vibe } from '../components/Vibe';
import { useStore, balanceOf } from '../store/useStore';
import { loopScore, breakdown } from '../lib/score';
import { ago, money } from '../lib/util';
import { DSwitch, switchModule } from '../components/ModuleSwitch';
import { useFeature, useT, useConfig, loadConfig } from '../lib/config';
import { Header } from '../components/UI';
import { call, online } from '../lib/api';

/** Creator Studio dashboard (the original VibeLoop command centre). Every tile respects admin Screen Switches. */
export default function CreatorHub({ navigation }: any) {
  const screensCfg = useConfig(s => s.cfg.screens); const on = (k: string) => screensCfg[k] !== false;
  const st = useStore(); const showSwitch = useFeature('dswitch'); const tr = useT(); const banner = useConfig(s => s.cfg.banner); const lang = useConfig(s => s.cfg.resolvedFor.lang);
  const unread = st.notices.filter(n => !n.read).length;
  const live = st.loops.filter(l => l.status === 'testing');
  const hero = live[0];
  const sc = hero ? loopScore(hero) : null;
  const b = hero ? breakdown(hero) : null;
  const ready = st.loops.filter(l => l.status === 'testing' && (loopScore(l) ?? 0) >= l.minScore);
  const bal = balanceOf(st);
  const hr = new Date().getHours();
  const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const quick0: { icon: IconName; label: string; route: string; colors: [string, string] }[] = [
    { icon: 'loops', label: 'New Loop', route: 'NewLoop', colors: ['#5B4CF5', '#4A3CE0'] },
    { icon: 'wand', label: 'Idea Engine', route: 'Copilot', colors: ['#1E1E27', '#0A0A0F'] },
    { icon: 'film', label: 'Cut Room', route: 'Editor', colors: ['#1E1E27', '#0A0A0F'] },
    { icon: 'mic', label: 'Sound Booth', route: 'Audio', colors: ['#1E1E27', '#0A0A0F'] },
  ];
  const quick = quick0.filter(q => on(q.route));
  const more: { icon: IconName; label: string; route: string }[] = ([
    { icon: 'loops', label: 'Loop Lab', route: 'Loops' }, { icon: 'library', label: 'Locker', route: 'Library' }, { icon: 'graph', label: 'Brain Map', route: 'Memory' },
    { icon: 'archive', label: 'Flop Files', route: 'Archive' }, { icon: 'wallet', label: 'Bag Check', route: 'Earnings' }, { icon: 'spark', label: 'Tools', route: 'CreateHub' },
    { icon: 'live', label: 'Live Lane', route: 'Live' }, { icon: 'chart', label: 'Insights', route: 'Growth' }, { icon: 'smile', label: 'VibeMoji', route: 'Emoji' },
    { icon: 'layers', label: 'IconKit', route: 'IconKit' }, { icon: 'book', label: 'Level Up', route: 'Learn' }, { icon: 'star', label: "What's In", route: 'Features' },
  ] as { icon: IconName; label: string; route: string }[]).filter(m => on(m.route));
  return (
    <Screen>
      <Header title="Creator Studio" sub="Test, edit, learn and earn" />
      {banner && typeof banner !== 'string' && banner.suggestLang !== lang ? (
        <Card style={{ marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.violetSoft, borderColor: C.violetSoft }}>
          <Icon name="globe" color={C.violet} /><Text style={[T.body, { flex: 1 }]}>{banner.text}</Text>
          {banner.suggestLang && online() ? <Pressable onPress={() => call('PATCH', '/me/profile', { lang: banner.suggestLang }).then(loadConfig)} accessibilityRole="button"><Text style={{ color: C.violet, fontWeight: '900' }}>Switch</Text></Pressable> : null}
        </Card>) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={st.user.name} hue={280} size={46} ring />
        <View style={{ flex: 1 }}>
          <Text style={T.small}>{tr('home.greet', greet)},</Text>
          <Text style={[T.h3, { fontSize: 19 }]}>{st.user.name.split(' ')[0]} </Text>
        </View>
        <IconBtn name="search" label="Search" onPress={() => navigation.navigate('Search')} />
        <IconBtn name="bell" label="Notifications" badge={unread} onPress={() => navigation.navigate('Notifications')} />
      </View>

      {hero ? (
        <Pressable onPress={() => navigation.navigate('LoopDetail', { id: hero.id })} style={{ marginTop: S.xl }}>
          <LinearGradient colors={['#1E1E27', '#120F24']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
            <View style={s.heroGlow} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={s.liveDot} /><Text style={{ color: C.lime, fontWeight: '800', fontSize: 12, letterSpacing: 1 }}>LIVE LOOP</Text>
              <View style={{ flex: 1 }} />{hero.demo ? <DemoTag /> : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: -0.6 }} numberOfLines={2}>{hero.title}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.6)', marginTop: 6, fontWeight: '600' }}>{hero.members.length} members · opened {ago(hero.openedAt)}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 14 }}>
                  {(['share', 'forme', 'work', 'skip'] as const).map(k => (
                    <View key={k} style={s.vibeCount}><Vibe kind={k} size={22} /><Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{b?.[k] ?? 0}</Text></View>
                  ))}
                </View>
              </View>
              <ScoreRing score={sc} size={112} dark target={hero.minScore} />
            </View>
            <View style={{ marginTop: 16 }}>
              <Bar pct={((b?.total ?? 0) / hero.members.length) * 100} color={C.lime} bg="rgba(255,255,255,0.12)" />
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '700', marginTop: 6 }}>{b?.total ?? 0} of {hero.members.length} members reacted · target {hero.minScore}</Text>
            </View>
          </LinearGradient>
        </Pressable>
      ) : (
        <Card style={{ marginTop: S.xl }} onPress={() => navigation.navigate('NewLoop')}><Text style={T.h3}>No live Loop</Text><Text style={T.small}>Start one to collect real reactions.</Text></Card>
      )}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: S.lg }}>
        {quick.map(q => (
          <Pressable key={q.label} onPress={() => navigation.navigate(q.route)} style={{ flex: 1, alignItems: 'center' }} accessibilityRole="button" accessibilityLabel={q.label}>
            <LinearGradient colors={q.colors} style={s.quick}><Icon name={q.icon} size={24} color="#fff" /></LinearGradient>
            <Text style={{ fontWeight: '700', fontSize: 12, marginTop: 6, color: C.ink }}>{q.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: S.lg }}>
        {more.map(m => (
          <Pressable key={m.label} onPress={() => (m.route === '__chat' ? switchModule(navigation, 'chat') : m.route === '__hoods' ? switchModule(navigation, 'chat', { screen: 'ChatMain' }) : navigation.navigate(m.route))} style={s.more} accessibilityRole="button" accessibilityLabel={m.label}>
            <Icon name={m.icon} size={18} color={C.violet} /><Text style={{ fontWeight: '700', fontSize: 11, color: C.ink, marginTop: 4 }}>{m.label}</Text>
          </Pressable>))}
      </View>

      <Section title="On your plate" action={`${ready.length + st.notices.filter(n => n.kind === 'approval' && !n.read).length} items`}>
        {ready.map(l => (
          <Card key={l.id} style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }} onPress={() => navigation.navigate('ReleaseGate', { id: l.id })}>
            <View style={[s.pendIcon, { backgroundColor: C.mintSoft }]}><Icon name="shield" color="#12A27C" /></View>
            <View style={{ flex: 1 }}><Text style={T.h3}>Ready for release gate</Text><Text style={T.small}>{l.title} cleared {l.minScore}</Text></View>
            <Icon name="chevron" color={C.inkSoft} />
          </Card>
        ))}
        {st.notices.filter(n => n.kind === 'approval' && !n.read).slice(0, 2).map(n => (
          <Card key={n.id} style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }} onPress={() => { st.readNotice(n.id); n.route && navigation.navigate(n.route, n.params); }}>
            <View style={[s.pendIcon, { backgroundColor: C.violetSoft }]}><Icon name="fingerprint" color={C.violet} /></View>
            <View style={{ flex: 1 }}><Text style={T.h3}>{n.title}</Text><Text style={T.small} numberOfLines={1}>{n.body}</Text></View>
            <Icon name="chevron" color={C.inkSoft} />
          </Card>
        ))}
      </Section>

      <Section title="Drafts in the Lab" action="Loop Lab" onAction={() => navigation.navigate('Loops')}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }} style={{ marginHorizontal: -20 }}>
          <View style={{ width: 8 }} />
          {st.loops.flatMap(l => l.drafts.map(d => ({ l, d }))).slice(0, 6).map(({ l, d }) => {
            const v = loopScore(l, d.version);
            return (
              <Pressable key={l.id + d.version} onPress={() => navigation.navigate('LoopDetail', { id: l.id })}>
                <Thumb hue={d.hue} w={132} h={196} label={d.title}>
                  <View style={s.thumbTop}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>{d.version}</Text></View>
                  <View style={s.thumbScore}><Text style={{ fontWeight: '900', fontSize: 12, color: C.ink }}>{v ?? '—'}</Text></View>
                </Thumb>
              </Pressable>
            );
          })}
          <View style={{ width: 8 }} />
        </ScrollView>
      </Section>

      <Section title="Brain Map nudge">
        <Card style={{ flexDirection: 'row', gap: 12 }} onPress={() => navigation.navigate('Memory')}>
          <LinearGradient colors={PRISM as any} style={s.ai}><Icon name="spark" size={20} color="#fff" /></LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={[T.body, { lineHeight: 20 }]}>{st.insights[0]?.text}</Text>
            <Text style={[T.small, { marginTop: 6 }]}>From your own Loop history · {st.insights[0]?.source}</Text>
          </View>
        </Card>
      </Section>

      <Section title="Bag Check" action="Open" onAction={() => navigation.navigate('Earnings')}>
        <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}><Text style={T.small}>Available balance</Text><Text style={[T.h1, { marginTop: 2 }]}>{money(bal)}</Text></View>
          <DemoTag />
        </Card>
      </Section>
    </Screen>
  );
}
const s = StyleSheet.create({
  hero: { borderRadius: 30, padding: 20, overflow: 'hidden' },
  heroGlow: { position: 'absolute', right: -60, top: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: C.pink, opacity: 0.25 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.lime },
  vibeCount: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 999, paddingRight: 9, paddingLeft: 3, paddingVertical: 3 },
  quick: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  pendIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  thumbTop: { position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(18,15,36,0.5)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  thumbScore: { position: 'absolute', top: 10, right: 10, backgroundColor: C.lime, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  more: { width: '23%', alignItems: 'center', paddingVertical: 10, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  ai: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
