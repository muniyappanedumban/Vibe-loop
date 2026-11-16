import { createContext, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import type { Dispatch, ReactNode } from 'react';
import { initialState, reducer, ROLES, PERMS } from './store';
import type { Action, Role, State } from './store';
import { STAFF_ROLES } from './store';
import type { Settings, SettingsSection, Staff } from './store';
import { Icon, Logo } from './icons';
import { VIBEMOJI, VIBEMOJI_CATEGORIES, REACTIONS, vibemojiSvg } from './vibemoji';
import { SECTIONS, ALL_FEATURES } from './features';
import { PRD, PRD_GROUPS } from './prd';

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
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';

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

/* ---------- primitives ---------- */
const Demo = () => <span className="demo">Demo data</span>;
function Card({ title, extra, children, className = '' }: { title?: string; extra?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={'card ' + className}>{title && <header className="card-h"><h3>{title}</h3>{extra}</header>}{children}</section>;
}
function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return <div className={'kpi ' + (tone ?? '')}><span className="kpi-l">{label}</span><strong>{value}</strong>{sub && <span className="kpi-s">{sub}</span>}</div>;
}
const Pill = ({ tone, children }: { tone: string; children: ReactNode }) => <span className={'pill ' + tone}>{children}</span>;
const Toggle = ({ on, onClick, danger, label }: { on: boolean; onClick: () => void; danger?: boolean; label: string }) =>
  <button role="switch" aria-checked={on} aria-label={label} className={'tg' + (on ? ' on' : '') + (danger ? ' danger' : '')} onClick={onClick}><i /></button>;
const statusTone: Record<string, string> = { pending: 'amber', open: 'amber', review: 'amber', approved: 'mint', completed: 'mint', paid: 'mint', cleared: 'mint', removed: 'red', rejected: 'red', suspended: 'red', escalated: 'violet' };
const St = ({ v }: { v: string }) => <Pill tone={statusTone[v] ?? 'gray'}>{v}</Pill>;
const NotReady = ({ children }: { children: ReactNode }) => <div className="notready"><Icon name="key" size={16} /><span>{children}</span></div>;

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

/* ---------- pages ---------- */
function Dashboard() {
  const { s } = useStore();
  const pendMod = s.mod.filter(m => m.status === 'pending').length;
  const pendPay = s.payouts.filter(p => p.status === 'pending');
  const kills = s.flags.filter(f => f.kill && f.on).length;
  return <>
    <div className="hero">
      <div><span className="eyebrow">Staff console</span><h2>Good morning — here’s the state of the Loop.</h2><p>Queues, approvals and platform health at a glance. All figures below are seeded <b>demo data</b> until the production backend is connected.</p></div>
      <div className="hero-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" stroke="#2a2545" strokeWidth="12" fill="none" /><circle cx="60" cy="60" r="50" stroke="url(#lg2)" strokeWidth="12" fill="none" strokeDasharray="314" strokeDashoffset={314 * (1 - .82)} strokeLinecap="round" transform="rotate(-90 60 60)" /><defs><linearGradient id="lg2"><stop offset="0" stopColor="#6C3BFF" /><stop offset=".6" stopColor="#FF3D9A" /><stop offset="1" stopColor="#FF8A3D" /></linearGradient></defs></svg><div><strong>82</strong><span>Avg Loop Score</span></div></div>
    </div>
    <div className="kpis">
      <Kpi label="Active creators" value="1,284" sub="Demo data" />
      <Kpi label="Loops in testing" value="342" sub="Demo data" />
      <Kpi label="Fan reactions (24h)" value="18.9k" sub="Demo data" />
      <Kpi label="Kill switches engaged" value={String(kills)} sub={kills ? 'Check flags page' : 'All clear'} tone={kills ? 'bad' : 'good'} />
    </div>
    <div className="grid g2-1">
      <Card title="Loops opened per day" extra={<Demo />}><LineChart data={[42, 51, 48, 63, 71, 66, 84]} labels={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']} /></Card>
      <Card title="Queues" extra={<Pill tone="gray">Live</Pill>}>
        <ul className="queues">
          <li><a href="#/moderation"><Icon name="moderation" /><span>Moderation pending</span><b>{pendMod}</b></a></li>
          <li><a href="#/payouts"><Icon name="payouts" /><span>Payouts awaiting approval</span><b>{pendPay.length}</b></a></li>
          <li><a href="#/privacy"><Icon name="privacy" /><span>Open privacy requests</span><b>{s.dsr.filter(x => x.status === 'open').length}</b></a></li>
          <li><a href="#/abuse"><Icon name="abuse" /><span>Accounts flagged for review</span><b>{s.flagged.filter(x => x.status === 'review').length}</b></a></li>
        </ul>
      </Card>
    </div>
    <Card title="Recent admin activity" extra={<a className="link" href="#/audit">Open audit log →</a>}><AuditTable limit={5} /></Card>
  </>;
}

function Users() {
  const { s, dispatch } = useStore();
  const [q, setQ] = useState('');
  const list = s.users.filter(u => (u.name + u.handle + u.role).toLowerCase().includes(q.toLowerCase()));
  return <Card title={`${s.users.length} accounts`} extra={<div className="row"><Demo /><Search v={q} set={setQ} ph="Search name, handle, role" /></div>}>
    <table><thead><tr><th>User</th><th>Role</th><th>MFA</th><th>Status</th><th>Joined</th><th /></tr></thead><tbody>
      {list.map(u => <tr key={u.id} className={u.suspended ? 'dim' : ''}>
        <td><div className="who"><span className="av">{u.name[0]}</span><div><b>{u.name}</b><small>{u.handle}</small></div></div></td>
        <td><select value={u.role} onChange={e => dispatch({ type: 'user.role', id: u.id, role: e.target.value as Role })}>{ROLES.map(r => <option key={r}>{r}</option>)}</select></td>
        <td>{u.mfa ? <Pill tone="mint">enforced</Pill> : <button className="btn sm ghost" onClick={() => dispatch({ type: 'user.mfa', id: u.id })}>Enforce MFA</button>}</td>
        <td>{u.suspended ? <Pill tone="red">suspended</Pill> : <Pill tone="mint">active</Pill>}</td>
        <td className="muted">{u.joined}</td>
        <td className="r"><button className={'btn sm ' + (u.suspended ? 'ghost' : 'danger')} onClick={() => dispatch({ type: 'user.suspend', id: u.id })}>{u.suspended ? 'Unsuspend' : 'Suspend'}</button></td>
      </tr>)}
      {!list.length && <tr><td colSpan={6} className="empty">No accounts match “{q}”.</td></tr>}
    </tbody></table>
  </Card>;
}

function Moderation() {
  const { s, dispatch } = useStore();
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const list = s.mod.filter(m => tab === 'all' || m.status === 'pending' || m.status === 'escalated');
  return <>
    <div className="kpis k3">
      <Kpi label="Pending" value={String(s.mod.filter(m => m.status === 'pending').length)} />
      <Kpi label="Escalated to T&S lead" value={String(s.mod.filter(m => m.status === 'escalated').length)} />
      <Kpi label="Resolved this session" value={String(s.mod.filter(m => m.status === 'approved' || m.status === 'removed').length)} />
    </div>
    <Card title="Review queue" extra={<div className="row"><Demo /><Tabs v={tab} set={setTab} opts={[['pending', 'Open'], ['all', 'All']]} /></div>}>
      <div className="mlist">{list.map(m => <div key={m.id} className="mitem">
        <div className="thumb" />
        <div className="grow"><b>{m.title}</b><small>{m.creator} · {m.reports} report{m.reports > 1 ? 's' : ''}</small><code>{m.reason}</code></div>
        <St v={m.status} />
        {(m.status === 'pending' || m.status === 'escalated') && <div className="row">
          <button className="btn sm ghost" onClick={() => dispatch({ type: 'mod.resolve', id: m.id, status: 'approved' })}><Icon name="check" size={14} />Approve</button>
          <button className="btn sm danger" onClick={() => dispatch({ type: 'mod.resolve', id: m.id, status: 'removed' })}><Icon name="x" size={14} />Remove</button>
          {m.status === 'pending' && <button className="btn sm" onClick={() => dispatch({ type: 'mod.resolve', id: m.id, status: 'escalated' })}><Icon name="up" size={14} />Escalate</button>}
        </div>}
      </div>)}{!list.length && <p className="empty">Queue is clear.</p>}</div>
    </Card>
  </>;
}

function token() { return 'APR-' + Math.random().toString(36).slice(2, 6).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(); }
function Payouts() {
  const { s, dispatch } = useStore();
  const [pending, setPending] = useState<{ id: string; status: 'approved' | 'rejected'; tok: string } | null>(null);
  const killed = s.flags.find(f => f.key === 'kill.payouts')?.on;
  const pend = s.payouts.filter(p => p.status === 'pending');
  return <>
    {killed && <div className="banner bad">Payout kill switch is engaged — approvals are frozen. Disarm it on the Flags page.</div>}
    <NotReady>Payment rail not connected. Approving here records the decision and its one-time approval token; no money moves until the payments backend is live.</NotReady>
    <Card title="Pending approvals" extra={<Demo />}>
      <table><thead><tr><th>ID</th><th>Creator</th><th>Amount</th><th>Requested</th><th /></tr></thead><tbody>
        {pend.map(p => <tr key={p.id}><td className="mono">{p.id}</td><td><b>{p.creator}</b></td><td className="num">{money(p.amount)}</td><td className="muted">{when(p.requested)}</td>
          <td className="r">{pending?.id === p.id ? <div className="confirm"><span>One-time token <code>{pending.tok}</code></span>
            <button className={'btn sm ' + (pending.status === 'approved' ? 'prism' : 'danger')} onClick={() => { dispatch({ type: 'payout.decide', id: p.id, status: pending.status, token: pending.tok }); setPending(null); }}>Confirm {pending.status === 'approved' ? 'approve' : 'reject'}</button>
            <button className="btn sm ghost" onClick={() => setPending(null)}>Cancel</button></div>
            : <div className="row end"><button disabled={killed} className="btn sm prism" onClick={() => setPending({ id: p.id, status: 'approved', tok: token() })}>Approve</button><button disabled={killed} className="btn sm ghost" onClick={() => setPending({ id: p.id, status: 'rejected', tok: token() })}>Reject</button></div>}</td></tr>)}
        {!pend.length && <tr><td colSpan={5} className="empty">Nothing awaiting approval.</td></tr>}
      </tbody></table>
    </Card>
    <Card title="History"><table><thead><tr><th>ID</th><th>Creator</th><th>Amount</th><th>Requested</th><th>Status</th></tr></thead><tbody>
      {s.payouts.filter(p => p.status !== 'pending').map(p => <tr key={p.id}><td className="mono">{p.id}</td><td>{p.creator}</td><td className="num">{money(p.amount)}</td><td className="muted">{when(p.requested)}</td><td><St v={p.status} /></td></tr>)}
    </tbody></table></Card>
  </>;
}

function Health() {
  const svcs = [['API gateway', 'operational', 38, 0.02], ['Loop service', 'operational', 52, 0.04], ['Render workers', 'degraded', 410, 1.8], ['AI assist', 'operational', 620, 0.3], ['Payments', 'not connected', 0, 0], ['Notifications', 'operational', 24, 0.01]] as const;
  const queues = [['render.jobs', 128, 500], ['ai.captions', 42, 300], ['moderation.scan', 17, 200], ['notify.push', 3, 1000]] as const;
  return <>
    <NotReady>Health probes are not wired to real infrastructure yet. Values below are static demo samples.</NotReady>
    <div className="grid g3">{svcs.map(([n, st, lat, err]) => <Card key={n} className="svc">
      <div className="svc-h"><span className={'dot ' + (st === 'operational' ? 'ok' : st === 'degraded' ? 'warn' : 'off')} /><b>{n}</b></div>
      <Pill tone={st === 'operational' ? 'mint' : st === 'degraded' ? 'amber' : 'gray'}>{st}</Pill>
      <div className="svc-m"><div><small>p95 latency</small><b>{st === 'not connected' ? '—' : lat + ' ms'}</b></div><div><small>Error rate</small><b className={err > 1 ? 'red' : ''}>{st === 'not connected' ? '—' : err + '%'}</b></div></div>
    </Card>)}</div>
    <Card title="Queue depths" extra={<Demo />}>{queues.map(([n, v, cap]) => <div key={n} className="qrow"><code>{n}</code><Bar v={v} max={cap} tone={v / cap > .2 ? 'warm' : 'prism'} /><span className="num">{v} / {cap}</span></div>)}</Card>
  </>;
}

function Costs() {
  const rows = [['@maradraws', 41.2, 12.8], ['@theobeats', 18.9, 30.4], ['@lenafilms', 9.3, 22.1], ['@priyacuts', 4.1, 6.6]] as const;
  const ai = rows.reduce((a, r) => a + r[1], 0), render = rows.reduce((a, r) => a + r[2], 0);
  const budget = 400, spent = ai + render;
  return <>
    <div className="kpis">
      <Kpi label="AI spend (MTD)" value={money(ai)} sub="Demo data" />
      <Kpi label="Render spend (MTD)" value={money(render)} sub="Demo data" />
      <Kpi label="Monthly budget" value={money(budget)} sub={`${Math.round(spent / budget * 100)}% used`} />
      <Kpi label="Projected burn" value={money(spent / 16 * 30)} sub="at current daily rate" tone={spent / 16 * 30 > budget ? 'bad' : 'good'} />
    </div>
    <Card title="Per-creator cost" extra={<Demo />}><table><thead><tr><th>Creator</th><th>AI</th><th>Render</th><th>Total</th><th style={{ width: '35%' }}>Share</th></tr></thead><tbody>
      {rows.map(([c, a, r]) => <tr key={c}><td><b>{c}</b></td><td className="num">{money(a)}</td><td className="num">{money(r)}</td><td className="num">{money(a + r)}</td><td><Bar v={a + r} max={spent} /></td></tr>)}
    </tbody></table></Card>
  </>;
}

function Flags() {
  const { s, dispatch } = useStore();
  const [arm, setArm] = useState<string | null>(null);
  return <div className="grid g2">
    <Card title="Feature flags">{s.flags.filter(f => !f.kill).map(f => <div key={f.key} className="frow"><div className="grow"><b>{f.label}</b><small>{f.desc}</small><code>{f.key}</code></div><Toggle label={f.label} on={f.on} onClick={() => dispatch({ type: 'flag.toggle', key: f.key })} /></div>)}</Card>
    <Card title="Emergency kill switches" className="ink">{s.flags.filter(f => f.kill).map(f => <div key={f.key} className="frow"><div className="grow"><b>{f.label}</b><small>{f.desc}</small>
      {arm === f.key && <div className="row mt"><button className="btn sm danger" onClick={() => { dispatch({ type: 'flag.toggle', key: f.key }); setArm(null); }}>Confirm engage</button><button className="btn sm ghostd" onClick={() => setArm(null)}>Cancel</button></div>}</div>
      <Toggle danger label={f.label} on={f.on} onClick={() => f.on ? dispatch({ type: 'flag.toggle', key: f.key }) : setArm(f.key)} /></div>)}
      <p className="note">Engaging requires a confirm step. Every change is written to the audit log.</p></Card>
  </div>;
}

function AuditTable({ limit, q = '' }: { limit?: number; q?: string }) {
  const { s } = useStore();
  const rows = s.audit.filter(a => (a.action + a.target + a.actor).toLowerCase().includes(q.toLowerCase())).slice(0, limit);
  return <table><thead><tr><th>#</th><th>Time</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead><tbody>
    {rows.map(a => <tr key={a.id}><td className="mono muted">{a.id}</td><td className="muted">{when(a.ts)}</td><td>{a.actor}</td><td><code className={a.action.includes('ENGAGE') ? 'redc' : ''}>{a.action}</code></td><td>{a.target}</td></tr>)}
    {!rows.length && <tr><td colSpan={5} className="empty">No entries.</td></tr>}
  </tbody></table>;
}
function Audit() {
  const { s } = useStore();
  const [q, setQ] = useState('');
  return <Card title={`${s.audit.length} entries · append-only`} extra={<Search v={q} set={setQ} ph="Search action, target, actor" />}>
    <p className="note">Entries cannot be edited or deleted from this console. Stored in memory for this session only — persistent storage needs the backend.</p>
    <AuditTable q={q} /></Card>;
}

function Privacy() {
  const { s, dispatch } = useStore();
  const [days, setDays] = useState(s.retentionDays);
  const affected = Math.round(12000 * (1 - Math.min(days, 365) / 400));
  return <div className="grid g2-1">
    <Card title="Data subject requests" extra={<Demo />}><table><thead><tr><th>ID</th><th>User</th><th>Type</th><th>Received</th><th>Status</th><th /></tr></thead><tbody>
      {s.dsr.map(r => <tr key={r.id}><td className="mono">{r.id}</td><td>{r.user}</td><td><Pill tone={r.kind === 'deletion' ? 'red' : 'violet'}>{r.kind}</Pill></td><td className="muted">{when(r.received)}</td><td><St v={r.status} /></td>
        <td className="r">{r.status === 'open' && <div className="row end"><button className="btn sm prism" onClick={() => dispatch({ type: 'dsr.resolve', id: r.id, status: 'completed' })}>Fulfil</button><button className="btn sm ghost" onClick={() => dispatch({ type: 'dsr.resolve', id: r.id, status: 'rejected' })}>Reject</button></div>}</td></tr>)}
    </tbody></table></Card>
    <Card title="Retention policy">
      <label className="lbl">Delete inactive raw uploads after</label>
      <div className="row"><input type="range" min={30} max={365} step={15} value={days} onChange={e => setDays(+e.target.value)} /><b className="num">{days} days</b></div>
      <div className="row mt"><button className="btn sm" disabled={days === s.retentionDays} onClick={() => dispatch({ type: 'retention.set', days })}>Save policy</button>
        <button className="btn sm prism" onClick={() => dispatch({ type: 'retention.dryrun' })}>Run dry-run</button></div>
      {s.lastDryRun && <div className="dry"><b>Dry-run result</b><span>~{affected.toLocaleString()} objects would be purged under a {s.retentionDays}-day policy (estimate, demo). Nothing was deleted.</span><small>{when(s.lastDryRun)}</small></div>}
      <NotReady>Real deletion jobs require the storage backend.</NotReady>
    </Card>
  </div>;
}

function Abuse() {
  const { s, dispatch } = useStore();
  return <div className="grid g2">
    <Card title="Detection rules" extra={<Demo />}>{s.rules.map(r => <div key={r.id} className="frow"><div className="grow"><b>{r.name}</b><small>{r.desc} · {r.hits} hits (7d)</small></div><Toggle label={r.name} on={r.on} onClick={() => dispatch({ type: 'rule.toggle', id: r.id })} /></div>)}</Card>
    <Card title="Flagged accounts" extra={<Demo />}><div className="mlist">{s.flagged.map(f => <div key={f.id} className="mitem">
      <div className="score" style={{ ['--p' as string]: f.score }}><span>{f.score}</span></div>
      <div className="grow"><b>{f.handle}</b><small>{f.signal}</small></div><St v={f.status} />
      {f.status === 'review' && <div className="row"><button className="btn sm ghost" onClick={() => dispatch({ type: 'flagged.set', id: f.id, status: 'cleared' })}>Clear</button><button className="btn sm danger" onClick={() => dispatch({ type: 'flagged.set', id: f.id, status: 'suspended' })}>Suspend</button></div>}
    </div>)}</div></Card>
  </div>;
}

function Revenue() {
  const { s, dispatch } = useStore();
  const months = [['Jul', 18200], ['Aug', 22400], ['Sep', 25100], ['Oct', 31800], ['Nov (MTD)', 16900]] as const;
  const max = Math.max(...months.map(m => m[1]));
  return <>
    <div className="kpis">
      <Kpi label="Gross creator sales (Oct)" value={money(31800)} sub="Demo data" />
      <Kpi label="Platform fee" value={s.feePct + '%'} sub="current rate" />
      <Kpi label="Platform revenue (Oct)" value={money(31800 * s.feePct / 100)} sub="Demo · at current fee" />
      <Kpi label="Paid to creators (Oct)" value={money(31800 * (1 - s.feePct / 100))} sub="Demo data" />
    </div>
    <div className="grid g2-1">
      <Card title="Monthly report" extra={<Demo />}><div className="vbars">{months.map(([m, v]) => <div key={m}><span className="num">{money(v * s.feePct / 100)}</span><i style={{ height: (v / max) * 160 }} /><small>{m}</small></div>)}</div></Card>
      <Card title="Platform fee">
        <div className="fee">{[5, 8, 10, 12, 15].map(p => <button key={p} className={'btn ' + (s.feePct === p ? 'prism' : 'ghost')} onClick={() => p !== s.feePct && dispatch({ type: 'fee.set', pct: p })}>{p}%</button>)}</div>
        <p className="note">Fee changes apply to new sales only and are audited. Real billing integration not connected.</p>
      </Card>
    </div>
  </>;
}

function Announcements() {
  const { s, dispatch } = useStore();
  const [t, setT] = useState(''); const [b, setB] = useState(''); const [aud, setAud] = useState('Everyone');
  return <div className="grid g1-2">
    <Card title="Compose">
      <label className="lbl">Title</label><input value={t} onChange={e => setT(e.target.value)} placeholder="e.g. Scheduled maintenance Friday" />
      <label className="lbl">Message</label><textarea rows={5} value={b} onChange={e => setB(e.target.value)} placeholder="What should people know?" />
      <label className="lbl">Audience</label><Tabs v={aud} set={setAud} opts={[['Everyone', 'Everyone'], ['Creators', 'Creators'], ['Fans', 'Fans'], ['Staff', 'Staff']]} />
      <button className="btn prism mt" disabled={!t.trim() || !b.trim()} onClick={() => { dispatch({ type: 'announce', title: t.trim(), body: b.trim(), audience: aud }); setT(''); setB(''); }}><Icon name="announcements" size={16} />Broadcast</button>
      <p className="note">Recorded in-app only; push/email delivery needs the notification backend.</p>
    </Card>
    <Card title="Broadcasts">{s.announcements.map(a => <div key={a.id} className="ann"><div className="row"><b>{a.title}</b><Pill tone="violet">{a.audience}</Pill></div><p>{a.body}</p><small>{when(a.sent)}</small></div>)}</Card>
  </div>;
}

function Roles() {
  const { s, dispatch } = useStore();
  return <Card title="Role × permission matrix" extra={<span className="muted small">Click a cell to grant or revoke</span>}>
    <div className="mx"><table><thead><tr><th>Permission</th>{ROLES.map(r => <th key={r} className="c">{r}</th>)}</tr></thead><tbody>
      {PERMS.map(p => <tr key={p}><td><b>{p}</b></td>{ROLES.map(r => { const on = s.matrix[r].includes(p); return <td key={r} className="c">
        <button aria-label={`${r} ${p}`} aria-pressed={on} className={'cell' + (on ? ' on' : '')} disabled={r === 'Owner'} onClick={() => dispatch({ type: 'matrix.toggle', role: r, perm: p })}>{on && <Icon name="check" size={14} />}</button></td>; })}</tr>)}
    </tbody></table></div>
    <p className="note">Owner always holds every permission (locked).</p>
  </Card>;
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

function SettingsPanel<K extends SettingsSection>({ section }: { section: K }) {
  const { s, dispatch } = useStore();
  const toast = useContext(ToastCtx);
  const saved = s.settings[section];
  const [draft, setDraft] = useState(saved);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const View = SEC_VIEWS[section] as (p: Sec<K>) => ReactNode;
  const meta = SET_SECTIONS.find(x => x[0] === section)!;
  return <Card title={meta[1]} extra={dirty ? <Pill tone="amber">Unsaved changes</Pill> : <Pill tone="gray">Saved</Pill>} className="setpanel">
    <p className="note">{meta[2]}.</p>
    <View v={draft} set={p => setDraft(d => ({ ...d, ...p }))} />
    <div className={'savebar' + (dirty ? ' dirty' : '')}>
      <span>{dirty ? 'You have unsaved changes in this section.' : 'All changes saved · every save is written to the audit log.'}</span>
      <div className="row"><button className="btn sm ghost" disabled={!dirty} onClick={() => setDraft(saved)}>Discard</button>
        <button className="btn sm prism" disabled={!dirty} onClick={() => { dispatch({ type: 'settings.save', section, value: draft }); toast(`Saved · ${meta[1]} settings`); }}>Save changes</button></div>
    </div>
  </Card>;
}
function SettingsPage() {
  const { sub } = useContext(RouteCtx);
  const sec = (SET_SECTIONS.some(x => x[0] === sub) ? sub : 'general') as SettingsSection;
  return <div className="setgrid">
    <nav className="subnav card">{SET_SECTIONS.map(([k, l]) => <a key={k} href={'#/settings/' + k} className={k === sec ? 'on' : ''}><Icon name={k} size={16} /><span>{l}</span></a>)}</nav>
    <SettingsPanel key={sec} section={sec} />
  </div>;
}

/* ---------- emoji ---------- */
function Moji({ id, size = 40, uid }: { id: number; size?: number; uid: string }) {
  return <span className="moji" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: vibemojiSvg(id, uid) }} />;
}
function Emoji() {
  const { s, dispatch } = useStore();
  const [q, setQ] = useState(''); const [cat, setCat] = useState('All');
  const [sel, setSel] = useState<number | null>(() => { const m = location.hash.match(/[?&]open=(\d+)/); return m ? +m[1] : null; });
  const list = VIBEMOJI.filter(e => (cat === 'All' || e.category === cat) && (e.name + ' ' + e.id).toLowerCase().includes(q.toLowerCase()));
  const d = sel ? VIBEMOJI[sel - 1] : null;
  const off = (id: number) => s.emojiOff.includes(id);
  return <>
    <Card title="Reaction set" extra={<span className="muted small">Shown on Loops, Sparks and chat</span>}>
      <div className="reacts">{REACTIONS.map(r => <button key={r.key} className="react" onClick={() => setSel(r.id)}><Moji id={r.id} size={44} uid={'r' + r.key} /><b>{r.label}</b><small className="mono">{r.key} · #{r.id}</small></button>)}</div>
    </Card>
    <div className={'grid ' + (d ? 'g2-1' : '')}>
      <Card title={`${list.length} of ${VIBEMOJI.length} VibeMoji`} extra={<div className="row"><span className="muted small">{s.emojiOff.length} disabled</span><Search v={q} set={setQ} ph="Search name or #id" /></div>}>
        <div className="row catrow"><Tabs v={cat} set={setCat} opts={[['All', 'All'], ...VIBEMOJI_CATEGORIES.map(c => [c, c] as [string, string])]} /></div>
        <div className="mojigrid">{list.map(e => <button key={e.id} title={e.name} className={'mcell' + (sel === e.id ? ' on' : '') + (off(e.id) ? ' off' : '')} onClick={() => setSel(e.id)}><Moji id={e.id} uid={'g'} /></button>)}
          {!list.length && <p className="empty">No VibeMoji match “{q}”.</p>}</div>
      </Card>
      {d && <Card title="Details" className="mdetail" extra={<button className="iconbtn" aria-label="Close" onClick={() => setSel(null)}><Icon name="x" size={16} /></button>}>
        <div className="mbig"><Moji id={d.id} size={160} uid="big" /></div>
        <h2 className="mname">{d.name}</h2>
        <div className="kv"><span>ID</span><b className="mono">#{d.id}</b><span>Category</span><b><Pill tone="violet">{d.category}</Pill></b><span>Recipe</span><b className="mono small">shape {d.shape} · pal {d.pal} · eyes {d.eyes} · mouth {d.mouth} · acc {d.acc}</b>
          <span>Reaction</span><b>{REACTIONS.find(r => r.id === d.id)?.label ?? '—'}</b></div>
        <Field label="Enabled in pickers" hint={off(d.id) ? 'Hidden from users. Existing uses still render.' : 'Visible in emoji pickers.'}><Toggle label="Enabled" on={!off(d.id)} onClick={() => dispatch({ type: 'emoji.toggle', id: d.id, name: d.name })} /></Field>
        <div className="row mt">{[24, 32, 48, 64].map(z => <Moji key={z} id={d.id} size={z} uid={'s' + z} />)}</div>
      </Card>}
    </div>
  </>;
}

/* ---------- features ---------- */
const prdTone = (r?: string) => !r ? 'gray' : r === 'Admin' ? 'amber' : 'violet';
const prdLabel = (r?: string) => !r ? 'Planned' : r === 'Admin' ? 'Admin' : 'Preview';
function Features() {
  const { s, dispatch } = useStore();
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
    <NotReady>No feature is “Live”: Preview means an on-device screen exists in the mobile build with no production backend. Flags here are recorded and audited only.</NotReady>
    <div className="row"><Tabs v={tab} set={setTab} opts={[['prd', `Creator platform · ${PRD.length} (PRD)`], ['social', `Social · ${ALL_FEATURES.length}`]]} />
      <Search v={q} set={setQ} ph="Search features" /><Tabs v={f} set={setF} opts={[['all', 'All'], ['preview', 'Built'], ['planned', 'Planned']]} />
      <span className="muted small">{tab === 'prd' ? `${s.prdOn.length} flags on` : `${s.featOn.length} flags on`}</span></div>
    {tab === 'prd' ? <div className="grid g2">{PRD_GROUPS.map(g => { const items = PRD.filter(x => x.group === g && fOk(x.route) && x.name.toLowerCase().includes(ql)); if (!items.length) return null;
      return <Card key={g} title={g} extra={<span className="muted small">{items.length} features</span>} className="fsec"><div className="fsec-bar" style={{ background: 'var(--prism)' }} />
        {items.map(x => <div key={x.n} id={'prd-' + x.n} className="frow"><span className="fn mono">{String(x.n).padStart(3, '0')}</span><div className="grow"><b>{x.name}</b>{x.route && x.route !== 'Admin' && <small>screen <code>{x.route}</code></small>}</div>
          <Pill tone={prdTone(x.route)}>{prdLabel(x.route)}</Pill>
          <Toggle label={'Flag ' + x.name} on={s.prdOn.includes(x.n)} onClick={() => dispatch({ type: 'prd.toggle', n: x.n, name: x.name })} /></div>)}
      </Card>; })}</div>
    : <div className="grid g2">{SECTIONS.map(sec => { const items = sec.features.filter(x => fOk(x.same ? PRD[x.same - 1].route : x.route) && (x.name + ' ' + x.desc).toLowerCase().includes(ql)); if (!items.length) return null; return <Card key={sec.key} title={sec.title} extra={<span className="muted small">{sec.sub}</span>} className="fsec">
      <div className="fsec-bar" style={{ background: sec.color }} />
      {items.map(x => <div key={x.n} className="frow"><span className="fn mono">{String(x.n).padStart(3, '0')}</span><div className="grow"><b>{x.name}</b><small>{x.desc}{x.route && <> · screen <code>{x.route}</code></>}</small></div>
        {x.same ? <button className="pill violet samepill" title={PRD[x.same - 1].name} onClick={() => goPrd(x.same!)}>Same as PRD #{x.same} →</button> : <>
        <Pill tone={x.route ? 'violet' : 'gray'}>{x.route ? 'Preview' : 'Planned'}</Pill>
        <Toggle label={'Flag ' + x.name} on={s.featOn.includes(x.n)} onClick={() => dispatch({ type: 'feature.toggle', n: x.n, name: x.name })} /></>}</div>)}
    </Card>; })}</div>}
  </>;
}

/* ---------- global search ---------- */
function GlobalSearch() {
  const { s } = useStore();
  const { q: rq } = useContext(RouteCtx);
  const [q, setQ] = useState(rq);
  useEffect(() => setQ(rq), [rq]);
  const t = q.trim().toLowerCase();
  const has = (...xs: (string | number)[]) => xs.join(' ').toLowerCase().includes(t);
  const groups: [string, string, { k: string; title: ReactNode; sub: ReactNode; tag?: ReactNode; href: string }[]][] = !t ? [] : [
    ['Users', 'users', s.users.filter(u => has(u.name, u.handle, u.role)).map(u => ({ k: u.id, title: u.name, sub: `${u.handle} · ${u.role}`, tag: u.suspended ? <Pill tone="red">suspended</Pill> : <Pill tone="mint">active</Pill>, href: '#/users' }))],
    ['Staff', 'admins', s.settings.admins.staff.filter(x => has(x.name, x.email, x.role)).map(x => ({ k: x.id, title: x.name, sub: `${x.email} · ${x.role}`, href: '#/settings/admins' }))],
    ['Content & moderation', 'moderation', s.mod.filter(m => has(m.title, m.creator, m.reason, m.id)).map(m => ({ k: m.id, title: m.title, sub: `${m.creator} · ${m.reason}`, tag: <St v={m.status} />, href: '#/moderation' }))],
    ['Payouts', 'payouts', s.payouts.filter(p => has(p.id, p.creator, p.amount, p.status)).map(p => ({ k: p.id, title: `${p.id} · ${money(p.amount)}`, sub: p.creator, tag: <St v={p.status} />, href: '#/payouts' }))],
    ['Audit entries', 'audit', s.audit.filter(a => has(a.action, a.target, a.actor)).slice(0, 8).map(a => ({ k: 'a' + a.id, title: <code>{a.action}</code>, sub: `${a.target} · ${a.actor} · ${when(a.ts)}`, href: '#/audit' }))],
    ['PRD features', 'features', PRD.filter(f => has(f.name, f.group)).slice(0, 8).map(f => ({ k: 'p' + f.n, title: `#${f.n} ${f.name}`, sub: f.group, tag: <Pill tone={prdTone(f.route)}>{prdLabel(f.route)}</Pill>, href: '#/features' }))],
    ['Features', 'features', ALL_FEATURES.filter(f => !f.same && has(f.name, f.desc)).slice(0, 8).map(f => ({ k: 'f' + f.n, title: f.name, sub: f.desc, tag: <Pill tone={f.route ? 'violet' : 'gray'}>{f.route ? 'Preview' : 'Planned'}</Pill>, href: '#/features?tab=social' }))],
    ['VibeMoji', 'emoji', VIBEMOJI.filter(e => has(e.name, e.category, '#' + e.id)).slice(0, 12).map(e => ({ k: 'e' + e.id, title: <span className="row"><Moji id={e.id} size={24} uid="sr" />{e.name}</span>, sub: `#${e.id} · ${e.category}`, href: '#/emoji?open=' + e.id }))],
  ];
  const total = groups.reduce((a, g) => a + g[2].length, 0);
  return <>
    <Card><form className="bigsearch" onSubmit={e => { e.preventDefault(); location.hash = '#/search?q=' + encodeURIComponent(q); }}><Icon name="search" size={20} /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search users, content, payouts, audit, features, emoji…" /><button className="btn sm prism">Search</button></form>
      <p className="note">{t ? `${total} result${total === 1 ? '' : 's'} for “${q.trim()}” across ${groups.filter(g => g[2].length).length} groups.` : 'Searches in-memory demo data only — no backend index yet.'}</p></Card>
    <div className="grid g2">{groups.filter(g => g[2].length).map(([label, icon, rows]) => <Card key={label} title={label} extra={<Pill tone="violet">{rows.length}</Pill>}>
      <div className="mlist">{rows.map(r => <a key={r.k} href={r.href} className="sres"><Icon name={icon} size={16} /><div className="grow"><b>{r.title}</b><small>{r.sub}</small></div>{r.tag}</a>)}</div></Card>)}</div>
    {t && !total && <Card><p className="empty">Nothing matches “{q.trim()}”.</p></Card>}
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

export default function App() {
  const [s, dispatch] = useReducer(reducer, initialState);
  const route = useHash(); const { slug } = route;
  const ctx = useMemo(() => ({ s, dispatch }), [s]);
  const [toastMsg, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toastMsg) return; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); }, [toastMsg]);
  const [tq, setTq] = useState('');
  const View = VIEWS[slug];
  const title = PAGES.find(p => p[0] === slug)![1];
  const badge: Partial<Record<Slug, number>> = { moderation: s.mod.filter(m => m.status === 'pending').length, payouts: s.payouts.filter(p => p.status === 'pending').length };
  return <Ctx.Provider value={ctx}><RouteCtx.Provider value={route}><ToastCtx.Provider value={setToast}>
    <div className="app">
      <aside className="side">
        <div className="brand"><Logo /><div><b>VibeLoop</b><small>Admin</small></div></div>
        <nav>{PAGES.map(([k, l]) => <a key={k} href={'#/' + k} className={k === slug ? 'on' : ''}><Icon name={k} /><span>{l}</span>{!!badge[k] && <em>{badge[k]}</em>}</a>)}</nav>
        <div className="me"><span className="av sm">A</span><div><b>admin@vibeloop</b><small>Staff · MFA on</small></div></div>
      </aside>
      <main>
        <header className="top">
          <div><small className="crumb">Admin / {title}</small><h1>{title}</h1></div>
          <div className="row"><form className="search topsearch" onSubmit={e => { e.preventDefault(); location.hash = '#/search?q=' + encodeURIComponent(tq.trim()); }}><Icon name="search" size={16} /><input value={tq} onChange={e => setTq(e.target.value)} placeholder="Search everything…" aria-label="Global search" /></form><span className="env">Demo environment · no backend</span><button className="iconbtn" aria-label="Notifications"><Icon name="bell" /></button></div>
        </header>
        <div className="content"><View /></div>
      </main>
      {toastMsg && <div className="toast" role="status"><Icon name="check" size={16} />{toastMsg}</div>}
    </div>
  </ToastCtx.Provider></RouteCtx.Provider></Ctx.Provider>;
}
