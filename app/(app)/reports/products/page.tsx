import { Suspense } from "react";
import { PageSkeleton } from "@/components/skeleton";
import { loadDayCosts } from "@/lib/day-costs";
import { resolveRange } from "@/lib/date-range";
import { productReport, type ReportOrder } from "@/lib/product-report";
import { createClient } from "@/lib/supabase/server";
import { requestToday } from "@/lib/today";
import { RangeBar } from "../../_dashboard/range-bar";
import { ProductReportView } from "./report-view";

type Search = Record<string, string | string[] | undefined>;

export default function ProductReportPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={<PageSkeleton chart rows={4} />}>
      <Report searchParams={searchParams} />
    </Suspense>
  );
}

const COLS = "order_date, status, order_value, profit, shipping_cost, cod_fee, payment_mode, pincode, items:order_items(product_id, qty, unit_cost, unit_price)";

async function Report({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const today = await requestToday();
  const range = resolveRange(sp, today, "30d");

  // page through so long ranges are never cut at Supabase's row limit
  const orders: ReportOrder[] = [];
  for (let i = 0; i < 100; i++) {
    const { data, error } = await supabase
      .from("orders")
      .select(COLS)
      .gte("order_date", range.from)
      .lte("order_date", range.to)
      .order("order_date")
      .order("id")
      .range(i * 1000, i * 1000 + 999);
    if (error) {
      return (
        <p className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900 ring-1 ring-amber-200">
          {/order_items/.test(error.message) ? "Run DATABASE-UPDATE-5.sql in Supabase first, then refresh this page." : error.message}
        </p>
      );
    }
    orders.push(...((data ?? []) as unknown as ReportOrder[]));
    if (!data || data.length < 1000) break;
  }

  const [products, costs] = await Promise.all([
    supabase.from("products").select("id, name, image_url, active").order("name"),
    loadDayCosts(supabase, range.from, range.to),
  ]);

  const productList = (products.data ?? []) as { id: string; name: string; image_url: string | null; active: boolean }[];
  const report = productReport(orders, costs, productList, range.from, range.to);

  return (
    <ProductReportView
      range={{ key: range.key, from: range.from, to: range.to, days: range.days, today }}
      rangeBar={<RangeBar presets={range.presets} current={{ key: range.key, from: range.from, to: range.to }} />}
      lines={report.lines}
      images={Object.fromEntries(productList.map((p) => [p.id, p.image_url]))}
      colorOrder={productList.map((p) => p.id)}
      unallocated={{ ads: report.unallocatedAds, staff: report.unallocatedStaff }}
      days={report.days}
    />
  );
}
