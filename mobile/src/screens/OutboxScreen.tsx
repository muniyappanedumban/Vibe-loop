import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Screen, Header, Card, Bar, Btn, Tag } from '../components/UI';
import { Icon } from '../components/Icon';
import { C, T } from '../theme/tokens';
import { useOutbox, retry, discard, flush } from '../lib/outbox';
import { useSession } from '../lib/api';

export function OutboxScreen() {
  const items = useOutbox(s => s.items); const online = useOutbox(s => s.online); const me = useSession(s => s.activeId);
  const mine = items.filter(i => i.account === me);
  return (
    <Screen>
      <Header title="Outbox" sub={online ? 'Online · sending queued items' : 'Offline · items wait here safely'} right={<Tag label={online ? 'ONLINE' : 'OFFLINE'} color={online ? '#12A27C' : C.tangerine} bg={online ? C.mintSoft : '#FFF1E6'} />} />
      {mine.map(i => (
        <Card key={i.id} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name={i.kind === 'msg' ? (i.file ? 'download' : 'chat') : i.kind === 'spark' ? 'clock' : 'image'} color={C.violet} />
            <View style={{ flex: 1 }}><Text style={T.h3} numberOfLines={1}>{i.label}</Text><Text style={T.small}>{i.status === 'failed' ? `Failed — ${i.error}` : i.status === 'sending' ? 'Sending…' : i.error ?? 'Queued'}{i.file?.size ? ` · ${(i.file.size / 1048576).toFixed(1)} MB` : ''}</Text></View>
          </View>
          {i.file && i.progress != null ? <View style={{ marginTop: 10 }}><Bar pct={i.progress * 100} /><Text style={[T.small, { marginTop: 4 }]}>{Math.round(i.progress * 100)}% uploaded · resumes where it stopped</Text></View> : null}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            {i.status === 'failed' ? <Btn small title="Retry" icon="undo" onPress={() => retry(i.id)} style={{ flex: 1 }} /> : null}
            <Btn small kind="ghost" title="Discard" icon="trash" onPress={() => discard(i.id)} style={{ flex: 1 }} />
          </View>
        </Card>))}
      {!mine.length ? <Card style={{ alignItems: 'center', gap: 6 }}><Icon name="check" size={32} color="#12A27C" /><Text style={T.h3}>All sent</Text><Text style={T.small}>Anything you create offline waits here and sends itself.</Text></Card> : null}
      <Btn kind="ghost" title="Try sending now" icon="send" style={{ marginTop: 12 }} onPress={() => flush()} />
    </Screen>
  );
}
export function OutboxBanner({ onPress }: { onPress: () => void }) {
  const items = useOutbox(s => s.items); const online = useOutbox(s => s.online); const me = useSession(s => s.activeId);
  const n = items.filter(i => i.account === me).length;
  if (!n && online) return null;
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: online ? C.violetSoft : '#FFF1E6', marginBottom: 12 }} accessibilityRole="button">
      <Icon name={online ? 'send' : 'globe'} size={18} color={online ? C.violet : C.tangerine} />
      <Text style={{ flex: 1, fontWeight: '700', color: C.ink }}>{online ? `${n} item${n === 1 ? '' : 's'} sending…` : `Offline${n ? ` · ${n} waiting to send` : ' · you can still read, write and queue posts'}`}</Text>
      <Icon name="chevron" size={16} color={C.inkSoft} />
    </Pressable>
  );
}
