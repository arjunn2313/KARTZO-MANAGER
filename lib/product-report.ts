/** Per-product profit & loss (pure, no database). */

import { eachDay } from "./dashboard";

export type ReportOrder = {
  order_date: string;
  status: string;
  order_value: number;
  profit: number;
  shipping_cost: number;
  cod_fee: number;
  payment_mode: string;
  pincode: string | null;
  items: { product_id: string; qty: number; unit_cost: number; unit_price: number }[] | null;
};

export type DayCost = { date: string; ad: number; staff: number };

export type ProductLine = {
  id: string;
  name: string;
  /** orders that contain this product (a 2-product order counts for both) */
  orders: number;
  /** this product's share of orders (a 2-product order splits by value) – used for per-order maths */
  orderShare: number;
  pieces: number;
  revenue: number;
  productCost: number;
  shipping: number;
  codFees: number;
  rtoCount: number;
  rtoLoss: number;
  /** profit before ads (after product, shipping, COD fee, RTO) */
  grossProfit: number;
  adSpend: number;
  staff: number;
  netProfit: number;
  codOrders: number;
  keralaOrders: number;
  daily: Record<string, { net: number; pieces: number }>;
};

const SOLD = new Set(["new", "dispatched", "delivered"]);
const LOSS = new Set(["rto", "returned"]);

export function productReport(
  orders: ReportOrder[],
  costs: DayCost[],
  products: { id: string; name: string }[],
  from: string,
  to: string,
) {
  const days = eachDay(from, to);
  const lines = new Map<string, ProductLine>();
  const line = (id: string) => {
    let l = lines.get(id);
    if (!l) {
      const p = products.find((x) => x.id === id);
      l = {
        id,
        name: p?.name ?? "Deleted product",
        orders: 0,
        orderShare: 0,
        pieces: 0,
        revenue: 0,
        productCost: 0,
        shipping: 0,
        codFees: 0,
        rtoCount: 0,
        rtoLoss: 0,
        grossProfit: 0,
        adSpend: 0,
        staff: 0,
        netProfit: 0,
        codOrders: 0,
        keralaOrders: 0,
        daily: Object.fromEntries(days.map((d) => [d, { net: 0, pieces: 0 }])),
      };
      lines.set(id, l);
    }
    return l;
  };

  // share of each product in each day's orders → used to split that day's ads and staff
  const dayWeight = new Map<string, Map<string, number>>();

  for (const o of orders) {
    if (o.status === "cancelled" || !o.items?.length) continue;
    const value = o.items.reduce((s, i) => s + i.unit_price * i.qty, 0);
    const pcs = o.items.reduce((s, i) => s + i.qty, 0);
    // merge repeated products inside one order
    const per = new Map<string, { qty: number; cost: number; share: number }>();
    for (const i of o.items) {
      const share = value > 0 ? (i.unit_price * i.qty) / value : i.qty / (pcs || 1);
      const cur = per.get(i.product_id) ?? { qty: 0, cost: 0, share: 0 };
      cur.qty += i.qty;
      cur.cost += i.unit_cost * i.qty;
      cur.share += share;
      per.set(i.product_id, cur);
    }
    const kerala = /^6[7-9]\d{4}$/.test(o.pincode ?? "");
    for (const [pid, it] of per) {
      const l = line(pid);
      l.orders += 1;
      l.orderShare += it.share;
      l.grossProfit += o.profit * it.share;
      if (o.payment_mode === "cod") l.codOrders += 1;
      if (kerala) l.keralaOrders += 1;
      if (SOLD.has(o.status)) {
        l.pieces += it.qty;
        l.revenue += o.order_value * it.share;
        l.productCost += it.cost;
        l.shipping += o.shipping_cost * it.share;
        l.codFees += o.cod_fee * it.share;
        if (l.daily[o.order_date]) l.daily[o.order_date].pieces += it.qty;
      } else if (LOSS.has(o.status)) {
        l.rtoCount += 1;
        l.rtoLoss += o.profit * it.share;
      }
      if (l.daily[o.order_date]) l.daily[o.order_date].net += o.profit * it.share;
      const w = dayWeight.get(o.order_date) ?? new Map<string, number>();
      w.set(pid, (w.get(pid) ?? 0) + it.share);
      dayWeight.set(o.order_date, w);
    }
  }

  // split each day's ad spend + staff by that day's order share
  let unallocatedAds = 0;
  let unallocatedStaff = 0;
  for (const c of costs) {
    if (c.date < from || c.date > to) continue;
    const w = dayWeight.get(c.date);
    const total = w ? [...w.values()].reduce((a, b) => a + b, 0) : 0;
    if (!w || total === 0) {
      unallocatedAds += c.ad;
      unallocatedStaff += c.staff;
      continue;
    }
    for (const [pid, share] of w) {
      const l = line(pid);
      const ad = (c.ad * share) / total;
      const st = (c.staff * share) / total;
      l.adSpend += ad;
      l.staff += st;
      if (l.daily[c.date]) l.daily[c.date].net -= ad + st;
    }
  }

  const list = [...lines.values()].map((l) => ({ ...l, netProfit: l.grossProfit - l.adSpend - l.staff }));
  list.sort((a, b) => b.netProfit - a.netProfit);
  return { lines: list, unallocatedAds, unallocatedStaff, days };
}

/** Handy per-product ratios. */
export function ratios(l: ProductLine) {
  const per = l.orderShare || 0;
  const cpo = per ? l.adSpend / per : 0; // ad cost per order
  // the most you can spend on ads per order and still break even (after staff)
  const breakEvenCpo = per ? (l.grossProfit - l.staff) / per : 0;
  return {
    cpo,
    breakEvenCpo,
    roas: l.adSpend ? l.revenue / l.adSpend : null,
    rtoRate: l.orders ? l.rtoCount / l.orders : 0,
    margin: l.revenue ? l.netProfit / l.revenue : 0,
    profitPerOrder: per ? l.netProfit / per : 0,
    avgPrice: l.pieces ? l.revenue / l.pieces : 0,
    codShare: l.orders ? l.codOrders / l.orders : 0,
    keralaShare: l.orders ? l.keralaOrders / l.orders : 0,
  };
}
