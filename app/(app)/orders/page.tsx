import { cookies } from "next/headers";
import Link from "next/link";
import { OrdersSkeleton } from "@/components/skeleton";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { STATUSES, type OrderRow } from "@/lib/orders";
import { requestToday } from "@/lib/today";
import { OrdersFilters } from "./orders-filters";
import { OrdersTable } from "./orders-table";
import { StatusByTracking } from "./status-by-tracking";
import type { EditCourier } from "./edit-order-dialog";

const DEFAULT_SIZE = 50;

type Search = Record<string, string | string[] | undefined>;

export default function OrdersPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
          <p className="mt-1 text-sm text-stone-500">Tick orders to change status or add tracking IDs in one go.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <StatusByTracking />
          <Link
            href="/orders/new"
            className="shrink-0 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            + Add order
          </Link>
        </div>
      </div>
      <Suspense fallback={<OrdersSkeleton />}>
        <Orders searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function shiftDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function datePresets(today: string) {
  return [
    { key: "today", label: "Today", from: today, to: today },
    { key: "yesterday", label: "Yesterday", from: shiftDays(today, -1), to: shiftDays(today, -1) },
    { key: "7d", label: "Last 7 days", from: shiftDays(today, -6), to: today },
    { key: "30d", label: "Last 30 days", from: shiftDays(today, -29), to: today },
    { key: "month", label: "This month", from: today.slice(0, 8) + "01", to: today },
    { key: "all", label: "All time", from: undefined, to: undefined },
  ];
}

const LIST_COLUMNS =
  "id, order_code, order_date, dispatch_date, customer_name, phone, address, pincode, qty, order_type, payment_mode, order_value, advance_paid, cod_balance, tracking_id, status, profit, shipping_cost, cod_fee, product_cost, rto_charge, damaged, refund_amount, return_shipping, notes, product_id, courier_id, items_cost, taken_by, product:products(name), courier:couriers(name), items:order_items(product_id, qty, unit_cost, unit_price, product:products(name))";

async function Orders({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const presets = datePresets(await requestToday());

  const range = one(sp.range) ?? (one(sp.from) || one(sp.to) ? "custom" : "30d");
  const preset = presets.find((p) => p.key === range);
  const from = preset ? preset.from : one(sp.from);
  const to = preset ? preset.to : one(sp.to);

  const statusParam = one(sp.status) ?? "";
  const status = (STATUSES as readonly string[]).includes(statusParam) ? statusParam : "";
  const payment = one(sp.payment) ?? "";
  const product = one(sp.product) ?? "";
  const courier = one(sp.courier) ?? "";
  const rawQ = one(sp.q) ?? "";
  const q = rawQ.replace(/[,()%*\\:]/g, " ").trim();
  const page = Math.max(1, Number(one(sp.page)) || 1);
  // rows per page: from the link, else the last choice saved in a cookie
  const cookieSize = (await cookies()).get("kartzo_rows_orders")?.value;
  const PAGE_SIZE = Math.min(500, Math.max(1, Number(one(sp.size) ?? cookieSize) || DEFAULT_SIZE));

  const supabase = await createClient();

  // Product filter: orders that contain this product anywhere in their product list
  let productOrderIds: string[] | null = null;
  if (product) {
    const { data } = await supabase.from("order_items").select("order_id").eq("product_id", product).limit(20000);
    productOrderIds = [...new Set((data ?? []).map((r) => r.order_id as string))];
    if (!productOrderIds.length) productOrderIds = ["00000000-0000-0000-0000-000000000000"];
  }

  // Filters shared by the list and the totals (status is applied separately so tab counts stay visible)
  function base(columns: string, opts?: { count?: "exact" }) {
    let qy = supabase.from("orders").select(columns, opts);
    if (from) qy = qy.gte("order_date", from);
    if (to) qy = qy.lte("order_date", to);
    if (payment === "paid" || payment === "cod") qy = qy.eq("payment_mode", payment);
    if (payment === "replacement") qy = qy.eq("order_type", "replacement");
    if (productOrderIds) qy = qy.in("id", productOrderIds);
    if (courier) qy = qy.eq("courier_id", courier);
    if (q) {
      const like = `%${q}%`;
      qy = qy.or(
        `customer_name.ilike.${like},phone.ilike.${like},tracking_id.ilike.${like},order_code.ilike.${like},pincode.ilike.${like}`,
      );
    }
    return qy;
  }

  let listQuery = base(LIST_COLUMNS, { count: "exact" });
  if (status) listQuery = listQuery.eq("status", status);

  const [list, totals, products, couriers] = await Promise.all([
    listQuery
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    base("status, order_value, profit, cod_balance, payment_mode").limit(20000),
    supabase.from("products").select("id, name, cost, price_paid, price_cod").order("name"),
    supabase.from("couriers").select("id, name, default_shipping_cost, shipping_cost_outside, default_rto_charge, cod_fee_slabs").order("name"),
  ]);

  if (list.error)
    return (
      <p className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900 ring-1 ring-amber-200">
        {list.error.message.includes("taken_by")
          ? "One-time database update needed: open DATABASE-UPDATE-13.sql, paste it into Supabase → SQL Editor and click Run. Then refresh this page."
          : list.error.message}
      </p>
    );

  const rows = (list.data ?? []) as unknown as OrderRow[];

  // every tracking ID in this filter (all pages), same order as the list, for "Copy tracking IDs"
  const trackingIds: string[] = [];
  for (let i = 0; i < 20; i++) {
    let tq = base("tracking_id").not("tracking_id", "is", null);
    if (status) tq = tq.eq("status", status);
    const { data } = await tq
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(i * 1000, i * 1000 + 999);
    const chunk = ((data ?? []) as unknown as { tracking_id: string | null }[]).map((r) => r.tracking_id).filter(Boolean) as string[];
    trackingIds.push(...chunk);
    if (!data || data.length < 1000) break;
  }
  const count = list.count ?? rows.length;

  type T = { status: string; order_value: number; profit: number; cod_balance: number; payment_mode: string };
  const everything = (totals.data ?? []) as unknown as T[];
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, everything.filter((o) => o.status === s).length]));
  const inView = status ? everything.filter((o) => o.status === status) : everything;
  const notCancelled = inView.filter((o) => o.status !== "cancelled");

  const summary = {
    orders: notCancelled.length,
    sales: notCancelled.filter((o) => o.status !== "rto" && o.status !== "returned").reduce((s, o) => s + o.order_value, 0),
    profit: inView.reduce((s, o) => s + o.profit, 0),
    rto: inView.filter((o) => o.status === "rto" || o.status === "returned").length,
    codPending: inView
      .filter((o) => o.payment_mode === "cod" && (o.status === "new" || o.status === "dispatched"))
      .reduce((s, o) => s + o.cod_balance, 0),
  };

  return (
    <div className="space-y-4">
      <OrdersFilters
        presets={presets.map(({ key, label }) => ({ key, label }))}
        current={{ range, from: from ?? "", to: to ?? "", status, payment, product, courier, q: rawQ }}
        products={products.data ?? []}
        couriers={couriers.data ?? []}
        statusCounts={byStatus}
      />
      <OrdersTable
        products={products.data ?? []}
        couriers={(couriers.data ?? []) as unknown as EditCourier[]}
        rows={rows}
        summary={summary}
        page={page}
        pageCount={Math.max(1, Math.ceil(count / PAGE_SIZE))}
        pageSize={PAGE_SIZE}
        trackingIds={trackingIds}
        total={count}
      />
    </div>
  );
}
