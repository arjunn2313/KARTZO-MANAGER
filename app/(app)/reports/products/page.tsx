import { Suspense } from "react";
import { PageSkeleton } from "@/components/skeleton";
import { resolveRange } from "@/lib/date-range";
import { loadProductReport } from "@/lib/product-report-data";
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

async function Report({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const today = await requestToday();
  const range = resolveRange(sp, today, "30d");

  const data = await loadProductReport(supabase, range.from, range.to);
  if (data.error !== null) {
    return (
      <p className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900 ring-1 ring-amber-200">
        {/order_items/.test(data.error) ? "Run DATABASE-UPDATE-5.sql in Supabase first, then refresh this page." : data.error}
      </p>
    );
  }
  const { productList, report } = data;

  return (
    <ProductReportView
      range={{ key: range.key, from: range.from, to: range.to, days: range.days, today }}
      rangeBar={<RangeBar presets={range.presets} current={{ key: range.key, from: range.from, to: range.to }} />}
      lines={report.lines}
      images={Object.fromEntries(productList.map((p) => [p.id, p.image_url]))}
      colorOrder={productList.map((p) => p.id)}
      unallocated={{ ads: report.unallocatedAds, staff: report.unallocatedStaff, campaignDays: report.campaignDays, campaignAds: report.campaignAds }}
      days={report.days}
    />
  );
}
