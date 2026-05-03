from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database import get_db
from models import ItemAuditLog
from schemas import AuditLogOut

router = APIRouter(tags=["audit"])


def _query_log(db: Session, item_type: str | None, item_id: int | None,
               action: str | None, date: str | None, limit: int, offset: int):
    q = db.query(ItemAuditLog)
    if item_type:
        q = q.filter(ItemAuditLog.item_type == item_type)
    if item_id:
        q = q.filter(ItemAuditLog.item_id == item_id)
    if action:
        q = q.filter(ItemAuditLog.action == action)
    if date:
        q = q.filter(ItemAuditLog.changed_at.startswith(date))
    return q.order_by(desc(ItemAuditLog.changed_at)).offset(offset).limit(limit).all()


@router.get("/audit-log", response_model=list[AuditLogOut])
def get_audit_log(
    item_type: str | None = Query(None),
    item_id: int | None = Query(None),
    action: str | None = Query(None),
    date: str | None = Query(None, description="YYYY-MM-DD"),
    limit: int = Query(200, le=1000),
    offset: int = Query(0),
    db: Session = Depends(get_db),
):
    return _query_log(db, item_type, item_id, action, date, limit, offset)


@router.get("/medicines/{medicine_id}/history", response_model=list[AuditLogOut])
def medicine_history(medicine_id: int, db: Session = Depends(get_db)):
    return _query_log(db, "medicine", medicine_id, None, None, 500, 0)


@router.get("/grocery-items/{item_id}/history", response_model=list[AuditLogOut])
def grocery_history(item_id: int, db: Session = Depends(get_db)):
    return _query_log(db, "grocery", item_id, None, None, 500, 0)
