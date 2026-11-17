"""Server-driven app config: layered deep-merge (base → country → zone → slab → lang) + validation.
Layers live in kv ns "config" (key = layerKey); version in kv ("config_meta","version"); zones/slabs/languages in kv ns "appcfg"."""
import copy, re, json, hashlib
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from . import models as M

# Our own Gen-Z names (server-driven). Screen keys never change — only labels/strings.
EN_STRINGS = {"module.social": "Glow", "module.chat": "Hush", "module.Social": "Glow", "module.Chat": "Hush",
              "nav.Home": "Hub", "nav.Explore": "Drift", "nav.Create": "Make", "nav.Motion": "Flicks", "nav.Profile": "Me",
              "nav.Chats": "Hush", "nav.Friends": "Squad", "nav.Vibes": "Moods", "nav.Towns": "Hoods", "nav.ChatMe": "Me",
              "name.story": "Blinks", "name.post": "Drops", "name.store": "Stash", "name.subscription": "Backstage Pass", "name.tip": "Props",
              "name.payout": "Cashout", "name.ads": "Boosts"}
MONEY_FLAGS = ["money", "subscriptions", "store", "tips", "ads", "platformFees"]
NAV = lambda items: [{"key": k, "label": l, "icon": i, "enabled": True, "order": n + 1} for n, (k, l, i) in enumerate(items)]
BASE = {
    "modules": {"social": True, "chat": True},
    "nav": {"social": NAV([("Home", "Hub", "home"), ("Explore", "Drift", "compass"), ("Create", "Make", "plus"), ("Motion", "Flicks", "play"), ("Profile", "Me", "user")]),
            "chat": NAV([("Chats", "Hush", "message"), ("Friends", "Squad", "users"), ("Vibes", "Moods", "sparkle"), ("Towns", "Hoods", "town"), ("ChatMe", "Me", "user")])},
    "screens": {k: True for k in ["Live", "Payout", "Copilot", "Earnings", "ReleaseGate", "LoopDetail", "Towns", "Vibes", "ChatThread", "Friends", "Security", "Settings",
                                    "CreatorHub", "CreateHub", "Vault", "Loops", "NewLoop", "FanReact", "Archive", "Editor", "Audio", "Library", "Memory", "Features", "Learn", "IconKit"]},
    "features": {k: True for k in ["dswitch", "swipeWorlds", "chatBubble", "post2chat", "draftBridge", "focusSwitch", "statuses", "towns", "viewOnce", "sendLater",
                                   "polls", "fadeChat", "chatLock", "payouts", "paidLoops", "live", "promos",
                                   "blog", "news", "appLinks", "reviews", "productReviews", "vouches", "speakUp",
                                   "realtime", "readReceipts", "typing", "voiceNotes", "calls", "push", "e2ee", "snaps", "storyViewers", "followRequests", "liveCamera", "demoMode", "chatMedia", "moodMedia", "hushSettings"]} | {k: False for k in MONEY_FLAGS},
    # v3 money: everything off until the admin turns it on (Money settings mirrors into the base layer)

    "limits": {"maxAccounts": 5, "maxGroupSize": 50, "statusHours": 24, "editWindowMin": 15, "undoWindowMin": 60},  # + user_app.SETTINGS (merged below)
    "fees": {"platformFee": 0.08},
    "languages": {"default": "en", "available": ["en", "hi", "ta", "te", "kn", "ml", "mr", "bn"], "strings": EN_STRINGS},
    "banner": None,
    "moduleNames": {"social": "Glow", "chat": "Hush"},
    "rtc": {"iceServers": [{"urls": ["stun:stun.l.google.com:19302"]}]},  # v6: public STUN only; TURN creds via GET /rtc/ice
}
from . import user_app as _UA  # User App Settings: limits/defaults/access defaults come from one schema

for _k, _v in _UA.base_values().items(): BASE[_k] = {**BASE.get(_k, {}), **_v}
def _p(primary, secondary, accent, bg, ink, nav, tertiary=None, surface="#FFFFFF", radius=None, density="comfy", mod="social"):
    d = {"primary": primary, "secondary": secondary, "accent": accent, "bg": bg, "surface": surface, "ink": ink, "navStyle": nav,
         "radius": radius or ("round" if mod == "social" else "soft"), "density": density}
    if tertiary: d["tertiary"] = tertiary
    return d
