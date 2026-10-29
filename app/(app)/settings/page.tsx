import { Suspense } from "react";
import { FormSkeleton } from "@/components/skeleton";
import { PageHeader } from "@/components/coming-soon";
import { createClient } from "@/lib/supabase/server";
import { requestToday } from "@/lib/today";
import { BackupCard } from "./backup";
import { BusinessForm } from "./business";
import { CategoryRow } from "./categories";
import { CourierForm, type Courier } from "./forms";

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" />

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Monthly backup</h2>
          <p className="text-sm text-stone-500">Download everything from a month, with all the calculations, as an Excel file.</p>
        </div>
        <Suspense fallback={<FormSkeleton />}>
          <Backup />
        </Suspense>
      </section>

      <section className="space-y-3 pt-4">
        <div>
          <h2 className="text-lg font-semibold">Business details</h2>
          <p className="text-sm text-stone-500">Shown on payout receipts.</p>
        </div>
        <Suspense fallback={<FormSkeleton />}>
          <Business />
        </Suspense>
      </section>

      <section className="space-y-3 pt-4">
        <div>
          <h2 className="text-lg font-semibold">Couriers</h2>
          <p className="text-sm text-stone-500">
            Shipping fills in on new orders from the PIN code (Kerala PINs start with 67, 68, 69). You can still change it on any order. RTO loss = shipping + extra RTO charge.
          </p>
        </div>
        <Suspense fallback={<FormSkeleton />}>
          <Couriers />
        </Suspense>
        <details>
          <summary className="cursor-pointer text-sm font-medium text-emerald-700">+ Add a new courier</summary>
          <div className="mt-3">
            <CourierForm />
          </div>
        </details>
      </section>

      <section className="space-y-3 pt-4">
        <div>
          <h2 className="text-lg font-semibold">Expense categories</h2>
          <p className="text-sm text-stone-500">
            <b>Business cost</b> reduces net profit. <b>Cash out</b> is money already counted in orders or ad spend (wallet
            recharges, stock). <b>Money in</b> is cash received.
          </p>
        </div>
        <Suspense fallback={<FormSkeleton />}>
          <Categories />
        </Suspense>
      </section>
    </div>
  );
}

async function Backup() {
  const today = await requestToday();
  const [y, m] = today.split("-").map(Number);
  // this month and the 23 before it
  const months = Array.from({ length: 24 }, (_, i) => new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
  return <BackupCard months={months} />;
}

async function Business() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("app_settings").select("key, value");
  if (error) return <p className="text-sm text-amber-800">Run DATABASE-UPDATE-7.sql in Supabase to set up business details.</p>;
  const kv = Object.fromEntries((data ?? []).map((r) => [r.key as string, r.value as string]));
  return (
    <BusinessForm
      initial={{
        business_name: kv.business_name ?? "Kartzo",
        business_address: kv.business_address ?? "",
        business_phone: kv.business_phone ?? "",
        staff_name: kv.staff_name ?? "",
      }}
    />
  );
}

async function Categories() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("expense_categories").select("id, name, kind, active").order("sort").order("name");
  if (error) return <p className="text-sm text-amber-800">Run DATABASE-UPDATE-6.sql in Supabase to set up expense categories.</p>;
  return (
    <div className="space-y-2">
      {(data ?? []).map((c) => (
        <CategoryRow key={c.id} cat={c as { id: string; name: string; kind: "cost" | "transfer" | "income"; active: boolean }} />
      ))}
      <CategoryRow />
    </div>
  );
}

async function Couriers() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("couriers")
    .select("id, name, default_shipping_cost, shipping_cost_outside, default_rto_charge, cod_fee_slabs, active")
    .order("active", { ascending: false })
    .order("name");
  if (error) {
    if (/shipping_cost_outside|cod_fee_slabs/.test(error.message))
      return (
        <div className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900 ring-1 ring-amber-200">
          <p className="font-semibold">One-time database update needed</p>
          <p className="mt-1">
            Open <b>DATABASE-UPDATE-3.sql</b> from your kartzo-manager folder, copy everything, paste it into Supabase →
            SQL Editor → New query, and click Run. Then refresh this page.
          </p>
        </div>
      );
    return <p className="text-sm text-red-600">{error.message}</p>;
  }
  return (
    <div className="space-y-3">
      {(data as Courier[]).map((c) => (
        <CourierForm key={c.id} courier={c} />
      ))}
    </div>
  );
}
