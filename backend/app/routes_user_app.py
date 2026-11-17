"""Admin → User App Settings: schema for the per-layer form. Values are saved through PUT /admin/config/{layer} (validated + audited there)."""
from fastapi import APIRouter, Depends
from . import models as M, user_app as UA
from .security import require

router = APIRouter()

@router.get("/admin/user-app/schema")
def schema(a: M.User = Depends(require("owner"))):
    return {"settings": UA.SETTINGS, "modules": ["glow", "hush", "global"]}
