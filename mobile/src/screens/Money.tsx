import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Rect } from 'react-native-svg';
import { C, PRISM, R, S, T } from '../theme/tokens';
import { Screen, Header, Card, Btn, Chip, Tag, DemoTag, ScoreRing, Thumb, Avatar, Section, Row, Field, Toggle, NotReady, useToast, IconBtn } from '../components/UI';
import { Icon } from '../components/Icon';
import { useStore, balanceOf, PLATFORM_FEE } from '../store/useStore';
import { loopScore } from '../lib/score';
import { useSocial, compact } from '../store/useSocial';
import { VibeMoji } from '../components/VibeMoji';
import { ago, money, DAY } from '../lib/util';
import { online } from '../lib/api';
import { switchModule } from '../components/ModuleSwitch';
import { useMoney } from './Money2';
import { useConfig } from '../lib/config';
import { Media } from '../components/Lens';
import { mediaUri } from './Studio';
import { useChat } from '../chat/useChat';
import { Image } from 'react-native';
import { useSession as useSess } from '../lib/api';
import { publishOnline, payoutOnline } from '../lib/sync';

/** Hold-to-sign: the explicit human approval step that mints a one-time token. */
function SignButton({ title, onSigned, disabled }: { title: string; onSigned: () => void; disabled?: boolean }) {
  const [holding, setHolding] = useState(false);
  return (
    <Pressable disabled={disabled} delayLongPress={900} onPressIn={() => setHolding(true)} onPressOut={() => setHolding(false)} onLongPress={() => { setHolding(false); onSigned(); }} accessibilityRole="button" accessibilityLabel={title} style={{ opacity: disabled ? 0.4 : 1 }}>
      <LinearGradient colors={holding ? ['#C8F45A', '#C8F45A'] : (PRISM as any)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.sign}>
        <Icon name="fingerprint" color={holding ? C.ink : '#fff'} size={22} />
        <Text style={{ color: holding ? C.ink : '#fff', fontWeight: '900', fontSize: 15 }}>{holding ? 'Keep holding…' : title}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export function Profile({ navigation }: any) {
  const st = useStore(); const so = useSocial(); const moneyOn = useMoney(); const prof = useChat(s => s.profile); const base = useSess(s => s.apiUrl); const screensCfg = useConfig(s => s.cfg.screens); const scr = (k: string) => screensCfg[k] !== false; const feats = useConfig(s => s.cfg.features);
  const released = st.loops.filter(l => l.status === 'released').length;
  const mine = so.posts.filter(p => p.mine);
  const grid = mine;
  return (
    <Screen pad={false}>
      <LinearGradient colors={PRISM as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cover}>
        {prof?.cover ? <Image source={{ uri: base + prof.cover }} style={StyleSheet.absoluteFill} /> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
          <IconBtn dark name="search" label="Search" onPress={() => navigation.navigate('Search')} />
          <IconBtn dark name="gear" label="Settings" onPress={() => navigation.navigate('SettingsHub')} />
        </View>
      </LinearGradient>
      <View style={{ paddingHorizontal: 20, marginTop: -52 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
          <View><Avatar name={st.user.name} hue={280} size={100} ring uri={prof?.avatar_social} /><View style={s.mood}><VibeMoji id={so.profileMood} size={34} /></View></View>
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 6 }}>
            {[[mine.length, 'Drops'], [so.saved.length, 'Saved'], [so.following.length, 'Following']].map(([n, t]) => (
              <View key={t as string} style={{ alignItems: 'center' }}><Text style={{ fontWeight: '900', fontSize: 20 }}>{n}</Text><Text style={T.small}>{t}</Text></View>))}
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}><Text style={T.h2}>{st.user.name}</Text><Tag label="CREATOR" /></View>
        <Text style={T.small}>{st.user.handle}</Text>
        <Text style={[T.body, { marginTop: 8, lineHeight: 20 }]}>{so.bio}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}><Chip icon="link" label="riya.link/chai" /><Chip icon="shop" label="Presets shop" /></View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <Btn small title="Edit profile" kind="ink" style={{ flex: 1 }} onPress={() => navigation.navigate('EditProfile')} />
          <Btn small title="New Moment" icon="plus" style={{ flex: 1 }} onPress={() => navigation.navigate('NewPost')} />
        </View>
        <Section title="Forever Sparks">
          <View style={{ flexDirection: 'row', gap: 14 }}>{['Chai eps', 'BTS', 'Fans', 'Travel'].map((h, i) => (
            <Pressable key={h} style={{ alignItems: 'center' }} onPress={() => navigation.navigate('Sparks', { start: i })}><View style={s.hl}><VibeMoji id={[42, 118, 203, 311][i]} size={40} /></View><Text style={{ fontSize: 11, fontWeight: '700', marginTop: 4 }}>{h}</Text></Pressable>))}</View>
        </Section>
        <Section title={`Drops · ${mine.length}`}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{grid.map(p => (
            <View key={p.id} style={{ width: '32%' }}>{p.kind === 'thought' ? <View style={[s.gridT, { backgroundColor: p.bg ?? C.violet }]}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }} numberOfLines={5}>{p.text}</Text></View> : <Media uri={mediaUri(p.mediaUrl)} hue={p.hue} lens={p.lens} h={150} radius={6} />}</View>))}</View>
          {!mine.length ? <Text style={T.small}>Your Drops show up here. Tap + to make your first one.</Text> : null}
        </Section>
        <Card style={{ marginTop: S.lg }}>
          {moneyOn ? <Row icon="cash" title="Cash Flow" sub="Stash · Backstage Pass · Props" onPress={() => navigation.navigate('CashFlow')} tint={C.violet} /> : null}
          {scr('CreatorHub') ? <Row icon="wand" title="Creator Studio" sub="Loop Lab, Cut Room, Brain Map, Bag Check & more" onPress={() => navigation.navigate('CreatorHub')} tint={C.violet} /> : null}
          <Row icon="chart" title="Insights" sub="Views, reactions & shares on your Drops" onPress={() => navigation.navigate('Growth')} tint="#2B7BF0" />
          <Row icon="chat" title="Open Hush" sub="Your messages live in Hush" onPress={() => switchModule(navigation, 'chat')} tint="#12A27C" />
          <Row icon="bookmark" title="Saved" sub="Saved Drops & collections" onPress={() => navigation.navigate('SaveStack')} />
          {scr('Vault') ? <Row icon="bookmark" title="Keepers" sub="Quick-saved Drops" onPress={() => navigation.navigate('Vault')} /> : null}
          {feats.followRequests !== false ? <Row icon="users" title="Follow Knocks" sub="Approve followers for your private profile" onPress={() => navigation.navigate('FollowRequests')} /> : null}
          {feats.liveCamera !== false ? <Row icon="camera" title="Live Lens" sub="Live camera with lenses" onPress={() => navigation.navigate('LiveCamera')} /> : null}
          <Row icon="heart" title="Love Trail" sub="Everything you reacted to" onPress={() => navigation.navigate('LoveTrail')} tint={C.pink} />
          <Row icon="smile" title="Mood Drop" sub="Today's vibe · 24h" onPress={() => navigation.navigate('MoodDrop')} tint={C.tangerine} />
          <Row icon="shield" title="Privacy & Safety" onPress={() => navigation.navigate('Trust')} tint={C.danger} />
          {scr('Learn') ? <Row icon="book" title="Level Up" sub="Short lessons" onPress={() => navigation.navigate('Learn')} tint="#12A27C" /> : null}
          {scr('Features') ? <Row icon="star" title="What's In" sub="Every feature and its status" onPress={() => navigation.navigate('Features')} /> : null}
          <Row icon="bulb" title="Help & Support" sub="Help Hub, House Rules, Privacy Promise, SOS Lane" onPress={() => navigation.navigate('ContentHub')} />
          <Row icon="gear" title="Control Room" onPress={() => navigation.navigate('SettingsHub')} tint={C.inkSoft} />
        </Card>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  sign: { height: 60, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  prof: { borderRadius: 32, padding: 18, overflow: 'hidden' },
  glow: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: C.pink, opacity: 0.22, left: -80, bottom: -120 },
  cover: { height: 170, paddingTop: 50, paddingHorizontal: 20 },
  mood: { position: 'absolute', right: -6, bottom: -4, backgroundColor: C.bg, borderRadius: 20, padding: 2 },
  hl: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: C.line, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  gridT: { height: 150, borderRadius: 14, padding: 10, justifyContent: 'center' },
  go: { width: 52, height: 52, borderRadius: 18, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center' },
  bal: { borderRadius: 30, padding: 20 },
});
