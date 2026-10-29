"use client";

import { useState } from "react";
import { CHART, compactNum, compactRs, niceTicks, rs, shortDate, useWidth } from "./chart-utils";
import { Tooltip } from "./trend-chart";

export type ColumnPoint = { date: string; label?: string; /** tooltip heading (defaults to label) */ title?: string; values: Record<string, number> };
export type ColumnSeries = { key: string; name: string; color: string };

const PAD = { top: 16, right: 12, bottom: 28, left: 40 };
const GAP = 2; // surface gap between stacked segments

/** Stacked columns (e.g. pieces sold per day, by product). Hover a column for its breakdown. */
export function StackedColumns({
  points,
  series,
  height = 240,
  unit = "pcs",
  money = false,
  allLabels = false,
  showValues = false,
  hideAxis = false,
}: {
  points: ColumnPoint[];
  series: ColumnSeries[];
  height?: number;
  unit?: string;
  money?: boolean;
  /** label every column (for short charts like Sun–Sat) */
  allLabels?: boolean;
  /** print each column's total above it */
  showValues?: boolean;
  /** no ₹ scale on the left or grid lines, just the baseline (use with showValues) */
  hideAxis?: boolean;
}) {
  const fmtAxis = money ? compactRs : compactNum;
  const fmt = (n: number) => (money ? rs(n) : String(n));
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const totals = points.map((p) => series.reduce((s, se) => s + (p.values[se.key] ?? 0), 0));
  const ticks = niceTicks(0, Math.max(...totals, 1));
  const yMax = hideAxis ? Math.max(...totals, 1) : ticks[ticks.length - 1];
  const pad = hideAxis ? { ...PAD, left: 4, right: 4 } : PAD;
  const innerW = Math.max(10, width - pad.left - pad.right);
  const innerH = height - PAD.top - PAD.bottom;
  const n = points.length;
  const band = innerW / Math.max(1, n);
  const barW = Math.max(3, Math.min(24, band * 0.6));
  const valueTop = showValues ? 14 : 0; // room for the value labels above the tallest column
  const y = (v: number) => PAD.top + innerH - (v / (yMax || 1)) * (innerH - valueTop);
  const cx = (i: number) => pad.left + band * i + band / 2;
  const labelEvery = allLabels ? 1 : Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 56))));

  return (
    <div ref={ref} className="relative w-full select-none">
      {width > 0 && n > 0 && (
        <svg width={width} height={height} role="img" aria-label="Pieces sold per day">
          {ticks.filter((t) => !hideAxis || t === 0).map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={pad.left + innerW} y1={y(t)} y2={y(t)} stroke={t === 0 ? CHART.axis : CHART.grid} strokeWidth={1} />
              {!hideAxis && <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={CHART.muted} style={{ fontVariantNumeric: "tabular-nums" }}>
                {fmtAxis(t)}
              </text>}
            </g>
          ))}
          {points.map((p, i) => {
            let base = 0;
            const segs = series
              .map((s) => ({ s, v: p.values[s.key] ?? 0 }))
              .filter((x) => x.v > 0);
            return (
              <g key={p.date} opacity={hover === null || hover === i ? 1 : 0.55}>
                {segs.map(({ s, v }, k) => {
                  const top = y(base + v);
                  const bottom = y(base);
                  base += v;
                  const isTop = k === segs.length - 1;
                  const h = Math.max(0, bottom - top - (k > 0 ? GAP : 0));
                  const yTop = top;
                  const r = isTop ? Math.min(4, h / 2, barW / 2) : 0;
                  const x0 = cx(i) - barW / 2;
                  // rounded top only, square at the baseline
                  const d = `M${x0},${yTop + h}V${yTop + r}Q${x0},${yTop} ${x0 + r},${yTop}H${x0 + barW - r}Q${x0 + barW},${yTop} ${x0 + barW},${yTop + r}V${yTop + h}Z`;
                  return <path key={s.key} d={d} fill={s.color} />;
                })}
              </g>
            );
          })}
          {showValues &&
            points.map((p, i) =>
              totals[i] > 0 ? (
                <text key={`v-${p.date}`} x={cx(i)} y={y(totals[i]) - 5} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={CHART.ink2} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {money ? compactRs(totals[i]) : compactNum(totals[i])}
                </text>
              ) : null,
            )}
          {points.map((p, i) =>
            (i % labelEvery === 0 && (n - 1) - i >= labelEvery * 0.6) || i === n - 1 ? (
              <text key={`x-${p.date}`} x={cx(i)} y={height - 8} textAnchor="middle" fontSize={11} fill={CHART.muted}>
                {p.label ?? shortDate(p.date)}
              </text>
            ) : null,
          )}
          {/* hit areas: the whole column band */}
          {points.map((p, i) => (
            <rect
              key={`hit-${p.date}`}
              x={pad.left + band * i}
              y={PAD.top}
              width={band}
              height={innerH}
              fill="transparent"
              tabIndex={0}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            />
          ))}
        </svg>
      )}
      {hover !== null && width > 0 && (
        <Tooltip left={cx(hover)} width={width}>
          <div className="mb-1 text-xs text-stone-500">{points[hover].title ?? points[hover].label ?? shortDate(points[hover].date)}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-2 text-sm">
              <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
              <span className="font-semibold text-stone-900">{fmt(points[hover].values[s.key] ?? 0)}</span>
              <span className="text-stone-500">{s.name}</span>
            </div>
          ))}
          <div className="mt-1 border-t border-stone-100 pt-1 text-xs text-stone-500">
            Total <b className="text-stone-800">{fmt(totals[hover])}</b> {money ? "" : unit}
          </div>
        </Tooltip>
      )}
    </div>
  );
}

export function SwatchLegend({ series }: { series: ColumnSeries[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}
