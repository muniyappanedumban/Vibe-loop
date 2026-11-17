// Privacy & standing: Delete account (grace period + cancel), Download my data, Account standing + appeals.
// Server: /me/delete, /me/deletion, /me/deletion/cancel, /me/export, /me/standing, /appeals. Admin switches: privacy.*, safety.*.
import React, { useCallback, useState } from 'react';
import { View, Text, ActivityIndicator, Share, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { C, S, T } from '../theme/tokens';
import { Screen, Header, Card, Row, Section, Btn, Field, useToast, Tag } from '../components/UI';
import { call, useSession, useGate } from '../lib/api';
import { signOut } from '../lib/sync';
import { ago } from '../lib/util';

function useLoad<X>(path: string): [X | null, string | null, () => void] {
  const [d, setD] = useState<X | null>(null); const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => { setErr(null); call<X>('GET', path).then(setD).catch(e => setErr(e.message)); }, [path]);
  useFocusEffect(load);
  return [d, err, load];
}
const when = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function DeleteAccount({ navigation }: any) {
  const { toast, show } = useToast(); const [d, err, reload] = useLoad<{ scheduled: boolean; deleteAt: number | null }>('/me/deletion');
  const [confirm, setConfirm] = useState(''); const [busy, setBusy] = useState(false);
  const handle = useSession(s => s.accounts.find(a => a.id === s.activeId)?.handle) ?? '';
  const del = async () => {
    setBusy(true);
    try {
      const r = await call<any>('POST', '/me/delete', { confirm });
      await signOut(); navigation.reset({ index: 0, routes: [{ name: 'SignIn' }] });
      if (r.deleted) return;
    } catch (e: any) { show(e.message, 'err'); } finally { setBusy(false); }
  };
  const cancel = async () => { setBusy(true); try { await call('POST', '/me/deletion/cancel'); show('Deletion cancelled — welcome back'); reload(); } catch (e: any) { show(e.message, 'err'); } finally { setBusy(false); } };
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Header title="Delete account" sub="Leave VibeLoop for good" />
        {!d ? (err ? <Card><Text style={T.body}>{err}</Text></Card> : <ActivityIndicator color={C.violet} />) : d.scheduled ? (
          <Card style={{ borderColor: C.danger }}>
            <Text style={T.h3}>Your account is scheduled for deletion</Text>
            <Text style={[T.small, { marginVertical: 8 }]}>It will be erased on {d.deleteAt ? when(d.deleteAt) : 'soon'}. Changed your mind? Keep it.</Text>
            <Btn title={busy ? 'Working…' : 'Keep my account'} kind="ink" disabled={busy} onPress={cancel} />
          </Card>
        ) : (
          <Card>
            <Text style={T.h3}>What happens</Text>
            <Text style={[T.small, { marginTop: 8 }]}>• You're signed out on every device right away.{'\n'}• Your account is erased after the grace period (usually 30 days). Sign in before then to cancel.{'\n'}• Erased: profile, posts, comments, Moods, Blinks, friends, photos and videos, devices.{'\n'}• Chats you sent stay with the people you sent them to, shown as "Deleted account".{'\n'}• Payment records are kept as the law requires.</Text>
            <Btn small kind="ghost" title="Download my data first" icon="download" onPress={() => navigation.navigate('MyData')} style={{ marginTop: 12 }} />
            <Field label={`Type your @ID (${handle}) to confirm`} value={confirm} onChangeText={setConfirm} autoCapitalize="none" placeholder={handle} />
            <Btn kind="danger" title={busy ? 'Deleting…' : 'Delete my account'} disabled={busy || confirm.trim().length < 2} onPress={del} />
          </Card>
        )}
      </Screen>
      {toast}
    </View>
  );
}

