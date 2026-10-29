"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { rs } from "@/components/charts/chart-utils";
import type { DayRow } from "@/lib/dashboard";
import { saveDailyInput } from "./actions";

/** Your old "KARTZO DASHBOARD" sheet, newest day first, with ad spend + staff typed in place. */
export function DailyTable({
  rows,
  products,
  today,
  otherCosts,
  costMonths,
  staffAutoFrom,
}: {
  rows: DayRow[];
  products: { key: string; name: string; color: string }[];
  today: string;
  /** monthly business costs taken off this range's total (not any single day) */
  otherCosts: number;
  costMonths: string[];
  staffAutoFrom: string | null;
}) {
  const staffAuto = (date: string) => !!staffAutoFrom && date >= staffAutoFrom;
  const cols = 7 + products.length;
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? 1 : -1));
  const sum = (f: (r: DayRow) => number) => rows.reduce((s, r) => s + f(r), 0);

  const net = sum((r) => r.netProfit);

  return (
    <>
      {/* Phones: one card per day */}
      <div
        className="-mx-5 divide-y divide-stone-100 border-t border-stone-100 sm:hidden"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {sorted.map((r) => (
          <div
            key={r.date}
            className={`px-5 py-3 ${r.orders === 0 && !r.adSpend && !r.staff ? "opacity-60" : ""}`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-sm font-medium text-stone-800">
                {new Date(r.date + "T00:00:00Z").toLocaleDateString("en-IN", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  timeZone: "UTC",
                })}
                {r.date === today && (
                  <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                    TODAY
                  </span>
                )}
              </div>
              <div
                className={`text-base font-semibold ${r.netProfit < 0 ? "text-red-600" : "text-stone-900"}`}
              >
                {rs(r.netProfit)}
              </div>
            </div>
            <div className="mt-0.5 text-xs text-stone-500">
              {r.orders} order{r.orders === 1 ? "" : "s"} · Sales {rs(r.sales)}{" "}
              · Profit {rs(r.grossProfit)}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3 text-xs text-stone-500">
              <div className="flex items-center justify-between gap-2">
                Ads
                {r.adFromWallet ? (
                  <Link
                    href="/ads"
                    className="text-right text-sm text-stone-800"
                  >
                    {rs(r.adSpend)}{" "}
                    <span className="text-[10px] text-emerald-700">wallet</span>
                  </Link>
                ) : (
                  <InputCell
                    date={r.date}
                    field="ad_spend"
                    value={r.adSpend}
                    other={r.staff - r.staffBonus}
                  />
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                Staff
                {staffAuto(r.date) ? (
                  <Link
                    href="/staff"
                    title="Counted from her dispatched orders"
                    className="inline-block min-w-16 rounded-md px-2 py-1 text-right text-sm text-stone-800 hover:bg-stone-100"
                  >
                    {rs(r.staff - r.staffBonus)}
                    <span className="block text-[10px] text-emerald-700">
                      auto
                    </span>
                  </Link>
                ) : (
                  <InputCell
                    date={r.date}
                    field="staff_amount"
                    value={r.staff - r.staffBonus}
                    other={r.adSpend}
                  />
                )}
              </div>
            </div>
          </div>
        ))}
        <div className="flex items-baseline justify-between bg-stone-50 px-5 py-3 text-sm font-semibold">
          <span>
            Total · {sum((r) => r.orders)} orders · {rs(sum((r) => r.sales))}
          </span>
          <span className={net < 0 ? "text-red-600" : ""}>{rs(net)}</span>
        </div>
        {costMonths.length > 0 && (
          <>
            <div className="flex justify-between bg-stone-50 px-5 py-2 text-sm text-stone-600">
              <span>− Other expenses ({costMonths.join(", ")})</span>
              <span>{rs(-otherCosts)}</span>
            </div>
            <div className="flex justify-between bg-stone-100 px-5 py-3 text-sm font-semibold">
              <span>Net profit for {costMonths.join(", ")}</span>
              <span className={net - otherCosts < 0 ? "text-red-600" : ""}>
                {rs(net - otherCosts)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Bigger screens: the sheet */}
      <div className="-mx-5 hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-y border-stone-100 bg-stone-50 text-left text-xs font-medium uppercase tracking-wide text-stone-500">
              <th className="px-5 py-2.5">Date</th>
              <th className="px-3 py-2.5 text-right">Orders</th>
              {products.map((p) => (
                <th key={p.key} className="px-3 py-2.5 text-right">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="size-2 rounded-sm"
                      style={{ background: p.color }}
                    />
                    <span className="max-w-[120px] truncate">{p.name}</span>
                  </span>
                </th>
              ))}
              <th className="px-3 py-2.5 text-right">Sales</th>
              <th className="px-3 py-2.5 text-right">Profit</th>
              <th className="px-3 py-2.5 text-right">Ad spend</th>
              <th className="px-3 py-2.5 text-right">Staff</th>
              <th className="px-3 py-2.5 text-right">After ads</th>
              <th className="px-5 py-2.5 text-right">Net profit</th>
            </tr>
          </thead>
          <tbody
            className="divide-y divide-stone-100"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {sorted.map((r) => (
              <tr key={r.date} className="hover:bg-stone-50/60">
                <td className="whitespace-nowrap px-5 py-2 text-stone-700">
                  {r.date.split("-").reverse().join("-")}
                  {r.date === today && (
                    <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                      TODAY
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.orders || <span className="text-stone-300">0</span>}
                </td>
                {products.map((p) => (
                  <td key={p.key} className="px-3 py-2 text-right">
                    {r.units[p.key] ?? (
                      <span className="text-stone-300">0</span>
                    )}
                  </td>
                ))}
                <td className="px-3 py-2 text-right">{rs(r.sales)}</td>
                <td
                  className={`px-3 py-2 text-right ${r.grossProfit < 0 ? "text-red-600" : ""}`}
                >
                  {rs(r.grossProfit)}
                </td>
                <td className="px-2 py-1 text-right">
                  {r.adFromWallet ? (
                    <Link
                      href="/ads"
                      title="From Ad wallet morning balances"
                      className="inline-block w-24 rounded-md px-2 py-1 text-right hover:bg-stone-100"
                    >
                      {rs(r.adSpend)}
                      <span className="block text-[10px] text-emerald-700">
                        wallet
                      </span>
                    </Link>
                  ) : (
                    <InputCell
                      date={r.date}
                      field="ad_spend"
                      value={r.adSpend}
                      other={r.staff - r.staffBonus}
                    />
                  )}
                </td>
                <td className="px-2 py-1 text-right">
                  {staffAuto(r.date) ? (
                    <Link
                      href="/staff"
                      title="Counted from her dispatched orders"
                      className="inline-block min-w-16 rounded-md px-2 py-1 text-right text-sm text-stone-800 hover:bg-stone-100"
                    >
                      {rs(r.staff - r.staffBonus)}
                      <span className="block text-[10px] text-emerald-700">
                        auto
                      </span>
                    </Link>
                  ) : (
                    <InputCell
                      date={r.date}
                      field="staff_amount"
                      value={r.staff - r.staffBonus}
                      other={r.adSpend}
                    />
                  )}
                  {r.staffBonus > 0 && (
                    <div className="mt-0.5 text-[10px] text-emerald-700">
                      +{rs(r.staffBonus)} bonus
                    </div>
                  )}
                </td>
                <td
                  className={`px-3 py-2 text-right ${r.profitAfterAds < 0 ? "text-red-600" : "text-stone-700"}`}
                >
                  {rs(r.profitAfterAds)}
                </td>
                <td
                  className={`px-5 py-2 text-right font-semibold ${r.netProfit < 0 ? "text-red-600" : "text-stone-900"}`}
                >
                  {rs(r.netProfit)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr
              className="border-t-2 border-stone-200 bg-stone-50 font-semibold"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              <td className="px-5 py-2.5">Total</td>
              <td className="px-3 py-2.5 text-right">{sum((r) => r.orders)}</td>
              {products.map((p) => (
                <td key={p.key} className="px-3 py-2.5 text-right">
                  {sum((r) => r.units[p.key] ?? 0)}
                </td>
              ))}
              <td className="px-3 py-2.5 text-right">
                {rs(sum((r) => r.sales))}
              </td>
              <td className="px-3 py-2.5 text-right">
                {rs(sum((r) => r.grossProfit))}
              </td>
              <td className="px-3 py-2.5 text-right">
                {rs(sum((r) => r.adSpend))}
              </td>
              <td className="px-3 py-2.5 text-right">
                {rs(sum((r) => r.staff))}
              </td>
              <td className="px-3 py-2.5 text-right">
                {rs(sum((r) => r.profitAfterAds))}
              </td>
              <td className="px-5 py-2.5 text-right">
                {rs(sum((r) => r.netProfit))}
              </td>
            </tr>
            {costMonths.length > 0 && (
              <>
                <tr className="bg-stone-50 text-stone-600">
                  <td colSpan={cols} className="px-5 py-2 text-right">
                    − Other expenses for {costMonths.join(", ")}{" "}
                    <span className="text-xs text-stone-400">
                      (Expenses page, counted once for the month)
                    </span>
                  </td>
                  <td className="px-5 py-2 text-right">{rs(-otherCosts)}</td>
                </tr>
                <tr className="bg-stone-100 font-semibold">
                  <td colSpan={cols} className="px-5 py-2.5 text-right">
                    Net profit for {costMonths.join(", ")}
                  </td>
                  <td
                    className={`px-5 py-2.5 text-right ${sum((r) => r.netProfit) - otherCosts < 0 ? "text-red-600" : ""}`}
                  >
                    {rs(sum((r) => r.netProfit) - otherCosts)}
                  </td>
                </tr>
              </>
            )}
          </tfoot>
        </table>
      </div>
    </>
  );
}

function InputCell({
  date,
  field,
  value,
  other,
}: {
  date: string;
  field: "ad_spend" | "staff_amount";
  value: number;
  other: number;
}) {
  const [text, setText] = useState(value ? String(value) : "");
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();

  function save() {
    const n = Math.max(0, Math.round(Number(text) || 0));
    if (n === value) return;
    startTransition(async () => {
      const r = await saveDailyInput({
        date,
        ad_spend: field === "ad_spend" ? n : other,
        staff_amount: field === "staff_amount" ? n : other,
      });
      setState(r.ok ? "saved" : "error");
      if (r.ok) setTimeout(() => setState("idle"), 1500);
    });
  }

  return (
    <div className="relative inline-block">
      <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs text-stone-400">
        ₹
      </span>
      <input
        inputMode="numeric"
        value={text}
        placeholder="0"
        onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={save}
        onKeyDown={(e) =>
          e.key === "Enter" && (e.target as HTMLInputElement).blur()
        }
        aria-label={`${field === "ad_spend" ? "Ad spend" : "Staff"} on ${date}`}
        className={`w-24 rounded-md border bg-white py-1 pl-5 pr-2 text-right text-sm outline-none focus:ring-2 ${
          state === "error"
            ? "border-red-400 focus:ring-red-500/20"
            : state === "saved"
              ? "border-emerald-500 focus:ring-emerald-600/20"
              : "border-stone-200 focus:border-emerald-600 focus:ring-emerald-600/20"
        } ${pending ? "opacity-60" : ""}`}
      />
    </div>
  );
}
