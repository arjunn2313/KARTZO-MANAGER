"use client";

import type { Item } from "@/lib/pricing";

type P = { id: string; name: string };

/** Product list for one order: product + quantity per line, add / remove lines. */
export function ItemsEditor({
  items,
  products,
  onChange,
  compact = false,
  invalid = false,
}: {
  items: Item[];
  products: P[];
  onChange: (items: Item[]) => void;
  compact?: boolean;
  invalid?: boolean;
}) {
  const field = compact
    ? "rounded-md border bg-white px-2.5 py-1.5 text-sm outline-none focus:ring-2"
    : "rounded-lg border bg-white px-3 py-2 text-stone-900 outline-none focus:ring-2";
  const ok = "border-stone-300 focus:border-emerald-600 focus:ring-emerald-600/20";
  const bad = "border-red-400 bg-red-50/40 focus:border-red-500 focus:ring-red-500/20";

  function update(i: number, patch: Partial<Item>) {
    onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  }

  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            value={it.product_id}
            onChange={(e) => update(i, { product_id: e.target.value })}
            className={`${field} ${invalid && !it.product_id ? bad : ok} min-w-0 flex-1`}
            aria-label={`Product ${i + 1}`}
          >
            <option value="">Choose product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="text-sm text-stone-400">×</span>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={it.qty}
            onChange={(e) => update(i, { qty: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
            className={`${field} ${ok} ${compact ? "w-14" : "w-20"} shrink-0`}
            aria-label={`Quantity ${i + 1}`}
          />
          {items.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="shrink-0 rounded-md px-1.5 py-1 text-stone-400 hover:bg-stone-100 hover:text-red-600"
              aria-label="Remove product"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { product_id: "", qty: 1 }])}
        className={`font-medium text-emerald-700 hover:text-emerald-800 ${compact ? "text-xs" : "text-sm"}`}
      >
        + Add another product
      </button>
    </div>
  );
}
