"""Admin switches for add-on batch 7 (merged into user_app.SETTINGS)."""
def _s(path, module, label, type, default, enforced=False, help="", **kw):
    return {"path": path, "module": module, "label": label, "type": type, "default": default, "enforced": enforced, "help": help, **kw}

SETTINGS: list[dict] = [
    _s("addons.hush.choreRotation", "hush", "Add-on: Chore Rotation (rotating chores in chats)", "bool", True, True),
    _s("addons.hush.choresPerChat", "hush", "Chore Rotation: most chores per chat", "int", 30, True, min=1, max=200),
    _s("addons.hush.watchQueue", "hush", "Add-on: Watch Queue (shared list of shows and movies, votes and ratings)", "bool", True, True),
    _s("addons.hush.secretSanta", "hush", "Add-on: Secret Santa (gift draw in group chats)", "bool", True, True),
    _s("addons.hush.lendLog", "hush", "Add-on: Lend Log (track things lent and borrowed between chat members)", "bool", True, True),
    _s("addons.hush.habitBuddies", "hush", "Add-on: Habit Buddies (shared daily habit with a friend and a joint streak)", "bool", True, True),
    _s("addons.hush.habitBuddiesMax", "hush", "Habit Buddies: most shared habits per person", "int", 10, True, min=1, max=50),
    _s("addons.hush.tripPlanner", "hush", "Add-on: Trip Planner (day-by-day itinerary in chats)", "bool", True, True),
    _s("addons.hush.tripMaxDays", "hush", "Trip Planner: longest trip (days)", "int", 30, True, min=1, max=60),
]
