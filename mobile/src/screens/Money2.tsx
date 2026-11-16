// Admin-switchable money features. Each screen renders only when the server config enables it (money && feature).
// Payments use the provider's hosted checkout (Razorpay / Cashfree payment links) — no card data touches the app.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Linking, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, PRISM, S, T } from '../theme/tokens';
import { Screen, Header, Card, Btn, Chip, Field, Row, Tag, NotReady, useToast, Section } from '../components/UI';
import { Icon } from '../components/Icon';
import { Media } from '../components/Lens';
import { mediaUri } from './Studio';
import { call, online } from '../lib/api';
import { useConfig, useT } from '../lib/config';
import { creator } from '../store/useSocial';

export const useMoney = (flag?: string) => useConfig(s => s.cfg.features.money === true && (!flag || s.cfg.features[flag] === true));
type Price = { amount: number; currency: string; display: string };
type Product = { id: string; creatorId: string; title: string; desc: string; price: Price; mediaUrl?: string | null; kind: string; stock?: number | null; active: boolean };
type Plan = { id: string; name: string; perks: string[]; period: string; price: Price };

function Off({ what }: { what: string }) {
  return <Screen><Header title={what} /><Card style={{ alignItems: 'center', gap: 8, paddingVertical: 30 }}><Icon name="lock" size={40} color={C.inkSoft} /><Text style={T.h3}>Not switched on</Text><Text style={[T.small, { textAlign: 'center' }]}>VibeLoop hasn't enabled {what} in your region yet.</Text></Card></Screen>;
}
async function checkout(path: string, body: any, show: (m: string, k?: 'ok' | 'err') => void) {
  try {
    const r = await call<any>('POST', path, body);
    if (r.payUrl) { show(r.testMode ? 'Opening TEST checkout…' : 'Opening secure checkout…'); Linking.openURL(r.payUrl); } else show(r.message ?? 'Order created', 'ok');
  } catch (e: any) { show(e.message, 'err'); }
}
const Provider = ({ v, set }: { v: string; set: (x: string) => void }) => (
  <View style={{ flexDirection: 'row', gap: 8, marginVertical: 8 }}><Chip label="Razorpay" active={v === 'razorpay'} onPress={() => set('razorpay')} /><Chip label="Cashfree" active={v === 'cashfree'} onPress={() => set('cashfree')} /></View>);

