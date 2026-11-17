"""Admin switches for add-on batch 8 (merged into user_app.SETTINGS)."""
def _s(path, module, label, type, default, enforced=False, help="", **kw):
    return {"path": path, "module": module, "label": label, "type": type, "default": default, "enforced": enforced, "help": help, **kw}

SETTINGS: list[dict] = [
    _s("addons.hush.emergencyCard", "hush", "Add-on: Emergency Card (medical info shared only with chosen Squad friends)", "bool", True, True),
    _s("addons.hush.remindThem", "hush", "Add-on: Remind Them (schedule a reminder ping to a friend)", "bool", True, True),
    _s("addons.hush.remindMaxDays", "hush", "Remind Them: furthest reminder date (days)", "int", 60, True, min=1, max=365),
    _s("addons.hush.remindPerDay", "hush", "Remind Them: reminders each person can schedule per day", "int", 20, True, min=1, max=200),
    _s("addons.hush.meetingNotes", "hush", "Add-on: Meeting Notes (chat notes with assigned action items)", "bool", True, True),
    _s("addons.hush.memoryJar", "hush", "Add-on: Memory Jar (save favourite messages into a chat's shared jar)", "bool", True, True),
    _s("addons.hush.memoryJarMax", "hush", "Memory Jar: most saved messages per chat", "int", 500, True, min=10, max=5000),
    _s("addons.hush.kindnessStreak", "hush", "Add-on: Kindness Streak (a kind note to a friend each day, streak per pair)", "bool", True, True),
    _s("addons.hush.quietReply", "hush", "Add-on: Quiet Reply (personal away note during chosen hours)", "bool", True, True),
]
