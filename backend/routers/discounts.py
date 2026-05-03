from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import DiscountType
from schemas import DiscountTypeCreate, DiscountTypeUpdate, DiscountTypeOut

router = APIRouter(tags=["discounts"])


@router.get("/discount-types", response_model=list[DiscountTypeOut])
def list_discount_types(db: Session = Depends(get_db)):
    return db.query(DiscountType).order_by(DiscountType.name).all()


@router.post("/discount-types", response_model=DiscountTypeOut, status_code=201)
def create_discount_type(payload: DiscountTypeCreate, db: Session = Depends(get_db)):
    dt = DiscountType(**payload.model_dump())
    db.add(dt)
    db.commit()
    db.refresh(dt)
    return dt


@router.put("/discount-types/{dt_id}", response_model=DiscountTypeOut)
def update_discount_type(dt_id: int, payload: DiscountTypeUpdate, db: Session = Depends(get_db)):
    dt = db.get(DiscountType, dt_id)
    if not dt:
        raise HTTPException(404, "Discount type not found")
    for field, val in payload.model_dump(exclude_none=True).items():
        setattr(dt, field, val)
    db.commit()
    db.refresh(dt)
    return dt
