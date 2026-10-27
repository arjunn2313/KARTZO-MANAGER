"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

export const PAGE_SIZES = [10, 25, 50, 100];
const MAX_SIZE = 500;

/* ---------- remembered "rows per page" (per list, per device) ---------- */

const listeners = new Set<() => void>();
function readSize(key: string, fallback: number) {
  try {
    const n = Number(localStorage.getItem("kartzo.rows." + key));
    return n >= 1 && n <= MAX_SIZE ? n : fallback;
  } catch {
    return fallback;
  }
}
function writeSize(key: string, n: number) {
  try {
    localStorage.setItem("kartzo.rows." + key, String(n));
  } catch {
    /* private mode: just not remembered */
  }
  listeners.forEach((f) => f());
}

export function useRowsPerPage(key: string, fallback = 25): [number, (n: number) => void] {
  const size = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => readSize(key, fallback),
    () => fallback,
  );
  return [size, (n) => writeSize(key, Math.min(MAX_SIZE, Math.max(1, Math.round(n))))];
}

/** Client-side paging for a list already on screen. Page goes back to 1 when the list changes length. */
export function usePaged<T>(items: T[], key: string, fallback = 25) {
  const [size, setSize] = useRowsPerPage(key, fallback);
  const [state, setState] = useState({ page: 1, len: items.length });
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  // a new filter / search changes the length → start from page 1
  const page = state.len === items.length ? Math.min(state.page, pageCount) : 1;
  const pageItems = useMemo(() => items.slice((page - 1) * size, page * size), [items, page, size]);
  return {
    pageItems,
    pager: {
      page,
      pageCount,
      total: items.length,
      size,
      onPage: (p: number) => setState({ page: p, len: items.length }),
      onSize: (n: number) => {
        setSize(n);
        setState({ page: 1, len: items.length });
      },
    },
  };
}

/* ---------- the control ---------- */

export type PagerProps = {
  page: number;
  pageCount: number;
  total: number;
  size: number;
  onPage: (p: number) => void;
  onSize: (n: number) => void;
  /** e.g. "orders" */
  noun?: string;
  className?: string;
};

/** 1 … 4 5 6 … 20 */
function pageList(page: number, count: number): (number | "…")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const lo = Math.max(2, page - 1);
  const hi = Math.min(count - 1, page + 1);
  if (lo > 2) out.push("…");
  for (let i = lo; i <= hi; i++) out.push(i);
  if (hi < count - 1) out.push("…");
  out.push(count);
  return out;
}

export function Pager({ page, pageCount, total, size, onPage, onSize, noun = "rows", className = "" }: PagerProps) {
  const custom = !PAGE_SIZES.includes(size);
  const [typing, setTyping] = useState<string | null>(null);
  if (total === 0) return null;
  const first = (page - 1) * size + 1;
  const last = Math.min(total, page * size);

  const btn =
    "grid h-8 min-w-8 place-items-center rounded-lg px-2 text-sm transition focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-35";

  return (
    <div className={`flex flex-col gap-3 text-sm text-stone-500 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {first === last ? first : `${first}–${last}`} of {total.toLocaleString("en-IN")} {noun}
        </span>
        <label className="flex items-center gap-1.5">
          <span className="text-stone-400">Show</span>
          <select
            value={custom || typing !== null ? "custom" : String(size)}
            onChange={(e) => {
              if (e.target.value === "custom") setTyping(String(size));
              else {
                setTyping(null);
                onSize(Number(e.target.value));
              }
            }}
            className="rounded-lg border border-stone-300 bg-white py-1 pl-2 pr-7 text-sm text-stone-700"
            aria-label="Rows per page"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            <option value="custom">{custom && typing === null ? `${size} (custom)` : "Custom…"}</option>
          </select>
          {typing !== null && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const n = Number(typing);
                if (n >= 1) onSize(n);
                setTyping(null);
              }}
              className="flex items-center gap-1"
            >
              <input
                autoFocus
                inputMode="numeric"
                value={typing}
                onChange={(e) => setTyping(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                onBlur={() => {
                  const n = Number(typing);
                  if (n >= 1) onSize(n);
                  setTyping(null);
                }}
                className="w-16 rounded-lg border border-emerald-500 bg-white px-2 py-1 text-center text-stone-800 outline-none ring-2 ring-emerald-600/15"
                aria-label="Custom rows per page"
                placeholder="e.g. 30"
              />
            </form>
          )}
          <span className="text-stone-400">per page</span>
        </label>
      </div>

      {pageCount > 1 && (
        <nav className="flex items-center gap-1" aria-label="Pages">
          <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={`${btn} ring-1 ring-stone-200 hover:bg-stone-100`} aria-label="Previous page">
            ‹
          </button>
          {pageList(page, pageCount).map((p, i) =>
            p === "…" ? (
              <span key={"gap" + i} className="px-1 text-stone-400">
                …
              </span>
            ) : (
              <button
                type="button"
                key={p}
                onClick={() => onPage(p)}
                aria-current={p === page ? "page" : undefined}
                className={`${btn} ${p === page ? "bg-stone-900 font-semibold text-white" : "text-stone-700 hover:bg-stone-100"}`}
              >
                {p}
              </button>
            ),
          )}
          <button type="button" disabled={page >= pageCount} onClick={() => onPage(page + 1)} className={`${btn} ring-1 ring-stone-200 hover:bg-stone-100`} aria-label="Next page">
            ›
          </button>
        </nav>
      )}
    </div>
  );
}