export function Stash({ navigation }: any) {
  const on = useMoney('store'); const tr = useT(); const [items, setItems] = useState<Product[]>([]); const [err, setErr] = useState<string | null>(null); const [prov, setProv] = useState('razorpay'); const { toast, show } = useToast();
  const [title, setTitle] = useState(''); const [price, setPrice] = useState(''); const [desc, setDesc] = useState(''); const [adding, setAdding] = useState(false);
  const load = () => call<Product[]>('GET', '/store').then(setItems).catch(e => setErr(e.message));
  useEffect(() => { if (on && online()) load(); }, [on]);
  if (!on) return <Off what={tr('name.store', 'Stash')} />;
  return (
    <View style={{ flex: 1 }}><Screen>
      <Header title={tr('name.store', 'Stash')} sub="Creator drops: presets, zines, guides" right={<Pressable onPress={() => setAdding(!adding)} accessibilityRole="button"><Text style={{ color: C.violet, fontWeight: '900' }}>{adding ? 'Close' : '+ Sell'}</Text></Pressable>} />
      {adding ? (
        <Card style={{ marginBottom: 12 }}>
          <Field label="Product name" value={title} onChangeText={setTitle} placeholder="Chai-core preset pack" />
          <Field label="Price in ₹" value={price} onChangeText={t => setPrice(t.replace(/[^\d]/g, ''))} keyboardType="numeric" placeholder="149" />
          <Field label="What's inside" value={desc} onChangeText={setDesc} multiline />
          <Btn title="List it" icon="shop" onPress={() => call('POST', '/store/products', { title, desc, price: Number(price) * 100, currency: 'INR', kind: 'digital' }).then(() => { show('Listed in your Stash'); setAdding(false); setTitle(''); setPrice(''); setDesc(''); load(); }).catch(e => show(e.message, 'err'))} />
          <Text style={[T.small, { marginTop: 6 }]}>Platform fee is shown to buyers before they pay.</Text>
        </Card>) : null}
      <Text style={T.tiny}>PAY WITH</Text><Provider v={prov} set={setProv} />
      {err ? <Text style={[T.small, { color: C.danger }]}>{err}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {items.filter(p => p.active).map(p => { const c = creator(p.creatorId); return (
          <Card key={p.id} style={{ width: '47.5%', padding: 0, overflow: 'hidden' }}>
            <Media uri={mediaUri(p.mediaUrl)} hue={(p.title.length * 37) % 360} h={120} />
            <View style={{ padding: 10 }}>
              <Text style={T.h3} numberOfLines={2} onPress={() => navigation.navigate('ProductView', { id: p.id, product: p })}>{p.title}</Text><Text style={T.small} numberOfLines={1}>by {c.name}</Text>
              <Text style={{ fontWeight: '900', fontSize: 18, marginVertical: 6 }}>{p.price.amount === 0 ? 'Free' : p.price.display}</Text>
              <Btn small title={p.price.amount === 0 ? 'Get' : 'Buy'} onPress={() => checkout('/store/orders', { productId: p.id, provider: prov }, show)} />
            </View>
          </Card>); })}
      </View>
      {!items.length && !err ? <Text style={T.small}>Nothing in the Stash yet.</Text> : null}
    </Screen>{toast}</View>
  );
}

export function BackstagePass() {
  const on = useMoney('subscriptions'); const tr = useT(); const [plans, setPlans] = useState<Plan[]>([]); const [me, setMe] = useState<any>(null); const [prov, setProv] = useState('razorpay'); const [err, setErr] = useState<string | null>(null); const { toast, show } = useToast();
  useEffect(() => { if (on && online()) { call<Plan[]>('GET', '/money/plans').then(setPlans).catch(e => setErr(e.message)); call('GET', '/money/me').then(setMe).catch(() => {}); } }, [on]);
  if (!on) return <Off what={tr('name.subscription', 'Backstage Pass')} />;
  return (
    <View style={{ flex: 1 }}><Screen>
      <Header title={tr('name.subscription', 'Backstage Pass')} sub="Support creators, unlock extras" />
      {me?.subscription ? <Card style={{ marginBottom: 12, borderColor: C.mint }}><Row icon="check" tint="#12A27C" title={`Active · ${me.subscription.planId}`} sub={`Renews ${new Date(me.subscription.renewsAt).toDateString()}`} /></Card> : null}
      <Text style={T.tiny}>PAY WITH</Text><Provider v={prov} set={setProv} />
      {err ? <Text style={[T.small, { color: C.danger }]}>{err}</Text> : null}
      {plans.map(p => (
        <LinearGradient key={p.id} colors={PRISM as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.plan}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 22 }}>{p.name}</Text>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 32, marginTop: 4 }}>{p.price.display}<Text style={{ fontSize: 14 }}> / {p.period}</Text></Text>
          {p.perks.map(x => <Text key={x} style={{ color: 'rgba(255,255,255,.9)', fontWeight: '700', marginTop: 4 }}>• {x}</Text>)}
          <Btn kind="lime" title="Get the pass" style={{ marginTop: 12 }} onPress={() => checkout('/money/subscribe', { planId: p.id, provider: prov }, show)} />
        </LinearGradient>))}
      {!plans.length && !err ? <Text style={T.small}>No plans available in your country yet.</Text> : null}
      <Text style={[T.small, { marginTop: 10 }]}>Prices are set by VibeLoop per country and shown before you pay. Cancel any time from your provider receipt.</Text>
    </Screen>{toast}</View>
  );
}

