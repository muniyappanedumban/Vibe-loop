/* User App Settings + All switches. Uses the shared layer editor from App.tsx (via KIT) so every save goes through
   PUT /admin/config/{layer}: server-validated, bumps the config version and writes the audit log. */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { KIT } from '../App';
import { api, useApi } from '../api';
import { Icon } from '../icons';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
type Setting = { path: string; module: 'glow' | 'hush' | 'global'; label: string; type: 'bool' | 'int' | 'enum' | 'multi' | 'str' | 'version'; default: J;
  enforced: boolean; help: string; min?: number; max?: number; options?: J[]; maxLen?: number };
type Schema = { settings: Setting[] };

const getP = (o: J, p: string) => p.split('.').reduce((a, k) => (a && typeof a === 'object' ? a[k] : undefined), o);
const setP = (o: J, p: string, v: J) => { const ks = p.split('.'); let d = o; for (const k of ks.slice(0, -1)) { if (!d[k] || typeof d[k] !== 'object') d[k] = {}; d = d[k]; } d[ks[ks.length - 1]] = v; };
const delP = (o: J, p: string) => {
  const ks = p.split('.'); const chain: J[] = [o]; let d = o;
  for (const k of ks.slice(0, -1)) { if (!d?.[k]) return; d = d[k]; chain.push(d); }
  delete d[ks[ks.length - 1]];
  for (let i = ks.length - 2; i >= 0; i--) if (Object.keys(chain[i + 1]).length === 0) delete chain[i][ks[i]]; else break;
};
const baseFromSchema = (ss: Setting[]) => { const o: J = {}; for (const s of ss) setP(o, s.path, s.default); return o; };

/** Mirrors backend/app/user_app.py check_value so the admin sees problems before saving (the server re-validates). */
export function checkValue(s: Setting, v: J): string | null {
  switch (s.type) {
    case 'bool': return typeof v === 'boolean' ? null : 'Must be on/off';
    case 'int': return Number.isInteger(v) && v >= s.min! && v <= s.max! ? null : `Whole number ${s.min}–${s.max}`;
    case 'enum': return s.options!.includes(v) ? null : 'Pick an option';
    case 'multi': return Array.isArray(v) && v.every(x => s.options!.includes(x)) ? null : 'Pick from the list';
    case 'str': return typeof v === 'string' && v.length <= (s.maxLen ?? 200) ? null : `At most ${s.maxLen ?? 200} characters`;
    case 'version': return typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v) && v.length <= 20 ? null : 'Use 1.2.3';
  }
}

const HUSH_RELATED = ['moodMedia', 'chatMedia', 'readReceipts', 'typing', 'voiceNotes', 'calls', 'fadeChat', 'viewOnce', 'snaps', 'statuses'];
const GLOW_RELATED = ['lenses', 'storyViewers', 'followRequests', 'liveCamera', 'polls', 'live'];
const MOD_LABEL = { glow: 'Glow', hush: 'Hush', global: 'Global' } as const;

function SettingRow({ s, eff, draft, upd, disabled }: { s: Setting; eff: J; draft: J; upd: (f: (d: J) => void) => void; disabled: boolean }) {
  const { Toggle, Pill } = KIT;
  const v = getP(eff, s.path); const set = getP(draft, s.path) !== undefined; const err = set ? checkValue(s, getP(draft, s.path)) : null;
  const put = (x: J) => upd(d => setP(d, s.path, x));
  let input: ReactNode;
  if (s.type === 'bool') input = <Toggle label={s.label} on={!!v} disabled={disabled} onClick={() => put(!v)} />;
  else if (s.type === 'int') input = <input type="number" aria-label={s.label} disabled={disabled} min={s.min} max={s.max} step={1} value={v ?? ''} onChange={ev => put(ev.target.value === '' ? 0 : Number(ev.target.value))} />;
  else if (s.type === 'enum') input = <select aria-label={s.label} disabled={disabled} value={String(v)} onChange={ev => put(typeof s.options![0] === 'number' ? Number(ev.target.value) : ev.target.value)}>{s.options!.map(o => <option key={o} value={String(o)}>{String(o)}</option>)}</select>;
  else if (s.type === 'multi') input = <div className="row" style={{ flexWrap: 'wrap', gap: 6, maxWidth: 520 }}>
    {s.options!.map(o => { const on = (v ?? []).includes(o); return <button key={o} type="button" disabled={disabled} className={'chip lchip' + (on ? ' on' : '')} style={{ opacity: on ? 1 : 0.45, paddingRight: 12 }}
      aria-pressed={on} onClick={() => put(on ? (v as J[]).filter(x => x !== o) : [...(v ?? []), o])}>{String(o)}</button>; })}
    <button type="button" className="linkbtn" disabled={disabled} onClick={() => put([...s.options!])}>all</button><button type="button" className="linkbtn" disabled={disabled} onClick={() => put([])}>none</button></div>;
  else input = <input aria-label={s.label} disabled={disabled} value={v ?? ''} maxLength={s.maxLen ?? 20} placeholder={s.type === 'version' ? '1.2.3' : ''} onChange={ev => put(ev.target.value)} />;
  return <div className="frow" data-setting={s.path}>
    <div className="grow"><b>{s.label}</b> <code>{s.path}</code>{s.help && <small style={{ display: 'block' }}>{s.help}</small>}
      {err && <small style={{ display: 'block', color: '#d33' }} role="alert">{err}</small>}</div>
    {s.enforced ? <Pill tone="mint">server-enforced</Pill> : <Pill tone="gray">app default</Pill>}
    {set ? <Pill tone="violet">this layer</Pill> : <Pill tone="gray">inherited</Pill>}
    {set && <button className="iconbtn sm" aria-label={'Clear ' + s.path} onClick={() => upd(d => delP(d, s.path))}><Icon name="x" size={13} /></button>}
    {input}
  </div>;
}

