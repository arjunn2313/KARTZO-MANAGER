"use client";

import { useState } from "react";
import { rs, shortDate } from "./chart-utils";
import { StackedColumns, SwatchLegend, type ColumnSeries } from "./stacked-columns";

type DayValues = { date: string; values: Record<string, number> };

const plusDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });
const range = (start: string) => `${shortDate(start)} – ${shortDate(plusDays(start, 6))}`;

/**
 * Pay chart with two views:
 *  - Week: Sunday → Saturday bars for one week, with ‹ › and a week picker
 *  - All weeks: one bar per week
 * `weeks` are the Sunday start dates that can be picked (any order); `days` hold the values per date.
 */
export function WeekChart({
  title,
  series,
  weeks,
  days,
  currentWeek,
  note,
  height = 200,
}: {
  title: string;
  series: ColumnSeries[];
  weeks: string[];
  days: DayValues[];
  /** this week's Sunday (shown as "This week") */
  currentWeek: string;
  /** small text under the title, e.g. "Paid and not paid" */
  note?: string;
  height?: number;
}) {
  const starts = [...new Set(weeks)].sort(); // oldest first
  const latest = starts.includes(currentWeek) ? currentWeek : starts[starts.length - 1];
  const [view, setView] = useState<"week" | "all">("week");
  const [picked, setPicked] = useState(latest);
  const week = starts.includes(picked) ? picked : latest;
  const idx = starts.indexOf(week);

  const byDate = new Map(days.map((d) => [d.date, d.values]));
  const zero = Object.fromEntries(series.map((s) => [s.key, 0]));
  const weekPoints = (start: string) =>
    Array.from({ length: 7 }, (_, i) => {
      const date = plusDays(start, i);
      return { date, label: weekday(date), title: `${weekday(date)}, ${shortDate(date)}`, values: { ...zero, ...byDate.get(date) } };
    });
  const sumOf = (pts: { values: Record<string, number> }[]) => {
    const out: Record<string, number> = { ...zero };
    for (const p of pts) for (const s of series) out[s.key] += p.values[s.key] ?? 0;
    return out;
  };

  // "This week", "Last week", "3 weeks ago"
  const weekName = (st: string) => {
    const ago = Math.round((Date.parse(currentWeek) - Date.parse(st)) / (7 * 86400000));
    return ago === 0 ? "This week" : ago === 1 ? "Last week" : ago > 1 ? `${ago} weeks ago` : range(st);
  };
  const nameOf = (st: string) => (st === currentWeek ? `This week (${range(st)})` : range(st));
  const points =
    view === "week"
      ? weekPoints(week)
      : starts.map((st) => ({ date: st, label: shortDate(st), title: st === currentWeek ? "This week" : range(st), values: sumOf(weekPoints(st)) }));
  const totalOf = (pts: { values: Record<string, number> }[]) => pts.reduce((s, p) => s + series.reduce((a, se) => a + (p.values[se.key] ?? 0), 0), 0);
  const total = totalOf(points);
  // compare with the week before (week view only)
  const prevTotal = view === "week" && idx > 0 ? totalOf(weekPoints(starts[idx - 1])) : null;
  const change = prevTotal ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;
  const worked = view === "week" ? points.filter((p) => totalOf([p]) > 0).length : 0;

  const tab = (v: "week" | "all", label: string) => (
    <button
      type="button"
      onClick={() => setView(v)}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${view === v ? "bg-stone-900 text-white shadow-sm" : "text-stone-500 hover:text-stone-800"}`}
    >
      {label}
    </button>
  );
  const arrow =
    "grid size-9 shrink-0 place-items-center rounded-full text-lg leading-none text-stone-700 transition hover:bg-white hover:shadow-sm active:scale-95 disabled:pointer-events-none disabled:opacity-25";

  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-stone-500">{title}</h2>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
            <span className="text-2xl font-semibold tracking-tight text-stone-900">{rs(total)}</span>
            {change !== null && (
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${change >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                {change >= 0 ? "▲" : "▼"} {Math.abs(change)}% vs last week
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-stone-500">
            {view === "week"
              ? `${worked} day${worked === 1 ? "" : "s"} worked${worked ? ` · avg ${rs(total / worked)}/day` : ""}`
              : `${starts.length} weeks${note ? ` · ${note}` : ""}`}
          </p>
        </div>
        <div className="flex shrink-0 rounded-full bg-stone-100 p-0.5">
          {tab("week", "Week")}
          {tab("all", "All weeks")}
        </div>
      </div>

      {view === "week" && (
        <div className="mt-4 flex items-center gap-1 rounded-full bg-stone-100 p-1">
          <button type="button" className={arrow} disabled={idx <= 0} onClick={() => setPicked(starts[idx - 1])} aria-label="Previous week">
            ‹
          </button>
          {/* the label; an invisible picker on top lets you jump to any week */}
          <div className="relative min-w-0 flex-1 text-center">
            <div className="truncate text-sm font-semibold text-stone-900">{weekName(week)}</div>
            <div className="truncate text-[11px] text-stone-500">{range(week)}</div>
            <select
              value={week}
              onChange={(e) => setPicked(e.target.value)}
              aria-label="Pick a week"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            >
              {[...starts].reverse().map((st) => (
                <option key={st} value={st}>
                  {nameOf(st)}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className={arrow} disabled={idx >= starts.length - 1} onClick={() => setPicked(starts[idx + 1])} aria-label="Next week">
            ›
          </button>
        </div>
      )}

      {series.length > 1 && (
        <div className="mt-3">
          <SwatchLegend series={series} />
        </div>
      )}
      <div className="mt-3">
        <StackedColumns points={points} series={series} height={height} money allLabels={view === "week"} showValues hideAxis />
      </div>
    </section>
  );
}
