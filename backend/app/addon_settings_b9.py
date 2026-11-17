"""Admin switches for add-on batch 9 (merged into user_app.SETTINGS) — Hush: chat-side tools."""
def _s(path, module, label, type, default, enforced=False, help="", **kw):
    return {"path": path, "module": module, "label": label, "type": type, "default": default, "enforced": enforced, "help": help, **kw}

SETTINGS: list[dict] = [
    _s("addons.hush.confessionBox", "hush", "Add-on: Confession Box (anonymous notes inside a group chat; staff can see the sender)", "bool", True, True),
    _s("addons.hush.confessionsPerDay", "hush", "Confession Box: notes each person can drop per day", "int", 10, True, min=1, max=100),
    _s("addons.hush.timeZoneBoard", "hush", "Add-on: Time Zone Board (everyone's local time + overlap hours in a chat)", "bool", True, True),
    _s("addons.hush.readLaterShelf", "hush", "Add-on: Read-Later Shelf (save links to a chat shelf, mark read)", "bool", True, True),
    _s("addons.hush.shelfMaxItems", "hush", "Read-Later Shelf: most links per chat", "int", 200, True, min=10, max=2000),
    _s("addons.hush.studySprint", "hush", "Add-on: Study Sprint (timed focus sprints in a chat + weekly minutes board)", "bool", True, True),
    _s("addons.hush.sharedBudget", "hush", "Add-on: Shared Budget (chat budget with category limits; no money moves)", "bool", True, True),
    _s("addons.hush.voteToPin", "hush", "Add-on: Vote to Pin (members vote a note into the chat's pin; 50% yes wins)", "bool", True, True),
]
