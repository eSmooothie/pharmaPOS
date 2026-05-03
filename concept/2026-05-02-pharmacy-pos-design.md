# Pharmacy POS System — Design Spec

**Date:** 2026-05-02
**Status:** Approved

---

## Overview

A locally-hosted web-based Point of Sale system for a single small pharmacy with an attached convenience store (1–5 staff). Covers OTC medicine sales, grocery/convenience item sales, inventory management, and basic reporting. Supports mixed transactions (medicines + groceries in one cart), discount types (Senior Citizen, PWD, etc.), and medicine batch/expiry tracking. No prescription tracking, no cloud dependency.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | React (Vite) | SPA for snappy UX, component reuse across screens |
| Backend | FastAPI (Python) | Fast to build, auto-generates Swagger docs at `/docs` |
| Database | SQLite | Single file (`pharmacy.db`), zero server config, perfect for single-location |
| Communication | REST (JSON) | Standard, easy to test via Swagger UI |

### Running locally

```
# Development
uvicorn main:app --reload      # backend  → http://localhost:8000
npm run dev                    # frontend → http://localhost:5173

# Production (FastAPI serves built React files)
npm run build
uvicorn main:app               # everything → http://localhost:8000
```

---

## Architecture

```
React SPA  ⇄  FastAPI REST API  ⇄  SQLite (pharmacy.db)
```

- The React frontend calls FastAPI endpoints for all data operations.
- FastAPI handles business logic: stock decrement on sale, low-stock detection, report aggregation.
- SQLite lives on the same machine as the server. No separate DB process needed.

---

## Data Model

### `drug_classes`
Therapeutic categories for grouping and filtering medicines.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | Primary key |
| name | TEXT | e.g. Analgesics, Antibiotics, Vitamins, Antihypertensives |

### `medicines`
Core medicine catalog. Replaces a generic "products" table.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | Primary key |
| generic_name | TEXT | Searchable — e.g. "Paracetamol" |
| brand_name | TEXT | Searchable — e.g. "Biogesic", "Tylenol" |
| manufacturer | TEXT | Supplier/brand owner |
| drug_class_id | INTEGER | FK → drug_classes |
| dosage_form | TEXT | tablet / capsule / syrup / cream / injection / drops / powder |
| strength | TEXT | e.g. "500mg", "250mg/5ml", "1%" |
| unit | TEXT | Dispensing unit — e.g. "tablet", "bottle", "tube" |
| price | REAL | Current selling price |
| stock_qty | INTEGER | Maintained directly — incremented on batch receive, decremented on sale |
| reorder_level | INTEGER | Triggers low-stock alert when stock_qty ≤ this value |
| barcode | TEXT | Optional — supports barcode scanner lookup |
| description | TEXT | Optional usage notes |

### `medicine_batches`
Tracks individual stock batches per medicine for expiry management.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | Primary key |
| medicine_id | INTEGER | FK → medicines |
| batch_number | TEXT | Supplier batch/lot number |
| expiry_date | DATE | Used for expiry alerts |
| qty_received | INTEGER | Original quantity received |
| qty_remaining | INTEGER | Decremented as items are sold |
| received_at | DATETIME | When this batch was added to stock |

### `discount_types`
Configurable discount rules. Pre-seeded with legally mandated PH discounts and common store policies.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | Primary key |
| name | TEXT | e.g. Senior Citizen, PWD, Employee, Promo |
| percent | REAL | Discount percentage, e.g. 20.0 |
| is_vat_exempt | BOOLEAN | TRUE for Senior Citizen (RA 9994) and PWD (RA 10754) |

**Seed data:**

| Name | Percent | VAT Exempt | Basis |
|---|---|---|---|
| Senior Citizen | 20% | Yes | RA 9994 |
| PWD | 20% | Yes | RA 10754 |
| Employee | 10% | No | Store policy |
| Promo | set per record | No | Store policy |

### `grocery_categories`
Categories for convenience store items.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | Primary key |
| name | TEXT | e.g. Snacks, Beverages, Personal Care, Household, Dairy, Canned Goods |

### `grocery_items`
Convenience store catalog. Separate from medicines — different attributes, no batch/expiry tracking.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | Primary key |
| name | TEXT | Searchable |
| brand | TEXT | Searchable |
| category_id | INTEGER | FK → grocery_categories |
| unit | TEXT | piece / bottle / pack / kg |
| price | REAL | Current selling price |
| stock_qty | INTEGER | Decremented on sale, incremented on restock |
| reorder_level | INTEGER | Triggers low-stock alert |
| barcode | TEXT | Optional |
| description | TEXT | Optional |

