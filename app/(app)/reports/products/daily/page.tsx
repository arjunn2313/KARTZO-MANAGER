import { Suspense } from "react";
import { PageSkeleton } from "@/components/skeleton";
import { resolveRange } from "@/lib/date-range";
import { loadProductReport } from "@/lib/product-report-data";
import { createClient } from "@/lib/supabase/server";
import { requestToday } from "@/lib/today";
import { RangeBar } from "../../../_dashboard/range-bar";
import { DailyProductsView } from "./daily-view";

type Search = Record<string, string | string[] | undefined>;

export default function ProductDaysPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={<PageSkeleton rows={6} />}>
      <ProductDays searchParams={searchParams} />
    </Suspense>
  );
}

async function ProductDays({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const today = await requestToday();
  const range = resolveRange(sp, today, "7d");

  const data = await loadProductReport(supabase, range.from, range.to);
  if (data.error !== null) return <p className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900 ring-1 ring-amber-200">{data.error}</p>;
  const { report, costs } = data;

  return (
    <DailyProductsView
      rangeBar={<RangeBar presets={range.presets} current={{ key: range.key, from: range.from, to: range.to }} />}
      days={[...report.days].reverse()}
      today={today}
      lines={report.lines.map((l) => ({ id: l.id, name: l.name, daily: l.daily }))}
      campaignDates={report.campaignDates}
      dayAds={Object.fromEntries(costs.map((c) => [c.date, c.ad]))}
    />
  );
}
