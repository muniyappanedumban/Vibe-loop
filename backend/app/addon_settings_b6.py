"""Admin switches for add-on batch 6 (merged into user_app.SETTINGS). Builder fills this list."""
def _s(path, module, label, type, default, enforced=False, help="", **kw):
    return {"path": path, "module": module, "label": label, "type": type, "default": default, "enforced": enforced, "help": help, **kw}

SETTINGS: list[dict] = []
