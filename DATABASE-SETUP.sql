-- KARTZO: copy EVERYTHING in this file, paste into Supabase SQL Editor, click Run.

-- Kartzo Business Manager — Phase 1 schema
-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run

-- ---------- Products ----------
create table if not exists products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  price_paid  int  not null check (price_paid >= 0),
  price_cod   int  not null check (price_cod >= 0),
  cost        int  not null check (cost >= 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- Couriers ----------
create table if not exists couriers (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null unique,
  default_shipping_cost  int not null default 0 check (default_shipping_cost >= 0),
  default_rto_charge     int not null default 0 check (default_rto_charge >= 0),
  active                 boolean not null default true,
  created_at             timestamptz not null default now()
);

-- ---------- Orders ----------
create sequence if not exists order_number_seq start 1904;

create table if not exists orders (
  id             uuid primary key default gen_random_uuid(),
  order_code     text not null unique default ('KZT' || nextval('order_number_seq')),
  order_date     date not null default (now() at time zone 'Asia/Kolkata')::date,
  dispatch_date  date,
  customer_name  text not null,
  phone          text,
  address        text,
  pincode        text,
  product_id     uuid not null references products(id),
  qty            int  not null default 1 check (qty > 0),
  order_type     text not null default 'normal' check (order_type in ('normal','replacement')),
  payment_mode   text not null check (payment_mode in ('paid','cod')),
  order_value    int  not null default 0 check (order_value >= 0),
  advance_paid   int  not null default 0 check (advance_paid >= 0),
  cod_balance    int  generated always as (order_value - advance_paid) stored,
  -- snapshot values copied when the order is created
  product_cost   int  not null default 0,
  shipping_cost  int  not null default 0,
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
  remittance_id  uuid,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists orders_order_date_idx on orders (order_date);
create index if not exists orders_status_idx     on orders (status);
create index if not exists orders_phone_idx      on orders (phone);

-- Keep updated_at fresh, and stamp dispatch_date when an order is first dispatched
create or replace function orders_before_update()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'dispatched' and new.dispatch_date is null then
    new.dispatch_date := (now() at time zone 'Asia/Kolkata')::date;
  end if;
  return new;
end $$;

drop trigger if exists orders_before_update_trg on orders;
create trigger orders_before_update_trg
  before insert or update on orders
  for each row execute function orders_before_update();

-- ---------- Daily manual inputs (ad spend + staff pay) ----------
create table if not exists daily_inputs (
  date                date primary key,
  ad_spend            int not null default 0,
  staff_orders_taken  int,
  staff_amount        int not null default 0,
  staff_paid          boolean not null default false,
  staff_paid_date     date,
  notes               text
);

-- ---------- Security: only the logged-in owner can read/write ----------
alter table products     enable row level security;
alter table couriers     enable row level security;
alter table orders       enable row level security;
alter table daily_inputs enable row level security;

do $$
declare t text;
begin
  foreach t in array array['products','couriers','orders','daily_inputs'] loop
    execute format('drop policy if exists "owner full access" on %I', t);
    execute format(
      'create policy "owner full access" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Lets the app reset the order number after importing old orders
create or replace function set_next_order_number(n bigint)
returns void language sql security definer set search_path = public as $$
  select setval('order_number_seq', n, false);
$$;
revoke all on function set_next_order_number(bigint) from public, anon;
grant execute on function set_next_order_number(bigint) to authenticated;

-- Starting data. Run after 001_init.sql (SQL Editor -> New query -> paste -> Run).
-- Delhivery and DTDC charges are 0 for now: edit them later on the Settings page.

insert into products (name, price_paid, price_cod, cost) values
  ('Rear View Mirror', 449, 499, 140),
  ('Glass Wiper',      299, 299,  67)
on conflict (name) do nothing;

insert into couriers (name, default_shipping_cost, default_rto_charge) values
  ('India Post', 37, 0),
  ('Delhivery',   0, 0),
  ('DTDC',        0, 0)
on conflict (name) do nothing;
