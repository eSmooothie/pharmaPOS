from datetime import datetime
from sqlalchemy import (
    Boolean, DateTime, Float, ForeignKey, Integer, Text, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class DrugClass(Base):
    __tablename__ = "drug_classes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False, unique=True)

    medicines: Mapped[list["Medicine"]] = relationship(back_populates="drug_class")


class Medicine(Base):
    __tablename__ = "medicines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    generic_name: Mapped[str] = mapped_column(Text, nullable=False)
    brand_name: Mapped[str] = mapped_column(Text, nullable=False)
    manufacturer: Mapped[str | None] = mapped_column(Text)
    drug_class_id: Mapped[int | None] = mapped_column(ForeignKey("drug_classes.id"))
    dosage_form: Mapped[str | None] = mapped_column(Text)
    strength: Mapped[str | None] = mapped_column(Text)
    unit: Mapped[str] = mapped_column(Text, nullable=False, default="tablet")
    price: Mapped[float] = mapped_column(Float, nullable=False)
    stock_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reorder_level: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    barcode: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    drug_class: Mapped["DrugClass | None"] = relationship(back_populates="medicines")
    batches: Mapped[list["MedicineBatch"]] = relationship(
        back_populates="medicine", order_by="MedicineBatch.expiry_date"
    )
    sale_items: Mapped[list["SaleItem"]] = relationship(back_populates="medicine")


class MedicineBatch(Base):
    __tablename__ = "medicine_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    medicine_id: Mapped[int] = mapped_column(ForeignKey("medicines.id"), nullable=False)
    batch_number: Mapped[str | None] = mapped_column(Text)
    expiry_date: Mapped[str | None] = mapped_column(Text)  # stored as ISO date string
    qty_received: Mapped[int] = mapped_column(Integer, nullable=False)
    qty_remaining: Mapped[int] = mapped_column(Integer, nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    medicine: Mapped["Medicine"] = relationship(back_populates="batches")


class DiscountType(Base):
    __tablename__ = "discount_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    percent: Mapped[float] = mapped_column(Float, nullable=False)
    is_vat_exempt: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    sales: Mapped[list["Sale"]] = relationship(back_populates="discount_type")


class GroceryCategory(Base):
    __tablename__ = "grocery_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False, unique=True)

    items: Mapped[list["GroceryItem"]] = relationship(back_populates="category")


class GroceryItem(Base):
    __tablename__ = "grocery_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    brand: Mapped[str | None] = mapped_column(Text)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("grocery_categories.id"))
    unit: Mapped[str] = mapped_column(Text, nullable=False, default="piece")
    price: Mapped[float] = mapped_column(Float, nullable=False)
    stock_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reorder_level: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    barcode: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    category: Mapped["GroceryCategory | None"] = relationship(back_populates="items")
    sale_items: Mapped[list["SaleItem"]] = relationship(back_populates="grocery_item")


class Sale(Base):
    __tablename__ = "sales"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    subtotal: Mapped[float] = mapped_column(Float, nullable=False)
    discount_type_id: Mapped[int | None] = mapped_column(ForeignKey("discount_types.id"))
    discount_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_amount: Mapped[float] = mapped_column(Float, nullable=False)
    payment_method: Mapped[str] = mapped_column(Text, nullable=False, default="cash")
    payment_app: Mapped[str | None] = mapped_column(Text)  # e.g. "GCash", "Maya"
    payment_ref: Mapped[str | None] = mapped_column(Text)  # transaction / reference no.
    note: Mapped[str | None] = mapped_column(Text)
    is_void: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime)
    void_reason: Mapped[str | None] = mapped_column(Text)

    discount_type: Mapped["DiscountType | None"] = relationship(back_populates="sales")
    items: Mapped[list["SaleItem"]] = relationship(back_populates="sale")


class SaleItem(Base):
    __tablename__ = "sale_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"), nullable=False)
    medicine_id: Mapped[int | None] = mapped_column(ForeignKey("medicines.id"))
    grocery_item_id: Mapped[int | None] = mapped_column(ForeignKey("grocery_items.id"))
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float] = mapped_column(Float, nullable=False)
    subtotal: Mapped[float] = mapped_column(Float, nullable=False)

    sale: Mapped["Sale"] = relationship(back_populates="items")
    medicine: Mapped["Medicine | None"] = relationship(back_populates="sale_items")
    grocery_item: Mapped["GroceryItem | None"] = relationship(back_populates="sale_items")


class BusinessInfo(Base):
    __tablename__ = "business_info"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)  # always 1
    business_name: Mapped[str | None] = mapped_column(Text)
    address: Mapped[str | None] = mapped_column(Text)
    tin: Mapped[str | None] = mapped_column(Text)
    contact: Mapped[str | None] = mapped_column(Text)


class SystemSettings(Base):
    __tablename__ = "system_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)  # always 1
    timezone: Mapped[str] = mapped_column(Text, nullable=False, default="Asia/Manila")


class ItemAuditLog(Base):
    __tablename__ = "item_audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    item_type: Mapped[str] = mapped_column(Text, nullable=False)   # "medicine" | "grocery"
    item_id: Mapped[int] = mapped_column(Integer, nullable=False)
    action: Mapped[str] = mapped_column(Text, nullable=False)       # created/updated/restocked/sold/adjusted/voided/deleted
    field_name: Mapped[str | None] = mapped_column(Text)
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    ref_sale_id: Mapped[int | None] = mapped_column(ForeignKey("sales.id"))
    note: Mapped[str | None] = mapped_column(Text)
    changed_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
