-- KARTZO UPDATE 16: staff can add orders from her private link (checked address, phone and product)
-- Copy EVERYTHING in this file, paste into Supabase SQL Editor (New query), click Run.
-- Run UPDATE-13 and UPDATE-14 first. Safe to run more than once.
--
-- All three functions check the secret staff link first and do nothing when it's wrong.
-- Orders are saved as New, taken by staff, priced from your product list (cost never leaves the database).

-- COD commission from a courier's slabs (same rule as the app)
create or replace function kz_cod_fee(slabs jsonb, amount int)
returns int language sql immutable as $$
  with s as (
    select (x->>'upto')::int as upto, (x->>'fee')::int as fee
    from jsonb_array_elements(coalesce(slabs, '[]'::jsonb)) x
    where (x->>'upto')::int > 0
  )
  select case
    when amount is null or amount <= 0 or not exists (select 1 from s) then 0
    else coalesce(
      (select fee from s where amount <= upto order by upto limit 1),
      (select round(amount::numeric * fee / upto)::int from s order by upto desc limit 1)
    )
  end
$$;

create or replace function kz_staff_token_ok(p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from app_settings
    where key = 'staff_link_token' and length(value) >= 20 and value = p_token
  )
$$;

-- 1) What the order form needs: active products with prices (no costs)
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
    ), '[]'::jsonb)
  );
end $$;

-- 2) Earlier orders from the same phone (last 30 days) to avoid double orders
create or replace function staff_phone_orders(p_token text, p_phone text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not kz_staff_token_ok(p_token) or p_phone !~ '^[6-9][0-9]{9}$' then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('code', order_code, 'date', order_date, 'status', status) order by order_date desc)
    from (
      select order_code, order_date, status from orders
      where phone = p_phone and order_date >= (now() at time zone 'Asia/Kolkata')::date - 30
      order by order_date desc limit 5
    ) t
  ), '[]'::jsonb);
end $$;

-- 3) Save one order. Returns the new order ID (e.g. KZT2461).
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
  code text;
begin
  if not kz_staff_token_ok(p_token) then raise exception 'This link no longer works'; end if;
  if coalesce(trim(p->>'customer_name'), '') = '' then raise exception 'Name is missing'; end if;
  if coalesce(p->>'phone', '') !~ '^[6-9][0-9]{9}$' then raise exception 'Phone must be 10 digits'; end if;
  if coalesce(pin, '') !~ '^[1-9][0-9]{5}$' then raise exception 'Pincode must be 6 digits'; end if;
  if length(coalesce(trim(p->>'address'), '')) < 10 then raise exception 'Address is too short'; end if;
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
      'unit_price', case when mode = 'paid' then pr.price_paid else pr.price_cod end
    );
  end loop;

  select id, default_shipping_cost, shipping_cost_outside, default_rto_charge, cod_fee_slabs into c
  from couriers where active
  order by (name ilike 'india post%') desc, created_at
  limit 1;

  select x into code from create_orders(jsonb_build_array(jsonb_build_object(
    'customer_name', upper(trim(p->>'customer_name')),
    'phone', p->>'phone',
    'address', upper(trim(p->>'address')),
    'pincode', pin,
    'order_type', 'normal',
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

revoke all on function kz_staff_token_ok(text) from public, anon, authenticated;
revoke all on function staff_order_setup(text) from public;
revoke all on function staff_phone_orders(text, text) from public;
revoke all on function staff_create_order(text, jsonb) from public;
grant execute on function staff_order_setup(text) to anon, authenticated;
grant execute on function staff_phone_orders(text, text) to anon, authenticated;
grant execute on function staff_create_order(text, jsonb) to anon, authenticated;
