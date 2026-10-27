import { Suspense } from "react";
import { FormSkeleton } from "@/components/skeleton";
import { PageHeader } from "@/components/coming-soon";
import { createClient } from "@/lib/supabase/server";
import { requestToday } from "@/lib/today";
import { AddOrderTabs } from "./add-order-tabs";
import type { CourierOption, ProductOption } from "./order-form";

export default function NewOrderPage() {
  return (
    <div>
      <PageHeader
        title="Add order"
        description="Paste the day's orders from WhatsApp, or enter one by hand. Prices and shipping fill in automatically."
      />
      <Suspense fallback={<FormSkeleton fields={5} />}>
        <Form />
      </Suspense>
    </div>
  );
}

async function Form() {
  const supabase = await createClient();
  const [products, couriers] = await Promise.all([
    supabase.from("products").select("id, name, price_paid, price_cod, cost, image_url").eq("active", true).order("name", { ascending: false }),
    supabase.from("couriers").select("id, name, default_shipping_cost, shipping_cost_outside, default_rto_charge, cod_fee_slabs").eq("active", true).order("name"),
  ]);
  const error = products.error ?? couriers.error;
  if (error) return <p className="text-sm text-red-600">{error.message}</p>;
  return <AddOrderTabs products={products.data as ProductOption[]} couriers={couriers.data as CourierOption[]} today={await requestToday()} />;
}
