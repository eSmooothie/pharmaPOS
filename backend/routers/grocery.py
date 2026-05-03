from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from database import get_db
from models import GroceryItem, GroceryCategory, ItemAuditLog, SaleItem
from schemas import (
    GroceryItemCreate, GroceryItemUpdate, GroceryItemOut,
    GroceryCategoryCreate, GroceryCategoryOut, RestockRequest,
)

router = APIRouter(tags=["grocery"])


def _log(db: Session, item_id: int, action: str, field: str | None = None,
         old: str | None = None, new: str | None = None, note: str | None = None):
    db.add(ItemAuditLog(
        item_type="grocery", item_id=item_id, action=action,
        field_name=field, old_value=old, new_value=new, note=note,
    ))


# ── Grocery Categories ────────────────────────────────────────────────────────

@router.get("/grocery-categories", response_model=list[GroceryCategoryOut])
def list_categories(db: Session = Depends(get_db)):
    return db.query(GroceryCategory).order_by(GroceryCategory.name).all()


@router.post("/grocery-categories", response_model=GroceryCategoryOut, status_code=201)
def create_category(payload: GroceryCategoryCreate, db: Session = Depends(get_db)):
    cat = GroceryCategory(name=payload.name)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


# ── Grocery Items ─────────────────────────────────────────────────────────────

def _enrich(item: GroceryItem) -> GroceryItemOut:
    out = GroceryItemOut.model_validate(item)
    out.category_name = item.category.name if item.category else None
    return out


@router.get("/grocery-items", response_model=list[GroceryItemOut])
def list_items(
    q: str | None = Query(None),
    category_id: int | None = Query(None),
    archived: bool = Query(False, description="If true, return archived items only"),
    db: Session = Depends(get_db),
):
    query = db.query(GroceryItem).filter(GroceryItem.is_deleted == archived)
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                GroceryItem.name.ilike(like),
                GroceryItem.brand.ilike(like),
                GroceryItem.barcode.ilike(like),
            )
        )
    if category_id:
        query = query.filter(GroceryItem.category_id == category_id)
    return [_enrich(i) for i in query.order_by(GroceryItem.name).all()]


@router.post("/grocery-items", response_model=GroceryItemOut, status_code=201)
def create_item(payload: GroceryItemCreate, db: Session = Depends(get_db)):
    item = GroceryItem(**payload.model_dump())
    db.add(item)
    db.flush()
    _log(db, item.id, "created")
    db.commit()
    db.refresh(item)
    return _enrich(item)


@router.get("/grocery-items/{item_id}", response_model=GroceryItemOut)
def get_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(GroceryItem, item_id)
    if not item:
        raise HTTPException(404, "Grocery item not found")
    return _enrich(item)


@router.put("/grocery-items/{item_id}", response_model=GroceryItemOut)
def update_item(item_id: int, payload: GroceryItemUpdate, db: Session = Depends(get_db)):
    item = db.get(GroceryItem, item_id)
    if not item:
        raise HTTPException(404, "Grocery item not found")

    changes = payload.model_dump(exclude_none=True)
    for field, new_val in changes.items():
        old_val = str(getattr(item, field))
        setattr(item, field, new_val)
        _log(db, item.id, "updated", field=field, old=old_val, new=str(new_val))

    db.commit()
    db.refresh(item)
    return _enrich(item)


@router.delete("/grocery-items/{item_id}", status_code=204)
def delete_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(GroceryItem, item_id)
    if not item:
        raise HTTPException(404, "Grocery item not found")
    if item.is_deleted:
        raise HTTPException(409, "Grocery item is already archived")
    item.is_deleted = True
    _log(db, item_id, "deleted", new=item.name)
    db.commit()


@router.post("/grocery-items/{item_id}/restore", response_model=GroceryItemOut)
def restore_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(GroceryItem, item_id)
    if not item:
        raise HTTPException(404, "Grocery item not found")
    if not item.is_deleted:
        raise HTTPException(409, "Grocery item is not archived")
    item.is_deleted = False
    _log(db, item_id, "updated", field="is_deleted", old="true", new="false", note="restored from archive")
    db.commit()
    db.refresh(item)
    return _enrich(item)


@router.post("/grocery-items/{item_id}/restock", response_model=GroceryItemOut)
def restock_item(item_id: int, payload: RestockRequest, db: Session = Depends(get_db)):
    item = db.get(GroceryItem, item_id)
    if not item:
        raise HTTPException(404, "Grocery item not found")
    if payload.qty <= 0:
        raise HTTPException(422, "qty must be positive")

    old_qty = item.stock_qty
    item.stock_qty += payload.qty
    _log(db, item_id, "restocked", field="stock_qty",
         old=str(old_qty), new=str(item.stock_qty))
    db.commit()
    db.refresh(item)
    return _enrich(item)
