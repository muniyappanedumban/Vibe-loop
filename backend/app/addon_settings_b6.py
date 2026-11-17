"""Admin switches for add-on batch 6 (merged into user_app.SETTINGS)."""
def _s(path, module, label, type, default, enforced=False, help="", **kw):
    return {"path": path, "module": module, "label": label, "type": type, "default": default, "enforced": enforced, "help": help, **kw}

SETTINGS: list[dict] = [
    _s("addons.hush.checkInCircle", "hush", "Add-on: Check-in Circle (daily mood check-in in group chats)", "bool", True, True),
    _s("addons.hush.planBoard", "hush", "Add-on: Plan Board (shared events + RSVPs in chats)", "bool", True, True),
    _s("addons.hush.birthdayBuddy", "hush", "Add-on: Birthday Buddy (opt-in birthdays + day-before reminders)", "bool", True, True),
    _s("addons.hush.rideRota", "hush", "Add-on: Ride Rota (trips with drivers and seats)", "bool", True, True),
    _s("addons.hush.rideMaxSeats", "hush", "Ride Rota: most seats per trip", "int", 6, True, min=1, max=50),
    _s("addons.hush.decisionDice", "hush", "Add-on: Decision Dice (vote or roll to decide)", "bool", True, True),
    _s("addons.hush.diceMaxOptions", "hush", "Decision Dice: most options per decision", "int", 8, True, min=2, max=20),
    _s("addons.hush.giftPool", "hush", "Add-on: Gift Pool (group gift pledges, no money moves)", "bool", True, True),
    _s("addons.hush.giftMaxTarget", "hush", "Gift Pool: biggest target (whole currency units)", "int", 100000, True, min=100, max=1000000),
]
