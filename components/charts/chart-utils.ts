"use client";

import { useEffect, useRef, useState } from "react";

/** Chart colours (validated for colour-blind safety; see dataviz palette). */
export const CHART = {
  series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
  context: "#c3c2b7", // de-emphasised series
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  muted: "#898781",
  ink: "#0b0b0b",
  ink2: "#52514e",
  surface: "#ffffff",
};

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Round, readable axis ticks that always include 0. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max, 1);
  const raw = (hi - lo) / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v));
  return ticks;
}

export function compactRs(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 100000) return `${sign}₹${(a / 100000).toFixed(a >= 1000000 ? 0 : 1).replace(/\.0$/, "")}L`;
  if (a >= 1000) return `${sign}₹${(a / 1000).toFixed(a >= 10000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return `${sign}₹${a}`;
}

export function compactNum(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : String(n);
}

export const rs = (n: number) => (n < 0 ? "−" : "") + "₹" + Math.abs(Math.round(n)).toLocaleString("en-IN");

/** "2026-10-27" → "27 Oct" */
export function shortDate(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}
