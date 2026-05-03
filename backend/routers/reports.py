import csv
import io
from collections import defaultdict
from datetime import date, timedelta, datetime

try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo  # Python < 3.9 fallback

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models import Sale, SaleItem, Medicine, GroceryItem, MedicineBatch, DiscountType, SystemSettings
from schemas import DailySummaryOut, LowStockItem, ExpiringBatch, InventoryItem, OverallReportOut

router = APIRouter(prefix="/reports", tags=["reports"])

_UTC = ZoneInfo("UTC")


def _tz_str(db: Session) -> str:
    """Read the configured timezone from system settings."""
    row = db.get(SystemSettings, 1)
    return row.timezone if row else "Asia/Manila"


def _get_zone(tz_str: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz_str)
    except Exception:
        return ZoneInfo("UTC")


def _now_local(tz_str: str) -> str:
    """Return today's date string (YYYY-MM-DD) in the configured timezone."""
    return datetime.now(_get_zone(tz_str)).strftime("%Y-%m-%d")


def _day_bounds_utc(date_str: str, tz_str: str) -> tuple[datetime, datetime]:
    """
    Convert a local calendar date to a UTC [start, end] range for DB filtering.
    Timestamps in the DB are naive UTC (from SQLite CURRENT_TIMESTAMP).
    """
    tz = _get_zone(tz_str)
    y, m, d = map(int, date_str.split("-"))
    start = datetime(y, m, d, 0, 0, 0, tzinfo=tz).astimezone(_UTC).replace(tzinfo=None)
    end   = datetime(y, m, d, 23, 59, 59, 999999, tzinfo=tz).astimezone(_UTC).replace(tzinfo=None)
    return start, end


def _to_local(naive_utc: datetime, tz: ZoneInfo) -> datetime:
    """Attach UTC tzinfo to a naive DB datetime and convert to local timezone."""
    return naive_utc.replace(tzinfo=_UTC).astimezone(tz)


@router.get("/daily", response_model=DailySummaryOut)
def daily_summary(
    date_str: str = Query(default=None, alias="date", description="YYYY-MM-DD, defaults to today in configured TZ"),
    db: Session = Depends(get_db),
):
    tz_str = _tz_str(db)
    target = date_str or _now_local(tz_str)
    start_utc, end_utc = _day_bounds_utc(target, tz_str)

    sales = (
        db.query(Sale)
        .filter(
            Sale.created_at >= start_utc,
            Sale.created_at <= end_utc,
            Sale.is_void == False,  # noqa: E712
        )
        .all()
    )

    total_revenue = sum(s.total_amount for s in sales)
    transaction_count = len(sales)

    discount_map: dict[str, dict] = {}
    for s in sales:
        if s.discount_amount > 0 and s.discount_type:
            name = s.discount_type.name
            if name not in discount_map:
                discount_map[name] = {"name": name, "count": 0, "total_discount": 0.0}
            discount_map[name]["count"] += 1
            discount_map[name]["total_discount"] = round(
                discount_map[name]["total_discount"] + s.discount_amount, 2
            )
    discount_breakdown = list(discount_map.values())

    item_qty: dict[str, dict] = {}
    for s in sales:
        for si in s.items:
            if si.medicine_id and si.medicine:
                key = f"medicine:{si.medicine_id}"
                label = f"{si.medicine.generic_name} ({si.medicine.brand_name})"
            elif si.grocery_item_id and si.grocery_item:
                key = f"grocery:{si.grocery_item_id}"
                label = si.grocery_item.name
            else:
                continue
            if key not in item_qty:
                item_qty[key] = {"name": label, "type": key.split(":")[0], "qty": 0}
            item_qty[key]["qty"] += si.quantity

    top_items = sorted(item_qty.values(), key=lambda x: x["qty"], reverse=True)[:10]

    return DailySummaryOut(
        date=target,
        total_revenue=round(total_revenue, 2),
        transaction_count=transaction_count,
        discount_breakdown=discount_breakdown,
        top_items=top_items,
    )


