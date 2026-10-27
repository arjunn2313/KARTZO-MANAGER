import { Suspense } from "react";
import { PageSkeleton } from "@/components/skeleton";
import { eachDay, shiftDays } from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/server";
import { requestToday } from "@/lib/today";
import { StaffView, type StaffDay, type Week } from "./staff-view";

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

async function Staff({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const weeks = Math.min(52, Math.max(4, Number(Array.isArray(sp.weeks) ? sp.weeks[0] : sp.weeks) || 8));
  const today = await requestToday();
  const thisWeek = weekStart(today);
  const from = shiftDays(thisWeek, -7 * (weeks - 1));

  const supabase = await createClient();
  const [inputs, dispatched, settings] = await Promise.all([
    supabase.from("daily_inputs").select("*").gte("date", from).lte("date", shiftDays(thisWeek, 6)),
    supabase.from("orders").select("dispatch_date").gte("dispatch_date", from).lte("dispatch_date", today).limit(50000),
    supabase.from("app_settings").select("key, value"),
  ]);
  if (inputs.error) return <p className="text-sm text-red-600">{inputs.error.message}</p>;

  const byDate = new Map((inputs.data ?? []).map((d) => [d.date as string, d]));
  const dispatchedByDate = new Map<string, number>();
  for (const o of dispatched.data ?? []) {
    const d = o.dispatch_date as string;
    dispatchedByDate.set(d, (dispatchedByDate.get(d) ?? 0) + 1);
  }

  const out: Week[] = [];
  for (let w = 0; w < weeks; w++) {
    const start = shiftDays(thisWeek, -7 * w);
    const end = shiftDays(start, 6);
    const days: StaffDay[] = eachDay(start, end).map((date) => {
      const d = byDate.get(date);
      return {
        date,
        amount: d?.staff_amount ?? 0,
        bonus: d?.staff_bonus ?? 0,
        bonusNote: (d?.staff_bonus_note as string | null) ?? null,
        ordersTaken: d?.staff_orders_taken ?? null,
        dispatched: dispatchedByDate.get(date) ?? 0,
        paid: !!d?.staff_paid,
        paidDate: (d?.staff_paid_date as string | null) ?? null,
        future: date > today,
      };
    });
    out.push({ start, end, days, current: w === 0 });
  }

  const kv = Object.fromEntries((settings.data ?? []).map((r) => [r.key as string, r.value as string]));
  const business = {
    name: kv.business_name || "Kartzo",
    address: kv.business_address ?? "",
    phone: kv.business_phone ?? "",
    staffName: kv.staff_name ?? "",
    ready: !settings.error, // false until DATABASE-UPDATE-7 is run
  };

  return <StaffView weeks={out} today={today} shownWeeks={weeks} business={business} />;
}
