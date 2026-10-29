import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { spendByDay } from "./ad-wallet";
import { loadWallet } from "./ad-wallet-data";
import type { DayCost } from "./product-report";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Ad spend + staff per day, same rules as the Dashboard (Ad wallet numbers win over hand-typed ad spend). */
export async function loadDayCosts(supabase: Supabase, from: string, to: string): Promise<DayCost[]> {
  const [inputs, wallet] = await Promise.all([
    supabase.from("daily_inputs").select("*").gte("date", from).lte("date", to),
    loadWallet(supabase, from, to),
  ]);
  const byDate = new Map<string, DayCost>();
  for (const i of inputs.data ?? []) {
    byDate.set(i.date, { date: i.date, ad: i.ad_spend ?? 0, staff: (i.staff_amount ?? 0) + (i.staff_bonus ?? 0) });
  }
  if (wallet.ready) {
    for (const [date, cost] of spendByDay(wallet.periods)) {
      if (date < from || date > to) continue;
      const row = byDate.get(date) ?? { date, ad: 0, staff: 0 };
      row.ad = cost;
      byDate.set(date, row);
    }
  }
  return [...byDate.values()];
}
