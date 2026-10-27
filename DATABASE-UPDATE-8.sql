-- KARTZO UPDATE 8: COD remittance (payments from India Post / couriers)
-- Copy EVERYTHING in this file, paste into Supabase SQL Editor (New query), click Run.
-- Run UPDATE-6 first if you haven't. Safe to run more than once.

create table if not exists cod_remittances (
  id              uuid primary key default gen_random_uuid(),
  date            date not null default (now() at time zone 'Asia/Kolkata')::date,
  courier_id      uuid references couriers(id),
  amount          int  not null check (amount >= 0),   -- what actually reached the bank
  expected        int  not null default 0,             -- COD collected − COD fees for the matched orders
  reference       text,                                -- UTR / reference number
  note            text,
  cash_entry_id   uuid references cash_entries(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists cod_remittances_date_idx on cod_remittances (date);

-- Link orders to the remittance that paid them
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_remittance_id_fkey') then
    alter table orders add constraint orders_remittance_id_fkey
      foreign key (remittance_id) references cod_remittances(id) on delete set null;
  end if;
end $$;
create index if not exists orders_remittance_idx on orders (remittance_id);
create index if not exists orders_tracking_idx on orders (tracking_id);

alter table cod_remittances enable row level security;
drop policy if exists "owner full access" on cod_remittances;
create policy "owner full access" on cod_remittances for all to authenticated using (true) with check (true);
