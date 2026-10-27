-- Starting data. Run after 001_init.sql (SQL Editor -> New query -> paste -> Run).
-- Delhivery and DTDC charges are 0 for now: edit them later on the Settings page.

insert into products (name, price_paid, price_cod, cost) values
  ('Rear View Mirror', 449, 499, 140),
  ('Glass Wiper',      299, 299,  67)
on conflict (name) do nothing;

insert into couriers (name, default_shipping_cost, default_rto_charge) values
  ('India Post', 37, 0),
  ('Delhivery',   0, 0),
  ('DTDC',        0, 0)
on conflict (name) do nothing;
