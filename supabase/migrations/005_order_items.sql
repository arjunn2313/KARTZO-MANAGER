-- KARTZO UPDATE 5: several products in one order (combos / special discount)
-- Copy EVERYTHING in this file, paste into Supabase SQL Editor (New query), click Run.
-- Run UPDATE-3 and UPDATE-4 first if you haven't. Safe to run more than once.
-- Your existing orders are copied into the new product list automatically.

-- 1) Products inside an order
create table if not exists order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  product_id  uuid not null references products(id),
  qty         int  not null default 1 check (qty > 0),
  unit_cost   int  not null default 0 check (unit_cost >= 0),   -- your cost per piece at the time
  unit_price  int  not null default 0 check (unit_price >= 0),  -- normal selling price per piece (to show discount)
  created_at  timestamptz not null default now()
);
create index if not exists order_items_order_idx   on order_items (order_id);
create index if not exists order_items_product_idx on order_items (product_id);

alter table order_items enable row level security;
drop policy if exists "owner full access" on order_items;
create policy "owner full access" on order_items for all to authenticated using (true) with check (true);

-- 2) Copy every existing order into order_items (only once)
insert into order_items (order_id, product_id, qty, unit_cost, unit_price)
select o.id, o.product_id, o.qty, o.product_cost,
       case when o.qty > 0 then o.order_value / o.qty else 0 end
from orders o
where not exists (select 1 from order_items i where i.order_id = o.id);

-- 3) Total product cost of an order, kept up to date automatically
alter table orders add column if not exists items_cost int not null default 0;

update orders o set items_cost = coalesce((select sum(i.qty * i.unit_cost) from order_items i where i.order_id = o.id), 0);

create or replace function sync_order_items()
returns trigger language plpgsql as $$
declare oid uuid := coalesce(new.order_id, old.order_id);
begin
  update orders o set
    items_cost = coalesce((select sum(i.qty * i.unit_cost) from order_items i where i.order_id = oid), 0),
    qty        = greatest(1, coalesce((select sum(i.qty) from order_items i where i.order_id = oid), 1)),
    product_id = coalesce((select i.product_id from order_items i where i.order_id = oid order by i.created_at, i.id limit 1), o.product_id)
  where o.id = oid;
  return null;
end $$;

drop trigger if exists order_items_sync_trg on order_items;
create trigger order_items_sync_trg
  after insert or update or delete on order_items
  for each row execute function sync_order_items();

-- 4) Profit now uses the total cost of all products in the order
alter table orders drop column if exists profit;
alter table orders add column profit int generated always as (
  case status
    when 'cancelled' then 0
    when 'rto' then
      advance_paid - refund_amount - shipping_cost - rto_charge
      - case when damaged then items_cost else 0 end
    when 'returned' then
      order_value - refund_amount - shipping_cost - cod_fee - return_shipping
      - case when damaged then items_cost else 0 end
    else order_value - items_cost - shipping_cost - cod_fee
  end) stored;

-- 5) Stock counts every product in every order
create or replace view product_stock with (security_invoker = true) as
select
  p.id as product_id,
  coalesce((select sum(s.qty) from stock_in s where s.product_id = p.id), 0)::int as stock_added,
  coalesce((select sum(i.qty) from order_items i join orders o on o.id = i.order_id
            where i.product_id = p.id
              and (o.status in ('dispatched','delivered')
                   or (o.status in ('rto','returned') and o.damaged))), 0)::int as sold,
  coalesce((select sum(i.qty) from order_items i join orders o on o.id = i.order_id
            where i.product_id = p.id and o.status = 'new'), 0)::int as pending
from products p;

-- 6) Save orders together with their products in one step (all or nothing)
create or replace function create_orders(payload jsonb)
returns setof text language plpgsql security invoker set search_path = public as $$
declare
  o jsonb;
  new_id uuid;
  code text;
begin
  for o in select value from jsonb_array_elements(payload) loop
    if jsonb_array_length(coalesce(o->'items', '[]'::jsonb)) = 0 then
      raise exception 'Every order needs at least one product';
    end if;

    insert into orders (
      order_date, customer_name, phone, address, pincode,
      product_id, qty, product_cost,
      order_type, payment_mode, order_value, advance_paid,
      courier_id, shipping_cost, rto_charge, cod_fee,
      tracking_id, status, notes
    ) values (
      coalesce((o->>'order_date')::date, (now() at time zone 'Asia/Kolkata')::date),
      o->>'customer_name', o->>'phone', o->>'address', o->>'pincode',
      (o->'items'->0->>'product_id')::uuid, 1, coalesce((o->'items'->0->>'unit_cost')::int, 0),
      coalesce(o->>'order_type', 'normal'), o->>'payment_mode',
      coalesce((o->>'order_value')::int, 0), coalesce((o->>'advance_paid')::int, 0),
      (o->>'courier_id')::uuid, coalesce((o->>'shipping_cost')::int, 0),
      coalesce((o->>'rto_charge')::int, 0), coalesce((o->>'cod_fee')::int, 0),
      nullif(o->>'tracking_id', ''), coalesce(o->>'status', 'new'), nullif(o->>'notes', '')
    ) returning id, order_code into new_id, code;

    insert into order_items (order_id, product_id, qty, unit_cost, unit_price)
    select new_id, (i->>'product_id')::uuid, greatest(1, (i->>'qty')::int),
           coalesce((i->>'unit_cost')::int, 0), coalesce((i->>'unit_price')::int, 0)
    from jsonb_array_elements(o->'items') i;

    return next code;
  end loop;
end $$;

-- Replace the products of one order (used by Edit order)
create or replace function replace_order_items(p_order uuid, items jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if jsonb_array_length(coalesce(items, '[]'::jsonb)) = 0 then
    raise exception 'An order needs at least one product';
  end if;
  delete from order_items where order_id = p_order;
  insert into order_items (order_id, product_id, qty, unit_cost, unit_price)
  select p_order, (i->>'product_id')::uuid, greatest(1, (i->>'qty')::int),
         coalesce((i->>'unit_cost')::int, 0), coalesce((i->>'unit_price')::int, 0)
  from jsonb_array_elements(items) i;
end $$;

revoke all on function create_orders(jsonb) from public, anon;
revoke all on function replace_order_items(uuid, jsonb) from public, anon;
grant execute on function create_orders(jsonb) to authenticated;
grant execute on function replace_order_items(uuid, jsonb) to authenticated;
