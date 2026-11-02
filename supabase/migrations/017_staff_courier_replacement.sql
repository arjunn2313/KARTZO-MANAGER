-- KARTZO UPDATE 17: staff order form can pick the courier (India Post / DTDC …) and make replacement orders
-- Copy EVERYTHING in this file, paste into Supabase SQL Editor (New query), click Run.
-- Run UPDATE-16 first. Safe to run more than once.

-- What the order form needs: active products with prices (no costs) and active couriers
create or replace function staff_order_setup(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not kz_staff_token_ok(p_token) then return null; end if;
  return jsonb_build_object(
    'business', (select value from app_settings where key = 'business_name'),
    'staff', (select value from app_settings where key = 'staff_name'),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'price_cod', price_cod, 'price_paid', price_paid) order by name)
      from products where active
    ), '[]'::jsonb),
    'couriers', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by (name ilike 'india post%') desc, created_at)
      from couriers where active
    ), '[]'::jsonb)
  );
end $$;

-- Save one order (courier_id and order_type normal / replacement are optional). Returns the new order ID (e.g. KZT2461).
create or replace function staff_create_order(p_token text, p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  c record;
  items jsonb := '[]'::jsonb;
  it jsonb;
  pr record;
  mode text := p->>'payment_mode';
  v_value int := coalesce((p->>'order_value')::int, -1);
  advance int := coalesce((p->>'advance_paid')::int, 0);
  pin text := p->>'pincode';
  kind text := coalesce(p->>'order_type', 'normal');
  code text;
begin
  if not kz_staff_token_ok(p_token) then raise exception 'This link no longer works'; end if;
  if coalesce(trim(p->>'customer_name'), '') = '' then raise exception 'Name is missing'; end if;
  if coalesce(p->>'phone', '') !~ '^[6-9][0-9]{9}$' then raise exception 'Phone must be 10 digits'; end if;
  if coalesce(pin, '') !~ '^[1-9][0-9]{5}$' then raise exception 'Pincode must be 6 digits'; end if;
  if length(coalesce(trim(p->>'address'), '')) < 10 then raise exception 'Address is too short'; end if;
  if kind not in ('normal', 'replacement') then raise exception 'Unknown order type'; end if;
  if kind = 'replacement' then mode := 'paid'; v_value := 0; advance := 0; end if;
  if mode not in ('cod', 'paid') then raise exception 'Pick COD or Prepaid'; end if;
  if v_value < 0 or v_value > 1000000 then raise exception 'Check the amount'; end if;
  if advance < 0 or advance > v_value then raise exception 'Advance can''t be more than the amount'; end if;
  if mode = 'paid' then advance := v_value; end if;
  if jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then raise exception 'Add a product'; end if;

  for it in select value from jsonb_array_elements(p->'items') loop
    select id, price_cod, price_paid, cost into pr from products where id = (it->>'product_id')::uuid and active;
    if not found then raise exception 'Product not found'; end if;
    items := items || jsonb_build_object(
      'product_id', pr.id,
      'qty', greatest(1, least(50, coalesce((it->>'qty')::int, 1))),
      'unit_cost', pr.cost,
      'unit_price', case when kind = 'replacement' then 0 when mode = 'paid' then pr.price_paid else pr.price_cod end
    );
  end loop;

  select id, default_shipping_cost, shipping_cost_outside, default_rto_charge, cod_fee_slabs into c
  from couriers
  where active and (p->>'courier_id' is null or id = (p->>'courier_id')::uuid)
  order by (name ilike 'india post%') desc, created_at
  limit 1;
  if p->>'courier_id' is not null and c.id is null then raise exception 'Courier not found'; end if;

  select x into code from create_orders(jsonb_build_array(jsonb_build_object(
    'customer_name', upper(trim(p->>'customer_name')),
    'phone', p->>'phone',
    'address', upper(trim(p->>'address')),
    'pincode', pin,
    'order_type', kind,
    'payment_mode', mode,
    'order_value', v_value,
    'advance_paid', advance,
    'courier_id', c.id,
    'shipping_cost', case when c.id is null then 0
                          when pin !~ '^6[7-9]' and c.shipping_cost_outside is not null then c.shipping_cost_outside
                          else c.default_shipping_cost end,
    'rto_charge', coalesce(c.default_rto_charge, 0),
    'cod_fee', case when mode = 'cod' then kz_cod_fee(c.cod_fee_slabs, v_value - advance) else 0 end,
    'status', 'new',
    'notes', nullif(trim(coalesce(p->>'notes', '')), ''),
    'taken_by', 'staff',
    'items', items
  ))) x;
  return code;
end $$;

revoke all on function staff_order_setup(text) from public;
revoke all on function staff_create_order(text, jsonb) from public;
grant execute on function staff_order_setup(text) to anon, authenticated;
grant execute on function staff_create_order(text, jsonb) to anon, authenticated;
