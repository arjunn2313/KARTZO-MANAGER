-- KARTZO: delete ALL test orders and start numbering from KZT2400
-- Copy EVERYTHING in this file, paste into Supabase SQL Editor (New query), click Run.
-- Keeps: products, couriers, stock entries, your login.
-- Removes: every order in the orders table (cannot be undone).

delete from orders;

-- Next order will be KZT2400
select setval('order_number_seq', 2400, false);

-- Check: should show 0 orders and next number 2400
select
  (select count(*) from orders) as orders_left,
  'KZT' || (select last_value from order_number_seq) as next_order_number;
