-- KARTZO UPDATE 15: ad spend per product (from each product's campaign in Meta Ads Manager)
-- Copy EVERYTHING in this file, paste into Supabase SQL Editor (New query), click Run.
-- Run UPDATE-11 first. Safe to run more than once.
--
-- Each day you can type what each product's campaign spent (Ads Manager → Campaigns → Yesterday).
-- The day's real cost from the Ad wallet is then split between products in that ratio,
-- so GST and small differences are handled. Days without numbers are split by orders, like before.

create table if not exists product_ad_spend (
  date        date not null,
  product_id  uuid not null references products(id) on delete cascade,
  amount      int  not null check (amount >= 0),
  created_at  timestamptz not null default now(),
  primary key (date, product_id)
);
create index if not exists product_ad_spend_date_idx on product_ad_spend (date);

alter table product_ad_spend enable row level security;
drop policy if exists "owner full access" on product_ad_spend;
create policy "owner full access" on product_ad_spend for all to authenticated using (true) with check (true);
