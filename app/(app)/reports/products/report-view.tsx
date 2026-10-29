"use client";

import Link from "next/link";
import { CHART, shortDate } from "@/components/charts/chart-utils";
import { LineLegend, TrendChart } from "@/components/charts/trend-chart";
import { shiftDays } from "@/lib/dashboard";
import { ratios, type ProductLine } from "@/lib/product-report";

const rs = (n: number) => (n < 0 ? "−" : "") + "₹" + Math.abs(Math.round(n)).toLocaleString("en-IN");
const pct = (n: number) => `${Math.round(n * 100)}%`;
const num = (n: number) => Math.round(n).toLocaleString("en-IN");

export function ProductReportView({
  range,
  rangeBar,
  lines,
  images,
  colorOrder,
  unallocated,
  days,
}: {
  range: { key: string; from: string; to: string; days: number; today: string };
  rangeBar: React.ReactNode;
  lines: ProductLine[];
  images: Record<string, string | null>;
  colorOrder: string[];
  unallocated: { ads: number; staff: number };
  days: string[];
}) {
  const color = (id: string) => CHART.series[Math.max(0, colorOrder.indexOf(id)) % CHART.series.length];
  const totalNet = lines.reduce((s, l) => s + l.netProfit, 0);

  // daily (or weekly for long ranges) net profit per product
  const weekly = days.length > 45;
  const buckets = new Map<string, Record<string, number>>();
  for (const d of days) {
    const dt = new Date(d + "T00:00:00Z");
    const key = weekly ? shiftDays(d, -((dt.getUTCDay() + 6) % 7)) : d;
    const b = buckets.get(key) ?? {};
    for (const l of lines) b[l.id] = (b[l.id] ?? 0) + (l.daily[d]?.net ?? 0);
    buckets.set(key, b);
  }
  const points = [...buckets.entries()].map(([date, values]) => ({ date, label: weekly ? `Wk ${shortDate(date)}` : shortDate(date), values }));
  const series = lines.map((l) => ({ key: l.id, name: l.name, color: color(l.id) }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Product report</h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-500">
            What each product really earns after product cost, shipping, COD fees, RTO, ads and staff. Ads and staff are shared out each day by how many of
            that day&apos;s orders each product brought in.
          </p>
        </div>
      </div>
      {rangeBar}

      {lines.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center text-sm text-stone-500 ring-1 ring-stone-200">
          No orders in this period. Pick a longer range or{" "}
          <Link href="/orders/new" className="font-medium text-emerald-700 underline">
            add orders
          </Link>
          .
        </div>
      ) : (
        <>
          <Insights lines={lines} unallocated={unallocated} />

          {/* One card per product */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {lines.map((l, i) => (
              <ProductCard key={l.id} l={l} rank={i} img={images[l.id] ?? null} color={color(l.id)} shareOfProfit={totalNet > 0 ? l.netProfit / totalNet : null} />
            ))}
          </div>

          {/* Trend */}
          <section className="rounded-2xl bg-white p-5 ring-1 ring-stone-200">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">Net profit by product</h2>
                <p className="text-xs text-stone-500">
                  {weekly ? "Weekly totals" : "Daily"}, after ads and staff · {shortDate(range.from)} – {shortDate(range.to)}
                </p>
              </div>
              <LineLegend series={series} />
            </div>
            <TrendChart points={points} series={series} />
          </section>

          <CompareTable lines={lines} color={color} />

          <p className="text-xs text-stone-500">
            Other expenses (packing, rent…) are a monthly cost and aren&apos;t split by product. Orders with two different products share their price, shipping and
            ads by each product&apos;s value in the order.
          </p>
        </>
      )}
    </div>
  );
}

/* ---------------- what stands out ---------------- */

function Insights({ lines, unallocated }: { lines: ProductLine[]; unallocated: { ads: number; staff: number } }) {
  const notes: { tone: "good" | "bad" | "info"; text: React.ReactNode }[] = [];
  const withSales = lines.filter((l) => l.orders > 0);
  const best = withSales[0];
  if (best && best.netProfit > 0 && withSales.length > 1)
    notes.push({ tone: "good", text: <>{best.name} is your best earner: {rs(best.netProfit)} net, {rs(ratios(best).profitPerOrder)} per order.</> });

  for (const l of withSales) {
    const r = ratios(l);
    if (l.adSpend > 0 && r.cpo > r.breakEvenCpo)
      notes.push({
        tone: "bad",
        text: (
          <>
            {l.name}: ads cost {rs(r.cpo)} per order but it only makes {rs(r.breakEvenCpo)} before ads, so each order loses {rs(r.cpo - r.breakEvenCpo)}.
          </>
        ),
      });
    else if (l.adSpend > 0 && r.breakEvenCpo > 0 && l.orderShare >= 3)
      notes.push({
        tone: "info",
        text: (
          <>
            {l.name}: you can spend up to {rs(r.breakEvenCpo)} on ads per order and still break even (now {rs(r.cpo)}).
          </>
        ),
      });
    if (l.orders >= 5 && r.rtoRate >= 0.15)
      notes.push({ tone: "bad", text: <>{l.name} has {pct(r.rtoRate)} RTO / returns ({l.rtoCount} of {l.orders} orders), costing {rs(-l.rtoLoss)}.</> });
  }
  if (unallocated.ads > 0)
    notes.push({ tone: "info", text: <>{rs(unallocated.ads)} of ad spend fell on days with no orders, so it isn&apos;t in any product. It still counts on the Dashboard.</> });

  if (!notes.length) return null;
  const dot = { good: "bg-emerald-500", bad: "bg-red-500", info: "bg-sky-500" };
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-stone-200">
      <h2 className="font-semibold">What stands out</h2>
      <ul className="mt-3 space-y-2 text-sm text-stone-700">
        {notes.slice(0, 6).map((n, i) => (
          <li key={i} className="flex gap-2.5">
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dot[n.tone]}`} aria-hidden />
            <span>{n.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------- product card ---------------- */

function ProductCard({ l, rank, img, color, shareOfProfit }: { l: ProductLine; rank: number; img: string | null; color: string; shareOfProfit: number | null }) {
  const r = ratios(l);
  const bad = l.netProfit < 0;
  // break-even meter: how much of the "allowed" ad cost per order is used
  const scale = Math.max(r.breakEvenCpo, r.cpo, 1) * 1.15;
  const over = r.cpo > r.breakEvenCpo;

  return (
    <section className="flex flex-col rounded-2xl bg-white ring-1 ring-stone-200">
      <div className="flex items-start gap-3 p-5 pb-4">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="size-12 shrink-0 rounded-lg object-cover ring-1 ring-stone-200" />
        ) : (
          <div className="grid size-12 shrink-0 place-items-center rounded-lg text-lg font-semibold text-white" style={{ background: color }}>
            {l.name[0]}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-semibold leading-tight">{l.name}</h2>
            {rank === 0 && !bad && <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Top earner</span>}
            {bad && <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">Losing money</span>}
          </div>
          <div className={`mt-1 text-3xl font-semibold tracking-tight ${bad ? "text-red-600" : ""}`}>{rs(l.netProfit)}</div>
          <div className="text-xs text-stone-500">
            net profit{shareOfProfit !== null && l.netProfit > 0 ? ` · ${pct(shareOfProfit)} of total` : ""} · {rs(r.profitPerOrder)} per order
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-3 border-y border-stone-100 text-center text-sm">
        <Cell label="Revenue" value={rs(l.revenue)} />
        <Cell label="Orders" value={num(l.orders)} />
        <Cell label="Pieces" value={num(l.pieces)} />
      </dl>

      <div className="space-y-3 p-5 pt-4 text-sm">
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-stone-600">Ad cost per order</span>
            <span className={`font-semibold ${over ? "text-red-600" : "text-stone-900"}`}>
              {rs(r.cpo)} <span className="font-normal text-stone-400">/ {rs(r.breakEvenCpo)} max</span>
            </span>
          </div>
          <div className="relative mt-1.5 h-2 rounded-full bg-stone-100" aria-hidden>
            <div className={`h-2 rounded-full ${over ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, (r.cpo / scale) * 100)}%` }} />
            {r.breakEvenCpo > 0 && <div className="absolute -top-1 h-4 w-0.5 rounded bg-stone-800" style={{ left: `${Math.min(100, (r.breakEvenCpo / scale) * 100)}%` }} />}
          </div>
          <p className="mt-1 text-xs text-stone-500">
            {r.breakEvenCpo <= 0
              ? "Loses money even before ads."
              : over
                ? `Over break-even by ${rs(r.cpo - r.breakEvenCpo)} per order.`
                : `${rs(r.breakEvenCpo - r.cpo)} per order of room before ads stop paying.`}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-stone-600">
          <Row label="Ad spend" value={rs(l.adSpend)} />
          <Row label="ROAS" value={r.roas ? `${r.roas.toFixed(1)}×` : "–"} />
          <Row label="Before ads" value={rs(l.grossProfit)} />
          <Row label="Margin" value={pct(r.margin)} tone={r.margin < 0 ? "bad" : undefined} />
          <Row label="RTO / returns" value={`${l.rtoCount} · ${pct(r.rtoRate)}`} tone={r.rtoRate >= 0.15 ? "bad" : undefined} />
          <Row label="Avg price" value={rs(r.avgPrice)} />
        </div>
      </div>
    </section>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-stone-100 px-2 py-2.5 last:border-r-0">
      <dt className="text-[11px] text-stone-500">{label}</dt>
      <dd className="mt-0.5 font-semibold text-stone-900">{value}</dd>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs">{label}</span>
      <span className={`font-medium ${tone === "bad" ? "text-red-600" : "text-stone-900"}`}>{value}</span>
    </div>
  );
}

/* ---------------- side-by-side table ---------------- */

function CompareTable({ lines, color }: { lines: ProductLine[]; color: (id: string) => string }) {
  const sum = (f: (l: ProductLine) => number) => lines.reduce((s, l) => s + f(l), 0);
  const T = {
    orders: sum((l) => l.orders),
    share: sum((l) => l.orderShare),
    pieces: sum((l) => l.pieces),
    revenue: sum((l) => l.revenue),
    cost: sum((l) => l.productCost),
    ship: sum((l) => l.shipping),
    cod: sum((l) => l.codFees),
    rto: sum((l) => l.rtoCount),
    rtoLoss: sum((l) => l.rtoLoss),
    gross: sum((l) => l.grossProfit),
    ads: sum((l) => l.adSpend),
    staff: sum((l) => l.staff),
    net: sum((l) => l.netProfit),
    codOrders: sum((l) => l.codOrders),
    kerala: sum((l) => l.keralaOrders),
  };

  type RowDef = { label: string; get: (l: ProductLine) => string; total: string; strong?: boolean; tone?: (l: ProductLine) => "bad" | undefined; hint?: string };
  const rows: (RowDef | "gap")[] = [
    { label: "Orders", get: (l) => num(l.orders), total: num(T.orders) },
    { label: "Pieces sold", get: (l) => num(l.pieces), total: num(T.pieces) },
    { label: "Revenue", get: (l) => rs(l.revenue), total: rs(T.revenue), strong: true },
    { label: "Avg selling price", get: (l) => rs(ratios(l).avgPrice), total: T.pieces ? rs(T.revenue / T.pieces) : "–" },
    "gap",
    { label: "Product cost", get: (l) => rs(-l.productCost), total: rs(-T.cost) },
    { label: "Shipping", get: (l) => rs(-l.shipping), total: rs(-T.ship) },
    { label: "COD fees", get: (l) => rs(-l.codFees), total: rs(-T.cod) },
    { label: "RTO / returns", get: (l) => `${l.rtoCount} (${pct(ratios(l).rtoRate)})`, total: `${T.rto} (${T.orders ? pct(T.rto / T.orders) : "0%"})`, tone: (l) => (ratios(l).rtoRate >= 0.15 ? "bad" : undefined) },
    { label: "RTO loss", get: (l) => rs(l.rtoLoss), total: rs(T.rtoLoss) },
    { label: "Profit before ads", get: (l) => rs(l.grossProfit), total: rs(T.gross), strong: true },
    "gap",
    { label: "Ad spend", get: (l) => rs(-l.adSpend), total: rs(-T.ads) },
    { label: "Ad cost per order", get: (l) => rs(ratios(l).cpo), total: T.share ? rs(T.ads / T.share) : "–", tone: (l) => (ratios(l).cpo > ratios(l).breakEvenCpo ? "bad" : undefined) },
    { label: "Break-even ad cost / order", get: (l) => rs(ratios(l).breakEvenCpo), total: T.share ? rs((T.gross - T.staff) / T.share) : "–", hint: "The most you can spend on ads per order before the product loses money" },
    { label: "ROAS", get: (l) => (ratios(l).roas ? `${ratios(l).roas!.toFixed(1)}×` : "–"), total: T.ads ? `${(T.revenue / T.ads).toFixed(1)}×` : "–", hint: "Revenue ÷ ad spend" },
    { label: "Staff share", get: (l) => rs(-l.staff), total: rs(-T.staff) },
    "gap",
    { label: "Net profit", get: (l) => rs(l.netProfit), total: rs(T.net), strong: true, tone: (l) => (l.netProfit < 0 ? "bad" : undefined) },
    { label: "Net per order", get: (l) => rs(ratios(l).profitPerOrder), total: T.share ? rs(T.net / T.share) : "–" },
    { label: "Margin", get: (l) => pct(ratios(l).margin), total: T.revenue ? pct(T.net / T.revenue) : "–" },
    "gap",
    { label: "COD orders", get: (l) => pct(ratios(l).codShare), total: T.orders ? pct(T.codOrders / T.orders) : "–" },
    { label: "Kerala orders", get: (l) => pct(ratios(l).keralaShare), total: T.orders ? pct(T.kerala / T.orders) : "–" },
  ];

  return (
    <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
      <div className="border-b border-stone-100 px-5 py-4">
        <h2 className="font-semibold">Side by side</h2>
        <p className="text-xs text-stone-500">Every number per product for the selected dates.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr className="bg-stone-50 text-xs font-medium text-stone-500">
              <th className="sticky left-0 z-10 min-w-[170px] bg-stone-50 px-5 py-2.5 text-left" />
              {lines.map((l) => (
                <th key={l.id} className="min-w-[130px] px-4 py-2.5 text-right">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-sm" style={{ background: color(l.id) }} />
                    <span className="max-w-[160px] truncate text-stone-700">{l.name}</span>
                  </span>
                </th>
              ))}
              {lines.length > 1 && <th className="min-w-[120px] px-5 py-2.5 text-right text-stone-700">All products</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) =>
              r === "gap" ? (
                <tr key={"g" + i}>
                  <td colSpan={lines.length + 2} className="h-2 bg-stone-50/60" />
                </tr>
              ) : (
                <tr key={r.label} className={`border-t border-stone-100 ${r.strong ? "font-semibold" : ""}`}>
                  <th scope="row" className="sticky left-0 z-10 bg-white px-5 py-2 text-left font-normal text-stone-600" title={r.hint}>
                    <span className={r.strong ? "font-semibold text-stone-900" : ""}>{r.label}</span>
                    {r.hint && <span className="ml-1 cursor-help text-stone-300">ⓘ</span>}
                  </th>
                  {lines.map((l) => (
                    <td key={l.id} className={`px-4 py-2 text-right ${r.tone?.(l) === "bad" ? "text-red-600" : "text-stone-900"}`}>
                      {r.get(l)}
                    </td>
                  ))}
                  {lines.length > 1 && <td className="px-5 py-2 text-right text-stone-900">{r.total}</td>}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
