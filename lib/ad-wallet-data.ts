import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { ADS_CATEGORY, walletPeriods, type Reading, type Recharge } from "./ad-wallet";
import { shiftDays } from "./dashboard";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Loads readings + "Ads wallet" recharges around [from, to] and works out spend periods.
 * `ready` is false until DATABASE-UPDATE-11 has been run (then the dashboard keeps hand-typed ad spend).
 */
export async function loadWallet(supabase: Supabase, from: string | null, to: string) {
  // a little extra on both sides so the periods touching the edges are complete
  const lo = from ? shiftDays(from, -40) : "2000-01-01";
  const hi = shiftDays(to, 40);
  const [readingsRes, rechargesRes, gstRes] = await Promise.all([
    supabase.from("ad_wallet_readings").select("date, balance").gte("date", lo).lte("date", hi).order("date").limit(5000),
    supabase
      .from("cash_entries")
      .select("id, date, amount, note, category:expense_categories!inner(name)")
      .eq("category.name", ADS_CATEGORY)
      .gte("date", lo)
      .lte("date", hi)
      .order("date")
      .order("created_at")
      .limit(5000),
    supabase.from("app_settings").select("value").eq("key", "ad_gst_percent").maybeSingle(),
  ]);

  if (readingsRes.error) return { ready: false as const, error: readingsRes.error.message };

  const readings = (readingsRes.data ?? []) as Reading[];
  const recharges: Recharge[] = (rechargesRes.data ?? []).map((r) => ({ id: r.id, date: r.date, amount: r.amount, note: r.note }));
  const gst = Number(gstRes.data?.value ?? 0) || 0;
  return { ready: true as const, readings, recharges, gst, periods: walletPeriods(readings, recharges, gst) };
}
