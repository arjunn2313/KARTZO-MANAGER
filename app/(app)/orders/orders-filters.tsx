"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { STATUSES, STATUS_DOT, STATUS_LABEL } from "@/lib/orders";

type Current = {
  range: string;
  from: string;
  to: string;
  status: string;
  payment: string;
  product: string;
  courier: string;
  q: string;
};

const select =
  "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";

export function OrdersFilters({
  presets,
  current,
  products,
  couriers,
  statusCounts,
}: {
  presets: { key: string; label: string }[];
  current: Current;
  products: { id: string; name: string }[];
  couriers: { id: string; name: string }[];
  statusCounts: Record<string, number>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(current.q);
  const [more, setMore] = useState(false); // phones: payment / product / courier hidden until asked

  function update(patch: Partial<Current>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    startTransition(() =>
      router.replace(`${pathname}?${next.toString()}`, { scroll: false }),
    );
  }

  // search as you type (short delay)
  useEffect(() => {
    if (q === current.q) return;
    const t = setTimeout(() => update({ q }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const anyFilter =
    current.status ||
    current.payment ||
    current.product ||
    current.courier ||
    current.q;

  return (
    <div
      className={`space-y-3 rounded-xl bg-white p-4 ring-1 ring-stone-200 transition ${pending ? "opacity-70" : ""}`}
    >
      {/* Date range */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {presets.map((p) => (
            <button
              key={p.key}
              onClick={() => update({ range: p.key, from: "", to: "" })}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-sm transition ${
                current.range === p.key
                  ? "bg-stone-900 text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 text-sm text-stone-500 sm:flex">
          <input
            type="date"
            value={current.range === "custom" ? current.from : ""}
            onChange={(e) =>
              update({
                range: "custom",
                from: e.target.value,
                to: current.to || e.target.value,
              })
            }
            className={`${select} py-1`}
            aria-label="From date"
          />
          –
          <input
            type="date"
            value={current.range === "custom" ? current.to : ""}
            onChange={(e) =>
              update({
                range: "custom",
                to: e.target.value,
                from: current.from || e.target.value,
              })
            }
            className={`${select} py-1`}
            aria-label="To date"
          />
        </div>
      </div>

      {/* Status tabs */}
      <div className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 sm:-mx-1 sm:px-1 sm:pb-1">
        <StatusTab
          active={!current.status}
          onClick={() => update({ status: "" })}
          label="All"
        />
        {STATUSES.map((s) => (
          <StatusTab
            key={s}
            active={current.status === s}
            onClick={() => update({ status: s })}
            label={STATUS_LABEL[s]}
            count={statusCounts[s]}
            dot={STATUS_DOT[s]}
          />
        ))}
      </div>

      {/* Search + dropdowns */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, phone, tracking ID, order ID, PIN…"
          className={`${select} w-full`}
        />
        <button
          type="button"
          onClick={() => setMore((m) => !m)}
          className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-stone-600 ring-1 ring-stone-200 sm:hidden"
        >
          <span>
            More filters
            {[current.payment, current.product, current.courier].filter(Boolean)
              .length > 0 && (
              <span className="ml-2 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                {
                  [current.payment, current.product, current.courier].filter(
                    Boolean,
                  ).length
                }
              </span>
            )}
          </span>
          <span aria-hidden>{more ? "▴" : "▾"}</span>
        </button>
        <div className={more ? "grid gap-2 sm:contents" : "hidden sm:contents"}>
          <select
            value={current.payment}
            onChange={(e) => update({ payment: e.target.value })}
            className={select}
          >
            <option value="">All payments</option>
            <option value="cod">COD</option>
            <option value="paid">Paid</option>
            <option value="replacement">Replacements</option>
          </select>
          <select
            value={current.product}
            onChange={(e) => update({ product: e.target.value })}
            className={select}
          >
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={current.courier}
            onChange={(e) => update({ courier: e.target.value })}
            className={select}
          >
            <option value="">All couriers</option>
            {couriers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {anyFilter ? (
          <button
            onClick={() => {
              setQ("");
              update({
                status: "",
                payment: "",
                product: "",
                courier: "",
                q: "",
              });
            }}
            className="rounded-lg px-3 py-2 text-sm text-stone-500 hover:bg-stone-100"
          >
            Clear filters
          </button>
        ) : (
          <span className="hidden lg:block" />
        )}
      </div>
    </div>
  );
}

function StatusTab({
  active,
  onClick,
  label,
  count,
  dot,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  dot?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition ${
        active
          ? "bg-emerald-50 font-medium text-emerald-800 ring-1 ring-emerald-200"
          : "text-stone-600 hover:bg-stone-100"
      }`}
    >
      {dot && <span className={`size-2 rounded-full ${dot}`} />}
      {label}
      {count !== undefined && (
        <span className="text-xs text-stone-400">{count}</span>
      )}
    </button>
  );
}
