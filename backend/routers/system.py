from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import SystemSettings
from schemas import SystemSettingsOut, SystemSettingsUpdate

router = APIRouter(tags=["system"])

DEFAULT_TIMEZONE = "Asia/Manila"


@router.get("/system-settings", response_model=SystemSettingsOut)
def get_system_settings(db: Session = Depends(get_db)):
    row = db.get(SystemSettings, 1)
    if not row:
        return SystemSettingsOut(timezone=DEFAULT_TIMEZONE)
    return row


@router.put("/system-settings", response_model=SystemSettingsOut)
def update_system_settings(payload: SystemSettingsUpdate, db: Session = Depends(get_db)):
    row = db.get(SystemSettings, 1)
    if not row:
        row = SystemSettings(id=1, timezone=DEFAULT_TIMEZONE)
        db.add(row)
    if payload.timezone is not None:
        row.timezone = payload.timezone
    db.commit()
    db.refresh(row)
    return row
