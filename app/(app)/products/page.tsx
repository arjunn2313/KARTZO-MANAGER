import { Suspense } from "react";
import { CardsSkeleton } from "@/components/skeleton";
import { createClient } from "@/lib/supabase/server";
import { ProductsTable, type ProductRow } from "./products-table";

export default function ProductsPage() {
  return (
    <Suspense fallback={<CardsSkeleton list={false} />}>
      <Products />
    </Suspense>
  );
}

async function Products() {
  const supabase = await createClient();
  const [products, stock] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, price_paid, price_cod, cost, active, image_url, low_stock_alert")
      .order("active", { ascending: false })
      .order("name"),
    supabase.from("product_stock").select("product_id, stock_added, sold, pending"),
  ]);

  const error = products.error ?? stock.error;
  if (error) {
    const needsUpdate = /image_url|low_stock_alert|product_stock/.test(error.message);
    return (
      <div className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900 ring-1 ring-amber-200">
        {needsUpdate ? (
          <>
            <p className="font-semibold">One-time database update needed</p>
            <p className="mt-1">
              Open <b>DATABASE-UPDATE-2.sql</b> from your kartzo-manager folder, copy everything, paste it into
              Supabase → SQL Editor → New query, and click Run. Then refresh this page.
            </p>
          </>
        ) : (
          error.message
        )}
      </div>
    );
  }

  const byId = new Map((stock.data ?? []).map((s) => [s.product_id, s]));
  const rows: ProductRow[] = (products.data ?? []).map((p) => {
    const s = byId.get(p.id) ?? { stock_added: 0, sold: 0, pending: 0 };
    return {
      ...p,
      stock_added: s.stock_added,
      sold: s.sold,
      pending: s.pending,
      available: s.stock_added - s.sold,
    };
  });

  return <ProductsTable rows={rows} />;
}
