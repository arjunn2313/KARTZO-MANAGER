-- KARTZO UPDATE 9: dispatch tools (WhatsApp tracking messages)
-- Copy EVERYTHING in this file, paste into Supabase SQL Editor (New query), click Run.
-- Run UPDATE-7 first if you haven't. Safe to run more than once.

alter table orders add column if not exists whatsapp_sent_at timestamptz;
alter table orders add column if not exists label_printed_at timestamptz;

insert into app_settings (key, value) values
  ('dispatch_message',
   E'Hi {name}, your {business} order {order} ({products}) has been dispatched by India Post 📦\n\nTracking ID: *{tracking}*\nTrack here: https://www.indiapost.gov.in\n{cod_line}\nThank you for shopping with {business}!'),
  ('label_note', 'If undelivered, please return to sender.')
on conflict (key) do nothing;
