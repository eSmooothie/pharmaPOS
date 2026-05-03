from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database import get_db
from models import Sale, SaleItem, Medicine, MedicineBatch, GroceryItem, DiscountType, ItemAuditLog
from schemas import SaleCreate, SaleOut, SaleItemOut, VoidRequest

router = APIRouter(tags=["sales"])

VAT_RATE = 0.12


def _log(db: Session, item_type: str, item_id: int, action: str,
         field: str | None = None, old: str | None = None, new: str | None = None,
         ref_sale_id: int | None = None, note: str | None = None):
    db.add(ItemAuditLog(
        item_type=item_type, item_id=item_id, action=action,
        field_name=field, old_value=old, new_value=new,
        ref_sale_id=ref_sale_id, note=note,
    ))


def _decrement_medicine_fifo(db: Session, medicine: Medicine, qty: int, sale_id: int):
    """Decrement qty from medicine batches FIFO (earliest expiry first)."""
    remaining = qty
    batches = (
        db.query(MedicineBatch)
        .filter(
            MedicineBatch.medicine_id == medicine.id,
            MedicineBatch.qty_remaining > 0,
        )
        .order_by(MedicineBatch.expiry_date)
        .all()
    )
    for batch in batches:
        if remaining == 0:
            break
        take = min(remaining, batch.qty_remaining)
        batch.qty_remaining -= take
        remaining -= take

    old_qty = medicine.stock_qty
    medicine.stock_qty -= qty
    _log(db, "medicine", medicine.id, "sold",
         field="stock_qty", old=str(old_qty), new=str(medicine.stock_qty),
         ref_sale_id=sale_id)


def _restore_medicine_fifo(db: Session, medicine: Medicine, qty: int, sale_id: int):
    """Restore qty to medicine batches FIFO-reversed (latest expiry first = reverse of sell order)."""
    remaining = qty
    batches = (
        db.query(MedicineBatch)
        .filter(MedicineBatch.medicine_id == medicine.id)
        .order_by(MedicineBatch.expiry_date)
        .all()
    )
    # Restore in reverse order (last depleted first)
    for batch in reversed(batches):
        if remaining == 0:
            break
        can_restore = batch.qty_received - batch.qty_remaining
        restore = min(remaining, can_restore)
        batch.qty_remaining += restore
        remaining -= restore

    old_qty = medicine.stock_qty
    medicine.stock_qty += qty
    _log(db, "medicine", medicine.id, "voided",
         field="stock_qty", old=str(old_qty), new=str(medicine.stock_qty),
         ref_sale_id=sale_id)


def _compute_discount(subtotal: float, discount_type: DiscountType | None,
                      custom_percent: float | None = None) -> float:
    if custom_percent is not None and discount_type is None:
        return round(subtotal * (custom_percent / 100), 2)
    if discount_type is None:
        return 0.0
    base = subtotal
    if discount_type.is_vat_exempt:
        # Remove embedded VAT before applying discount (PH law)
        base = subtotal / (1 + VAT_RATE)
    return round(base * (discount_type.percent / 100), 2)


def _build_sale_out(sale: Sale) -> SaleOut:
    items_out = []
    for si in sale.items:
        if si.medicine_id:
            name = f"{si.medicine.generic_name} ({si.medicine.brand_name})" if si.medicine else None
        else:
            name = si.grocery_item.name if si.grocery_item else None
        items_out.append(SaleItemOut(
            id=si.id, sale_id=si.sale_id,
            medicine_id=si.medicine_id, grocery_item_id=si.grocery_item_id,
            quantity=si.quantity, unit_price=si.unit_price, subtotal=si.subtotal,
            item_name=name,
        ))
    # Derive custom percent from snapshotted amounts if no discount_type was linked
    custom_pct = None
    if sale.discount_type_id is None and sale.discount_amount > 0 and sale.subtotal > 0:
        custom_pct = round(sale.discount_amount / sale.subtotal * 100, 2)

    return SaleOut(
        id=sale.id, created_at=sale.created_at, subtotal=sale.subtotal,
        discount_type_id=sale.discount_type_id,
        discount_type_name=sale.discount_type.name if sale.discount_type else None,
        discount_amount=sale.discount_amount,
        custom_discount_percent=custom_pct,
        total_amount=sale.total_amount,
        payment_method=sale.payment_method,
        payment_app=sale.payment_app,
        payment_ref=sale.payment_ref,
        note=sale.note,
        is_void=sale.is_void, voided_at=sale.voided_at, void_reason=sale.void_reason,
        items=items_out,
    )


