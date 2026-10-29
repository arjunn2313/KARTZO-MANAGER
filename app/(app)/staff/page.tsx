import { Suspense } from "react";
import { PageSkeleton } from "@/components/skeleton";
import { eachDay, shiftDays } from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/server";
import { requestToday } from "@/lib/today";
import { StaffView, type PaySettings, type StaffDay, type Week } from "./staff-view";

type Search = Record<string, string | string[] | undefined>;

export default function StaffPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={<PageSkeleton chart rows={4} />}>
      <Staff searchParams={searchParams} />
    </Suspense>
  );
}

/** Sunday on or before the date (weeks run Sunday → Saturday, like the old sheet). */
function weekStart(iso: string) {
  const dow = new Date(iso + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  return shiftDays(iso, -dow);
}

const PAID_STATUSES = new Set(["dispatched", "delivered", "rto", "returned"]);

type StaffOrder = { order_date: string; status: string; taken_by: string; items: { product_id: string; qty: number }[] | null };

async function Staff({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const weeks = Math.min(52, Math.max(4, Number(Array.isArray(sp.weeks) ? sp.weeks[0] : sp.weeks) || 8));
  const today = await requestToday();
  const thisWeek = weekStart(today);
  const from = shiftDays(thisWeek, -7 * (weeks - 1));
  const to = shiftDays(thisWeek, 6);

  const supabase = await createClient();
  const [inputs, settings, products] = await Promise.all([
    supabase.from("daily_inputs").select("*").gte("date", from).lte("date", to),
    supabase.from("app_settings").select("key, value"),
    supabase.from("products").select("id, name").order("name"),
  ]);
  if (inputs.error) return <p className="text-sm text-red-600">{inputs.error.message}</p>;

  // orders in the period, with who took them (needs DATABASE-UPDATE-13); paged past the 1000-row limit
  const orders: StaffOrder[] = [];
  let perOrderReady = true;
  for (let i = 0; i < 100; i++) {
    const { data, error } = await supabase
      .from("orders")
      .select("order_date, status, taken_by, items:order_items(product_id, qty)")
      .gte("order_date", from)
      .lte("order_date", to)
      .order("order_date")
      .order("id")
      .range(i * 1000, i * 1000 + 999);
    if (error) {
      perOrderReady = false;
      break;
    }
    orders.push(...((data ?? []) as unknown as StaffOrder[]));
    if (!data || data.length < 1000) break;
  }

  const kv = Object.fromEntries((settings.data ?? []).map((r) => [r.key as string, r.value as string]));
  const pay: PaySettings = {
    ready: perOrderReady && !!kv.staff_auto_from,
    rate: Number(kv.staff_rate ?? 20) || 0,
    autoFrom: kv.staff_auto_from ?? today,
  };

  // per day: her paid orders, her orders waiting to be dispatched, orders you took
  const perDay = new Map<string, { counted: number; waiting: number; mine: number }>();
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const d = perDay.get(o.order_date) ?? { counted: 0, waiting: 0, mine: 0 };
    if (o.taken_by === "owner") d.mine += 1;
    else if (PAID_STATUSES.has(o.status)) d.counted += 1;
    else if (o.status === "new") d.waiting += 1;
    perDay.set(o.order_date, d);
  }
  const productName = new Map((products.data ?? []).map((p) => [p.id as string, p.name as string]));

  // per day: her paid orders grouped by what was in them ("Mirror", or "Mirror + Wiper" for a combo)
  const dayProducts = new Map<string, Map<string, number>>();
  for (const o of orders) {
    if (o.taken_by === "owner" || !PAID_STATUSES.has(o.status)) continue;
    const ids = [...new Set((o.items ?? []).map((i) => i.product_id))];
    const label = ids.map((id) => productName.get(id) ?? "Product").sort().join(" + ") || "Order";
    const m = dayProducts.get(o.order_date) ?? new Map<string, number>();
    m.set(label, (m.get(label) ?? 0) + 1);
    dayProducts.set(o.order_date, m);
  }

  const byDate = new Map((inputs.data ?? []).map((d) => [d.date as string, d]));
  const out: Week[] = [];
  for (let w = 0; w < weeks; w++) {
    const start = shiftDays(thisWeek, -7 * w);
    const end = shiftDays(start, 6);
    const days: StaffDay[] = eachDay(start, end).map((date) => {
      const d = byDate.get(date);
      const c = perDay.get(date);
      return {
        date,
        amount: d?.staff_amount ?? 0,
        bonus: d?.staff_bonus ?? 0,
        bonusNote: (d?.staff_bonus_note as string | null) ?? null,
        ordersTaken: d?.staff_orders_taken ?? null,
        dispatched: c?.counted ?? 0,
        waiting: c?.waiting ?? 0,
        mine: c?.mine ?? 0,
        auto: pay.ready && date >= pay.autoFrom,
        paid: !!d?.staff_paid,
        paidDate: (d?.staff_paid_date as string | null) ?? null,
        paidAmount: (d?.staff_paid_amount as number | null | undefined) ?? null,
        future: date > today,
        products: [...(dayProducts.get(date) ?? new Map<string, number>()).entries()]
          .map(([name, orders]) => ({ name, orders }))
          .sort((a, b) => b.orders - a.orders),
      };
    });

    // her orders per product this week (orders that count for pay; a 2-product order counts once for each product)
    const prod = new Map<string, { orders: number; pieces: number }>();
    for (const o of orders) {
      if (o.order_date < start || o.order_date > end || o.taken_by === "owner" || !PAID_STATUSES.has(o.status)) continue;
      const seen = new Set<string>();
      for (const it of o.items ?? []) {
        const p = prod.get(it.product_id) ?? { orders: 0, pieces: 0 };
        if (!seen.has(it.product_id)) p.orders += 1;
        seen.add(it.product_id);
        p.pieces += it.qty;
        prod.set(it.product_id, p);
      }
    }
    const productsTaken = [...prod.entries()]
      .map(([id, v]) => ({ name: productName.get(id) ?? "Product", ...v }))
      .sort((a, b) => b.orders - a.orders);

    out.push({ start, end, days, current: w === 0, products: productsTaken });
  }

  const business = {
    name: kv.business_name || "Kartzo",
    address: kv.business_address ?? "",
    phone: kv.business_phone ?? "",
    staffName: kv.staff_name ?? "",
    ready: !settings.error, // false until DATABASE-UPDATE-7 is run
  };
  // secret part of the staff's read-only link (undefined until DATABASE-UPDATE-14 is run, "" when switched off)
  const linkToken = kv.staff_link_token as string | undefined;

  return <StaffView weeks={out} today={today} shownWeeks={weeks} business={business} pay={pay} linkToken={linkToken} />;
}
