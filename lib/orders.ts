export const STATUSES = ["new", "dispatched", "delivered", "rto", "returned", "cancelled"] as const;
export type OrderStatus = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  new: "New",
  dispatched: "Dispatched",
  delivered: "Delivered",
  rto: "RTO",
  returned: "Returned",
  cancelled: "Cancelled",
};

export const STATUS_STYLE: Record<OrderStatus, string> = {
  new: "bg-sky-100 text-sky-800",
  dispatched: "bg-amber-100 text-amber-800",
  delivered: "bg-emerald-100 text-emerald-800",
  rto: "bg-red-100 text-red-700",
  returned: "bg-rose-100 text-rose-800",
  cancelled: "bg-stone-200 text-stone-600",
};

export type OrderRow = {
  id: string;
  order_code: string;
  order_date: string;
  dispatch_date: string | null;
  customer_name: string;
  phone: string | null;
  address: string | null;
  pincode: string | null;
  qty: number;
  order_type: "normal" | "replacement";
  payment_mode: "paid" | "cod";
  order_value: number;
  advance_paid: number;
  cod_balance: number;
  tracking_id: string | null;
  status: OrderStatus;
  profit: number;
  shipping_cost: number;
  cod_fee: number;
  product_cost: number;
  rto_charge: number;
  damaged: boolean;
  refund_amount: number;
  return_shipping: number;
  notes: string | null;
  product_id: string;
  courier_id: string | null;
  items_cost?: number;
  /** who took the order: staff (counts for staff pay) or the owner */
  taken_by?: "staff" | "owner";
  items?: { product_id: string; qty: number; unit_cost: number; unit_price: number; product: { name: string } | null }[];
  product: { name: string } | null;
  courier: { name: string } | null;
};

export const rs = (n: number) => (n < 0 ? "−" : "") + "₹" + Math.abs(n).toLocaleString("en-IN");

/** 2026-10-27 → 27-10-2026 (same as the Excel sheet) */
export const dmy = (iso: string | null) => (iso ? iso.split("-").reverse().join("-") : "");

export const STATUS_DOT: Record<OrderStatus, string> = {
  new: "bg-sky-500",
  dispatched: "bg-amber-500",
  delivered: "bg-emerald-500",
  rto: "bg-red-500",
  returned: "bg-rose-400",
  cancelled: "bg-stone-400",
};

/** "Rear View Mirror + Glass Wiper × 2" */
export function orderItemsLabel(o: Pick<OrderRow, "items" | "product" | "qty">) {
  if (o.items?.length)
    return o.items.map((i) => (i.qty > 1 ? `${i.product?.name ?? "?"} × ${i.qty}` : (i.product?.name ?? "?"))).join(" + ");
  return o.qty > 1 ? `${o.product?.name ?? ""} × ${o.qty}` : (o.product?.name ?? "");
}

/** "KZT2395" + 2 → "KZT2397" (keeps leading zeros). Null if the code doesn't end in a number. */
export function bumpCode(code: string, by: number) {
  const m = code.trim().toUpperCase().match(/^(.*?)(\d+)$/);
  if (!m) return null;
  return m[1] + String(Number(m[2]) + by).padStart(m[2].length, "0");
}
