"""User App Settings: one schema for every user-facing default and limit (Glow, Hush, global).
The schema seeds config_resolver.BASE, validates config layers, drives the admin form (GET /admin/user-app/schema),
and `setting(db, path, user)` is how routers enforce a value server-side."""
import copy
from fastapi import HTTPException
from .v2common import LENS_KEYS

FEED_TABS = ["forYou", "circle", "trending", "fresh", "mood", "interests"]
LEGACY_TABS = {"following": "circle", "nearby": "trending"}  # names saved by older admin builds
REACTIONS = ["heart", "fire", "laugh", "wow", "sad", "clap", "hundred", "sparkle"]
LENSES = sorted(LENS_KEYS)
AUD3 = ["everyone", "friends", "nobody"]

def _s(path, module, label, type, default, enforced=False, help="", **kw):
    return {"path": path, "module": module, "label": label, "type": type, "default": default, "enforced": enforced, "help": help, **kw}

SETTINGS = [
    # ---------------- Glow ----------------
    _s("defaults.glow.privateProfile", "glow", "New profiles are private", "bool", False, help="Default for new accounts; users can change it."),
    _s("defaults.glow.whoCanComment", "glow", "Default: who can comment", "enum", "everyone", options=["everyone", "followers", "nobody"]),
    _s("limits.blinkHours", "glow", "Blink (story) max duration (hours)", "enum", 24, True, "Longest timer a Blink may use.", options=[1, 6, 12, 24]),
    _s("limits.postVideoMaxSec", "glow", "Post video max length (s)", "int", 60, True, min=5, max=600),
    _s("limits.blinkVideoMaxSec", "glow", "Blink video max length (s)", "int", 60, True, min=5, max=600),
    _s("limits.maxPhotosPerPost", "glow", "Max photos per post", "int", 10, True, min=1, max=20),
    _s("limits.uploadMaxMB", "glow", "Upload size cap (MB)", "int", 1024, True, "Resumable uploads; direct photo/video uploads keep their 5/50 MB hard caps.", min=1, max=1024),
    _s("defaults.glow.lenses", "glow", "Allowed lenses", "multi", LENSES, True, options=LENSES),
    _s("defaults.glow.feedTabs", "glow", "Feed tabs shown", "multi", FEED_TABS, options=FEED_TABS),
    _s("defaults.glow.reactions", "glow", "Reaction set", "multi", REACTIONS, options=REACTIONS),
    _s("defaults.glow.hashtags", "glow", "Hashtags", "bool", True, True, "Off: tags are dropped from new posts."),
    _s("defaults.glow.mentions", "glow", "@mentions", "bool", True),
    _s("addons.glow.dailySpark", "glow", "Add-on: Daily Spark (one question a day, everyone answers)", "bool", True, True),
    _s("addons.glow.capsules", "glow", "Add-on: Time Capsules (sealed posts that open on a date)", "bool", True, True),
    _s("addons.glow.capsuleMaxDays", "glow", "Time Capsules: furthest unlock date (days)", "int", 3650, True, min=1, max=36500),
    _s("addons.glow.kudos", "glow", "Add-on: Kudos (thank-you badges + weekly board)", "bool", True, True),
    _s("addons.glow.kudosPerDay", "glow", "Kudos each person can give per day", "int", 5, True, min=1, max=100),
    # ---------------- Hush ----------------
    _s("defaults.hush.whoCanMessage", "hush", "Default: who can message", "enum", "everyone", options=AUD3),
    _s("defaults.hush.readReceipts", "hush", "Default: read receipts on", "bool", True),
    _s("defaults.hush.lastSeen", "hush", "Default: who sees last seen", "enum", "everyone", options=AUD3),
    _s("defaults.hush.typing", "hush", "Default: typing indicators on", "bool", True),
    _s("defaults.hush.fadeTimer", "hush", "Default fade timer", "enum", "off", options=["off", "1h", "24h", "7d"]),
    _s("addons.hush.pacts", "hush", "Add-on: Pacts (shared checklists in chats)", "bool", True, True),
    _s("addons.hush.tab", "hush", "Add-on: Hush Tab (split expenses in chats)", "bool", True, True),
    _s("addons.hush.safeArrival", "hush", "Add-on: Safe Arrival (check-in timer that alerts friends)", "bool", True, True),
    _s("addons.hush.safeArrivalMaxHours", "hush", "Safe Arrival: longest timer (hours)", "int", 12, True, min=1, max=72),
    _s("limits.maxGroupSize", "hush", "Max group size", "int", 50, True, min=2, max=1024),
    _s("limits.fileMaxMB", "hush", "Max chat file size (MB)", "int", 100, True, min=1, max=1024),
    _s("limits.voiceNoteMaxSec", "hush", "Voice note max length (s)", "int", 300, True, min=5, max=300),
    _s("limits.chatVideoMaxSec", "hush", "Chat video / video note max length (s)", "int", 60, True, min=5, max=600),
    _s("defaults.hush.callTypes", "hush", "Call types allowed", "multi", ["audio", "video"], True, options=["audio", "video"]),
    _s("limits.statusHours", "hush", "Mood (status) duration (hours)", "int", 24, help="Mood media on/off is the moodMedia feature flag.", min=1, max=72),
    _s("limits.editWindowMin", "hush", "Message edit window (min)", "int", 15, True, min=0, max=1440),
    _s("limits.undoWindowMin", "hush", "Unsend window (min)", "int", 60, True, min=0, max=10080),
    # ---------------- Global ----------------
    _s("access.signupOpen", "global", "Sign-up open", "bool", True, True),
    _s("limits.otpResendSec", "global", "OTP resend cooldown (s, 0 = off; the rate limiter still applies)", "int", 0, True, min=0, max=600),
    _s("security.twoFactor", "global", "Two-factor sign-in (authenticator app)", "bool", True, True, "Off: users can't turn it on and sign-in skips the 2FA step (existing setups are kept)."),
    _s("security.newDeviceAlerts", "global", "New-device sign-in alerts", "bool", True, True, "Push + Account activity entry when an account signs in on a new device."),
    _s("security.sessionList", "global", "Users can see and sign out their devices", "bool", True, True),
    _s("privacy.selfDelete", "global", "Users can delete their own account", "bool", True, True),
    _s("privacy.deletionGraceDays", "global", "Days before a deleted account is erased (can cancel meanwhile)", "int", 30, True, min=0, max=90),
    _s("privacy.selfExport", "global", "Users can download their data", "bool", True, True),
    _s("safety.ageGate", "global", "Ask birth date at sign-up", "bool", True, True, "Set per country with a country layer."),
    _s("safety.minAge", "global", "Minimum age to sign up", "int", 13, True, min=13, max=21),
    _s("safety.teenDefaults", "global", "Under-18s start private (profile private, only friends can message)", "bool", True, True),
    _s("safety.appeals", "global", "Users can appeal bans, removed posts and blocked media", "bool", True, True),
    _s("safety.appealWindowDays", "global", "Days to appeal after an action", "int", 30, True, min=1, max=365),
    _s("safety.scanUploads", "global", "Hold new uploads until scanned or reviewed", "bool", False, True, "Uses the Scanner plug when connected; otherwise uploads wait in the admin Scan Queue."),
    _s("safety.hashBlocklist", "global", "Refuse files on the hash blocklist", "bool", True, True),
    _s("spam.newAccountHours", "global", "Accounts younger than this are 'new' (hours, 0 = off)", "int", 24, True, min=0, max=720),
    _s("spam.newAccountDmPerHour", "global", "New accounts: max new chats started per hour", "int", 10, True, min=1, max=500),
    _s("spam.bulkSameText", "global", "Flag same message sent to this many chats in 10 min (0 = off)", "int", 8, True, min=0, max=500),
    _s("spam.autoRestrict", "global", "Auto-restrict flagged spammers for 24 h", "bool", True, True),
    _s("limits.maxAccounts", "global", "Max accounts per email", "int", 5, True, min=1, max=10),
    _s("access.maintenance", "global", "Maintenance mode", "bool", False, True, "On: non-staff API calls get 503; the app shows the message."),
    _s("access.maintenanceMessage", "global", "Maintenance message", "str", "We're tuning things up — back soon.", maxLen=200),
    _s("access.minAppVersion", "global", "Minimum app version", "version", "0.0.0", True, "Clients sending X-App-Version below this get 426 when force update is on."),
    _s("access.forceUpdate", "global", "Force update", "bool", False, True),
    _s("limits.autoHideReports", "global", "Auto-hide a post after N reports (0 = off)", "int", 5, True, min=0, max=1000),
]
import importlib as _il
for _n in range(2, 10):  # add-on batches contribute their own switches
    try: SETTINGS += _il.import_module(f".addon_settings_b{_n}", __package__).SETTINGS
    except ModuleNotFoundError: pass
