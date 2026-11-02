"use client";

import Link from "next/link";
import { useState } from "react";
import type { DayLine } from "@/lib/product-report";

type Line = { id: string; name: string; daily: Record<string, DayLine> };

const rs = (n: number) =>
  (Math.round(n) < 0 ? "−" : "") +
  "₹" +
  Math.abs(Math.round(n)).toLocaleString("en-IN");
const dayName = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

function NetPill({ n, big = false }: { n: number; big?: boolean }) {
  const r = Math.round(n);
  const tone =
    r > 0
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : r < 0
        ? "bg-rose-50 text-rose-700 ring-rose-200"
        : "bg-stone-50 text-stone-500 ring-stone-200";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap ring-1 ${tone} ${big ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"}`}
    >
      {r > 0 ? "Profit" : r < 0 ? "Loss" : "Even"} {rs(Math.abs(r))}
    </span>
  );
}

const active = (d?: DayLine) => !!d && (d.orders > 0 || Math.round(d.ad) > 0);

/** Every product's profit or loss after ads, one day at a time. */
export function DailyProductsView({
  rangeBar,
  days,
  today,
  lines,
  campaignDates,
  dayAds,
}: {
  rangeBar: React.ReactNode;
  /** newest first */
  days: string[];
  today: string;
  lines: Line[];
  campaignDates: string[];
  dayAds: Record<string, number>;
}) {
  const [pick, setPick] = useState<string | "all">("all");
  const campaign = new Set(campaignDates);
  const shown = pick === "all" ? lines : lines.filter((l) => l.id === pick);

  const totalFor = (l: Line) =>
    days.reduce((s, d) => s + (l.daily[d]?.net ?? 0), 0);
  const dayRows = days.map((d) => ({
    date: d,
    rows: shown
      .filter((l) => active(l.daily[d]))
      .map((l) => ({ l, v: l.daily[d] })),
  }));
  const total = shown.reduce((s, l) => s + totalFor(l), 0);
  const withActivity = dayRows.filter((r) => r.rows.length);
  const profitDays = withActivity.filter(
    (r) => r.rows.reduce((s, x) => s + x.v.net, 0) >= 0.5,
  ).length;
  const lossDays = withActivity.filter(
    (r) => r.rows.reduce((s, x) => s + x.v.net, 0) <= -0.5,
  ).length;

  const chip = (id: string | "all", label: string, net?: number) => (
    <button
      key={id}
      type="button"
      onClick={() => setPick(id)}
      className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap ring-1 transition ${
        pick === id
          ? "bg-stone-900 text-white ring-stone-900"
          : "bg-white text-stone-700 ring-stone-200 hover:bg-stone-50"
      }`}
    >
      {label}
      {net !== undefined && (
        <span
          className={`ml-1.5 text-xs ${pick === id ? "text-white/70" : net < 0 ? "text-rose-600" : "text-emerald-700"}`}
        >
          {rs(net)}
        </span>
      )}
    </button>
  );

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/reports/products"
          className="text-sm font-medium text-emerald-700 hover:underline"
        >
          ← Product report
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Profit per product, day by day
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-500">
          For each day: what each product&apos;s orders earned before ads, what
          its ads cost, and whether it ended in profit or loss after ads and
          staff.
        </p>
      </div>
      {rangeBar}

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {chip("all", "All products")}
        {lines.map((l) => chip(l.id, l.name, totalFor(l)))}
      </div>

      {/* summary */}
      <div className="grid grid-cols-3 gap-3">
        <div
          className={`rounded-2xl p-4 ring-1 ${total < 0 ? "bg-rose-50 ring-rose-200" : "bg-emerald-50 ring-emerald-200"}`}
        >
          <div className="text-xs text-stone-600">
            {total < 0 ? "Total loss" : "Total profit"}
          </div>
          <div
            className={`mt-1 text-xl font-semibold tracking-tight sm:text-2xl ${total < 0 ? "text-rose-700" : "text-emerald-800"}`}
          >
            {rs(Math.abs(total))}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
          <div className="text-xs text-stone-600">Days in profit</div>
          <div className="mt-1 text-xl font-semibold tracking-tight text-emerald-700 sm:text-2xl">
            {profitDays}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
          <div className="text-xs text-stone-600">Days in loss</div>
          <div className="mt-1 text-xl font-semibold tracking-tight text-rose-700 sm:text-2xl">
            {lossDays}
          </div>
        </div>
      </div>

      {/* one card per day */}
      <div className="space-y-3">
        {withActivity.length === 0 && (
          <div className="rounded-2xl bg-white p-10 text-center text-sm text-stone-500 ring-1 ring-stone-200">
            No orders or ad spend in this period.
          </div>
        )}
        {withActivity.map(({ date, rows }) => {
          const net = rows.reduce((s, x) => s + x.v.net, 0);
          return (
            <section
              key={date}
              className="overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200"
            >
              <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-stone-100 px-4 py-3">
                <h2 className="font-semibold text-stone-900">
                  {dayName(date)}
                  {date === today && (
                    <span className="ml-1.5 text-xs font-medium text-amber-700">
                      today, not finished
                    </span>
                  )}
                </h2>
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${campaign.has(date) ? "bg-sky-50 text-sky-700" : "bg-stone-100 text-stone-500"}`}
                  title={
                    campaign.has(date)
                      ? "Ads split by the campaign numbers you typed"
                      : "No campaign numbers typed, so ads are split by orders"
                  }
                >
                  {campaign.has(date)
                    ? "Campaign numbers"
                    : "Ads split by orders"}
                </span>
                {pick === "all" && (dayAds[date] ?? 0) > 0 && (
                  <span className="text-xs text-stone-500">
                    ads {rs(dayAds[date])}
                  </span>
                )}
                <span className="ml-auto">
                  {rows.length > 0 && <NetPill n={net} big />}
                </span>
              </header>

              {
                <>
                  <div className="hidden grid-cols-[minmax(0,1.6fr)_repeat(6,minmax(0,1fr))] gap-3 bg-stone-50 px-4 py-2 text-[11px] font-medium tracking-wide text-stone-500 uppercase md:grid">
                    <span>Product</span>
                    <span className="text-right">Orders</span>
                    <span className="text-right">Sales</span>
                    <span className="text-right">Before ads</span>
                    <span className="text-right">Ads</span>
                    <span className="text-right">Ad / order</span>
                    <span className="text-right">After ads</span>
                  </div>
                  <ul className="divide-y divide-stone-100">
                    {rows
                      .sort((a, b) => b.v.net - a.v.net)
                      .map(({ l, v }) => (
                        <li
                          key={l.id}
                          className="px-4 py-3 md:grid md:grid-cols-[minmax(0,1.6fr)_repeat(6,minmax(0,1fr))] md:items-center md:gap-3 md:py-2.5"
                        >
                          {/* phone */}
                          <div className="flex items-center justify-between gap-3 md:contents">
                            <span className="min-w-0 truncate text-sm font-medium text-stone-900">
                              {l.name}
                            </span>
                            <span className="md:hidden">
                              <NetPill n={v.net} />
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-stone-500 md:hidden">
                            <span>
                              <b className="text-stone-800">{v.orders}</b> order
                              {v.orders === 1 ? "" : "s"}
                              {v.rto ? ` (${v.rto} RTO)` : ""}
                            </span>
                            <span>
                              before ads{" "}
                              <b className="text-stone-800">{rs(v.gross)}</b>
                            </span>
                            <span>
                              ads <b className="text-stone-800">{rs(v.ad)}</b>
                              {v.orders > 0 && v.ad > 0
                                ? ` · ${rs(v.ad / v.orders)}/order`
                                : ""}
                            </span>
                            {v.staff > 0 && <span>staff {rs(v.staff)}</span>}
                          </div>
                          {/* desktop */}
                          <span className="hidden text-right text-sm text-stone-700 md:block">
                            {v.orders}
                            {v.rto ? (
                              <span className="text-xs text-rose-600">
                                {" "}
                                ({v.rto} RTO)
                              </span>
                            ) : null}
                          </span>
                          <span className="hidden text-right text-sm text-stone-700 md:block">
                            {rs(v.revenue)}
                          </span>
                          <span className="hidden text-right text-sm text-stone-700 md:block">
                            {rs(v.gross)}
                          </span>
                          <span className="hidden text-right text-sm text-stone-700 md:block">
                            {rs(v.ad)}
                          </span>
                          <span className="hidden text-right text-sm text-stone-500 md:block">
                            {v.orders && v.ad ? rs(v.ad / v.orders) : "—"}
                          </span>
                          <span className="hidden text-right md:block">
                            <NetPill n={v.net} />
                          </span>
                        </li>
                      ))}
                  </ul>
                </>
              }
            </section>
          );
        })}
      </div>

      {dayRows.length > withActivity.length && withActivity.length > 0 && (
        <p className="text-xs text-stone-400">
          {dayRows.length - withActivity.length} day
          {dayRows.length - withActivity.length === 1 ? "" : "s"} with no orders
          or ad spend are hidden.
        </p>
      )}
      <p className="text-xs text-stone-500">
        <b>Before ads</b> = order value − product cost − shipping − COD fee (RTO
        orders count their loss). <b>After ads</b> also takes off the
        product&apos;s ad cost and its share of staff pay. Other monthly
        expenses aren&apos;t included.
      </p>
    </div>
  );
}
