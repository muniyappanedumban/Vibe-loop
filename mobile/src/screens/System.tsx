import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { C, S, T } from '../theme/tokens';
import { Screen, Header, Card, Chip, Row, Toggle, Section, Btn, useToast, Tag } from '../components/UI';
import { Icon } from '../components/Icon';
import { useStore } from '../store/useStore';
import { ago } from '../lib/util';

const KIND: Record<string, { icon: any; tint: string }> = { reaction: { icon: 'chat', tint: C.violet }, approval: { icon: 'fingerprint', tint: C.pink }, earning: { icon: 'cash', tint: '#12A27C' }, system: { icon: 'flag', tint: C.tangerine }, loop: { icon: 'loops', tint: C.violet } };
export function Notifications({ navigation }: any) {
  const st = useStore();
  const [f, setF] = useState('all');
  const list = st.notices.filter(n => f === 'all' || (f === 'unread' ? !n.read : n.kind === f));
  return (
    <Screen>
      <Header title="Notifications" sub={`${st.notices.filter(n => !n.read).length} unread`} right={<Pressable onPress={st.readAll}><Text style={{ color: C.violet, fontWeight: '800' }}>Mark all read</Text></Pressable>} />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: S.lg }}>{['all', 'unread', 'reaction', 'approval', 'earning', 'system'].map(k => <Chip key={k} label={k[0].toUpperCase() + k.slice(1)} active={f === k} onPress={() => setF(k)} />)}</View>
      {list.map(n => (
        <Card key={n.id} style={{ marginBottom: 10, padding: 6, paddingHorizontal: 12, borderColor: n.read ? C.line : C.violet }} onPress={() => { st.readNotice(n.id); if (n.route) navigation.navigate(n.route, n.params); }}>
          <Row icon={KIND[n.kind].icon} tint={KIND[n.kind].tint} title={n.title} sub={`${n.body} · ${ago(n.at)}`} right={!n.read ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.pink }} /> : <Icon name="chevron" size={16} color={C.inkSoft} />} />
        </Card>
      ))}
    </Screen>
  );
}

export function Settings() {
  const st = useStore(); const s = st.settings; const set = st.setSetting;
  const { toast, show } = useToast();
  const exportData = () => {
    const data = JSON.stringify(useStore.getState(), null, 2);
    if (typeof document !== 'undefined') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = 'vibeloop-my-data.json'; a.click(); }
    show('Your data export is ready');
  };
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Header title="Settings" />
        <Section title="Account & security">
          <Card>
            <Row icon="user" title={st.user.name} sub={st.user.handle} />
            <Row icon="lock" title="Two-factor (TOTP)" sub={s.mfa ? 'On · recovery codes saved' : 'Off'} right={<Toggle value={s.mfa} onChange={v => set('mfa', v)} label="Two-factor" />} />
            <Row icon="fingerprint" title="Biometric for publish & payout" right={<Toggle value={s.biometric} onChange={v => set('biometric', v)} label="Biometric" />} />
            <Row icon="eye" title="Active sessions" sub="This device · now" />
          </Card>
        </Section>
        <Section title="Privacy & data">
          <Card>
            <Text style={[T.tiny, { marginTop: 4 }]}>WHO CAN JOIN LOOPS</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginVertical: 10 }}>{(['invite', 'request', 'anyone'] as const).map(v => <Chip key={v} label={v === 'invite' ? 'Invite only' : v === 'request' ? 'Request' : 'Anyone'} active={s.whoCanJoin === v} onPress={() => set('whoCanJoin', v)} />)}</View>
            <Text style={T.tiny}>DEFAULT VISIBILITY</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginVertical: 10 }}>{(['public', 'unlisted', 'supporters'] as const).map(v => <Chip key={v} label={v} active={s.defaultVisibility === v} onPress={() => set('defaultVisibility', v)} />)}</View>
            <Row icon="download" title="Download my data" onPress={exportData} />
            <Row icon="trash" title="Request account deletion" tint={C.danger} onPress={() => { st.log('privacy.deletion_request', st.user.handle); show('Deletion request logged for admin review'); }} />
          </Card>
        </Section>
        <Section title="Notifications">
          <Card>
            {([['pushLoops', 'Loops'], ['pushReactions', 'Reactions'], ['pushEarnings', 'Earnings'], ['pushSystem', 'System'], ['quietHours', 'Quiet hours (22:00–07:00)']] as const).map(([k, t]) => <Row key={k} icon="bell" title={t} right={<Toggle value={s[k]} onChange={v => set(k, v)} label={t} />} />)}
          </Card>
        </Section>
        <Section title="Creation & costs">
          <Card>
            <Row icon="spark" title="AI features" sub={`Monthly cap ₹${s.aiMonthlyCap}`} right={<Toggle value={s.aiEnabled} onChange={v => set('aiEnabled', v)} label="AI features" />} />
            <View style={{ flexDirection: 'row', gap: 8, marginVertical: 8 }}>{[250, 500, 1000].map(v => <Chip key={v} label={`₹${v}`} active={s.aiMonthlyCap === v} onPress={() => set('aiMonthlyCap', v)} />)}</View>
            <Text style={T.tiny}>RENDER QUALITY</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginVertical: 10 }}>{(['720p', '1080p', '4K'] as const).map(v => <Chip key={v} label={v} active={s.renderQuality === v} onPress={() => set('renderQuality', v)} />)}</View>
            <Text style={T.tiny}>LANGUAGE MODE</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginVertical: 10, flexWrap: 'wrap' }}>{['Hinglish', 'English', 'Tamil', 'Marathi', 'Bengali'].map(v => <Chip key={v} label={v} active={s.language === v} onPress={() => set('language', v)} />)}</View>
          </Card>
        </Section>
        <Section title="Monetisation">
          <Card>
            <Text style={T.tiny}>MINIMUM PAYOUT</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginVertical: 10 }}>{[500, 1000, 2500].map(v => <Chip key={v} label={`₹${v}`} active={s.minPayout === v} onPress={() => set('minPayout', v)} />)}</View>
            <Text style={T.tiny}>CURRENCY</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginVertical: 10 }}>{(['INR', 'USD', 'EUR'] as const).map(v => <Chip key={v} label={v} active={s.currency === v} onPress={() => set('currency', v)} />)}</View>
          </Card>
        </Section>
        <Section title="Audit trail (this device)">
          <Card>{st.audit.slice(0, 5).map(a => <Row key={a.id} icon="shield" title={a.action} sub={`${a.detail} · ${ago(a.at)}`} />)}{!st.audit.length ? <Text style={T.small}>No actions yet.</Text> : null}</Card>
        </Section>
        <Btn kind="ghost" title="Reset demo data" icon="undo" style={{ marginTop: S.xl }} onPress={() => { st.reset(); show('Demo data reset'); }} />
      </Screen>
      {toast}
    </View>
  );
}