function DefaultLanguage() {
  const langs = useApi<{ available: string[]; default: string }>('/admin/languages');
  const [msg, setMsg] = useState('');
  if (!langs.data) return null;
  return <div className="frow" data-setting="languages.default"><div className="grow"><b>Default language</b> <code>languages.default</code><small style={{ display: 'block' }}>Global only (not per layer). Saved immediately · audited as config.languages.</small>{msg && <small style={{ display: 'block' }}>{msg}</small>}</div>
    <KIT.Pill tone="gray">global</KIT.Pill>
    <select aria-label="Default language" value={langs.data.default} onChange={ev => api('/admin/languages', { method: 'PUT', body: { ...langs.data, default: ev.target.value } }).then(() => { setMsg('Saved.'); langs.reload(); }, e => setMsg((e as Error).message))}>
      {langs.data.available.map(l => <option key={l} value={l}>{l}</option>)}</select></div>;
}

export function UserAppSettingsPage() {
  const { useLayerEditor, LayerBar, Gate, Card, Pill, Toggle, Search, cfgMerge, FEATURE_DESC } = KIT;
  const e = useLayerEditor();
  const schema = useApi<Schema>('/admin/user-app/schema');
  const [mod, setMod] = useState<'glow' | 'hush' | 'global'>('glow');
  const [q, setQ] = useState('');
  return <Gate rs={[...e.rs, schema]}>{() => {
    const ss = schema.data!.settings;
    const eff = cfgMerge(cfgMerge(baseFromSchema(ss), e.inherited), e.draft);
    const errs = ss.filter(s => getP(e.draft, s.path) !== undefined && checkValue(s, getP(e.draft, s.path)));
    const t = q.trim().toLowerCase();
    const rows = ss.filter(s => (t ? true : s.module === mod) && (s.label + ' ' + s.path + ' ' + s.help).toLowerCase().includes(t));
    const related = mod === 'hush' ? HUSH_RELATED : mod === 'glow' ? GLOW_RELATED : [];
    return <>
      <LayerBar e={e} note="Every user-facing default and limit for Glow, Hush and the whole app. “server-enforced” values are checked by the API; “app default” values are what the app starts new users with." />
      {errs.length > 0 && <div className="errbox" role="alert">{errs.length} value{errs.length > 1 ? 's' : ''} out of range — the server will reject this save: {errs.map(s => s.path).join(', ')}</div>}
      <Card title={t ? `Search · ${rows.length}` : `${MOD_LABEL[mod]} settings · ${rows.length}`} extra={<div className="row">
        <div className="tabs">{(['glow', 'hush', 'global'] as const).map(m => <button key={m} className={mod === m && !t ? 'on' : ''} onClick={() => { setMod(m); setQ(''); }}>{MOD_LABEL[m]}</button>)}</div>
        <Search v={q} set={setQ} ph="Filter settings…" /></div>}>
        {e.isLang && <div className="notready"><Icon name="key" size={16} /><span>Language layers can’t change settings. Pick base, a country, zone or slab.</span></div>}
        {rows.map(s => <SettingRow key={s.path} s={s} eff={eff} draft={e.draft} upd={e.upd} disabled={e.isLang} />)}
        {!t && mod === 'global' && <DefaultLanguage />}
      </Card>
      {!t && related.length > 0 && <Card title={`Related ${MOD_LABEL[mod]} switches`} extra={<a href="#/switches" className="linkbtn">All switches →</a>}>
        {related.map(k => { const on = eff.features?.[k] !== false; const set = e.draft.features && k in e.draft.features;
          return <div key={k} className="frow" data-feature={k}><div className="grow"><b>{FEATURE_DESC[k] ?? k}</b> <code>features.{k}</code></div>
            {set ? <Pill tone="violet">this layer</Pill> : <Pill tone="gray">inherited</Pill>}
            <Toggle label={k} on={on} disabled={e.isLang} onClick={() => e.upd(d => { d.features = { ...(d.features ?? {}), [k]: !on }; })} /></div>; })}
      </Card>}
    </>;
  }}</Gate>;
}