THEME_PRESETS = {
    "social": {"studio": _p("#5B4CF5", "#7C6CFF", "#D4FF3F", "#F5F5F7", "#0A0A0F", "pill", tertiary="#A99BFF", radius="soft"),
               "prism": _p("#6C3BFF", "#FF3D9A", "#C8F45A", "#F4F2FA", "#120F24", "pill", tertiary="#FF8A3D"),
               "sunset": _p("#FF5A5F", "#FF9A3D", "#2EC4B6", "#FFF6F0", "#2B1B17", "dock", tertiary="#FFD23F"),
               "ocean": _p("#2563EB", "#06B6D4", "#A3E635", "#F1F6FD", "#0B1B33", "pill", tertiary="#22D3EE")},
    "chat": {"mono": _p("#0D9488", "#0EA5A0", "#FF6B4A", "#F3F6F6", "#0B1416", "dock", mod="chat"),
             "aqua": _p("#00C2A8", "#14A8E6", "#FFC93C", "#EEF7F5", "#0B1F24", "dock", mod="chat"),
             "midnight": _p("#7C3AED", "#22D3EE", "#F472B6", "#F3F1FF", "#160F2E", "pill", mod="chat"),
             "coral": _p("#FF6B5A", "#FF9F1C", "#2EC4B6", "#FFF4F1", "#2A1410", "dock", mod="chat")},
}
THEME_DEFAULT = {"social": "studio", "chat": "mono"}
BASE["theme"] = {m: {"preset": THEME_DEFAULT[m], **THEME_PRESETS[m][THEME_DEFAULT[m]]} for m in ("social", "chat")}
NAV_STYLES = {"social": {"pill", "dock"}, "chat": {"dock", "pill"}}
THEME_ENUMS = {"radius": {"sharp", "soft", "round"}, "density": {"compact", "comfy"}}
COLOR_KEYS = {"social": ["primary", "secondary", "tertiary", "accent", "bg", "surface", "ink"], "chat": ["primary", "secondary", "accent", "bg", "surface", "ink"]}
HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")

def _lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
def contrast(a, b):
    la, lb = sorted((_lum(a), _lum(b)), reverse=True); return (la + 0.05) / (lb + 0.05)

def expand_theme_layer(t):
    """A layer's theme: a module that names a preset gets the preset's values under its own explicit fields."""
    if not isinstance(t, dict): return t
    out = {}
    for m, v in t.items():
        if isinstance(v, dict) and v.get("preset") in THEME_PRESETS.get(m, {}): out[m] = {**THEME_PRESETS[m][v["preset"]], **v}
        else: out[m] = v
    return out
def _expand(layer):
    return {**layer, "theme": expand_theme_layer(layer["theme"])} if isinstance(layer, dict) and "theme" in layer else layer
def theme_hash(theme): return hashlib.sha1(json.dumps({k: theme[k] for k in ("social", "chat")}, sort_keys=True).encode()).hexdigest()[:10]

def validate_theme(theme) -> str | None:
    """Validates a (possibly partial) theme override; contrast is checked on the merged result elsewhere."""
    if not isinstance(theme, dict): return "theme must be an object"
    for m, t in theme.items():
        if m not in ("social", "chat"): return f"theme has social and chat only (got {m})"
        if not isinstance(t, dict): return f"theme.{m} must be an object"
        for k, v in t.items():
            if k == "preset":
                if v not in THEME_PRESETS[m]: return f"theme.{m}.preset must be one of {', '.join(THEME_PRESETS[m])}"
            elif k in COLOR_KEYS[m]:
                if not isinstance(v, str) or not HEX_RE.match(v): return f"theme.{m}.{k} must be a #RRGGBB color (got {v!r})"
            elif k == "navStyle":
                if v not in NAV_STYLES[m]: return f"theme.{m}.navStyle must be one of {'|'.join(sorted(NAV_STYLES[m]))}"
            elif k in THEME_ENUMS:
                if v not in THEME_ENUMS[k]: return f"theme.{m}.{k} must be one of {'|'.join(sorted(THEME_ENUMS[k]))}"
            else: return f"Unknown theme key: {m}.{k}"
    return None
