-- KARTZO UPDATE 10: type your own order ID (e.g. for orders entered late)
-- Copy EVERYTHING in this file, paste into Supabase SQL Editor (New query), click Run.
-- Run UPDATE-5 first if you haven't. Safe to run more than once.

-- 1) Automatic order IDs skip any number you've already used by hand
create or replace function next_order_code()
returns text language plpgsql set search_path = public as $$
declare c text;
begin
  loop
    c := 'KZT' || nextval('order_number_seq');
    exit when not exists (select 1 from orders where order_code = c);
  end loop;
  return c;
end $$;

alter table orders alter column order_code set default next_order_code();

-- 2) Saving orders accepts an optional order_code (blank = automatic)
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
      tracking_id, status, notes
    ) values (
      coalesce(nullif(upper(trim(o->>'order_code')), ''), next_order_code()),
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

revoke all on function create_orders(jsonb) from public, anon;
grant execute on function create_orders(jsonb) to authenticated;
revoke all on function next_order_code() from public, anon;
grant execute on function next_order_code() to authenticated;
