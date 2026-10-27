"use client";

import { useState } from "react";
import { CHART, compactRs, niceTicks, rs, shortDate, useWidth } from "./chart-utils";

export type TrendPoint = { date: string; label?: string; values: Record<string, number> };
export type TrendSeries = { key: string; name: string; color: string; emphasis?: boolean };

const H = 260;
const PAD = { top: 16, right: 64, bottom: 28, left: 52 };

/**
 * Line chart over time, one ₹ axis. The emphasised series gets a soft area wash;
 * context series are drawn thin and grey. Hover anywhere: a crosshair snaps to the day.
 */
export function TrendChart({ points, series, height = H }: { points: TrendPoint[]; series: TrendSeries[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const all = points.flatMap((p) => series.map((s) => p.values[s.key] ?? 0));
  const ticks = niceTicks(Math.min(...all, 0), Math.max(...all, 0));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const innerW = Math.max(10, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const n = points.length;
  const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

  const path = (key: string) => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.values[key] ?? 0).toFixed(1)}`).join("");
  const area = (key: string) => `${path(key)}L${x(n - 1).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`;

  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 64))));

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = n <= 1 ? 0 : Math.round((px / rect.width) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  // End labels for the last point (skip if they would collide)
  const last = n - 1;
  const ends = series
    .map((s) => ({ s, v: points[last]?.values[s.key] ?? 0 }))
    .sort((a, b) => y(a.v) - y(b.v));
  const endsCollide = ends.length > 1 && Math.abs(y(ends[0].v) - y(ends[1].v)) < 14;

  return (
    <div ref={ref} className="relative w-full select-none">
      {width > 0 && n > 0 && (
        <svg width={width} height={height} role="img" aria-label="Trend chart">
          {/* grid + y axis */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + innerW} y1={y(t)} y2={y(t)} stroke={t === 0 ? CHART.axis : CHART.grid} strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={CHART.muted} style={{ fontVariantNumeric: "tabular-nums" }}>
                {compactRs(t)}
              </text>
            </g>
          ))}
          {/* x labels */}
          {points.map((p, i) =>
            (i % labelEvery === 0 && last - i >= labelEvery * 0.6) || i === last ? (
              <text key={p.date} x={x(i)} y={height - 8} textAnchor="middle" fontSize={11} fill={CHART.muted}>
                {p.label ?? shortDate(p.date)}
              </text>
            ) : null,
          )}
          {/* areas then lines (context first, emphasis on top) */}
          {series
            .filter((s) => s.emphasis)
            .map((s) => (
              <path key={`a-${s.key}`} d={area(s.key)} fill={s.color} opacity={0.1} />
            ))}
          {[...series]
            .sort((a, b) => Number(!!a.emphasis) - Number(!!b.emphasis))
            .map((s) => (
              <path
                key={s.key}
                d={path(s.key)}
                fill="none"
                stroke={s.color}
                strokeWidth={s.emphasis ? 2.5 : 2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
          {/* end dots + labels */}
          {series.map((s) => {
            const v = points[last]?.values[s.key] ?? 0;
            return <circle key={`e-${s.key}`} cx={x(last)} cy={y(v)} r={4} fill={s.color} stroke={CHART.surface} strokeWidth={2} />;
          })}
          {!endsCollide &&
            series.map((s) => {
              const v = points[last]?.values[s.key] ?? 0;
              return (
                <text key={`l-${s.key}`} x={x(last) + 10} y={y(v)} dy="0.32em" fontSize={11} fontWeight={600} fill={CHART.ink2}>
                  {compactRs(v)}
                </text>
              );
            })}
          {/* crosshair */}
          {hover !== null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke={CHART.axis} strokeWidth={1} />
              {series.map((s) => (
                <circle
                  key={`h-${s.key}`}
                  cx={x(hover)}
                  cy={y(points[hover].values[s.key] ?? 0)}
                  r={4.5}
                  fill={s.color}
                  stroke={CHART.surface}
                  strokeWidth={2}
                />
              ))}
            </g>
          )}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={innerW}
            height={innerH}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      )}
      {hover !== null && width > 0 && (
        <Tooltip left={x(hover)} width={width}>
          <div className="mb-1 text-xs text-stone-500">{points[hover].label ?? shortDate(points[hover].date)}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-2 text-sm">
              <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
              <span className="font-semibold text-stone-900">{rs(points[hover].values[s.key] ?? 0)}</span>
              <span className="text-stone-500">{s.name}</span>
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

export function Tooltip({ left, width, children }: { left: number; width: number; children: React.ReactNode }) {
  const flip = left > width - 190;
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 rounded-lg bg-white px-3 py-2 shadow-lg ring-1 ring-black/10"
      style={flip ? { right: width - left + 12 } : { left: left + 12 }}
    >
      {children}
    </div>
  );
}

export function LineLegend({ series }: { series: TrendSeries[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: s.color, height: s.emphasis ? 3 : 2 }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}
