-- KARTZO UPDATE 14: private read-only link for your staff to see her own pay
-- Copy EVERYTHING in this file, paste into Supabase SQL Editor (New query), click Run.
-- Run UPDATE-13 first. Safe to run more than once (keeps the existing link).
--
-- The link looks like  https://your-site/s/<secret>  . Anyone with the link sees ONLY:
-- her name, the pay rule, each day's pay / bonus / paid status, and how many of HER orders
-- there were per product. No customer names, phones, addresses, prices or profit.
-- You can make a new link (the old one stops working) or switch it off on the Staff page.

-- 1) The secret part of the link
insert into app_settings (key, value)
values ('staff_link_token', replace(gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- 2) What the link page can read (checks the secret first; returns null when it's wrong)
create or replace function staff_dashboard(p_token text, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  tok text;
  a date := p_from;
begin
  select value into tok from app_settings where key = 'staff_link_token';
  if tok is null or length(tok) < 20 or p_token is null or p_token <> tok then
    return null;
  end if;
  if p_to is null or a is null or a > p_to then return null; end if;
  if p_to - a > 400 then a := p_to - 400; end if;

  return jsonb_build_object(
    'name', (select value from app_settings where key = 'staff_name'),
    'business', (select value from app_settings where key = 'business_name'),
    'rate', (select value from app_settings where key = 'staff_rate'),
    'auto_from', (select value from app_settings where key = 'staff_auto_from'),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', d.date,
        'amount', coalesce(d.staff_amount, 0),
        'bonus', coalesce(d.staff_bonus, 0),
        'bonus_note', d.staff_bonus_note,
        'orders_taken', d.staff_orders_taken,
        'paid', coalesce(d.staff_paid, false),
        'paid_date', d.staff_paid_date,
        'paid_amount', d.staff_paid_amount
      ) order by d.date)
      from daily_inputs d
      where d.date between a and p_to
    ), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'd', o.order_date,
        's', o.status,
        'p', coalesce((
          select jsonb_agg(distinct p.name)
          from order_items i join products p on p.id = i.product_id
          where i.order_id = o.id
        ), '[]'::jsonb)
      ))
      from orders o
      where o.order_date between a and p_to
        and o.taken_by = 'staff'
        and o.status <> 'cancelled'
    ), '[]'::jsonb)
  );
end $$;

revoke all on function staff_dashboard(text, date, date) from public;
grant execute on function staff_dashboard(text, date, date) to anon, authenticated;
