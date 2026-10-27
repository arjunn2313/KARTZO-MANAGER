import { Suspense } from "react";
import { PageSkeleton } from "@/components/skeleton";
import { createClient } from "@/lib/supabase/server";
import { requestToday } from "@/lib/today";
import { CodView, type PendingOrder, type Remittance } from "./cod-view";

export default function CodPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Cod />
    </Suspense>
  );
}

async function Cod() {
  const supabase = await createClient(); // reads cookies first, so "today" is worked out per request
  const today = await requestToday();

  const [pending, transit, rems] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_code, customer_name, phone, tracking_id, cod_balance, cod_fee, order_date, dispatch_date")
      .eq("payment_mode", "cod")
      .eq("status", "delivered")
      .is("remittance_id", null)
      .gt("cod_balance", 0)
      .order("dispatch_date", { ascending: true, nullsFirst: true })
      .limit(5000),
    supabase.from("orders").select("cod_balance").eq("payment_mode", "cod").eq("status", "dispatched").limit(20000),
    supabase
      .from("cod_remittances")
      .select("id, date, amount, expected, reference, note, created_at, orders(id, order_code, customer_name, tracking_id, cod_balance, cod_fee)")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (rems.error) {
    return (
      <div className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900 ring-1 ring-amber-200">
        <p className="font-semibold">One-time database update needed</p>
        <p className="mt-1">
          Open <b>DATABASE-UPDATE-8.sql</b> from your kartzo-manager folder (run UPDATE-6 first if you haven&apos;t), copy everything, paste
          it into Supabase → SQL Editor → New query, and click Run. Then refresh this page.
        </p>
      </div>
    );
  }
  const error = pending.error ?? transit.error;
  if (error) return <p className="text-sm text-red-600">{error.message}</p>;

  return (
    <CodView
      today={today}
      pending={(pending.data ?? []) as PendingOrder[]}
      transit={{ count: transit.data?.length ?? 0, amount: (transit.data ?? []).reduce((s, o) => s + (o.cod_balance ?? 0), 0) }}
      remittances={(rems.data ?? []) as unknown as Remittance[]}
    />
  );
}