@router.get("/low-stock", response_model=list[LowStockItem])
def low_stock(db: Session = Depends(get_db)):
    results = []
    for m in db.query(Medicine).filter(
        Medicine.is_deleted == False,  # noqa: E712
        Medicine.stock_qty <= Medicine.reorder_level,
    ).all():
        results.append(LowStockItem(
            type="medicine", id=m.id,
            name=f"{m.generic_name} ({m.brand_name})",
            stock_qty=m.stock_qty, reorder_level=m.reorder_level,
        ))
    for g in db.query(GroceryItem).filter(
        GroceryItem.is_deleted == False,  # noqa: E712
        GroceryItem.stock_qty <= GroceryItem.reorder_level,
    ).all():
        results.append(LowStockItem(
            type="grocery", id=g.id, name=g.name,
            stock_qty=g.stock_qty, reorder_level=g.reorder_level,
        ))
    return sorted(results, key=lambda x: x.stock_qty)


@router.get("/expiring", response_model=list[ExpiringBatch])
def expiring_batches(
    days: int = Query(30, description="Show batches expiring within this many days"),
    db: Session = Depends(get_db),
):
    # Use today's local date so the cutoff matches the user's calendar
    tz_str = _tz_str(db)
    today_local = date.fromisoformat(_now_local(tz_str))
    cutoff = (today_local + timedelta(days=days)).isoformat()

    batches = (
        db.query(MedicineBatch)
        .filter(
            MedicineBatch.expiry_date != None,  # noqa: E711
            MedicineBatch.expiry_date <= cutoff,
            MedicineBatch.qty_remaining > 0,
        )
        .order_by(MedicineBatch.expiry_date)
        .all()
    )
    results = []
    for b in batches:
        m = b.medicine
        results.append(ExpiringBatch(
            medicine_id=m.id, generic_name=m.generic_name, brand_name=m.brand_name,
            batch_id=b.id, batch_number=b.batch_number,
            expiry_date=b.expiry_date, qty_remaining=b.qty_remaining,
        ))
    return results


@router.get("/inventory", response_model=list[InventoryItem])
def inventory_snapshot(db: Session = Depends(get_db)):
    results = []
    for m in db.query(Medicine).filter(Medicine.is_deleted == False).order_by(Medicine.generic_name).all():  # noqa: E712
        results.append(InventoryItem(
            type="medicine", id=m.id,
            name=f"{m.generic_name} ({m.brand_name})",
            stock_qty=m.stock_qty, unit=m.unit, price=m.price,
        ))
    for g in db.query(GroceryItem).filter(GroceryItem.is_deleted == False).order_by(GroceryItem.name).all():  # noqa: E712
        results.append(InventoryItem(
            type="grocery", id=g.id, name=g.name,
            stock_qty=g.stock_qty, unit=g.unit, price=g.price,
        ))
    return results