BY_PATH = {s["path"]: s for s in SETTINGS}
OWNED_TOP = ("defaults", "access", "security", "privacy", "safety", "spam", "addons")  # top-level keys this module owns entirely; "limits" is shared (fees etc. stay elsewhere)
LEGACY_LIMITS = {"maxAccounts", "maxGroupSize", "statusHours", "editWindowMin", "undoWindowMin"}

def base_values() -> dict:
    out: dict = {}
    for s in SETTINGS:
        d = out; *head, last = s["path"].split(".")
        for h in head: d = d.setdefault(h, {})
        d[last] = copy.deepcopy(s["default"])
    return out

def _ver(v): return tuple(int(x) for x in v.split("."))
def check_value(s: dict, v) -> str | None:
    t, p = s["type"], s["path"]
    if t == "bool": return None if isinstance(v, bool) else f"{p} must be true/false"
    if t == "int":
        if not isinstance(v, int) or isinstance(v, bool) or not s["min"] <= v <= s["max"]: return f"{p} must be a whole number {s['min']}–{s['max']}"
        return None
    if t == "enum": return None if v in s["options"] and type(v) is type(s["options"][0]) else f"{p} must be one of {', '.join(map(str, s['options']))}"
    if t == "multi":
        if not isinstance(v, list) or any(x not in s["options"] for x in v) or len(set(v)) != len(v): return f"{p} must be a list from: {', '.join(s['options'])}"
        return None
    if t == "str": return None if isinstance(v, str) and len(v) <= s.get("maxLen", 200) else f"{p} must be text ≤{s.get('maxLen', 200)} chars"
    if t == "version":
        try: _ver(v); ok = isinstance(v, str) and len(v.split(".")) == 3 and len(v) <= 20
        except (ValueError, AttributeError): ok = False
        return None if ok else f"{p} must look like 1.2.3"
    return f"{p}: unknown type"

def _walk(prefix, d):
    for k, v in d.items():
        p = f"{prefix}.{k}"
        if isinstance(v, dict) and p not in BY_PATH: yield from _walk(p, v)
        else: yield p, v

def validate(override: dict) -> str | None:
    """Validate the limits/defaults/access part of a config layer."""
    for top in ("limits",) + OWNED_TOP:
        if top not in override: continue
        if not isinstance(override[top], dict): return f"{top} must be an object"
        for p, v in _walk(top, override[top]):
            if p not in BY_PATH:
                if top == "limits" and isinstance(v, (int, float)) and not isinstance(v, bool): continue  # other agents' numeric limits
                return f"Unknown setting: {p}"
            if err := check_value(BY_PATH[p], v): return err
    return None

def get(cfg: dict, path: str):
    d = cfg
    for k in path.split("."):
        if not isinstance(d, dict) or k not in d: return copy.deepcopy(BY_PATH[path]["default"])
        d = d[k]
    return d

def setting(db, path: str, user=None):
    """Resolved value for this user (layers: base → country → zone → slab → lang)."""
    from .config_resolver import resolve
    return get(resolve(db, user), path)

def deny(code: int, msg: str): raise HTTPException(code, msg)
