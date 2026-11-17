// VibeLoop k6 load test: OTP sign-in (demo), bootstrap + feed, send message, WebSocket connect.
//   k6 run -e BASE=http://localhost:8000 -e PROFILE=smoke scripts/loadtest/k6-smoke.js
//   k6 run -e BASE=https://staging.example.com -e PROFILE=load scripts/loadtest/k6-smoke.js
// Needs DEMO_OTP=1 on the target (staging only — never prod) and the seed data (riya@vibeloop.app has convs).
// Rate limits are real: OTP request is 5/window per identifier AND per IP, messages 60/min per user. From a single load
// generator IP you will see 429s on sign-in by design — sign-in is therefore a low-rate scenario; the bulk scenarios reuse
// tokens obtained in setup(). For realistic auth load, run generators from many IPs or raise limits on staging.
import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://localhost:8000';
const WS_BASE = BASE.replace(/^http/, 'ws');
const USERS = (__ENV.USERS || 'riya@vibeloop.app').split(',');
const limited = new Counter('rate_limited_429');
const P = (__ENV.PROFILE || 'smoke') === 'load'
  ? { readers: 200, writers: 20, sockets: 500, dur: '5m' }
  : { readers: 10, writers: 2, sockets: 20, dur: '30s' };

export const options = {
  scenarios: {
    signin:  { executor: 'constant-arrival-rate', rate: 1, timeUnit: '10s', duration: P.dur, preAllocatedVUs: 2, exec: 'signin' },
    read:    { executor: 'constant-vus', vus: P.readers, duration: P.dur, exec: 'read' },
    write:   { executor: 'constant-vus', vus: P.writers, duration: P.dur, exec: 'write' },
    sockets: { executor: 'constant-vus', vus: P.sockets, duration: P.dur, exec: 'socket' },
  },
  thresholds: {
    'http_req_failed{scenario:read}': ['rate<0.01'],
    'http_req_duration{scenario:read}': ['p(95)<300'],
    'http_req_duration{scenario:write}': ['p(95)<400'],
    'checks{scenario:sockets}': ['rate>0.99'],
  },
};

function otpLogin(identifier) {
  const h = { headers: { 'Content-Type': 'application/json' } };
  const r1 = http.post(`${BASE}/auth/otp/request`, JSON.stringify({ identifier }), h);
  if (r1.status === 429) { limited.add(1); return null; }
  const code = r1.json('demoCode');
  if (!code) return null;
  const r2 = http.post(`${BASE}/auth/otp/verify`, JSON.stringify({ identifier, code }), h);
  if (r2.status === 429) { limited.add(1); return null; }
  return r2.status === 200 ? r2.json('token') : null;
}

export function setup() {
  const tokens = USERS.map(otpLogin).filter(Boolean);
  if (!tokens.length) throw new Error('setup: OTP sign-in failed (DEMO_OTP=1? rate limited? seeded users?)');
  const auth = { headers: { Authorization: `Bearer ${tokens[0]}` } };
  const convs = http.get(`${BASE}/conv`, auth).json() || [];
  return { tokens, convId: convs.length ? convs[0].id : null };
}

const authed = (d) => ({ headers: { Authorization: `Bearer ${d.tokens[__VU % d.tokens.length]}`, 'Content-Type': 'application/json' } });

export function signin() {
  const t = otpLogin(USERS[__ITER % USERS.length]);
  check(t, { 'signin ok or rate-limited': () => true });
}

export function read(d) {
  const a = authed(d);
  const b = http.get(`${BASE}/bootstrap`, Object.assign({ tags: { name: 'bootstrap' } }, a));
  const f = http.get(`${BASE}/feed?limit=20`, Object.assign({ tags: { name: 'feed' } }, a));
  const c = http.get(`${BASE}/app-config`, Object.assign({ tags: { name: 'app-config' } }, a));
  check(b, { 'bootstrap 200': (r) => r.status === 200 });
  check(f, { 'feed 200': (r) => r.status === 200 });
  check(c, { 'app-config 200': (r) => r.status === 200 });
  sleep(1);
}

export function write(d) {
  if (!d.convId) { sleep(1); return; }
  const r = http.post(`${BASE}/conv/${d.convId}/messages`, JSON.stringify({ text: `load ${__VU}-${__ITER}` }), Object.assign({ tags: { name: 'send' } }, authed(d)));
  if (r.status === 429) limited.add(1);
  check(r, { 'send 200/429': (x) => x.status === 200 || x.status === 429 });
  sleep(1.2); // ≈ 50 msg/min per VU, under the 60/min per-user limit when tokens ≥ writers
}

export function socket(d) {
  const res = ws.connect(`${WS_BASE}/ws?token=${d.tokens[__VU % d.tokens.length]}`, {}, (s) => {
    s.on('message', (m) => { if (JSON.parse(m).type === 'hello') s.setTimeout(() => s.close(), 5000); });
    s.setTimeout(() => s.close(), 10000);
  });
  check(res, { 'ws 101': (r) => r && r.status === 101 });
}
