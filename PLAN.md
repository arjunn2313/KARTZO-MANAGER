# Kartzo Business Manager — Build Plan

Web app to replace the Excel sheets used to run Kartzo (car rear view mirrors + glass wipers, sold over WhatsApp, shipped mainly by India Post, sometimes Delhivery / DTDC).

**Core principle:** an order is entered once. Dashboard counts, profit, stock and COD balances are all calculated from orders, never typed again.

Single user for now (the owner). More users/features later.

---

## 1. Tech stack

- **Next.js** (App Router) + **TypeScript** + **Tailwind CSS**
- **Supabase**: Postgres database + Auth (`@supabase/ssr`)
- **zod** for form validation
- Deploy on **Vercel** (free tier)
- Dev machine: **Windows + PowerShell** — give all terminal commands in PowerShell syntax
- Must work well on a phone (mobile-first tables/cards)
- All dates in **Asia/Kolkata (IST)**. Currency is ₹, whole rupees.

---

## 2. Database schema (Phase 1)

```sql
-- Products
create table products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,            -- 'Rear View Mirror', 'Glass Wiper'
  price_paid  int  not null,            -- 449 / 299
  price_cod   int  not null,            -- 499 / 299
  cost        int  not null,            -- 140 / 67
  active      boolean not null default true,
  created_at  timestamptz default now()
);

-- Couriers
create table couriers (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null unique,   -- 'India Post', 'Delhivery', 'DTDC'
  default_shipping_cost  int not null,           -- India Post: 37
  default_rto_charge     int not null default 0, -- India Post: 0 (loses only shipping)
  active                 boolean not null default true
);

-- Orders (core table)
create sequence order_number_seq start 1904;  -- set to last sheet order number + 1 at import time

create table orders (
  id             uuid primary key default gen_random_uuid(),
  order_code     text not null unique default ('KZT' || nextval('order_number_seq')),
  order_date     date not null default (now() at time zone 'Asia/Kolkata')::date,
  dispatch_date  date,
  customer_name  text not null,
  phone          text,                 -- 10 digits, validated in UI
  address        text,
  pincode        text,                 -- 6 digits, validated in UI
  product_id     uuid not null references products(id),
  qty            int  not null default 1,
  order_type     text not null default 'normal'  check (order_type in ('normal','replacement')),
  payment_mode   text not null                   check (payment_mode in ('paid','cod')),
  order_value    int  not null default 0,        -- 0 for replacements
  advance_paid   int  not null default 0,
  cod_balance    int  generated always as (order_value - advance_paid) stored,
  -- snapshot values copied at order time (changing product/courier later must NOT change old orders)
  product_cost   int  not null,
  shipping_cost  int  not null,
  rto_charge     int  not null default 0,
  courier_id     uuid references couriers(id),
  tracking_id    text unique,
  status         text not null default 'new'
                 check (status in ('new','dispatched','delivered','rto','cancelled')),
  profit         int generated always as (
                   case status
                     when 'rto'       then -(shipping_cost + rto_charge)
                     when 'cancelled' then 0
                     else order_value - (product_cost * qty) - shipping_cost
                   end) stored,
  remittance_id  uuid,                 -- used in Phase 3
  notes          text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create index on orders (order_date);
create index on orders (status);

-- Daily manual inputs (ad spend + staff pay, typed by hand each day)
create table daily_inputs (
  date                date primary key,
  ad_spend            int not null default 0,
  staff_orders_taken  int,
  staff_amount        int not null default 0,   -- entered manually, NOT calculated
  staff_paid          boolean not null default false,
  staff_paid_date     date,
  notes               text
);
```

### Seed data
- Products: Rear View Mirror (paid 449, COD 499, cost 140), Glass Wiper (paid 299, COD 299, cost 67)
- Couriers: India Post (shipping 37, RTO 0), Delhivery (placeholder, owner edits), DTDC (placeholder, owner edits)

### Security
- Supabase Auth, email + password, **sign-ups disabled** (single owner account).
- Enable RLS on every table; policy: only `authenticated` users can select/insert/update/delete.

---

## 3. Business rules

- **Price prefill:** choosing product + payment mode fills `order_value` (paid → `price_paid`, COD → `price_cod`) and `product_cost`. Choosing courier fills `shipping_cost` and `rto_charge`. All editable before save.
- **Paid orders:** `advance_paid` defaults to `order_value`, so `cod_balance` = 0.
- **Replacement orders:** `order_value` = 0, `advance_paid` = 0 → profit = −(product cost + shipping).
- **RTO:** loss = shipping + courier RTO charge (India Post = ₹37 only; Delhivery/DTDC add their RTO charge). Product goes back to stock (Phase 2).
- **Dispatch:** setting status to `dispatched` sets `dispatch_date` to today if empty.
- **Staff pay:** entered manually per day in `daily_inputs.staff_amount`. Never auto-calculated. The UI may show "N dispatched today" as a hint only.

### Dashboard calculations (per day, by `order_date`)
| Metric | Formula |
|---|---|
| Orders | count, excluding `cancelled` |
| Mirrors / Wipers | sum of `qty` per product, excluding `cancelled`, `rto` |
| Sales | sum `order_value`, excluding `cancelled`, `rto` |
| Gross profit | sum `profit` (all statuses) |
| RTO loss | sum `profit` where status = `rto` |
| Ad spend | `daily_inputs.ad_spend` |
| Staff | `daily_inputs.staff_amount` |
| Profit after ads | gross profit − ad spend |
| **Net profit** | gross profit − ad spend − staff |

