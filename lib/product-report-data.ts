import "server-only";
import { loadDayCosts } from "./day-costs";
import { productReport, type ReportOrder } from "./product-report";
import type { createClient } from "./supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const COLS = "order_date, status, order_value, profit, shipping_cost, cod_fee, payment_mode, pincode, items:order_items(product_id, qty, unit_cost, unit_price)";

/** Loads orders, products and day costs for a range and runs the product report. */
export async function loadProductReport(supabase: Supabase, from: string, to: string) {
  // page through so long ranges are never cut at Supabase's row limit
  const orders: ReportOrder[] = [];
  for (let i = 0; i < 100; i++) {
    const { data, error } = await supabase
      .from("orders")
      .select(COLS)
      .gte("order_date", from)
      .lte("order_date", to)
      .order("order_date")
      .order("id")
      .range(i * 1000, i * 1000 + 999);
    if (error) return { error: error.message } as const;
    orders.push(...((data ?? []) as unknown as ReportOrder[]));
    if (!data || data.length < 1000) break;
  }

  const [products, costs] = await Promise.all([
    supabase.from("products").select("id, name, image_url, active").order("name"),
    loadDayCosts(supabase, from, to),
  ]);
  const productList = (products.data ?? []) as { id: string; name: string; image_url: string | null; active: boolean }[];
  return { error: null, productList, costs, report: productReport(orders, costs, productList, from, to) } as const;
}