@router.get("/overall", response_model=OverallReportOut)
def overall_report(
    start_date: str = Query(..., description="YYYY-MM-DD in configured timezone"),
    end_date: str = Query(..., description="YYYY-MM-DD in configured timezone"),
    db: Session = Depends(get_db),
):
    tz_str = _tz_str(db)
    tz = _get_zone(tz_str)
    start_utc, _  = _day_bounds_utc(start_date, tz_str)
    _,         end_utc = _day_bounds_utc(end_date, tz_str)

    all_sales = (
        db.query(Sale)
        .filter(
            Sale.created_at >= start_utc,
            Sale.created_at <= end_utc,
        )
        .order_by(Sale.created_at)
        .all()
    )

    active = [s for s in all_sales if not s.is_void]
    voided = [s for s in all_sales if s.is_void]

    total_revenue = round(sum(s.total_amount for s in active), 2)
    transaction_count = len(active)
    voided_count = len(voided)
    avg_transaction = round(total_revenue / transaction_count, 2) if transaction_count else 0.0
    total_discounted = round(sum(s.discount_amount for s in active), 2)

    # Revenue by day — group by LOCAL date, not UTC date
    daily_map: dict = defaultdict(lambda: {"revenue": 0.0, "count": 0})
    for s in active:
        day = _to_local(s.created_at, tz).strftime("%Y-%m-%d")
        daily_map[day]["revenue"] = round(daily_map[day]["revenue"] + s.total_amount, 2)
        daily_map[day]["count"] += 1
    revenue_by_day = [{"date": d, **v} for d, v in sorted(daily_map.items())]

    pay_map: dict = defaultdict(lambda: {"count": 0, "total": 0.0})
    for s in active:
        method = f"Online ({s.payment_app})" if s.payment_method == "online" and s.payment_app else s.payment_method.title()
        pay_map[method]["count"] += 1
        pay_map[method]["total"] = round(pay_map[method]["total"] + s.total_amount, 2)
    payment_breakdown = [{"method": m, **v} for m, v in sorted(pay_map.items(), key=lambda x: -x[1]["total"])]

    disc_map: dict = defaultdict(lambda: {"count": 0, "total_discount": 0.0})
    for s in active:
        if s.discount_amount > 0:
            name = s.discount_type.name if s.discount_type else "Custom"
            disc_map[name]["count"] += 1
            disc_map[name]["total_discount"] = round(disc_map[name]["total_discount"] + s.discount_amount, 2)
    discount_breakdown = [{"name": n, **v} for n, v in sorted(disc_map.items(), key=lambda x: -x[1]["total_discount"])]

    item_map: dict = {}
    for s in active:
        for si in s.items:
            if si.medicine_id and si.medicine:
                key = f"medicine:{si.medicine_id}"
                label = f"{si.medicine.generic_name} ({si.medicine.brand_name})"
                itype = "medicine"
            elif si.grocery_item_id and si.grocery_item:
                key = f"grocery:{si.grocery_item_id}"
                label = si.grocery_item.name
                itype = "grocery"
            else:
                continue
            if key not in item_map:
                item_map[key] = {"name": label, "type": itype, "qty": 0, "revenue": 0.0}
            item_map[key]["qty"] += si.quantity
            item_map[key]["revenue"] = round(item_map[key]["revenue"] + si.subtotal, 2)
    top_items = sorted(item_map.values(), key=lambda x: x["qty"], reverse=True)[:15]

    return OverallReportOut(
        start_date=start_date,
        end_date=end_date,
        total_revenue=total_revenue,
        transaction_count=transaction_count,
        voided_count=voided_count,
        avg_transaction=avg_transaction,
        total_discounted=total_discounted,
        revenue_by_day=revenue_by_day,
        payment_breakdown=payment_breakdown,
        discount_breakdown=discount_breakdown,
        top_items=top_items,
    )


