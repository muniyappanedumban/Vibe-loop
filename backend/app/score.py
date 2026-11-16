"""Server-side Loop Score — authoritative for the release gate. Mirrors mobile/src/lib/score.ts."""
W = {"share": 1.0, "forme": 1.0, "work": 0.45, "skip": 0.0}
MIN_REACTIONS = 3
def low_effort(text: str) -> bool: t = text.strip(); return 0 < len(t) < 3
def quality(text: str) -> float: return 0.0 if low_effort(text) else min(1.0, 0.55 + len(text.strip()) / 120)
def counted(loop, reactions, version=None):
    end = loop.opened_at + loop.window_hours * 3600_000
    return [r for r in reactions if r.at <= end and not low_effort(r.text) and (version is None or r.version == version)]
def loop_score(loop, reactions, version=None):
    rs = counted(loop, reactions, version)
    if len(rs) < MIN_REACTIONS: return None
    num = sum(W[r.kind] * quality(r.text) for r in rs); den = sum(quality(r.text) for r in rs)
    return round(num / den * 100) if den else None
