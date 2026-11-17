"""Admin switches for add-on batch 3 (Glow: Local Pulse, Skill Swap Board, Ask Box, Memory Lane, Goal Ladder, Wish Shelf)."""
def _s(path, module, label, type, default, enforced=False, help="", **kw):
    return {"path": path, "module": module, "label": label, "type": type, "default": default, "enforced": enforced, "help": help, **kw}

SETTINGS: list[dict] = [
    _s("addons.glow.localPulse", "glow", "Add-on: Local Pulse (short area-tagged updates that expire)", "bool", True, True),
    _s("addons.glow.localPulseHours", "glow", "Local Pulse: hours before an update expires", "int", 24, True, min=1, max=168),
    _s("addons.glow.localPulseHideAt", "glow", "Local Pulse: reports that auto-hide an update", "int", 3, True, min=1, max=50),
    _s("addons.glow.skillSwap", "glow", "Add-on: Skill Swap Board (teach one thing, learn another)", "bool", True, True),
    _s("addons.glow.askBox", "glow", "Add-on: Ask Box (questions to a creator, answered publicly)", "bool", True, True),
    _s("addons.glow.askBoxPerDay", "glow", "Ask Box: questions each person can send per day", "int", 20, True, min=1, max=200),
    _s("addons.glow.memoryLane", "glow", "Add-on: Memory Lane (your posts on this day in past years)", "bool", True, True),
    _s("addons.glow.goalLadder", "glow", "Add-on: Goal Ladder (public goals with milestones friends cheer)", "bool", True, True),
    _s("addons.glow.goalLadderActive", "glow", "Goal Ladder: open goals per person", "int", 5, True, min=1, max=50),
    _s("addons.glow.wishShelf", "glow", "Add-on: Wish Shelf (wishlist friends can secretly claim)", "bool", True, True),
]
