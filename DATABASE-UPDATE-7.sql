-- KARTZO UPDATE 7: staff bonus + business details (for payout receipts)
-- Copy EVERYTHING in this file, paste into Supabase SQL Editor (New query), click Run.
-- Safe to run more than once.

alter table daily_inputs add column if not exists staff_bonus int not null default 0 check (staff_bonus >= 0);
alter table daily_inputs add column if not exists staff_bonus_note text;

-- Simple key/value settings (business name, address, staff name…)
create table if not exists app_settings (
  key    text primary key,
  value  text not null default ''
);

insert into app_settings (key, value) values
  ('business_name', 'Kartzo'),
  ('business_address', 'Edappally, Ernakulam, Kerala'),
  ('business_phone', ''),
  ('staff_name', '')
on conflict (key) do nothing;

alter table app_settings enable row level security;
drop policy if exists "owner full access" on app_settings;
create policy "owner full access" on app_settings for all to authenticated using (true) with check (true);