### `sales`
Each completed sale transaction.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | Primary key |
| created_at | DATETIME | Timestamp of sale |
| subtotal | REAL | Sum of all sale_items subtotals before discount |
| discount_type_id | INTEGER | FK → discount_types (nullable — no discount if NULL) |
| discount_amount | REAL | Snapshotted discount value at time of sale — 0.0 if no discount applied |
| total_amount | REAL | subtotal − discount_amount (what the customer pays) |
| payment_method | TEXT | cash / card / other |
| note | TEXT | Optional free-text note |
| is_void | BOOLEAN | Default FALSE — set TRUE when sale is cancelled |
| voided_at | DATETIME | Timestamp of void action (nullable) |
| void_reason | TEXT | Optional reason for voiding |

### `item_audit_log`
Append-only record of every meaningful change to medicines and grocery items.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | Primary key |
| item_type | TEXT | `medicine` or `grocery` |
| item_id | INTEGER | References `medicines.id` or `grocery_items.id` |
| action | TEXT | `created` / `updated` / `restocked` / `sold` / `adjusted` / `voided` / `deleted` |
| field_name | TEXT | Which field changed — e.g. `brand_name`, `price`, `stock_qty` (NULL for `created` / `deleted`) |
| old_value | TEXT | Value before change (NULL for `created`) |
| new_value | TEXT | Value after change (NULL for `deleted`) |
| ref_sale_id | INTEGER | FK → sales (nullable — set for `sold` and `voided` actions) |
| note | TEXT | Optional context — e.g. batch number on restock |
| changed_at | DATETIME | Timestamp |

**What gets logged automatically:**
- `created` — item first added to the catalog
- `updated` — one row per field changed (e.g. price change: `field_name=price, old=5.00, new=7.00`)
- `restocked` — batch received (medicine) or stock incremented (grocery); logs `stock_qty` old → new
- `sold` — sale completion decrements stock; `ref_sale_id` links to the transaction
- `voided` — sale void restores stock; `ref_sale_id` links to the voided transaction
- `adjusted` — manual stock correction (e.g. damaged goods written off)
- `deleted` — item removed from catalog

---

### `sale_items`
Line items within a sale. Supports mixed medicine + grocery carts. Price is snapshotted at time of sale.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | Primary key |
| sale_id | INTEGER | FK → sales |
| medicine_id | INTEGER | FK → medicines (nullable) |
| grocery_item_id | INTEGER | FK → grocery_items (nullable) |
| quantity | INTEGER | Units sold |
| unit_price | REAL | Snapshotted price at time of sale |
| subtotal | REAL | quantity × unit_price |

**Key invariants:**
- Exactly one of `medicine_id` or `grocery_item_id` is set per row — never both, never neither.
- `unit_price` is copied from the item's current price at checkout — historical sales stay accurate after price changes.
- `medicines.stock_qty` decrements on sale, increments on batch receive. `medicine_batches.qty_remaining` also decrements FIFO (earliest expiry first).
- `grocery_items.stock_qty` decrements on sale, increments on restock.
- Low-stock alert fires when `stock_qty <= reorder_level` for both medicines and grocery items.
- `discount_amount` = `subtotal × (discount_types.percent / 100)`, computed and snapshotted at checkout. VAT-exempt calculation (for Senior/PWD) is handled in the backend before applying the percentage.
- Voiding a sale (`is_void = TRUE`) restores stock for all its `sale_items`: medicine batch `qty_remaining` is incremented FIFO-reversed and `medicines.stock_qty` is incremented; `grocery_items.stock_qty` is incremented. A voided sale cannot be voided again.
- Voided sales are excluded from all revenue and top-selling aggregations in reports but remain in the sales list with their `is_void` flag visible for audit purposes.

---

## Screens & Features

### 1. Sales (Checkout)
The primary counter screen.

- **Unified search:** Live search across medicines (`generic_name`, `brand_name`, `barcode`) and grocery items (`name`, `brand`, `barcode`) simultaneously. Results are labeled by type.
- **Cart:** Mixed medicine + grocery items in one cart. Adjust quantity, remove items, shows running subtotal.
- **Discount:** Optional — cashier selects a discount type (Senior Citizen, PWD, etc.) before completing. Discount amount and final total are shown clearly.
- **Payment:** Select Cash or Card. "Complete Sale" finalizes the transaction, decrements stock for all items, saves sale + sale_items.
- **Receipt:** On-screen receipt summary after completion showing itemized list, discount applied, and total paid.

