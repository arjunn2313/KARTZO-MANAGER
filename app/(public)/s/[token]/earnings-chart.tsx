"use client";

import { useState } from "react";
import { CHART } from "@/components/charts/chart-utils";
import { StackedColumns, type ColumnPoint } from "@/components/charts/stacked-columns";

const SERIES = [{ key: "orders", name: "Earned", color: CHART.series[2] }];

/** Her order pay per day or per week. `period` is e.g. "in October" (null = recent weeks). */
export function EarningsChart({ daily, weekly, period }: { daily: ColumnPoint[]; weekly: ColumnPoint[]; period: string | null }) {
  const [view, setView] = useState<"daily" | "weekly">("daily");
  const points = view === "daily" ? daily : weekly;
  const total = points.reduce((s, p) => s + (p.values.orders ?? 0), 0);
  const tab = (v: "daily" | "weekly", label: string) => (
    <button
      type="button"
      onClick={() => setView(v)}
      className={`rounded-md px-2.5 py-1 text-xs font-medium ${view === v ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"}`}
    >
      {label}
    </button>
  );
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-stone-900">My earnings</h2>
          <p className="text-xs text-stone-500">
            ₹{total.toLocaleString("en-IN")} {period ?? (view === "daily" ? "in the last 14 days" : `in the last ${weekly.length} weeks`)}
          </p>
        </div>
        <div className="flex rounded-lg bg-stone-100 p-0.5">
          {tab("daily", "Days")}
          {tab("weekly", "Weeks")}
        </div>
      </div>
      <StackedColumns points={points} series={SERIES} height={190} money />
    </section>
  );
}