def check_contrast(theme) -> str | None:
    for m in ("social", "chat"):
        t = theme.get(m, {}); r = contrast(t["ink"], t["bg"])
        if r < 4.5: return f"theme.{m}: text contrast of ink {t['ink']} on bg {t['bg']} is {r:.2f}:1 — must be at least 4.5:1 (WCAG AA)"
    return None
DEFAULT_ZONES = {"IN-SOUTH": {"name": "India South", "countries": ["IN"], "states": ["TN", "KA", "KL", "AP", "TS"]},
                 "IN-NORTH": {"name": "India North", "countries": [], "states": ["DL", "UP", "PB", "HR", "RJ"]},
                 "GLOBAL": {"name": "Rest of world", "countries": ["*"]}}
DEFAULT_SLABS = [{"key": "starter", "name": "Starter", "minFollowers": 0, "maxFollowers": 999}, {"key": "rising", "name": "Rising", "minFollowers": 1000, "maxFollowers": 9999},
                 {"key": "pro", "name": "Pro", "minFollowers": 10000}]
DEFAULT_LANGS = {"available": ["en", "hi", "ta", "te", "kn", "ml", "mr", "bn"], "default": "en"}
LAYER_RE = re.compile(r"^(base|country:[A-Z]{2}|zone:[A-Z0-9_-]{1,30}|slab:[a-z0-9_-]{1,30}|lang:[a-z]{2,3})$")
TOP_KEYS = {"modules": dict, "nav": dict, "screens": dict, "features": dict, "limits": dict, "fees": dict, "languages": dict, "banner": (dict, type(None)), "theme": dict, "moduleNames": dict, "rtc": dict, "defaults": dict, "access": dict}

def deep_merge(a, b):
    """b over a. dicts merge recursively; nav lists merge by item key; other values replace."""
    if isinstance(a, dict) and isinstance(b, dict):
        out = dict(a)
        for k, v in b.items(): out[k] = deep_merge(a[k], v) if k in a else copy.deepcopy(v)
        return out
    if isinstance(a, list) and isinstance(b, list) and all(isinstance(x, dict) and "key" in x for x in a + b):
        idx = {x["key"]: dict(x) for x in a}
        for x in b: idx[x["key"]] = deep_merge(idx.get(x["key"], {}), x)
        return sorted(idx.values(), key=lambda x: x.get("order", 99))
    return copy.deepcopy(b)

def kv(db: Session, ns: str, key: str, default=None):
    r = db.get(M.KV, (ns, key)); return r.value if r else default

def layers(db: Session) -> dict: return {r.key: r.value for r in db.scalars(select(M.KV).where(M.KV.ns == "config"))}
def version(db: Session) -> int: return int((kv(db, "config_meta", "version") or {}).get("v", 1))
def zones(db: Session) -> dict: return kv(db, "appcfg", "zones") or DEFAULT_ZONES
def slabs(db: Session) -> list: return (kv(db, "appcfg", "slabs") or {}).get("items") or DEFAULT_SLABS
def languages(db: Session) -> dict: return kv(db, "appcfg", "languages") or DEFAULT_LANGS

def zone_for(country: str, zs: dict) -> str:
    for k, z in zs.items():
        if country in z.get("countries", []): return k
    for k, z in zs.items():
        if "*" in z.get("countries", []): return k
    return "GLOBAL"

def slab_for(followers: int, ss: list) -> str:
    for s in ss:
        if followers >= s.get("minFollowers", 0) and ("maxFollowers" not in s or followers <= s["maxFollowers"]): return s["key"]
    return ss[0]["key"] if ss else "starter"