export function Props({ route }: any) {
  const on = useMoney('tips'); const tr = useT(); const to = route?.params?.to ?? 'u1'; const c = creator(to); const [amt, setAmt] = useState(5000); const [note, setNote] = useState(''); const [prov, setProv] = useState('razorpay'); const { toast, show } = useToast();
  if (!on) return <Off what={tr('name.tip', 'Props')} />;
  return (
    <View style={{ flex: 1 }}><Screen>
      <Header title={`${tr('name.tip', 'Props')} for ${c.name.split(' ')[0]}`} sub="A small thank-you, straight to the creator" />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{[2000, 5000, 10000, 25000].map(a => <Chip key={a} label={`₹${a / 100}`} active={amt === a} onPress={() => setAmt(a)} />)}</View>
      <View style={{ marginTop: S.lg }}><Field label="Note (optional)" value={note} onChangeText={setNote} maxLength={120} /></View>
      <Text style={T.tiny}>PAY WITH</Text><Provider v={prov} set={setProv} />
      <Btn title={`Send ₹${amt / 100} Props`} icon="star" onPress={() => checkout('/money/tips', { to, amount: amt, provider: prov, note }, show)} />
    </Screen>{toast}</View>
  );
}

export function CashFlow({ navigation }: any) {
  const on = useMoney(); const tr = useT(); const [me, setMe] = useState<any>(null); const [err, setErr] = useState<string | null>(null); const f = useConfig(s => s.cfg.features);
  useEffect(() => { if (on && online()) call('GET', '/money/me').then(setMe).catch(e => setErr(e.message)); }, [on]);
  if (!on) return <Off what="Cash Flow" />;
  const inc = me?.income ?? {};
  return (
    <Screen>
      <Header title="Cash Flow" sub="Your real income from paid orders only" />
      {err ? <Text style={[T.small, { color: C.danger }]}>{err}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {[['Props', inc.tips], ['Stash', inc.store], ['Passes', inc.subs], ['Fees', inc.fees], ['Net', inc.net]].map(([l, v]) => <Card key={l as string} style={{ width: '48%' }}><Text style={T.small}>{l as string}</Text><Text style={T.h1}>₹{(((v as number) ?? 0) / 100).toFixed(0)}</Text></Card>)}
      </View>
      <Card style={{ marginTop: 12 }}>
        {f.store ? <Row icon="shop" title={tr('name.store', 'Stash')} sub="Sell presets, zines, guides" onPress={() => navigation.navigate('Stash')} /> : null}
        {f.subscriptions ? <Row icon="star" title={tr('name.subscription', 'Backstage Pass')} sub="Plans & your subscription" onPress={() => navigation.navigate('BackstagePass')} /> : null}
        {f.tips ? <Row icon="heart" title={tr('name.tip', 'Props')} sub="Tips you've sent & received" onPress={() => navigation.navigate('Props')} /> : null}
      </Card>
    </Screen>
  );
}

/** "Boosts" — sponsored slot, only when the admin enabled ads for this user's slab/zone. Always labelled. */
export function AdSlot({ place }: { place: 'feed' | 'explore' | 'chat_list' }) {
  const on = useMoney('ads'); const [ad, setAd] = useState<any>(null);
  useEffect(() => { if (on && online()) call<any>('GET', `/ads/slot?place=${place}`).then(r => setAd(r.ad)).catch(() => {}); }, [on, place]);
  if (!on || !ad) return null;
  return (
    <Card style={{ marginBottom: 16, borderColor: C.line }}>
      <Tag label="SPONSORED" color={C.inkSoft} bg="#ECE9F5" />
      <Text style={[T.h3, { marginTop: 6 }]}>{ad.title}</Text><Text style={[T.small, { marginVertical: 4 }]}>{ad.body} · {ad.sponsor}</Text>
      {ad.url ? <Btn small kind="ghost" title={ad.cta ?? 'Learn more'} onPress={() => Linking.openURL(ad.url)} /> : null}
    </Card>
  );
}
const s = StyleSheet.create({ plan: { borderRadius: 28, padding: 20, marginBottom: 12 } });
