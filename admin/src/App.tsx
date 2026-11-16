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
import { api, useApi, login, getToken, getUser, setSession, API_URL } from './api';
import type { ApiUser, Overview, Report, ApiPayout, AuditRow, PrivacyReq, ApiAnnouncement, SearchResult, KV } from './api';

/* Demo-only state (abuse rules / flagged accounts) — everything else comes from the API. */
const Ctx = createContext<{ s: State; dispatch: Dispatch<Action> }>(null!);
const useStore = () => useContext(Ctx);

export const PAGES = [
  ['dashboard', 'Dashboard'], ['users', 'Users'], ['moderation', 'Moderation'], ['payouts', 'Payouts'],
  ['health', 'System health'], ['costs', 'AI & render costs'], ['flags', 'Flags & kill switches'], ['audit', 'Audit log'],
  ['privacy', 'Privacy'], ['abuse', 'Abuse & spam'], ['revenue', 'Revenue'], ['announcements', 'Announcements'], ['roles', 'Roles & permissions'],
  ['navigation', 'Navigation'], ['themes', 'Themes & design'], ['screens', 'Screens'], ['limits', 'Features & limits'], ['zones', 'Countries & zones'], ['slabs', 'Slabs'], ['languages', 'Languages'], ['preview', 'Config preview'],
  ['otp', 'OTP & login'], ['identity', 'Identity'], ['chat', 'Chat & Towns'],
  ['cashflow', 'Cash Flow'], ['money', 'Money switches'], ['plans', 'Backstage Pass'], ['countries', 'Country pricing'], ['boosts', 'Boosts'], ['stash', 'Stash'], ['plugs', 'Plugs'],
  ['settings', 'Platform settings'], ['emoji', 'VibeMoji library'], ['features', 'Feature catalog'], ['search', 'Search'], ['learn', 'Learn / Help'],
] as const;
const NAV_HEADINGS: Partial<Record<string, string>> = { navigation: 'App control', otp: 'Identity & chat', cashflow: 'Money & growth', settings: 'Platform' };
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
        <linearGradient id="cg" x1="0" x2="1"><stop offset="0" stopColor="#6C3BFF" /><stop offset=".6" stopColor="#FF3D9A" /><stop offset="1" stopColor="#FF8A3D" /></linearGradient>
        <linearGradient id="cf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FF3D9A" stopOpacity=".18" /><stop offset="1" stopColor="#FF3D9A" stopOpacity="0" /></linearGradient>
      </defs>
      {[0, 1, 2, 3].map(i => <line key={i} x1={pad} x2={W - pad} y1={pad + i * (H - pad * 2) / 3} y2={pad + i * (H - pad * 2) / 3} stroke="#E7E3F3" />)}
      <path d={`${line} L${pts.at(-1)![0]} ${H - pad} L${pad} ${H - pad}Z`} fill="url(#cf)" />
      <path d={line} fill="none" stroke="url(#cg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => <g key={i}><circle cx={p[0]} cy={p[1]} r="3.5" fill="#fff" stroke="#FF3D9A" strokeWidth="2" /><text x={p[0]} y={H - 8} textAnchor="middle" className="ax">{labels[i]}</text></g>)}
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
  return <div className="login">
    <div className="login-art"><div className="brand"><Logo /><div><b>VibeLoop</b><small>Admin</small></div></div>
      <div><span className="eyebrow">Staff console</span><h2>Keep the Loop safe, fair and fun.</h2><p>Moderation, payouts, flags and platform settings — every action is written to the append-only audit log.</p></div><span /></div>
    <div className="login-form"><form onSubmit={async e => {
      e.preventDefault(); setBusy(true); setErr(null);
      try { await login(email.trim(), pw); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
    }}>
      <h1>Sign in</h1><p className="muted">Staff accounts only (owner role).</p>
      <label className="lbl" htmlFor="em">Email</label><input id="em" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@vibeloop.app" />
      <label className="lbl" htmlFor="pw">Password</label><input id="pw" type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" />
      {err && <div className="errbox" role="alert">{err}</div>}
      <button className="btn prism" disabled={busy || !email || !pw}>{busy ? 'Signing in…' : 'Sign in'}</button>
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
        <div className="hero-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" stroke="#2a2545" strokeWidth="12" fill="none" /><circle cx="60" cy="60" r="50" stroke="url(#lg2)" strokeWidth="12" fill="none" strokeDasharray="314" strokeDashoffset={314 * (1 - Math.min(1, o.creators / Math.max(1, o.users)))} strokeLinecap="round" transform="rotate(-90 60 60)" /><defs><linearGradient id="lg2"><stop offset="0" stopColor="#6C3BFF" /><stop offset=".6" stopColor="#FF3D9A" /><stop offset="1" stopColor="#FF8A3D" /></linearGradient></defs></svg><div><strong>{o.creators}</strong><span>Creators of {o.users}</span></div></div>
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
            <li><a href="#/abuse"><Icon name="abuse" /><span>Accounts flagged (demo)</span><b>3</b></a></li>
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
  return <Card title={r.data ? `${r.data.length} accounts` : 'Accounts'} extra={<div className="row"><LivePill /><Search v={q} set={setQ} ph="Search name, handle, email" /></div>}>
    {r.error ? <ApiErr msg={r.error} retry={r.reload} /> : !r.data ? <p className="loading">Loading from API…</p> :
    <table><thead><tr><th>User</th><th>Role</th><th>MFA</th><th>Status</th><th>Joined</th><th /></tr></thead><tbody>
      {r.data.map(u => <tr key={u.id} className={u.suspended ? 'dim' : ''}>
        <td><div className="who"><span className="av">{u.name[0]}</span><div><b>{u.name}</b><small>{u.handle} · {u.email}</small></div></div></td>
        <td><select value={u.role} disabled={busy || u.id === me?.id} onChange={e => patch(u, { role: e.target.value }, `${u.handle} → ${cap(e.target.value)}`)}>{ROLES.map(x => <option key={x} value={x.toLowerCase()}>{x}</option>)}</select></td>
        <td>{u.mfaRequired ? <Pill tone="mint">enforced</Pill> : <button className="btn sm ghost" disabled={busy} onClick={() => patch(u, { mfaRequired: true }, `MFA enforced for ${u.handle}`)}>Enforce MFA</button>}</td>
        <td>{u.suspended ? <Pill tone="red">suspended</Pill> : <Pill tone="mint">active</Pill>}</td>
        <td className="muted">{new Date(u.createdAt).toISOString().slice(0, 10)}</td>
        <td className="r">{u.id !== me?.id && <button disabled={busy} className={'btn sm ' + (u.suspended ? 'ghost' : 'danger')} onClick={() => patch(u, { suspended: !u.suspended }, `${u.handle} ${u.suspended ? 'unsuspended' : 'suspended'}`)}>{u.suspended ? 'Unsuspend' : 'Suspend'}</button>}</td>
      </tr>)}
      {!r.data.length && <tr><td colSpan={6} className="empty">No accounts match “{q}”.</td></tr>}
    </tbody></table>}
  </Card>;
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

function Abuse() {
  const { s, dispatch } = useStore();
  return <>
    <NotReady>Demo data — abuse detection is not part of the backend yet. Toggles here are local to this tab and not saved.</NotReady>
    <div className="grid g2">
      <Card title="Detection rules" extra={<Demo />}>{s.rules.map(r => <div key={r.id} className="frow"><div className="grow"><b>{r.name}</b><small>{r.desc} · {r.hits} hits (7d)</small></div><Toggle label={r.name} on={r.on} onClick={() => dispatch({ type: 'rule.toggle', id: r.id })} /></div>)}</Card>
      <Card title="Flagged accounts" extra={<Demo />}><div className="mlist">{s.flagged.map(f => <div key={f.id} className="mitem">
        <div className="score" style={{ ['--p' as string]: f.score }}><span>{f.score}</span></div>
        <div className="grow"><b>{f.handle}</b><small>{f.signal}</small></div><St v={f.status} />
        {f.status === 'review' && <div className="row"><button className="btn sm ghost" onClick={() => dispatch({ type: 'flagged.set', id: f.id, status: 'cleared' })}>Clear</button><button className="btn sm danger" onClick={() => dispatch({ type: 'flagged.set', id: f.id, status: 'suspended' })}>Suspend</button></div>}
      </div>)}</div></Card>
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
    ['Users', 'users', d.users.map(u => ({ k: u.id, title: u.name, sub: `${u.handle} · ${u.email} · ${cap(u.role)}`, tag: u.suspended ? <Pill tone="red">suspended</Pill> : <Pill tone="mint">active</Pill>, href: '#/users' }))],
    ['Posts', 'moderation', d.posts.map(p => ({ k: p.id, title: p.text.slice(0, 80), sub: p.id, href: '#/moderation' }))],
    ['Loops', 'features', d.loops.map(l => ({ k: l.id, title: l.title, sub: l.id, href: '#/dashboard' }))],
    ['Audit entries', 'audit', d.audit.slice(0, 8).map(a => ({ k: 'a' + a.id, title: <code>{a.action}</code>, sub: `#${a.id} · ${a.detail}`, href: '#/audit' }))],
    ['PRD features (catalog)', 'features', PRD.filter(f => has(f.name, f.group)).slice(0, 8).map(f => ({ k: 'p' + f.n, title: `#${f.n} ${f.name}`, sub: f.group, tag: <Pill tone={prdTone(f.route)}>{prdLabel(f.route)}</Pill>, href: '#/features' }))],
    ['Features (catalog)', 'features', ALL_FEATURES.filter(f => !f.same && has(f.name, f.desc)).slice(0, 8).map(f => ({ k: 'f' + f.n, title: f.name, sub: f.desc, tag: <Pill tone={f.route ? 'violet' : 'gray'}>{f.route ? 'Preview' : 'Planned'}</Pill>, href: '#/features?tab=social' }))],
    ['VibeMoji', 'emoji', VIBEMOJI.filter(e => has(e.name, e.category, '#' + e.id)).slice(0, 12).map(e => ({ k: 'e' + e.id, title: <span className="row"><Moji id={e.id} size={24} uid="sr" />{e.name}</span>, sub: `#${e.id} · ${e.category}`, href: '#/emoji?open=' + e.id }))],
  ];
  const extra = useCfgSearch(t);
  const mextra = useMoneySearch(t);
  if (d) groups.splice(1, 0, ...extra, ...mextra);
  const total = groups.reduce((a, g) => a + g[2].length, 0);
  return <>
    <Card><form className="bigsearch" onSubmit={e => { e.preventDefault(); location.hash = '#/search?q=' + encodeURIComponent(q); }}><Icon name="search" size={20} /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search users, content, plans, Stash, Boosts, Plugs, config, emoji…" /><button className="btn sm prism">Search</button></form>
      <p className="note">{!t ? 'Users (name, email, @handle), posts, Loops and audit entries are searched on the server; config layers, screens, features, zones, slabs, language strings, towns, Backstage Pass plans, Stash products, Boosts, Plugs and the masked OTP log come from their admin APIs; features and VibeMoji from the bundled catalog.' : r.loading ? 'Searching…' : `${total} result${total === 1 ? '' : 's'} for “${rq.trim()}” across ${groups.filter(g => g[2].length).length} groups.`}</p></Card>
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
  'money', 'subscriptions', 'store', 'tips', 'ads', 'platformFees'];