def resolve_with(ls: dict, country: str, zone: str, slab: str, lang: str, ver: int = 1, langs: dict | None = None) -> dict:
    cfg = deep_merge(copy.deepcopy(BASE), copy.deepcopy(_expand(ls.get("base") or {})))  # never mutate the shared BASE
    for key in (f"country:{country}", f"zone:{zone}", f"slab:{slab}", f"lang:{lang}"):
        if key in ls and not (key.startswith("lang:") and "theme" in ls[key]): cfg = deep_merge(cfg, _expand(ls[key]))
    cfg["theme"]["hash"] = theme_hash(cfg["theme"])
    if langs: cfg["languages"] = {**cfg["languages"], "available": langs.get("available", cfg["languages"]["available"]), "default": langs.get("default", "en")}
    strings = cfg["languages"].setdefault("strings", {})
    lang_strings = ((ls.get(f"lang:{lang}") or {}).get("languages") or {}).get("strings") or {}
    for m, name in (cfg.get("moduleNames") or {}).items():  # admin-renamed modules, unless the lang layer overrides
        for k in (f"module.{m}", f"module.{m.capitalize()}"):
            if k not in lang_strings and f"module.{m}" not in lang_strings: strings[k] = name
    for mod in cfg["nav"].values():
        for it in mod: it["label"] = strings.get(f"nav.{it['key']}", it["label"])
    return {"version": ver, "resolvedFor": {"country": country, "zone": zone, "slab": slab, "lang": lang}, **cfg}

def followers(db: Session, uid: str) -> int:
    return db.scalar(select(func.count()).select_from(M.Edge).where(M.Edge.kind == "follow", M.Edge.target == uid)) or 0

META_KEY = "cfg:meta"

def _meta(db: Session) -> dict:
    return {"layers": layers(db), "zones": zones(db), "slabs": slabs(db), "langs": languages(db), "ver": version(db)}

def invalidate(db: Session | None = None):
    """Drop the cached config inputs. Called by every config write (routes_config.bump). With a session, the session is marked
    so it bypasses the cache for the rest of its transaction, and the key is dropped again after commit (closes the race where
    another request re-caches pre-commit data). Without Redis, other processes may serve the old config for ≤ CONFIG_CACHE_TTL_SEC."""
    from .cache import cache
    cache.delete(META_KEY)
    if db is not None and not db.info.get("cfg_dirty"):
        from sqlalchemy import event
        db.info["cfg_dirty"] = True
        def _after(sess): sess.info.pop("cfg_dirty", None); cache.delete(META_KEY)
        event.listen(db, "after_commit", _after, once=True)
        event.listen(db, "after_rollback", lambda sess: sess.info.pop("cfg_dirty", None), once=True)

def resolve(db: Session, user: M.User | None = None, country: str | None = None, lang: str | None = None, slab: str | None = None) -> dict:
    """Layered config for one viewer. Inputs (KV rows) and outputs are cached for CONFIG_CACHE_TTL_SEC (app.cache); config
    writes invalidate. Output depends only on (version, country, zone, slab, lang), so many users share one cache entry."""
    from .cache import cache
    from .config import CONFIG_CACHE_TTL_SEC as ttl
    if db.info.get("cfg_dirty"): ttl = 0  # this transaction changed config: never cache/serve uncommitted state
    m = cache.get_or_set(META_KEY, ttl, lambda: _meta(db))
    p = (user.profile or {}) if user else {}
    country = (country or p.get("country") or "IN").upper()[:2]
    lang = (lang or p.get("lang") or m["langs"].get("default", "en")).lower()[:3]
    slab = slab or slab_for(followers(db, user.id) if user else 0, m["slabs"])
    zone = zone_for(country, m["zones"])
    return cache.get_or_set(f"cfg:{m['ver']}:{country}:{zone}:{slab}:{lang}", ttl,
                            lambda: resolve_with(m["layers"], country, zone, slab, lang, m["ver"], m["langs"]))