@router.get("/sales-csv")
def sales_csv_export(
    start_date: str = Query(..., description="YYYY-MM-DD in configured timezone"),
    end_date: str = Query(..., description="YYYY-MM-DD in configured timezone"),
    db: Session = Depends(get_db),
):
    tz_str = _tz_str(db)
    tz = _get_zone(tz_str)
    start_utc, _  = _day_bounds_utc(start_date, tz_str)
    _,         end_utc = _day_bounds_utc(end_date, tz_str)

    sales = (
        db.query(Sale)
        .filter(
            Sale.created_at >= start_utc,
            Sale.created_at <= end_utc,
        )
        .order_by(Sale.created_at)
        .all()
    )

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([
        "Sale ID", "Date", "Time",
        "Item Type", "Item Name", "Qty", "Unit Price", "Item Subtotal",
        "Sale Subtotal", "Discount Type", "Discount %", "Discount Amount",
        "Total Amount", "Payment Method", "Payment App", "Reference",
        "Voided", "Void Reason", "Note",
    ])

    for s in sales:
        local_dt = _to_local(s.created_at, tz)
        row_date = local_dt.strftime("%Y-%m-%d")
        row_time = local_dt.strftime("%H:%M:%S")

        disc_name = s.discount_type.name if s.discount_type else ("Custom" if s.discount_amount > 0 else "")
        disc_pct = ""
        if s.discount_type:
            disc_pct = s.discount_type.percent
        elif s.discount_amount > 0 and s.subtotal > 0:
            disc_pct = round(s.discount_amount / s.subtotal * 100, 2)

        rows = s.items if s.items else [None]
        for si in rows:
            if si and si.medicine_id and si.medicine:
                item_type = "Medicine"
                item_name = f"{si.medicine.generic_name} ({si.medicine.brand_name})"
                qty, unit_price, item_sub = si.quantity, si.unit_price, si.subtotal
            elif si and si.grocery_item_id and si.grocery_item:
                item_type = "Grocery"
                item_name = si.grocery_item.name
                qty, unit_price, item_sub = si.quantity, si.unit_price, si.subtotal
            else:
                item_type = item_name = qty = unit_price = item_sub = ""

            w.writerow([
                s.id, row_date, row_time,
                item_type, item_name, qty, unit_price, item_sub,
                s.subtotal, disc_name, disc_pct, s.discount_amount,
                s.total_amount, s.payment_method,
                s.payment_app or "", s.payment_ref or "",
                "Yes" if s.is_void else "No", s.void_reason or "", s.note or "",
            ])

    filename = f"sales_{start_date}_to_{end_date}.csv"
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/dashboard")
def dashboard_summary(
    range: str = Query("today", description="today | week | month"),
    db: Session = Depends(get_db),
):
    tz_str = _tz_str(db)
    tz = _get_zone(tz_str)
    today = date.fromisoformat(_now_local(tz_str))

    if range == "week":
        start = today - timedelta(days=today.weekday())  # Monday of current week
    elif range == "month":
        start = today.replace(day=1)
    else:
        start = today
    end = today

    start_utc, _ = _day_bounds_utc(start.isoformat(), tz_str)
    _, end_utc = _day_bounds_utc(end.isoformat(), tz_str)

    sales = (
        db.query(Sale)
        .filter(
            Sale.created_at >= start_utc,
            Sale.created_at <= end_utc,
            Sale.is_void == False,  # noqa: E712
        )
        .all()
    )

    total_revenue = round(sum(s.total_amount for s in sales), 2)
    transaction_count = len(sales)
    avg_transaction = round(total_revenue / transaction_count, 2) if transaction_count else 0.0

    items_sold = 0
    med_revenue = 0.0
    groc_revenue = 0.0
    item_map: dict = {}

    for s in sales:
        for si in s.items:
            items_sold += si.quantity
            if si.medicine_id and si.medicine:
                med_revenue += si.subtotal
                key = f"medicine:{si.medicine_id}"
                label = f"{si.medicine.generic_name} ({si.medicine.brand_name})"
                itype = "medicine"
            elif si.grocery_item_id and si.grocery_item:
                groc_revenue += si.subtotal
                key = f"grocery:{si.grocery_item_id}"
                label = si.grocery_item.name
                itype = "grocery"
            else:
                continue
            if key not in item_map:
                item_map[key] = {"name": label, "type": itype, "qty": 0, "revenue": 0.0}
            item_map[key]["qty"] += si.quantity
            item_map[key]["revenue"] = round(item_map[key]["revenue"] + si.subtotal, 2)

    top_items = sorted(item_map.values(), key=lambda x: x["qty"], reverse=True)[:10]

    daily_map: dict = defaultdict(lambda: {"revenue": 0.0, "count": 0})
    for s in sales:
        day = _to_local(s.created_at, tz).strftime("%Y-%m-%d")
        daily_map[day]["revenue"] = round(daily_map[day]["revenue"] + s.total_amount, 2)
        daily_map[day]["count"] += 1
    revenue_by_day = [{"date": d, **v} for d, v in sorted(daily_map.items())]

    disc_map: dict = defaultdict(lambda: {"count": 0, "total_discount": 0.0})
    for s in sales:
        if s.discount_amount > 0:
            name = s.discount_type.name if s.discount_type else "Custom"
            disc_map[name]["count"] += 1
            disc_map[name]["total_discount"] = round(disc_map[name]["total_discount"] + s.discount_amount, 2)
    discount_breakdown = [
        {"name": n, **v}
        for n, v in sorted(disc_map.items(), key=lambda x: -x[1]["total_discount"])
    ]

    med_low = db.query(func.count()).select_from(Medicine).filter(
        Medicine.is_deleted == False,  # noqa: E712
        Medicine.stock_qty <= Medicine.reorder_level,
    ).scalar() or 0
    groc_low = db.query(func.count()).select_from(GroceryItem).filter(
        GroceryItem.is_deleted == False,  # noqa: E712
        GroceryItem.stock_qty <= GroceryItem.reorder_level,
    ).scalar() or 0

    return {
        "range": range,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "total_revenue": total_revenue,
        "transaction_count": transaction_count,
        "items_sold": items_sold,
        "avg_transaction": avg_transaction,
        "medicine_revenue": round(med_revenue, 2),
        "grocery_revenue": round(groc_revenue, 2),
        "revenue_by_day": revenue_by_day,
        "top_items": top_items,
        "discount_breakdown": discount_breakdown,
        "low_stock_count": med_low + groc_low,
    }
