import { Fragment, createContext, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import type { Dispatch, ReactNode } from 'react';
import { initialState, reducer, ROLES, PERMS, DEFAULT_FLAGS, DEFAULT_MATRIX, defaultSettings } from './store';
import type { Action, Role, State } from './store';
import { STAFF_ROLES } from './store';
import type { Settings, SettingsSection, Staff } from './store';
import { Icon, Logo } from './icons';
import { VIBEMOJI, VIBEMOJI_CATEGORIES, REACTIONS, vibemojiSvg } from './vibemoji';
import { SECTIONS, ALL_FEATURES } from './features';
import { PRD, PRD_GROUPS } from './prd';
import { api, useApi, login, loginMfa, ApiError, getToken, getUser, setSession, API_URL, uploadFile } from './api';
import { UserAppSettingsPage, AllSwitchesPage } from './pages/UserAppSettings';
import type { ApiUser, Overview, Report, ApiPayout, AuditRow, PrivacyReq, ApiAnnouncement, SearchResult, KV } from './api';

/* Demo-only state (abuse rules / flagged accounts) — everything else comes from the API. */
const Ctx = createContext<{ s: State; dispatch: Dispatch<Action> }>(null!);

export const PAGES = [
  ['dashboard', 'Mission Control'], ['users', 'Members'], ['moderation', 'Mod Queue'], ['payouts', 'Cashouts'],
  ['health', 'Vitals'], ['costs', 'Burn Rate'], ['flags', 'Switchboard'], ['audit', 'Paper Trail'],
  ['privacy', 'Privacy Desk'], ['abuse', 'Spam Shield'], ['appeals', 'Appeals'], ['scan', 'Scan Queue'], ['incidents', 'Incidents'], ['revenue', 'Revenue Pulse'], ['announcements', 'Megaphone'], ['roles', 'Role Matrix'],
  ['navigation', 'Nav Builder'], ['themes', 'Theme Studio'], ['userapp', 'User App Settings'], ['switches', 'All Switches'], ['screens', 'Screen Switches'], ['limits', 'Feature Dials'], ['zones', 'Zones'], ['slabs', 'Tiers'], ['languages', 'Lingo'], ['preview', 'Preview Room'],
  ['otp', 'Login Watch'], ['identity', 'ID Desk'], ['chat', 'Hush & Hoods'],
  ['realtime', 'Realtime Monitor'], ['calls', 'Call Log'], ['push', 'Push Center'], ['e2ee', 'E2EE & Keys'],
  ['cashflow', 'Cash Flow'], ['money', 'Money switches'], ['plans', 'Backstage Pass'], ['countries', 'Country pricing'], ['boosts', 'Boosts'], ['stash', 'Stash'], ['plugs', 'Plugs'],
  ['promos', 'Promos'], ['uploads', 'Uploads'],
  ['pages', 'Page Studio'], ['blog', 'The Loopdown / Fresh Wire'], ['reviews', 'Reviews Desk'], ['speakup', 'Speak Up Desk'],
  ['settings', 'Control Room'], ['emoji', 'VibeMoji Vault'], ['features', "What's In"], ['search', 'Seek'], ['learn', 'Level Up'],
] as const;
const NAV_HEADINGS: Partial<Record<string, string>> = { navigation: 'App control', otp: 'Identity & chat', realtime: 'Live & reach', cashflow: 'Money & growth', promos: 'Brand & community', pages: 'Content & trust', settings: 'Platform' };
type Slug = typeof PAGES[number][0];

const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const when = (t: string | number) => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
const cap = (r: string) => r.charAt(0).toUpperCase() + r.slice(1);

type Route = { slug: Slug; sub: string; q: string };
function parseHash(): Route {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  const [h, sub = ''] = path.split('/');
  const slug = (PAGES.some(p => p[0] === h) ? h : 'dashboard') as Slug;
  return { slug, sub, q: new URLSearchParams(qs).get('q') ?? '' };
}
function useHash(): Route {
  const [r, setR] = useState(parseHash);
  useEffect(() => { const f = () => setR(parseHash()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return r;
}
const RouteCtx = createContext<Route>({ slug: 'dashboard', sub: '', q: '' });
const ToastCtx = createContext<(m: string) => void>(() => {});

/** Run a mutation, toast the result (or the server's error), then refetch. */
function useAct() {
  const toast = useContext(ToastCtx);
  const [busy, setBusy] = useState(false);
  const run = async <T,>(fn: () => Promise<T>, ok?: string, after?: (r: T) => void) => {
    setBusy(true);
    try { const r = await fn(); if (ok) toast(ok); after?.(r); return r; }
    catch (e) { toast('Error: ' + (e as Error).message); return undefined; }
    finally { setBusy(false); }
  };
  return { run, busy };
}

/* ---------- primitives ---------- */
const Demo = () => <span className="demo">Demo data</span>;
const LivePill = () => <Pill tone="mint">Live API</Pill>;
function Card({ title, extra, children, className = '' }: { title?: string; extra?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={'card ' + className}>{title && <header className="card-h"><h3>{title}</h3>{extra}</header>}{children}</section>;
}
function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return <div className={'kpi ' + (tone ?? '')}><span className="kpi-l">{label}</span><strong>{value}</strong>{sub && <span className="kpi-s">{sub}</span>}</div>;
}
const Pill = ({ tone, children }: { tone: string; children: ReactNode }) => <span className={'pill ' + tone}>{children}</span>;
const Toggle = ({ on, onClick, danger, label, disabled }: { on: boolean; onClick: () => void; danger?: boolean; label: string; disabled?: boolean }) =>
  <button role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={'tg' + (on ? ' on' : '') + (danger ? ' danger' : '')} onClick={onClick}><i /></button>;
const statusTone: Record<string, string> = { pending: 'amber', pending_review: 'amber', open: 'amber', review: 'amber', approved: 'mint', completed: 'mint', fulfilled: 'mint', paid: 'mint', cleared: 'mint', removed: 'red', rejected: 'red', suspended: 'red', escalated: 'violet' };
const St = ({ v }: { v: string }) => <Pill tone={statusTone[v] ?? 'gray'}>{v.replace('_', ' ')}</Pill>;
const NotReady = ({ children }: { children: ReactNode }) => <div className="notready"><Icon name="key" size={16} /><span>{children}</span></div>;
function ApiErr({ msg, retry }: { msg: string; retry?: () => void }) {
  return <Card className="apierr"><b>Couldn’t load data from the API</b><div className="errbox">{msg}</div>
    <span className="muted small">API: <code>{API_URL}</code>. No fallback data is shown.</span>{retry && <button className="btn sm ghost" onClick={retry}>Retry</button>}</Card>;
}
type Res<T> = { data: T | null; error: string | null; loading: boolean; reload: () => void };
/** Render children only when every resource loaded; otherwise an error or loading state. */
function Gate({ rs, children }: { rs: Res<unknown>[]; children: () => ReactNode }) {
  const err = rs.find(r => r.error);
  if (err) return <ApiErr msg={err.error!} retry={() => rs.forEach(r => r.reload())} />;
  if (rs.some(r => r.data === null)) return <p className="loading">Loading from API…</p>;
  return <>{children()}</>;
}
const kvPut = (ns: string, key: string, value: unknown) => api(`/admin/kv/${ns}/${encodeURIComponent(key)}`, { method: 'PUT', body: value });
const useKv = <T,>(ns: string) => useApi<KV<T>>(`/admin/kv/${ns}`);
const useSettings = () => {
  const r = useKv<unknown>('settings');
  const merged = r.data ? Object.fromEntries((Object.keys(defaultSettings) as SettingsSection[]).map(k => [k, { ...defaultSettings[k], ...((r.data![k] as object) ?? {}) }])) as unknown as Settings : null;
  return { ...r, settings: merged };
};

function LineChart({ data, labels }: { data: number[]; labels: string[] }) {
  const W = 640, H = 200, pad = 28, max = Math.max(...data) * 1.15;
  const pts = data.map((v, i) => [pad + (i * (W - pad * 2)) / (data.length - 1), H - pad - (v / max) * (H - pad * 2)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Loops opened per day, demo data">
      <defs>
        <linearGradient id="cg" x1="0" x2="1"><stop offset="0" stopColor="#5B4CF5" /><stop offset=".6" stopColor="#5B4CF5" /><stop offset="1" stopColor="#5B4CF5" /></linearGradient>
        <linearGradient id="cf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5B4CF5" stopOpacity=".18" /><stop offset="1" stopColor="#5B4CF5" stopOpacity="0" /></linearGradient>
      </defs>
      {[0, 1, 2, 3].map(i => <line key={i} x1={pad} x2={W - pad} y1={pad + i * (H - pad * 2) / 3} y2={pad + i * (H - pad * 2) / 3} stroke="#E7E3F3" />)}
      <path d={`${line} L${pts.at(-1)![0]} ${H - pad} L${pad} ${H - pad}Z`} fill="url(#cf)" />
      <path d={line} fill="none" stroke="url(#cg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => <g key={i}><circle cx={p[0]} cy={p[1]} r="3.5" fill="#fff" stroke="#5B4CF5" strokeWidth="2" /><text x={p[0]} y={H - 8} textAnchor="middle" className="ax">{labels[i]}</text></g>)}
    </svg>
  );
}
function Bar({ v, max, tone = 'prism' }: { v: number; max: number; tone?: string }) {
  return <div className="bar"><i className={tone} style={{ width: Math.min(100, (v / max) * 100) + '%' }} /></div>;
}

/* ---------- login ---------- */
function Login() {
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState(''); const [code, setCode] = useState('');
  return <div className="login">
    <div className="login-art"><div className="brand"><Logo /><div><b>VibeLoop</b><small>Admin</small></div></div>
      <div><span className="eyebrow">Staff console</span><h2>Keep the Loop safe, fair and fun.</h2><p>Moderation, payouts, flags and platform settings — every action is written to the append-only audit log.</p></div><span /></div>
    <div className="login-form"><form onSubmit={async e => {
      e.preventDefault(); setBusy(true); setErr(null);
      try { if (ticket) await loginMfa(ticket, code); else { const r = await login(email.trim(), pw); if (r.mfaTicket) { setTicket(r.mfaTicket); setCode(''); } } }
      catch (x) { setErr((x as Error).message); if ((x as ApiError).status === 401 && ticket) setTicket(''); } finally { setBusy(false); }
    }}>
      <h1>Sign in</h1><p className="muted">Staff accounts only (owner role).</p>
      <label className="lbl" htmlFor="em">Email</label><input id="em" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@vibeloop.app" />
      <label className="lbl" htmlFor="pw">Password</label><input id="pw" type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" />
      {ticket && <><label className="lbl" htmlFor="mfa">Two-factor code</label><input id="mfa" autoFocus autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} placeholder="123456 or recovery code" /></>}
      {err && <div className="errbox" role="alert">{err}</div>}
      <button className="btn prism" disabled={busy || !email || !pw || (!!ticket && code.trim().length < 6)}>{busy ? 'Signing in…' : ticket ? 'Verify' : 'Sign in'}</button>
      <p className="note">API: <code>{API_URL}</code> · session token is kept in this tab only.</p>
    </form></div>
  </div>;
}

/* ---------- pages ---------- */
function Dashboard() {
  const ov = useApi<Overview>('/admin/overview');
  const health = useApi<{ ok: boolean; db: string; version: string }>('/health');
  const kill = useKv<{ on: boolean }>('kill');
  const audit = useApi<AuditRow[]>('/admin/audit?limit=5');
  return <Gate rs={[ov, kill, audit]}>{() => {
    const o = ov.data!; const kills = Object.values(kill.data!).filter(v => v?.on).length;
    return <>
      <div className="hero">
        <div><span className="eyebrow">Staff console</span><h2>Good morning — here’s the state of the Loop.</h2><p>Counts and queues below are live from the VibeLoop API ({health.data ? <>API v{health.data.version} · db {health.data.db}</> : health.error ? 'health check failed' : 'checking…'}). The trend chart is demo data.</p></div>
        <div className="hero-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" stroke="#EFEFF2" strokeWidth="12" fill="none" /><circle cx="60" cy="60" r="50" stroke="url(#lg2)" strokeWidth="12" fill="none" strokeDasharray="314" strokeDashoffset={314 * (1 - Math.min(1, o.creators / Math.max(1, o.users)))} strokeLinecap="round" transform="rotate(-90 60 60)" /><defs><linearGradient id="lg2"><stop offset="0" stopColor="#5B4CF5" /><stop offset=".6" stopColor="#5B4CF5" /><stop offset="1" stopColor="#5B4CF5" /></linearGradient></defs></svg><div><strong>{o.creators}</strong><span>Creators of {o.users}</span></div></div>
      </div>
      <div className="kpis">
        <Kpi label="Accounts" value={o.users.toLocaleString()} sub={`${o.creators} creators`} />
        <Kpi label="Loops" value={o.loops.toLocaleString()} sub={`${o.posts} posts`} />
        <Kpi label="Fan reactions" value={o.reactions.toLocaleString()} sub={`Gross ${inr(o.gross)} · fees ${inr(o.fees)}`} />
        <Kpi label="Kill switches engaged" value={String(kills)} sub={kills ? 'Check flags page' : 'All clear'} tone={kills ? 'bad' : 'good'} />
      </div>
      <DashConfig />
      <div className="grid g2-1">
        <Card title="Loops opened per day" extra={<Demo />}><LineChart data={[42, 51, 48, 63, 71, 66, 84]} labels={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']} /></Card>
        <Card title="Queues" extra={<LivePill />}>
          <ul className="queues">
            <li><a href="#/moderation"><Icon name="moderation" /><span>Open reports</span><b>{o.openReports}</b></a></li>
            <li><a href="#/payouts"><Icon name="payouts" /><span>Payouts awaiting approval</span><b>{o.pendingPayouts}</b></a></li>
            <li><a href="#/privacy"><Icon name="privacy" /><span>Open privacy requests</span><b>{o.pendingPrivacy}</b></a></li>
            <li><a href="#/abuse"><Icon name="abuse" /><span>Spam flags & appeals</span><b>→</b></a></li>
            <li><a href="#/incidents"><Icon name="incidents" /><span>Active incidents</span><b>→</b></a></li>
          </ul>
        </Card>
      </div>
      <Card title="Recent admin activity" extra={<a className="link" href="#/audit">Open audit log →</a>}><AuditTable rows={audit.data!} /></Card>
    </>;
  }}</Gate>;
}

function Users() {
  const [q, setQ] = useState('');
  const r = useApi<ApiUser[]>('/admin/users' + (q.trim() ? '?q=' + encodeURIComponent(q.trim()) : ''));
  const { run, busy } = useAct();
  const patch = (u: ApiUser, body: Partial<ApiUser>, msg: string) => run(() => api(`/admin/users/${u.id}`, { method: 'PATCH', body }), msg, r.reload);
  const me = getUser();
  const openId = hp('open');
  return <>{openId && <MemberDrawer id={openId} close={() => setHp('open', null)} />}<Card title={r.data ? `${r.data.length} accounts` : 'Accounts'} extra={<div className="row"><LivePill /><Search v={q} set={setQ} ph="Search name, handle, email" /></div>}>
    {r.error ? <ApiErr msg={r.error} retry={r.reload} /> : !r.data ? <p className="loading">Loading from API…</p> :
    <table><thead><tr><th>User</th><th>Role</th><th>2FA</th><th>Status</th><th>Last seen</th><th>Joined</th><th /></tr></thead><tbody>
      {r.data.map(u => <tr key={u.id} className={u.suspended ? 'dim' : ''}>
        <td><button className="who linkrow" data-member={u.id} onClick={() => setHp('open', u.id)}><MemberAvatar src={u.avatar ?? null} name={u.name} size={32} /><div><b>{u.name}</b><small>{u.handle} · {u.email}</small></div></button></td>
        <td><select value={u.role} disabled={busy || u.id === me?.id} onChange={e => patch(u, { role: e.target.value }, `${u.handle} → ${cap(e.target.value)}`)}>{ROLES.map(x => <option key={x} value={x.toLowerCase()}>{x}</option>)}</select></td>
        <td>{u.twoFactor ? <Pill tone="mint">on</Pill> : <Pill tone="gray">off</Pill>}</td>
        <td>{u.suspended ? <Pill tone="red">suspended</Pill> : <Pill tone="mint">active</Pill>}</td>
        <td className="muted small">{ago(u.lastSeenAt ?? null)}</td>
        <td className="muted">{new Date(u.createdAt).toISOString().slice(0, 10)}</td>
        <td className="r">{u.id !== me?.id && <button disabled={busy} className={'btn sm ' + (u.suspended ? 'ghost' : 'danger')} onClick={() => patch(u, { suspended: !u.suspended }, `${u.handle} ${u.suspended ? 'unsuspended' : 'suspended'}`)}>{u.suspended ? 'Unsuspend' : 'Suspend'}</button>}</td>
      </tr>)}
      {!r.data.length && <tr><td colSpan={7} className="empty">No accounts match “{q}”.</td></tr>}
    </tbody></table>}
  </Card></>;
}

function Moderation() {
  const r = useApi<Report[]>('/admin/reports');
  const st = useSettings();
  const { run, busy } = useAct();
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [codes, setCodes] = useState<Record<string, string>>({});
  return <Gate rs={[r, st]}>{() => {
    const all = r.data!; const reasons = st.settings!.moderation.reasons;
    const open = (x: Report) => x.status === 'open' || x.status === 'escalated';
    const list = all.filter(m => tab === 'all' || open(m));
    const act = (m: Report, status: 'approved' | 'removed' | 'escalated') =>
      run(() => api(`/admin/reports/${m.id}`, { method: 'PATCH', body: { status, reasonCode: codes[m.id] } }), `Report ${m.id} ${status} · ${codes[m.id]}`, r.reload);
    return <>
      <div className="kpis k3">
        <Kpi label="Open" value={String(all.filter(m => m.status === 'open').length)} />
        <Kpi label="Escalated to T&S lead" value={String(all.filter(m => m.status === 'escalated').length)} />
        <Kpi label="Resolved" value={String(all.filter(m => m.status === 'approved' || m.status === 'removed').length)} />
      </div>
      <Card title="Review queue" extra={<div className="row"><LivePill /><Tabs v={tab} set={setTab} opts={[['pending', 'Open'], ['all', 'All']]} /></div>}>
        <p className="note">Choose a reason code before approving, removing or escalating — the API rejects decisions without one. Removing hides the reported post.</p>
        <div className="mlist">{list.map(m => <div key={m.id} className="mitem">
          <div className="thumb" />
          <div className="grow"><b>{m.reason}</b><small>target <code>{m.target}</code> · reported by {m.reporter} · {when(m.at)}</small><code>{m.id}{m.reasonCode ? ' · ' + m.reasonCode : ''}</code></div>
          <St v={m.status} />
          {open(m) && <div className="row">
            <select aria-label="Reason code" value={codes[m.id] ?? ''} onChange={e => setCodes(c => ({ ...c, [m.id]: e.target.value }))}>
              <option value="">Reason code…</option>{reasons.map(x => <option key={x.code} value={x.code}>{x.code} · {x.label}</option>)}</select>
            <button className="btn sm ghost" disabled={busy || !codes[m.id]} onClick={() => act(m, 'approved')}><Icon name="check" size={14} />Approve</button>
            <button className="btn sm danger" disabled={busy || !codes[m.id]} onClick={() => act(m, 'removed')}><Icon name="x" size={14} />Remove</button>
            {m.status === 'open' && <button className="btn sm" disabled={busy || !codes[m.id]} onClick={() => act(m, 'escalated')}><Icon name="up" size={14} />Escalate</button>}
          </div>}
        </div>)}{!list.length && <p className="empty">Queue is clear.</p>}</div>
      </Card>
    </>;
  }}</Gate>;
}

function Payouts() {
  const r = useApi<ApiPayout[]>('/admin/payouts');
  const kill = useKv<{ on: boolean }>('kill');
  const { run, busy } = useAct();
  const [pending, setPending] = useState<{ id: string; decision: 'approved' | 'rejected'; token: string; tokenId: string; expiresAt: number } | null>(null);
  const request = (id: string, decision: 'approved' | 'rejected') =>
    run(() => api<{ token: string; id: string; expiresAt: number }>('/admin/approvals', { method: 'POST', body: { action: 'payout', payload: `decide:${id}:${decision}` } }), undefined,
      t => setPending({ id, decision, token: t.token, tokenId: t.id, expiresAt: t.expiresAt }));
  const confirm = () => pending && run(() => api(`/admin/payouts/${pending.id}/decide`, { method: 'POST', body: { decision: pending.decision, approvalToken: pending.token } }),
    `Payout ${pending.id} ${pending.decision}`, () => { setPending(null); r.reload(); });
  return <Gate rs={[r, kill]}>{() => {
    const killed = !!kill.data!.payouts?.on;
    const pend = r.data!.filter(p => p.status === 'pending_review');
    return <>
      {killed && <div className="banner bad">Payout kill switch is engaged — the API refuses payout decisions. Disarm it on the Flags page.</div>}
      <NotReady>Each decision needs a one-time approval token issued by the API (single use, bound to this payout and decision). No real payment rail is connected; approving records the decision and notifies the creator.</NotReady>
      <Card title="Pending approvals" extra={<LivePill />}>
        <table><thead><tr><th>ID</th><th>Creator</th><th>Amount</th><th>Requested</th><th /></tr></thead><tbody>
          {pend.map(p => <tr key={p.id}><td className="mono">{p.id}</td><td><b>{p.creator}</b></td><td className="num">{inr(p.amount)}</td><td className="muted">{when(p.at)}</td>
            <td className="r">{pending?.id === p.id ? <div className="confirm"><span>Approval token <code>{pending.tokenId}</code> · expires {when(pending.expiresAt)}</span>
              <button disabled={busy} className={'btn sm ' + (pending.decision === 'approved' ? 'prism' : 'danger')} onClick={confirm}>Confirm {pending.decision === 'approved' ? 'approve' : 'reject'}</button>
              <button className="btn sm ghost" onClick={() => setPending(null)}>Cancel</button></div>
              : <div className="row end"><button disabled={killed || busy} className="btn sm prism" onClick={() => request(p.id, 'approved')}>Approve</button><button disabled={killed || busy} className="btn sm ghost" onClick={() => request(p.id, 'rejected')}>Reject</button></div>}</td></tr>)}
          {!pend.length && <tr><td colSpan={5} className="empty">Nothing awaiting approval.</td></tr>}
        </tbody></table>
      </Card>
      <Card title="History"><table><thead><tr><th>ID</th><th>Creator</th><th>Amount</th><th>Requested</th><th>Reviewed by</th><th>Status</th></tr></thead><tbody>
        {r.data!.filter(p => p.status !== 'pending_review').map(p => <tr key={p.id}><td className="mono">{p.id}</td><td>{p.creator}</td><td className="num">{inr(p.amount)}</td><td className="muted">{when(p.at)}</td><td>{p.reviewedBy ?? '—'}</td><td><St v={p.status} /></td></tr>)}
        {!r.data!.some(p => p.status !== 'pending_review') && <tr><td colSpan={6} className="empty">No decided payouts yet.</td></tr>}
      </tbody></table></Card>
    </>;
  }}</Gate>;
}

function Health() {
  const h = useApi<{ ok: boolean; db: string; version: string }>('/health');
  const svcs = [['Loop service', 'operational', 52, 0.04], ['Render workers', 'degraded', 410, 1.8], ['AI assist', 'operational', 620, 0.3], ['Payments', 'not connected', 0, 0], ['Notifications', 'operational', 24, 0.01]] as const;
  const queues = [['render.jobs', 128, 500], ['ai.captions', 42, 300], ['moderation.scan', 17, 200], ['notify.push', 3, 1000]] as const;
  return <>
    <div className="grid g3">
      <Card className="svc"><div className="svc-h"><span className={'dot ' + (h.data?.ok ? 'ok' : h.error ? 'off' : 'warn')} /><b>VibeLoop API</b></div>
        <Pill tone={h.data?.ok ? 'mint' : h.error ? 'red' : 'gray'}>{h.data?.ok ? 'operational · live' : h.error ? 'unreachable' : 'checking'}</Pill>
        <div className="svc-m"><div><small>Database</small><b>{h.data?.db ?? '—'}</b></div><div><small>Version</small><b>{h.data?.version ?? '—'}</b></div></div>
        {h.error && <div className="errbox">{h.error}</div>}</Card>
      {svcs.map(([n, st, lat, err]) => <Card key={n} className="svc">
        <div className="svc-h"><span className={'dot ' + (st === 'operational' ? 'ok' : st === 'degraded' ? 'warn' : 'off')} /><b>{n}</b><Demo /></div>
        <Pill tone={st === 'operational' ? 'mint' : st === 'degraded' ? 'amber' : 'gray'}>{st}</Pill>
        <div className="svc-m"><div><small>p95 latency</small><b>{st === 'not connected' ? '—' : lat + ' ms'}</b></div><div><small>Error rate</small><b className={err > 1 ? 'red' : ''}>{st === 'not connected' ? '—' : err + '%'}</b></div></div>
      </Card>)}</div>
    <NotReady>Only the API card is a live probe (GET /health). The other services and queue depths are static demo samples.</NotReady>
    <Card title="Queue depths" extra={<Demo />}>{queues.map(([n, v, c]) => <div key={n} className="qrow"><code>{n}</code><Bar v={v} max={c} tone={v / c > .2 ? 'warm' : 'prism'} /><span className="num">{v} / {c}</span></div>)}</Card>
  </>;
}

function Costs() {
  const rows = [['@maradraws', 41.2, 12.8], ['@theobeats', 18.9, 30.4], ['@lenafilms', 9.3, 22.1], ['@priyacuts', 4.1, 6.6]] as const;
  const ai = rows.reduce((a, r) => a + r[1], 0), render = rows.reduce((a, r) => a + r[2], 0);
  const budget = 400, spent = ai + render;
  return <>
    <NotReady>Demo data — the backend has no cost metering yet.</NotReady>
    <div className="kpis">
      <Kpi label="AI spend (MTD)" value={money(ai)} sub="Demo data" />
      <Kpi label="Render spend (MTD)" value={money(render)} sub="Demo data" />
      <Kpi label="Monthly budget" value={money(budget)} sub={`${Math.round(spent / budget * 100)}% used · demo`} />
      <Kpi label="Projected burn" value={money(spent / 16 * 30)} sub="Demo · at current daily rate" tone={spent / 16 * 30 > budget ? 'bad' : 'good'} />
    </div>
    <Card title="Per-creator cost" extra={<Demo />}><table><thead><tr><th>Creator</th><th>AI</th><th>Render</th><th>Total</th><th style={{ width: '35%' }}>Share</th></tr></thead><tbody>
      {rows.map(([c, a, r]) => <tr key={c}><td><b>{c}</b></td><td className="num">{money(a)}</td><td className="num">{money(r)}</td><td className="num">{money(a + r)}</td><td><Bar v={a + r} max={spent} /></td></tr>)}
    </tbody></table></Card>
  </>;
}

function Flags() {
  const flag = useKv<{ on: boolean }>('flag');
  const kill = useKv<{ on: boolean }>('kill');
  const { run, busy } = useAct();
  const [arm, setArm] = useState<string | null>(null);
  return <Gate rs={[flag, kill]}>{() => {
    const isOn = (k: string, kl?: boolean) => (kl ? kill.data! : flag.data!)[k]?.on ?? DEFAULT_FLAGS.find(f => f.key === k)!.on;
    const set = (k: string, kl: boolean | undefined, on: boolean) => run(() => kvPut(kl ? 'kill' : 'flag', k, { on }), `${kl ? 'Kill switch' : 'Flag'} ${k} ${on ? (kl ? 'ENGAGED' : 'on') : 'off'}`, () => { setArm(null); (kl ? kill : flag).reload(); });
    return <div className="grid g2">
      <Card title="Feature flags" extra={<LivePill />}>{DEFAULT_FLAGS.filter(f => !f.kill).map(f => <div key={f.key} className="frow"><div className="grow"><b>{f.label}</b><small>{f.desc}</small><code>flag/{f.key}</code></div><Toggle disabled={busy} label={f.label} on={isOn(f.key)} onClick={() => set(f.key, false, !isOn(f.key))} /></div>)}</Card>
      <Card title="Emergency kill switches" className="ink">{DEFAULT_FLAGS.filter(f => f.kill).map(f => { const on = isOn(f.key, true); return <div key={f.key} className="frow"><div className="grow"><b>{f.label}</b><small>{f.desc}</small><code>kill/{f.key}</code>
        {arm === f.key && <div className="row mt"><button className="btn sm danger" disabled={busy} onClick={() => set(f.key, true, true)}>Confirm engage</button><button className="btn sm ghostd" onClick={() => setArm(null)}>Cancel</button></div>}</div>
        <Toggle danger disabled={busy} label={f.label} on={on} onClick={() => on ? set(f.key, true, false) : setArm(f.key)} /></div>; })}
        <p className="note">Engaging requires a confirm step. The API enforces the publishing and payouts switches; every change is written to the audit log.</p></Card>
    </div>;
  }}</Gate>;
}

function AuditTable({ rows }: { rows: AuditRow[] }) {
  return <table><thead><tr><th>#</th><th>Time</th><th>Actor</th><th>Action</th><th>Detail</th></tr></thead><tbody>
    {rows.map(a => <tr key={a.id}><td className="mono muted">{a.id}</td><td className="muted">{when(a.at)}</td><td>{a.actor}</td><td><code className={a.action.startsWith('kill') ? 'redc' : ''}>{a.action}</code></td><td className="small">{a.detail}</td></tr>)}
    {!rows.length && <tr><td colSpan={5} className="empty">No entries.</td></tr>}
  </tbody></table>;
}
function Audit() {
  const [q, setQ] = useState('');
  const r = useApi<AuditRow[]>('/admin/audit' + (q.trim() ? '?q=' + encodeURIComponent(q.trim()) : ''));
  return <Card title={r.data ? `${r.data.length} entries · append-only` : 'Audit log'} extra={<div className="row"><LivePill /><Search v={q} set={setQ} ph="Search action, detail, actor" /></div>}>
    <p className="note">Server-side search over the persistent audit log (latest 200). Entries cannot be edited or deleted from this console.</p>
    {r.error ? <ApiErr msg={r.error} retry={r.reload} /> : !r.data ? <p className="loading">Loading from API…</p> : <AuditTable rows={r.data} />}</Card>;
}

function Privacy() {
  const r = useApi<PrivacyReq[]>('/admin/privacy');
  const st = useSettings();
  const { run, busy } = useAct();
  const [days, setDays] = useState<number | null>(null);
  const [dry, setDry] = useState<{ days: number; wouldDelete: Record<string, number>; at: number } | null>(null);
  return <Gate rs={[r, st]}>{() => {
    const saved = st.settings!.privacy.retentionDays; const d = days ?? saved;
    return <div className="grid g2-1">
      <Card title="Data subject requests" extra={<LivePill />}><table><thead><tr><th>ID</th><th>User</th><th>Type</th><th>Received</th><th>Status</th><th /></tr></thead><tbody>
        {r.data!.map(x => <tr key={x.id}><td className="mono">{x.id}</td><td>{x.user}</td><td><Pill tone={x.kind.includes('delet') ? 'red' : 'violet'}>{x.kind}</Pill></td><td className="muted">{when(x.at)}</td><td><St v={x.status} /></td>
          <td className="r">{x.status === 'pending' && <div className="row end"><button disabled={busy} className="btn sm prism" onClick={() => run(() => api(`/admin/privacy/${x.id}/fulfil`, { method: 'POST' }), `${x.id} fulfilled`, r.reload)}>Fulfil</button><button disabled={busy} className="btn sm ghost" onClick={() => run(() => api(`/admin/privacy/${x.id}/reject`, { method: 'POST' }), `${x.id} rejected`, r.reload)}>Reject</button></div>}</td></tr>)}
        {!r.data!.length && <tr><td colSpan={6} className="empty">No privacy requests. Users file them from the mobile app’s privacy settings.</td></tr>}
      </tbody></table></Card>
      <Card title="Retention policy">
        <label className="lbl">Delete hidden posts & read notices after</label>
        <div className="row"><input type="range" min={30} max={365} step={15} value={d} onChange={e => setDays(+e.target.value)} /><b className="num">{d} days</b></div>
        <div className="row mt"><button className="btn sm" disabled={busy || d === saved} onClick={() => run(() => kvPut('settings', 'privacy', { ...st.settings!.privacy, retentionDays: d }), `Retention set to ${d} days`, () => { setDays(null); st.reload(); })}>Save policy</button>
          <button className="btn sm prism" disabled={busy} onClick={() => run(() => api<{ days: number; wouldDelete: Record<string, number> }>('/admin/retention/dry-run', { method: 'POST', body: { days: d } }), 'Dry-run complete', x => setDry({ ...x, at: Date.now() }))}>Run dry-run</button></div>
        {dry && <div className="dry"><b>Dry-run result · {dry.days}-day policy</b><span>{Object.entries(dry.wouldDelete).map(([k, v]) => `${v} ${k}`).join(' · ')} would be purged. Nothing was deleted.</span><small>{when(dry.at)}</small></div>}
        <p className="note">Saved to <code>settings/privacy</code>. Dry-runs are computed by the API and audited; real deletion jobs are not enabled.</p>
      </Card>
    </div>;
  }}</Gate>;
}

/* ===================== Trust & safety (live API) ===================== */
type SpamFlagRow = { id: number; kind: string; detail: string; status: string; at: number; user: { id: string; handle: string; name: string; suspended: boolean; restrictedUntil: number | null; score: number; why: string[] } };
type Watch = { id: string; handle: string; name: string; score: number; why: string[] };
function Abuse() {
  const [status, setStatus] = useState('open');
  const r = useApi<{ flags: SpamFlagRow[]; watchlist: Watch[] }>('/admin/spam?status=' + status); const { run, busy } = useAct();
  const act = (f: SpamFlagRow, action: string) => run(() => api(`/admin/spam/${f.id}`, { method: 'POST', body: { action } }), `${f.user.handle}: ${action}`, r.reload);
  const Score = ({ v }: { v: number }) => <div className="score" style={{ ['--p' as string]: v }}><span>{v}</span></div>;
  return <>
    <p className="note">Rules and limits live in <a className="link" href="#/userapp">User App Settings → Global → spam.*</a>: new-account chat limit, bulk same-text detection, auto-restrict.</p>
    <div className="grid g2">
      <Card title="Spam flags" extra={<div className="row"><LivePill /><select value={status} onChange={e => setStatus(e.target.value)}>{['open', 'actioned', 'cleared', 'all'].map(x => <option key={x}>{x}</option>)}</select></div>}>
        {r.error ? <ApiErr msg={r.error} retry={r.reload} /> : !r.data ? <p className="loading">Loading…</p> : <div className="mlist">
          {r.data.flags.map(f => <div key={f.id} className="mitem"><Score v={f.user.score} />
            <div className="grow"><b>{f.user.handle}</b> <small className="muted">{f.kind.replace(/_/g, ' ')} · {ago(f.at)}</small><small>{f.detail}</small><small className="muted">{f.user.why.join(' · ')}</small>
              <div className="row mt">{f.user.suspended ? <Pill tone="red">suspended</Pill> : f.user.restrictedUntil ? <Pill tone="amber">restricted</Pill> : null}<St v={f.status} /></div></div>
            {f.status === 'open' && <div className="row"><button className="btn sm ghost" disabled={busy} onClick={() => act(f, 'clear')}>Clear</button><button className="btn sm ghost" disabled={busy} onClick={() => act(f, 'restrict')}>Restrict 7d</button><button className="btn sm danger" disabled={busy} onClick={() => act(f, 'suspend')}>Suspend</button></div>}
          </div>)}
          {!r.data.flags.length && <p className="empty">No {status} flags.</p>}
        </div>}
      </Card>
      <Card title="Watchlist · new accounts (7 days) scoring ≥ 40">
        {!r.data ? <p className="loading">Loading…</p> : <div className="mlist">{r.data.watchlist.map(w => <div key={w.id} className="mitem"><Score v={w.score} /><div className="grow"><b>{w.handle}</b><small>{w.why.join(' · ')}</small></div><a className="btn sm ghost" href={`#/users?open=${w.id}`}>Open</a></div>)}
          {!r.data.watchlist.length && <p className="empty">Nobody suspicious right now.</p>}</div>}
      </Card>
    </div>
  </>;
}

type AppealRow = { id: string; kind: string; target: string; reason: string; status: string; note: string; at: number; decidedAt: number | null; user: { id: string; handle: string; name: string; suspended: boolean }; content?: { text?: string; media?: string | null; mediaId?: string; kind?: string; status?: string; note?: string } };
function Appeals() {
  const [status, setStatus] = useState('open'); const r = useApi<AppealRow[]>('/admin/appeals?status=' + status); const { run, busy } = useAct();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const decide = (a: AppealRow, decision: 'uphold' | 'reverse') => run(() => api(`/admin/appeals/${a.id}/decide`, { method: 'POST', body: { decision, note: notes[a.id] ?? '' } }), `Appeal ${decision === 'reverse' ? 'reversed' : 'upheld'}`, r.reload);
  const what: Record<string, string> = { ban: 'Account suspension', post: 'Removed post', media: 'Blocked file', restrict: 'Spam restriction' };
  return <Card title={r.data ? `${r.data.length} ${status} appeals` : 'Appeals'} extra={<div className="row"><LivePill /><select value={status} onChange={e => setStatus(e.target.value)}>{['open', 'upheld', 'reversed', 'all'].map(x => <option key={x}>{x}</option>)}</select></div>}>
    <p className="note">Members appeal from the app (Account standing). Reversing lifts the suspension or restriction, restores the post, or clears the file. The member is notified either way.</p>
    {r.error ? <ApiErr msg={r.error} retry={r.reload} /> : !r.data ? <p className="loading">Loading…</p> : <div className="mlist">
      {r.data.map(a => <div key={a.id} className="mitem" style={{ alignItems: 'flex-start' }}>
        <div className="grow"><b>{what[a.kind] ?? a.kind}</b> <small className="muted">· {a.user.handle} · {ago(a.at)}</small>
          <p style={{ margin: '6px 0' }}>“{a.reason}”</p>
          {a.content?.text ? <small className="muted">Post: {a.content.text.slice(0, 200) || '(no text)'}</small> : null}
          {a.content?.mediaId ? <small className="muted">File {a.content.mediaId} · {a.content.kind} · {a.content.note}</small> : null}
          {a.status === 'open' ? <input style={{ marginTop: 8, width: '100%' }} placeholder="Note to the member (optional)" value={notes[a.id] ?? ''} onChange={e => setNotes({ ...notes, [a.id]: e.target.value })} /> : <small>Decision: <St v={a.status} /> {a.note}</small>}
        </div>
        {a.status === 'open' && <div className="row"><button className="btn sm ghost" disabled={busy} onClick={() => decide(a, 'uphold')}>Keep decision</button><button className="btn sm prism" disabled={busy} onClick={() => decide(a, 'reverse')}>Reverse</button></div>}
      </div>)}
      {!r.data.length && <p className="empty">No {status} appeals.</p>}
    </div>}
  </Card>;
}

/** Image/video preview for held media — fetched with the staff token (held files aren't public). */
function HeldMedia({ url, kind }: { url: string; kind: string }) {
  const [src, setSrc] = useState<string | null>(null); const [show, setShow] = useState(false);
  useEffect(() => { if (!show) return; let u = ''; fetch(API_URL + url, { headers: { Authorization: 'Bearer ' + getToken() } }).then(r => r.ok ? r.blob() : null).then(b => { if (b) { u = URL.createObjectURL(b); setSrc(u); } }); return () => { if (u) URL.revokeObjectURL(u); }; }, [show, url]);
  if (!show) return <button className="btn sm ghost" onClick={() => setShow(true)}>Show (blurred)</button>;
  if (!src) return <small className="muted">Loading…</small>;
  return kind === 'video' ? <video src={src} controls style={{ maxWidth: 220, filter: 'blur(14px)' }} onClick={e => ((e.target as HTMLElement).style.filter = 'none')} />
    : <img src={src} alt="held upload" style={{ maxWidth: 220, filter: 'blur(14px)', cursor: 'pointer' }} onClick={e => ((e.target as HTMLElement).style.filter = 'none')} />;
}
type ScanRow = { id: string; owner: string; kind: string; mime: string; size: number; status: string; note: string | null; sha256: string | null; at: number; url: string };
function ScanQueue() {
  const [status, setStatus] = useState('pending'); const r = useApi<ScanRow[]>('/admin/scan-queue?status=' + status);
  const hl = useApi<{ sha256: string; label: string; addedBy: string; at: number }[]>('/admin/hash-blocklist'); const { run, busy } = useAct();
  const [hash, setHash] = useState(''); const [label, setLabel] = useState('');
  const verdict = (m: ScanRow, v: 'clean' | 'blocked', list = false) => run(() => api(`/admin/media/${m.id}/scan`, { method: 'POST', body: { verdict: v, addToBlocklist: list, label: list ? 'moderator block' : '' } }), v === 'clean' ? 'Cleared' : 'Blocked', () => { r.reload(); hl.reload(); });
  return <>
    <p className="note">With <a className="link" href="#/userapp">safety.scanUploads</a> on, new uploads are held until the <a className="link" href="#/plugs">Scanner plug</a> clears them or a moderator does here. Files on the hash blocklist are always refused, and an incident is opened.</p>
    <div className="grid g2-1">
      <Card title={r.data ? `${r.data.length} ${status}` : 'Scan Queue'} extra={<div className="row"><LivePill /><select value={status} onChange={e => setStatus(e.target.value)}>{['pending', 'blocked', 'all'].map(x => <option key={x}>{x}</option>)}</select></div>}>
        {r.error ? <ApiErr msg={r.error} retry={r.reload} /> : !r.data ? <p className="loading">Loading…</p> : <div className="mlist">
          {r.data.map(m => <div key={m.id} className="mitem" style={{ alignItems: 'flex-start' }}>
            <HeldMedia url={m.url} kind={m.kind} />
            <div className="grow"><b>{m.owner}</b> <small className="muted">{m.kind} · {(m.size / 1024).toFixed(0)} KB · {ago(m.at)}</small><small>{m.note}</small><small className="mono muted">{m.sha256?.slice(0, 24)}…</small><St v={m.status} /></div>
            <div className="row">{m.status !== 'clean' && <button className="btn sm ghost" disabled={busy} onClick={() => verdict(m, 'clean')}>Clear</button>}{m.status !== 'blocked' && <><button className="btn sm danger" disabled={busy} onClick={() => verdict(m, 'blocked')}>Block</button><button className="btn sm danger" disabled={busy} onClick={() => verdict(m, 'blocked', true)}>Block + blocklist</button></>}</div>
          </div>)}
          {!r.data.length && <p className="empty">Nothing {status}.</p>}
        </div>}
      </Card>
      <Card title={`Hash blocklist${hl.data ? ` · ${hl.data.length}` : ''}`}>
        <div className="row"><input placeholder="SHA-256 (64 hex)" value={hash} onChange={e => setHash(e.target.value.trim())} className="mono" /><input placeholder="Label" value={label} onChange={e => setLabel(e.target.value)} />
          <button className="btn sm prism" disabled={busy || !/^[0-9a-fA-F]{64}$/.test(hash)} onClick={() => run(() => api<{ matchedExisting: number }>('/admin/hash-blocklist', { method: 'POST', body: { sha256: hash, label } }), 'Added', x => { setHash(''); setLabel(''); hl.reload(); r.reload(); if (x?.matchedExisting) alert(`${x.matchedExisting} stored file(s) matched and were blocked`); })}>Add</button></div>
        <div className="mlist mt">{hl.data?.map(h => <div key={h.sha256} className="mitem"><div className="grow"><code className="mono">{h.sha256.slice(0, 20)}…</code><small>{h.label} · {h.addedBy} · {ago(h.at)}</small></div><button className="btn sm ghost" disabled={busy} onClick={() => run(() => api(`/admin/hash-blocklist/${h.sha256}`, { method: 'DELETE' }), 'Removed', hl.reload)}>Remove</button></div>)}</div>
      </Card>
    </div>
  </>;
}

type IncidentRow = { id: string; severity: string; kind: string; title: string; detail: string; status: string; userId: string | null; timeline: { at: number; by: string; note: string }[]; at: number; resolvedAt: number | null };
function Incidents() {
  const [status, setStatus] = useState('active'); const r = useApi<IncidentRow[]>('/admin/incidents?status=' + status); const { run, busy } = useAct();
  const [f, setF] = useState({ title: '', severity: 'medium', detail: '' }); const [notes, setNotes] = useState<Record<string, string>>({});
  const tone: Record<string, string> = { critical: 'red', high: 'red', medium: 'amber', low: 'gray' };
  const upd = (i: IncidentRow, body: Record<string, string>) => run(() => api(`/admin/incidents/${i.id}`, { method: 'PATCH', body: { ...body, note: notes[i.id] ?? '' } }), 'Updated', () => { setNotes({ ...notes, [i.id]: '' }); r.reload(); });
  return <>
    <p className="note">Playbooks: <code>docs/RUNBOOK.md</code>. Auto-opened for blocklisted uploads, scanner child-safety flags and mass-messaging waves.</p>
    <div className="grid g2-1">
      <Card title={r.data ? `${r.data.length} ${status} incidents` : 'Incidents'} extra={<div className="row"><LivePill /><select value={status} onChange={e => setStatus(e.target.value)}>{['active', 'open', 'investigating', 'resolved', 'all'].map(x => <option key={x}>{x}</option>)}</select></div>}>
        {r.error ? <ApiErr msg={r.error} retry={r.reload} /> : !r.data ? <p className="loading">Loading…</p> : <div className="mlist">
          {r.data.map(i => <div key={i.id} className="mitem" style={{ alignItems: 'flex-start' }}>
            <div className="grow"><div className="row"><Pill tone={tone[i.severity] ?? 'gray'}>{i.severity}</Pill><b>{i.title}</b><St v={i.status} /></div>
              <small className="muted">{i.kind} · opened {ago(i.at)}{i.userId ? ` · user ${i.userId}` : ''}</small>{i.detail && <small style={{ whiteSpace: 'pre-wrap' }}>{i.detail}</small>}
              <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 16 }}>{i.timeline.map((t, k) => <li key={k}><span className="muted">{when(t.at)} · {t.by}:</span> {t.note}</li>)}</ul>
              {i.status !== 'resolved' && <div className="row mt"><input placeholder="Timeline note" value={notes[i.id] ?? ''} onChange={e => setNotes({ ...notes, [i.id]: e.target.value })} style={{ flex: 1 }} />
                <button className="btn sm ghost" disabled={busy || !(notes[i.id] ?? '').trim()} onClick={() => upd(i, {})}>Add note</button>
                {i.status === 'open' && <button className="btn sm ghost" disabled={busy} onClick={() => upd(i, { status: 'investigating' })}>Investigating</button>}
                <button className="btn sm prism" disabled={busy} onClick={() => upd(i, { status: 'resolved' })}>Resolve</button></div>}
            </div>
          </div>)}
          {!r.data.length && <p className="empty">No {status} incidents.</p>}
        </div>}
      </Card>
      <Card title="Open an incident">
        <label className="lbl">Title</label><input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="What's happening" />
        <label className="lbl">Severity</label><select value={f.severity} onChange={e => setF({ ...f, severity: e.target.value })}>{['low', 'medium', 'high', 'critical'].map(x => <option key={x}>{x}</option>)}</select>
        <label className="lbl">Details</label><textarea rows={4} value={f.detail} onChange={e => setF({ ...f, detail: e.target.value })} />
        <button className="btn prism mt" disabled={busy || f.title.trim().length < 3} onClick={() => run(() => api('/admin/incidents', { method: 'POST', body: f }), 'Incident opened', () => { setF({ title: '', severity: 'medium', detail: '' }); r.reload(); })}>Open incident</button>
      </Card>
    </div>
  </>;
}

function Revenue() {
  const ov = useApi<Overview>('/admin/overview');
  const st = useSettings();
  const { run, busy } = useAct();
  const months = [['Jul', 18200], ['Aug', 22400], ['Sep', 25100], ['Oct', 31800], ['Nov (MTD)', 16900]] as const;
  const max = Math.max(...months.map(m => m[1]));
  return <Gate rs={[ov, st]}>{() => {
    const o = ov.data!; const fee = st.settings!.monetisation.feePct;
    return <>
      <div className="kpis">
        <Kpi label="Gross creator sales" value={inr(o.gross)} sub="Live · all time" />
        <Kpi label="Platform fee" value={fee + '%'} sub="settings/monetisation" />
        <Kpi label="Platform fees collected" value={inr(o.fees)} sub="Live · all time" />
        <Kpi label="Paid to creators" value={inr(o.gross - o.fees)} sub="Live · gross − fees" />
      </div>
      <div className="grid g2-1">
        <Card title="Monthly report" extra={<Demo />}><div className="vbars">{months.map(([m, v]) => <div key={m}><span className="num">{money(v * fee / 100)}</span><i style={{ height: (v / max) * 160 }} /><small>{m}</small></div>)}</div></Card>
        <Card title="Platform fee">
          <div className="fee">{[5, 8, 10, 12, 15].map(p => <button key={p} disabled={busy} className={'btn ' + (fee === p ? 'prism' : 'ghost')} onClick={() => p !== fee && run(() => kvPut('settings', 'monetisation', { ...st.settings!.monetisation, feePct: p }), `Platform fee set to ${p}%`, st.reload)}>{p}%</button>)}</div>
          <p className="note">Saved to <code>settings/monetisation</code> and audited. The monthly chart is demo data; billing integration is not connected.</p>
        </Card>
      </div>
    </>;
  }}</Gate>;
}

function Announcements() {
  const r = useApi<ApiAnnouncement[]>('/admin/announcements');
  const { run, busy } = useAct();
  const [t, setT] = useState(''); const [b, setB] = useState(''); const [aud, setAud] = useState('all');
  return <div className="grid g1-2">
    <Card title="Compose">
      <label className="lbl">Title</label><input value={t} onChange={e => setT(e.target.value)} placeholder="e.g. Scheduled maintenance Friday" />
      <label className="lbl">Message</label><textarea rows={5} value={b} onChange={e => setB(e.target.value)} placeholder="What should people know?" />
      <label className="lbl">Audience</label><Tabs v={aud} set={setAud} opts={[['all', 'Everyone'], ['creators', 'Creators'], ['fans', 'Fans'], ['staff', 'Staff']]} />
      <button className="btn prism mt" disabled={busy || !t.trim() || !b.trim()} onClick={() => run(() => api('/admin/announcements', { method: 'POST', body: { title: t.trim(), body: b.trim(), audience: aud } }), 'Broadcast sent', () => { setT(''); setB(''); r.reload(); })}><Icon name="announcements" size={16} />Broadcast</button>
      <p className="note">Broadcasting creates an in-app notice for every non-staff user. Push/email delivery is not connected.</p>
    </Card>
    <Card title="Broadcasts" extra={<LivePill />}>{r.error ? <ApiErr msg={r.error} retry={r.reload} /> : !r.data ? <p className="loading">Loading from API…</p> :
      <>{r.data.map(a => <div key={a.id} className="ann"><div className="row"><b>{a.title}</b><Pill tone="violet">{a.audience}</Pill></div><p>{a.body}</p><small>{a.by} · {when(a.at)}</small></div>)}
        {!r.data.length && <p className="empty">No broadcasts yet.</p>}</>}</Card>
  </div>;
}

function Roles() {
  const r = useKv<{ perms: string[] }>('roles');
  const { run, busy } = useAct();
  return <Gate rs={[r]}>{() => {
    const perms = (role: Role) => r.data![role]?.perms ?? DEFAULT_MATRIX[role];
    return <Card title="Role × permission matrix" extra={<div className="row"><LivePill /><span className="muted small">Click a cell to grant or revoke</span></div>}>
      <div className="mx"><table><thead><tr><th>Permission</th>{ROLES.map(x => <th key={x} className="c">{x}</th>)}</tr></thead><tbody>
        {PERMS.map(p => <tr key={p}><td><b>{p}</b></td>{ROLES.map(role => { const cur = perms(role); const on = cur.includes(p); return <td key={role} className="c">
          <button aria-label={`${role} ${p}`} aria-pressed={on} className={'cell' + (on ? ' on' : '')} disabled={role === 'Owner' || busy}
            onClick={() => run(() => kvPut('roles', role, { perms: on ? cur.filter(x => x !== p) : [...cur, p] }), `${role}: ${on ? 'revoked' : 'granted'} ${p}`, r.reload)}>{on && <Icon name="check" size={14} />}</button></td>; })}</tr>)}
      </tbody></table></div>
      <p className="note">Saved per role to <code>roles/&lt;Role&gt;</code>. Owner always holds every permission (locked).</p>
    </Card>;
  }}</Gate>;
}

/* ---------- settings ---------- */
const SET_SECTIONS: [SettingsSection, string, string][] = [
  ['general', 'General', 'Name, tagline, language, maintenance'], ['security', 'Security', 'Passwords, MFA, sessions, passkeys'],
  ['moderation', 'Moderation', 'Auto-hold, reason codes, comment guard'], ['monetisation', 'Monetisation', 'Fees, payouts, currencies'],
  ['notifications', 'Notifications', 'Push & email categories, quiet hours'], ['content', 'Content', 'Uploads, types, labelling, Loop Score'],
  ['privacy', 'Privacy', 'Retention, teen space, DSAR SLA'], ['integrations', 'Integrations', 'OAuth & sign-in providers'],
  ['branding', 'Branding', 'Accent colour tokens'], ['admins', 'Admins', 'Staff accounts & roles'],
];
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="frow"><div className="grow"><b>{label}</b>{hint && <small>{hint}</small>}</div><div className="fctl">{children}</div></div>;
}
function Chips({ items, set, ph, mono }: { items: string[]; set: (v: string[]) => void; ph: string; mono?: boolean }) {
  const [v, setV] = useState('');
  const add = () => { const t = v.trim(); if (t && !items.includes(t)) set([...items, t]); setV(''); };
  return <div className="chips">{items.map(w => <span key={w} className={'chip' + (mono ? ' mono' : '')}>{w}<button aria-label={'Remove ' + w} onClick={() => set(items.filter(x => x !== w))}><Icon name="x" size={12} /></button></span>)}
    <input value={v} onChange={e => setV(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder={ph} /><button className="btn sm ghost" onClick={add} disabled={!v.trim()}>Add</button></div>;
}
type Sec<K extends SettingsSection> = { v: Settings[K]; set: (p: Partial<Settings[K]>) => void };

function SGeneral({ v, set }: Sec<'general'>) {
  return <>
    <label className="lbl">Platform name</label><input className="wide" value={v.name} onChange={e => set({ name: e.target.value })} />
    <label className="lbl">Tagline</label><input className="wide" value={v.tagline} onChange={e => set({ tagline: e.target.value })} />
    <label className="lbl">Default language</label>
    <select value={v.language} onChange={e => set({ language: e.target.value })}>{['English (India)', 'English (US)', 'हिन्दी (Hindi)', 'தமிழ் (Tamil)', 'తెలుగు (Telugu)', 'বাংলা (Bengali)', 'मराठी (Marathi)', 'ಕನ್ನಡ (Kannada)'].map(l => <option key={l}>{l}</option>)}</select>
    <div className="mt" />
    <Field label="Maintenance mode" hint="Shows a maintenance screen to every non-staff user and pauses publishing.">
      {v.maintenance && <Pill tone="red">on</Pill>}<Toggle danger label="Maintenance mode" on={v.maintenance} onClick={() => set({ maintenance: !v.maintenance })} /></Field>
    <div className="preview-brand"><Logo /><div><b>{v.name || '—'}</b><small>{v.tagline}</small></div></div>
  </>;
}
function SSecurity({ v, set }: Sec<'security'>) {
  return <>
    <Field label="Minimum password length" hint="Applies at next password change."><input type="number" min={8} max={64} value={v.minLength} onChange={e => set({ minLength: +e.target.value })} /> <span className="muted">chars</span></Field>
    <Field label="Require symbols & mixed case"><Toggle label="Require symbols" on={v.requireSymbols} onClick={() => set({ requireSymbols: !v.requireSymbols })} /></Field>
    <Field label="Forced rotation" hint="NIST guidance: avoid forced rotation unless compromise is suspected."><select value={v.rotationDays} onChange={e => set({ rotationDays: +e.target.value })}>{[0, 90, 180, 365].map(d => <option key={d} value={d}>{d ? d + ' days' : 'Never'}</option>)}</select></Field>
    <Field label="Session timeout" hint="Idle staff and creator sessions sign out after this."><select value={v.sessionMins} onChange={e => set({ sessionMins: +e.target.value })}>{[15, 30, 60, 240, 720].map(m => <option key={m} value={m}>{m < 60 ? m + ' min' : m / 60 + ' h'}</option>)}</select></Field>
    <Field label="Passkeys (WebAuthn)" hint="Allow passwordless sign-in with device passkeys."><Toggle label="Passkeys" on={v.passkeys} onClick={() => set({ passkeys: !v.passkeys })} /></Field>
    <label className="lbl">MFA enforcement per role</label>
    <div className="rolegrid">{Object.entries(v.mfa).map(([r, on]) => <div key={r} className="rolecell"><span>{r}</span><Toggle label={'MFA ' + r} on={on} onClick={() => set({ mfa: { ...v.mfa, [r]: !on } })} /></div>)}</div>
  </>;
}
function SModeration({ v, set }: Sec<'moderation'>) {
  const [code, setCode] = useState(''); const [label, setLabel] = useState('');
  return <>
    <label className="lbl">Auto-hold when reports reach</label>
    <div className="row"><input type="range" min={1} max={20} value={v.holdReports} onChange={e => set({ holdReports: +e.target.value })} /><b className="num">{v.holdReports} reports</b></div>
    <label className="lbl">Auto-hold when classifier risk score ≥</label>
    <div className="row"><input type="range" min={50} max={99} value={v.holdRisk} onChange={e => set({ holdRisk: +e.target.value })} /><b className="num">{v.holdRisk} / 100</b></div>
    <label className="lbl">Reason codes</label>
    <table><thead><tr><th>Code</th><th>Label</th><th /></tr></thead><tbody>
      {v.reasons.map((r, i) => <tr key={r.code}><td><code>{r.code}</code></td><td><input className="wide" value={r.label} onChange={e => set({ reasons: v.reasons.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} /></td>
        <td className="r"><button className="btn sm danger" onClick={() => set({ reasons: v.reasons.filter((_, j) => j !== i) })}>Remove</button></td></tr>)}
      <tr><td><input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="R-NEW" /></td><td><input className="wide" value={label} onChange={e => setLabel(e.target.value)} placeholder="Description" /></td>
        <td className="r"><button className="btn sm ghost" disabled={!code.trim() || !label.trim() || v.reasons.some(r => r.code === code.trim())} onClick={() => { set({ reasons: [...v.reasons, { code: code.trim(), label: label.trim() }] }); setCode(''); setLabel(''); }}>Add code</button></td></tr>
    </tbody></table>
    <label className="lbl">Comment guard — blocked phrases</label>
    <Chips items={v.guardWords} set={w => set({ guardWords: w })} ph="Add phrase, press Enter" />
  </>;
}
function SMonetisation({ v, set }: Sec<'monetisation'>) {
  return <>
    <Field label="Platform fee" hint="Applies to new sales only. Mirrors the Revenue page."><input type="number" min={0} max={30} value={v.feePct} onChange={e => set({ feePct: +e.target.value })} /> <span className="muted">%</span></Field>
    <Field label="Minimum payout" hint="Creators can request a payout above this balance."><span className="muted">$</span><input type="number" min={1} value={v.minPayout} onChange={e => set({ minPayout: +e.target.value })} /></Field>
    <Field label="Payout schedule"><select value={v.schedule} onChange={e => set({ schedule: e.target.value })}>{['Weekly (Monday)', 'Bi-weekly', 'Monthly (1st)', 'On request'].map(x => <option key={x}>{x}</option>)}</select></Field>
    <label className="lbl">Supported currencies</label>
    <div className="row">{['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'].map(c => { const on = v.currencies.includes(c); return <button key={c} className={'btn sm ' + (on ? 'prism' : 'ghost')} onClick={() => set({ currencies: on ? v.currencies.filter(x => x !== c) : [...v.currencies, c] })}>{c}</button>; })}</div>
    <NotReady>Payment rail not connected — these settings are recorded but no money moves until the payments backend is live.</NotReady>
  </>;
}
function SNotifications({ v, set }: Sec<'notifications'>) {
  const cats = Array.from(new Set([...Object.keys(v.push), ...Object.keys(v.email)]));
  return <>
    <table><thead><tr><th>Category</th><th className="c">Push</th><th className="c">Email</th></tr></thead><tbody>
      {cats.map(c => <tr key={c}><td><b>{c}</b></td>
        <td className="c">{c in v.push ? <Toggle label={'Push ' + c} on={v.push[c]} onClick={() => set({ push: { ...v.push, [c]: !v.push[c] } })} /> : <span className="muted">—</span>}</td>
        <td className="c">{c in v.email ? <Toggle label={'Email ' + c} on={v.email[c]} onClick={() => set({ email: { ...v.email, [c]: !v.email[c] } })} /> : <span className="muted">—</span>}</td></tr>)}
    </tbody></table>
    <div className="mt" />
    <Field label="Quiet hours" hint="Non-urgent push is held during this window (user local time). Security alerts always deliver.">
      <input type="time" value={v.quietFrom} disabled={!v.quietOn} onChange={e => set({ quietFrom: e.target.value })} /><span className="muted">to</span><input type="time" value={v.quietTo} disabled={!v.quietOn} onChange={e => set({ quietTo: e.target.value })} />
      <Toggle label="Quiet hours" on={v.quietOn} onClick={() => set({ quietOn: !v.quietOn })} /></Field>
    <NotReady>Push/email delivery needs the notification backend; defaults are stored only.</NotReady>
  </>;
}
function SContent({ v, set }: Sec<'content'>) {
  return <>
    <label className="lbl">Maximum upload size</label>
    <div className="row"><input type="range" min={50} max={2048} step={50} value={v.maxUploadMb} onChange={e => set({ maxUploadMb: +e.target.value })} /><b className="num">{v.maxUploadMb >= 1024 ? (v.maxUploadMb / 1024).toFixed(1) + ' GB' : v.maxUploadMb + ' MB'}</b></div>
    <label className="lbl">Allowed file types</label>
    <div className="rolegrid">{Object.entries(v.types).map(([t, on]) => <div key={t} className="rolecell"><span>{t}</span><Toggle label={t} on={on} onClick={() => set({ types: { ...v.types, [t]: !on } })} /></div>)}</div>
    <div className="mt" />
    <Field label="Synthetic-media labelling required" hint="AI-generated or AI-altered media must carry a visible “Made with AI” label before release."><Toggle label="Synthetic labelling" on={v.syntheticLabel} onClick={() => set({ syntheticLabel: !v.syntheticLabel })} /></Field>
    <label className="lbl">Minimum Loop Score for public release</label>
    <div className="row"><input type="range" min={0} max={100} value={v.minLoopScore} onChange={e => set({ minLoopScore: +e.target.value })} /><b className="num">{v.minLoopScore}</b></div>
    <p className="note">Loops scoring below this stay in private testing until the creator revises them.</p>
  </>;
}
function SPrivacy({ v, set }: Sec<'privacy'>) {
  return <>
    <label className="lbl">Data retention for inactive raw uploads</label>
    <div className="row"><input type="range" min={30} max={365} step={15} value={v.retentionDays} onChange={e => set({ retentionDays: +e.target.value })} /><b className="num">{v.retentionDays} days</b></div>
    <Field label="DSAR response SLA" hint="Deadline for access/deletion requests. GDPR max is 30 days; DPDP (India) rules may be shorter."><input type="number" min={1} max={45} value={v.dsarSlaDays} onChange={e => set({ dsarSlaDays: +e.target.value })} /> <span className="muted">days</span></Field>
    <label className="lbl">Teen space protections (under 18)</label>
    <Field label="DMs from non-followers off" hint="Adults the teen does not follow cannot message them."><Toggle label="Teen DMs" on={v.teenDmOff} onClick={() => set({ teenDmOff: !v.teenDmOff })} /></Field>
    <Field label="Private account by default"><Toggle label="Teen private" on={v.teenPrivateDefault} onClick={() => set({ teenPrivateDefault: !v.teenPrivateDefault })} /></Field>
    <Field label="No precise location tagging"><Toggle label="Teen location" on={v.teenNoLocation} onClick={() => set({ teenNoLocation: !v.teenNoLocation })} /></Field>
  </>;
}
function SIntegrations({ v, set }: Sec<'integrations'>) {
  return <>
    <NotReady>No OAuth provider has credentials configured in this environment. “Enabled” only controls whether the button would be offered once connected.</NotReady>
    <table className="mt"><thead><tr><th>Provider</th><th>Connection</th><th className="c">Offer at sign-in</th></tr></thead><tbody>
      {v.providers.map((p, i) => <tr key={p.key}><td><b>{p.label}</b><small className="mono">{p.key}</small></td>
        <td>{p.connected ? <Pill tone="mint">connected</Pill> : <Pill tone="gray">not connected</Pill>}</td>
        <td className="c"><Toggle label={p.label} on={p.enabled} onClick={() => set({ providers: v.providers.map((x, j) => j === i ? { ...x, enabled: !x.enabled } : x) })} /></td></tr>)}
    </tbody></table>
  </>;
}
function SBranding({ v, set }: Sec<'branding'>) {
  const keys = Object.keys(v) as (keyof Settings['branding'])[];
  return <>
    <div className="swatches">{keys.map(k => <label key={k} className="swatch"><i style={{ background: v[k] }} /><div><b>--{k}</b><small className="mono">{v[k].toUpperCase()}</small></div>
      <input type="color" value={v[k]} onChange={e => set({ [k]: e.target.value })} aria-label={k} /></label>)}</div>
    <label className="lbl">Preview</label>
    <div className="bpreview" style={{ ['--bp' as string]: `linear-gradient(135deg, ${v.violet}, ${v.pink} 60%, ${v.tangerine})` }}>
      <div className="bp-hero"><span style={{ color: v.lime }} className="eyebrow">Loop Score 82</span><h2>Your World. Your People. Your Moments.</h2>
        <div className="row"><span className="bp-btn">Open Loop</span><span className="bp-chip" style={{ background: v.mint }}>Approved</span><span className="bp-chip" style={{ background: v.lime, color: '#120F24' }}>New</span></div></div>
      <div className="bp-bar"><i /></div>
    </div>
    <p className="note">Preview only — production apps read tokens from docs/DESIGN_SYSTEM.md at build time.</p>
  </>;
}
function SAdmins({ v, set }: Sec<'admins'>) {
  const [email, setEmail] = useState('');
  return <>
    <table><thead><tr><th>Staff</th><th>Role</th><th>MFA</th><th>Last sign-in</th><th /></tr></thead><tbody>
      {v.staff.map((st, i) => { const upd = (p: Partial<Staff>) => set({ staff: v.staff.map((x, j) => j === i ? { ...x, ...p } : x) }); return <tr key={st.id}>
        <td><div className="who"><span className="av">{st.name[0]}</span><div><b>{st.name}</b><small>{st.email}</small></div></div></td>
        <td><select value={st.role} disabled={st.id === 's1'} onChange={e => upd({ role: e.target.value as Staff['role'] })}>{STAFF_ROLES.map(r => <option key={r}>{r}</option>)}</select></td>
        <td>{st.mfa ? <Pill tone="mint">on</Pill> : <button className="btn sm ghost" onClick={() => upd({ mfa: true })}>Require MFA</button>}</td>
        <td className="muted">{st.last ? when(st.last) : 'Invited'}</td>
        <td className="r">{st.id !== 's1' && <button className="btn sm danger" onClick={() => set({ staff: v.staff.filter((_, j) => j !== i) })}>Remove</button>}</td></tr>; })}
    </tbody></table>
    <div className="row mt"><input value={email} onChange={e => setEmail(e.target.value)} placeholder="new.staff@vibeloop" /><button className="btn sm ghost" disabled={!/^\S+@\S+$/.test(email)} onClick={() => { set({ staff: [...v.staff, { id: 's' + Date.now(), email, name: email.split('@')[0], role: 'Read-only', mfa: true, last: '' }] }); setEmail(''); }}>Invite as Read-only</button></div>
    <p className="note">Invites are recorded only — email delivery needs the backend. The primary super admin cannot be demoted.</p>
  </>;
}
const SEC_VIEWS: { [K in SettingsSection]: (p: Sec<K>) => ReactNode } = { general: SGeneral, security: SSecurity, moderation: SModeration, monetisation: SMonetisation, notifications: SNotifications, content: SContent, privacy: SPrivacy, integrations: SIntegrations, branding: SBranding, admins: SAdmins };

function SettingsPanel<K extends SettingsSection>({ section, saved, reload }: { section: K; saved: Settings[K]; reload: () => void }) {
  const { run, busy } = useAct();
  const [draft, setDraft] = useState(saved);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const View = SEC_VIEWS[section] as (p: Sec<K>) => ReactNode;
  const meta = SET_SECTIONS.find(x => x[0] === section)!;
  return <Card title={meta[1]} extra={<div className="row"><LivePill />{dirty ? <Pill tone="amber">Unsaved changes</Pill> : <Pill tone="gray">Saved</Pill>}</div>} className="setpanel">
    <p className="note">{meta[2]}. Stored at <code>settings/{section}</code>.</p>
    <View v={draft} set={p => setDraft(d => ({ ...d, ...p }))} />
    <div className={'savebar' + (dirty ? ' dirty' : '')}>
      <span>{dirty ? 'You have unsaved changes in this section.' : 'All changes saved · every save is written to the audit log.'}</span>
      <div className="row"><button className="btn sm ghost" disabled={!dirty || busy} onClick={() => setDraft(saved)}>Discard</button>
        <button className="btn sm prism" disabled={!dirty || busy} onClick={() => run(() => kvPut('settings', section, draft), `Saved · ${meta[1]} settings`, reload)}>Save changes</button></div>
    </div>
  </Card>;
}
function SettingsPage() {
  const { sub } = useContext(RouteCtx);
  const st = useSettings();
  const sec = (SET_SECTIONS.some(x => x[0] === sub) ? sub : 'general') as SettingsSection;
  return <div className="setgrid">
    <nav className="subnav card">{SET_SECTIONS.map(([k, l]) => <a key={k} href={'#/settings/' + k} className={k === sec ? 'on' : ''}><Icon name={k} size={16} /><span>{l}</span></a>)}</nav>
    <Gate rs={[st]}>{() => <SettingsPanel key={sec + JSON.stringify(st.settings![sec])} section={sec} saved={st.settings![sec]} reload={st.reload} />}</Gate>
  </div>;
}

/* ---------- emoji ---------- */
function Moji({ id, size = 40, uid }: { id: number; size?: number; uid: string }) {
  return <span className="moji" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: vibemojiSvg(id, uid) }} />;
}
function Emoji() {
  const kv = useKv<{ enabled: boolean }>('emoji');
  const { run, busy } = useAct();
  const [q, setQ] = useState(''); const [cat, setCat] = useState('All');
  const [sel, setSel] = useState<number | null>(() => { const m = location.hash.match(/[?&]open=(\d+)/); return m ? +m[1] : null; });
  const list = VIBEMOJI.filter(e => (cat === 'All' || e.category === cat) && (e.name + ' ' + e.id).toLowerCase().includes(q.toLowerCase()));
  const d = sel ? VIBEMOJI[sel - 1] : null;
  const off = (id: number) => kv.data?.[String(id)]?.enabled === false;
  const offCount = Object.values(kv.data ?? {}).filter(v => v?.enabled === false).length;
  if (kv.error) return <ApiErr msg={kv.error} retry={kv.reload} />;
  return <>
    <Card title="Reaction set" extra={<span className="muted small">Shown on Loops, Sparks and chat</span>}>
      <div className="reacts">{REACTIONS.map(r => <button key={r.key} className="react" onClick={() => setSel(r.id)}><Moji id={r.id} size={44} uid={'r' + r.key} /><b>{r.label}</b><small className="mono">{r.key} · #{r.id}</small></button>)}</div>
    </Card>
    <div className={'grid ' + (d ? 'g2-1' : '')}>
      <Card title={`${list.length} of ${VIBEMOJI.length} VibeMoji`} extra={<div className="row"><LivePill /><span className="muted small">{offCount} disabled</span><Search v={q} set={setQ} ph="Search name or #id" /></div>}>
        <div className="row catrow"><Tabs v={cat} set={setCat} opts={[['All', 'All'], ...VIBEMOJI_CATEGORIES.map(c => [c, c] as [string, string])]} /></div>
        <div className="mojigrid">{list.map(e => <button key={e.id} title={e.name} className={'mcell' + (sel === e.id ? ' on' : '') + (off(e.id) ? ' off' : '')} onClick={() => setSel(e.id)}><Moji id={e.id} uid={'g'} /></button>)}
          {!list.length && <p className="empty">No VibeMoji match “{q}”.</p>}</div>
      </Card>
      {d && <Card title="Details" className="mdetail" extra={<button className="iconbtn" aria-label="Close" onClick={() => setSel(null)}><Icon name="x" size={16} /></button>}>
        <div className="mbig"><Moji id={d.id} size={160} uid="big" /></div>
        <h2 className="mname">{d.name}</h2>
        <div className="kv"><span>ID</span><b className="mono">#{d.id}</b><span>Category</span><b><Pill tone="violet">{d.category}</Pill></b><span>Recipe</span><b className="mono small">shape {d.shape} · pal {d.pal} · eyes {d.eyes} · mouth {d.mouth} · acc {d.acc}</b>
          <span>Reaction</span><b>{REACTIONS.find(r => r.id === d.id)?.label ?? '—'}</b></div>
        <Field label="Enabled in pickers" hint={off(d.id) ? 'Hidden from users. Existing uses still render.' : 'Visible in emoji pickers.'}><Toggle label="Enabled" disabled={busy || !kv.data} on={!off(d.id)} onClick={() => run(() => kvPut('emoji', String(d.id), { enabled: off(d.id), name: d.name }), `#${d.id} ${d.name} ${off(d.id) ? 'enabled' : 'disabled'}`, kv.reload)} /></Field>
        <div className="row mt">{[24, 32, 48, 64].map(z => <Moji key={z} id={d.id} size={z} uid={'s' + z} />)}</div>
      </Card>}
    </div>
  </>;
}

/* ---------- features ---------- */
const prdTone = (r?: string) => !r ? 'gray' : r === 'Admin' ? 'amber' : 'violet';
const prdLabel = (r?: string) => !r ? 'Planned' : r === 'Admin' ? 'Admin' : 'Preview';
function Features() {
  const kv = useKv<{ on: boolean }>('feature');
  const { run, busy } = useAct();
  const prdOn = (n: number) => kv.data?.['prd.' + n]?.on ?? !!PRD[n - 1]?.route;
  const featOn = (n: number) => kv.data?.['social.' + n]?.on ?? !!ALL_FEATURES.find(x => x.n === n)?.route;
  const flip = (k: string, on: boolean, name: string) => run(() => kvPut('feature', k, { on: !on, name }), `${name} ${on ? 'off' : 'on'}`, kv.reload);
  const [tab, setTab] = useState<'prd' | 'social'>(() => location.hash.includes('tab=social') ? 'social' : 'prd');
  const [q, setQ] = useState(''); const [f, setF] = useState<'all' | 'preview' | 'planned'>('all');
  const overlaps = ALL_FEATURES.filter(x => x.same).length;
  const social = ALL_FEATURES.filter(x => !x.same);
  const unique = PRD.length + social.length;
  const prev = PRD.filter(x => x.route && x.route !== 'Admin').length + social.filter(x => x.route).length;
  const admin = PRD.filter(x => x.route === 'Admin').length;
  const ql = q.toLowerCase();
  const fOk = (r?: string) => f === 'all' || (f === 'planned') === !r;
  const goPrd = (n: number) => { setTab('prd'); setF('all'); setQ(''); setTimeout(() => document.getElementById('prd-' + n)?.scrollIntoView({ block: 'center' }), 0); };
  return <>
    <div className="kpis">
      <Kpi label="Unique capabilities" value={String(unique)} sub={`${PRD.length} PRD + ${ALL_FEATURES.length} social − ${overlaps} overlaps`} />
      <Kpi label="Preview" value={String(prev)} sub="Mobile screen · no backend yet" />
      <Kpi label="Admin" value={String(admin)} sub="Staff admin panel" />
      <Kpi label="Planned" value={String(unique - prev - admin)} sub="Not built" />
    </div>
    <NotReady>No feature is “Live”: Preview means an on-device screen exists in the mobile build with no production backend. Flags are saved to <code>feature/&lt;key&gt;</code> via the API and audited.</NotReady>
    {kv.error && <ApiErr msg={kv.error} retry={kv.reload} />}
    <div className="row"><Tabs v={tab} set={setTab} opts={[['prd', `Creator platform · ${PRD.length} (PRD)`], ['social', `Social · ${ALL_FEATURES.length}`]]} />
      <Search v={q} set={setQ} ph="Search features" /><Tabs v={f} set={setF} opts={[['all', 'All'], ['preview', 'Built'], ['planned', 'Planned']]} />
      <span className="muted small">{tab === 'prd' ? `${PRD.filter(x => prdOn(x.n)).length} flags on` : `${ALL_FEATURES.filter(x => !x.same && featOn(x.n)).length} flags on`}</span></div>
    {tab === 'prd' ? <div className="grid g2">{PRD_GROUPS.map(g => { const items = PRD.filter(x => x.group === g && fOk(x.route) && x.name.toLowerCase().includes(ql)); if (!items.length) return null;
      return <Card key={g} title={g} extra={<span className="muted small">{items.length} features</span>} className="fsec"><div className="fsec-bar" style={{ background: 'var(--prism)' }} />
        {items.map(x => <div key={x.n} id={'prd-' + x.n} className="frow"><span className="fn mono">{String(x.n).padStart(3, '0')}</span><div className="grow"><b>{x.name}</b>{x.route && x.route !== 'Admin' && <small>screen <code>{x.route}</code></small>}</div>
          <Pill tone={prdTone(x.route)}>{prdLabel(x.route)}</Pill>
          <Toggle label={'Flag ' + x.name} disabled={busy || !kv.data} on={prdOn(x.n)} onClick={() => flip('prd.' + x.n, prdOn(x.n), x.name)} /></div>)}
      </Card>; })}</div>
    : <div className="grid g2">{SECTIONS.map(sec => { const items = sec.features.filter(x => fOk(x.same ? PRD[x.same - 1].route : x.route) && (x.name + ' ' + x.desc).toLowerCase().includes(ql)); if (!items.length) return null; return <Card key={sec.key} title={sec.title} extra={<span className="muted small">{sec.sub}</span>} className="fsec">
      <div className="fsec-bar" style={{ background: sec.color }} />
      {items.map(x => <div key={x.n} className="frow"><span className="fn mono">{String(x.n).padStart(3, '0')}</span><div className="grow"><b>{x.name}</b><small>{x.desc}{x.route && <> · screen <code>{x.route}</code></>}</small></div>
        {x.same ? <button className="pill violet samepill" title={PRD[x.same - 1].name} onClick={() => goPrd(x.same!)}>Same as PRD #{x.same} →</button> : <>
        <Pill tone={x.route ? 'violet' : 'gray'}>{x.route ? 'Preview' : 'Planned'}</Pill>
        <Toggle label={'Flag ' + x.name} disabled={busy || !kv.data} on={featOn(x.n)} onClick={() => flip('social.' + x.n, featOn(x.n), x.name)} /></>}</div>)}
    </Card>; })}</div>}
  </>;
}

/* ---------- global search ---------- */
function GlobalSearch() {
  const { q: rq } = useContext(RouteCtx);
  const [q, setQ] = useState(rq);
  useEffect(() => setQ(rq), [rq]);
  const t = rq.trim().toLowerCase();
  const r = useApi<SearchResult>(t ? '/admin/search?q=' + encodeURIComponent(rq.trim()) : null);
  const has = (...xs: (string | number)[]) => xs.join(' ').toLowerCase().includes(t);
  const d = r.data;
  const groups: [string, string, { k: string; title: ReactNode; sub: ReactNode; tag?: ReactNode; href: string }[]][] = !t || !d ? [] : [
    ['Users', 'users', d.users.map(u => ({ k: u.id, title: u.name, sub: `${u.handle} · ${u.email} · ${cap(u.role)}`, tag: u.suspended ? <Pill tone="red">suspended</Pill> : <Pill tone="mint">active</Pill>, href: '#/users?open=' + u.id }))],
    ['Posts', 'moderation', d.posts.map(p => ({ k: p.id, title: p.text.slice(0, 80), sub: p.id, href: '#/moderation' }))],
    ['Loops', 'features', d.loops.map(l => ({ k: l.id, title: l.title, sub: l.id, href: '#/dashboard' }))],
    ['Promos', 'promos', (d.promos ?? []).map(p => ({ k: p.id, title: p.title, sub: `${p.id} · ${p.placement.join(', ')}`, tag: p.active ? <Pill tone="mint">active</Pill> : <Pill tone="gray">paused</Pill>, href: '#/promos?edit=' + p.id }))],
    ['Uploads', 'uploads', (d.uploads ?? []).map(m => ({ k: m.id, title: m.name ?? m.id, sub: `${m.kind} · ${m.mime} · ${bytes(m.size)}`, href: '#/uploads' }))],
    ['Audit entries', 'audit', d.audit.slice(0, 8).map(a => ({ k: 'a' + a.id, title: <code>{a.action}</code>, sub: `#${a.id} · ${a.detail}`, href: '#/audit' }))],
    ['PRD features (catalog)', 'features', PRD.filter(f => has(f.name, f.group)).slice(0, 8).map(f => ({ k: 'p' + f.n, title: `#${f.n} ${f.name}`, sub: f.group, tag: <Pill tone={prdTone(f.route)}>{prdLabel(f.route)}</Pill>, href: '#/features' }))],
    ['Features (catalog)', 'features', ALL_FEATURES.filter(f => !f.same && has(f.name, f.desc)).slice(0, 8).map(f => ({ k: 'f' + f.n, title: f.name, sub: f.desc, tag: <Pill tone={f.route ? 'violet' : 'gray'}>{f.route ? 'Preview' : 'Planned'}</Pill>, href: '#/features?tab=social' }))],
    ['VibeMoji', 'emoji', VIBEMOJI.filter(e => has(e.name, e.category, '#' + e.id)).slice(0, 12).map(e => ({ k: 'e' + e.id, title: <span className="row"><Moji id={e.id} size={24} uid="sr" />{e.name}</span>, sub: `#${e.id} · ${e.category}`, href: '#/emoji?open=' + e.id }))],
  ];
  const extra = useCfgSearch(t);
  const mextra = useMoneySearch(t);
  const cextra = useContentSearch(t);
  if (d) groups.splice(1, 0, ...extra, ...mextra, ...cextra);
  const total = groups.reduce((a, g) => a + g[2].length, 0);
  return <>
    <Card><form className="bigsearch" onSubmit={e => { e.preventDefault(); location.hash = '#/search?q=' + encodeURIComponent(q); }}><Icon name="search" size={20} /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search users, content, pages, tickets, reviews, promos, plans, config, emoji…" /><button className="btn sm prism">Search</button></form>
      <p className="note">{!t ? 'Users (name, email, @handle), posts, Loops, promos, uploads and audit entries are searched on the server; config layers, screens, features, zones, slabs, language strings, towns, Backstage Pass plans, Stash products, Boosts, Plugs, CMS pages, reviews, Speak Up tickets and the masked OTP log come from their admin APIs; features and VibeMoji from the bundled catalog.' : r.loading ? 'Searching…' : `${total} result${total === 1 ? '' : 's'} for “${rq.trim()}” across ${groups.filter(g => g[2].length).length} groups.`}</p></Card>
    <div className="grid g2">{groups.filter(g => g[2].length).map(([label, icon, rows]) => <Card key={label} title={label} extra={<Pill tone="violet">{rows.length}</Pill>}>
      <div className="mlist">{rows.map(r => <a key={r.k} href={r.href} className="sres"><Icon name={icon} size={16} /><div className="grow"><b>{r.title}</b><small>{r.sub}</small></div>{r.tag}</a>)}</div></Card>)}</div>
    {r.error && <ApiErr msg={r.error} retry={r.reload} />}
    {t && d && !total && <Card><p className="empty">Nothing matches “{rq.trim()}”.</p></Card>}
  </>;
}


/* ===================== App control — server-driven config ===================== */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const MODS = ['social', 'chat'] as const;
const FEATURE_KEYS = ['dswitch', 'swipeWorlds', 'chatBubble', 'post2chat', 'draftBridge', 'focusSwitch', 'statuses', 'towns', 'viewOnce', 'sendLater', 'polls', 'fadeChat', 'chatLock', 'payouts', 'paidLoops', 'live',
  'money', 'subscriptions', 'store', 'tips', 'ads', 'platformFees', 'blog', 'news', 'appLinks', 'reviews', 'productReviews', 'vouches', 'speakUp', 'promos',
  'chatCopy', 'quickPolish', 'phrasebook', 'smartChips', 'slashCommands', 'mysteryDrop', 'togetherTimer', 'placeDrop', 'partyChat', 'readAloud', 'chatExport', 'hopBack', 'hopShare', 'outbox', 'fileDrop', 'lenses', 'autoEdit', 'miniVote', 'pin3', 'saveStack', 'loveTrail', 'moodDrop', 'emojiSuggest',
  'realtime', 'readReceipts', 'typing', 'voiceNotes', 'calls', 'push', 'e2ee', 'snaps', 'storyViewers', 'followRequests', 'liveCamera', 'demoMode', 'chatMedia', 'moodMedia', 'hushSettings'];
const FEATURE_DESC: Record<string, string> = {
  dswitch: 'Social ⇄ Chat module switch', swipeWorlds: 'Swipe between Social and Chat', chatBubble: 'Floating chat bubble over Social', post2chat: 'Share a post into a chat',
  draftBridge: 'Carry drafts between modules', focusSwitch: 'Focus mode mutes the other module', statuses: 'Vibes (24h statuses)', towns: 'Towns (communities)', viewOnce: 'View-once messages',
  sendLater: 'Scheduled messages', polls: 'Polls in chats', fadeChat: 'Disappearing messages', chatLock: 'Lock a chat behind device auth', payouts: 'Creator payouts', paidLoops: 'Paid Loops', live: 'Live sessions',
  money: 'Money master switch (set from Money switches)', subscriptions: 'Backstage Pass plans', store: 'Stash creator store', tips: 'Props (tips)', ads: 'Boosts (sponsored cards)', platformFees: 'Platform fee on paid orders',
  blog: 'The Loopdown / Hush Notes (blog)', news: 'Fresh Wire (news)', appLinks: 'Get the Apps page', reviews: 'Reviews master switch', productReviews: 'Real Talk product reviews (needs Stash)', vouches: 'Vouches (creator reviews)', speakUp: 'Speak Up reports & tickets', promos: 'VibeLoop brand promos',
  chatCopy: 'Hush · Copy & Paste', quickPolish: 'Hush · Quick Polish (on-device grammar)', phrasebook: 'Hush · Phrasebook (common phrases)', smartChips: 'Hush · Smart reply chips', slashCommands: 'Hush · Slash commands', mysteryDrop: 'Hush · Mystery Drop', togetherTimer: 'Hush · Together Timer', placeDrop: 'Hush · Place Drop (location card)', partyChat: 'Hush · Party Chat (24h group)', readAloud: 'Hush · Read Aloud', chatExport: 'Hush · Chat export', hopBack: 'Hop Back between modules', hopShare: 'Hop Share to latest chat', outbox: 'Offline Outbox', fileDrop: 'Hush · File Drop (1 GB)', lenses: 'Glow · Vibe Lenses', autoEdit: 'Glow · Auto Edit for video', miniVote: 'Glow · Mini Vote polls', pin3: 'Glow · Pin 3', saveStack: 'Glow · Save Stack', loveTrail: 'Glow · Love Trail', moodDrop: 'Mood Drop', emojiSuggest: 'Emoji suggestions while typing',
  realtime: 'Realtime gateway (live messages over WebSocket)', readReceipts: 'Read receipts (seen ticks)', typing: 'Typing indicators', voiceNotes: 'Voice notes in chats', calls: 'Voice & video calls (WebRTC)', push: 'Push notifications (Expo)',
  e2ee: 'End-to-end encrypted chats', snaps: 'Snaps (view-once photo drops)', storyViewers: 'Story viewers list', followRequests: 'Follow requests for private accounts', liveCamera: 'Live camera with lens overlays', demoMode: 'Offline demo button on sign-in', chatMedia: 'Hush · Photos & videos in chats', moodMedia: 'Hush · Photo & video Moods', hushSettings: 'Hush · Control Room (Hush settings)',
};
const SCREEN_KEYS = ['Home', 'Explore', 'Create', 'Motion', 'Profile', 'Chats', 'Friends', 'Vibes', 'Towns', 'ChatMe', 'NewLoop', 'LoopDetail', 'FanReact', 'Archive', 'Copilot', 'Editor', 'Audio', 'Memory',
  'ReleaseGate', 'Earnings', 'Payout', 'Notifications', 'Settings', 'Loops', 'Library', 'Sparks', 'NewPost', 'Vault', 'ChatThread', 'Search', 'Live', 'Emoji', 'Features', 'Growth', 'Trust', 'Learn',
  'SettingsHub', 'ChatRoom', 'NewChat', 'ShareToChat', 'ChatSearch', 'Starred', 'MyCode', 'StatusCompose', 'StatusView', 'CreateTown', 'TownRoom', 'ChangeHandle', 'ChatSecurity', 'LanguageRegion',
  'BubbleMojiGallery', 'Accounts', 'CreatorHub', 'CreateHub'];
const SCREEN_DESC: Record<string, string> = { CreatorHub: 'Creator Studio dashboard', CreateHub: 'Creator Tools', Vault: 'Keepers' };
const navDef = (xs: [string, string, string][]) => xs.map(([key, label, icon], i) => ({ key, label, icon, enabled: true, order: i + 1 }));
/** Mirrors the server's built-in BASE (backend/app/config_resolver.py) so the editor can show inherited values. */
const CFG_DEFAULTS: J = {
  modules: { social: true, chat: true },
  nav: { social: navDef([['Home', 'Home', 'home'], ['Explore', 'Explore', 'compass'], ['Create', 'Create', 'plus'], ['Motion', 'Motion', 'play'], ['Profile', 'Profile', 'user']]),
    chat: navDef([['Chats', 'Chats', 'message'], ['Friends', 'Friends', 'users'], ['Vibes', 'Vibes', 'sparkle'], ['Towns', 'Towns', 'town'], ['ChatMe', 'Me', 'user']]) },
  screens: {}, features: Object.fromEntries(FEATURE_KEYS.map(k => [k, true])),
  limits: { maxAccounts: 5, maxGroupSize: 50, statusHours: 24, editWindowMin: 15, undoWindowMin: 60 }, fees: { platformFee: 0.08 }, languages: { strings: {} }, moduleNames: { social: 'Glow', chat: 'Hush' },
};
type ThemeMod = Record<string, string>;
type Preset = ThemeMod & { key: string; default: boolean };
const THEME_COLORS: Record<string, string[]> = { social: ['primary', 'secondary', 'tertiary', 'accent', 'bg', 'surface', 'ink'], chat: ['primary', 'secondary', 'accent', 'bg', 'surface', 'ink'] };
/** Mirrors THEME_PRESETS defaults in backend/app/config_resolver.py (base theme). */
CFG_DEFAULTS.theme = {
  social: { preset: 'studio', primary: '#5B4CF5', secondary: '#7C6CFF', tertiary: '#A99BFF', accent: '#D4FF3F', bg: '#F5F5F7', surface: '#FFFFFF', ink: '#0A0A0F', navStyle: 'pill', radius: 'soft', density: 'comfy' },
  chat: { preset: 'mono', primary: '#0D9488', secondary: '#0EA5A0', accent: '#FF6B4A', bg: '#F3F6F6', surface: '#FFFFFF', ink: '#0B1416', navStyle: 'dock', radius: 'soft', density: 'comfy' },
};
const lum = (h: string) => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrastRatio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const HEX = /^#[0-9A-Fa-f]{6}$/;
const LIMIT_DESC: Record<string, string> = { maxAccounts: 'Accounts per email', maxGroupSize: 'Members per group chat', statusHours: 'Vibe lifetime (hours)', editWindowMin: 'Message edit window (min)', undoWindowMin: 'Unsend window (min)', platformFee: 'Platform fee (fraction, 0.08 = 8%)' };
const LANG_NAMES: Record<string, string> = { en: 'English', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', kn: 'Kannada', ml: 'Malayalam', mr: 'Marathi', bn: 'Bengali', gu: 'Gujarati', pa: 'Punjabi', ur: 'Urdu', es: 'Spanish', fr: 'French' };
const SAMPLE_COUNTRIES = ['IN', 'US', 'GB', 'AE', 'SG', 'CA', 'AU', 'DE', 'BR', 'NG', 'JP', 'LK'];

const isObj = (x: unknown): x is Record<string, J> => !!x && typeof x === 'object' && !Array.isArray(x);
const clone = <T,>(x: T): T => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
/** Same deep-merge as the server: dicts recurse, nav lists merge by item key and sort by order, everything else replaces. */
function cfgMerge(a: J, b: J): J {
  if (isObj(a) && isObj(b)) { const o: J = { ...a }; for (const k of Object.keys(b)) o[k] = k in a ? cfgMerge(a[k], b[k]) : clone(b[k]); return o; }
  if (Array.isArray(a) && Array.isArray(b) && [...a, ...b].every(x => isObj(x) && 'key' in x)) {
    const idx = new Map<string, J>(a.map(x => [x.key, { ...x }]));
    for (const x of b) idx.set(x.key, cfgMerge(idx.get(x.key) ?? {}, x));
    return [...idx.values()].sort((p, q) => (p.order ?? 99) - (q.order ?? 99));
  }
  return clone(b);
}
const withLabels = (cfg: J): J => { const c = clone(cfg); const s = c.languages?.strings ?? {}; for (const m of MODS) for (const it of c.nav?.[m] ?? []) it.label = s['nav.' + it.key] ?? it.label; return c; };
const humanize = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
const EN_SPECIAL: Record<string, string> = { 'dswitch.toSocial': 'Go to Social', 'dswitch.toChat': 'Go to Chat', 'common.TurnedOff': 'Turned off in your region', 'nav.ChatMe': 'Me' };
const enFor = (k: string) => EN_SPECIAL[k] ?? humanize(k.split('.').slice(1).join('.') || k);
type Zone = { name: string; countries: string[]; states?: string[] };
type Slab = { key: string; name: string; minFollowers: number; maxFollowers?: number };
type Langs = { available: string[]; default: string };
type LayersRes = { version: number; layers: Record<string, J> };
const zoneFor = (c: string, zs: Record<string, Zone>) => Object.keys(zs).find(k => zs[k].countries?.includes(c)) ?? Object.keys(zs).find(k => zs[k].countries?.includes('*')) ?? 'GLOBAL';

/** Read / write one query parameter of the hash route (e.g. #/navigation?layer=country:US). */
const hp = (k: string) => new URLSearchParams(location.hash.split('?')[1] ?? '').get(k);
const setHp = (k: string, v: string | null) => {
  const [p, qs = ''] = location.hash.split('?'); const u = new URLSearchParams(qs);
  if (v) u.set(k, v); else u.delete(k);
  const s = u.toString(); location.hash = p + (s ? '?' + s : '');
};

function useLayerEditor() {
  useContext(RouteCtx); // re-render on hash change
  const layer = hp('layer') || 'base';
  const toast = useContext(ToastCtx);
  const { run, busy } = useAct();
  const lr = useApi<LayersRes>('/admin/config/layers');
  const zones = useApi<Record<string, Zone>>('/admin/zones');
  const slabs = useApi<Slab[]>('/admin/slabs');
  const langs = useApi<Langs>('/admin/languages');
  const savedStr = JSON.stringify(lr.data?.layers[layer] ?? {});
  const [draft, setDraft] = useState<J>({});
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setDraft(JSON.parse(savedStr)); setErr(null); }, [savedStr, layer]);
  const exists = !!lr.data && layer in lr.data.layers;
  const isLang = layer.startsWith('lang:');
  const inherited = layer === 'base' ? CFG_DEFAULTS : cfgMerge(CFG_DEFAULTS, lr.data?.layers.base ?? {});
  const eff = withLabels(cfgMerge(inherited, draft));
  const upd = (f: (d: J) => void) => setDraft((d: J) => { const n = clone(d); f(n); return n; });
  const dirty = JSON.stringify(draft) !== savedStr;
  const save = () => run(() => api<{ version: number }>(`/admin/config/${encodeURIComponent(layer)}`, { method: 'PUT', body: draft }).catch(e => { setErr((e as Error).message); throw e; }),
    undefined, r => { setErr(null); toast(`Saved layer ${layer} · config v${r.version}`); lr.reload(); });
  const remove = () => run(() => api<{ version: number }>(`/admin/config/${encodeURIComponent(layer)}`, { method: 'DELETE' }).catch(e => { setErr((e as Error).message); throw e; }),
    undefined, r => { toast(`Deleted layer ${layer} · config v${r.version}`); lr.reload(); });
  return { layer, lr, zones, slabs, langs, draft, setDraft, upd, dirty, err, save, remove, discard: () => { setDraft(JSON.parse(savedStr)); setErr(null); }, exists, isLang, inherited, eff, busy, rs: [lr, zones, slabs, langs] as Res<unknown>[] };
}
type LE = ReturnType<typeof useLayerEditor>;

function LayerBar({ e, note }: { e: LE; note: ReactNode }) {
  const [kind, val] = e.layer.includes(':') ? e.layer.split(':') : ['base', ''];
  const [cc, setCc] = useState(kind === 'country' ? val : 'US');
  const zs = Object.keys(e.zones.data!); const ss = e.slabs.data!.map(s => s.key); const ls = e.langs.data!.available.filter(l => l !== 'en');
  const first: Record<string, string> = { base: 'base', country: 'country:' + (cc || 'US'), zone: 'zone:' + zs[0], slab: 'slab:' + ss[0], lang: 'lang:' + (ls[0] ?? 'hi') };
  const go = (k: string) => setHp('layer', k === 'base' ? null : k);
  return <Card className="layerbar" title="Config layer" extra={<div className="row"><LivePill /><Pill tone="violet">config v{e.lr.data!.version}</Pill>
    {e.dirty ? <Pill tone="amber">Unsaved changes</Pill> : e.exists || e.layer === 'base' ? <Pill tone="gray">Saved</Pill> : <Pill tone="amber">New layer · not saved</Pill>}</div>}>
    <p className="note">Layers merge <b>base → country → zone → slab → lang</b>; a later layer overrides an earlier one. {note}</p>
    <div className="row">
      <div className="tabs">{(['base', 'country', 'zone', 'slab', 'lang'] as const).map(k => <button key={k} className={kind === k ? 'on' : ''} onClick={() => go(first[k])}>{k}</button>)}</div>
      {kind === 'country' && <form className="row" onSubmit={ev => { ev.preventDefault(); if (/^[A-Za-z]{2}$/.test(cc)) go('country:' + cc.toUpperCase()); }}>
        <input className="cc" aria-label="Country code" value={cc} maxLength={2} onChange={ev => setCc(ev.target.value.toUpperCase())} placeholder="US" /><button className="btn sm ghost" disabled={!/^[A-Za-z]{2}$/.test(cc)}>Open</button></form>}
      {kind === 'zone' && <select aria-label="Zone" value={val} onChange={ev => go('zone:' + ev.target.value)}>{zs.map(z => <option key={z} value={z}>{z} · {e.zones.data![z].name}</option>)}</select>}
      {kind === 'slab' && <select aria-label="Slab" value={val} onChange={ev => go('slab:' + ev.target.value)}>{e.slabs.data!.map(s => <option key={s.key} value={s.key}>{s.key} · {s.name}</option>)}</select>}
      {kind === 'lang' && <select aria-label="Language" value={val} onChange={ev => go('lang:' + ev.target.value)}>{ls.map(l => <option key={l} value={l}>{l} · {LANG_NAMES[l] ?? l}</option>)}</select>}
      <span className="editing">Editing <code>{e.layer}</code></span>
    </div>
    <div className="row mt small muted">Saved layers:{Object.keys(e.lr.data!.layers).sort().map(k => <button key={k} className={'chip lchip' + (k === e.layer ? ' on' : '')} onClick={() => go(k)}>{k}</button>)}</div>
    {e.err && <div className="errbox" role="alert">Server rejected the save: {e.err}</div>}
    <div className={'savebar' + (e.dirty ? ' dirty' : '')}>
      <span>{e.dirty ? `Unsaved changes to ${e.layer}.` : 'Saves go to the API, bump the config version and are written to the audit log.'}</span>
      <div className="row">{e.layer !== 'base' && e.exists && <button className="btn sm danger" disabled={e.busy} onClick={e.remove}>Delete layer</button>}
        <button className="btn sm ghost" disabled={!e.dirty || e.busy} onClick={e.discard}>Discard</button>
        <button className="btn sm prism" disabled={!e.dirty || e.busy || MODS.some(m => { const v = e.isLang ? e.draft.languages?.strings?.['module.' + m] : e.draft.moduleNames?.[m]; return v !== undefined && !!modNameErr(v); })} onClick={e.save}>Save to {e.layer}</button></div>
    </div>
  </Card>;
}
/** Small tri-state marker: whether this layer sets the value or inherits it. */
const Src = ({ set }: { set: boolean }) => set ? <Pill tone="violet">this layer</Pill> : <Pill tone="gray">inherited</Pill>;

function NavigationPage() {
  const e = useLayerEditor();
  return <Gate rs={e.rs}>{() => <>
    <LayerBar e={e} note={e.isLang ? 'A language layer can only rename items; renames are saved as nav.<Key> strings.' : 'Item order, on/off and labels are saved as the full nav list for this layer.'} />
    <ModuleNames e={e} />
    <div className="grid g2">{MODS.map(m => <NavModule key={m} e={e} mod={m} />)}</div>
  </>}</Gate>;
}
/** Module names shown in the app's D-Switch and titles (moduleNames, or module.* strings on a language layer). */
function modNameErr(v: string) {
  const t = v.trim();
  if (!t) return 'Required';
  if (t !== v) return 'Remove leading/trailing spaces';
  if (t.length > 16) return 'Max 16 characters';
  if (!/[\p{L}\p{N}]/u.test(t)) return 'Needs a letter or number';
  return null;
}
function ModuleNames({ e }: { e: LE }) {
  const inh = (m: string) => e.inherited.moduleNames?.[m] ?? CFG_DEFAULTS.moduleNames[m];
  const own = (m: string): string | undefined => e.isLang ? e.draft.languages?.strings?.['module.' + m] : e.draft.moduleNames?.[m];
  const val = (m: string) => own(m) ?? inh(m);
  const set = (m: string, v: string) => e.upd(d => {
    if (e.isLang) { d.languages ??= {}; d.languages.strings ??= {}; d.languages.strings['module.' + m] = v; }
    else { d.moduleNames = { ...(d.moduleNames ?? {}), [m]: v }; }
  });
  const clear = (m: string) => e.upd(d => {
    if (e.isLang) { delete d.languages?.strings?.['module.' + m]; }
    else if (d.moduleNames) { delete d.moduleNames[m]; if (!Object.keys(d.moduleNames).length) delete d.moduleNames; }
  });
  const label: Record<string, string> = { social: 'Social module name', chat: 'Chat module name' };
  return <Card title="Module names" className="modnames" extra={<Src set={MODS.some(m => own(m) !== undefined)} />}>
    <p className="note">Shown in the app’s D-Switch and screen titles. {e.isLang ? 'Saved as module.social / module.chat strings for this language.' : 'Saved as moduleNames on this layer; language layers can translate them.'}</p>
    <div className="row modnames-body">
      <div className="grow">{MODS.map(m => { const v = val(m); const er = modNameErr(v); return <label key={m} className="field" data-modname={m}>
        <span className="small muted">{label[m]}</span>
        <div className="row"><input aria-label={label[m]} value={v} maxLength={16} onChange={ev => set(m, ev.target.value)} />
          {own(m) !== undefined && <button className="linkbtn small" onClick={() => clear(m)}>clear</button>}</div>
        <small className={er ? 'bad' : 'muted'}>{er ?? `${v.trim().length}/16 · ${own(m) !== undefined ? 'this layer' : 'inherited'}`}</small></label>; })}</div>
      <div className="dswitch-pv" aria-label="D-Switch preview">
        <span className="small muted">D-Switch preview</span>
        <div className="dswitch">{MODS.map((m, i) => <span key={m} className={i === 0 ? 'on' : ''}>{val(m).trim() || '—'}</span>)}</div>
      </div>
    </div>
  </Card>;
}
function NavModule({ e, mod }: { e: LE; mod: typeof MODS[number] }) {
  const items: J[] = e.eff.nav[mod];
  const modOn = e.eff.modules[mod] !== false;
  const write = (list: J[]) => e.upd(d => { d.nav ??= {}; d.nav[mod] = list.map((x, i) => ({ key: x.key, label: x.label, icon: x.icon, enabled: x.enabled !== false, order: i + 1 })); });
  const move = (i: number, dir: number) => { const l = [...items]; [l[i], l[i + dir]] = [l[i + dir], l[i]]; write(l); };
  const setLabel = (i: number, label: string) => e.isLang
    ? e.upd(d => { d.languages ??= {}; d.languages.strings ??= {}; d.languages.strings['nav.' + items[i].key] = label; })
    : write(items.map((x, j) => j === i ? { ...x, label } : x));
  const modSet = e.draft.modules && mod in e.draft.modules;
  return <Card title={`${cap(mod)} module`} className={'navmod' + (modOn ? '' : ' modoff')} extra={<div className="row"><Src set={!!modSet} /><span className="small muted">{modOn ? 'On' : 'Off'}</span>
    <Toggle label={`${mod} module`} on={modOn} disabled={e.isLang} onClick={() => e.upd(d => { d.modules = { ...(d.modules ?? {}), [mod]: !modOn }; })} /></div>}>
    <p className="note">Bottom tabs of the {cap(mod)} module, in order. {e.draft.nav?.[mod] || (e.isLang && items.some(i => e.draft.languages?.strings?.['nav.' + i.key])) ? 'This layer overrides the list.' : 'Inherited — edit to override in this layer.'}</p>
    {items.map((it, i) => <div key={it.key} className={'navrow' + (it.enabled === false ? ' off' : '')} data-nav={`${mod}-${it.key}`}>
      <span className="fn">{i + 1}</span><span className="tico"><Icon name={'t-' + it.icon} size={18} /></span>
      <div className="grow"><input aria-label={`${it.key} label`} value={it.label} maxLength={30} onChange={ev => setLabel(i, ev.target.value)} /><small><code>{it.key}</code></small></div>
      <button className="iconbtn sm" aria-label="Move up" disabled={e.isLang || i === 0} onClick={() => move(i, -1)}><Icon name="up" size={15} /></button>
      <button className="iconbtn sm" aria-label="Move down" disabled={e.isLang || i === items.length - 1} onClick={() => move(i, 1)}><Icon name="down" size={15} /></button>
      <Toggle label={`${it.key} enabled`} on={it.enabled !== false} disabled={e.isLang} onClick={() => write(items.map((x, j) => j === i ? { ...x, enabled: x.enabled === false } : x))} />
    </div>)}
    <TabBar items={items} />
  </Card>;
}
function TabBar({ items }: { items: J[] }) {
  const on = items.filter(x => x.enabled !== false);
  return <div className="tabbar">{on.length ? on.map((it, i) => <div key={it.key} className={i === 0 ? 'on' : ''}><Icon name={'t-' + it.icon} size={18} /><span>{it.label}</span></div>) : <span className="small">No tabs</span>}</div>;
}

function ThemesPage() {
  const e = useLayerEditor();
  const pr = useApi<Record<string, Preset[]>>('/admin/theme/presets');
  return <Gate rs={[...e.rs, pr]}>{() => <>
    <LayerBar e={e} note={e.isLang ? 'Language layers cannot change the theme — pick base, a country, zone or slab.' : 'Picking a preset saves the preset name; colour and style edits are saved on top of it. Contrast (ink on bg) must be at least 4.5:1.'} />
    <div className="grid g2">{MODS.map(m => <ThemeModule key={m} e={e} mod={m} presets={pr.data![m]} />)}</div>
  </>}</Gate>;
}
function ThemeModule({ e, mod, presets }: { e: LE; mod: typeof MODS[number]; presets: Preset[] }) {
  const own: ThemeMod | undefined = e.draft.theme?.[mod];
  const base: ThemeMod = (e.inherited.theme ?? CFG_DEFAULTS.theme)[mod];
  const pv = (k?: string) => presets.find(p => p.key === k);
  const eff: ThemeMod = { ...base, ...(own?.preset ? pv(own.preset) : {}), ...(own ?? {}) };
  const set = (k: string, v: string) => e.upd(d => { d.theme ??= {}; d.theme[mod] = { ...(d.theme[mod] ?? {}), [k]: v }; });
  const pick = (k: string) => e.upd(d => { d.theme ??= {}; d.theme[mod] = { preset: k }; });
  const reset = () => e.upd(d => { d.theme ??= {}; d.theme[mod] = { preset: eff.preset }; });
  const ratio = HEX.test(eff.ink) && HEX.test(eff.bg) ? contrastRatio(eff.ink, eff.bg) : 0;
  const dis = e.isLang;
  return <Card title={`${cap(mod)} theme`} className="thememod" extra={<div className="row"><Src set={!!own} /><button className="btn sm ghost" disabled={dis} onClick={reset}>Reset to preset</button>
    {own && <button className="linkbtn small" disabled={dis} onClick={() => e.upd(d => { delete d.theme[mod]; if (!Object.keys(d.theme).length) delete d.theme; })}>clear</button>}</div>}>
    <span className="lbl">Preset</span>
    <div className="presets">{presets.map(p => <button key={p.key} disabled={dis} data-preset={`${mod}-${p.key}`} className={'preset' + (eff.preset === p.key ? ' on' : '')} onClick={() => pick(p.key)}>
      <span className="sw">{THEME_COLORS[mod].filter(k => p[k] && k !== 'surface').map(k => <i key={k} style={{ background: p[k] }} />)}</span>
      <b>{cap(p.key)}</b><small>{p.navStyle} · {p.radius}{p.default ? ' · default' : ''}</small></button>)}</div>
    <div className="themebody">
      <div className="grow">
        <span className="lbl">Colours</span>
        <div className="colors">{THEME_COLORS[mod].map(k => { const v = eff[k] ?? ''; const ok = HEX.test(v); return <label key={k} className={'colorrow' + (ok ? '' : ' bad')}>
          <input type="color" disabled={dis} aria-label={`${mod} ${k} picker`} value={ok ? v.toLowerCase() : '#000000'} onChange={ev => set(k, ev.target.value.toUpperCase())} />
          <span>{k}</span><input className="hex mono" disabled={dis} aria-label={`${mod} ${k} hex`} data-hex={`${mod}-${k}`} value={v} maxLength={7} onChange={ev => set(k, ev.target.value)} /></label>; })}</div>
        <div className={'contrast ' + (ratio >= 4.5 ? 'ok' : 'low')}>Text contrast ink on bg: <b>{ratio ? ratio.toFixed(2) : '—'}:1</b> {ratio >= 4.5 ? '· passes WCAG AA' : '· below 4.5:1 — the server will reject this'}</div>
        <div className="selects">
          {([['navStyle', mod === 'social' ? ['pill', 'dock'] : ['dock', 'pill']], ['radius', ['sharp', 'soft', 'round']], ['density', ['compact', 'comfy']]] as [string, string[]][]).map(([k, opts]) =>
            <label key={k}><span className="small muted">{k}</span><select disabled={dis} aria-label={`${mod} ${k}`} value={eff[k]} onChange={ev => set(k, ev.target.value)}>{opts.map(o => <option key={o}>{o}</option>)}</select></label>)}
        </div>
      </div>
      <ThemePhone t={eff} mod={mod} nav={e.eff.nav[mod]} />
    </div>
  </Card>;
}
const RADII: Record<string, number> = { sharp: 4, soft: 10, round: 18 };
function ThemePhone({ t, mod, nav }: { t: ThemeMod; mod: string; nav: J[] }) {
  const ok = (k: string, fb: string) => HEX.test(t[k] ?? '') ? t[k] : fb;
  const r = RADII[t.radius] ?? 10; const gap = t.density === 'compact' ? 6 : 10;
  const items = nav.filter(x => x.enabled !== false).slice(0, 5);
  const grad = `linear-gradient(120deg, ${ok('primary', '#888888')}, ${ok('secondary', '#888888')})`;
  return <div className="tphone"><div className="tphone-scr" style={{ background: ok('bg', '#ffffff'), color: ok('ink', '#000000'), gap }}>
    <div className="tp-head"><b>{mod === 'social' ? 'VibeLoop' : 'Chats'}</b><i style={{ background: ok('accent', '#888888') }} /></div>
    {[0, 1].map(i => <div key={i} className="tp-card" style={{ background: ok('surface', '#ffffff'), borderRadius: r, padding: gap }}>
      <span className="av" style={{ background: i ? ok(mod === 'social' ? 'tertiary' : 'accent', '#888888') : grad }} />
      <div><b>{mod === 'social' ? ['Riya’s new Loop', 'Weekend vibes'][i] : ['Design crew', 'Amma'][i]}</b><small style={{ opacity: .65 }}>{mod === 'social' ? '2.4k reactions' : ['See you at 6!', 'Call me back'][i]}</small></div></div>)}
    <button className="tp-btn" style={{ background: grad, borderRadius: r }}>{mod === 'social' ? 'Create' : 'New chat'}</button>
    <div className={'tp-nav ' + t.navStyle} style={{ background: t.navStyle === 'pill' ? ok('ink', '#000000') : ok('surface', '#ffffff'), borderRadius: t.navStyle === 'pill' ? 999 : 0 }}>
      {items.map((it, i) => <span key={it.key} className={i === 0 ? 'on' : ''} style={i === 0 ? (t.navStyle === 'pill' ? { background: grad, color: '#fff' } : { color: ok('primary', '#000000') }) : { color: t.navStyle === 'pill' ? 'rgba(255,255,255,.6)' : ok('ink', '#000000'), opacity: t.navStyle === 'pill' ? 1 : .55 }}>
        <Icon name={'t-' + it.icon} size={15} />{t.navStyle === 'dock' && <em>{it.label}</em>}</span>)}
    </div>
  </div></div>;
}

function ScreensPage() {
  const e = useLayerEditor();
  const [q, setQ] = useState('');
  return <Gate rs={e.rs}>{() => <>
    <LayerBar e={e} note="A screen that is off is hidden in the app and its API routes return 403 where enforced (Payout, Towns, Vibes)." />
    <Card title={`Screens · ${SCREEN_KEYS.length}`} extra={<div className="row"><Pill tone="red">{SCREEN_KEYS.filter(k => e.eff.screens[k] === false).length} off</Pill><Search v={q} set={setQ} ph="Filter screens…" /></div>}>
      {e.isLang && <div className="notready"><Icon name="key" size={16} /><span>Language layers can’t switch screens. Pick base, a country, zone or slab.</span></div>}
      <div className="sgrid">{SCREEN_KEYS.filter(k => (k + ' ' + (SCREEN_DESC[k] ?? '')).toLowerCase().includes(q.toLowerCase())).map(k => {
        const on = e.eff.screens[k] !== false; const set = e.draft.screens && k in e.draft.screens;
        return <div key={k} className={'stile' + (on ? '' : ' off') + (set ? ' set' : '')} data-screen={k}>
          <div className="grow"><b>{k}</b>{SCREEN_DESC[k] && <small>{SCREEN_DESC[k]}</small>}<small>{set ? <button className="linkbtn" onClick={() => e.upd(d => { delete d.screens[k]; })}>this layer · clear</button> : 'inherited'}</small></div>
          <Toggle label={k} on={on} disabled={e.isLang} onClick={() => e.upd(d => { d.screens = { ...(d.screens ?? {}), [k]: !on }; })} /></div>;
      })}</div>
    </Card>
  </>}</Gate>;
}

function LimitsPage() {
  const e = useLayerEditor();
  const num = (sec: 'limits' | 'fees', k: string) => {
    const set = e.draft[sec] && k in e.draft[sec];
    return <Field key={k} label={k} hint={LIMIT_DESC[k]}><Src set={!!set} /><input type="number" aria-label={k} disabled={e.isLang} step={sec === 'fees' ? 0.01 : 1} min={0} value={e.eff[sec][k] ?? ''}
      onChange={ev => e.upd(d => { d[sec] = { ...(d[sec] ?? {}), [k]: ev.target.value === '' ? 0 : Number(ev.target.value) }; })} />
      {set && <button className="iconbtn sm" aria-label={'Clear ' + k} onClick={() => e.upd(d => { delete d[sec][k]; })}><Icon name="x" size={13} /></button>}</Field>;
  };
  return <Gate rs={e.rs}>{() => <>
    <LayerBar e={e} note="Feature switches turn whole capabilities off (API enforces payouts, towns and statuses). Limits and fees are numbers the app and API read from the resolved config." />
    <div className="grid g2">
      <Card title="Feature switches" extra={<Pill tone="red">{FEATURE_KEYS.filter(k => e.eff.features[k] === false).length} off</Pill>}>
        {FEATURE_KEYS.map(k => { const on = e.eff.features[k] !== false; const set = e.draft.features && k in e.draft.features;
          return <div key={k} className="frow" data-feature={k}><div className="grow"><b>{FEATURE_DESC[k]}</b><code>features.{k}</code></div><Src set={!!set} />
            {set && <button className="iconbtn sm" aria-label={'Clear ' + k} onClick={() => e.upd(d => { delete d.features[k]; })}><Icon name="x" size={13} /></button>}
            <Toggle label={k} on={on} disabled={e.isLang} onClick={() => e.upd(d => { d.features = { ...(d.features ?? {}), [k]: !on }; })} /></div>; })}
      </Card>
      <div className="grid">
        <Card title="Limits">{Object.keys(e.eff.limits).map(k => num('limits', k))}</Card>
        <Card title="Fees">{Object.keys(e.eff.fees).map(k => num('fees', k))}<p className="note">Platform fee is stored as a fraction. Effective: {(Number(e.eff.fees.platformFee) * 100).toFixed(1)}%.</p></Card>
      </div>
    </div>
  </>}</Gate>;
}

function ZonesPage() {
  const z = useApi<Record<string, Zone>>('/admin/zones');
  const lr = useApi<LayersRes>('/admin/config/layers');
  const { run, busy } = useAct();
  const [draft, setDraft] = useState<[string, Zone][] | null>(null);
  const [nk, setNk] = useState('');
  const [probe, setProbe] = useState('');
  useEffect(() => { if (z.data) setDraft(Object.entries(z.data)); }, [z.data]);
  return <Gate rs={[z, lr]}>{() => {
    if (!draft) return null;
    const obj = Object.fromEntries(draft) as Record<string, Zone>;
    const dirty = JSON.stringify(obj) !== JSON.stringify(z.data);
    const setZ = (i: number, p: Partial<Zone>) => setDraft(d => d!.map((x, j) => j === i ? [x[0], { ...x[1], ...p }] : x));
    const countries = [...new Set([...SAMPLE_COUNTRIES, ...draft.flatMap(([, v]) => v.countries.filter(c => c !== '*')), ...(probe.length === 2 ? [probe] : [])])];
    return <div className="grid g2-1">
      <Card title="Zones" extra={<div className="row"><LivePill />{dirty ? <Pill tone="amber">Unsaved</Pill> : <Pill tone="gray">Saved</Pill>}</div>}>
        <p className="note">A country belongs to the first zone that lists it; <code>*</code> is the catch-all. States are stored but not used (the server doesn’t know a user’s state).</p>
        {draft.map(([k, v], i) => <div key={k} className="zrow">
          <div className="row"><code className="zk">{k}</code><input aria-label={k + ' name'} value={v.name} onChange={ev => setZ(i, { name: ev.target.value })} />
            <a className="link small" href={'#/navigation?layer=zone:' + k}>Layer zone:{k} {lr.data!.layers['zone:' + k] ? '(exists)' : ''} →</a>
            <button className="btn sm danger" style={{ marginLeft: 'auto' }} onClick={() => setDraft(d => d!.filter((_, j) => j !== i))}>Remove</button></div>
          <span className="lbl">Countries (ISO2, or *)</span><Chips mono items={v.countries} set={c => setZ(i, { countries: c.map(x => x.toUpperCase()) })} ph="Add country…" />
          {v.states && <><span className="lbl">States (stored only)</span><Chips mono items={v.states} set={s => setZ(i, { states: s })} ph="Add state…" /></>}
        </div>)}
        <form className="row mt" onSubmit={ev => { ev.preventDefault(); const k = nk.trim().toUpperCase(); if (k && !obj[k]) setDraft(d => [...d!, [k, { name: k, countries: [] }]]); setNk(''); }}>
          <input placeholder="NEW-ZONE-KEY" value={nk} onChange={ev => setNk(ev.target.value)} maxLength={30} /><button className="btn sm ghost" disabled={!nk.trim()}>Add zone</button></form>
        <div className={'savebar' + (dirty ? ' dirty' : '')}><span>{dirty ? 'Unsaved zone changes.' : 'Saving bumps the config version and is audited.'}</span>
          <div className="row"><button className="btn sm ghost" disabled={!dirty || busy} onClick={() => setDraft(Object.entries(z.data!))}>Discard</button>
            <button className="btn sm prism" disabled={!dirty || busy} onClick={() => run(() => api('/admin/zones', { method: 'PUT', body: obj }), 'Zones saved', z.reload)}>Save zones</button></div></div>
      </Card>
      <Card title="Country → zone" extra={<Pill tone="violet">{dirty ? 'from draft' : 'live'}</Pill>}>
        <label className="search mb"><Icon name="search" size={16} /><input aria-label="Check a country" placeholder="Check a country, e.g. LK" maxLength={2} value={probe} onChange={ev => setProbe(ev.target.value.toUpperCase())} /></label>
        <table><thead><tr><th>Country</th><th>Zone</th><th></th></tr></thead><tbody>{countries.map(c => { const zk = zoneFor(c, obj); return <tr key={c} className={c === probe ? 'hl' : ''}><td className="mono">{c}</td><td><b>{zk}</b> <span className="muted small">{obj[zk]?.name}</span></td>
          <td className="r"><a className="link small" href={'#/preview?country=' + c}>Preview →</a></td></tr>; })}</tbody></table>
      </Card>
    </div>;
  }}</Gate>;
}

function SlabsPage() {
  const s = useApi<Slab[]>('/admin/slabs');
  const lr = useApi<LayersRes>('/admin/config/layers');
  const { run, busy } = useAct();
  const [draft, setDraft] = useState<Slab[] | null>(null);
  useEffect(() => { if (s.data) setDraft(clone(s.data)); }, [s.data]);
  return <Gate rs={[s, lr]}>{() => {
    if (!draft) return null;
    const dirty = JSON.stringify(draft) !== JSON.stringify(s.data);
    const set = (i: number, p: Partial<Slab>) => setDraft(d => d!.map((x, j) => j === i ? { ...x, ...p } : x));
    return <>
      <Card title="Creator slabs" extra={<div className="row"><LivePill />{dirty ? <Pill tone="amber">Unsaved</Pill> : <Pill tone="gray">Saved</Pill>}</div>}>
        <p className="note">A creator is placed in the first slab whose follower range contains their follower count. Leave max empty for “and up”.</p>
        <table><thead><tr><th>Key</th><th>Name</th><th>Min followers</th><th>Max followers</th><th>Overrides (layer slab:key)</th><th></th></tr></thead><tbody>
          {draft.map((x, i) => { const L = lr.data!.layers['slab:' + x.key]; return <tr key={i}>
            <td><input className="mono" aria-label="key" value={x.key} onChange={ev => set(i, { key: ev.target.value.toLowerCase() })} /></td>
            <td><input aria-label="name" value={x.name} onChange={ev => set(i, { name: ev.target.value })} /></td>
            <td><input type="number" min={0} aria-label="min" value={x.minFollowers} onChange={ev => set(i, { minFollowers: Math.trunc(Number(ev.target.value)) })} /></td>
            <td><input type="number" min={0} aria-label="max" value={x.maxFollowers ?? ''} placeholder="∞" onChange={ev => { const n = { ...x }; if (ev.target.value === '') delete n.maxFollowers; else n.maxFollowers = Math.trunc(Number(ev.target.value)); setDraft(d => d!.map((y, j) => j === i ? n : y)); }} /></td>
            <td>{L ? <span className="row">{Object.keys(L).map(k => <Pill key={k} tone="violet">{k}</Pill>)}</span> : <span className="muted small">none</span>} <a className="link small" href={'#/limits?layer=slab:' + x.key}>Edit →</a></td>
            <td className="r"><button className="iconbtn sm" aria-label="Remove slab" onClick={() => setDraft(d => d!.filter((_, j) => j !== i))}><Icon name="x" size={13} /></button></td></tr>; })}
        </tbody></table>
        <button className="btn sm ghost mt" onClick={() => setDraft(d => [...d!, { key: 'new', name: 'New slab', minFollowers: 0 }])}>Add slab</button>
        <div className={'savebar' + (dirty ? ' dirty' : '')}><span>{dirty ? 'Unsaved slab changes.' : 'Saving bumps the config version and is audited.'}</span>
          <div className="row"><button className="btn sm ghost" disabled={!dirty || busy} onClick={() => setDraft(clone(s.data!))}>Discard</button>
            <button className="btn sm prism" disabled={!dirty || busy} onClick={() => run(() => api('/admin/slabs', { method: 'PUT', body: draft }), 'Slabs saved', s.reload)}>Save slabs</button></div></div>
      </Card>
      <Card title="Slab ladder"><div className="ladder">{draft.map(x => <div key={x.key}><b>{x.name}</b><small className="mono">{x.minFollowers.toLocaleString()} – {x.maxFollowers != null ? x.maxFollowers.toLocaleString() : '∞'}</small></div>)}</div></Card>
    </>;
  }}</Gate>;
}

function LanguagesPage() {
  useContext(RouteCtx);
  const lg = useApi<Langs>('/admin/languages');
  const lr = useApi<LayersRes>('/admin/config/layers');
  const toast = useContext(ToastCtx);
  const { run, busy } = useAct();
  const [ld, setLd] = useState<Langs | null>(null);
  useEffect(() => { if (lg.data) setLd(clone(lg.data)); }, [lg.data]);
  const code = hp('lang') || 'ta';
  const layer = lr.data?.layers['lang:' + code] ?? {};
  const savedStr = JSON.stringify(layer.languages?.strings ?? {});
  const [sd, setSd] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [nk, setNk] = useState(''); const [q, setQ] = useState('');
  useEffect(() => { setSd(JSON.parse(savedStr)); setErr(null); }, [savedStr, code]);
  return <Gate rs={[lg, lr]}>{() => {
    if (!ld) return null;
    const ldDirty = JSON.stringify(ld) !== JSON.stringify(lg.data);
    const keys = [...new Set([...MODS.flatMap(m => CFG_DEFAULTS.nav[m].map((i: J) => 'nav.' + i.key)), ...Object.values(lr.data!.layers).flatMap(l => Object.keys(l.languages?.strings ?? {})), ...Object.keys(sd)])].sort();
    const enNav = Object.fromEntries(MODS.flatMap(m => CFG_DEFAULTS.nav[m].map((i: J) => ['nav.' + i.key, i.label])));
    const sDirty = JSON.stringify(sd) !== savedStr;
    const shown = keys.filter(k => (k + ' ' + (sd[k] ?? '')).toLowerCase().includes(q.toLowerCase()));
    const done = keys.filter(k => sd[k]).length;
    return <>
      <div className="grid g2">
        <Card title="Available languages" extra={<div className="row"><LivePill />{ldDirty ? <Pill tone="amber">Unsaved</Pill> : <Pill tone="gray">Saved</Pill>}</div>}>
          <Chips mono items={ld.available} set={a => setLd({ ...ld, available: a.map(x => x.toLowerCase()) })} ph="Add code (e.g. gu)…" />
          <Field label="Default language" hint="Used when the user and device give none"><select aria-label="Default language" value={ld.default} onChange={ev => setLd({ ...ld, default: ev.target.value })}>{ld.available.map(l => <option key={l} value={l}>{l} · {LANG_NAMES[l] ?? l}</option>)}</select></Field>
          <div className={'savebar' + (ldDirty ? ' dirty' : '')}><span>{ldDirty ? 'Unsaved.' : 'The default must be in the list (server-checked).'}</span>
            <div className="row"><button className="btn sm ghost" disabled={!ldDirty || busy} onClick={() => setLd(clone(lg.data!))}>Discard</button>
              <button className="btn sm prism" disabled={!ldDirty || busy} onClick={() => run(() => api('/admin/languages', { method: 'PUT', body: ld }), 'Languages saved', lg.reload)}>Save languages</button></div></div>
        </Card>
        <Card title="Translation coverage">{ld.available.filter(l => l !== 'en').map(l => { const n = Object.keys(lr.data!.layers['lang:' + l]?.languages?.strings ?? {}).length;
          return <a key={l} href={'#/languages?lang=' + l} className={'qrow langrow' + (l === code ? ' on' : '')}><span><b>{LANG_NAMES[l] ?? l}</b> <code>{l}</code></span><Bar v={n} max={Math.max(keys.length, 1)} /><span className="num">{n}/{keys.length}</span></a>; })}</Card>
      </div>
      <Card title={`Strings · lang:${code} (${LANG_NAMES[code] ?? code})`} extra={<div className="row"><Pill tone="violet">{done}/{keys.length} translated</Pill>{sDirty ? <Pill tone="amber">Unsaved</Pill> : <Pill tone="gray">Saved</Pill>}<Search v={q} set={setQ} ph="Filter keys…" /></div>}>
        <p className="note">Empty means the app falls back to English. <code>nav.&lt;Key&gt;</code> strings also rename bottom tabs. Saved to layer <code>lang:{code}</code>.</p>
        <table className="strings"><thead><tr><th>Key</th><th>English fallback</th><th>{LANG_NAMES[code] ?? code}</th></tr></thead><tbody>
          {shown.map(k => <tr key={k} className={sd[k] ? '' : 'missing'}><td className="mono small">{k}</td><td className="muted">{enNav[k] ?? enFor(k)}</td>
            <td><input className="wide" aria-label={k} value={sd[k] ?? ''} placeholder="(English)" onChange={ev => setSd(s => { const n = { ...s }; if (ev.target.value) n[k] = ev.target.value; else delete n[k]; return n; })} /></td></tr>)}
        </tbody></table>
        <form className="row mt" onSubmit={ev => { ev.preventDefault(); const k = nk.trim(); if (k) setSd(s => ({ ...s, [k]: s[k] ?? '…' })); setNk(''); }}><input className="mono" placeholder="section.NewKey" value={nk} onChange={ev => setNk(ev.target.value)} /><button className="btn sm ghost" disabled={!nk.trim()}>Add key</button></form>
        {err && <div className="errbox" role="alert">Server rejected the save: {err}</div>}
        <div className={'savebar' + (sDirty ? ' dirty' : '')}><span>{sDirty ? `Unsaved strings for ${code}.` : 'Saving bumps the config version and is audited.'}</span>
          <div className="row"><button className="btn sm ghost" disabled={!sDirty || busy} onClick={() => setSd(JSON.parse(savedStr))}>Discard</button>
            <button className="btn sm prism" disabled={!sDirty || busy} onClick={() => run(() => api<{ version: number }>(`/admin/config/${encodeURIComponent('lang:' + code)}`, { method: 'PUT', body: { ...layer, languages: { ...(layer.languages ?? {}), strings: sd } } }).catch(e => { setErr((e as Error).message); throw e; }),
              undefined, r => { setErr(null); toast(`Saved lang:${code} · config v${r.version}`); lr.reload(); })}>Save strings</button></div></div>
      </Card>
    </>;
  }}</Gate>;
}

function PreviewPage() {
  useContext(RouteCtx);
  const country = (hp('country') || 'IN').toUpperCase(); const lang = hp('lang') || 'en'; const slab = hp('slab') || '';
  const [cc, setCc] = useState(country);
  useEffect(() => setCc(country), [country]);
  const lg = useApi<Langs>('/admin/languages'); const sl = useApi<Slab[]>('/admin/slabs');
  const p = useApi<J>(`/admin/config/preview?country=${country}&lang=${lang}${slab ? '&slab=' + slab : ''}`);
  return <Gate rs={[lg, sl, p]}>{() => {
    const c = p.data;
    const off = (o: Record<string, boolean>) => Object.keys(o).filter(k => o[k] === false);
    const screensOff = [...new Set([...off(c.screens), ...SCREEN_KEYS.filter(k => c.screens[k] === false)])];
    return <>
      <Card title="Context" extra={<div className="row"><LivePill /><Pill tone="violet">config v{c.version}</Pill></div>}>
        <div className="row">
          <form className="row" onSubmit={ev => { ev.preventDefault(); if (/^[A-Z]{2}$/.test(cc)) setHp('country', cc); }}><span className="small muted">Country</span><input className="cc" aria-label="Country" maxLength={2} value={cc} onChange={ev => setCc(ev.target.value.toUpperCase())} /><button className="btn sm ghost">Apply</button></form>
          <span className="small muted">Slab</span><select aria-label="Slab" value={slab} onChange={ev => setHp('slab', ev.target.value || null)}><option value="">auto (new user → {sl.data![0]?.key})</option>{sl.data!.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}</select>
          <span className="small muted">Language</span><select aria-label="Language" value={lang} onChange={ev => setHp('lang', ev.target.value)}>{lg.data!.available.map(l => <option key={l} value={l}>{l} · {LANG_NAMES[l] ?? l}</option>)}</select>
        </div>
        <div className="row mt">Resolved for {Object.entries(c.resolvedFor as Record<string, string>).map(([k, v]) => <Pill key={k} tone="gray">{k}: {v}</Pill>)}
          <span className="small muted">Layers applied: base → country:{c.resolvedFor.country} → zone:{c.resolvedFor.zone} → slab:{c.resolvedFor.slab} → lang:{c.resolvedFor.lang} (where they exist)</span></div>
      </Card>
      <div className="grid g1-2">
        <div className="phones">{MODS.map(m => <div key={m} className="phone"><div className="notch" />
          <div className="phone-scr"><small>{cap(m)} module</small><b>{c.nav[m].find((x: J) => x.enabled !== false)?.label ?? '—'}</b>{c.banner && <div className="pbanner">{c.banner.text}</div>}{c.modules[m] === false && <div className="phone-off">Module turned off</div>}</div>
          <TabBar items={c.modules[m] === false ? [] : c.nav[m]} /></div>)}</div>
        <div className="grid">
          <Card title="Turned off here" extra={<Pill tone="red">{screensOff.length + off(c.features).length + off(c.modules).length}</Pill>}>
            <span className="lbl">Modules</span><div className="chips">{off(c.modules).length ? off(c.modules).map(k => <span key={k} className="chip offc">{k}</span>) : <span className="muted small">All on</span>}</div>
            <span className="lbl">Screens</span><div className="chips">{screensOff.length ? screensOff.map(k => <span key={k} className="chip offc">{k}</span>) : <span className="muted small">All on</span>}</div>
            <span className="lbl">Features</span><div className="chips">{off(c.features).length ? off(c.features).map(k => <span key={k} className="chip offc">{k}</span>) : <span className="muted small">All on</span>}</div>
            {c.banner && <><span className="lbl">Banner</span><div className="banner info">{c.banner.text}</div></>}
          </Card>
          {c.theme && <Card title="Theme" extra={<Pill tone="gray">hash {c.theme.hash}</Pill>}>{MODS.map(m => <div key={m} className="pvtheme">
            <span className="lbl">{cap(m)} · {c.theme[m].preset} · {c.theme[m].navStyle} · {c.theme[m].radius} · {c.theme[m].density}</span>
            <div className="chips">{THEME_COLORS[m].map(k => <span key={k} className="chip tsw"><i style={{ background: c.theme[m][k] }} />{k} <code>{c.theme[m][k]}</code></span>)}</div></div>)}
            <a className="link small" href="#/themes">Edit themes →</a></Card>}
          <Card title="Limits & fees"><div className="kv">{Object.entries({ ...c.limits, ...c.fees } as Record<string, number>).map(([k, v]) => <Fragment key={k}><span>{k}</span><b className="num">{k === 'platformFee' ? (v * 100).toFixed(1) + '%' : v}</b></Fragment>)}</div>
            <p className="note">Language default <code>{c.languages.default}</code> · {Object.keys(c.languages.strings ?? {}).length} strings resolved.</p></Card>
        </div>
      </div>
    </>;
  }}</Gate>;
}

/* ===================== Identity & chat ===================== */
type OtpRow = { id: string; identifier: string; at: number; ip: string; verified: boolean; attempts: number; rateLimited: boolean };
type IdentityRes = { accountsPerEmail: { email: string; count: number }[]; handleChanges: { id: string; userId: string; old: string; new: string; at: number }[]; reserved: string[] };
type Town = { id: string; name: string; open: boolean; members: number; owner: string | null; suspended: boolean; at: number };
type ChatStats = { convs: number; messages: number; requestsPending: number; statuses24h: number; towns: number };
const KILLS: [string, string, string][] = [['otp', 'OTP & registration', 'Blocks /auth/otp/request and /auth/register'], ['chat', 'Chat module', 'Friends, convs, messages, statuses, towns return 503'], ['social', 'Social posting', 'Blocks /posts']];

function KillCard({ keys }: { keys: [string, string, string][] }) {
  const kill = useKv<{ on: boolean }>('kill');
  const { run, busy } = useAct();
  const [arm, setArm] = useState<string | null>(null);
  return <Gate rs={[kill]}>{() => <Card title="Kill switches" className="ink">{keys.map(([k, l, d]) => { const on = !!kill.data![k]?.on;
    return <div key={k} className="frow"><div className="grow"><b>{l}</b><small>{d}</small><code>kill/{k}</code>
      {arm === k && <div className="row mt"><button className="btn sm danger" disabled={busy} onClick={() => run(() => kvPut('kill', k, { on: true }), `Kill switch ${k} ENGAGED`, () => { setArm(null); kill.reload(); })}>Confirm engage</button><button className="btn sm ghostd" onClick={() => setArm(null)}>Cancel</button></div>}</div>
      <Toggle danger disabled={busy} label={l} on={on} onClick={() => on ? run(() => kvPut('kill', k, { on: false }), `Kill switch ${k} off`, kill.reload) : setArm(k)} /></div>; })}
    <p className="note">Enforced by API middleware; every change is audited.</p></Card>}</Gate>;
}

function OtpPage() {
  const o = useApi<OtpRow[]>('/admin/otp');
  const [f, setF] = useState<'all' | 'limited' | 'unverified'>('all');
  return <Gate rs={[o]}>{() => {
    const rows = o.data!; const shown = rows.filter(r => f === 'all' || (f === 'limited' ? r.rateLimited : !r.verified));
    return <>
      <div className="kpis">
        <Kpi label="OTP requests (last 200)" value={String(rows.length)} sub={`${new Set(rows.map(r => r.identifier)).size} identifiers`} />
        <Kpi label="Verified" value={String(rows.filter(r => r.verified).length)} sub={rows.length ? `${Math.round(100 * rows.filter(r => r.verified).length / rows.length)}% success` : '—'} tone="good" />
        <Kpi label="Rate-limited" value={String(rows.filter(r => r.rateLimited).length)} sub="5 per identifier / IP per 15 min" tone={rows.some(r => r.rateLimited) ? 'bad' : 'good'} />
        <Kpi label="Wrong attempts" value={String(rows.reduce((a, r) => a + r.attempts, 0))} sub="Code locks after 5" />
      </div>
      <div className="grid g2-1">
        <Card title="OTP & login monitor" extra={<div className="row"><LivePill /><Tabs v={f} set={setF} opts={[['all', 'All'], ['limited', 'Rate-limited'], ['unverified', 'Unverified']]} /></div>}>
          <p className="note">Identifiers and IPs are masked by the server. Demo mode returns codes in the response; no email is sent.</p>
          <table><thead><tr><th>When</th><th>Identifier</th><th>IP</th><th>Attempts</th><th>Status</th></tr></thead><tbody>
            {shown.map(r => <tr key={r.id}><td className="small">{when(r.at)}</td><td className="mono">{r.identifier}</td><td className="mono small">{r.ip}</td><td className="num">{r.attempts}</td>
              <td><div className="row">{r.verified ? <Pill tone="mint">verified</Pill> : <Pill tone="gray">unverified</Pill>}{r.rateLimited && <Pill tone="red">rate-limited</Pill>}</div></td></tr>)}
            {!shown.length && <tr><td colSpan={5} className="empty">No OTP requests match.</td></tr>}</tbody></table>
        </Card>
        <KillCard keys={KILLS} />
      </div>
    </>;
  }}</Gate>;
}

function IdentityPage() {
  const r = useApi<IdentityRes>('/admin/identity');
  const { run, busy } = useAct();
  const [h, setH] = useState('');
  return <Gate rs={[r]}>{() => { const d = r.data!; const cap5 = 5;
    const add = () => { const v = h.trim().replace(/^@/, ''); if (v) run(() => kvPut('reserved', v, { on: true }), `Reserved @${v.toLowerCase()}`, () => { setH(''); r.reload(); }); };
    return <>
      <div className="kpis k3">
        <Kpi label="Emails with accounts" value={String(d.accountsPerEmail.length)} sub={`${d.accountsPerEmail.reduce((a, x) => a + x.count, 0)} accounts`} />
        <Kpi label="Emails at cap" value={String(d.accountsPerEmail.filter(x => x.count >= cap5).length)} sub={`Cap is ${cap5} per email`} />
        <Kpi label="Handle changes" value={String(d.handleChanges.length)} sub={`${d.reserved.length} reserved handles`} />
      </div>
      <div className="grid g2">
        <Card title="Accounts per email" extra={<LivePill />}>
          <table><thead><tr><th>Email (masked)</th><th>Accounts</th><th></th></tr></thead><tbody>{d.accountsPerEmail.slice(0, 12).map((x, i) => <tr key={i}><td className="mono">{x.email}</td>
            <td style={{ width: '40%' }}><Bar v={x.count} max={cap5} tone={x.count >= cap5 ? 'red' : 'prism'} /></td><td className="num r">{x.count}/{cap5}</td></tr>)}</tbody></table>
          {d.accountsPerEmail.length > 12 && <p className="note">+{d.accountsPerEmail.length - 12} more emails with fewer accounts.</p>}
        </Card>
        <div className="grid">
          <Card title="Reserved handles" extra={<Pill tone="violet">{d.reserved.length}</Pill>}>
            <p className="note">Reserved handles can’t be registered or changed to. Stored at <code>reserved/&lt;handle&gt;</code>; removing sets <code>{'{on:false}'}</code>.</p>
            <div className="chips">{d.reserved.map(x => <span key={x} className="chip mono">@{x}<button aria-label={'Release ' + x} disabled={busy} onClick={() => run(() => kvPut('reserved', x, { on: false }), `Released @${x}`, r.reload)}><Icon name="x" size={12} /></button></span>)}
              {!d.reserved.length && <span className="muted small">None reserved yet.</span>}</div>
            <form className="row mt" onSubmit={ev => { ev.preventDefault(); add(); }}><input className="mono" aria-label="Handle to reserve" placeholder="@brandname" value={h} onChange={ev => setH(ev.target.value)} maxLength={21} /><button className="btn sm prism" disabled={!h.trim() || busy}>Reserve</button></form>
          </Card>
          <Card title="Handle changes">
            <table><thead><tr><th>When</th><th>User</th><th>Old</th><th>New</th></tr></thead><tbody>{d.handleChanges.map(x => <tr key={x.id}><td className="small">{when(x.at)}</td><td className="mono small">{x.userId}</td><td className="mono">{x.old}</td><td className="mono">{x.new}</td></tr>)}
              {!d.handleChanges.length && <tr><td colSpan={4} className="empty">No handle changes yet.</td></tr>}</tbody></table>
          </Card>
        </div>
      </div>
    </>; }}</Gate>;
}

function ChatPage() {
  const st = useApi<ChatStats>('/admin/chat-stats');
  const tw = useApi<Town[]>('/admin/towns');
  const { run, busy } = useAct();
  return <Gate rs={[st, tw]}>{() => { const s = st.data!;
    return <>
      <div className="kpis k5">
        <Kpi label="Conversations" value={String(s.convs)} /><Kpi label="Messages" value={String(s.messages)} /><Kpi label="Pending requests" value={String(s.requestsPending)} sub="Friend + message requests" />
        <Kpi label="Vibes (24h)" value={String(s.statuses24h)} /><Kpi label="Towns" value={String(s.towns)} sub={`${tw.data!.filter(t => t.suspended).length} suspended`} />
      </div>
      <Card title="Towns" extra={<LivePill />}>
        <table><thead><tr><th>Town</th><th>Owner</th><th>Members</th><th>Access</th><th>Created</th><th>Status</th><th className="r">Suspend</th></tr></thead><tbody>
          {tw.data!.map(t => <tr key={t.id} className={t.suspended ? 'dim' : ''}><td><b>{t.name}</b><small className="mono">{t.id}</small></td><td className="mono">{t.owner ?? '—'}</td><td className="num">{t.members}</td>
            <td>{t.open ? <Pill tone="mint">open</Pill> : <Pill tone="violet">invite-only</Pill>}</td><td className="small">{when(t.at)}</td><td><St v={t.suspended ? 'suspended' : 'active'} /></td>
            <td className="r"><Toggle danger label={'Suspend ' + t.name} disabled={busy} on={t.suspended} onClick={() => run(() => api(`/admin/towns/${t.id}`, { method: 'PATCH', body: { suspended: !t.suspended } }), `${t.name} ${t.suspended ? 'restored' : 'suspended'}`, tw.reload)} /></td></tr>)}
          {!tw.data!.length && <tr><td colSpan={7} className="empty">No towns yet.</td></tr>}</tbody></table>
        <p className="note">Suspended towns return 404 to non-members. Every change is audited.</p>
      </Card>
      <KillCard keys={[KILLS[1]]} />
    </>; }}</Gate>;
}

function DashConfig() {
  const lr = useApi<LayersRes>('/admin/config/layers');
  const cs = useApi<ChatStats>('/admin/chat-stats');
  return <div className="grid g1-2">
    <Card title={lr.data ? `App config v${lr.data.version}` : 'App config'} extra={<a className="link" href="#/preview">Preview →</a>}>
      {lr.error ? <span className="red small">{lr.error}</span> : !lr.data ? <p className="loading">Loading…</p> : <>
        <div className="cfgv"><strong>v{lr.data.version}</strong><span>{Object.keys(lr.data.layers).length} layers saved</span></div>
        <div className="chips">{Object.keys(lr.data.layers).sort().map(k => <a key={k} className="chip mono" href={'#/navigation' + (k === 'base' ? '' : '?layer=' + k)}>{k}</a>)}</div></>}
    </Card>
    <Card title="Chat" extra={<a className="link" href="#/chat">Chat & Towns →</a>}>
      {cs.error ? <span className="red small">{cs.error}</span> : !cs.data ? <p className="loading">Loading…</p> :
        <div className="minis">{([['Convs', cs.data.convs], ['Messages', cs.data.messages], ['Requests', cs.data.requestsPending], ['Vibes 24h', cs.data.statuses24h], ['Towns', cs.data.towns]] as [string, number][]).map(([l, v]) => <div key={l}><strong>{v}</strong><span>{l}</span></div>)}</div>}
    </Card>
  </div>;
}

/* ===================== Money & growth (v3) ===================== */
type MoneySettings = { money: boolean; subscriptions: boolean; store: boolean; tips: boolean; ads: boolean; platformFees: boolean; feePercent: number; minPayout: number; currency: string };
type PlanRow = { id?: string; name: string; perks: string[]; period: 'month' | 'year'; prices: Record<string, number>; active: boolean; demo?: boolean; sort: number };
type CountryPricing = Record<string, { currency: string; symbol: string }>;
type AdRow = { id?: string; title: string; body: string; cta: string; url: string; sponsor: string; places: string[]; active: boolean; demo?: boolean; impressions?: number };
type AdSlabs = Record<string, { enabled: boolean; places: string[]; frequency: number }>;
type Price = { amount: number; currency: string; display: string };
type ProductRow = { id: string; creatorId: string; creatorHandle?: string; title: string; desc: string; price: Price; kind: string; stock: number | null; active: boolean; demo: boolean };
type OrderRow = { id: string; kind: string; amount: number; currency: string; provider: string; status: string; fee: number; testMode: boolean; at: number };
type Income = { currency: string; paidOrders: number; pending: number; activeSubscriptions: number; adImpressions: number; note: string;
  totals: { fees: number; subs: number; store: number; tips: number; ads: number; platform: number }; byDay: { day: string; fees: number; subs: number; store: number; tips: number; orders: number }[] };
type Plug = Record<string, string | boolean | null | undefined> & { configured: boolean; mode: string };
const MONEY_SWITCHES: [keyof MoneySettings, string, string][] = [
  ['subscriptions', 'Backstage Pass', 'Monthly plans fans subscribe to (subscriptions)'], ['store', 'Stash', 'Creator store for digital & physical goods'],
  ['tips', 'Props', 'Fans tip creators directly'], ['ads', 'Boosts', 'Sponsored cards in feeds for enabled slabs'], ['platformFees', 'Platform fee', 'Take a % of Stash sales and Props when they are paid']];
const paise = (n: number, sym = '₹') => sym + (n / 100).toLocaleString('en-IN', { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 });
const clone2 = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
function SaveBar({ dirty, busy, msg, onDiscard, onSave, label }: { dirty: boolean; busy: boolean; msg: string; onDiscard: () => void; onSave: () => void; label: string }) {
  return <div className={'savebar' + (dirty ? ' dirty' : '')}><span>{dirty ? 'Unsaved changes.' : msg}</span>
    <div className="row"><button className="btn sm ghost" disabled={!dirty || busy} onClick={onDiscard}>Discard</button><button className="btn sm prism" disabled={!dirty || busy} onClick={onSave}>{label}</button></div></div>;
}

function CashFlowPage() {
  const inc = useApi<Income>('/admin/money/income');
  const st = useApi<MoneySettings>('/admin/money/settings');
  return <Gate rs={[inc, st]}>{() => {
    const i = inc.data!, s = st.data!, t = i.totals; const max = Math.max(1, ...i.byDay.map(d => d.fees + d.subs));
    return <>
      {!s.money && <NotReady>Money is switched off — the app hides every money screen and the API answers 403. Turn it on in <a className="link" href="#/money">Money switches</a>.</NotReady>}
      <div className="kpis">
        <Kpi label="Platform income" value={paise(t.platform)} sub="Fees + Backstage Pass" tone={t.platform ? 'good' : ''} />
        <Kpi label="Paid orders" value={String(i.paidOrders)} sub={`${i.pending} awaiting payment`} />
        <Kpi label="Active Backstage Passes" value={String(i.activeSubscriptions)} sub={paise(t.subs) + ' collected'} />
        <Kpi label="Boost impressions" value={i.adImpressions.toLocaleString()} sub="Ad income ₹0 · no paid booking yet" />
      </div>
      <div className="grid g2-1">
        <Card title="Income by day" extra={<LivePill />}>{i.byDay.length ? <div className="vbars">{i.byDay.slice(-14).map(d => <div key={d.day}><span className="num">{paise(d.fees + d.subs)}</span><i style={{ height: ((d.fees + d.subs) / max) * 160 }} /><small>{d.day.slice(5)}</small></div>)}</div>
          : <div className="empty"><b>No real income yet.</b><br />Nothing is counted until a payment provider confirms a payment with a signed webhook. Demo plans and products never count here.</div>}</Card>
        <Card title="Breakdown"><div className="kv"><span>Platform fees</span><b>{paise(t.fees)}</b><span>Backstage Pass</span><b>{paise(t.subs)}</b><span>Stash sales (creators)</span><b>{paise(t.store)}</b><span>Props (creators)</span><b>{paise(t.tips)}</b><span>Boosts</span><b>{paise(t.ads)}</b></div>
          <p className="note">{i.note}</p></Card>
      </div>
    </>;
  }}</Gate>;
}

function MoneyPage() {
  const st = useApi<MoneySettings>('/admin/money/settings');
  const plugs = useApi<Record<string, Plug>>('/admin/integrations');
  const { run, busy } = useAct();
  const [d, setD] = useState<MoneySettings | null>(null);
  useEffect(() => { if (st.data) setD(clone2(st.data)); }, [st.data]);
  return <Gate rs={[st, plugs]}>{() => {
    if (!d) return null;
    const dirty = JSON.stringify(d) !== JSON.stringify(st.data); const set = (p: Partial<MoneySettings>) => setD({ ...d, ...p });
    const payReady = plugs.data!.razorpay?.configured || plugs.data!.cashfree?.configured;
    return <>
      <Card title="Master switch" extra={<div className="row"><LivePill />{d.money ? <Pill tone="mint">Money ON</Pill> : <Pill tone="gray">Money OFF</Pill>}</div>}>
        <Field label="Money" hint="Off = the app hides all money UI and the API returns 403 for every money endpoint. Each module below also needs its own switch."><Toggle label="Money master switch" on={d.money} onClick={() => set({ money: !d.money })} /></Field>
        {!payReady && <NotReady>No payment Plug is connected — even with money on, checkout answers “Payments not configured by admin”. Connect <a className="link" href="#/plugs">Razorpay or Cashfree</a>.</NotReady>}
      </Card>
      <Card title="Modules">
        {MONEY_SWITCHES.map(([k, l, h]) => <Field key={k} label={l} hint={h + (!d.money ? ' · inactive while the master switch is off' : '')}><Toggle label={l} on={!!d[k]} onClick={() => set({ [k]: !d[k] } as Partial<MoneySettings>)} /></Field>)}
        <Field label="Platform fee" hint="Taken when a Stash order or Props payment is confirmed."><input type="number" min={0} max={50} step={0.5} value={d.feePercent} onChange={e => set({ feePercent: +e.target.value })} /> <span className="muted">%</span></Field>
        <Field label="Minimum Cashout" hint="Smallest balance a creator can withdraw."><span className="muted">₹</span><input type="number" min={0} value={d.minPayout / 100} onChange={e => set({ minPayout: Math.round(+e.target.value * 100) })} /></Field>
        <Field label="Base currency" hint="Prices are stored in paise. Other countries use the Country pricing table."><select value={d.currency} onChange={e => set({ currency: e.target.value })}><option>INR</option></select></Field>
        <SaveBar dirty={dirty} busy={busy} msg="Saving mirrors the switches into the config base layer (features.*) and bumps the config version." onDiscard={() => setD(clone2(st.data!))}
          onSave={() => run(() => api<MoneySettings & { configVersion: number }>('/admin/money/settings', { method: 'PUT', body: d }), 'Money settings saved', st.reload)} label="Save money settings" />
      </Card>
    </>;
  }}</Gate>;
}

function PlansPage() {
  const pl = useApi<PlanRow[]>('/admin/money/plans');
  const cp = useApi<CountryPricing>('/admin/money/country-pricing');
  const { run, busy } = useAct();
  const [d, setD] = useState<PlanRow[] | null>(null);
  useEffect(() => { if (pl.data) setD(clone2(pl.data)); }, [pl.data]);
  return <Gate rs={[pl, cp]}>{() => {
    if (!d) return null;
    const cs = Object.entries(cp.data!); const dirty = JSON.stringify(d) !== JSON.stringify(pl.data);
    const set = (i: number, p: Partial<PlanRow>) => setD(d.map((x, j) => j === i ? { ...x, ...p } : x));
    return <Card title={`Backstage Pass plans · ${d.length}`} extra={<div className="row"><LivePill />{dirty ? <Pill tone="amber">Unsaved</Pill> : <Pill tone="gray">Saved</Pill>}</div>}>
      <p className="note">Prices are in each country’s currency (from Country pricing). A fan sees their country’s price, else the India (₹) price. Plans removed here are deactivated, not deleted.</p>
      {d.map((p, i) => <div key={p.id ?? i} className="card fsec">
        <div className="row"><input aria-label="Plan name" value={p.name} onChange={e => set(i, { name: e.target.value })} />{p.demo && <Demo />}
          <select aria-label="Period" value={p.period} onChange={e => set(i, { period: e.target.value as 'month' | 'year' })}><option value="month">per month</option><option value="year">per year</option></select>
          <Toggle label="Active" on={p.active} onClick={() => set(i, { active: !p.active })} /><span className="muted small">{p.active ? 'active' : 'inactive'}</span>
          <button className="iconbtn sm" aria-label="Remove plan" onClick={() => setD(d.filter((_, j) => j !== i))}><Icon name="x" size={13} /></button></div>
        <label className="lbl">Perks</label><Chips items={p.perks} set={v => set(i, { perks: v })} ph="Add a perk" />
        <label className="lbl">Prices by country</label>
        <div className="row">{cs.map(([c, v]) => <label key={c} className="row small"><b className="mono">{c}</b><span className="muted">{v.symbol}</span>
          <input type="number" min={0} step={0.01} style={{ width: 90 }} aria-label={`${c} price`} value={p.prices[c] != null ? p.prices[c] / 100 : ''} placeholder="—"
            onChange={e => { const pr = { ...p.prices }; if (e.target.value === '') delete pr[c]; else pr[c] = Math.round(+e.target.value * 100); set(i, { prices: pr }); }} /></label>)}</div>
      </div>)}
      <button className="btn sm ghost mt" onClick={() => setD([...d, { name: 'New plan', perks: [], period: 'month', prices: {}, active: true, sort: d.length + 1 }])}>Add plan</button>
      <SaveBar dirty={dirty} busy={busy} msg="Plans are shown only when Money and Backstage Pass are on." onDiscard={() => setD(clone2(pl.data!))}
        onSave={() => run(() => api('/admin/money/plans', { method: 'PUT', body: d }), 'Plans saved', pl.reload)} label="Save plans" />
    </Card>;
  }}</Gate>;
}

function CountriesPage() {
  const cp = useApi<CountryPricing>('/admin/money/country-pricing');
  const { run, busy } = useAct();
  const [d, setD] = useState<[string, string, string][] | null>(null);
  const reset = () => setD(Object.entries(cp.data!).map(([c, v]) => [c, v.currency, v.symbol]));
  useEffect(() => { if (cp.data) reset(); }, [cp.data]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Gate rs={[cp]}>{() => {
    if (!d) return null;
    const body = Object.fromEntries(d.map(([c, cur, s]) => [c, { currency: cur, symbol: s }])); const dirty = JSON.stringify(body) !== JSON.stringify(cp.data);
    const set = (i: number, k: number, v: string) => setD(d.map((r, j) => j === i ? r.map((x, n) => n === k ? v : x) as [string, string, string] : r));
    return <Card title={`Country pricing · ${d.length}`} extra={<div className="row"><LivePill />{dirty ? <Pill tone="amber">Unsaved</Pill> : <Pill tone="gray">Saved</Pill>}</div>}>
      <p className="note">Each country listed here can get its own plan price. IN (₹ INR) is the base and can’t be removed.</p>
      <table><thead><tr><th>Country (ISO2)</th><th>Currency</th><th>Symbol</th><th>Example</th><th /></tr></thead><tbody>
        {d.map(([c, cur, s], i) => <tr key={i}><td><input className="mono" aria-label="country" value={c} maxLength={2} onChange={e => set(i, 0, e.target.value.toUpperCase())} /></td>
          <td><input className="mono" aria-label="currency" value={cur} maxLength={3} onChange={e => set(i, 1, e.target.value.toUpperCase())} /></td>
          <td><input aria-label="symbol" value={s} maxLength={5} onChange={e => set(i, 2, e.target.value)} /></td><td className="muted">{s}99</td>
          <td className="r">{c !== 'IN' && <button className="iconbtn sm" aria-label="Remove country" onClick={() => setD(d.filter((_, j) => j !== i))}><Icon name="x" size={13} /></button>}</td></tr>)}
      </tbody></table>
      <button className="btn sm ghost mt" onClick={() => setD([...d, ['', '', '']])}>Add country</button>
      <SaveBar dirty={dirty} busy={busy} msg="Changes are audited." onDiscard={reset} onSave={() => run(() => api('/admin/money/country-pricing', { method: 'PUT', body }), 'Country pricing saved', cp.reload)} label="Save countries" />
    </Card>;
  }}</Gate>;
}

const PLACES = ['feed', 'explore', 'chat_list'];
function BoostsPage() {
  const ads = useApi<AdRow[]>('/admin/ads');
  const sl = useApi<AdSlabs>('/admin/ads/slabs');
  const slabs = useApi<Slab[]>('/admin/slabs');
  const { run, busy } = useAct();
  const [d, setD] = useState<AdRow[] | null>(null); const [ds, setDs] = useState<AdSlabs | null>(null);
  useEffect(() => { if (ads.data) setD(clone2(ads.data)); }, [ads.data]);
  useEffect(() => { if (sl.data && slabs.data) setDs(Object.fromEntries(slabs.data.map(s => [s.key, sl.data![s.key] ?? { enabled: false, places: [], frequency: 8 }]))); }, [sl.data, slabs.data]);
  return <Gate rs={[ads, sl, slabs]}>{() => {
    if (!d || !ds) return null;
    const dirty = JSON.stringify(d) !== JSON.stringify(ads.data); const sdirty = JSON.stringify(ds) !== JSON.stringify(sl.data);
    const set = (i: number, p: Partial<AdRow>) => setD(d.map((x, j) => j === i ? { ...x, ...p } : x));
    const sset = (k: string, p: Partial<AdSlabs[string]>) => setDs({ ...ds, [k]: { ...ds[k], ...p } });
    return <>
      <Card title="Ad slabs" extra={<div className="row"><LivePill />{sdirty ? <Pill tone="amber">Unsaved</Pill> : <Pill tone="gray">Saved</Pill>}</div>}>
        <p className="note">Boosts appear only for viewers in an enabled slab, only in the chosen places, at most one per N posts — and only while Money and Boosts are on.</p>
        <table><thead><tr><th>Slab</th><th>Boosts</th><th>Places</th><th>Every N posts</th></tr></thead><tbody>
          {slabs.data!.map(s => { const v = ds[s.key]; return <tr key={s.key}><td><b>{s.name}</b> <small className="mono muted">{s.key}</small></td>
            <td><Toggle label={`Boosts for ${s.name}`} on={v.enabled} onClick={() => sset(s.key, { enabled: !v.enabled })} /></td>
            <td><div className="row">{PLACES.map(p => { const on = v.places.includes(p); return <button key={p} className={'btn sm ' + (on ? 'prism' : 'ghost')} onClick={() => sset(s.key, { places: on ? v.places.filter(x => x !== p) : [...v.places, p] })}>{p}</button>; })}</div></td>
            <td><input type="number" min={3} max={50} aria-label="frequency" value={v.frequency} onChange={e => sset(s.key, { frequency: Math.trunc(+e.target.value) })} /></td></tr>; })}
        </tbody></table>
        <SaveBar dirty={sdirty} busy={busy} msg="Saved per slab; audited." onDiscard={() => setDs(clone2(sl.data!))} onSave={() => run(() => api('/admin/ads/slabs', { method: 'PUT', body: ds }), 'Ad slabs saved', sl.reload)} label="Save slabs" />
      </Card>
      <Card title={`Boosts · ${d.length}`} extra={<div className="row"><LivePill />{dirty ? <Pill tone="amber">Unsaved</Pill> : <Pill tone="gray">Saved</Pill>}</div>}>
        <p className="note">Admin-created ads only. The app always labels them “Sponsored”. Links must be https.</p>
        <table><thead><tr><th>Title / body</th><th>Sponsor</th><th>CTA → URL</th><th>Places</th><th>Seen</th><th>Live</th><th /></tr></thead><tbody>
          {d.map((a, i) => <tr key={a.id ?? i}>
            <td><input aria-label="title" value={a.title} onChange={e => set(i, { title: e.target.value })} /><input aria-label="body" value={a.body} onChange={e => set(i, { body: e.target.value })} />{a.demo && <Demo />}</td>
            <td><input aria-label="sponsor" value={a.sponsor} onChange={e => set(i, { sponsor: e.target.value })} /></td>
            <td><input aria-label="cta" value={a.cta} onChange={e => set(i, { cta: e.target.value })} /><input className="mono" aria-label="url" value={a.url} onChange={e => set(i, { url: e.target.value })} /></td>
            <td><div className="chips">{PLACES.map(p => { const on = a.places.includes(p); return <button key={p} className={'btn sm ' + (on ? 'prism' : 'ghost')} onClick={() => set(i, { places: on ? a.places.filter(x => x !== p) : [...a.places, p] })}>{p}</button>; })}</div></td>
            <td className="muted">{a.impressions ?? 0}</td>
            <td><Toggle label="Active" on={a.active} onClick={() => set(i, { active: !a.active })} /></td>
            <td className="r"><button className="iconbtn sm" aria-label="Delete ad" onClick={() => setD(d.filter((_, j) => j !== i))}><Icon name="x" size={13} /></button></td></tr>)}
        </tbody></table>
        <button className="btn sm ghost mt" onClick={() => setD([...d, { title: 'New Boost', body: '', cta: 'Learn more', url: 'https://', sponsor: '', places: ['feed'], active: false }])}>Add Boost</button>
        <SaveBar dirty={dirty} busy={busy} msg="Removing an ad here deletes it." onDiscard={() => setD(clone2(ads.data!))} onSave={() => run(() => api('/admin/ads', { method: 'PUT', body: d }), 'Boosts saved', ads.reload)} label="Save Boosts" />
      </Card>
    </>;
  }}</Gate>;
}

function StashPage() {
  const r = useApi<{ products: ProductRow[]; orders: OrderRow[] }>('/admin/store');
  const { run, busy } = useAct();
  return <Gate rs={[r]}>{() => <>
    <Card title={`Stash products · ${r.data!.products.length}`} extra={<LivePill />}>
      <table><thead><tr><th>Product</th><th>Creator</th><th>Price</th><th>Kind</th><th>Stock</th><th>Status</th><th /></tr></thead><tbody>
        {r.data!.products.map(p => <tr key={p.id} className={p.active ? '' : 'dim'}><td><b>{p.title}</b> {p.demo && <Demo />}<br /><small className="muted">{p.desc}</small></td>
          <td className="mono">{p.creatorHandle}</td><td>{p.price.amount ? p.price.display : 'Free'}</td><td>{p.kind}</td><td>{p.stock ?? '∞'}</td>
          <td>{p.active ? <Pill tone="mint">listed</Pill> : <Pill tone="red">hidden</Pill>}</td>
          <td className="r"><button disabled={busy} className={'btn sm ' + (p.active ? 'danger' : 'ghost')} onClick={() => run(() => api(`/admin/store/products/${p.id}`, { method: 'PATCH', body: { active: !p.active } }), `${p.title} ${p.active ? 'hidden' : 'listed'}`, r.reload)}>{p.active ? 'Hide' : 'Relist'}</button></td></tr>)}
        {!r.data!.products.length && <tr><td colSpan={7} className="empty">No products yet.</td></tr>}
      </tbody></table></Card>
    <Card title={`Stash orders · ${r.data!.orders.length}`}>
      <table><thead><tr><th>Order</th><th>Amount</th><th>Provider</th><th>Status</th><th>Fee</th><th>When</th></tr></thead><tbody>
        {r.data!.orders.map(o => <tr key={o.id}><td className="mono">{o.id}</td><td>{paise(o.amount)}</td><td>{o.provider}{o.testMode && <Pill tone="amber">test</Pill>}</td><td><St v={o.status} /></td><td>{paise(o.fee)}</td><td className="muted">{when(o.at)}</td></tr>)}
        {!r.data!.orders.length && <tr><td colSpan={6} className="empty">No orders yet — orders appear when a fan checks out with a connected payment Plug.</td></tr>}
      </tbody></table></Card>
  </>}</Gate>;
}

const PLUGS: { k: string; name: string; desc: string; fields: [string, string, boolean][] }[] = [
  { k: 'razorpay', name: 'Razorpay', desc: 'Payment Links for Backstage Pass, Stash and Props. Test keys start with rzp_test_.', fields: [['keyId', 'Key ID', false], ['keySecret', 'Key secret', true], ['webhookSecret', 'Webhook secret', true]] },
  { k: 'cashfree', name: 'Cashfree', desc: 'Payment Links via Cashfree PG. Test mode uses sandbox.cashfree.com.', fields: [['appId', 'App ID', false], ['secretKey', 'Secret key', true], ['webhookSecret', 'Webhook secret (optional — falls back to secret key)', true]] },
  { k: 'msg91', name: 'MSG91', desc: 'Emails login codes (no phone number needed). Needs an email template with an {{otp}} variable.', fields: [['authKey', 'Auth key', true], ['templateId', 'Email template ID', false], ['sender', 'From email (verified domain)', false]] },
  { k: 'maps', name: 'Maps', desc: 'Place search & location tags. Google Geocoding or Mapbox.', fields: [['key', 'API key / access token', true]] },
  { k: 'turn', name: 'TURN (calls)', desc: 'Relay for voice & video calls behind strict NATs. Use a shared secret (coturn use-auth-secret) for short-lived credentials, or a static username + credential.', fields: [['urls', 'URLs (comma-separated turn:, turns:, stun:)', false], ['username', 'Static username', false], ['credential', 'Static credential', true], ['sharedSecret', 'Shared secret (coturn static-auth-secret)', true]] },
  { k: 'expo', name: 'Expo push', desc: 'Push notifications via the Expo Push API. Works without a token; add an access token if Enhanced Push Security is on.', fields: [['accessToken', 'Access token (optional)', true]] },
];
function PlugCard({ p, v: v0, reload }: { p: typeof PLUGS[number]; v?: Plug; reload: () => void }) {
  const v: Plug = v0 ?? { configured: false, mode: '' };
  const { run, busy } = useAct();
  const [d, setD] = useState<Record<string, string | boolean>>({});
  const [res, setRes] = useState<{ ok: boolean; message: string } | null>(null);
  const val = (k: string) => (k in d ? d[k] : v[k]) as string | boolean | undefined;
  const dirty = Object.keys(d).length > 0;
  return <Card title={p.name} extra={<div className="row">{v.configured ? <Pill tone="mint">connected</Pill> : <Pill tone="gray">not set</Pill>}{!!val('mode') && <Pill tone={val('mode') === 'live' ? 'red' : 'amber'}>{String(val('mode'))}</Pill>}</div>}>
    <p className="note">{p.desc}</p>
    {!!v0?.mode && <Field label="Mode" hint="Test uses sandbox / test keys — no real money moves."><Tabs v={String(val('mode'))} set={m => setD({ ...d, mode: m })} opts={[['test', 'Test'], ['live', 'Live']]} /></Field>}
    {!v0 && <p className="note">This Plug isn’t on the server yet — update the backend to save it.</p>}
    {p.k === 'maps' && <Field label="Provider"><select value={String(val('provider'))} onChange={e => setD({ ...d, provider: e.target.value })}><option value="google">Google</option><option value="mapbox">Mapbox</option></select></Field>}
    {p.k === 'msg91' && <Field label="Send login codes via MSG91" hint="Off = demo codes only."><Toggle label="MSG91 enabled" on={!!val('enabled')} onClick={() => setD({ ...d, enabled: !val('enabled') })} /></Field>}
    {p.fields.map(([k, l, secret]) => <Field key={k} label={l} hint={secret ? (v[k] ? `Saved: ${v[k]}` : 'Not saved') : undefined}>
      <input type={secret ? 'password' : 'text'} autoComplete="off" className="mono" aria-label={`${p.name} ${l}`} value={k in d ? String(d[k]) : secret ? '' : String(v[k] ?? '')}
        placeholder={secret ? (v[k] ? 'Leave blank to keep' : 'Paste secret') : ''} onChange={e => setD({ ...d, [k]: e.target.value })} /></Field>)}
    <div className="row mt">
      <button className="btn sm prism" disabled={!dirty || busy} onClick={() => run(() => api('/admin/integrations', { method: 'PUT', body: { [p.k]: d } }), `${p.name} saved`, () => { setD({}); reload(); })}>Save</button>
      <button className="btn sm ghost" disabled={busy} onClick={() => run(() => api<{ ok: boolean; message: string }>(`/admin/integrations/${p.k}/test`, { method: 'POST' }), undefined, setRes)}>Test connection</button>
      {res && <span className={'small ' + (res.ok ? '' : 'red')} data-test-result>{res.ok ? '✓ ' : '✕ '}{res.message}</span>}
    </div>
  </Card>;
}
function PlugsPage() {
  const r = useApi<Record<string, Plug>>('/admin/integrations');
  return <Gate rs={[r]}>{() => <>
    <div className="notready"><Icon name="key" size={16} /><span><b>Keys you enter are encrypted; we never show them again.</b> Saved secrets appear only as ••••last4. Leave a secret blank to keep it.</span></div>
    <div className="grid g2">{PLUGS.map(p => <PlugCard key={p.k} p={p} v={r.data![p.k]} reload={r.reload} />)}</div>
  </>}</Gate>;
}

/** Search groups for money pages: plans, Stash products, Boosts, Plugs. */
function useMoneySearch(t: string) {
  const on = !!t;
  const pl = useApi<PlanRow[]>(on ? '/admin/money/plans' : null);
  const st = useApi<{ products: ProductRow[] }>(on ? '/admin/store' : null);
  const ads = useApi<AdRow[]>(on ? '/admin/ads' : null);
  const ig = useApi<Record<string, Plug>>(on ? '/admin/integrations' : null);
  if (!on) return [];
  const has = (...xs: (string | number | undefined)[]) => xs.join(' ').toLowerCase().includes(t);
  type Row = { k: string; title: ReactNode; sub: ReactNode; tag?: ReactNode; href: string };
  const g: [string, string, Row[]][] = [
    ['Backstage Pass plans', 'plans', (pl.data ?? []).filter(p => has(p.name, p.id, p.perks.join(' '), 'plan backstage subscription')).map(p => ({ k: p.id ?? p.name, title: p.name, sub: `${p.id} · ${Object.entries(p.prices).map(([c, a]) => `${c} ${a / 100}`).join(', ')}`, tag: p.active ? <Pill tone="mint">active</Pill> : <Pill tone="gray">inactive</Pill>, href: '#/plans' }))],
    ['Stash products', 'stash', (st.data?.products ?? []).filter(p => has(p.title, p.desc, p.id, p.creatorHandle, 'stash store product')).map(p => ({ k: p.id, title: p.title, sub: `${p.creatorHandle} · ${p.price.display}`, tag: p.active ? undefined : <Pill tone="red">hidden</Pill>, href: '#/stash' }))],
    ['Boosts', 'boosts', (ads.data ?? []).filter(a => has(a.title, a.sponsor, a.body, a.url, 'boost ad sponsored')).map(a => ({ k: a.id ?? a.title, title: a.title, sub: `${a.sponsor} · ${a.places.join(', ')}`, href: '#/boosts' }))],
    ['Plugs', 'plugs', PLUGS.filter(p => has(p.k, p.name, p.desc, 'plug integration keys')).map(p => ({ k: p.k, title: p.name, sub: p.desc, tag: ig.data?.[p.k]?.configured ? <Pill tone="mint">connected</Pill> : <Pill tone="gray">not set</Pill>, href: '#/plugs' }))],
  ];
  return g;
}


/* ===================== Brand & community — Promos, Uploads, Members ===================== */
type PromoTarget = { global: boolean; countries: string[]; zones: string[]; states: string[] };
type PromoRow = { id?: string; title: string; body: string; kind: string; mediaUrl: string | null; url: string | null; cta: string | null; placement: string[];
  target: PromoTarget; startAt: number | null; endAt: number | null; active: boolean; priority: number; by?: string; at?: number; label?: string };
type PromoPreview = { country: string; state: string; zones: string[]; enabled: boolean; items: PromoRow[] };
const PROMO_PLACES: [string, string][] = [['home_banner', 'Home banner'], ['feed', 'Feed card'], ['chat_list', 'Chat list'], ['splash', 'Splash'], ['explore', 'Explore']];
const PROMO_KINDS = ['banner', 'card', 'video', 'image', 'link', 'post'];
const NEW_PROMO: PromoRow = { title: '', body: '', kind: 'card', mediaUrl: null, url: 'https://vibeloop.app', cta: 'Learn more', placement: ['feed'],
  target: { global: true, countries: [], zones: [], states: [] }, startAt: null, endAt: null, active: true, priority: 0 };
const mediaSrc = (u: string | null) => !u ? null : u.startsWith('/media/') ? API_URL + u : u;
const toLocal = (t: number | null) => t ? new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
const fromLocal = (s: string) => s ? new Date(s).getTime() : null;
const targetText = (t: PromoTarget) => t.global ? 'Global' : [t.countries.length && t.countries.join(', '), t.zones.length && 'zone ' + t.zones.join(', '), t.states.length && 'state ' + t.states.join(', ')].filter(Boolean).join(' · ') || '—';
const windowText = (p: PromoRow) => {
  const now = Date.now();
  if (p.startAt && p.startAt > now) return <Pill tone="amber">starts {when(p.startAt)}</Pill>;
  if (p.endAt && p.endAt < now) return <Pill tone="gray">ended</Pill>;
  return p.endAt ? <span className="muted small">until {when(p.endAt)}</span> : <span className="muted small">always on</span>;
};

function PromoCard({ p, place }: { p: PromoRow; place: string }) {
  const img = mediaSrc(p.mediaUrl);
  const media = img ? (p.kind === 'video' ? <video src={img} muted /> : <img src={img} alt="" />) : <div className="pc-ph"><Icon name="promos" size={22} /></div>;
  return <div className={'pcard pc-' + place}>
    {place !== 'chat_list' && <div className="pc-media">{media}</div>}
    {place === 'chat_list' && <span className="pc-dot"><Icon name="promos" size={16} /></span>}
    <div className="pc-body"><span className="pc-label">{p.label ?? 'From VibeLoop'}</span><b>{p.title || 'Promo title'}</b>{p.body && <small>{p.body}</small>}</div>
    {p.cta && <span className="pc-cta">{p.cta}</span>}
  </div>;
}

function PromosPage() {
  const list = useApi<PromoRow[]>('/admin/promos');
  const zones = useApi<Record<string, Zone>>('/admin/zones');
  const layers = useApi<LayersRes>('/admin/config/layers');
  const { run, busy } = useAct();
  const editId = hp('edit');
  const [d, setD] = useState<PromoRow | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  useEffect(() => {
    if (!list.data) return;
    if (editId === 'new') setD(clone2(NEW_PROMO)); else if (editId) { const x = list.data.find(p => p.id === editId); setD(x ? clone2(x) : null); } else setD(null);
  }, [editId, list.data]);
  const [pc, setPc] = useState(hp('pc') ?? 'IN'); const [ps, setPs] = useState(hp('ps') ?? 'TN'); const [pp, setPp] = useState(hp('pp') ?? '');
  const prev = useApi<PromoPreview>(`/admin/promos/preview?country=${encodeURIComponent(pc)}&state=${encodeURIComponent(ps)}${pp ? '&placement=' + pp : ''}`);
  const open = (id: string | null) => setHp('edit', id);
  return <Gate rs={[list, zones, layers]}>{() => {
    const base = layers.data!.layers.base ?? {};
    const enabled = base.features?.promos !== false;
    const flip = () => run(() => api('/admin/config/base', { method: 'PUT', body: { ...base, features: { ...(base.features ?? {}), promos: !enabled } } }), `Promos ${enabled ? 'switched off' : 'switched on'} for everyone`, layers.reload);
    const set = (p: Partial<PromoRow>) => setD(x => x && { ...x, ...p });
    const setT = (p: Partial<PromoTarget>) => setD(x => x && { ...x, target: { ...x.target, ...p } });
    const save = () => d && run(() => d.id ? api(`/admin/promos/${d.id}`, { method: 'PATCH', body: d }) : api<PromoRow>('/admin/promos', { method: 'POST', body: d }), d.id ? 'Promo saved' : 'Promo created', () => { list.reload(); prev.reload(); open(null); });
    const upload = async (f: File | undefined) => {
      if (!f) return; setPct(0);
      await run(() => uploadFile(f, setPct), 'Media uploaded', r => set({ mediaUrl: r.url, kind: r.kind === 'video' ? 'video' : d?.kind === 'video' ? 'image' : d?.kind ?? 'image' }));
      setPct(null);
    };
    return <>
      <Card title="Promos" extra={<div className="row"><LivePill /><span className="small muted">Feature <code>promos</code></span><Toggle label="Promos switch" on={enabled} onClick={flip} disabled={busy} /><button className="btn sm prism" onClick={() => open('new')}><Icon name="t-plus" size={14} />New promo</button></div>}>
        <p className="note">Our own brand promotions — shown to everyone the targeting matches, labelled “From VibeLoop”. Not ads: no sponsor, no money switch. {enabled ? '' : <b className="red">Promos are switched off for every country.</b>}</p>
        <table><thead><tr><th>Promo</th><th>Placements</th><th>Targeting</th><th>Schedule</th><th className="c">Priority</th><th>Status</th><th /></tr></thead><tbody>
          {list.data!.map(p => <tr key={p.id} className={p.active ? '' : 'dim'}>
            <td><div className="who"><span className="pthumb">{p.mediaUrl ? <img src={mediaSrc(p.mediaUrl)!} alt="" /> : <Icon name="promos" size={16} />}</span><div><b>{p.title}</b><small>{p.kind} · {p.cta ?? 'no CTA'} → {p.url ?? '—'}</small></div></div></td>
            <td><div className="chips">{p.placement.map(x => <span key={x} className="tag">{x}</span>)}</div></td>
            <td className="small">{targetText(p.target)}</td>
            <td>{windowText(p)}</td>
            <td className="c num">{p.priority}</td>
            <td>{p.active ? <Pill tone="mint">active</Pill> : <Pill tone="gray">paused</Pill>}</td>
            <td className="r"><button className="btn sm ghost" onClick={() => open(p.id!)}>Edit</button></td></tr>)}
          {!list.data!.length && <tr><td colSpan={7} className="empty">No promos yet.</td></tr>}
        </tbody></table>
      </Card>
      {d && <div className="grid g1-2">
        <Card title={d.id ? `Edit · ${d.title}` : 'New promo'} className="peditor" extra={d.id ? <code>{d.id}</code> : undefined}>
          <span className="lbl">Title</span><input className="wide" aria-label="title" maxLength={120} value={d.title} onChange={e => set({ title: e.target.value })} placeholder="Kovai creators meetup" />
          <span className="lbl">Body</span><textarea rows={2} aria-label="body" maxLength={500} value={d.body} onChange={e => set({ body: e.target.value })} />
          <div className="fgrid">
            <label><span className="lbl">Kind</span><select value={d.kind} onChange={e => set({ kind: e.target.value })}>{PROMO_KINDS.map(k => <option key={k}>{k}</option>)}</select></label>
            <label><span className="lbl">Priority</span><input type="number" min={-100} max={1000} value={d.priority} onChange={e => set({ priority: Math.trunc(+e.target.value) })} /></label>
            <label><span className="lbl">CTA label</span><input maxLength={30} value={d.cta ?? ''} onChange={e => set({ cta: e.target.value || null })} /></label>
            <label><span className="lbl">CTA link</span><input className="mono" value={d.url ?? ''} onChange={e => set({ url: e.target.value || null })} placeholder="https://" /></label>
          </div>
          <span className="lbl">Media</span>
          <div className="row"><label className="btn sm ghost"><Icon name="uploads" size={14} />{pct !== null ? `Uploading ${pct}%` : 'Upload image / video'}<input type="file" hidden accept="image/*,video/mp4,video/quicktime,video/webm" onChange={e => upload(e.target.files?.[0])} /></label>
            <input className="mono grow" aria-label="media url" value={d.mediaUrl ?? ''} onChange={e => set({ mediaUrl: e.target.value || null })} placeholder="/media/… or https://…" /></div>
          <span className="lbl">Placements</span>
          <div className="chips">{PROMO_PLACES.map(([k, l]) => { const on = d.placement.includes(k); return <button key={k} className={'btn sm ' + (on ? 'prism' : 'ghost')} onClick={() => set({ placement: on ? d.placement.filter(x => x !== k) : [...d.placement, k] })}>{l}</button>; })}</div>
          <span className="lbl">Targeting</span>
          <div className="ptarget">
            <Field label="Global" hint="Everyone, every country. Turn off to target places."><Toggle label="Global" on={d.target.global} onClick={() => setT({ global: !d.target.global })} /></Field>
            {!d.target.global && <>
              <div className="trow"><b>Countries</b><Chips items={d.target.countries} set={v => setT({ countries: v.map(x => x.toUpperCase().slice(0, 2)) })} ph="ISO2, e.g. IN" mono /></div>
              <div className="trow"><b>Zones</b><div className="chips">{Object.entries(zones.data!).map(([k, z]) => { const on = d.target.zones.includes(k); return <button key={k} title={z.name} className={'btn sm ' + (on ? 'prism' : 'ghost')} onClick={() => setT({ zones: on ? d.target.zones.filter(x => x !== k) : [...d.target.zones, k] })}>{k}</button>; })}</div></div>
              <div className="trow"><b>States</b><Chips items={d.target.states} set={v => setT({ states: v.map(x => x.toUpperCase().slice(0, 3)) })} ph="e.g. TN" mono /></div>
              <p className="note">Filled lists combine with AND — countries IN + states TN reaches Tamil Nadu only.</p></>}
          </div>
          <span className="lbl">Schedule</span>
          <div className="fgrid"><label><small>Starts</small><input type="datetime-local" value={toLocal(d.startAt)} onChange={e => set({ startAt: fromLocal(e.target.value) })} /></label>
            <label><small>Ends</small><input type="datetime-local" value={toLocal(d.endAt)} onChange={e => set({ endAt: fromLocal(e.target.value) })} /></label></div>
          <Field label="Active" hint="Paused promos are never served."><Toggle label="Active" on={d.active} onClick={() => set({ active: !d.active })} /></Field>
          <div className="row end mt">{d.id && <button className="btn sm danger" disabled={busy} onClick={() => confirm(`Delete “${d.title}”?`) && run(() => api(`/admin/promos/${d.id}`, { method: 'DELETE' }), 'Promo deleted', () => { list.reload(); prev.reload(); open(null); })}>Delete</button>}
            <button className="btn sm ghost" onClick={() => open(null)}>Cancel</button><button className="btn sm prism" disabled={busy || !d.title.trim() || !d.placement.length} onClick={save}>{d.id ? 'Save promo' : 'Create promo'}</button></div>
        </Card>
        <Card title="Live preview" extra={<span className="muted small">{d.placement.length} placement{d.placement.length === 1 ? '' : 's'}</span>}>
          <div className="pprev">{d.placement.map(pl => <div key={pl}><span className="lbl">{PROMO_PLACES.find(x => x[0] === pl)?.[1]}</span><PromoCard p={d} place={pl} /></div>)}
            {!d.placement.length && <p className="empty">Pick at least one placement.</p>}</div>
        </Card>
      </div>}
      <Card title="Preview as" extra={<div className="row"><input className="cc" aria-label="preview country" value={pc} maxLength={2} onChange={e => setPc(e.target.value.toUpperCase())} />
        <input className="cc" aria-label="preview state" value={ps} maxLength={3} placeholder="state" onChange={e => setPs(e.target.value.toUpperCase())} />
        <select aria-label="preview placement" value={pp} onChange={e => setPp(e.target.value)}><option value="">All placements</option>{PROMO_PLACES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>}>
        {prev.error ? <ApiErr msg={prev.error} retry={prev.reload} /> : !prev.data ? <p className="loading">Loading from API…</p> : <>
          <p className="note">A viewer in <b>{prev.data.country || '—'}{prev.data.state ? ' / ' + prev.data.state : ''}</b> (zones {prev.data.zones.join(', ') || '—'}) sees {prev.data.items.length} promo{prev.data.items.length === 1 ? '' : 's'}, highest priority first.{!prev.data.enabled && <b className="red"> Promos are switched off for this viewer.</b>}</p>
          <div className="pgrid">{prev.data.items.map(p => <div key={p.id}><span className="lbl">{p.placement.join(' · ')} · priority {p.priority}</span><PromoCard p={p} place={p.placement[0]} /></div>)}
            {!prev.data.items.length && <p className="empty">Nothing matches this viewer.</p>}</div></>}
      </Card>
    </>;
  }}</Gate>;
}

type UploadRow = { id: string; name: string | null; kind: string; mime: string; size: number; owner: string | null; at: number; url: string; durationSec: number | null };
const bytes = (n: number) => n >= 1 << 30 ? (n / (1 << 30)).toFixed(2) + ' GB' : n >= 1 << 20 ? (n / (1 << 20)).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B';
function UploadsPage() {
  const [q, setQ] = useState('');
  const r = useApi<UploadRow[]>('/admin/uploads' + (q.trim() ? '?q=' + encodeURIComponent(q.trim()) : ''));
  const { run, busy } = useAct(); const [pct, setPct] = useState<number | null>(null);
  const up = async (f?: File) => { if (!f) return; setPct(0); await run(() => uploadFile(f, setPct), 'Uploaded ' + f.name, r.reload); setPct(null); };
  return <Card title={r.data ? `${r.data.length} files` : 'Uploads'} extra={<div className="row"><LivePill /><Search v={q} set={setQ} ph="Search file name or id" />
    <label className="btn sm prism"><Icon name="uploads" size={14} />{pct !== null ? `Uploading ${pct}%` : 'Upload file'}<input type="file" hidden disabled={busy} onChange={e => up(e.target.files?.[0])} /></label></div>}>
    <p className="note">Resumable uploads up to 1 GB (5 MB chunks). Type is checked by extension <i>and</i> file contents; executables and scripts are refused. Videos for posts and Blinks must be 60 s or shorter.</p>
    {r.error ? <ApiErr msg={r.error} retry={r.reload} /> : !r.data ? <p className="loading">Loading from API…</p> :
      <table><thead><tr><th>File</th><th>Kind</th><th>Size</th><th>Owner</th><th>Uploaded</th></tr></thead><tbody>
        {r.data.map(m => <tr key={m.id}><td><a className="link" href={API_URL + m.url} target="_blank" rel="noreferrer"><b>{m.name ?? m.id}</b></a><small className="mono">{m.mime}</small></td>
          <td><span className="tag">{m.kind}</span>{m.durationSec ? <small>{m.durationSec.toFixed(0)} s</small> : null}</td><td className="num">{bytes(m.size)}</td><td>{m.owner}</td><td className="muted">{when(m.at)}</td></tr>)}
        {!r.data.length && <tr><td colSpan={5} className="empty">No uploads yet.</td></tr>}
      </tbody></table>}
  </Card>;
}

type Member = ApiUser & { hue: number; verified: boolean; avatarSocial: string | null; avatarChat: string | null; cover: string | null; lastSeenAt: number | null; lastSeenVisible: boolean;
  city: string; state: string; country: string | null; lang: string | null; pronouns: string; links: string[]; bio: string; chatBio: string;
  moodDrop: { moji: number; text: string; at: number } | null; counts: Record<string, number> };
const ago = (t: number | null) => { if (!t) return 'never'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
function MemberAvatar({ src, name, hue, size = 64 }: { src: string | null; name: string; hue?: number; size?: number }) {
  return src ? <img className="mav" style={{ width: size, height: size }} src={mediaSrc(src)!} alt="" /> :
    <span className="mav" style={{ width: size, height: size, fontSize: size * .38, background: `hsl(${hue ?? 250} 30% 92%)`, color: `hsl(${hue ?? 250} 35% 32%)` }}>{name.split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase()}</span>;
}
type SecInfo = { twoFactor: boolean; sessions: { id: string; device: string; ip: string; createdAt: number; lastSeen: number }[]; events: { at: number; kind: string; detail: string; ip: string }[] };
/** Login safety for one member: 2FA state, signed-in devices, recent security events; support can reset 2FA or sign out everywhere. */
function MemberSecurity({ id }: { id: string }) {
  const r = useApi<SecInfo>(`/admin/users/${encodeURIComponent(id)}/security`); const { run, busy } = useAct(); const s = r.data;
  return <>
    <h6 className="dsec">Login & security</h6>
    {r.error ? <ApiErr msg={r.error} retry={r.reload} /> : !s ? <p className="loading">Loading…</p> : <>
      <div className="kv"><span>Two-factor</span><span>{s.twoFactor ? <Pill tone="mint">on</Pill> : <Pill tone="gray">off</Pill>}</span>
        <span>Devices</span><span>{s.sessions.length ? s.sessions.map(x => <div key={x.id}>{x.device} <small className="muted">· {ago(x.lastSeen)}{x.ip ? ' · ' + x.ip : ''}</small></div>) : '—'}</span>
        <span>Recent events</span><span>{s.events.length ? s.events.slice(0, 8).map((e, i) => <div key={i}><b>{e.kind.replace(/_/g, ' ')}</b> <small className="muted">{e.detail} · {ago(e.at)}</small></div>) : '—'}</span></div>
      <div className="row mt">
        <button className="btn sm danger" disabled={busy || !s.sessions.length} onClick={() => run(() => api(`/admin/users/${encodeURIComponent(id)}/sessions/revoke`, { method: 'POST' }), 'Signed out of every device', r.reload)}>Sign out everywhere</button>
        {s.twoFactor && <button className="btn sm ghost" disabled={busy} onClick={() => run(() => api(`/admin/users/${encodeURIComponent(id)}/2fa-reset`, { method: 'POST' }), 'Two-factor reset — member signed out', r.reload)}>Reset two-factor</button>}
      </div>
      <p className="note">Reset two-factor only after confirming identity (e.g. reply from the account email). It signs the member out everywhere.</p>
    </>}
  </>;
}
function MemberDrawer({ id, close }: { id: string; close: () => void }) {
  const r = useApi<Member>('/admin/users/' + encodeURIComponent(id));
  useEffect(() => { const f = (e: KeyboardEvent) => e.key === 'Escape' && close(); addEventListener('keydown', f); return () => removeEventListener('keydown', f); }, [close]);
  const m = r.data;
  return <div className="drawer-wrap" onClick={close}><aside className="drawer" role="dialog" aria-label="Member details" onClick={e => e.stopPropagation()}>
    <header className="drawer-h"><b>Member</b><button className="iconbtn sm" aria-label="Close" onClick={close}><Icon name="x" size={14} /></button></header>
    {r.error ? <ApiErr msg={r.error} retry={r.reload} /> : !m ? <p className="loading">Loading from API…</p> : <>
      <div className="mhead"><MemberAvatar src={m.avatarSocial ?? m.avatarChat} name={m.name} hue={m.hue} /><div><h3>{m.name}</h3><small>{m.handle} · {m.email}</small>
        <div className="row mt">{m.suspended ? <Pill tone="red">suspended</Pill> : <Pill tone="mint">active</Pill>}<Pill tone="gray">{m.role}</Pill>{m.verified && <Pill tone="violet">verified</Pill>}</div></div></div>
      <div className="mstats">{Object.entries(m.counts).map(([k, v]) => <div key={k}><strong>{v}</strong><span>{k}</span></div>)}</div>
      <h6 className="dsec">Presence</h6>
      <div className="kv"><span>Last seen</span><b>{m.lastSeenAt ? <>{ago(m.lastSeenAt)} <small className="muted">{when(m.lastSeenAt)}</small></> : 'never'}</b>
        <span>Visibility</span><span>{m.lastSeenVisible ? 'Shown to friends' : <><Pill tone="amber">hidden from members</Pill> <small>Staff always see it.</small></>}</span></div>
      <h6 className="dsec">Avatars</h6>
      <div className="avs"><div><MemberAvatar src={m.avatarSocial} name={m.name} hue={m.hue} size={48} /><small>Glow (social)</small></div><div><MemberAvatar src={m.avatarChat} name={m.name} hue={m.hue} size={48} /><small>Hush (chat)</small></div>
        <p className="note">{!m.avatarSocial && !m.avatarChat ? 'No avatar uploaded — the app shows initials.' : 'Each module falls back to the other avatar.'}</p></div>
      <h6 className="dsec">Profile</h6>
      <div className="kv"><span>Pronouns</span><span>{m.pronouns || '—'}</span><span>Place</span><span>{[m.city, m.state, m.country].filter(Boolean).join(' · ') || '—'}</span>
        <span>Language</span><span>{m.lang ?? '—'}</span><span>Glow bio</span><span>{m.bio || '—'}</span><span>Hush bio</span><span>{m.chatBio || '—'}</span>
        <span>Mood Drop</span><span>{m.moodDrop ? <>{m.moodDrop.text || 'mood'} <small className="muted">#{m.moodDrop.moji} · {ago(m.moodDrop.at)}</small></> : '—'}</span>
        <span>Links</span><span>{m.links.length ? m.links.map(l => <a key={l} className="link" href={l} target="_blank" rel="noreferrer">{l}</a>) : '—'}</span>
        <span>Joined</span><span>{when(m.createdAt)}</span><span>User id</span><code>{m.id}</code></div>
      <MemberSecurity id={m.id} />
    </>}
  </aside></div>;
}

/* ===================== Live & reach ===================== */
const LIVE_PAGES: [string, string, string][] = [
  ['realtime', 'Realtime Monitor', 'WebSocket connections, online users, events per minute, redis'],
  ['calls', 'Call Log', 'Voice and video calls: ringing, answered, missed, rejected'],
  ['push', 'Push Center', 'Push tokens, Expo sends, failures, test push'],
  ['e2ee', 'E2EE & Keys', 'End-to-end encryption: device keys, encrypted chats'],
];
type RealtimeStats = { connections: number; users: number; eventsLastMinute: number; eventsPerMinute: { minute: number | string; count: number }[]; byType: Record<string, number>; redis: boolean; note?: string };
type CallParty = { id: string; handle: string; name: string } | null;
type CallRow = { id: string; caller: CallParty; callee: CallParty; media: string; status: string; startedAt: number; answeredAt: number | null; endedAt: number | null };
type PushStats = { tokens: { total: number; byPlatform: Record<string, number>; byProvider: Record<string, number> }; last24h: { sent: number; failed: number; skipped: number }; recent: { id: string; userId: string; handle: string | null; kind: string; ok: boolean; status: string; error: string | null; at: number }[] };
type E2eeStats = { usersWithKeys: number; devices: number; e2eeConvs: number; encryptedMessages: number; note?: string };
const n0 = (x: number | undefined | null) => (x ?? 0).toLocaleString();

function MinuteBars({ pts }: { pts: { minute: number | string; count: number }[] }) {
  const W = 640, H = 140, pad = 20; const max = Math.max(1, ...pts.map(p => p.count)); const bw = (W - pad * 2) / Math.max(1, pts.length);
  if (!pts.length) return <p className="empty">No events in the last hour.</p>;
  return <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Realtime events per minute, last 60 minutes">
    <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} stroke="#E7E3F3" />
    {pts.map((p, i) => { const h = (p.count / max) * (H - pad * 2); return <rect key={i} x={pad + i * bw + 1} y={H - pad - h} width={Math.max(1, bw - 2)} height={h} rx="2" fill="#5B4CF5"><title>{`${typeof p.minute === 'number' ? new Date(p.minute).toISOString().slice(11, 16) + ' UTC' : p.minute}: ${p.count}`}</title></rect>; })}
    <text x={pad} y={H - 4} className="ax">−60 min</text><text x={W - pad} y={H - 4} textAnchor="end" className="ax">now</text>
  </svg>;
}

function RealtimePage() {
  const r = useApi<RealtimeStats>('/admin/realtime');
  useEffect(() => { const t = setInterval(r.reload, 10000); return () => clearInterval(t); }, [r.reload]);
  return <Gate rs={[r]}>{() => { const d = r.data!; const types = Object.entries(d.byType ?? {}).sort((a, b) => b[1] - a[1]); const tmax = Math.max(1, ...types.map(t => t[1]));
    return <>
      <div className="kpis">
        <Kpi label="Open sockets" value={n0(d.connections)} sub="WebSocket /ws" />
        <Kpi label="Online users" value={n0(d.users)} sub="with ≥1 socket" />
        <Kpi label="Events · last minute" value={n0(d.eventsLastMinute)} />
        <Kpi label="Fan-out" value={d.redis ? 'Redis' : 'Single node'} sub={d.redis ? 'pub/sub across workers' : 'in-process only'} tone={d.redis ? 'good' : ''} />
      </div>
      <div className="grid g2-1">
        <Card title="Events per minute" extra={<div className="row"><LivePill /><button className="btn sm ghost" onClick={r.reload}>Refresh</button></div>}><MinuteBars pts={d.eventsPerMinute ?? []} /><p className="note">Auto-refreshes every 10 s.</p></Card>
        <Card title="By event type">{types.length ? types.map(([k, v]) => <div key={k} className="frow"><code className="grow">{k}</code><div style={{ width: 120 }}><Bar v={v} max={tmax} /></div><b>{n0(v)}</b></div>) : <p className="empty">No events yet.</p>}</Card>
      </div>
      {d.note && <p className="note">{d.note}</p>}
    </>; }}</Gate>;
}

const party = (p: CallParty) => p ? <div><b>{p.name}</b><small className="muted"> {p.handle}</small></div> : <span className="muted">—</span>;
const dur = (a: number | null, b: number | null) => { if (!a || !b) return '—'; const s = Math.round((b - a) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function CallsPage() {
  const [status, setStatus] = useState(''); const [media, setMedia] = useState(''); const [q, setQ] = useState('');
  const qs = new URLSearchParams(); if (status) qs.set('status', status); if (media) qs.set('media', media); if (q.trim()) qs.set('q', q.trim());
  const r = useApi<CallRow[]>('/admin/calls' + (qs.toString() ? '?' + qs : ''));
  return <Card title={r.data ? `${r.data.length} calls` : 'Calls'} extra={<div className="row"><LivePill />
    <select aria-label="Status" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{['ringing', 'answered', 'ended', 'missed', 'rejected'].map(x => <option key={x} value={x}>{x}</option>)}</select>
    <select aria-label="Media" value={media} onChange={e => setMedia(e.target.value)}><option value="">Voice + video</option><option value="audio">Voice</option><option value="video">Video</option></select>
    <Search v={q} set={setQ} ph="Search handle or name" /></div>}>
    {r.error ? <ApiErr msg={r.error} retry={r.reload} /> : !r.data ? <p className="loading">Loading from API…</p> :
    <table><thead><tr><th>Caller</th><th>Callee</th><th>Media</th><th>Status</th><th>Started</th><th>Talk time</th></tr></thead><tbody>
      {r.data.map(c => <tr key={c.id}><td>{party(c.caller)}</td><td>{party(c.callee)}</td><td>{c.media === 'video' ? 'Video' : 'Voice'}</td>
        <td><Pill tone={{ answered: 'mint', ended: 'gray', ringing: 'amber', missed: 'red', rejected: 'red' }[c.status] ?? 'gray'}>{c.status}</Pill></td>
        <td className="muted">{when(c.startedAt)}</td><td className="mono">{dur(c.answeredAt, c.endedAt)}</td></tr>)}
      {!r.data.length && <tr><td colSpan={6} className="empty">{status || media || q ? 'No calls match these filters.' : 'No calls yet. Calls appear here once members ring each other (needs the calls switch on).'}</td></tr>}
    </tbody></table>}
    <p className="note">Call metadata only — audio and video go peer-to-peer (or through TURN) and are never recorded.</p>
  </Card>;
}

function PushPage() {
  const r = useApi<PushStats>('/admin/push/stats');
  const { run, busy } = useAct();
  const [uid, setUid] = useState(''); const [res, setRes] = useState<{ queued: boolean; tokens: number; message: string } | null>(null);
  return <>
    <Gate rs={[r]}>{() => { const d = r.data!; const t = d.tokens ?? { total: 0, byPlatform: {}, byProvider: {} }; const l = d.last24h ?? { sent: 0, failed: 0, skipped: 0 };
      return <>
        <div className="kpis">
          <Kpi label="Push tokens" value={n0(t.total)} sub={`iOS ${n0(t.byPlatform?.ios)} · Android ${n0(t.byPlatform?.android)} · Web ${n0(t.byPlatform?.web)}`} />
          <Kpi label="Sent · 24h" value={n0(l.sent)} tone="good" />
          <Kpi label="Failed · 24h" value={n0(l.failed)} tone={l.failed ? 'bad' : ''} />
          <Kpi label="Skipped · 24h" value={n0(l.skipped)} sub={`Expo ${n0(t.byProvider?.expo)} · FCM ${n0(t.byProvider?.fcm)} tokens (FCM not sent yet)`} />
        </div>
        <Card title="Recent sends" extra={<div className="row"><LivePill /><button className="btn sm ghost" onClick={r.reload}>Refresh</button></div>}>
          <table><thead><tr><th>Member</th><th>Kind</th><th>Result</th><th>Error</th><th>When</th></tr></thead><tbody>
            {(d.recent ?? []).map(x => <tr key={x.id}><td>{x.handle ?? <code>{x.userId}</code>}</td><td><code>{x.kind}</code></td><td>{x.ok ? <Pill tone="mint">{x.status || 'ok'}</Pill> : <Pill tone={x.status === 'skipped' ? 'gray' : 'red'}>{x.status || 'failed'}</Pill>}</td><td className="small muted">{x.error ?? '—'}</td><td className="muted">{when(x.at)}</td></tr>)}
            {!(d.recent ?? []).length && <tr><td colSpan={5} className="empty">No pushes sent yet. Members register Expo tokens from the app; then sends show here.</td></tr>}
          </tbody></table></Card>
      </>; }}</Gate>
    <Card title="Send a test push">
      <p className="note">Queues a “Test from VibeLoop” push to every token of one member. Sends run in the background.</p>
      <form className="row" onSubmit={e => { e.preventDefault(); run(() => api<{ queued: boolean; tokens: number; message: string }>('/admin/push/test', { method: 'POST', body: { userId: uid.trim() } }), undefined, x => { setRes(x); r.reload(); }); }}>
        <input className="mono" aria-label="User id" value={uid} onChange={e => setUid(e.target.value)} placeholder="User id, e.g. usr_riya" />
        <button className="btn sm prism" disabled={busy || !uid.trim()}>Send test</button>
        {res && <span className={'small ' + (res.queued ? '' : 'red')} data-test-result>{res.queued ? '✓ ' : '✕ '}{res.message} ({res.tokens} token{res.tokens === 1 ? '' : 's'})</span>}
      </form></Card>
  </>;
}

function E2eePage() {
  const r = useApi<E2eeStats>('/admin/e2ee');
  return <Gate rs={[r]}>{() => { const d = r.data!;
    return <>
      <div className="kpis">
        <Kpi label="Members with keys" value={n0(d.usersWithKeys)} />
        <Kpi label="Devices" value={n0(d.devices)} sub="public keys registered" />
        <Kpi label="Encrypted chats" value={n0(d.e2eeConvs)} />
        <Kpi label="Encrypted messages" value={n0(d.encryptedMessages)} />
      </div>
      <div className="grid g2">
        <Card title="What staff can’t see">
          <ul className="steps">
            <li><b>Message contents of encrypted chats.</b> The server stores ciphertext only; text shows as “[encrypted]” everywhere in admin.</li>
            <li>Encrypted messages can’t be searched, edited, forwarded or moderated by staff. Reports on them only include what the reporter chooses to share.</li>
            <li>Push previews for encrypted chats always say “New message”.</li>
            <li>We can still see metadata: who is in a chat, when messages were sent, and sizes.</li>
          </ul></Card>
        <Card title="Honest scope">
          <ul className="steps">
            <li>Each message is sealed with <b>NaCl box</b> (X25519 + XSalsa20-Poly1305) to the recipient’s device public key.</li>
            <li><b>No forward secrecy yet</b> — a leaked device private key could decrypt that device’s past messages. A ratchet (Signal-style) is not built.</li>
            <li>Keys live on devices; a new device without the old key can’t read old encrypted history.</li>
            <li>Turn the whole thing off with <code>features.e2ee</code> in <a className="link" href="#/limits">Feature Dials</a>.</li>
          </ul></Card>
      </div>
      {d.note && <p className="note">{d.note}</p>}
    </>; }}</Gate>;
}

/* ===================== Learn / Help ===================== */
const GUIDES: { t: string; icon: string; href: string; link: string; steps: ReactNode[] }[] = [
  { t: 'How config layers resolve', icon: 'slabs', href: '#/preview', link: 'Open Config preview', steps: [
    <>Every app request resolves one config: built-in defaults → <code>base</code> → <code>country:XX</code> → <code>zone:KEY</code> → <code>slab:key</code> → <code>lang:code</code>.</>,
    <>Later layers win. Objects merge key by key; nav lists merge by item <code>key</code>.</>,
    <>Country comes from the request, then the profile, then the <code>X-Country</code> header, else IN. The zone is the first zone listing that country (<code>*</code> is catch-all).</>,
    <>Every save bumps the config version; apps refetch when it changes. Check the result in Config preview before shipping.</>] },
  { t: 'Turn a nav item or screen off for one country', icon: 'navigation', href: '#/navigation?layer=country:US', link: 'Open Navigation · country:US', steps: [
    <>Go to Navigation (tabs) or Screens (any screen), pick the <b>country</b> layer and type the ISO code, e.g. US.</>,
    <>Flip the switch; the row is marked <i>this layer</i>. Save to <code>country:US</code>.</>,
    <>The server refuses a save that leaves an enabled module with no tabs — the reason appears in red and as a toast.</>,
    <>Undo by clearing the override, or delete the whole layer.</>] },
  { t: 'OTP rate limits & kill switches', icon: 'otp', href: '#/otp', link: 'Open OTP & login', steps: [
    <>OTP requests and registrations are limited to 5 per identifier and 5 per IP every 15 minutes; rate-limited rows are flagged red.</>,
    <>A code locks after 5 wrong attempts (429). Unknown identifiers get a fake response so accounts can’t be probed.</>,
    <>Kill switches <code>otp</code>, <code>chat</code> and <code>social</code> are enforced in middleware; engaging needs a confirm step and is audited.</>] },
  { t: 'Payout approval flow', icon: 'payouts', href: '#/payouts', link: 'Open Payouts', steps: [
    <>Creators request payouts from Earnings; requests land as <i>pending</i> in Payouts.</>,
    <>Approve or reject with a note — the decision and reviewer are audited.</>,
    <>The <code>payouts</code> kill switch, or <code>features.payouts</code>/<code>screens.Payout</code> off for a country, blocks new requests with 403/503.</>] },
  { t: 'Moderation reason codes', icon: 'moderation', href: '#/moderation', link: 'Open Moderation', steps: [
    <>Every report carries a reason code; resolve with remove, clear or escalate.</>,
    <>Codes are managed in Platform settings → Moderation, so wording stays consistent across reviewers.</>,
    <>Every decision is written to the Audit log with the reviewer’s handle.</>] },
];
GUIDES.push(
  { t: 'Turn on money features', icon: 'money', href: '#/money', link: 'Open Money switches', steps: [
    <>Everything money-related is <b>off</b> by default: the app hides it and the API answers 403 “Not enabled”.</>,
    <>In Money switches turn on the <b>Money</b> master switch, then each module you want: Backstage Pass, Stash, Props, Boosts, Platform fee.</>,
    <>Save — the switches are mirrored into the config base layer (<code>features.*</code>) and the version bumps, so apps refresh. Use a country layer in Features & limits to switch a module off for one country.</>,
    <>Checkout still answers 409 “Payments not configured by admin” until a payment Plug is connected. Cash Flow counts only payments confirmed by a signed webhook.</>] },
  { t: 'Connect Razorpay test keys', icon: 'plugs', href: '#/plugs', link: 'Open Plugs', steps: [
    <>In the Razorpay Dashboard switch to <b>Test Mode</b> → Account & Settings → API Keys → generate a key (<code>rzp_test_…</code> + secret).</>,
    <>In Plugs → Razorpay keep mode <b>Test</b>, paste Key ID and Key secret, Save, then <b>Test connection</b> — the server calls Razorpay and shows the answer.</>,
    <>Add a webhook in Razorpay → Webhooks: URL <code>{API_URL}/webhooks/razorpay</code>, event <code>payment_link.paid</code>, and a secret; paste the same secret as Webhook secret here.</>,
    <>Only webhooks whose <code>X-Razorpay-Signature</code> HMAC matches mark an order paid.</>] },
  { t: 'Connect Cashfree sandbox keys', icon: 'plugs', href: '#/plugs', link: 'Open Plugs', steps: [
    <>In the Cashfree Merchant Dashboard switch to <b>Sandbox</b> → Developers → API Keys and copy the App ID and Secret key.</>,
    <>In Plugs → Cashfree keep mode <b>Test</b> (uses <code>sandbox.cashfree.com</code>), paste both, Save and Test connection.</>,
    <>Add a webhook to <code>{API_URL}/webhooks/cashfree</code> for payment-link events. Signatures are verified with <code>timestamp + body</code> HMAC-SHA256.</>] },
  { t: 'Run a brand promo for one state', icon: 'promos', href: '#/promos?edit=new', link: 'Open Promos', steps: [
    <>Promos are our own brand messages (not ads): they show to everyone the targeting matches, labelled “From VibeLoop”.</>,
    <>In Promos press <b>New promo</b>. Add a title, body, CTA label and https link; upload an image or video (resumable, checked by contents) or paste a media URL.</>,
    <>Pick placements (Home banner, Feed, Chat list, Splash, Explore). Turn <b>Global</b> off, add country <code>IN</code> and state <code>TN</code> — filled lists combine with AND, so only Tamil Nadu sees it.</>,
    <>Optionally set start/end times and a priority (higher shows first). Check the live preview, then use <b>Preview as</b> IN/TN vs US to confirm who sees it.</>,
    <>The <code>promos</code> switch on the Promos page (config feature) turns every promo off at once.</>] },
  { t: 'Send login codes with MSG91', icon: 'otp', href: '#/plugs', link: 'Open Plugs', steps: [
    <>In MSG91 → Email, verify a sending domain and create a template that uses the variable <code>{'{{otp}}'}</code>.</>,
    <>In Plugs → MSG91 paste the Auth key, template ID and the From email on that domain; turn on “Send login codes via MSG91”, Save, Test connection.</>,
    <>Codes are then emailed — phone numbers are never required. If MSG91 fails, the failure is logged (masked email only) and demo codes still work in dev.</>] },
);
GUIDES.push(
  { t: 'Turn on calls with your TURN server', icon: 'calls', href: '#/plugs', link: 'Open Plugs', steps: [
    <>Calls work on STUN alone for most networks; strict NATs (offices, some mobile carriers) need a TURN relay.</>,
    <>Install <b>coturn</b> on a server with a public IP. In <code>turnserver.conf</code> set <code>use-auth-secret</code>, <code>static-auth-secret=&lt;long random string&gt;</code>, <code>realm=yourdomain</code>, and open UDP/TCP 3478 (+ 5349 for TLS) and the relay port range.</>,
    <>In Plugs → TURN paste URLs like <code>turn:turn.yourdomain:3478, turns:turn.yourdomain:5349</code> and the same value as <b>Shared secret</b>. Save, then Test connection.</>,
    <>Apps get short-lived credentials (1 h) from <code>/rtc/ice</code>; the secret never leaves the server. Make sure <code>features.calls</code> is on in Feature Dials, then watch Call Log.</>] },
  { t: 'Set up push notifications', icon: 'push', href: '#/push', link: 'Open Push Center', steps: [
    <>The app registers an <b>Expo push token</b> after the member allows notifications; tokens show in Push Center by platform.</>,
    <>No key is needed for Expo by default. If you turned on Enhanced Push Security in your Expo project, create an access token and paste it in Plugs → Expo push.</>,
    <>Keep <code>features.push</code> on in Feature Dials. FCM tokens are stored but not sent to yet — use Expo tokens.</>,
    <>In Push Center enter a member’s user id and press <b>Send test</b>; the result and any Expo error appear in Recent sends.</>] },
);
function LearnPage() {
  return <>
    <Card className="learnhero"><span className="eyebrow">Staff guides</span><h2>How VibeLoop admin works</h2><p className="muted">Short how-tos for the jobs staff do most. Each one links to the page where you do it.</p></Card>
    <div className="grid g2">{GUIDES.map(g => <Card key={g.t} title={g.t} extra={<Icon name={g.icon} />}><ol className="steps">{g.steps.map((s, i) => <li key={i}>{s}</li>)}</ol><a className="btn sm ghost mt" href={g.href}>{g.link} →</a></Card>)}</div>
  </>;
}

/** Extra global-search groups for config, identity and chat data. */
function useCfgSearch(t: string) {
  const on = !!t;
  const lr = useApi<LayersRes>(on ? '/admin/config/layers' : null);
  const zs = useApi<Record<string, Zone>>(on ? '/admin/zones' : null);
  const sl = useApi<Slab[]>(on ? '/admin/slabs' : null);
  const tw = useApi<Town[]>(on ? '/admin/towns' : null);
  const tp = useApi<Record<string, Preset[]>>(on ? '/admin/theme/presets' : null);
  const ot = useApi<OtpRow[]>(on ? '/admin/otp' : null);
  const has = (...xs: (string | number)[]) => xs.join(' ').toLowerCase().includes(t);
  if (!on) return [];
  const strings = new Map<string, string>();
  for (const [k, l] of Object.entries(lr.data?.layers ?? {})) for (const s of Object.keys(l.languages?.strings ?? {})) if (!strings.has(s)) strings.set(s, k.split(':')[1] ?? '');
  type Row = { k: string; title: ReactNode; sub: ReactNode; tag?: ReactNode; href: string };
  const g: [string, string, Row[]][] = [
    ['Config layers', 'navigation', Object.keys(lr.data?.layers ?? {}).filter(k => has(k, Object.keys(lr.data!.layers[k]).join(' '))).map(k => ({ k, title: <code>{k}</code>, sub: Object.keys(lr.data!.layers[k]).join(', ') || 'empty', href: k.startsWith('lang:') ? '#/languages?lang=' + k.slice(5) : '#/navigation' + (k === 'base' ? '' : '?layer=' + k) }))],
    ['Themes', 'themes', [...(has('theme', 'design', 'colour', 'color') ? [{ k: 'themes', title: 'Themes & design', sub: 'Social and Chat colours, presets, nav style, radius, density', href: '#/themes' }] : []),
      ...Object.entries(tp.data ?? {}).flatMap(([m, ps]) => ps.filter(p => has(p.key, m + ' theme', p.primary)).map(p => ({ k: m + p.key, title: <span className="row"><span className="sw">{[p.primary, p.secondary, p.accent].map(x => <i key={x} style={{ background: x }} />)}</span>{cap(p.key)}</span>, sub: `${cap(m)} preset · ${p.navStyle} · ${p.primary}`, href: '#/themes' }))),
      ...Object.entries(lr.data?.layers ?? {}).filter(([, l]) => l.theme && has('theme')).map(([k, l]) => ({ k: 'tl' + k, title: <code>{k}</code>, sub: 'theme: ' + Object.entries(l.theme as Record<string, ThemeMod>).map(([m, v]) => `${m} ${v.preset ?? 'custom'}`).join(', '), href: '#/themes' + (k === 'base' ? '' : '?layer=' + k) }))]],
    ['User App Settings', 'userapp', has('user app', 'settings', 'defaults', 'limits', 'maintenance', 'sign-up', 'signup', 'min version', 'force update', 'otp', 'group size', 'file size', 'voice note', 'blink', 'privacy', 'edit window', 'unsend', 'reports', 'lenses', 'reactions', 'hashtags', 'mentions', 'read receipts', 'last seen', 'typing', 'fade', 'calls', 'mood') ? [{ k: 'userapp', title: 'User App Settings', sub: 'Glow, Hush & global defaults and limits per layer — limits.*, defaults.*, access.*', href: '#/userapp' }] : []],
    ['All switches', 'switches', has('switch', 'switches', 'flag', 'flags', 'bulk', 'on/off') ? [{ k: 'switches', title: 'All switches', sub: 'Every feature flag and screen switch with bulk on/off', href: '#/switches' }] : []],
    ['Module names', 'navigation', has('module name', 'module names', 'rename module', 'd-switch', 'dswitch', 'glow', 'hush') ? [{ k: 'modnames', title: 'Module names', sub: 'Rename Glow / Hush per layer — moduleNames, module.social, module.chat', href: '#/navigation' }] : []],
    ['Screens', 'screens', SCREEN_KEYS.filter(k => has(k, SCREEN_DESC[k] ?? '')).slice(0, 10).map(k => ({ k, title: k, sub: `screens.${k}${SCREEN_DESC[k] ? ' · ' + SCREEN_DESC[k] : ''}`, href: '#/screens' }))],
    ['Live & reach', 'realtime', LIVE_PAGES.filter(x => has(...x)).map(([slug, title, sub]) => ({ k: slug, title, sub, href: '#/' + slug }))],
    ['Feature switches', 'limits', FEATURE_KEYS.filter(k => has(k, FEATURE_DESC[k])).map(k => ({ k, title: <code>features.{k}</code>, sub: FEATURE_DESC[k], href: '#/limits' }))],
    ['Zones', 'zones', Object.entries(zs.data ?? {}).filter(([k, z]) => has(k, z.name, z.countries.join(' '))).map(([k, z]) => ({ k, title: `${k} · ${z.name}`, sub: z.countries.join(', ') || 'no countries', href: '#/zones' }))],
    ['Slabs', 'slabs', (sl.data ?? []).filter(s => has(s.key, s.name)).map(s => ({ k: s.key, title: s.name, sub: `slab:${s.key} · ${s.minFollowers}+ followers`, href: '#/slabs' }))],
    ['Language strings', 'languages', [...strings].filter(([s, l]) => has(s) || t === l).slice(0, 10).map(([s, l]) => ({ k: s, title: <code>{s}</code>, sub: `English: ${enFor(s)}`, href: '#/languages?lang=' + (t.length <= 3 && t === l ? l : l || 'ta') }))],
    ['Towns', 'chat', (tw.data ?? []).filter(x => has(x.name, x.id, x.owner ?? '')).map(x => ({ k: x.id, title: x.name, sub: `${x.owner ?? ''} · ${x.members} members`, tag: x.suspended ? <Pill tone="red">suspended</Pill> : undefined, href: '#/chat' }))],
    ['OTP log (masked)', 'otp', (ot.data ?? []).filter(x => has(x.identifier, x.ip)).slice(0, 8).map(x => ({ k: x.id, title: <span className="mono">{x.identifier}</span>, sub: `${when(x.at)} · ${x.ip}`, tag: x.rateLimited ? <Pill tone="red">rate-limited</Pill> : x.verified ? <Pill tone="mint">verified</Pill> : undefined, href: '#/otp' }))],
  ];
  return g;
}

/* ---------- widgets ---------- */
function Search({ v, set, ph }: { v: string; set: (s: string) => void; ph: string }) {
  return <label className="search"><Icon name="search" size={16} /><input value={v} onChange={e => set(e.target.value)} placeholder={ph} /></label>;
}
function Tabs<T extends string>({ v, set, opts }: { v: T; set: (t: T) => void; opts: [T, string][] }) {
  return <div className="tabs">{opts.map(([k, l]) => <button key={k} className={v === k ? 'on' : ''} onClick={() => set(k)}>{l}</button>)}</div>;
}

const VIEWS: Record<Slug, () => ReactNode> = { dashboard: Dashboard, users: Users, moderation: Moderation, payouts: Payouts, health: Health, costs: Costs, flags: Flags, audit: Audit, privacy: Privacy, abuse: Abuse, appeals: Appeals, scan: ScanQueue, incidents: Incidents, revenue: Revenue, announcements: Announcements, roles: Roles, settings: SettingsPage, emoji: Emoji, features: Features, search: GlobalSearch,
  navigation: NavigationPage, userapp: UserAppSettingsPage, switches: AllSwitchesPage, themes: ThemesPage, screens: ScreensPage, limits: LimitsPage, zones: ZonesPage, slabs: SlabsPage, languages: LanguagesPage, preview: PreviewPage, otp: OtpPage, identity: IdentityPage, chat: ChatPage, learn: LearnPage, realtime: RealtimePage, calls: CallsPage, push: PushPage, e2ee: E2eePage,
  cashflow: CashFlowPage, money: MoneyPage, plans: PlansPage, countries: CountriesPage, boosts: BoostsPage, stash: StashPage, plugs: PlugsPage, promos: PromosPage, uploads: UploadsPage,
  pages: PagesPage, blog: BlogPage, reviews: ReviewsPage, speakup: SpeakUpPage };

function useAuth() {
  const [tok, setTok] = useState(getToken);
  useEffect(() => { const f = () => setTok(getToken()); addEventListener('vl-auth', f); return () => removeEventListener('vl-auth', f); }, []);
  return tok;
}
export default function App() {
  const tok = useAuth();
  return tok ? <Console /> : <Login />;
}
function Console() {
  const [s, dispatch] = useReducer(reducer, initialState);
  const route = useHash(); const { slug } = route;
  const ctx = useMemo(() => ({ s, dispatch }), [s]);
  const [toastMsg, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toastMsg) return; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); }, [toastMsg]);
  const [tq, setTq] = useState('');
  const health = useApi<{ ok: boolean; version: string }>('/health');
  const ov = useApi<Overview>('/admin/overview');
  useEffect(() => { const f = () => { health.reload(); ov.reload(); }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, [health.reload, ov.reload]);
  const me = getUser();
  useEffect(() => { document.querySelector('.side nav a.on')?.scrollIntoView({ block: 'nearest' }); }, [slug]);
  const View = VIEWS[slug];
  const title = PAGES.find(p => p[0] === slug)![1];
  const badge: Partial<Record<Slug, number>> = { moderation: ov.data?.openReports, payouts: ov.data?.pendingPayouts, privacy: ov.data?.pendingPrivacy };
  return <Ctx.Provider value={ctx}><RouteCtx.Provider value={route}><ToastCtx.Provider value={setToast}>
    <div className="app">
      <aside className="side">
        <div className="brand"><Logo /><div><b>VibeLoop</b><small>Admin</small></div></div>
        <nav>{PAGES.map(([k, l]) => <Fragment key={k}>{NAV_HEADINGS[k] && <h6 className="navh">{NAV_HEADINGS[k]}</h6>}<a href={'#/' + k} className={k === slug ? 'on' : ''}><Icon name={k} /><span>{l}</span>{!!badge[k] && <em>{badge[k]}</em>}</a></Fragment>)}</nav>
        <div className="me"><span className="av sm">{(me?.name ?? 'A')[0]}</span><div><b>{me?.email ?? 'staff'}</b><small>{me?.handle ?? ''} · {cap(me?.role ?? 'owner')}</small></div></div>
      </aside>
      <main>
        <header className="top">
          <div><small className="crumb">Admin / {title}</small><h1>{title}</h1></div>
          <div className="row"><form className="search topsearch" onSubmit={e => { e.preventDefault(); location.hash = '#/search?q=' + encodeURIComponent(tq.trim()); }}><Icon name="search" size={16} /><input value={tq} onChange={e => setTq(e.target.value)} placeholder="Search everything…" aria-label="Global search" /></form>
            <span className={'env ' + (health.data?.ok ? 'live' : health.error ? 'down' : '')} title={API_URL}>{health.data?.ok ? `Live API · v${health.data.version}` : health.error ? 'API unreachable' : 'Connecting…'}</span>
            <button className="btn sm ghost" onClick={() => setSession(null)}>Sign out</button></div>
        </header>
        <div className="content"><View /></div>
      </main>
      {toastMsg && <div className={'toast' + (toastMsg.startsWith('Error') ? ' bad' : '')} role="status"><Icon name={toastMsg.startsWith('Error') ? 'x' : 'check'} size={16} />{toastMsg}</div>}
    </div>
  </ToastCtx.Provider></RouteCtx.Provider></Ctx.Provider>;
}

/* ===================== Content & trust (v5): CMS pages, blog/news, reviews, Speak Up ===================== */
type PageItem = Record<string, string>;
type PageRow = { slug: string; module: 'glow' | 'hush' | 'both'; kind: string; title: string; summary: string; body: string; coverUrl: string | null;
  itemsKind: 'faq' | 'links' | 'contacts' | null; items: PageItem[]; published: boolean; order: number; updatedAt?: number; version?: number; updatedBy?: string };
type PageVersionRow = { version: number; at: number; by: string; note: string; snapshot: Omit<PageRow, 'slug'> };
const NEW_PAGE = (kind: string): PageRow => ({ slug: '', module: 'both', kind, title: '', summary: '', body: '# Title\nWrite something people actually want to read.', coverUrl: null,
  itemsKind: kind === 'faq' ? 'faq' : kind === 'links' ? 'links' : null, items: [], published: false, order: 0 });
const MODULE_LABEL: Record<string, string> = { glow: 'Glow', hush: 'Hush', both: 'Both' };
const ITEM_FIELDS: Record<string, [string, string][]> = { faq: [['q', 'Question'], ['a', 'Answer']], links: [['label', 'Label'], ['url', 'https://…'], ['platform', 'android | ios | web | other'], ['note', 'Note']],
  contacts: [['label', 'Label'], ['value', 'Value'], ['type', 'email | phone | url | ticket']] };
const ITEM_BLANK: Record<string, PageItem> = { faq: { q: '', a: '' }, links: { label: '', url: '', platform: 'web', note: '' }, contacts: { label: '', value: '', type: 'email' } };

/** The same tiny markdown the apps render: # h1, ## h2, - bullets, **bold**, [text](url). Built as elements — never innerHTML. */
function mdInline(s: string, k: string): ReactNode[] {
  const out: ReactNode[] = []; const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g; let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(m[1] !== undefined ? <b key={k + i++}>{m[1]}</b> : <a key={k + i++} className="link" href={/^(https?:\/\/|\/)/.test(m[3]) ? m[3] : '#'} target="_blank" rel="noreferrer">{m[2]}</a>);
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []; let list: string[] = []; let para: string[] = [];
  const flush = () => {
    if (list.length) { const l = list; blocks.push(<ul key={'u' + blocks.length}>{l.map((x, i) => <li key={i}>{mdInline(x, 'l' + i)}</li>)}</ul>); list = []; }
    if (para.length) { blocks.push(<p key={'p' + blocks.length}>{mdInline(para.join(' '), 'p' + blocks.length)}</p>); para = []; }
  };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    if (line.startsWith('## ')) { flush(); blocks.push(<h3 key={'h' + blocks.length}>{mdInline(line.slice(3), 'h')}</h3>); }
    else if (line.startsWith('# ')) { flush(); blocks.push(<h2 key={'h' + blocks.length}>{mdInline(line.slice(2), 'h')}</h2>); }
    else if (/^[-*] /.test(line)) { if (para.length) { const p = para; para = []; blocks.push(<p key={'p' + blocks.length}>{mdInline(p.join(' '), 'q')}</p>); } list.push(line.slice(2)); }
    else { if (list.length) flush(); para.push(line.trim()); }
  }
  flush();
  return <div className="md">{blocks}</div>;
}
function PagePreview({ p }: { p: PageRow }) {
  return <div className={'pgprev mod-' + p.module}>
    <div className="pgprev-h"><span className="pc-label">{p.kind === 'blog' ? (p.module === 'hush' ? 'Hush Notes' : 'The Loopdown') : p.kind === 'news' ? 'Fresh Wire' : MODULE_LABEL[p.module]}</span>
      {!p.published && <Pill tone="amber">draft</Pill>}</div>
    {p.summary && <p className="muted small">{p.summary}</p>}
    <Markdown text={p.body} />
    {p.itemsKind === 'faq' && <div className="faq">{p.items.map((x, i) => <details key={i} open={i === 0}><summary>{x.q || 'Question'}</summary><p>{x.a}</p></details>)}</div>}
    {p.itemsKind === 'links' && <div className="plinks">{p.items.map((x, i) => <div key={i} className="plink"><Pill tone={x.url ? 'violet' : 'gray'}>{x.platform}</Pill><b>{x.label}</b><small>{x.url || x.note || 'no link'}</small></div>)}</div>}
    {p.itemsKind === 'contacts' && <div className="plinks">{p.items.map((x, i) => <div key={i} className="plink"><Pill tone="violet">{x.type}</Pill><b>{x.label}</b><small>{x.value}</small></div>)}</div>}
  </div>;
}
function ItemsEditor({ kind, items, set }: { kind: string; items: PageItem[]; set: (v: PageItem[]) => void }) {
  const fields = ITEM_FIELDS[kind];
  const upd = (i: number, k: string, v: string) => set(items.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const move = (i: number, d: number) => { const n = [...items]; const [x] = n.splice(i, 1); n.splice(Math.max(0, Math.min(n.length, i + d)), 0, x); set(n); };
  return <div className="items">
    {items.map((x, i) => <div key={i} className={'itemrow ik-' + kind}>
      <span className="num muted">{i + 1}</span>
      <div className="itemf">{fields.map(([k, ph]) => k === 'a' ? <textarea key={k} rows={2} aria-label={ph} placeholder={ph} value={x[k] ?? ''} onChange={e => upd(i, k, e.target.value)} />
        : (k === 'platform' || k === 'type') ? <select key={k} aria-label={k} value={x[k]} onChange={e => upd(i, k, e.target.value)}>{ph.split(' | ').map(o => <option key={o}>{o}</option>)}</select>
        : <input key={k} aria-label={ph} placeholder={ph} className={k === 'url' ? 'mono' : ''} value={x[k] ?? ''} onChange={e => upd(i, k, e.target.value)} />)}</div>
      <div className="itemctl"><button className="btn sm ghost" title="Move up" disabled={!i} onClick={() => move(i, -1)}><Icon name="up" size={12} /></button><button className="btn sm ghost" title="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}><Icon name="down" size={12} /></button>
        <button className="btn sm danger" title="Remove" onClick={() => set(items.filter((_, j) => j !== i))}><Icon name="x" size={12} /></button></div>
    </div>)}
    <button className="btn sm ghost" onClick={() => set([...items, { ...ITEM_BLANK[kind] }])}><Icon name="t-plus" size={14} />Add {kind === 'faq' ? 'question' : kind === 'links' ? 'link' : 'contact'}</button>
  </div>;
}

/** A config-base feature switch (mirrors the Promos page pattern). */
function useFeatureSwitches() {
  const layers = useApi<LayersRes>('/admin/config/layers');
  const { run, busy } = useAct();
  const base = layers.data?.layers.base ?? {};
  const on = (k: string) => base.features?.[k] !== false;
  const flip = (k: string, label: string) => run(() => api('/admin/config/base', { method: 'PUT', body: { ...base, features: { ...(base.features ?? {}), [k]: !on(k) } } }), `${label} ${on(k) ? 'switched off' : 'switched on'} for everyone`, layers.reload);
  const sw = (k: string, label: string) => <span className="row fsw"><span className="small muted">{label}</span><Toggle label={label} on={on(k)} onClick={() => flip(k, label)} disabled={busy || !layers.data} /></span>;
  return { layers, on, sw, base };
}

function PageEditor({ kinds, reload, close, rows }: { kinds: string[]; reload: () => void; close: () => void; rows: PageRow[] }) {
  const editId = hp('edit')!;
  const isNew = editId === 'new' || editId.startsWith('new:');
  const [d, setD] = useState<PageRow | null>(null);
  const [note, setNote] = useState('');
  const vs = useApi<PageVersionRow[]>(isNew ? null : `/pages/${editId}/versions`);
  const { run, busy } = useAct();
  useEffect(() => { if (isNew) setD(NEW_PAGE(editId.split(':')[1] ?? kinds[0])); else { const x = rows.find(p => p.slug === editId); setD(x ? clone2(x) : null); } setNote(''); }, [editId, rows]);
  if (!d) return <Card><p className="empty">No page “{editId}”.</p></Card>;
  const set = (p: Partial<PageRow>) => setD(x => x && { ...x, ...p });
  const orig = rows.find(p => p.slug === d.slug);
  const dirty = !orig || JSON.stringify({ ...orig, updatedAt: 0, version: 0, updatedBy: '' }) !== JSON.stringify({ ...d, updatedAt: 0, version: 0, updatedBy: '' });
  const after = () => { reload(); vs.reload(); };
  const save = () => run(() => isNew ? api<PageRow>('/admin/pages', { method: 'POST', body: d })
    : api<PageRow>(`/admin/pages/${d.slug}`, { method: 'PATCH', body: { module: d.module, kind: d.kind, title: d.title, summary: d.summary, body: d.body, coverUrl: d.coverUrl, itemsKind: d.itemsKind, items: d.items, order: d.order, note } }),
    isNew ? 'Page created' : 'Saved as a new version', r => { after(); setNote(''); if (isNew) setHp('edit', r.slug); });
  const publish = () => run(() => api(`/admin/pages/${d.slug}/publish`, { method: 'POST', body: { published: !orig!.published } }), orig!.published ? 'Unpublished — hidden from the apps' : 'Published — live in the apps', after);
  return <>
    <div className="grid g1-2">
      <Card title={isNew ? 'New page' : `Edit · ${orig?.title}`} className="peditor pgeditor" extra={!isNew ? <div className="row"><Pill tone="gray">v{orig?.version}</Pill><span className="small muted">Published</span>
        <Toggle label="Published" on={!!orig?.published} onClick={publish} disabled={busy} /></div> : undefined}>
        <div className="fgrid">
          <label><span className="lbl">Slug</span><input className="mono" aria-label="slug" disabled={!isNew} value={d.slug} onChange={e => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} placeholder="house-rules" /></label>
          <label><span className="lbl">Module</span><select aria-label="module" value={d.module} onChange={e => set({ module: e.target.value as PageRow['module'] })}>{(['glow', 'hush', 'both'] as const).map(m => <option key={m} value={m}>{MODULE_LABEL[m]}</option>)}</select></label>
          <label><span className="lbl">Kind</span><select aria-label="kind" value={d.kind} onChange={e => set({ kind: e.target.value, itemsKind: e.target.value === 'faq' ? 'faq' : e.target.value === 'links' ? 'links' : d.itemsKind })}>{kinds.map(k => <option key={k}>{k}</option>)}</select></label>
          <label><span className="lbl">Order</span><input type="number" aria-label="order" value={d.order} onChange={e => set({ order: Math.trunc(+e.target.value) })} /></label>
        </div>
        <span className="lbl">Title</span><input className="wide" aria-label="title" maxLength={160} value={d.title} onChange={e => set({ title: e.target.value })} />
        <span className="lbl">Summary</span><input className="wide" aria-label="summary" maxLength={400} value={d.summary} onChange={e => set({ summary: e.target.value })} />
        <span className="lbl">Body <small className="inl">— # heading · ## subheading · - bullet · **bold** · [text](https://…)</small></span>
        <textarea className="mdsrc" rows={14} aria-label="body" value={d.body} onChange={e => set({ body: e.target.value })} />
        {!kinds.includes('blog') && <>
          <span className="lbl">Items</span>
          <div className="row"><select aria-label="items kind" value={d.itemsKind ?? ''} onChange={e => set({ itemsKind: (e.target.value || null) as PageRow['itemsKind'], items: e.target.value === d.itemsKind ? d.items : [] })}>
            <option value="">No items</option><option value="faq">FAQ (question & answer)</option><option value="links">Links (app stores, web)</option><option value="contacts">Contacts (email, phone, ticket)</option></select></div>
          {d.itemsKind && <ItemsEditor kind={d.itemsKind} items={d.items} set={items => set({ items })} />}</>}
        {!isNew && <><span className="lbl">Change note (shows in version history)</span><input className="wide" aria-label="change note" maxLength={200} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Updated helpline numbers" /></>}
        <div className="row end mt">{!isNew && <button className="btn sm danger" disabled={busy} onClick={() => confirm(`Delete “${d.title}” and its history?`) && run(() => api(`/admin/pages/${d.slug}`, { method: 'DELETE' }), 'Page deleted', () => { reload(); close(); })}>Delete</button>}
          <button className="btn sm ghost" onClick={close}>Close</button>
          <button className="btn sm prism" disabled={busy || !dirty || !d.title.trim() || (isNew && d.slug.length < 3)} onClick={save}>{isNew ? 'Create page' : 'Save new version'}</button></div>
      </Card>
      <Card title="Live preview" extra={<span className="muted small">as the apps render it</span>}><PagePreview p={d} /></Card>
    </div>
    {!isNew && <Card title="Version history" className="vhist" extra={<span className="muted small">Restore creates a new version — history is never rewritten</span>}>
      {vs.error ? <ApiErr msg={vs.error} retry={vs.reload} /> : !vs.data ? <p className="loading">Loading from API…</p> :
        <table><thead><tr><th>Version</th><th>When</th><th>By</th><th>Note</th><th>Title</th><th /></tr></thead><tbody>
          {vs.data.map(v => <tr key={v.version}><td><b className="num">v{v.version}</b> {v.version === orig?.version && <Pill tone="mint">current</Pill>}</td><td className="muted">{when(v.at)}</td><td className="mono">{v.by}</td>
            <td>{v.note || <span className="muted">—</span>}</td><td className="small">{v.snapshot.title}</td>
            <td className="r">{v.version !== orig?.version && <button className="btn sm ghost" disabled={busy} onClick={() => run(() => api(`/admin/pages/${d.slug}/restore`, { method: 'POST', body: { version: v.version } }), `Restored v${v.version} as a new version`, after)}>Restore</button>}</td></tr>)}
        </tbody></table>}
    </Card>}
  </>;
}

function PageList({ kinds, title, intro, extra }: { kinds: string[]; title: string; intro: ReactNode; extra?: ReactNode }) {
  const list = useApi<PageRow[]>('/admin/pages');
  const [mod, setMod] = useState<'all' | 'glow' | 'hush' | 'both'>((hp('module') as 'glow') ?? 'all');
  const [kind, setKind] = useState(hp('kind') ?? '');
  const edit = hp('edit');
  const open = (id: string | null) => setHp('edit', id);
  return <Gate rs={[list]}>{() => {
    const rows = list.data!.filter(p => kinds.includes(p.kind) && (mod === 'all' || p.module === mod || (mod !== 'both' && p.module === 'both')) && (!kind || p.kind === kind));
    return <>
      <Card title={title} extra={<div className="row"><LivePill />{extra}<button className="btn sm prism" onClick={() => open('new:' + (kind || kinds[0]))}><Icon name="t-plus" size={14} />New</button></div>}>
        <p className="note">{intro}</p>
        <div className="row mb"><Tabs v={mod} set={setMod} opts={[['all', 'All modules'], ['glow', 'Glow'], ['hush', 'Hush'], ['both', 'Both only']]} />
          <select aria-label="kind filter" value={kind} onChange={e => setKind(e.target.value)}><option value="">All kinds</option>{kinds.map(k => <option key={k}>{k}</option>)}</select>
          <span className="muted small">{rows.length} of {list.data!.filter(p => kinds.includes(p.kind)).length}</span></div>
        <table><thead><tr><th>Page</th><th>Module</th><th>Kind</th><th className="c">Order</th><th>Version</th><th>Updated</th><th>Status</th><th /></tr></thead><tbody>
          {rows.map(p => <tr key={p.slug} className={(p.published ? '' : 'dim') + (edit === p.slug ? ' sel' : '')}>
            <td><button className="linkrow" onClick={() => open(p.slug)}><b>{p.title}</b><small className="mono">/{p.slug}</small></button></td>
            <td><Pill tone={p.module === 'both' ? 'gray' : 'violet'}>{MODULE_LABEL[p.module]}</Pill></td><td><span className="tag">{p.kind}{p.itemsKind && p.itemsKind !== p.kind ? ' + ' + p.itemsKind : ''}</span></td>
            <td className="c num">{p.order}</td><td className="num">v{p.version}</td><td className="muted small">{when(p.updatedAt!)}<br />{p.updatedBy}</td>
            <td>{p.published ? <Pill tone="mint">published</Pill> : <Pill tone="amber">draft</Pill>}</td>
            <td className="r"><button className="btn sm ghost" onClick={() => open(p.slug)}>Edit</button></td></tr>)}
          {!rows.length && <tr><td colSpan={8} className="empty">Nothing here yet.</td></tr>}
        </tbody></table>
      </Card>
      {edit && <PageEditor kinds={kinds} rows={list.data!} reload={list.reload} close={() => open(null)} />}
    </>;
  }}</Gate>;
}
function PagesPage() {
  const f = useFeatureSwitches();
  return <PageList kinds={['page', 'faq', 'guide', 'links']} title="Pages" extra={f.sw('appLinks', 'Get the Apps')}
    intro={<>Help Hub, Hit Us Up, House Rules, Privacy Promise, Data Receipt, Our Story, SOS Lane, Glow/Hush Guides and Get the Apps. Only <b>published</b> pages reach the apps (<code>GET /pages?module=</code>); “Both” pages show in Glow and Hush. Every save keeps a version you can restore.</>} />;
}
function BlogPage() {
  const f = useFeatureSwitches();
  return <PageList kinds={['blog', 'news']} title="The Loopdown · Hush Notes · Fresh Wire" extra={<>{f.sw('blog', 'Blog')}{f.sw('news', 'News')}</>}
    intro={<>Blog posts are <b>The Loopdown</b> in Glow and <b>Hush Notes</b> in Hush; news is <b>Fresh Wire</b>. Switching <code>blog</code> or <code>news</code> off empties the list in the apps and makes the posts answer 403.</>} />;
}

type ReviewRow = { id: string; type: 'vouch' | 'product'; targetId: string; targetLabel: string; rating: number; text: string; context: string | null; verifiedPurchase: boolean; at: number; status: 'visible' | 'hidden'; author: { handle: string; name: string } | null };
const stars = (n: number) => <span className="stars" aria-label={`${n} of 5`}>{[1, 2, 3, 4, 5].map(i => <i key={i} className={i <= n ? 'on' : ''} />)}</span>;
function ReviewsPage() {
  const [type, setType] = useState<'' | 'vouch' | 'product'>((hp('type') as 'vouch') ?? '');
  const [status, setStatus] = useState(hp('status') ?? '');
  const r = useApi<ReviewRow[]>(`/admin/reviews?${type ? 'type=' + type + '&' : ''}${status ? 'status=' + status : ''}`);
  const money = useApi<MoneySettings>('/admin/money/settings');
  const f = useFeatureSwitches();
  const { run, busy } = useAct();
  const storeOn = !!(money.data?.money && money.data?.store);
  return <>
    <Card title="Feature switches" extra={<LivePill />}>
      <div className="fswgrid">
        <div><b>Reviews</b><small>Master switch for all review UI and API.</small>{f.sw('reviews', 'Reviews')}</div>
        <div><b>Vouches</b><small>Creator / collab reviews. Only people who are friends, collabed on a Drop, or bought from the creator can vouch.</small>{f.sw('vouches', 'Vouches')}</div>
        <div><b>Real Talk</b><small>Product reviews from verified buyers (paid orders) and free-product claimers. {!storeOn && <b className="red">Stash is off in Money switches, so Real Talk is off too.</b>}</small>{f.sw('productReviews', 'Real Talk')}</div>
      </div>
      <p className="note">Any switch off → the apps hide the UI and the API answers 403 “Not enabled”.</p>
    </Card>
    <Card title="Moderation queue" extra={<div className="row"><Tabs v={type} set={setType} opts={[['', 'All'], ['vouch', 'Vouches'], ['product', 'Real Talk']]} />
      <select aria-label="status filter" value={status} onChange={e => setStatus(e.target.value)}><option value="">Any status</option><option value="visible">Visible</option><option value="hidden">Hidden</option></select></div>}>
      <Gate rs={[r]}>{() => <table><thead><tr><th>Review</th><th>About</th><th>Rating</th><th>By</th><th>When</th><th>Status</th><th /></tr></thead><tbody>
        {r.data!.map(x => <tr key={x.id} className={x.status === 'hidden' ? 'dim' : ''}>
          <td className="rvtext"><span className="row"><Pill tone={x.type === 'vouch' ? 'violet' : 'gray'}>{x.type === 'vouch' ? 'Vouch' : 'Real Talk'}</Pill>{x.context && <span className="tag">{x.context}</span>}{x.verifiedPurchase && <Pill tone="mint">verified buyer</Pill>}</span><small>{x.text || <i>no text</i>}</small></td>
          <td className="small"><b>{x.targetLabel}</b><br /><span className="mono muted">{x.targetId}</span></td><td>{stars(x.rating)}</td>
          <td className="mono small">{x.author?.handle}</td><td className="muted small">{when(x.at)}</td>
          <td>{x.status === 'visible' ? <Pill tone="mint">visible</Pill> : <Pill tone="red">hidden</Pill>}</td>
          <td className="r nowrap"><button className="btn sm ghost" disabled={busy} onClick={() => run(() => api(`/admin/reviews/${x.id}`, { method: 'PATCH', body: { status: x.status === 'visible' ? 'hidden' : 'visible' } }), x.status === 'visible' ? 'Review hidden' : 'Review shown', r.reload)}>{x.status === 'visible' ? 'Hide' : 'Show'}</button>
            <button className="btn sm danger" disabled={busy} onClick={() => confirm('Delete this review for good?') && run(() => api(`/admin/reviews/${x.id}`, { method: 'DELETE' }), 'Review deleted', r.reload)}>Delete</button></td></tr>)}
        {!r.data!.length && <tr><td colSpan={7} className="empty">No reviews match.</td></tr>}
      </tbody></table>}</Gate>
    </Card>
  </>;
}

type TicketRow = { id: string; ticket: string; category: string; targetType: string; targetId: string | null; details: string; evidence: string[]; priority: 'urgent' | 'high' | 'normal'; status: string; at: number; updatedAt: number;
  reporter: { id: string; handle: string; name: string } | null; target: { label: string; userId: string; [k: string]: unknown } | null;
  history: { at: number; by: string; status: string | null; note?: string | null; action?: string | null; result?: string | null; public?: string | null }[] };
type TicketList = { items: TicketRow[]; counts: Record<string, number>; urgentOpen: number };
const SU_CATS = ['harassment', 'violation', 'complaint', 'collab_dispute', 'scam', 'impersonation', 'self_harm', 'other'];
const PRI_TONE: Record<string, string> = { urgent: 'red', high: 'amber', normal: 'gray' };
const SU_STATUS_TONE: Record<string, string> = { open: 'amber', reviewing: 'violet', actioned: 'mint', closed: 'gray' };
const nice = (s: string) => s.replace('_', ' ');
function SpeakUpPage() {
  const [st, setSt] = useState(hp('status') ?? ''); const [cat, setCat] = useState(hp('category') ?? ''); const [pri, setPri] = useState(hp('priority') ?? '');
  const q = useApi<TicketList>(`/admin/speakup?${st ? 'status=' + st + '&' : ''}${cat ? 'category=' + cat + '&' : ''}${pri ? 'priority=' + pri : ''}`);
  const f = useFeatureSwitches();
  const openId = hp('open');
  return <>
    <Card title="Speak Up desk" extra={<div className="row"><LivePill />{f.sw('speakUp', 'Speak Up')}</div>}>
      <p className="note">Reports and tickets from the apps (and the Hit Us Up form). <b>Self-harm</b> or anything marked urgent lands as <b>urgent</b> and the reporter is shown SOS Lane (112 · 1930 · 181) right away. Every status change or action is audited and sends the reporter a notice.</p>
      {q.data && <div className="kpis k5 su"><Kpi label="Urgent & open" value={String(q.data.urgentOpen)} tone={q.data.urgentOpen ? 'bad' : 'good'} sub={q.data.urgentOpen ? 'Handle these first' : 'All clear'} />
        {(['open', 'reviewing', 'actioned', 'closed'] as const).map(s => <Kpi key={s} label={cap(s)} value={String(q.data!.counts[s] ?? 0)} />)}</div>}
      <div className="row mt"><select aria-label="priority filter" value={pri} onChange={e => setPri(e.target.value)}><option value="">Any priority</option>{['urgent', 'high', 'normal'].map(x => <option key={x} value={x}>{cap(x)}</option>)}</select>
        <select aria-label="category filter" value={cat} onChange={e => setCat(e.target.value)}><option value="">Any category</option>{SU_CATS.map(x => <option key={x} value={x}>{nice(x)}</option>)}</select>
        <select aria-label="status filter" value={st} onChange={e => setSt(e.target.value)}><option value="">Any status</option>{['open', 'reviewing', 'actioned', 'closed'].map(x => <option key={x} value={x}>{cap(x)}</option>)}</select></div>
    </Card>
    <Gate rs={[q]}>{() => <div className="grid sugrid">
      <Card title={`Queue · ${q.data!.items.length}`} className="suq">
        <div className="mlist">{q.data!.items.map(t => <button key={t.id} className={'sures' + (openId === t.id ? ' on' : '') + ' p-' + t.priority} onClick={() => setHp('open', t.id)}>
          <span className="row"><Pill tone={PRI_TONE[t.priority]}>{t.priority}</Pill><b className="mono">{t.ticket}</b><span className="tag">{nice(t.category)}</span><span className="grow" /><Pill tone={SU_STATUS_TONE[t.status]}>{t.status}</Pill></span>
          <small>{t.details}</small><small className="muted">{t.reporter?.handle} · {when(t.at)}</small></button>)}
          {!q.data!.items.length && <p className="empty">No tickets match.</p>}</div>
      </Card>
      {openId ? <TicketDetail id={openId} reload={q.reload} /> : <Card><p className="empty">Pick a ticket from the queue.</p></Card>}
    </div>}</Gate>
  </>;
}
function TicketDetail({ id, reload }: { id: string; reload: () => void }) {
  const t = useApi<TicketRow>(`/admin/speakup/${id}`);
  const { run, busy } = useAct();
  const [note, setNote] = useState(''); const [msg, setMsg] = useState('');
  useEffect(() => { setNote(''); setMsg(''); }, [id]);
  return <Gate rs={[t]}>{() => {
    const x = t.data!;
    const send = (body: Record<string, unknown>, ok: string) => run(() => api(`/admin/speakup/${x.id}`, { method: 'PATCH', body: { ...body, note, message: msg } }), ok, () => { t.reload(); reload(); setNote(''); setMsg(''); });
    const flags = x.target ? Object.entries(x.target).filter(([k, v]) => !['label', 'userId'].includes(k) && v === true).map(([k]) => k) : [];
    return <Card title={`Ticket ${x.ticket}`} className="sudetail" extra={<div className="row"><Pill tone={PRI_TONE[x.priority]}>{x.priority}</Pill><Pill tone={SU_STATUS_TONE[x.status]}>{x.status}</Pill></div>}>
      {x.priority === 'urgent' && <div className="banner bad"><b>Urgent.</b> The reporter was shown SOS Lane (call 112 if in danger · 1930 cyber crime · 181 women helpline). Reply within the hour; if someone is at immediate risk, follow the escalation runbook.</div>}
      <div className="kv"><span>Category</span><b>{nice(x.category)}</b><span>Reporter</span><b className="mono">{x.reporter?.handle} <small className="muted">{x.reporter?.name}</small></b>
        <span>Target</span><b>{x.targetType === 'none' ? <span className="muted">none (support ticket)</span> : <>{x.targetType} · <span className="mono">{x.targetId}</span>{x.target && <small className="muted">{x.target.label}</small>}{flags.map(fl => <Pill key={fl} tone="red">{fl}</Pill>)}</>}</b>
        <span>Filed</span><b>{when(x.at)}</b></div>
      <span className="lbl">What happened</span><blockquote className="sudetails">{x.details}</blockquote>
      {!!x.evidence.length && <><span className="lbl">Evidence</span><div className="chips">{x.evidence.map(e => <a key={e} className="tag" href={mediaSrc(e)!} target="_blank" rel="noreferrer">{e}</a>)}</div></>}
      <span className="lbl">Status</span>
      <div className="row">{['open', 'reviewing', 'actioned', 'closed'].map(s => <button key={s} className={'btn sm ' + (x.status === s ? 'prism' : 'ghost')} disabled={busy || x.status === s} onClick={() => send({ status: s }, `Status → ${s}`)}>{cap(s)}</button>)}</div>
      <span className="lbl">Actions on the target {!x.target && <small className="inl">— none available for this ticket</small>}</span>
      <div className="row"><button className="btn sm ghost" disabled={busy || !x.target} onClick={() => send({ action: 'warn' }, 'Warning sent')}>Warn user</button>
        <button className="btn sm ghost" disabled={busy || !x.target || x.targetType === 'user'} onClick={() => confirm('Remove the reported content?') && send({ action: 'remove_content' }, 'Content removed')}>Remove content</button>
        <button className="btn sm danger" disabled={busy || !x.target} onClick={() => confirm('Suspend the user behind this report? They are signed out everywhere.') && send({ action: 'suspend_user' }, 'User suspended')}>Suspend user</button></div>
      <span className="lbl">Internal note</span><textarea className="wide" rows={2} aria-label="internal note" value={note} onChange={e => setNote(e.target.value)} placeholder="Only staff see this" />
      <span className="lbl">Message to reporter (optional)</span><input className="wide" aria-label="message to reporter" maxLength={300} value={msg} onChange={e => setMsg(e.target.value)} placeholder="Defaults to a friendly status update" />
      <div className="row end mt"><button className="btn sm prism" disabled={busy || !note.trim()} onClick={() => send({}, 'Note added')}>Add note</button></div>
      <span className="lbl">History</span>
      <ol className="suhist">{[...x.history].reverse().map((h, i) => <li key={i}><small className="muted">{when(h.at)} · <span className="mono">{h.by}</span></small>
        <span>{h.status && <Pill tone={SU_STATUS_TONE[h.status] ?? 'gray'}>{h.status}</Pill>}{h.action && <Pill tone="red">{nice(h.action)}</Pill>}{h.result && <span className="mono small"> {h.result}</span>}</span>
        {h.note && <span className="small">Note: {h.note}</span>}{h.public && <span className="small muted">To reporter: “{h.public}”</span>}</li>)}</ol>
    </Card>;
  }}</Gate>;
}

/** Global-search groups for pages, reviews and Speak Up tickets. */
function useContentSearch(t: string) {
  const on = !!t;
  const pg = useApi<PageRow[]>(on ? '/admin/pages' : null);
  const rv = useApi<ReviewRow[]>(on ? '/admin/reviews' : null);
  const su = useApi<TicketList>(on ? '/admin/speakup' : null);
  const has = (...xs: (string | number | null | undefined)[]) => xs.join(' ').toLowerCase().includes(t);
  if (!on) return [];
  type Row = { k: string; title: ReactNode; sub: ReactNode; tag?: ReactNode; href: string };
  const g: [string, string, Row[]][] = [
    ['Pages & posts', 'pages', (pg.data ?? []).filter(p => has(p.slug, p.title, p.summary, p.body, p.kind, ...p.items.flatMap(i => Object.values(i)))).slice(0, 10).map(p => ({ k: p.slug, title: p.title, sub: `/${p.slug} · ${p.kind} · ${MODULE_LABEL[p.module]} · v${p.version}`,
      tag: p.published ? <Pill tone="mint">published</Pill> : <Pill tone="amber">draft</Pill>, href: (['blog', 'news'].includes(p.kind) ? '#/blog?edit=' : '#/pages?edit=') + p.slug }))],
    ['Reviews', 'reviews', (rv.data ?? []).filter(r => has(r.text, r.targetLabel, r.author?.handle, r.type === 'vouch' ? 'vouch' : 'real talk')).slice(0, 8).map(r => ({ k: r.id, title: `${r.type === 'vouch' ? 'Vouch' : 'Real Talk'} · ${r.targetLabel} · ${r.rating}/5`, sub: `${r.author?.handle} · ${r.text.slice(0, 80)}`,
      tag: r.status === 'hidden' ? <Pill tone="red">hidden</Pill> : undefined, href: '#/reviews' + (r.type ? '?type=' + r.type : '') }))],
    ['Speak Up tickets', 'speakup', (su.data?.items ?? []).filter(x => has(x.ticket, x.category, x.details, x.reporter?.handle, x.targetId, x.priority)).slice(0, 8).map(x => ({ k: x.id, title: `${x.ticket} · ${nice(x.category)}`, sub: `${x.reporter?.handle} · ${x.details.slice(0, 80)}`,
      tag: <Pill tone={PRI_TONE[x.priority]}>{x.priority}</Pill>, href: '#/speakup?open=' + x.id }))],
  ];
  return g;
}

GUIDES.push(
  { t: 'Publish House Rules', icon: 'pages', href: '#/pages?edit=house-rules', link: 'Open House Rules', steps: [
    <>House Rules and Privacy Promise ship as <b>drafts</b> with the header “Draft — review with your lawyer before launch”. Have counsel review the text first.</>,
    <>Open Pages → <b>House Rules</b>. Edit the body (simple markdown: <code>#</code>, <code>##</code>, <code>-</code>, <code>**bold**</code>, <code>[text](url)</code>) and check the live preview on the right.</>,
    <>Remove the draft header once approved, add a change note like “Lawyer-approved v1”, then <b>Save new version</b>.</>,
    <>Flip <b>Published</b> on (it’s already live in the seed — unpublish while you revise if needed). Apps read it from <code>GET /pages/house-rules</code>.</>,
    <>Made a mistake? <b>Version history</b> → Restore any earlier version; it’s saved as a new version, so the trail stays complete.</>] },
  { t: 'Handle an urgent report', icon: 'speakup', href: '#/speakup?priority=urgent', link: 'Open urgent tickets', steps: [
    <>Urgent tickets (self-harm, or the reporter ticked “urgent”) sit at the top of the Speak Up desk in red. The reporter already saw SOS Lane: <b>112</b> emergency, <b>1930</b> cyber crime, <b>181</b> women helpline.</>,
    <>Open the ticket, set status <b>Reviewing</b> — the reporter gets a “a real human is looking” notice.</>,
    <>Act on the target: <b>Warn user</b> (sends them a House Rules notice), <b>Remove content</b> (hides the Drop / message / product / Hood) or <b>Suspend user</b> (signs them out everywhere).</>,
    <>Add an internal note describing what you did and, if useful, a short message to the reporter. Set <b>Actioned</b> or <b>Closed</b>.</>,
    <>If someone may be in immediate danger, follow your escalation runbook and contact emergency services — the app can’t do that for you. Every step is in the Audit log.</>] },
);

/** Shared editor kit for pages in ./pages (read at render time, so the circular import is safe). */
export const KIT = { useLayerEditor, LayerBar, Gate, Card, Pill, Toggle, Search, cfgMerge, FEATURE_KEYS, FEATURE_DESC, SCREEN_KEYS, SCREEN_DESC };
