/** Stock maths (pure, no database). */

import { shiftDays } from "./dashboard";

export type StockKind = "purchase" | "opening" | "adjust";
export type StockIn = {
  id: string;
  product_id: string;
  date: string;
  qty: number;
  kind: StockKind;
  supplier: string | null;
  unit_cost: number | null;
  note: string | null;
};
export type StockOut = { product_id: string; date: string; kind: "sold" | "damaged"; qty: number };
export type Demand = { product_id: string; date: string; qty: number };

export const KIND_LABEL: Record<StockKind, string> = { purchase: "Purchase", opening: "Opening stock", adjust: "Correction" };

export type Health = {
  inStock: number;
  toPack: number;
  /** left after packing the orders already waiting */
  free: number;
  perDay: number;
  daysLeft: number | null;
  runsOut: string | null;
  status: "out" | "reorder" | "ok" | "idle";
  suggest: number;
};

/**
 * perDay = pieces ordered over the last `window` days (yesterday backwards) ÷ days.
 * Reorder when stock won't last until a new delivery arrives (+3 days safety) or falls to the low-stock level.
 */
export function health(
  s: { stock_added: number; sold: number; pending: number },
  demand: Demand[],
  today: string,
  leadDays: number,
  lowAt: number,
  window = 30,
): Health {
  const inStock = s.stock_added - s.sold;
  const toPack = s.pending;
  const free = inStock - toPack;
  const from = shiftDays(today, -window);
  const ordered = demand.filter((d) => d.date >= from && d.date < today).reduce((a, d) => a + d.qty, 0);
  const perDay = ordered / window;
  const daysLeft = perDay > 0 ? Math.max(0, free) / perDay : null;
  const runsOut = daysLeft !== null ? shiftDays(today, Math.floor(daysLeft)) : null;
  const status: Health["status"] =
    free <= 0 ? "out" : (daysLeft !== null && daysLeft <= leadDays + 3) || free <= lowAt ? "reorder" : perDay === 0 ? "idle" : "ok";
  // enough for a month of sales after it arrives, rounded up to 10
  const need = perDay * (30 + leadDays) - Math.max(0, free);
  const suggest = need > 0 ? Math.ceil(need / 10) * 10 : 0;
  return { inStock, toPack, free, perDay, daysLeft, runsOut, status, suggest };
}

export type LedgerRow = {
  key: string;
  date: string;
  product_id: string;
  label: string;
  detail: string | null;
  change: number;
  /** stock after this row (only when the list is for one product) */
  balance: number | null;
  entryId: string | null;
};

/**
 * Movements newest first. When `currentStock` is given (one product), the running balance is
 * worked backwards from today's stock, so only the rows on screen are needed.
 */
export function ledger(ins: StockIn[], outs: StockOut[], currentStock: number | null): LedgerRow[] {
  const rows: (LedgerRow & { order: number })[] = [
    ...ins.map((e) => ({
      key: "in-" + e.id,
      date: e.date,
      product_id: e.product_id,
      label: KIND_LABEL[e.kind] ?? "Stock in",
      detail:
        [e.supplier, e.unit_cost != null ? `₹${e.unit_cost}/pc` : null, e.note].filter(Boolean).join(" · ") || null,
      change: e.qty,
      balance: null,
      entryId: e.id,
      order: 1,
    })),
    ...outs.map((o) => ({
      key: `out-${o.product_id}-${o.date}-${o.kind}`,
      date: o.date,
      product_id: o.product_id,
      label: o.kind === "damaged" ? "Damaged return" : "Dispatched",
      detail: null,
      change: -o.qty,
      balance: null,
      entryId: null,
      order: 0,
    })),
  ];
  // newest first; on the same day the stock-in goes below that day's dispatches (it arrived first)
  rows.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.order - b.order));
  if (currentStock !== null) {
    let bal = currentStock;
    for (const r of rows) {
      r.balance = bal;
      bal -= r.change;
    }
  }
  return rows.map((r) => ({ key: r.key, date: r.date, product_id: r.product_id, label: r.label, detail: r.detail, change: r.change, balance: r.balance, entryId: r.entryId }));
}