const FEATURE_DESC: Record<string, string> = {
  dswitch: 'Social ⇄ Chat module switch', swipeWorlds: 'Swipe between Social and Chat', chatBubble: 'Floating chat bubble over Social', post2chat: 'Share a post into a chat',
  draftBridge: 'Carry drafts between modules', focusSwitch: 'Focus mode mutes the other module', statuses: 'Vibes (24h statuses)', towns: 'Towns (communities)', viewOnce: 'View-once messages',
  sendLater: 'Scheduled messages', polls: 'Polls in chats', fadeChat: 'Disappearing messages', chatLock: 'Lock a chat behind device auth', payouts: 'Creator payouts', paidLoops: 'Paid Loops', live: 'Live sessions',
  money: 'Money master switch (set from Money switches)', subscriptions: 'Backstage Pass plans', store: 'Stash creator store', tips: 'Props (tips)', ads: 'Boosts (sponsored cards)', platformFees: 'Platform fee on paid orders',
};
const SCREEN_KEYS = ['Home', 'Explore', 'Create', 'Motion', 'Profile', 'Chats', 'Friends', 'Vibes', 'Towns', 'ChatMe', 'NewLoop', 'LoopDetail', 'FanReact', 'Archive', 'Copilot', 'Editor', 'Audio', 'Memory',
  'ReleaseGate', 'Earnings', 'Payout', 'Notifications', 'Settings', 'Loops', 'Library', 'Sparks', 'NewPost', 'Vault', 'ChatThread', 'Search', 'Live', 'Emoji', 'Features', 'Growth', 'Trust', 'Learn',
  'SettingsHub', 'ChatRoom', 'NewChat', 'ShareToChat', 'ChatSearch', 'Starred', 'MyCode', 'StatusCompose', 'StatusView', 'CreateTown', 'TownRoom', 'ChangeHandle', 'ChatSecurity', 'LanguageRegion',
  'BubbleMojiGallery', 'Accounts'];
