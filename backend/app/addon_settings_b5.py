"""Admin switches for add-on batch 5 (merged into user_app.SETTINGS)."""
def _s(path, module, label, type, default, enforced=False, help="", **kw):
    return {"path": path, "module": module, "label": label, "type": type, "default": default, "enforced": enforced, "help": help, **kw}

SETTINGS: list[dict] = [
    _s("addons.glow.collabCanvas", "glow", "Add-on: Collab Canvas (shared board, co-authors add tiles in turn)", "bool", True, True),
    _s("addons.glow.collabCanvasMaxAuthors", "glow", "Collab Canvas: most invited co-authors", "int", 8, True, min=1, max=8),
    _s("addons.glow.officeHours", "glow", "Add-on: Creator Office Hours (followers book a creator's weekly slots)", "bool", True, True),
    _s("addons.glow.officeHoursMaxOpen", "glow", "Office Hours: most upcoming slots per creator", "int", 20, True, min=1, max=100),
    _s("addons.glow.fanMissions", "glow", "Add-on: Fan Missions (creator missions, fan proof, points board)", "bool", True, True),
    _s("addons.glow.fanMissionsMaxActive", "glow", "Fan Missions: most active missions per creator", "int", 10, True, min=1, max=50),
    _s("addons.glow.moodboards", "glow", "Add-on: Moodboard Pins (your media + notes in named boards)", "bool", True, True),
    _s("addons.glow.moodboardMaxPins", "glow", "Moodboard Pins: most pins per board", "int", 200, True, min=10, max=1000),
    _s("addons.glow.timeLockPolls", "glow", "Add-on: Time-Lock Polls (results hidden until the reveal time)", "bool", True, True),
    _s("addons.glow.timeLockMaxDays", "glow", "Time-Lock Polls: furthest reveal time (days)", "int", 30, True, min=1, max=365),
    _s("addons.glow.thankYouStories", "glow", "Add-on: Thank-You Stories (public thanks, shown once the person approves)", "bool", True, True),
    _s("addons.glow.thankYouPerDay", "glow", "Thank-You Stories each person can write per day", "int", 5, True, min=1, max=50),
]
