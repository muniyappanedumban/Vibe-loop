"""Admin switches for add-on batch 2 (Glow) — merged into user_app.SETTINGS."""
def _s(path, module, label, type, default, enforced=False, help="", **kw):
    return {"path": path, "module": module, "label": label, "type": type, "default": default, "enforced": enforced, "help": help, **kw}

SETTINGS: list[dict] = [
    _s("addons.glow.vibeMeter", "glow", "Add-on: Vibe Meter (0-100 'how did this make you feel' slider on posts)", "bool", True, True),
    _s("addons.glow.streakGarden", "glow", "Add-on: Streak Garden (daily activity grows a plant)", "bool", True, True),
    _s("addons.glow.streakFreezesPerMonth", "glow", "Streak Garden: freeze tokens per month", "int", 2, True, min=0, max=31),
    _s("addons.glow.microChallenges", "glow", "Add-on: Micro Challenges (weekly staff challenge, entries + upvotes)", "bool", True, True),
    _s("addons.glow.spotlightWall", "glow", "Add-on: Spotlight Wall (staff-curated featured creators)", "bool", True, True),
    _s("addons.glow.hotTakeDuels", "glow", "Add-on: Hot Take Duels (pick a side + one-line argument)", "bool", True, True),
    _s("addons.glow.gratitudeJar", "glow", "Add-on: Gratitude Jar (private daily gratitude notes + monthly recap)", "bool", True, True),
    _s("addons.glow.gratitudePerDay", "glow", "Gratitude Jar: notes per day", "int", 3, True, min=1, max=20),
]
