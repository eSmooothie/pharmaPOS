from datetime import datetime
from pydantic import BaseModel, model_validator


# ── Drug Classes ──────────────────────────────────────────────────────────────

class DrugClassOut(BaseModel):
    id: int
    name: str
    model_config = {"from_attributes": True}


class DrugClassCreate(BaseModel):
    name: str


# ── Medicines ─────────────────────────────────────────────────────────────────

class MedicineCreate(BaseModel):
    generic_name: str
    brand_name: str
    manufacturer: str | None = None
    drug_class_id: int | None = None
    dosage_form: str | None = None
    strength: str | None = None
    unit: str = "tablet"
    price: float
    reorder_level: int = 10
    barcode: str | None = None
    description: str | None = None


class MedicineUpdate(BaseModel):
    generic_name: str | None = None
    brand_name: str | None = None
    manufacturer: str | None = None
    drug_class_id: int | None = None
    dosage_form: str | None = None
    strength: str | None = None
    unit: str | None = None
    price: float | None = None
    reorder_level: int | None = None
    barcode: str | None = None
    description: str | None = None


class MedicineOut(BaseModel):
    id: int
    generic_name: str
    brand_name: str
    manufacturer: str | None
    drug_class_id: int | None
    drug_class_name: str | None = None
    dosage_form: str | None
    strength: str | None
    unit: str
    price: float
    stock_qty: int
    reorder_level: int
    barcode: str | None
    description: str | None
    is_deleted: bool = False
    model_config = {"from_attributes": True}


# ── Medicine Batches ──────────────────────────────────────────────────────────

class BatchCreate(BaseModel):
    batch_number: str | None = None
    expiry_date: str | None = None  # ISO date string e.g. "2026-12-31"
    qty_received: int


class BatchOut(BaseModel):
    id: int
    medicine_id: int
    batch_number: str | None
    expiry_date: str | None
    qty_received: int
    qty_remaining: int
    received_at: datetime
    model_config = {"from_attributes": True}


# ── Discount Types ────────────────────────────────────────────────────────────

class DiscountTypeCreate(BaseModel):
    name: str
    percent: float
    is_vat_exempt: bool = False


class DiscountTypeUpdate(BaseModel):
    name: str | None = None
    percent: float | None = None
    is_vat_exempt: bool | None = None


class DiscountTypeOut(BaseModel):
    id: int
    name: str
    percent: float
    is_vat_exempt: bool
    model_config = {"from_attributes": True}


# ── Grocery Categories ────────────────────────────────────────────────────────

class GroceryCategoryOut(BaseModel):
    id: int
    name: str
    model_config = {"from_attributes": True}


class GroceryCategoryCreate(BaseModel):
    name: str


# ── Grocery Items ─────────────────────────────────────────────────────────────

class GroceryItemCreate(BaseModel):
    name: str
    brand: str | None = None
    category_id: int | None = None
    unit: str = "piece"
    price: float
    reorder_level: int = 5
    barcode: str | None = None
    description: str | None = None


class GroceryItemUpdate(BaseModel):
    name: str | None = None
    brand: str | None = None
    category_id: int | None = None
    unit: str | None = None
    price: float | None = None
    reorder_level: int | None = None
    barcode: str | None = None
    description: str | None = None


class GroceryItemOut(BaseModel):
    id: int
    name: str
    brand: str | None
    category_id: int | None
    category_name: str | None = None
    unit: str
    price: float
    stock_qty: int
    reorder_level: int
    barcode: str | None
    description: str | None
    is_deleted: bool = False
    model_config = {"from_attributes": True}


class RestockRequest(BaseModel):
    qty: int


# ── Sales ─────────────────────────────────────────────────────────────────────

class SaleItemIn(BaseModel):
    medicine_id: int | None = None
    grocery_item_id: int | None = None
    quantity: int

    @model_validator(mode="after")
    def exactly_one_item(self) -> "SaleItemIn":
        has_med = self.medicine_id is not None
        has_groc = self.grocery_item_id is not None
        if has_med == has_groc:  # both set or neither set
            raise ValueError("Exactly one of medicine_id or grocery_item_id must be set")
        return self


