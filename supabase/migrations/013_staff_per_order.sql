-- KARTZO UPDATE 13: staff paid per order, counted automatically
-- Copy EVERYTHING in this file, paste into Supabase SQL Editor (New query), click Run.
-- Run UPDATE-5 and UPDATE-7 first if you haven't. Safe to run more than once.
--
-- Rule: staff earns a fixed amount (₹20) for every order SHE took that has been dispatched
-- (dispatched, delivered, RTO or returned all count; new and cancelled don't).
-- One order = one payment, however many products are in it. Orders you take yourself don't count.
-- Each day's amount (by order date) is kept up to date in daily_inputs automatically.

-- 1) Who took the order
alter table orders add column if not exists taken_by text not null default 'staff';
alter table orders drop constraint if exists orders_taken_by_check;
alter table orders add constraint orders_taken_by_check check (taken_by in ('staff', 'owner'));
create index if not exists orders_order_date_idx on orders (order_date);

-- 2) How much was paid for a day (so orders added after paying show up as "due")
alter table daily_inputs add column if not exists staff_paid_amount int;

-- 3) Settings: amount per order, and the first day counted automatically (days before keep what you typed)
insert into app_settings (key, value) values
  ('staff_rate', '20'),
  ('staff_auto_from', to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD'))
on conflict (key) do nothing;

-- 4) Recalculate one day
create or replace function staff_recalc_day(d date)
returns void language plpgsql set search_path = public as $$
declare
  rate int;
  start date;
  n int;
begin
  if d is null then return; end if;
  select nullif(value, '')::int into rate from app_settings where key = 'staff_rate';
  select nullif(value, '')::date into start from app_settings where key = 'staff_auto_from';
  if rate is null or start is null or d < start then return; end if;

  select count(*) into n
  from orders
  where order_date = d
    and taken_by = 'staff'
    and status in ('dispatched', 'delivered', 'rto', 'returned');

  if n = 0 and not exists (select 1 from daily_inputs where date = d) then return; end if;

  insert into daily_inputs (date, staff_amount, staff_orders_taken)
  values (d, n * rate, n)
  on conflict (date) do update
    set staff_amount = excluded.staff_amount,
        staff_orders_taken = excluded.staff_orders_taken;
end $$;

-- Recalculate a range of days (used when the rate or start date changes)
create or replace function staff_recalc_range(a date, b date)
returns int language plpgsql set search_path = public as $$
declare
  d date := a;
  n int := 0;
begin
  while d <= b and n < 1000 loop
    perform staff_recalc_day(d);
    d := d + 1;
    n := n + 1;
  end loop;
  return n;
end $$;

-- 5) Keep it up to date whenever an order is added, changes status / date / who took it, or is deleted
create or replace function orders_staff_pay()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform staff_recalc_day(new.order_date);
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.order_date is distinct from new.order_date) then
    perform staff_recalc_day(old.order_date);
  end if;
  return null;
end $$;

drop trigger if exists orders_staff_pay_trg on orders;
create trigger orders_staff_pay_trg
  after insert or update of status, taken_by, order_date or delete on orders
  for each row execute function orders_staff_pay();

-- 6) Saving orders accepts taken_by ('staff' when not given)
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
      order_code,
      order_date, customer_name, phone, address, pincode,
      product_id, qty, product_cost,
      order_type, payment_mode, order_value, advance_paid,
      courier_id, shipping_cost, rto_charge, cod_fee,
      tracking_id, status, notes, taken_by
    ) values (
      coalesce(nullif(upper(trim(o->>'order_code')), ''), next_order_code()),
      coalesce((o->>'order_date')::date, (now() at time zone 'Asia/Kolkata')::date),
      o->>'customer_name', o->>'phone', o->>'address', o->>'pincode',
      (o->'items'->0->>'product_id')::uuid, 1, coalesce((o->'items'->0->>'unit_cost')::int, 0),
      coalesce(o->>'order_type', 'normal'), o->>'payment_mode',
      coalesce((o->>'order_value')::int, 0), coalesce((o->>'advance_paid')::int, 0),
      (o->>'courier_id')::uuid, coalesce((o->>'shipping_cost')::int, 0),
      coalesce((o->>'rto_charge')::int, 0), coalesce((o->>'cod_fee')::int, 0),
      nullif(o->>'tracking_id', ''), coalesce(o->>'status', 'new'), nullif(o->>'notes', ''),
      coalesce(nullif(o->>'taken_by', ''), 'staff')
    ) returning id, order_code into new_id, code;

    insert into order_items (order_id, product_id, qty, unit_cost, unit_price)
    select new_id, (i->>'product_id')::uuid, greatest(1, (i->>'qty')::int),
           coalesce((i->>'unit_cost')::int, 0), coalesce((i->>'unit_price')::int, 0)
    from jsonb_array_elements(o->'items') i;

    return next code;
  end loop;
end $$;

revoke all on function create_orders(jsonb) from public, anon;
grant execute on function create_orders(jsonb) to authenticated;
revoke all on function staff_recalc_day(date) from public, anon;
revoke all on function staff_recalc_range(date, date) from public, anon;
grant execute on function staff_recalc_day(date) to authenticated;
grant execute on function staff_recalc_range(date, date) to authenticated;

-- 7) Count today straight away
select staff_recalc_range(
  (select value::date from app_settings where key = 'staff_auto_from'),
  (now() at time zone 'Asia/Kolkata')::date
);
