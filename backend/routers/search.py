from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from database import get_db
from models import Medicine, GroceryItem
from schemas import SearchResult

router = APIRouter(tags=["search"])


@router.get("/search", response_model=list[SearchResult])
def unified_search(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    like = f"%{q}%"
    results: list[SearchResult] = []

    medicines = (
        db.query(Medicine)
        .filter(
            Medicine.is_deleted == False,  # noqa: E712
            or_(
                Medicine.generic_name.ilike(like),
                Medicine.brand_name.ilike(like),
                Medicine.barcode.ilike(like),
            )
        )
        .limit(20)
        .all()
    )
    for m in medicines:
        extra_parts = [p for p in [m.dosage_form, m.strength] if p]
        results.append(SearchResult(
            type="medicine", id=m.id,
            name=m.generic_name, brand=m.brand_name,
            price=m.price, stock_qty=m.stock_qty, unit=m.unit,
            extra=" / ".join(extra_parts) if extra_parts else None,
        ))

    groceries = (
        db.query(GroceryItem)
        .filter(
            GroceryItem.is_deleted == False,  # noqa: E712
            or_(
                GroceryItem.name.ilike(like),
                GroceryItem.brand.ilike(like),
                GroceryItem.barcode.ilike(like),
            )
        )
        .limit(20)
        .all()
    )
    for g in groceries:
        results.append(SearchResult(
            type="grocery", id=g.id,
            name=g.name, brand=g.brand,
            price=g.price, stock_qty=g.stock_qty, unit=g.unit,
        ))

    return results