class SaleCreate(BaseModel):
    items: list[SaleItemIn]
    discount_type_id: int | None = None
    custom_discount_percent: float | None = None  # used when no preset discount type is selected
    payment_method: str = "cash"
    payment_app: str | None = None   # required when payment_method == "online"
    payment_ref: str | None = None   # required when payment_method == "online"
    note: str | None = None

    @model_validator(mode="after")
    def check_online_payment(self) -> "SaleCreate":
        if self.payment_method == "online":
            if not self.payment_app:
                raise ValueError("payment_app is required for online payment")
            if not self.payment_ref:
                raise ValueError("payment_ref is required for online payment")
        return self


class VoidRequest(BaseModel):
    reason: str | None = None


class SaleItemOut(BaseModel):
    id: int
    sale_id: int
    medicine_id: int | None
    grocery_item_id: int | None
    quantity: int
    unit_price: float
    subtotal: float
    item_name: str | None = None
    model_config = {"from_attributes": True}


class SaleOut(BaseModel):
    id: int
    created_at: datetime
    subtotal: float
    discount_type_id: int | None
    discount_type_name: str | None = None
    discount_amount: float
    custom_discount_percent: float | None = None  # set when a custom % was used
    total_amount: float
    payment_method: str
    payment_app: str | None = None
    payment_ref: str | None = None
    note: str | None
    is_void: bool
    voided_at: datetime | None
    void_reason: str | None
    items: list[SaleItemOut] = []
    model_config = {"from_attributes": True}


# ── Search ────────────────────────────────────────────────────────────────────

class SearchResult(BaseModel):
    type: str          # "medicine" | "grocery"
    id: int
    name: str
    brand: str | None
    price: float
    stock_qty: int
    unit: str
    extra: str | None = None  # dosage form + strength for medicines


# ── Audit Log ─────────────────────────────────────────────────────────────────

class AuditLogOut(BaseModel):
    id: int
    item_type: str
    item_id: int
    action: str
    field_name: str | None
    old_value: str | None
    new_value: str | None
    ref_sale_id: int | None
    note: str | None
    changed_at: datetime
    model_config = {"from_attributes": True}


# ── Reports ───────────────────────────────────────────────────────────────────

class DailySummaryOut(BaseModel):
    date: str
    total_revenue: float
    transaction_count: int
    discount_breakdown: list[dict]
    top_items: list[dict]


class LowStockItem(BaseModel):
    type: str
    id: int
    name: str
    stock_qty: int
    reorder_level: int


class ExpiringBatch(BaseModel):
    medicine_id: int
    generic_name: str
    brand_name: str
    batch_id: int
    batch_number: str | None
    expiry_date: str
    qty_remaining: int


class InventoryItem(BaseModel):
    type: str
    id: int
    name: str
    stock_qty: int
    unit: str
    price: float


class OverallReportOut(BaseModel):
    start_date: str
    end_date: str
    total_revenue: float
    transaction_count: int
    voided_count: int
    avg_transaction: float
    total_discounted: float
    revenue_by_day: list[dict]
    payment_breakdown: list[dict]
    discount_breakdown: list[dict]
    top_items: list[dict]


# ── Business Info ─────────────────────────────────────────────────────────────

class BusinessInfoUpdate(BaseModel):
    business_name: str | None = None
    address: str | None = None
    tin: str | None = None
    contact: str | None = None


class BusinessInfoOut(BaseModel):
    id: int
    business_name: str | None
    address: str | None
    tin: str | None
    contact: str | None
    model_config = {"from_attributes": True}


# ── System Settings ───────────────────────────────────────────────────────────

class SystemSettingsOut(BaseModel):
    timezone: str
    model_config = {"from_attributes": True}


class SystemSettingsUpdate(BaseModel):
    timezone: str | None = None
