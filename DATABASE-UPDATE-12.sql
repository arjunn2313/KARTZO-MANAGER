-- KARTZO UPDATE 12: Stock page (stock history, sales speed, reorder)
-- Copy EVERYTHING in this file, paste into Supabase SQL Editor (New query), click Run.
-- Run UPDATE-5 and UPDATE-7 first if you haven't. Safe to run more than once.

-- More detail on stock coming in
alter table stock_in add column if not exists kind text not null default 'purchase';
alter table stock_in add column if not exists supplier text;
alter table stock_in add column if not exists unit_cost int;
alter table stock_in drop constraint if exists stock_in_kind_check;
alter table stock_in add constraint stock_in_kind_check check (kind in ('purchase', 'opening', 'adjust'));

-- Stock going out, one row per product per day (sold = dispatched/delivered, damaged = RTO/return that came back damaged)
create or replace view stock_out_daily with (security_invoker = true) as
select i.product_id,
       coalesce(o.dispatch_date, o.order_date) as date,
       case when o.status in ('rto', 'returned') then 'damaged' else 'sold' end as kind,
       sum(i.qty)::int as qty
from order_items i
join orders o on o.id = i.order_id
where o.status in ('dispatched', 'delivered')
   or (o.status in ('rto', 'returned') and o.damaged)
group by 1, 2, 3;

-- Pieces ordered per product per day (everything except cancelled) – used for "sold per day"
create or replace view product_demand_daily with (security_invoker = true) as
select i.product_id, o.order_date as date, sum(i.qty)::int as qty
from order_items i
join orders o on o.id = i.order_id
where o.status <> 'cancelled'
group by 1, 2;

-- Days it takes a new stock order to arrive (for the reorder warning)
insert into app_settings (key, value) values ('stock_lead_days', '7')
on conflict (key) do nothing;