/* ---------- All switches ---------- */
const HUSH_SCREENS = new Set(['Chats', 'Friends', 'Vibes', 'Towns', 'ChatMe', 'ChatThread', 'ChatRoom', 'NewChat', 'ShareToChat', 'ChatSearch', 'Starred', 'MyCode', 'StatusCompose', 'StatusView', 'CreateTown', 'TownRoom', 'ChatSecurity', 'BubbleMojiGallery']);
const HUSH_FEATS = new Set(['statuses', 'towns', 'viewOnce', 'sendLater', 'polls', 'fadeChat', 'chatLock', 'readReceipts', 'typing', 'voiceNotes', 'calls', 'e2ee', 'snaps', 'chatMedia', 'moodMedia', 'hushSettings', 'realtime']);
const GLOW_FEATS = new Set(['payouts', 'paidLoops', 'live', 'storyViewers', 'followRequests', 'liveCamera', 'subscriptions', 'store', 'tips', 'ads', 'blog', 'news', 'productReviews', 'vouches', 'lenses', 'autoEdit', 'miniVote', 'pin3', 'saveStack', 'loveTrail']);
type Mod = 'glow' | 'hush' | 'platform';
const featMod = (k: string, desc = ''): Mod => HUSH_FEATS.has(k) || desc.startsWith('Hush') ? 'hush' : GLOW_FEATS.has(k) || desc.startsWith('Glow') ? 'glow' : 'platform';

export function AllSwitchesPage() {
  const { useLayerEditor, LayerBar, Gate, Card, Pill, Toggle, Search, FEATURE_KEYS, FEATURE_DESC, SCREEN_KEYS, SCREEN_DESC } = KIT;
  const e = useLayerEditor();
  const [q, setQ] = useState('');
  const [mod, setMod] = useState<'all' | Mod>('all');
  return <Gate rs={e.rs}>{() => {
    const t = q.trim().toLowerCase();
    type Row = { sec: 'features' | 'screens'; k: string; desc: string; mod: Mod };
    const all: Row[] = [
      ...(FEATURE_KEYS as readonly string[]).map(k => ({ sec: 'features' as const, k, desc: FEATURE_DESC[k] ?? '', mod: featMod(k, FEATURE_DESC[k]) })),
      ...(SCREEN_KEYS as readonly string[]).map(k => ({ sec: 'screens' as const, k, desc: SCREEN_DESC[k] ?? '', mod: (HUSH_SCREENS.has(k) ? 'hush' : 'glow') as Mod })),
    ];
    const rows = all.filter(r => (mod === 'all' || r.mod === mod) && `${r.sec}.${r.k} ${r.desc} ${r.mod}`.toLowerCase().includes(t));
    const isOn = (r: Row) => e.eff[r.sec]?.[r.k] !== false;
    const bulk = (on: boolean) => e.upd(d => { for (const r of rows) d[r.sec] = { ...(d[r.sec] ?? {}), [r.k]: on }; });
    const clear = () => e.upd(d => { for (const r of rows) if (d[r.sec]) { delete d[r.sec][r.k]; if (!Object.keys(d[r.sec]).length) delete d[r.sec]; } });
    const off = rows.filter(r => !isOn(r)).length;
    return <>
      <LayerBar e={e} note="Every feature flag and screen switch in one list. Bulk actions apply to the rows currently shown and only change the draft — review, then Save. Each save is audited." />
      <Card title={`All switches · ${rows.length} shown`} extra={<div className="row"><Pill tone="red">{off} off</Pill>
        <div className="tabs">{([['all', 'All'], ['glow', 'Glow'], ['hush', 'Hush'], ['platform', 'Platform']] as const).map(([k, l]) => <button key={k} className={mod === k ? 'on' : ''} onClick={() => setMod(k)}>{l}</button>)}</div>
        <Search v={q} set={setQ} ph="Search switches…" /></div>}>
        {e.isLang && <div className="notready"><Icon name="key" size={16} /><span>Language layers can’t change switches. Pick base, a country, zone or slab.</span></div>}
        <div className="row" style={{ marginBottom: 10 }}>
          <button className="btn sm ghost" disabled={e.isLang || !rows.length} onClick={() => bulk(true)}>Turn all shown on</button>
          <button className="btn sm danger" disabled={e.isLang || !rows.length} onClick={() => bulk(false)}>Turn all shown off</button>
          <button className="btn sm ghost" disabled={e.isLang || !rows.length} onClick={clear}>Clear shown from this layer (inherit)</button></div>
        {rows.map(r => { const on = isOn(r); const set = e.draft[r.sec] && r.k in e.draft[r.sec];
          return <div key={r.sec + r.k} className="frow" data-switch={`${r.sec}.${r.k}`}>
            <div className="grow"><b>{r.desc || r.k}</b> <code>{r.sec}.{r.k}</code></div>
            <Pill tone={r.mod === 'hush' ? 'mint' : r.mod === 'glow' ? 'violet' : 'gray'}>{r.mod}</Pill>
            {set ? <Pill tone="violet">this layer</Pill> : <Pill tone="gray">inherited</Pill>}
            <Toggle label={`${r.sec}.${r.k}`} on={on} disabled={e.isLang} onClick={() => e.upd(d => { d[r.sec] = { ...(d[r.sec] ?? {}), [r.k]: !on }; })} /></div>; })}
        {!rows.length && <p className="empty">No switch matches “{q}”.</p>}
      </Card>
    </>;
  }}</Gate>;
}
