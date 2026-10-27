-- KARTZO UPDATE 3: shipping by location + COD commission
-- Copy EVERYTHING in this file, paste into Supabase SQL Editor (New query), click Run.
-- Safe to run more than once.

-- Couriers: separate price outside Kerala, and COD commission slabs
alter table couriers add column if not exists shipping_cost_outside int check (shipping_cost_outside >= 0);
alter table couriers add column if not exists cod_fee_slabs jsonb not null default '[]'::jsonb;

-- India Post defaults: ₹37 in Kerala, ₹40 outside; COD fee ₹5 up to ₹299, ₹8 up to ₹499
update couriers
set shipping_cost_outside = 40,
    cod_fee_slabs = '[{"upto":299,"fee":5},{"upto":499,"fee":8}]'::jsonb
where name = 'India Post' and shipping_cost_outside is null;

-- Orders: COD commission saved per order (like shipping cost)
alter table orders add column if not exists cod_fee int not null default 0 check (cod_fee >= 0);

-- Profit now also subtracts the COD commission (not charged on RTO: no cash collected)
alter table orders drop column if exists profit;
alter table orders add column profit int generated always as (
  case status
    when 'rto'       then -(shipping_cost + rto_charge)
    when 'cancelled' then 0
    else order_value - (product_cost * qty) - shipping_cost - cod_fee
  end) stored;
