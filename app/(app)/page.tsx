import Link from "next/link";
import { DashboardSkeleton } from "@/components/skeleton";
import { Suspense } from "react";
import { spendByDay } from "@/lib/ad-wallet";
import { loadWallet } from "@/lib/ad-wallet-data";
import { aggregateDays, bucket, costsForMonths, eachDay, monthsCovered, shiftDays, totals, type CostEntry, type DailyInput, type DashOrder } from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/server";
import { requestToday } from "@/lib/today";
import { DashboardView, type DashData } from "./_dashboard/dashboard-view";
import { RangeBar } from "./_dashboard/range-bar";

type Search = Record<string, string | string[] | undefined>;

export default function DashboardPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-stone-500">Sales and profit by order date. Ad spend comes from the Ad wallet page; type staff amounts in the table below.</p>
        </div>
        <Link href="/orders/new" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
          + Add orders
        </Link>
      </div>
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function ranges(today: string) {
  const monthStart = today.slice(0, 8) + "01";
  const lastMonthEnd = shiftDays(monthStart, -1);
  const lastMonthStart = lastMonthEnd.slice(0, 8) + "01";
  return [
    { key: "today", label: "Today", from: today, to: today },
    { key: "yesterday", label: "Yesterday", from: shiftDays(today, -1), to: shiftDays(today, -1) },
    { key: "7d", label: "Last 7 days", from: shiftDays(today, -6), to: today },
    { key: "30d", label: "Last 30 days", from: shiftDays(today, -29), to: today },
    { key: "month", label: "This month", from: monthStart, to: today },
    { key: "lastmonth", label: "Last month", from: lastMonthStart, to: lastMonthEnd },
    { key: "90d", label: "Last 90 days", from: shiftDays(today, -89), to: today },
  ];
}

const ORDER_COLS =
  "order_date, status, order_value, profit, items_cost, shipping_cost, cod_fee, payment_mode, cod_balance, items:order_items(product_id, qty)";

async function Dashboard({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const today = await requestToday();
  const presets = ranges(today);
  const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

  let key = one(sp.range) ?? "30d";
  let from: string;
  let to: string;
  const preset = presets.find((p) => p.key === key);
  if (preset) {
    ({ from, to } = preset);
  } else if (isDate(one(sp.from)) && isDate(one(sp.to))) {
    key = "custom";
    from = one(sp.from)!;
    to = one(sp.to)!;
    if (from > to) [from, to] = [to, from];
  } else {
    key = "30d";
    ({ from, to } = presets[3]);
  }

  const days = eachDay(from, to).length;
  // Short ranges still get 14 days of chart context
  const chartFrom = days < 7 ? shiftDays(to, -13) : from;
  const prevTo = shiftDays(from, -1);
  const prevFrom = shiftDays(from, -days);
  const fetchFrom = [chartFrom, prevFrom].sort()[0];

  const supabase = await createClient();
  const [ordersRes, inputsRes, productsRes, stockRes, waitingRes, transitRes, costsRes] = await Promise.all([
    supabase.from("orders").select(ORDER_COLS).gte("order_date", fetchFrom).lte("order_date", to).limit(20000),
    supabase.from("daily_inputs").select("*").gte("date", fetchFrom).lte("date", to),
    supabase.from("products").select("id, name, low_stock_alert, active").order("name", { ascending: false }),
    supabase.from("product_stock").select("product_id, stock_added, sold, pending"),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "new").lt("order_date", today),
    supabase.from("orders").select("cod_balance").eq("status", "dispatched").eq("payment_mode", "cod").limit(20000),
    supabase
      .from("cash_entries")
      .select("date, amount, category:expense_categories!inner(kind)")
      .eq("category.kind", "cost")
      .gte("date", [fetchFrom, today.slice(0, 8) + "01"].sort()[0])
      .lte("date", [to, today].sort()[1])
      .limit(20000),
  ]);

  const error = ordersRes.error ?? inputsRes.error ?? productsRes.error;
  if (error) {
    const needsUpdate = /order_items|items_cost/.test(error.message);
    return (
      <p className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900 ring-1 ring-amber-200">
        {needsUpdate ? "Run DATABASE-UPDATE-5.sql in Supabase first, then refresh this page." : error.message}
      </p>
    );
  }

  const orders = (ordersRes.data ?? []) as unknown as DashOrder[];
  const inputs: DailyInput[] = (inputsRes.data ?? []).map((i) => ({
    date: i.date,
    ad_spend: i.ad_spend ?? 0,
    staff_amount: i.staff_amount ?? 0,
    staff_bonus: i.staff_bonus ?? 0, // column added in DATABASE-UPDATE-7
  }));
  // Ad spend from the Ad wallet page wins over hand-typed numbers (ignored until DATABASE-UPDATE-11 is run)
  const wallet = await loadWallet(supabase, fetchFrom, to);
  if (wallet.ready) {
    const byInput = new Map(inputs.map((i) => [i.date, i]));
    for (const [date, cost] of spendByDay(wallet.periods)) {
      if (date < fetchFrom || date > to) continue;
      const row = byInput.get(date);
      if (row) Object.assign(row, { ad_spend: cost, ad_from_wallet: true });
      else inputs.push({ date, ad_spend: cost, staff_amount: 0, staff_bonus: 0, ad_from_wallet: true });
    }
  }
  // Business costs from Expenses (ignored until DATABASE-UPDATE-6 is run)
  const costs: CostEntry[] = costsRes.error ? [] : (costsRes.data ?? []).map((c) => ({ date: c.date, amount: c.amount }));

  const rangeDays = aggregateDays(orders, inputs, from, to, costs);
  const chartDays = aggregateDays(orders, inputs, chartFrom, to, costs);
  const prevDays = aggregateDays(orders, inputs, prevFrom, prevTo, costs);
  // Other expenses are a monthly cost: only taken off when the range covers whole months
  const costMonths = monthsCovered(from, to, today);
  const t = totals(orders, rangeDays, costsForMonths(costs, costMonths));
  const prev = totals(orders, prevDays, costsForMonths(costs, monthsCovered(prevFrom, prevTo, today)));
  const thisMonthCosts = costsForMonths(costs, [today.slice(0, 7)]);

  const mode = chartDays.length > 45 ? "week" : "day";
  const chart = bucket(chartDays, mode);

  const stockById = new Map((stockRes.data ?? []).map((s) => [s.product_id, s]));
  const products = (productsRes.data ?? []).map((p) => {
    const s = stockById.get(p.id);
    return {
      id: p.id as string,
      name: p.name as string,
      active: p.active as boolean,
      lowAt: p.low_stock_alert as number,
      stock: s ? s.stock_added - s.sold : null,
      pending: s?.pending ?? 0,
    };
  });

  const data: DashData = {
    otherCosts: { months: costMonths, thisMonth: thisMonthCosts },
    range: { key, from, to, days, chartFrom, mode, today },
    totals: t,
    prev: { sales: prev.sales, orders: prev.orders, netProfit: prev.netProfit, grossProfit: prev.grossProfit, hasData: prev.orders > 0 },
    chart,
    rangeDays,
    products,
    waitingToDispatch: waitingRes.count ?? 0,
    codInTransitAll: (transitRes.data ?? []).reduce((s, o) => s + (o.cod_balance ?? 0), 0),
  };

  return (
    <div className="space-y-5">
      <RangeBar presets={presets.map(({ key, label }) => ({ key, label }))} current={{ key, from, to }} />
      <DashboardView data={data} />
    </div>
  );
}
