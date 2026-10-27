"use client";

import Link from "next/link";
import { CHART, rs, shortDate } from "@/components/charts/chart-utils";
import { StackedColumns, SwatchLegend } from "@/components/charts/stacked-columns";
import { LineLegend, TrendChart } from "@/components/charts/trend-chart";
import { pctChange, type DayRow, type Totals } from "@/lib/dashboard";
import { STATUS_DOT, STATUS_LABEL, type OrderStatus } from "@/lib/orders";
import { DailyTable } from "./daily-table";

export type DashProduct = { id: string; name: string; active: boolean; lowAt: number; stock: number | null; pending: number };

export type DashData = {
  range: { key: string; from: string; to: string; days: number; chartFrom: string; mode: "day" | "week"; today: string };
  totals: Totals;
  prev: { sales: number; orders: number; netProfit: number; grossProfit: number; hasData: boolean };
  chart: DayRow[];
  rangeDays: DayRow[];
  products: DashProduct[];
  waitingToDispatch: number;
  codInTransitAll: number;
  /** months whose other expenses are taken off in this range, and the running month's total so far */
  otherCosts: { months: string[]; thisMonth: number };
};

export const monthName = (m: string) =>
  new Date(m + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

export function DashboardView({ data }: { data: DashData }) {
  const { totals: t, prev, range } = data;
  const productSeries = data.products
    .filter((p) => p.active || t.units[p.id])
    .map((p, i) => ({ key: p.id, name: p.name, color: CHART.series[i % CHART.series.length] }));

  const trendSeries = [
    { key: "sales", name: "Sales", color: CHART.context },
    { key: "net", name: "Net profit", color: CHART.series[2], emphasis: true },
  ];
  const fmtLabel = (d: DayRow) => (range.mode === "week" ? `Wk ${shortDate(d.date)}` : shortDate(d.date));
  const trendPoints = data.chart.map((d) => ({ date: d.date, label: fmtLabel(d), values: { sales: d.sales, net: d.netProfit } }));
  const unitPoints = data.chart.map((d) => ({ date: d.date, label: fmtLabel(d), values: d.units }));
  const chartNote =
    range.days < 7 ? "Last 14 days, for context" : range.mode === "week" ? "Weekly totals" : "Daily";

  const totalUnits = Object.values(t.units).reduce((s, v) => s + v, 0);
  const margin = t.sales ? Math.round((t.netProfit / t.sales) * 100) : 0;
  const prevLabel = range.days === 1 ? "previous day" : `previous ${range.days} days`;

  return (
    <div className="space-y-5">
      {/* KPI band */}
      <div className="grid gap-4 xl:grid-cols-[minmax(280px,1fr)_3fr]">
        <div className="relative overflow-hidden rounded-2xl bg-stone-900 p-6 text-white">
          <div className="text-sm text-stone-300">Net profit</div>
          <div className={`mt-2 text-5xl font-semibold tracking-tight ${t.netProfit < 0 ? "text-red-300" : ""}`}>{rs(t.netProfit)}</div>
          <Delta now={t.netProfit} before={prev.netProfit} show={prev.hasData} label={prevLabel} dark />
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-sm">
            <div>
              <div className="text-stone-400">Margin on sales</div>
              <div className="font-semibold">{margin}%</div>
            </div>
            <div>
              <div className="text-stone-400">Per order</div>
              <div className="font-semibold">{rs(t.orders ? t.netProfit / t.orders : 0)}</div>
            </div>
          </div>
          <p className="mt-4 text-xs text-stone-400">
            After product cost, shipping, COD fees, RTO, ads and staff
            {data.otherCosts.months.length
              ? `, and ${data.otherCosts.months.map(monthName).join(", ")} other expenses (${rs(t.otherCosts)}).`
              : `. Other expenses are monthly (${rs(data.otherCosts.thisMonth)} this month so far): pick "This month" to see them taken off.`}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Sales" value={rs(t.sales)} delta={<Delta now={t.sales} before={prev.sales} show={prev.hasData} label={prevLabel} />} />
          <Kpi label="Orders" value={t.orders.toLocaleString("en-IN")} delta={<Delta now={t.orders} before={prev.orders} show={prev.hasData} label={prevLabel} />} />
          <Kpi
            label="Pieces sold"
            value={totalUnits.toLocaleString("en-IN")}
            sub={
              <div className="mt-1 space-y-0.5">
                {productSeries.map((s) => (
                  <div key={s.key} className="flex items-center gap-1.5 text-xs text-stone-500">
                    <span className="size-2 rounded-sm" style={{ background: s.color }} />
                    <span className="truncate">{s.name}</span>
                    <span className="ml-auto font-medium text-stone-700">{t.units[s.key] ?? 0}</span>
                  </div>
                ))}
              </div>
            }
          />
          <Kpi label="Profit before ads" value={rs(t.grossProfit)} />
          <Kpi label="Ad spend" value={rs(t.adSpend)} sub={<SubNote>{t.orders ? `${rs(t.adSpend / t.orders)} per order` : "—"}</SubNote>} />
          <Kpi label="Staff" value={rs(t.staff)} />
          <Kpi
            label="RTO & returns"
            value={String(t.rtoCount)}
            tone={t.rtoCount ? "bad" : undefined}
            sub={<SubNote>{t.rtoLoss ? `${rs(t.rtoLoss)} result` : "No losses"}{t.orders ? ` · ${Math.round((t.rtoCount / t.orders) * 100)}% of orders` : ""}</SubNote>}
          />
          <Kpi label="COD in transit" value={rs(data.codInTransitAll)} sub={<SubNote>All dispatched COD orders</SubNote>} />
        </div>
      </div>

      {/* Trend + money breakdown */}
      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card title="Sales and net profit" note={chartNote} right={<LineLegend series={trendSeries} />}>
          <TrendChart points={trendPoints} series={trendSeries} />
        </Card>
        <Card title="Where the money went" note={`${shortDate(range.from)} – ${shortDate(range.to)}`}>
          <MoneyBreakdown t={t} months={data.otherCosts.months} />
        </Card>
      </div>

      {/* Units + side panel */}
      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card title="Pieces sold by product" note={chartNote} right={<SwatchLegend series={productSeries} />}>
          <StackedColumns points={unitPoints} series={productSeries} />
        </Card>
        <div className="space-y-4">
          <Card title="Order status" note="Orders in this period">
            <StatusList counts={t.statusCounts} />
          </Card>
          <Card title="Needs attention">
            <Attention data={data} />
          </Card>
        </div>
      </div>

      <Card title="Day by day" note="Type ad spend and staff amount for each day. They save when you leave the box.">
        <DailyTable
          rows={data.rangeDays}
          products={productSeries}
          today={range.today}
          otherCosts={t.otherCosts}
          costMonths={data.otherCosts.months.map(monthName)}
        />
      </Card>
    </div>
  );
}

/* ---------------- pieces ---------------- */

function Card({ title, note, right, children }: { title: string; note?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-stone-200">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-stone-900">{title}</h2>
          {note && <p className="text-xs text-stone-500">{note}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value, delta, sub, tone }: { label: string; value: string; delta?: React.ReactNode; sub?: React.ReactNode; tone?: "bad" }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <div className="text-sm text-stone-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight ${tone === "bad" ? "text-red-600" : "text-stone-900"}`}>{value}</div>
      {delta}
      {sub}
    </div>
  );
}

function SubNote({ children }: { children: React.ReactNode }) {
  return <div className="mt-1 text-xs text-stone-500">{children}</div>;
}

function Delta({ now, before, show, label, dark }: { now: number; before: number; show: boolean; label: string; dark?: boolean }) {
  if (!show) return <div className={`mt-1 text-xs ${dark ? "text-stone-400" : "text-stone-400"}`}>No earlier data to compare</div>;
  const pct = pctChange(now, before);
  if (pct === null) return null;
  const up = pct >= 0;
  const color = dark ? (up ? "text-emerald-300" : "text-red-300") : up ? "text-emerald-700" : "text-red-600";
  return (
    <div className={`mt-1 flex items-center gap-1 text-xs ${color}`}>
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      <span className="font-semibold">{Math.abs(pct)}%</span>
      <span className={dark ? "text-stone-400" : "text-stone-500"}>vs {label}</span>
    </div>
  );
}

/** Sales split into costs and what's left. One accent (net profit), costs in neutral grey. */
function MoneyBreakdown({ t, months }: { t: Totals; months: string[] }) {
  const rows: { label: string; value: number; accent?: boolean }[] = [
    { label: "Product cost", value: t.productCost },
    { label: "Shipping", value: t.shipping },
    { label: "COD commission", value: t.codFees },
    { label: "RTO & returns", value: Math.max(0, -t.rtoLoss) },
    { label: "Ads", value: t.adSpend },
    { label: "Staff", value: t.staff },
    ...(months.length ? [{ label: `Other expenses (${months.map(monthName).join(", ")})`, value: t.otherCosts }] : []),
    { label: "Net profit", value: t.netProfit, accent: true },
  ];
  const base = Math.max(t.sales, 1);
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-sm text-stone-500">Sales</span>
        <span className="text-lg font-semibold">{rs(t.sales)}</span>
      </div>
      <ul className="space-y-2.5">
        {rows.map((r) => {
          const pct = Math.round((Math.max(0, r.value) / base) * 100);
          return (
            <li key={r.label}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className={r.accent ? "font-semibold text-stone-900" : "text-stone-600"}>{r.label}</span>
                <span className={r.accent ? (r.value < 0 ? "font-semibold text-red-600" : "font-semibold text-stone-900") : "text-stone-700"}>
                  {rs(r.value)} <span className="text-xs text-stone-400">{t.sales ? `${pct}%` : ""}</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-stone-100">
                <div
                  className="h-1.5 rounded-full"
                  style={{ width: `${Math.min(100, pct)}%`, background: r.accent ? CHART.series[2] : "#a8a69e" }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StatusList({ counts }: { counts: Record<string, number> }) {
  const order: OrderStatus[] = ["new", "dispatched", "delivered", "rto", "returned", "cancelled"];
  const total = order.reduce((s, k) => s + (counts[k] ?? 0), 0);
  if (!total) return <p className="text-sm text-stone-500">No orders in this period.</p>;
  return (
    <ul className="space-y-2">
      {order.map((k) => (
        <li key={k} className="flex items-center gap-2 text-sm">
          <span className={`size-2 rounded-full ${STATUS_DOT[k]}`} />
          <Link href={`/orders?status=${k}&range=all`} className="text-stone-700 hover:text-emerald-700">
            {STATUS_LABEL[k]}
          </Link>
          <span className="ml-auto font-medium text-stone-900" style={{ fontVariantNumeric: "tabular-nums" }}>
            {counts[k] ?? 0}
          </span>
          <span className="w-10 text-right text-xs text-stone-400">{Math.round(((counts[k] ?? 0) / total) * 100)}%</span>
        </li>
      ))}
    </ul>
  );
}

function Attention({ data }: { data: DashData }) {
  const items: { tone: "bad" | "warn" | "ok"; text: React.ReactNode; href?: string }[] = [];
  for (const p of data.products.filter((p) => p.active)) {
    if (p.stock === null) continue;
    if (p.stock <= 0) items.push({ tone: "bad", text: <>Out of stock: <b>{p.name}</b></>, href: "/products" });
    else if (p.stock <= p.lowAt) items.push({ tone: "warn", text: <>Low stock: <b>{p.name}</b> ({p.stock} left)</>, href: "/products" });
  }
  if (data.waitingToDispatch > 0)
    items.push({
      tone: "warn",
      text: <><b>{data.waitingToDispatch}</b> older order{data.waitingToDispatch > 1 ? "s" : ""} still not dispatched</>,
      href: "/orders?status=new&range=all",
    });
  if (!items.length) items.push({ tone: "ok", text: "All good: stock is fine and nothing is waiting." });

  const icon = { bad: "!", warn: "!", ok: "✓" };
  const style = { bad: "bg-red-100 text-red-700", warn: "bg-amber-100 text-amber-800", ok: "bg-emerald-100 text-emerald-800" };
  return (
    <ul className="space-y-2">
      {items.map((it, i) => {
        const body = (
          <span className="flex items-start gap-2 text-sm text-stone-700">
            <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold ${style[it.tone]}`}>{icon[it.tone]}</span>
            <span>{it.text}</span>
          </span>
        );
        return (
          <li key={i}>
            {it.href ? (
              <Link href={it.href} className="block rounded-md hover:bg-stone-50">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}