Past sales (accessible from the sales list) can be voided via a "Void Sale" button. Voiding prompts for an optional reason, restores stock immediately, and marks the record with a VOID label. Voided sales remain visible in the list for audit purposes but are excluded from revenue totals.

### 2. Medicine Inventory
Medicine catalog management.

- **List view:** All medicines filterable by drug class and dosage form. Columns: name, brand, drug class, form, strength, price, stock qty.
- **Add / Edit medicine:** Form covering all medicine fields.
- **Receive stock:** Add a new batch (batch number, expiry date, quantity) — increments `stock_qty`.
- **View batches:** All batches per medicine with expiry dates and remaining quantities.

### 3. Grocery Inventory
Convenience store catalog management.

- **List view:** All grocery items filterable by category. Columns: name, brand, category, unit, price, stock qty.
- **Add / Edit item:** Form covering all grocery item fields.
- **Restock:** Increment `stock_qty` directly (no batch tracking for groceries).

### 4. Low Stock
Single view combining medicines and grocery items both at or below their `reorder_level`. Each row links to its respective inventory screen to restock.

### 5. Reports
- **Daily sales summary:** Total revenue, number of transactions, discount breakdown (how much was discounted and by which type), top-selling items for a selected date.
- **Expiring batches:** Medicine batches with `expiry_date` within the next 30/60/90 days.
- **Inventory snapshot:** Current stock levels for all medicines and grocery items.

---

## API Endpoints (summary)

| Method | Path | Description |
|---|---|---|
| GET | /medicines | List/search medicines |
| POST | /medicines | Add new medicine |
| PUT | /medicines/{id} | Update medicine |
| DELETE | /medicines/{id} | Remove medicine (only if no sale history) |
| GET | /medicines/{id}/batches | List batches for a medicine |
| POST | /medicines/{id}/batches | Add stock batch |
| GET | /drug-classes | List all drug classes |
| GET | /grocery-items | List/search grocery items |
| POST | /grocery-items | Add new grocery item |
| PUT | /grocery-items/{id} | Update grocery item |
| DELETE | /grocery-items/{id} | Remove grocery item (only if no sale history) |
| POST | /grocery-items/{id}/restock | Increment stock_qty |
| GET | /grocery-categories | List all grocery categories |
| GET | /discount-types | List all discount types |
| POST | /discount-types | Add new discount type |
| PUT | /discount-types/{id} | Update discount type |
| GET | /search | Unified search across medicines + grocery items |
| GET | /audit-log | Full audit log (filterable by item_type, item_id, action, date range) |
| GET | /medicines/{id}/history | Audit log entries for a specific medicine |
| GET | /grocery-items/{id}/history | Audit log entries for a specific grocery item |
| POST | /sales | Create sale (decrements stock, applies discount) |
| GET | /sales | List sales (filterable by date, supports is_void filter) |
| POST | /sales/{id}/void | Void a sale (restores stock, sets is_void flag) |
| GET | /reports/daily | Daily sales summary with discount breakdown |
| GET | /reports/low-stock | All items (medicines + groceries) at or below reorder level |
| GET | /reports/expiring | Medicine batches expiring within N days |
| GET | /reports/inventory | Full inventory snapshot |

---

## Project Structure

```
pos_system/
├── backend/
│   ├── main.py            # FastAPI app entry point
│   ├── database.py        # SQLite connection + table creation
│   ├── models.py          # SQLAlchemy models (ORM)
│   ├── routers/
│   │   ├── medicines.py
│   │   ├── grocery.py
│   │   ├── sales.py
│   │   ├── discounts.py
│   │   ├── audit.py
│   │   └── reports.py
│   └── pharmacy.db        # SQLite database file
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Sales.jsx
│   │   │   ├── MedicineInventory.jsx
│   │   │   ├── GroceryInventory.jsx
│   │   │   ├── LowStock.jsx
│   │   │   └── Reports.jsx
│   │   ├── components/    # Shared UI components
│   │   └── App.jsx        # Router + sidebar nav
│   └── package.json
└── concept/               # Design docs (this folder)
```
