-- KARTZO UPDATE 4: RTO damage, customer returns and refunds
-- Copy EVERYTHING in this file, paste into Supabase SQL Editor (New query), click Run.
-- Run DATABASE-UPDATE-3.sql first if you haven't. Safe to run more than once.

alter table orders add column if not exists damaged        boolean not null default false;
alter table orders add column if not exists refund_amount  int not null default 0 check (refund_amount >= 0);
alter table orders add column if not exists return_shipping int not null default 0 check (return_shipping >= 0);

-- New status: 'returned' (delivered, then the customer sent it back)
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check
  check (status in ('new','dispatched','delivered','rto','returned','cancelled'));

-- Profit per order
--   rto:      advance kept (advance − refund) − shipping − RTO charge − product cost if damaged
--   returned: value − refund − shipping − COD fee − return courier − product cost if damaged
alter table orders drop column if exists profit;
alter table orders add column profit int generated always as (
  case status
    when 'cancelled' then 0
    when 'rto' then
      advance_paid - refund_amount - shipping_cost - rto_charge
      - case when damaged then product_cost * qty else 0 end
    when 'returned' then
      order_value - refund_amount - shipping_cost - cod_fee - return_shipping
      - case when damaged then product_cost * qty else 0 end
    else order_value - (product_cost * qty) - shipping_cost - cod_fee
  end) stored;

-- Fill sensible defaults when an order first becomes RTO / Returned, clear them when it stops being one
create or replace function orders_before_update()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();

  if new.status in ('dispatched','delivered','rto','returned') and new.dispatch_date is null then
    new.dispatch_date := (now() at time zone 'Asia/Kolkata')::date;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'rto' then
      new.refund_amount := new.advance_paid;      -- assume any advance is refunded; change in the popup
      new.return_shipping := 0;
    elsif new.status = 'returned' then
      new.refund_amount := new.order_value;       -- assume full refund; change in the popup
      new.return_shipping := new.shipping_cost;   -- assume return costs the same as sending
    else
      new.refund_amount := 0;
      new.return_shipping := 0;
      new.damaged := false;
    end if;
  end if;

  return new;
end $$;

-- Stock: damaged RTO / returned units never come back
create or replace view product_stock with (security_invoker = true) as
select
  p.id as product_id,
  coalesce((select sum(s.qty) from stock_in s where s.product_id = p.id), 0)::int as stock_added,
  coalesce((select sum(o.qty) from orders o
            where o.product_id = p.id
              and (o.status in ('dispatched','delivered')
                   or (o.status in ('rto','returned') and o.damaged))), 0)::int as sold,
  coalesce((select sum(o.qty) from orders o
            where o.product_id = p.id and o.status = 'new'), 0)::int as pending
from products p;