def validate_layer(key: str, override, existing: dict) -> str | None:
    """Return an error message, or None if the layer is valid."""
    if not LAYER_RE.match(key): return "Layer key must be base | country:XX | zone:KEY | slab:key | lang:code"
    if not isinstance(override, dict): return "Layer must be a JSON object"
    for k, v in override.items():
        if k not in TOP_KEYS: return f"Unknown config key: {k}"
        if not isinstance(v, TOP_KEYS[k]): return f"{k} has the wrong type"
    if key.startswith("lang:"):
        if "theme" in override: return "A language layer may not change the theme"
        if "moduleNames" in override: return "A language layer renames modules via languages.strings module.social / module.chat"
        if set(override) - {"languages", "nav"} or set(override.get("languages", {})) - {"strings"}: return "A language layer may only change languages.strings and labels"
        for mod in override.get("nav", {}).values():
            if not isinstance(mod, list) or any(set(i) - {"key", "label"} for i in mod): return "A language layer may only change nav labels"
    if "rtc" in override:
        ice = override["rtc"].get("iceServers")
        if set(override["rtc"]) - {"iceServers"} or not isinstance(ice, list) or len(ice) > 5: return "rtc has iceServers (≤5) only"
        for s in ice:
            if not isinstance(s, dict) or set(s) != {"urls"} or not isinstance(s["urls"], list) or not all(isinstance(x, str) and x.startswith("stun:") and len(x) < 200 for x in s["urls"]):
                return "rtc.iceServers in config are public STUN only: [{urls: [\"stun:host:port\"]}] — put TURN in Plugs → turn"
    if err := _UA.validate(override): return err
    mn = override.get("moduleNames", {})
    if set(mn) - {"social", "chat"}: return "moduleNames has social and chat only"
    for v in mn.values():
        if not isinstance(v, str) or not 1 <= len(v.strip()) <= 16 or v != v.strip(): return "Module names are 1–16 characters (trimmed)"
        if not any(ch.isalnum() for ch in v): return "Module names need at least one letter or number"
    for k in ("modules", "screens", "features"):
        if any(not isinstance(v, bool) for v in override.get(k, {}).values()): return f"{k} values must be true/false"
    for mod, items in override.get("nav", {}).items():
        if mod not in ("social", "chat") or not isinstance(items, list): return "nav has social and chat lists only"
        for i in items:
            if not isinstance(i, dict) or not isinstance(i.get("key"), str): return "Each nav item needs a key"
            if "label" in i and (not isinstance(i["label"], str) or not 1 <= len(i["label"]) <= 30): return "Nav labels are 1–30 characters"
    strings = override.get("languages", {}).get("strings", {})
    if not isinstance(strings, dict) or any(not isinstance(v, str) or len(v) > 200 or len(k) > 80 for k, v in strings.items()): return "strings must map keys to text (≤200 chars)"
    for k in ("module.social", "module.chat"):
        if k in strings and (not 1 <= len(strings[k].strip()) <= 16 or not any(ch.isalnum() for ch in strings[k])): return "Module names are 1–16 characters with a letter or number"
    # Every combination this layer can take part in must keep ≥1 nav item per enabled module. Check it over base (+ the layer).
    ls = {**existing, key: override}
    combos = [("base",)] + [("base", k) for k in ls if k != "base"]
    for combo in combos:
        cfg = deep_merge(copy.deepcopy(BASE), copy.deepcopy(_expand(ls.get("base") or {})))  # never mutate the shared BASE
        for k in combo[1:]: cfg = deep_merge(cfg, _expand(ls[k]))
        for mod, on in cfg["modules"].items():
            if on and not any(i.get("enabled", True) for i in cfg["nav"].get(mod, [])):
                return f"At least one {mod} nav item must stay enabled while the {mod} module is on"
    return None

def validate_theme_layer(key: str, override, existing: dict) -> str | None:
    """Theme-specific checks (→ 422): hex/enums, then WCAG contrast of every combination this layer takes part in."""
    if not isinstance(override, dict) or "theme" not in override: return None
    if key.startswith("lang:"): return None  # rejected by validate_layer
    if err := validate_theme(override["theme"]): return err
    ls = {**existing, key: override}
    for combo in [("base",)] + [("base", k) for k in ls if k != "base"]:
        th = deep_merge(copy.deepcopy(BASE["theme"]), expand_theme_layer((ls.get("base") or {}).get("theme", {})))
        for k in combo[1:]: th = deep_merge(th, expand_theme_layer(ls[k].get("theme", {})))
        if err := check_contrast(th): return err
    return None
