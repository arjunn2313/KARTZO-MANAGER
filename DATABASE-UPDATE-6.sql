-- KARTZO UPDATE 6: Expenses (cash book)
-- Copy EVERYTHING in this file, paste into Supabase SQL Editor (New query), click Run.
-- Safe to run more than once.

-- Categories. kind:
--   'cost'     = business cost not inside any order (packing, phone, rent) -> reduces net profit
--   'transfer' = money out that is already counted per order or per day (ads wallet, shipping, stock) -> cash only
--   'income'   = money in (COD remittance, other income)
create table if not exists expense_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  kind        text not null check (kind in ('cost','transfer','income')),
  sort        int  not null default 100,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into expense_categories (name, kind, sort) values
  ('Ads wallet',         'transfer', 10),
  ('Shipping wallet',    'transfer', 20),
  ('Post office / DTDC', 'transfer', 30),
  ('Bulk stock',         'transfer', 40),
  ('Vendor paid',        'transfer', 50),
  ('Packing material',   'cost',     60),
  ('Other expenses',     'cost',     70),
  ('COD remittance',     'income',   80),
  ('Other income',       'income',   90)
on conflict (name) do nothing;

create table if not exists cash_entries (
  id           uuid primary key default gen_random_uuid(),
  date         date not null default (now() at time zone 'Asia/Kolkata')::date,
  category_id  uuid not null references expense_categories(id),
  amount       int  not null check (amount > 0),
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists cash_entries_date_idx on cash_entries (date);

alter table expense_categories enable row level security;
alter table cash_entries enable row level security;
drop policy if exists "owner full access" on expense_categories;
drop policy if exists "owner full access" on cash_entries;
create policy "owner full access" on expense_categories for all to authenticated using (true) with check (true);
create policy "owner full access" on cash_entries for all to authenticated using (true) with check (true);
