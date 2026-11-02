import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { spendByDay } from "./ad-wallet";
import { loadWallet } from "./ad-wallet-data";
import type { DayCost } from "./product-report";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Ad spend + staff per day, same rules as the Dashboard (Ad wallet numbers win over hand-typed ad spend). */
export async function loadDayCosts(supabase: Supabase, from: string, to: string): Promise<DayCost[]> {
  const [inputs, wallet, weights] = await Promise.all([
    supabase.from("daily_inputs").select("*").gte("date", from).lte("date", to),
    loadWallet(supabase, from, to),
    loadAdWeights(supabase, from, to),
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
  for (const [date, w] of weights) {
    const row = byDate.get(date) ?? { date, ad: 0, staff: 0 };
    row.adWeights = w;
    byDate.set(date, row);
  }
  return [...byDate.values()];
}

/** Per-product campaign spend typed on the Ad wallet page: date → { product_id: ₹ }. Empty until DATABASE-UPDATE-15 is run. */
export async function loadAdWeights(supabase: Supabase, from: string, to: string) {
  const out = new Map<string, Record<string, number>>();
  for (let i = 0; i < 50; i++) {
    const { data, error } = await supabase
      .from("product_ad_spend")
      .select("date, product_id, amount")
      .gte("date", from)
      .lte("date", to)
      .order("date")
      .order("product_id")
      .range(i * 1000, i * 1000 + 999);
    if (error || !data) break;
    for (const r of data as { date: string; product_id: string; amount: number }[]) {
      const w = out.get(r.date) ?? {};
      w[r.product_id] = r.amount;
      out.set(r.date, w);
    }
    if (data.length < 1000) break;
  }
  return out;
}
