"""Dependency-light load smoke (httpx + websockets, both already in backend/.venv) for when k6 isn't installed.
Same flows as k6-smoke.js: OTP sign-in (demo), bootstrap/feed/app-config reads, message sends, WebSocket connect.

  backend/.venv/bin/python scripts/loadtest/smoke.py --base http://127.0.0.1:8000 --concurrency 20 --seconds 20

Prints per-endpoint count, error/429 counts, p50/p95/p99 latency and throughput. One generator process on the same
machine as the server: numbers are a smoke signal, not a capacity measurement."""
import argparse, asyncio, json, statistics, time
import httpx, websockets

def pct(xs, p): return round(sorted(xs)[min(len(xs) - 1, int(len(xs) * p))] * 1000, 1) if xs else None

async def otp_login(c, ident):
    r = await c.post("/auth/otp/request", json={"identifier": ident}); r.raise_for_status()
    r = await c.post("/auth/otp/verify", json={"identifier": ident, "code": r.json()["demoCode"]}); r.raise_for_status()
    return r.json()["token"]

async def main(a):
    stats: dict[str, dict] = {}
    def rec(name, dt, status):
        s = stats.setdefault(name, {"lat": [], "err": 0, "429": 0})
        s["lat"].append(dt)
        if status == 429: s["429"] += 1
        elif status >= 400: s["err"] += 1
    limits = httpx.Limits(max_connections=a.concurrency * 2, max_keepalive_connections=a.concurrency * 2)
    async with httpx.AsyncClient(base_url=a.base, timeout=30, limits=limits) as c:
        t0 = time.perf_counter(); tok = await otp_login(c, a.user); rec("signin(otp request+verify)", time.perf_counter() - t0, 200)
        H = {"Authorization": f"Bearer {tok}"}
        convs = (await c.get("/conv", headers=H)).json(); cid = convs[0]["id"] if convs else None
        stop = time.perf_counter() + a.seconds

        async def reader():
            while time.perf_counter() < stop:
                for name, path in (("bootstrap", "/bootstrap"), ("feed", "/feed?limit=20"), ("app-config", "/app-config")):
                    t = time.perf_counter(); r = await c.get(path, headers=H); rec(name, time.perf_counter() - t, r.status_code)
        async def writer(i):
            n = 0
            while cid and time.perf_counter() < stop:
                t = time.perf_counter(); r = await c.post(f"/conv/{cid}/messages", headers=H, json={"text": f"smoke {i}-{n}"})
                rec("send message", time.perf_counter() - t, r.status_code); n += 1; await asyncio.sleep(1.1)
        async def sock():
            url = a.base.replace("http", "ws", 1) + f"/ws?token={tok}"
            while time.perf_counter() < stop:
                t = time.perf_counter()
                try:
                    async with websockets.connect(url) as w:
                        hello = json.loads(await asyncio.wait_for(w.recv(), 5)); rec("ws connect+hello", time.perf_counter() - t, 200 if hello.get("type") == "hello" else 500)
                        await asyncio.sleep(2)
                except Exception: rec("ws connect+hello", time.perf_counter() - t, 599)

        n_w = max(1, a.concurrency // 10); n_s = max(1, a.concurrency // 4)
        t_start = time.perf_counter()
        await asyncio.gather(*[reader() for _ in range(a.concurrency)], *[writer(i) for i in range(n_w)], *[sock() for _ in range(n_s)])
        el = time.perf_counter() - t_start
    print(f"\n{a.concurrency} readers, {n_w} writers, {n_s} socket loops, {el:.1f}s against {a.base}")
    print(f"{'endpoint':28} {'n':>6} {'rps':>7} {'p50ms':>7} {'p95ms':>7} {'p99ms':>7} {'err':>5} {'429':>5}")
    for k, s in stats.items():
        print(f"{k:28} {len(s['lat']):6} {len(s['lat'])/el:7.1f} {pct(s['lat'], .5)!s:>7} {pct(s['lat'], .95)!s:>7} {pct(s['lat'], .99)!s:>7} {s['err']:5} {s['429']:5}")

if __name__ == "__main__":
    p = argparse.ArgumentParser(); p.add_argument("--base", default="http://127.0.0.1:8000"); p.add_argument("--user", default="riya@vibeloop.app")
    p.add_argument("--concurrency", type=int, default=20); p.add_argument("--seconds", type=int, default=20)
    asyncio.run(main(p.parse_args()))
