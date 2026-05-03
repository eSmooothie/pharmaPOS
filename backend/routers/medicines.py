from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from database import get_db
from models import Medicine, MedicineBatch, DrugClass, ItemAuditLog, SaleItem
from schemas import (
    MedicineCreate, MedicineUpdate, MedicineOut,
    BatchCreate, BatchOut, DrugClassCreate, DrugClassOut,
)

router = APIRouter(tags=["medicines"])


def _log(db: Session, item_id: int, action: str, field: str | None = None,
         old: str | None = None, new: str | None = None, note: str | None = None):
    db.add(ItemAuditLog(
        item_type="medicine", item_id=item_id, action=action,
        field_name=field, old_value=old, new_value=new, note=note,
    ))


# ── Drug Classes ──────────────────────────────────────────────────────────────

@router.get("/drug-classes", response_model=list[DrugClassOut])
def list_drug_classes(db: Session = Depends(get_db)):
    return db.query(DrugClass).order_by(DrugClass.name).all()


@router.post("/drug-classes", response_model=DrugClassOut, status_code=201)
def create_drug_class(payload: DrugClassCreate, db: Session = Depends(get_db)):
    dc = DrugClass(name=payload.name)
    db.add(dc)
    db.commit()
    db.refresh(dc)
    return dc


# ── Medicines ─────────────────────────────────────────────────────────────────

@router.get("/medicines", response_model=list[MedicineOut])
def list_medicines(
    q: str | None = Query(None),
    drug_class_id: int | None = Query(None),
    dosage_form: str | None = Query(None),
    archived: bool = Query(False, description="If true, return archived items only"),
    db: Session = Depends(get_db),
):
    query = db.query(Medicine).filter(Medicine.is_deleted == archived)
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                Medicine.generic_name.ilike(like),
                Medicine.brand_name.ilike(like),
                Medicine.barcode.ilike(like),
            )
        )
    if drug_class_id:
        query = query.filter(Medicine.drug_class_id == drug_class_id)
    if dosage_form:
        query = query.filter(Medicine.dosage_form == dosage_form)

    medicines = query.order_by(Medicine.generic_name).all()
    result = []
    for m in medicines:
        out = MedicineOut.model_validate(m)
        out.drug_class_name = m.drug_class.name if m.drug_class else None
        result.append(out)
    return result


@router.post("/medicines", response_model=MedicineOut, status_code=201)
def create_medicine(payload: MedicineCreate, db: Session = Depends(get_db)):
    m = Medicine(**payload.model_dump())
    db.add(m)
    db.flush()
    _log(db, m.id, "created")
    db.commit()
    db.refresh(m)
    out = MedicineOut.model_validate(m)
    out.drug_class_name = m.drug_class.name if m.drug_class else None
    return out


@router.get("/medicines/{medicine_id}", response_model=MedicineOut)
def get_medicine(medicine_id: int, db: Session = Depends(get_db)):
    m = db.get(Medicine, medicine_id)
    if not m:
        raise HTTPException(404, "Medicine not found")
    out = MedicineOut.model_validate(m)
    out.drug_class_name = m.drug_class.name if m.drug_class else None
    return out


@router.put("/medicines/{medicine_id}", response_model=MedicineOut)
def update_medicine(medicine_id: int, payload: MedicineUpdate, db: Session = Depends(get_db)):
    m = db.get(Medicine, medicine_id)
    if not m:
        raise HTTPException(404, "Medicine not found")

    changes = payload.model_dump(exclude_none=True)
    for field, new_val in changes.items():
        old_val = str(getattr(m, field))
        setattr(m, field, new_val)
        _log(db, m.id, "updated", field=field, old=old_val, new=str(new_val))

    db.commit()
    db.refresh(m)
    out = MedicineOut.model_validate(m)
    out.drug_class_name = m.drug_class.name if m.drug_class else None
    return out


@router.delete("/medicines/{medicine_id}", status_code=204)
def delete_medicine(medicine_id: int, db: Session = Depends(get_db)):
    m = db.get(Medicine, medicine_id)
    if not m:
        raise HTTPException(404, "Medicine not found")
    if m.is_deleted:
        raise HTTPException(409, "Medicine is already archived")
    m.is_deleted = True
    _log(db, medicine_id, "deleted", new=m.generic_name)
    db.commit()


@router.post("/medicines/{medicine_id}/restore", response_model=MedicineOut)
def restore_medicine(medicine_id: int, db: Session = Depends(get_db)):
    m = db.get(Medicine, medicine_id)
    if not m:
        raise HTTPException(404, "Medicine not found")
    if not m.is_deleted:
        raise HTTPException(409, "Medicine is not archived")
    m.is_deleted = False
    _log(db, medicine_id, "updated", field="is_deleted", old="true", new="false", note="restored from archive")
    db.commit()
    db.refresh(m)
    out = MedicineOut.model_validate(m)
    out.drug_class_name = m.drug_class.name if m.drug_class else None
    return out


# ── Batches ───────────────────────────────────────────────────────────────────

@router.get("/medicines/{medicine_id}/batches", response_model=list[BatchOut])
def list_batches(medicine_id: int, db: Session = Depends(get_db)):
    m = db.get(Medicine, medicine_id)
    if not m:
        raise HTTPException(404, "Medicine not found")
    return (
        db.query(MedicineBatch)
        .filter(MedicineBatch.medicine_id == medicine_id)
        .order_by(MedicineBatch.expiry_date)
        .all()
    )


@router.post("/medicines/{medicine_id}/batches", response_model=BatchOut, status_code=201)
def add_batch(medicine_id: int, payload: BatchCreate, db: Session = Depends(get_db)):
    m = db.get(Medicine, medicine_id)
    if not m:
        raise HTTPException(404, "Medicine not found")

    batch = MedicineBatch(
        medicine_id=medicine_id,
        batch_number=payload.batch_number,
        expiry_date=payload.expiry_date,
        qty_received=payload.qty_received,
        qty_remaining=payload.qty_received,
    )
    db.add(batch)

    old_qty = m.stock_qty
    m.stock_qty += payload.qty_received
    _log(
        db, medicine_id, "restocked",
        field="stock_qty",
        old=str(old_qty), new=str(m.stock_qty),
        note=f"batch {payload.batch_number or 'N/A'}, expiry {payload.expiry_date or 'N/A'}",
    )
    db.commit()
    db.refresh(batch)
    return batch