---

## 4. Phase 1 screens

### Login
Email + password only.

### Orders (`/orders`)
- Table with columns like the existing sheet: Order ID, Tracking, Date, Customer, Phone, Product, Payment, Value, Advance, COD Balance, Courier, Status, Profit.
- Filters: date range, status, payment mode, courier, product; search by name / phone / tracking / order ID.
- Colour-coded status pills (Delivered green, RTO red, etc.).
- Inline status change per row.
- **Bulk actions:** tick rows → Mark Dispatched / Mark Delivered / Mark RTO.
- Bulk tracking entry: paste a list of tracking IDs to assign to selected orders in order.
- On mobile: cards instead of wide table.

### Add orders (`/orders/new`)
- **Paste mode:** paste text from the "Kartzo Orders" WhatsApp group. Client-side parser (no paid AI API) reads `Paid` / `COD` / `REPLACEMENT` headers above each order block and extracts name, phone, address, PIN, product.
- Preview table of parsed rows with live validation (10-digit phone, 6-digit PIN), editable before saving. Save all in one go.
- **Single mode:** normal form for one order.

### Order detail / edit (`/orders/[id]`)
All fields editable; profit and COD balance shown read-only.

### Dashboard (`/`)
- Date range picker (Today / This week / This month / Custom).
- Summary cards: Sales, Orders, Mirrors, Wipers, Gross profit, Ad spend, Staff, RTO loss, **Net profit**.
- Daily table (like the current "KARTZO DASHBOARD" sheet): Date, Mirrors, Wipers, Sales, Gross profit, **Ad spend (input)**, **Staff amount (input)**, Profit after ads, Net profit. Inputs save on blur to `daily_inputs`.

### Settings (`/settings`)
Manage products (prices, cost, active) and couriers (shipping cost, RTO charge).

### Import (`/import`)
One-time CSV import of the existing orders sheet. Column mapping:
`ORDER ID → order_code, Tracking → tracking_id, Date (DD-MM-YYYY) → order_date, Customer Name, Phone, Product (match by name), Payment Mode (PAID → paid, FULL COD → cod), Order Value, Advance Paid, Product Cost, Shipping Cost, Status (Delivered → delivered, RTO → rto)`.
Show a preview with errors before inserting. After import, reset `order_number_seq` to max imported number + 1.

---

## 5. Later phases (design already accounted for)

### Phase 2 — Stock + Staff payouts
- `stock_in (id, product_id, date, qty, note)`
- Current stock = sum(stock_in) − sum(qty of orders with status `dispatched`/`delivered`). RTO orders are not deducted (item returned).
- Low-stock warning on dashboard.
- Staff page: group `daily_inputs` into weekly payouts with total and a "Mark paid" button.

### Phase 3 — Cash book + COD remittance
- `cash_entries (id, date, type debit|credit, category, amount, note)`
  - Debit categories: shipping wallet, post office / DTDC, ads wallet, vendor paid, bulk stock, other expenses
  - Credit categories: COD remittance, advance credited (advance can be auto-derived from orders)
- `cod_remittances (id, date, courier_id, amount, note)`
- Upload remittance tracking-number list → matching orders get `remittance_id`. Show mismatches (unknown tracking, amount difference).
- "COD pending" = sum `cod_balance` of delivered COD orders with no `remittance_id`.

### Phase 4 — Built-in dispatch tools
- Merge the Kartzo Shipping Label Generator into Orders (select orders → print India Post labels PDF).
- One-tap WhatsApp dispatch message per customer with tracking ID (`wa.me` link with prefilled text).

---

## 6. Suggested folder structure

```
app/
  (auth)/login/page.tsx
  (app)/page.tsx                 -- dashboard
  (app)/orders/page.tsx
  (app)/orders/new/page.tsx
  (app)/orders/[id]/page.tsx
  (app)/settings/page.tsx
  (app)/import/page.tsx
  layout.tsx
components/
lib/
  supabase/ (client.ts, server.ts, middleware.ts)
  parser/whatsapp.ts             -- WhatsApp order text parser
  calc.ts                        -- dashboard aggregations
  validation.ts                  -- zod schemas, phone/PIN rules
supabase/
  migrations/001_init.sql
  seed.sql
```

---

## 7. Phase 1 build order (for Claude Code)

1. Create Next.js + TypeScript + Tailwind project; install `@supabase/supabase-js`, `@supabase/ssr`, `zod`.
2. Write `supabase/migrations/001_init.sql` and `seed.sql` from section 2; apply in Supabase.
3. Supabase auth + middleware protecting all `(app)` routes; login page.
4. Settings page (products, couriers) — simplest CRUD, proves the DB wiring.
5. Single-order form with price prefill rules.
6. Orders list with filters, status pills, inline + bulk status updates.
7. WhatsApp paste parser + preview + bulk save.
8. Dashboard: summary cards + daily table with ad spend / staff inputs.
9. CSV import of existing sheet.
10. Mobile layout pass; deploy to Vercel.

Build one step at a time and confirm it works before moving to the next.
