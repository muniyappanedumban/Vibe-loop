// What's In — the feature catalog (PRD 200 · Glow×Hush 150 · Gen-Z Drops). Admin can switch this screen off.
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, ScrollView, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Rect, Path, Circle } from 'react-native-svg';
import { C, PRISM, R, S, T } from '../theme/tokens';
import { Screen, Header, Card, Btn, Chip, Tag, DemoTag, Section, Row, Toggle, NotReady, useToast, Field, Bar } from '../components/UI';
import { Icon } from '../components/Icon';
import { VibeMoji } from '../components/VibeMoji';
import { VIBEMOJI, VIBEMOJI_CATEGORIES, REACTIONS } from '../lib/vibemoji';
import { SECTIONS, ALL_FEATURES } from '../data/features';
import { PRD, PRD_GROUPS } from '../data/prd';
import { useSocial, creator, CREATORS, compact } from '../store/useSocial';
import { GENZ } from '../data/genz';
import { useStore } from '../store/useStore';
import { useSession } from '../lib/api';
import { signOut, refresh } from '../lib/sync';

const TABS = ['Home', 'Explore', 'Create', 'Motion', 'Profile'];
const DEFAULT_PARAMS: Record<string, any> = { PageView: { slug: 'help-hub' }, CreatorProfile: { id: 'u1' }, ProductView: { id: 'prod_u1_presets' }, ContentHub: {}, Blog: { module: 'glow' }, LoopDetail: { id: 'l1' }, ReleaseGate: { id: 'l1' }, FanReact: { id: 'l1' }, Props: { to: 'u1' } };
const go = (navigation: any, r?: string) => r && r !== 'Admin' && (TABS.includes(r) ? navigation.navigate('Main', { screen: r }) : ['Chats', 'Friends', 'Vibes', 'Towns', 'ChatMe'].includes(r) ? navigation.navigate('ChatMain', { screen: r }) : navigation.navigate(r, DEFAULT_PARAMS[r]));
export function Features({ navigation, route }: any) {
  const [q, setQ] = useState(''); const [open, setOpen] = useState<string | null>(route?.params?.tab === 'social' ? 'home' : PRD_GROUPS[0]);
  const [tab, setTab] = useState<'prd' | 'social' | 'genz'>(route?.params?.tab === 'social' ? 'social' : route?.params?.tab === 'genz' ? 'genz' : 'prd');
  const socialUnique = ALL_FEATURES.filter(f => !f.same);
  const prdLive = PRD.filter(f => f.route && f.route !== 'Admin').length, prdAdmin = PRD.filter(f => f.route === 'Admin').length;
  const socLive = socialUnique.filter(f => f.route).length;
  return (
    <Screen>
      <Header title="What's In" sub={`${200 + socialUnique.length} unique capabilities · ${ALL_FEATURES.length - socialUnique.length} social items link to the same PRD feature`} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: S.md }}>
        <Chip label="Creator platform · 200" active={tab === 'prd'} onPress={() => { setTab('prd'); setOpen(PRD_GROUPS[0]); }} />
        <Chip label="Glow × Hush · 150" active={tab === 'social'} onPress={() => { setTab('social'); setOpen('home'); }} />
        <Chip label={`Gen-Z Drops · ${GENZ.length}`} active={tab === 'genz'} onPress={() => setTab('genz')} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: S.lg }}>
        <Card style={{ flex: 1 }}><Text style={T.h1}>{tab === 'prd' ? prdLive : socLive}</Text><Text style={T.small}>In app (preview)</Text></Card>
        {tab === 'prd' ? <Card style={{ flex: 1 }}><Text style={T.h1}>{prdAdmin}</Text><Text style={T.small}>Admin panel</Text></Card> : null}
        <Card style={{ flex: 1 }}><Text style={T.h1}>{tab === 'prd' ? 200 - prdLive - prdAdmin : socialUnique.length - socLive}</Text><Text style={T.small}>Planned</Text></Card>
      </View>
      <View style={s.search}><Icon name="search" size={18} color={C.inkSoft} /><TextInput value={q} onChangeText={setQ} placeholder="Find a feature" placeholderTextColor="#A6A2BC" style={{ flex: 1, fontWeight: '600', fontSize: 15, color: C.ink }} /></View>
      {tab === 'prd' ? PRD_GROUPS.map((g, gi) => { const fs = PRD.filter(f => f.group === g && f.name.toLowerCase().includes(q.toLowerCase())); if (!fs.length) return null; const isOpen = open === g || !!q; const col = ['#6C3BFF', '#FF3D9A', '#FF8A3D', '#14B88D', '#2B7BF0', '#C86BFF', '#120F24'][gi]; return (
        <Card key={g} style={{ marginBottom: 10, padding: 12 }}>
          <Pressable onPress={() => setOpen(isOpen && !q ? null : g)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[s.secIcon, { backgroundColor: col }]}><Text style={{ color: '#fff', fontWeight: '900' }}>{gi + 1}</Text></View>
            <View style={{ flex: 1 }}><Text style={T.h3}>{g}</Text><Text style={T.small}>#{fs[0].n}–{fs[fs.length - 1].n} · {fs.filter(f => f.route).length}/{fs.length} available</Text></View>
            <Icon name={isOpen ? 'close' : 'chevron'} size={18} color={C.inkSoft} />
          </Pressable>
          {isOpen ? fs.map(f => (
            <Pressable key={f.n} onPress={() => go(navigation, f.route)} style={s.feat}>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: '700' }}>{f.n}. {f.name}</Text>{f.route ? <Text style={T.small}>{f.route === 'Admin' ? 'Staff admin panel' : `Screen: ${f.route}`}</Text> : null}</View>
              {f.route === 'Admin' ? <Tag label="ADMIN" color={C.violet} bg={C.violetSoft} /> : f.route ? <Tag label="PREVIEW" color="#12A27C" bg={C.mintSoft} /> : <Tag label="PLANNED" color={C.inkSoft} bg="#ECE9F5" />}
            </Pressable>)) : null}
        </Card>); }) : null}
      {tab === 'genz' ? (['Glow', 'Hush', 'Both'] as const).map(m => { const fs = GENZ.filter(f => f.module === m && (f.name + f.desc).toLowerCase().includes(q.toLowerCase())); if (!fs.length) return null; return (
        <Card key={m} style={{ marginBottom: 10, padding: 12 }}>
          <Text style={T.h3}>{m === 'Both' ? 'Glow × Hush' : m} · {fs.filter(f => f.route).length}/{fs.length} live</Text>
          {fs.map(f => <Pressable key={f.n} onPress={() => go(navigation, f.route)} style={s.feat}>
            <View style={{ flex: 1 }}><Text style={{ fontWeight: '800' }}>{f.name}</Text><Text style={T.small}>{f.desc}</Text></View>
            {f.route ? <Tag label="LIVE" color="#12A27C" bg={C.mintSoft} /> : <Tag label="PLANNED" color={C.inkSoft} bg="#ECE9F5" />}
          </Pressable>)}
        </Card>); }) : null}
      {tab === 'social' ? SECTIONS.map(sec => { const fs = sec.features.filter(f => (f.name + f.desc).toLowerCase().includes(q.toLowerCase())); if (!fs.length) return null; const isOpen = open === sec.key || !!q; return (
        <Card key={sec.key} style={{ marginBottom: 10, padding: 12 }}>
          <Pressable onPress={() => setOpen(isOpen && !q ? null : sec.key)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[s.secIcon, { backgroundColor: sec.color }]}><Icon name={sec.icon} color="#fff" /></View>
            <View style={{ flex: 1 }}><Text style={T.h3}>{sec.title}</Text><Text style={T.small}>{sec.sub} · {sec.features.filter(f => f.route).length}/10 have a screen</Text></View>
            <Icon name={isOpen ? 'close' : 'chevron'} size={18} color={C.inkSoft} />
          </Pressable>
          {isOpen ? fs.map(f => (
            <Pressable key={f.n} onPress={() => go(navigation, f.route)} style={s.feat}>
              <View style={[s.fIcon, { backgroundColor: sec.color + '1A' }]}><Icon name={f.icon} size={18} color={sec.color === '#120F24' ? C.ink : sec.color} /></View>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: '800' }}>{f.n}. {f.name}</Text><Text style={T.small}>{f.desc}</Text></View>
              {f.same ? <Tag label={`SAME AS #${f.same}`} color={C.pink} bg={C.pinkSoft} /> : f.route ? <Tag label="PREVIEW" color="#12A27C" bg={C.mintSoft} /> : <Tag label="PLANNED" color={C.inkSoft} bg="#ECE9F5" />}
            </Pressable>)) : null}
        </Card>); }) : null}
    </Screen>
  );
}


const s = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, paddingHorizontal: 16, marginBottom: 12 },
  secIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  feat: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.line, marginTop: 6 },
  fIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
