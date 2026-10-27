import { Suspense } from "react";
import { CardsSkeleton } from "@/components/skeleton";
import { shiftDays } from "@/lib/dashboard";
import type { Demand, StockIn, StockOut } from "@/lib/stock";
import { createClient } from "@/lib/supabase/server";
import { requestToday } from "@/lib/today";
import { StockView, type StockProduct } from "./stock-view";

type Search = { days?: string; product?: string };

export default function StockPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={<CardsSkeleton />}>
      <Stock searchParams={searchParams} />
    </Suspense>
  );
}

const DAYS = ["30", "90", "all"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Supabase sends at most 1000 rows per request, so page through. */
async function all<T>(make: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let i = 0; i < 50; i++) {
    const { data, error } = await make(i * 1000, i * 1000 + 999);
    if (error) return { data: out, error };
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return { data: out, error: null };
}

async function Stock({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const supabase = await createClient(); // cookies first, so "today" is per request
  const today = await requestToday();
  const days = DAYS.includes(sp.days ?? "") ? sp.days! : "30";
  const product = sp.product && UUID.test(sp.product) ? sp.product : null;
  const since = days === "all" ? "2000-01-01" : shiftDays(today, -Number(days));

  const [products, stock, ins, outs, demand, lead] = await Promise.all([
    supabase.from("products").select("id, name, image_url, low_stock_alert, active, cost").order("active", { ascending: false }).order("name"),
    supabase.from("product_stock").select("product_id, stock_added, sold, pending"),
    all<StockIn>((a, b) => {
      let q = supabase.from("stock_in").select("id, product_id, date, qty, kind, supplier, unit_cost, note").gte("date", since);
      if (product) q = q.eq("product_id", product);
      return q.order("date", { ascending: false }).order("created_at", { ascending: false }).range(a, b);
    }),
    all<StockOut>((a, b) => {
      let q = supabase.from("stock_out_daily").select("product_id, date, kind, qty").gte("date", since);
      if (product) q = q.eq("product_id", product);
      return q.order("date", { ascending: false }).range(a, b);
    }),
    all<Demand>((a, b) => supabase.from("product_demand_daily").select("product_id, date, qty").gte("date", shiftDays(today, -31)).range(a, b)),
    supabase.from("app_settings").select("value").eq("key", "stock_lead_days").maybeSingle(),
  ]);

  const error = products.error ?? stock.error ?? ins.error ?? outs.error ?? demand.error;
  if (error) {
    const needs12 = /kind|supplier|unit_cost|stock_out_daily|product_demand_daily/.test(error.message);
    return (
      <div className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900 ring-1 ring-amber-200">
        {needs12 ? (
          <>
            <p className="font-semibold">One-time database update needed</p>
            <p className="mt-1">
              Open <b>DATABASE-UPDATE-12.sql</b> from your kartzo-manager folder, copy everything, paste it into Supabase → SQL Editor → New
              query, and click Run. Then refresh this page.
            </p>
          </>
        ) : (
          error.message
        )}
      </div>
    );
  }

  const byId = new Map((stock.data ?? []).map((s) => [s.product_id as string, s]));
  const list: StockProduct[] = (products.data ?? []).map((p) => {
    const s = byId.get(p.id);
    return {
      id: p.id,
      name: p.name,
      image_url: p.image_url,
      active: p.active,
      cost: p.cost,
      low_stock_alert: p.low_stock_alert,
      stock_added: s?.stock_added ?? 0,
      sold: s?.sold ?? 0,
      pending: s?.pending ?? 0,
    };
  });

  return (
    <StockView
      today={today}
      days={days}
      productFilter={product}
      products={list}
      ins={ins.data}
      outs={outs.data}
      demand={demand.data}
      leadDays={Number(lead.data?.value ?? 7) || 0}
    />
  );
}
