import { Suspense } from "react";
import { PageSkeleton } from "@/components/skeleton";
import { loadWallet } from "@/lib/ad-wallet-data";
import { shiftDays } from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/server";
import { requestToday } from "@/lib/today";
import { AdsView } from "./ads-view";
import type { ProductSpend } from "./product-spend";

type Search = { show?: string };

export default function AdsPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={<PageSkeleton kpis={3} />}>
      <Ads searchParams={searchParams} />
    </Suspense>
  );
}

async function Ads({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const supabase = await createClient(); // cookies first, so "today" is per request
  const today = await requestToday();
  const all = sp.show === "all";
  const [w, products, spend] = await Promise.all([
    loadWallet(supabase, all ? null : shiftDays(today, -60), today),
    supabase.from("products").select("id, name, active").order("name"),
    supabase
      .from("product_ad_spend")
      .select("date, product_id, amount")
      .gte("date", shiftDays(today, all ? -400 : -60))
      .order("date", { ascending: false })
      .limit(5000),
  ]);

  if (!w.ready) {
    return (
      <div className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900 ring-1 ring-amber-200">
        {/ad_wallet_readings/.test(w.error) ? (
          <>
            <p className="font-semibold">One-time database update needed</p>
            <p className="mt-1">
              Open <b>DATABASE-UPDATE-11.sql</b> from your kartzo-manager folder, copy everything, paste it into Supabase → SQL Editor → New
              query, and click Run. Then refresh this page.
            </p>
          </>
        ) : (
          w.error
        )}
      </div>
    );
  }

  return (
    <AdsView
      today={today}
      all={all}
      readings={w.readings}
      recharges={w.recharges}
      periods={w.periods}
      gst={w.gst}
      products={(products.data ?? []) as { id: string; name: string; active: boolean }[]}
      productSpend={spend.error ? null : ((spend.data ?? []) as ProductSpend[])}
    />
  );
}
