"use client";

import Link from "next/link";
import { useState } from "react";
import { shiftDays } from "@/lib/dashboard";
import { saveProductSpend, type Result } from "./actions";

export type ProductSpend = { date: string; product_id: string; amount: number };
type Product = { id: string; name: string; active: boolean };

const rs = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const short = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const input =
  "w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";

/**
 * Each product's campaign spend for a day (typed from Ads Manager).
 * The day's real cost from the wallet is split between products in this ratio (Product report uses it).
 */
export function ProductSpendCard({
  today,
  products,
  entries,
  walletCost,
  pending,
  run,
}: {
  today: string;
  products: Product[];
  /** null = DATABASE-UPDATE-15 not run yet */
  entries: ProductSpend[] | null;
  /** date → real ad cost from the wallet (incl. GST) */
  walletCost: Map<string, number>;
  pending: boolean;
  run: (fn: () => Promise<Result>) => void;
}) {
  const yesterday = shiftDays(today, -1);
  const [date, setDate] = useState(yesterday);
  const saved = (d: string) => Object.fromEntries((entries ?? []).filter((e) => e.date === d).map((e) => [e.product_id, String(e.amount)]));
  const [vals, setVals] = useState<Record<string, string>>(() => saved(yesterday));
  const [shownFor, setShownFor] = useState(date);
  if (shownFor !== date) {
    setShownFor(date);
    setVals(saved(date));
  }

  if (entries === null)
    return (
      <section className="rounded-2xl bg-amber-50 p-5 text-sm text-amber-900 ring-1 ring-amber-200">
        <p className="font-semibold">Ad spend per product</p>
        <p className="mt-1">
          Run <b>DATABASE-UPDATE-15.sql</b> in Supabase to type each product&apos;s campaign spend and see real profit per product.
        </p>
      </section>
    );

  const savedNow = saved(date);
  const shown = products.filter((p) => p.active || savedNow[p.id] !== undefined);
  const typed = shown.reduce((s, p) => s + (Number(vals[p.id]) || 0), 0);
  const realCost = (d: string) => {
    const c = walletCost.get(d);
    return c !== undefined && c > 0 ? c : undefined;
  };
  const cost = realCost(date);
  const dirty = shown.some((p) => (vals[p.id] ?? "") !== (savedNow[p.id] ?? ""));

  // recent days with numbers, newest first
  const byDate = new Map<string, ProductSpend[]>();
  for (const e of entries) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const recent = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 14);
  const name = new Map(products.map((p) => [p.id, p.name]));

  // days in the last week with wallet spend but no product numbers yet
  const missing = Array.from({ length: 7 }, (_, i) => shiftDays(yesterday, -i)).filter((d) => (walletCost.get(d) ?? 0) > 0 && !byDate.has(d));

  return (
    <section className="rounded-2xl bg-white ring-1 ring-stone-200">
      <div className="border-b border-stone-100 px-5 py-4">
        <h2 className="font-semibold">Ad spend per product</h2>
        <p className="mt-0.5 text-xs text-stone-500">
          In Ads Manager open <b>Campaigns</b>, set the date to the day below and type what each product&apos;s campaign spent. That
          day&apos;s real wallet cost (with GST) is split in the same ratio, so the <b>Product report</b> shows true profit or loss per
          product. Days you skip are split by orders.
        </p>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,380px)_1fr]">
        {/* entry */}
        <form
          className="space-y-3 border-b border-stone-100 p-5 lg:border-r lg:border-b-0"
          onSubmit={(e) => {
            e.preventDefault();
            const amounts = Object.fromEntries(shown.map((p) => [p.id, vals[p.id] ? Number(vals[p.id]) : null]));
            run(() => saveProductSpend({ date, amounts }));
          }}
        >
          <label className="block text-xs font-medium text-stone-500">
            Day
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={`${input} mt-1`} />
          </label>

          {missing.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-stone-500">Not filled:</span>
              {missing.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDate(d)}
                  className={`rounded-full px-2 py-0.5 font-medium ring-1 ${d === date ? "bg-amber-100 text-amber-900 ring-amber-300" : "text-amber-800 ring-amber-200 hover:bg-amber-50"}`}
                >
                  {short(d)}
                </button>
              ))}
            </div>
          )}

          <div className="divide-y divide-stone-100 rounded-xl ring-1 ring-stone-200">
            {shown.map((p) => {
              const v = Number(vals[p.id]) || 0;
              const share = typed > 0 && cost ? (cost * v) / typed : null;
              return (
                <label key={p.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-stone-800">{p.name}</span>
                    {share !== null && v > 0 && <span className="text-[11px] text-stone-500">real cost {rs(share)}</span>}
                  </span>
                  <span className="relative w-28 shrink-0">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-stone-400">₹</span>
                    <input
                      inputMode="numeric"
                      value={vals[p.id] ?? ""}
                      onChange={(e) => setVals({ ...vals, [p.id]: e.target.value.replace(/[^\d]/g, "") })}
                      placeholder="0"
                      className={`${input} pl-7 text-right font-semibold`}
                    />
                  </span>
                </label>
              );
            })}
            {!shown.length && <p className="px-3 py-4 text-sm text-stone-500">Add products first.</p>}
          </div>

          <div className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600 ring-1 ring-stone-200">
            <div className="flex justify-between">
              <span>Typed from Ads Manager</span>
              <b className="text-stone-900">{rs(typed)}</b>
            </div>
            <div className="mt-0.5 flex justify-between">
              <span>Wallet cost that day</span>
              <b className="text-stone-900">{cost !== undefined ? rs(cost) : "—"}</b>
            </div>
            {cost === undefined && (
              <p className="mt-1 text-amber-700">Not known yet (needs the next morning&apos;s wallet balance). You can still save the numbers now.</p>
            )}
          </div>

          <button
            disabled={pending || !dirty}
            className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {Object.keys(savedNow).length ? "Update" : "Save"} {short(date)}
          </button>
        </form>

        {/* recent */}
        <div className="min-w-0 p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-stone-700">Recent days</h3>
            <Link href="/reports/products/daily" className="text-sm font-medium text-emerald-700 hover:underline">
              Profit / loss per day →
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="mt-2 text-sm text-stone-500">Nothing typed yet. Start with yesterday.</p>
          ) : (
            <ul className="mt-2 divide-y divide-stone-100">
              {recent.map(([d, rows]) => {
                const t = rows.reduce((s, r) => s + r.amount, 0);
                const c = realCost(d);
                return (
                  <li key={d}>
                    <button
                      type="button"
                      onClick={() => setDate(d)}
                      className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2 text-left hover:bg-stone-50 ${d === date ? "bg-emerald-50/60" : ""}`}
                    >
                      <span className="w-24 shrink-0 text-sm font-medium text-stone-800">{short(d)}</span>
                      <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                        {rows
                          .filter((r) => r.amount > 0)
                          .sort((a, b) => b.amount - a.amount)
                          .map((r) => (
                            <span key={r.product_id} className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-700">
                              {name.get(r.product_id) ?? "Product"} {rs(c && t ? (c * r.amount) / t : r.amount)}
                            </span>
                          ))}
                      </span>
                      <span className="text-right text-xs text-stone-500">
                        {c !== undefined ? (
                          <>
                            <b className="text-stone-800">{rs(c)}</b> real
                          </>
                        ) : (
                          `${rs(t)} typed`
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
