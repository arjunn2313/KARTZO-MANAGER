import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { LabelSheet, type LabelOrder } from "./label-sheet";

type Search = Record<string, string | string[] | undefined>;

export default function LabelsPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={
        <div role="status" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-stone-200 text-sm text-stone-600">
          <span className="size-9 animate-spin rounded-full border-[3px] border-stone-300 border-t-emerald-600 motion-reduce:animate-none" aria-hidden />
          Preparing labels…
        </div>
      }>
      <Labels searchParams={searchParams} />
    </Suspense>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Labels({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const ids = one(sp.ids)
    .split(",")
    .filter((s) => UUID.test(s))
    .slice(0, 500);
  const layout = ["a4-4", "a4-2", "4x6"].includes(one(sp.layout)) ? one(sp.layout) : "a4-4";

  if (!ids.length) return <p className="p-6 text-sm text-stone-600">No orders selected. Go back to Dispatch and tick some orders.</p>;

  const supabase = await createClient();
  const [orders, settings] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, order_code, order_date, customer_name, phone, address, pincode, payment_mode, order_type, order_value, cod_balance, notes, items:order_items(qty, product:products(name))",
      )
      .in("id", ids),
    supabase.from("app_settings").select("key, value"),
  ]);
  if (orders.error) return <p className="p-6 text-sm text-red-600">{orders.error.message}</p>;

  // keep the order they were selected in
  const byId = new Map((orders.data ?? []).map((o) => [o.id as string, o]));
  const sorted = ids.map((id) => byId.get(id)).filter(Boolean) as unknown as LabelOrder[];
  const kv = Object.fromEntries((settings.data ?? []).map((r) => [r.key as string, r.value as string]));

  return (
    <LabelSheet
      orders={sorted}
      initialLayout={layout as "a4-4" | "a4-2" | "4x6"}
      from={{ name: kv.business_name || "Kartzo", address: kv.business_address ?? "", phone: kv.business_phone ?? "" }}
      note={kv.label_note ?? ""}
    />
  );
}
