-- KARTZO UPDATE 2: product images + stock
-- Copy EVERYTHING in this file, paste into Supabase SQL Editor (New query), click Run.
-- Safe to run more than once.

-- Product image + low-stock warning level
alter table products add column if not exists image_url text;
alter table products add column if not exists low_stock_alert int not null default 20;

-- Stock coming in (new purchase, opening stock, or corrections with a minus number)
create table if not exists stock_in (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id),
  date        date not null default (now() at time zone 'Asia/Kolkata')::date,
  qty         int  not null check (qty <> 0),
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists stock_in_product_idx on stock_in (product_id);

alter table stock_in enable row level security;
drop policy if exists "owner full access" on stock_in;
create policy "owner full access" on stock_in for all to authenticated using (true) with check (true);

-- Live stock per product:
--   available = stock added − units in dispatched/delivered orders  (RTO and cancelled don't count)
--   pending   = units in 'new' orders not yet dispatched
create or replace view product_stock with (security_invoker = true) as
select
  p.id as product_id,
  coalesce((select sum(s.qty) from stock_in s where s.product_id = p.id), 0)::int as stock_added,
  coalesce((select sum(o.qty) from orders o
            where o.product_id = p.id and o.status in ('dispatched','delivered')), 0)::int as sold,
  coalesce((select sum(o.qty) from orders o
            where o.product_id = p.id and o.status = 'new'), 0)::int as pending
from products p;

-- Image storage (public link so images show anywhere; only you can upload/change)
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "kartzo upload product images" on storage.objects;
create policy "kartzo upload product images" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images');

drop policy if exists "kartzo update product images" on storage.objects;
create policy "kartzo update product images" on storage.objects
  for update to authenticated using (bucket_id = 'product-images');

drop policy if exists "kartzo delete product images" on storage.objects;
create policy "kartzo delete product images" on storage.objects
  for delete to authenticated using (bucket_id = 'product-images');