const navDef = (xs: [string, string, string][]) => xs.map(([key, label, icon], i) => ({ key, label, icon, enabled: true, order: i + 1 }));
/** Mirrors the server's built-in BASE (backend/app/config_resolver.py) so the editor can show inherited values. */
const CFG_DEFAULTS: J = {
  modules: { social: true, chat: true },
  nav: { social: navDef([['Home', 'Home', 'home'], ['Explore', 'Explore', 'compass'], ['Create', 'Create', 'plus'], ['Motion', 'Motion', 'play'], ['Profile', 'Profile', 'user']]),
    chat: navDef([['Chats', 'Chats', 'message'], ['Friends', 'Friends', 'users'], ['Vibes', 'Vibes', 'sparkle'], ['Towns', 'Towns', 'town'], ['ChatMe', 'Me', 'user']]) },
  screens: {}, features: Object.fromEntries(FEATURE_KEYS.map(k => [k, true])),
  limits: { maxAccounts: 5, maxGroupSize: 50, statusHours: 24, editWindowMin: 15, undoWindowMin: 60 }, fees: { platformFee: 0.08 }, languages: { strings: {} },
};
type ThemeMod = Record<string, string>;
type Preset = ThemeMod & { key: string; default: boolean };
const THEME_COLORS: Record<string, string[]> = { social: ['primary', 'secondary', 'tertiary', 'accent', 'bg', 'surface', 'ink'], chat: ['primary', 'secondary', 'accent', 'bg', 'surface', 'ink'] };
/** Mirrors THEME_PRESETS defaults in backend/app/config_resolver.py (base theme). */
CFG_DEFAULTS.theme = {
  social: { preset: 'prism', primary: '#6C3BFF', secondary: '#FF3D9A', tertiary: '#FF8A3D', accent: '#C8F45A', bg: '#F4F2FA', surface: '#FFFFFF', ink: '#120F24', navStyle: 'pill', radius: 'round', density: 'comfy' },
  chat: { preset: 'aqua', primary: '#00C2A8', secondary: '#14A8E6', accent: '#FFC93C', bg: '#EEF7F5', surface: '#FFFFFF', ink: '#0B1F24', navStyle: 'dock', radius: 'soft', density: 'comfy' },
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
        <button className="btn sm prism" disabled={!e.dirty || e.busy} onClick={e.save}>Save to {e.layer}</button></div>
    </div>
  </Card>;
}
/** Small tri-state marker: whether this layer sets the value or inherits it. */
const Src = ({ set }: { set: boolean }) => set ? <Pill tone="violet">this layer</Pill> : <Pill tone="gray">inherited</Pill>;