@router.post("/sales", response_model=SaleOut, status_code=201)
def create_sale(payload: SaleCreate, db: Session = Depends(get_db)):
    if not payload.items:
        raise HTTPException(422, "Sale must have at least one item")

    discount_type = None
    if payload.discount_type_id:
        discount_type = db.get(DiscountType, payload.discount_type_id)
        if not discount_type:
            raise HTTPException(404, "Discount type not found")

    sale_items: list[SaleItem] = []
    subtotal = 0.0

    for item_in in payload.items:
        if item_in.medicine_id:
            product = db.get(Medicine, item_in.medicine_id)
            if not product:
                raise HTTPException(404, f"Medicine {item_in.medicine_id} not found")
            if product.is_deleted:
                raise HTTPException(409, f"{product.generic_name} is archived and cannot be sold")
            if product.stock_qty < item_in.quantity:
                raise HTTPException(
                    409, f"Insufficient stock for {product.generic_name}: "
                         f"have {product.stock_qty}, need {item_in.quantity}"
                )
            unit_price = product.price
        else:
            product = db.get(GroceryItem, item_in.grocery_item_id)
            if not product:
                raise HTTPException(404, f"Grocery item {item_in.grocery_item_id} not found")
            if product.is_deleted:
                raise HTTPException(409, f"{product.name} is archived and cannot be sold")
            if product.stock_qty < item_in.quantity:
                raise HTTPException(
                    409, f"Insufficient stock for {product.name}: "
                         f"have {product.stock_qty}, need {item_in.quantity}"
                )
            unit_price = product.price

        line_subtotal = round(unit_price * item_in.quantity, 2)
        subtotal += line_subtotal
        sale_items.append(SaleItem(
            medicine_id=item_in.medicine_id,
            grocery_item_id=item_in.grocery_item_id,
            quantity=item_in.quantity,
            unit_price=unit_price,
            subtotal=line_subtotal,
        ))

    subtotal = round(subtotal, 2)
    discount_amount = _compute_discount(subtotal, discount_type, payload.custom_discount_percent)
    total_amount = round(subtotal - discount_amount, 2)

    sale = Sale(
        subtotal=subtotal,
        discount_type_id=payload.discount_type_id,
        discount_amount=discount_amount,
        total_amount=total_amount,
        payment_method=payload.payment_method,
        payment_app=payload.payment_app,
        payment_ref=payload.payment_ref,
        note=payload.note,
    )
    db.add(sale)
    db.flush()  # get sale.id before committing

    for si in sale_items:
        si.sale_id = sale.id
        db.add(si)
        db.flush()

        if si.medicine_id:
            med = db.get(Medicine, si.medicine_id)
            _decrement_medicine_fifo(db, med, si.quantity, sale.id)
        else:
            groc = db.get(GroceryItem, si.grocery_item_id)
            old_qty = groc.stock_qty
            groc.stock_qty -= si.quantity
            _log(db, "grocery", groc.id, "sold",
                 field="stock_qty", old=str(old_qty), new=str(groc.stock_qty),
                 ref_sale_id=sale.id)

    db.commit()
    db.refresh(sale)
    return _build_sale_out(sale)


@router.get("/sales", response_model=list[SaleOut])
def list_sales(
    date: str | None = Query(None, description="Filter by date YYYY-MM-DD"),
    is_void: bool | None = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    db: Session = Depends(get_db),
):
    query = db.query(Sale)
    if date:
        query = query.filter(Sale.created_at.startswith(date))
    if is_void is not None:
        query = query.filter(Sale.is_void == is_void)
    sales = query.order_by(desc(Sale.created_at)).offset(offset).limit(limit).all()
    return [_build_sale_out(s) for s in sales]


@router.get("/sales/{sale_id}", response_model=SaleOut)
def get_sale(sale_id: int, db: Session = Depends(get_db)):
    sale = db.get(Sale, sale_id)
    if not sale:
        raise HTTPException(404, "Sale not found")
    return _build_sale_out(sale)


@router.post("/sales/{sale_id}/void", response_model=SaleOut)
def void_sale(sale_id: int, payload: VoidRequest, db: Session = Depends(get_db)):
    sale = db.get(Sale, sale_id)
    if not sale:
        raise HTTPException(404, "Sale not found")
    if sale.is_void:
        raise HTTPException(409, "Sale is already voided")

    for si in sale.items:
        if si.medicine_id:
            med = db.get(Medicine, si.medicine_id)
            _restore_medicine_fifo(db, med, si.quantity, sale.id)
        else:
            groc = db.get(GroceryItem, si.grocery_item_id)
            old_qty = groc.stock_qty
            groc.stock_qty += si.quantity
            _log(db, "grocery", groc.id, "voided",
                 field="stock_qty", old=str(old_qty), new=str(groc.stock_qty),
                 ref_sale_id=sale.id)

    sale.is_void = True
    sale.voided_at = datetime.now(timezone.utc)
    sale.void_reason = payload.reason

    db.commit()
    db.refresh(sale)
    return _build_sale_out(sale)
