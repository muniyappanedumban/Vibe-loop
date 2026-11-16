import { createContext, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import type { Dispatch, ReactNode } from 'react';
import { initialState, reducer, ROLES, PERMS } from './store';
import type { Action, Role, State } from './store';
import { Icon, Logo } from './icons';

const Ctx = createContext<{ s: State; dispatch: Dispatch<Action> }>(null!);
const useStore = () => useContext(Ctx);

export const PAGES = [
  ['dashboard', 'Dashboard'], ['users', 'Users'], ['moderation', 'Moderation'], ['payouts', 'Payouts'],
  ['health', 'System health'], ['costs', 'AI & render costs'], ['flags', 'Flags & kill switches'], ['audit', 'Audit log'],
  ['privacy', 'Privacy'], ['abuse', 'Abuse & spam'], ['revenue', 'Revenue'], ['announcements', 'Announcements'], ['roles', 'Roles & permissions'],
] as const;
type Slug = typeof PAGES[number][0];

const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';

function useHash(): Slug {
  const get = () => (location.hash.replace('#/', '') || 'dashboard') as Slug;
  const [h, setH] = useState(get);
  useEffect(() => { const f = () => setH(get()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return PAGES.some(p => p[0] === h) ? h : 'dashboard';
}

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

/* ---------- widgets ---------- */
function Search({ v, set, ph }: { v: string; set: (s: string) => void; ph: string }) {
  return <label className="search"><Icon name="search" size={16} /><input value={v} onChange={e => set(e.target.value)} placeholder={ph} /></label>;
}
function Tabs<T extends string>({ v, set, opts }: { v: T; set: (t: T) => void; opts: [T, string][] }) {
  return <div className="tabs">{opts.map(([k, l]) => <button key={k} className={v === k ? 'on' : ''} onClick={() => set(k)}>{l}</button>)}</div>;
}

const VIEWS: Record<Slug, () => ReactNode> = { dashboard: Dashboard, users: Users, moderation: Moderation, payouts: Payouts, health: Health, costs: Costs, flags: Flags, audit: Audit, privacy: Privacy, abuse: Abuse, revenue: Revenue, announcements: Announcements, roles: Roles };

export default function App() {
  const [s, dispatch] = useReducer(reducer, initialState);
  const slug = useHash();
  const ctx = useMemo(() => ({ s, dispatch }), [s]);
  const View = VIEWS[slug];
  const title = PAGES.find(p => p[0] === slug)![1];
  const badge: Partial<Record<Slug, number>> = { moderation: s.mod.filter(m => m.status === 'pending').length, payouts: s.payouts.filter(p => p.status === 'pending').length };
  return <Ctx.Provider value={ctx}>
    <div className="app">
      <aside className="side">
        <div className="brand"><Logo /><div><b>VibeLoop</b><small>Admin</small></div></div>
        <nav>{PAGES.map(([k, l]) => <a key={k} href={'#/' + k} className={k === slug ? 'on' : ''}><Icon name={k} /><span>{l}</span>{!!badge[k] && <em>{badge[k]}</em>}</a>)}</nav>
        <div className="me"><span className="av sm">A</span><div><b>admin@vibeloop</b><small>Staff · MFA on</small></div></div>
      </aside>
      <main>
        <header className="top">
          <div><small className="crumb">Admin / {title}</small><h1>{title}</h1></div>
          <div className="row"><span className="env">Demo environment · no backend</span><button className="iconbtn" aria-label="Notifications"><Icon name="bell" /></button></div>
        </header>
        <div className="content"><View /></div>
      </main>
    </div>
  </Ctx.Provider>;
}
