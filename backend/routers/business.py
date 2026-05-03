from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import BusinessInfo
from schemas import BusinessInfoOut, BusinessInfoUpdate

router = APIRouter(tags=["business"])


@router.get("/business-info", response_model=BusinessInfoOut)
def get_business_info(db: Session = Depends(get_db)):
    info = db.get(BusinessInfo, 1)
    if not info:
        return BusinessInfoOut(id=1, business_name=None, address=None, tin=None, contact=None)
    return info


@router.put("/business-info", response_model=BusinessInfoOut)
def update_business_info(payload: BusinessInfoUpdate, db: Session = Depends(get_db)):
    info = db.get(BusinessInfo, 1)
    if not info:
        info = BusinessInfo(id=1)
        db.add(info)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(info, field, value)
    db.commit()
    db.refresh(info)
    return info
