/** Pure calculations for the dashboard (no database access here, so it's easy to test). */

export type DashOrder = {
  order_date: string;
  status: string;
  order_value: number;
  profit: number;
  items_cost: number;
  shipping_cost: number;
  cod_fee: number;
  payment_mode: string;
  cod_balance: number;
  items: { product_id: string; qty: number }[] | null;
};

export type DailyInput = { date: string; ad_spend: number; staff_amount: number; staff_bonus?: number; ad_from_wallet?: boolean };

export type DayRow = {
  date: string;
  orders: number;
  units: Record<string, number>; // product_id -> pieces sold
  sales: number;
  grossProfit: number;
  rtoCount: number;
  rtoLoss: number; // negative or 0
  adSpend: number;
  /** true when ad spend comes from the Ad wallet page (morning balances), not typed by hand */
  adFromWallet?: boolean;
  staff: number; // wage + bonus
  staffBonus: number;
  otherCosts: number; // business costs from Expenses: 0 on day rows (counted per month, see monthsCovered)
  profitAfterAds: number;
  netProfit: number;
};

export type CostEntry = { date: string; amount: number };

export type Totals = Omit<DayRow, "date"> & {
  productCost: number;
  shipping: number;
  codFees: number;
  statusCounts: Record<string, number>;
  codInTransit: number;
  days: number;
};

const SOLD = new Set(["new", "dispatched", "delivered"]);
const LOSS = new Set(["rto", "returned"]);

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (d <= end && out.length < 800) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function shiftDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function aggregateDays(
  orders: DashOrder[],
  inputs: DailyInput[],
  from: string,
  to: string,
  costs: CostEntry[] = [],
): DayRow[] {
  const byDate = new Map<string, DayRow>();
  for (const date of eachDay(from, to)) {
    byDate.set(date, {
      date,
      orders: 0,
      units: {},
      sales: 0,
      grossProfit: 0,
      rtoCount: 0,
      rtoLoss: 0,
      adSpend: 0,
      staff: 0,
      staffBonus: 0,
      otherCosts: 0,
      profitAfterAds: 0,
      netProfit: 0,
    });
  }
  for (const o of orders) {
    const row = byDate.get(o.order_date);
    if (!row || o.status === "cancelled") continue;
    row.orders += 1;
    row.grossProfit += o.profit;
    if (SOLD.has(o.status)) {
      row.sales += o.order_value;
      for (const it of o.items ?? []) row.units[it.product_id] = (row.units[it.product_id] ?? 0) + it.qty;
    } else if (LOSS.has(o.status)) {
      row.rtoCount += 1;
      row.rtoLoss += o.profit;
    }
  }
  for (const i of inputs) {
    const row = byDate.get(i.date);
    if (!row) continue;
    row.adSpend = i.ad_spend;
    row.adFromWallet = !!i.ad_from_wallet;
    row.staffBonus = i.staff_bonus ?? 0;
    row.staff = i.staff_amount + row.staffBonus;
  }
  void costs; // other expenses are a monthly cost, never put on a single day
  for (const row of byDate.values()) {
    row.profitAfterAds = row.grossProfit - row.adSpend;
    row.netProfit = row.profitAfterAds - row.staff;
  }
  return [...byDate.values()];
}

/** Months (YYYY-MM) whose other expenses belong in this range: the range starts on or before the 1st
 *  and runs to the month's end (or to today for the running month). Single-day views never count them. */
export function monthsCovered(from: string, to: string, today: string): string[] {
  if (from === to) return [];
  const out: string[] = [];
  let m = from.slice(0, 7);
  while (m <= to.slice(0, 7) && out.length < 60) {
    const first = `${m}-01`;
    const next = shiftDays(first, 32).slice(0, 7);
    const last = shiftDays(`${next}-01`, -1);
    const end = last < today ? last : today;
    if (from <= first && to >= end) out.push(m);
    m = next;
  }
  return out;
}

export function costsForMonths(costs: CostEntry[], months: string[]) {
  const set = new Set(months);
  return costs.reduce((s, c) => s + (set.has(c.date.slice(0, 7)) ? c.amount : 0), 0);
}

/** `otherCosts` = this range's monthly business costs (from costsForMonths). */
export function totals(orders: DashOrder[], days: DayRow[], otherCosts = 0): Totals {
  const t: Totals = {
    orders: 0,
    units: {},
    sales: 0,
    grossProfit: 0,
    rtoCount: 0,
    rtoLoss: 0,
    adSpend: 0,
    staff: 0,
    staffBonus: 0,
    otherCosts: 0,
    profitAfterAds: 0,
    netProfit: 0,
    productCost: 0,
    shipping: 0,
    codFees: 0,
    statusCounts: {},
    codInTransit: 0,
    days: days.length,
  };
  const inRange = new Set(days.map((d) => d.date));
  for (const d of days) {
    t.orders += d.orders;
    t.sales += d.sales;
    t.grossProfit += d.grossProfit;
    t.rtoCount += d.rtoCount;
    t.rtoLoss += d.rtoLoss;
    t.adSpend += d.adSpend;
    t.staff += d.staff;
    t.staffBonus += d.staffBonus;
    for (const [k, v] of Object.entries(d.units)) t.units[k] = (t.units[k] ?? 0) + v;
  }
  t.otherCosts = otherCosts;
  for (const o of orders) {
    if (!inRange.has(o.order_date)) continue;
    t.statusCounts[o.status] = (t.statusCounts[o.status] ?? 0) + 1;
    if (SOLD.has(o.status)) {
      t.productCost += o.items_cost;
      t.shipping += o.shipping_cost;
      t.codFees += o.cod_fee;
    }
    if (o.payment_mode === "cod" && (o.status === "new" || o.status === "dispatched")) t.codInTransit += o.cod_balance;
  }
  t.profitAfterAds = t.grossProfit - t.adSpend;
  t.netProfit = t.profitAfterAds - t.staff - t.otherCosts;
  return t;
}

/** Groups daily rows into weeks (Monday start) when a range is long, so charts stay readable. */
export function bucket(days: DayRow[], mode: "day" | "week"): DayRow[] {
  if (mode === "day") return days;
  const out = new Map<string, DayRow>();
  for (const d of days) {
    const dt = new Date(d.date + "T00:00:00Z");
    const dow = (dt.getUTCDay() + 6) % 7; // Monday = 0
    const key = shiftDays(d.date, -dow);
    const b =
      out.get(key) ??
      ({ ...d, date: key, units: {}, orders: 0, sales: 0, grossProfit: 0, rtoCount: 0, rtoLoss: 0, adSpend: 0, staff: 0, staffBonus: 0, otherCosts: 0, profitAfterAds: 0, netProfit: 0 } as DayRow);
    b.orders += d.orders;
    b.sales += d.sales;
    b.grossProfit += d.grossProfit;
    b.rtoCount += d.rtoCount;
    b.rtoLoss += d.rtoLoss;
    b.adSpend += d.adSpend;
    b.staff += d.staff;
    b.staffBonus += d.staffBonus;
    b.otherCosts += d.otherCosts;
    b.profitAfterAds += d.profitAfterAds;
    b.netProfit += d.netProfit;
    for (const [k, v] of Object.entries(d.units)) b.units[k] = (b.units[k] ?? 0) + v;
    out.set(key, b);
  }
  return [...out.values()];
}

/** Percentage change, or null when there's nothing to compare against. */
export function pctChange(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / Math.abs(before)) * 100);
}
