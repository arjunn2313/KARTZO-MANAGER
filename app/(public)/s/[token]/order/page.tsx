import type { Metadata } from "next";
import { Suspense } from "react";
import { FormSkeleton } from "@/components/skeleton";
import { createClient } from "@/lib/supabase/server";
import { QuickOrderForm } from "@/components/quick-order/quick-order-form";
import type { QuickCourier, QuickProduct } from "@/lib/quick-order";
import { createStaffOrder, recentOrdersForPhone } from "./actions";

export const metadata: Metadata = {
  title: "New order",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function StaffOrderPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <div className="min-h-dvh bg-stone-100">
      <div className="mx-auto max-w-lg px-4 pt-5 pb-32">
        <Suspense fallback={<FormSkeleton />}>
          <OrderPage params={params} />
        </Suspense>
      </div>
    </div>
  );
}

async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_order_setup", { p_token: token });
  if (error || !data) {
    return (
      <div className="mt-24 rounded-2xl bg-white p-8 text-center ring-1 ring-stone-200">
        <div className="text-3xl">🔒</div>
        <h1 className="mt-3 text-lg font-semibold text-stone-900">{error ? "Not set up yet" : "This link doesn't work"}</h1>
        <p className="mt-1 text-sm text-stone-500">{error ? "Ask to run DATABASE-UPDATE-16.sql in Supabase." : "Ask for the new link."}</p>
      </div>
    );
  }
  const d = data as { business: string | null; staff: string | null; products: QuickProduct[]; couriers?: QuickCourier[] };
  return (
    <QuickOrderForm
      products={d.products}
      // couriers come with DATABASE-UPDATE-17; before that the order goes to the default courier
      couriers={d.couriers ?? []}
      business={d.business || "Kartzo"}
      create={createStaffOrder.bind(null, token)}
      phoneOrders={recentOrdersForPhone.bind(null, token)}
      back={{ href: `/s/${token}`, label: "My dashboard" }}
    />
  );
}
