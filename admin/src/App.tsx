import { createContext, useContext, useEffect, useMemo, useReducer, useState } from 'react';
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
  ['settings', 'Platform settings'], ['emoji', 'VibeMoji library'], ['features', 'Feature catalog'], ['search', 'Search'],
] as const;
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
  const total = groups.reduce((a, g) => a + g[2].length, 0);
  return <>
    <Card><form className="bigsearch" onSubmit={e => { e.preventDefault(); location.hash = '#/search?q=' + encodeURIComponent(q); }}><Icon name="search" size={20} /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search users, content, payouts, audit, features, emoji…" /><button className="btn sm prism">Search</button></form>
      <p className="note">{!t ? 'Users, posts, Loops and audit entries are searched on the server; features and VibeMoji come from the bundled catalog.' : r.loading ? 'Searching…' : `${total} result${total === 1 ? '' : 's'} for “${rq.trim()}” across ${groups.filter(g => g[2].length).length} groups.`}</p></Card>
    <div className="grid g2">{groups.filter(g => g[2].length).map(([label, icon, rows]) => <Card key={label} title={label} extra={<Pill tone="violet">{rows.length}</Pill>}>
      <div className="mlist">{rows.map(r => <a key={r.k} href={r.href} className="sres"><Icon name={icon} size={16} /><div className="grow"><b>{r.title}</b><small>{r.sub}</small></div>{r.tag}</a>)}</div></Card>)}</div>
    {r.error && <ApiErr msg={r.error} retry={r.reload} />}
    {t && d && !total && <Card><p className="empty">Nothing matches “{rq.trim()}”.</p></Card>}
  </>;
}

/* ---------- widgets ---------- */
function Search({ v, set, ph }: { v: string; set: (s: string) => void; ph: string }) {
  return <label className="search"><Icon name="search" size={16} /><input value={v} onChange={e => set(e.target.value)} placeholder={ph} /></label>;
}
function Tabs<T extends string>({ v, set, opts }: { v: T; set: (t: T) => void; opts: [T, string][] }) {
  return <div className="tabs">{opts.map(([k, l]) => <button key={k} className={v === k ? 'on' : ''} onClick={() => set(k)}>{l}</button>)}</div>;
}

const VIEWS: Record<Slug, () => ReactNode> = { dashboard: Dashboard, users: Users, moderation: Moderation, payouts: Payouts, health: Health, costs: Costs, flags: Flags, audit: Audit, privacy: Privacy, abuse: Abuse, revenue: Revenue, announcements: Announcements, roles: Roles, settings: SettingsPage, emoji: Emoji, features: Features, search: GlobalSearch };

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
  const View = VIEWS[slug];
  const title = PAGES.find(p => p[0] === slug)![1];
  const badge: Partial<Record<Slug, number>> = { moderation: ov.data?.openReports, payouts: ov.data?.pendingPayouts, privacy: ov.data?.pendingPrivacy };
  return <Ctx.Provider value={ctx}><RouteCtx.Provider value={route}><ToastCtx.Provider value={setToast}>
    <div className="app">
      <aside className="side">
        <div className="brand"><Logo /><div><b>VibeLoop</b><small>Admin</small></div></div>
        <nav>{PAGES.map(([k, l]) => <a key={k} href={'#/' + k} className={k === slug ? 'on' : ''}><Icon name={k} /><span>{l}</span>{!!badge[k] && <em>{badge[k]}</em>}</a>)}</nav>
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
