import { Suspense } from "react";
import { PageSkeleton } from "@/components/skeleton";
import { resolveRange } from "@/lib/date-range";
import { createClient } from "@/lib/supabase/server";
import { requestToday } from "@/lib/today";
import { RangeBar } from "../_dashboard/range-bar";
import { ExpensesView, type Category, type Entry } from "./expenses-view";

type Search = Record<string, string | string[] | undefined>;

export default function ExpensesPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={<PageSkeleton chart />}>
      <Expenses searchParams={searchParams} />
    </Suspense>
  );
}

async function Expenses({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const today = await requestToday();
  const range = resolveRange(sp, today, "month");

  const supabase = await createClient();
  const [cats, entries, advances] = await Promise.all([
    supabase.from("expense_categories").select("id, name, kind, active, sort").order("sort").order("name"),
    supabase
      .from("cash_entries")
      .select("id, date, amount, note, category_id, created_at")
      .gte("date", range.from)
      .lte("date", range.to)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("orders")
      .select("order_date, advance_paid")
      .neq("status", "cancelled")
      .gt("advance_paid", 0)
      .gte("order_date", range.from)
      .lte("order_date", range.to)
      .limit(20000),
  ]);

  const error = cats.error ?? entries.error;
  if (error) {
    return (
      <div className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900 ring-1 ring-amber-200">
        {/expense_categories|cash_entries/.test(error.message) ? (
          <>
            <p className="font-semibold">One-time database update needed</p>
            <p className="mt-1">
              Open <b>DATABASE-UPDATE-6.sql</b> from your kartzo-manager folder, copy everything, paste it into Supabase → SQL Editor →
              New query, and click Run. Then refresh this page.
            </p>
          </>
        ) : (
          error.message
        )}
      </div>
    );
  }

  return (
    <ExpensesView
      range={{ key: range.key, from: range.from, to: range.to, days: range.days, today }}
      rangeBar={<RangeBar presets={range.presets} current={{ key: range.key, from: range.from, to: range.to }} />}
      categories={(cats.data ?? []) as Category[]}
      entries={(entries.data ?? []) as Entry[]}
      advances={(advances.data ?? []).map((a) => ({ date: a.order_date as string, amount: a.advance_paid as number }))}
    />
  );
}
