"""Admin switches for add-on batch 4 (merged into user_app.SETTINGS)."""
def _s(path, module, label, type, default, enforced=False, help="", **kw):
    return {"path": path, "module": module, "label": label, "type": type, "default": default, "enforced": enforced, "help": help, **kw}

SETTINGS: list[dict] = [
    _s("addons.glow.photoPrompt", "glow", "Add-on: Photo Prompt Weekly (weekly photo theme, entries and votes)", "bool", True, True),
    _s("addons.glow.photoVotesPerWeek", "glow", "Photo Prompt votes per person per week", "int", 3, True, min=1, max=10),
    _s("addons.glow.mentorMatch", "glow", "Add-on: Mentor Match (mentors and mentees by topic, session notes)", "bool", True, True),
    _s("addons.glow.mentorCapacity", "glow", "Mentor Match: active mentees per mentor", "int", 3, True, min=1, max=20),
    _s("addons.glow.hiddenGems", "glow", "Add-on: Hidden Gems (recommend and upvote local places)", "bool", True, True),
    _s("addons.glow.recipeBox", "glow", "Add-on: Recipe Box (structured recipes, saves, cooked-it counter)", "bool", True, True),
    _s("addons.glow.bookNook", "glow", "Add-on: Book Nook (reading log and your Squad's reading)", "bool", True, True),
    _s("addons.glow.meetupBoard", "glow", "Add-on: Meetup Board (small local meetups with RSVP and waitlist)", "bool", True, True),
    _s("addons.glow.meetupMaxCapacity", "glow", "Meetup Board: largest meetup size", "int", 50, True, min=2, max=500),
]
