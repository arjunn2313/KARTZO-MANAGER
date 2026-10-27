import { Suspense } from "react";
import { PageSkeleton } from "@/components/skeleton";
import { shiftDays } from "@/lib/dashboard";
import { DEFAULT_MESSAGE, DEFAULT_MESSAGE_ML } from "@/lib/dispatch";
import { createClient } from "@/lib/supabase/server";
import { requestToday } from "@/lib/today";
import { DispatchView, type DispatchOrder } from "./dispatch-view";

type Search = { days?: string; tab?: string };

/** How far back the "sent / all tracking" lists go. */
const PERIODS = ["14", "30", "90", "all"] as const;

export default function DispatchPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dispatch searchParams={searchParams} />
    </Suspense>
  );
}

const COLS =
  "id, order_code, order_date, dispatch_date, customer_name, phone, pincode, payment_mode, order_type, order_value, cod_balance, tracking_id, status, whatsapp_sent_at, label_printed_at, items:order_items(qty, product:products(id, name))";

async function Dispatch({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const supabase = await createClient(); // reads cookies first, so "today" is worked out per request
  const today = await requestToday();
  const days = (PERIODS as readonly string[]).includes(sp.days ?? "") ? (sp.days as (typeof PERIODS)[number]) : "14";

  let sentQ = supabase.from("orders").select(COLS).in("status", ["dispatched", "delivered", "rto", "returned"]);
  if (days !== "all") sentQ = sentQ.gte("dispatch_date", shiftDays(today, -Number(days)));

  const [toPack, sent, settings] = await Promise.all([
    supabase.from("orders").select(COLS).eq("status", "new").order("order_date").order("created_at").limit(1000),
    sentQ.order("dispatch_date", { ascending: false }).order("created_at", { ascending: false }).limit(3000),
    supabase.from("app_settings").select("key, value"),
  ]);

  const error = toPack.error ?? sent.error;
  if (error) {
    return (
      <div className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900 ring-1 ring-amber-200">
        {/whatsapp_sent_at|label_printed_at/.test(error.message) ? (
          <>
            <p className="font-semibold">One-time database update needed</p>
            <p className="mt-1">
              Open <b>DATABASE-UPDATE-9.sql</b> from your kartzo-manager folder (run UPDATE-7 first if you haven&apos;t), copy everything,
              paste it into Supabase → SQL Editor → New query, and click Run. Then refresh this page.
            </p>
          </>
        ) : (
          error.message
        )}
      </div>
    );
  }

  const kv = Object.fromEntries((settings.data ?? []).map((r) => [r.key as string, r.value as string]));
  return (
    <DispatchView
      key={days}
      today={today}
      days={days}
      initialTab={sp.tab === "send" || sp.tab === "sent" ? sp.tab : undefined}
      toPack={(toPack.data ?? []) as unknown as DispatchOrder[]}
      dispatched={(sent.data ?? []) as unknown as DispatchOrder[]}
      business={kv.business_name || "Kartzo"}
      templates={{ en: kv.dispatch_message || DEFAULT_MESSAGE, ml: kv.dispatch_message_ml || DEFAULT_MESSAGE_ML }}
      labelNote={kv.label_note ?? ""}
    />
  );
}
