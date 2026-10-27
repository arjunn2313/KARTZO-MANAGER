-- KARTZO UPDATE 11: Ad wallet (morning balance -> daily ad spend)
-- Copy EVERYTHING in this file, paste into Supabase SQL Editor (New query), click Run.
-- Run UPDATE-6 and UPDATE-7 first if you haven't. Safe to run more than once.

-- One balance reading per morning (taken BEFORE recharging that day)
create table if not exists ad_wallet_readings (
  date        date primary key,
  balance     int  not null check (balance >= 0),
  note        text,
  created_at  timestamptz not null default now()
);

alter table ad_wallet_readings enable row level security;
drop policy if exists "owner full access" on ad_wallet_readings;
create policy "owner full access" on ad_wallet_readings for all to authenticated using (true) with check (true);

-- Recharges are saved in the cash book under this category
insert into expense_categories (name, kind, sort) values ('Ads wallet', 'transfer', 10)
on conflict (name) do nothing;

-- GST % included in the recharge amount you pay (0 = recharge goes fully into the wallet)
insert into app_settings (key, value) values ('ad_gst_percent', '0')
on conflict (key) do nothing;