export function MyData() {
  const { toast, show } = useToast(); const [busy, setBusy] = useState(false); const [sum, setSum] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    try {
      const d = await call<any>('GET', '/me/export', undefined, 60000);
      const json = JSON.stringify(d, null, 2);
      const counts = `${d.posts.length} posts · ${d.comments.length} comments · ${d.chats.length} chats · ${d.media.length} files · ${d.securityEvents.length} security events`;
      setSum(counts);
      let saved = false;
      if (Platform.OS === 'android') {
        try {
          const { Directory } = require('expo-file-system');
          const dir = await Directory.pickDirectoryAsync();
          const f = dir.createFile(`vibeloop-${d.account.handle.replace('@', '')}-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
          await f.write(json); saved = true; show('Saved your data file');
        } catch { /* user cancelled the folder picker, or saving isn't supported → share instead */ }
      }
      if (!saved) await Share.share({ title: 'My VibeLoop data', message: json.length > 90000 ? json.slice(0, 90000) + '\n…(truncated — save to a folder for the full file)' : json });
    } catch (e: any) { show(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Header title="Download my data" sub="Everything VibeLoop keeps about you" />
        <Card>
          <Text style={T.small}>One JSON file with your account, profile, settings, posts, comments, Hush chats (encrypted messages stay encrypted), uploads list, devices, security events and appeals. You can download it 3 times per hour.</Text>
          <Btn title={busy ? 'Preparing…' : 'Download my data'} icon="download" disabled={busy} onPress={run} style={{ marginTop: 12 }} />
          {sum ? <Text style={[T.small, { marginTop: 10 }]}>{sum}</Text> : null}
        </Card>
      </Screen>
      {toast}
    </View>
  );
}

type Appeal = { id: string; kind: string; target: string; reason: string; status: string; note: string; at: number };
type Standing = { suspended: boolean; restrictedUntil: number | null; appealsOn: boolean; removedPosts: { id: string; text: string; at: number }[]; heldMedia: { id: string; kind: string; status: string; note: string | null; at: number }[]; appeals: Appeal[] };
const KIND: Record<string, string> = { ban: 'Account suspension', post: 'Removed post', media: 'Removed file', restrict: 'Account limit' };
export function AccountStanding({ navigation }: any) {
  const { toast, show } = useToast(); const [d, err, reload] = useLoad<Standing>('/me/standing');
  const [open, setOpen] = useState<{ kind: string; target: string } | null>(null); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);
  const pending = (kind: string, target: string) => d?.appeals.find(a => a.kind === kind && (a.target === target || kind === 'ban' || kind === 'restrict') && a.status === 'open');
  const send = async () => {
    if (!open) return; setBusy(true);
    try { await call('POST', '/appeals', { ...open, reason: reason.trim() }); show('Appeal sent — we\'ll notify you'); setOpen(null); setReason(''); reload(); }
    catch (e: any) { show(e.message, 'err'); } finally { setBusy(false); }
  };
  const AppealBtn = ({ kind, target = '' }: { kind: string; target?: string }) => !d?.appealsOn ? null : pending(kind, target)
    ? <Tag label="APPEAL OPEN" color={C.tangerine} bg="#FFF4D6" />
    : <Btn small kind="ghost" title="Appeal" onPress={() => { setOpen({ kind, target }); setReason(''); }} />;
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Header title="Account standing" sub="Actions on your account and your appeals" back={!d?.suspended && navigation.canGoBack()} />
        {!d ? (err ? <Card><Text style={T.body}>{err}</Text></Card> : <ActivityIndicator color={C.violet} />) : (<>
          <Card style={d.suspended ? { borderColor: C.danger } : undefined}>
            <Row icon={d.suspended || d.restrictedUntil ? 'flag' : 'check'} tint={d.suspended ? C.danger : d.restrictedUntil ? C.tangerine : '#12A27C'}
              title={d.suspended ? 'Your account is suspended' : d.restrictedUntil ? 'Your account is limited' : 'All good'}
              sub={d.suspended ? 'You broke the House Rules. You can appeal if you think we got it wrong.' : d.restrictedUntil ? `Sending and posting are paused until ${new Date(d.restrictedUntil).toLocaleString()} because of unusual activity.` : 'No actions against your account.'}
              right={d.suspended ? <AppealBtn kind="ban" /> : d.restrictedUntil ? <AppealBtn kind="restrict" /> : undefined} />
          </Card>
          {d.removedPosts.length ? <Section title="Removed posts"><Card>{d.removedPosts.map(p => <Row key={p.id} icon="flag" tint={C.danger} title={p.text || 'Post'} sub={ago(p.at)} right={<AppealBtn kind="post" target={p.id} />} />)}</Card></Section> : null}
          {d.heldMedia.length ? <Section title="Held or removed files"><Card>{d.heldMedia.map(m => <Row key={m.id} icon={m.status === 'pending' ? 'clock' : 'flag'} tint={m.status === 'pending' ? C.tangerine : C.danger} title={m.status === 'pending' ? `${m.kind} waiting for a safety check` : `${m.kind} removed`} sub={`${m.note ?? ''} · ${ago(m.at)}`} right={m.status === 'blocked' ? <AppealBtn kind="media" target={m.id} /> : undefined} />)}</Card></Section> : null}
          {open ? (
            <Card style={{ marginTop: S.md, borderColor: C.violet }}>
              <Text style={T.h3}>Appeal: {KIND[open.kind]}</Text>
              <Field label="Tell us why we should look again (10+ characters)" value={reason} onChangeText={setReason} multiline placeholder="What happened, and why it follows the rules" />
              <View style={{ flexDirection: 'row', gap: 8 }}><Btn small kind="ghost" title="Cancel" onPress={() => setOpen(null)} style={{ flex: 1 }} /><Btn small title={busy ? 'Sending…' : 'Send appeal'} disabled={busy || reason.trim().length < 10} onPress={send} style={{ flex: 1 }} /></View>
            </Card>) : null}
          {d.appeals.length ? <Section title="Your appeals"><Card>{d.appeals.map(a => <Row key={a.id} icon={a.status === 'open' ? 'clock' : a.status === 'reversed' ? 'check' : 'close'} tint={a.status === 'reversed' ? '#12A27C' : a.status === 'open' ? C.tangerine : C.inkSoft}
            title={`${KIND[a.kind] ?? a.kind} · ${a.status === 'open' ? 'under review' : a.status === 'reversed' ? 'reversed' : 'decision kept'}`} sub={[a.note, ago(a.at)].filter(Boolean).join(' · ')} />)}</Card></Section> : null}
          {!d.suspended && !navigation.canGoBack() ? <Btn title="Continue to VibeLoop" style={{ marginTop: S.lg }} onPress={() => { useGate.setState({ kind: null, message: '' }); navigation.reset({ index: 0, routes: [{ name: useSession.getState().module === 'chat' ? 'ChatMain' : 'Main' }] }); }} /> : null}
          {d.suspended ? <Btn kind="ghost" title="Sign out" style={{ marginTop: S.lg }} onPress={async () => { useGate.setState({ kind: null, message: '' }); await signOut(); navigation.reset({ index: 0, routes: [{ name: 'SignIn' }] }); }} /> : null}
        </>)}
      </Screen>
      {toast}
    </View>
  );
}