function NavigationPage() {
  const e = useLayerEditor();
  return <Gate rs={e.rs}>{() => <>
    <LayerBar e={e} note={e.isLang ? 'A language layer can only rename items; renames are saved as nav.<Key> strings.' : 'Item order, on/off and labels are saved as the full nav list for this layer.'} />
    <div className="grid g2">{MODS.map(m => <NavModule key={m} e={e} mod={m} />)}</div>
  </>}</Gate>;
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
      <div className="sgrid">{SCREEN_KEYS.filter(k => k.toLowerCase().includes(q.toLowerCase())).map(k => {
        const on = e.eff.screens[k] !== false; const set = e.draft.screens && k in e.draft.screens;
        return <div key={k} className={'stile' + (on ? '' : ' off') + (set ? ' set' : '')} data-screen={k}>
          <div className="grow"><b>{k}</b><small>{set ? <button className="linkbtn" onClick={() => e.upd(d => { delete d.screens[k]; })}>this layer · clear</button> : 'inherited'}</small></div>
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
];
function PlugCard({ p, v, reload }: { p: typeof PLUGS[number]; v: Plug; reload: () => void }) {
  const { run, busy } = useAct();
  const [d, setD] = useState<Record<string, string | boolean>>({});
  const [res, setRes] = useState<{ ok: boolean; message: string } | null>(null);
  const val = (k: string) => (k in d ? d[k] : v[k]) as string | boolean | undefined;
  const dirty = Object.keys(d).length > 0;
  return <Card title={p.name} extra={<div className="row">{v.configured ? <Pill tone="mint">connected</Pill> : <Pill tone="gray">not set</Pill>}<Pill tone={val('mode') === 'live' ? 'red' : 'amber'}>{String(val('mode'))}</Pill></div>}>
    <p className="note">{p.desc}</p>
    <Field label="Mode" hint="Test uses sandbox / test keys — no real money moves."><Tabs v={String(val('mode'))} set={m => setD({ ...d, mode: m })} opts={[['test', 'Test'], ['live', 'Live']]} /></Field>
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
  { t: 'Send login codes with MSG91', icon: 'otp', href: '#/plugs', link: 'Open Plugs', steps: [
    <>In MSG91 → Email, verify a sending domain and create a template that uses the variable <code>{'{{otp}}'}</code>.</>,
    <>In Plugs → MSG91 paste the Auth key, template ID and the From email on that domain; turn on “Send login codes via MSG91”, Save, Test connection.</>,
    <>Codes are then emailed — phone numbers are never required. If MSG91 fails, the failure is logged (masked email only) and demo codes still work in dev.</>] },
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
    ['Screens', 'screens', SCREEN_KEYS.filter(k => has(k)).slice(0, 10).map(k => ({ k, title: k, sub: `screens.${k}`, href: '#/screens' }))],
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

const VIEWS: Record<Slug, () => ReactNode> = { dashboard: Dashboard, users: Users, moderation: Moderation, payouts: Payouts, health: Health, costs: Costs, flags: Flags, audit: Audit, privacy: Privacy, abuse: Abuse, revenue: Revenue, announcements: Announcements, roles: Roles, settings: SettingsPage, emoji: Emoji, features: Features, search: GlobalSearch,
  navigation: NavigationPage, themes: ThemesPage, screens: ScreensPage, limits: LimitsPage, zones: ZonesPage, slabs: SlabsPage, languages: LanguagesPage, preview: PreviewPage, otp: OtpPage, identity: IdentityPage, chat: ChatPage, learn: LearnPage,
  cashflow: CashFlowPage, money: MoneyPage, plans: PlansPage, countries: CountriesPage, boosts: BoostsPage, stash: StashPage, plugs: PlugsPage };

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
