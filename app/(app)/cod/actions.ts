"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

export type Result = { ok: boolean; message: string };

export type MatchedOrder = {
  id: string;
  order_code: string;
  customer_name: string;
  tracking_id: string;
  status: string;
  payment_mode: string;
  order_type: string;
  cod_balance: number;
  cod_fee: number;
  order_date: string;
  dispatch_date: string | null;
  remittance_id: string | null;
};

const INDIA_POST = /^[A-Z]{2}\d{9}[A-Z]{2}$/;

/** Pulls likely tracking numbers out of any pasted text / CSV (Excel columns, WhatsApp, PDF copy…). */
function extractTokens(text: string): string[] {
  const tokens = text.toUpperCase().match(/[A-Z0-9]{8,24}/g) ?? [];
  // must contain a digit; skip plain dates / amounts
  return [...new Set(tokens.filter((t) => /\d/.test(t) && (/[A-Z]/.test(t) || t.length >= 10)))];
}

/** Finds the orders for the tracking numbers in the pasted text. */
export async function matchTracking(text: string): Promise<{ ok: true; orders: MatchedOrder[]; notFound: string[]; scanned: number } | { ok: false; message: string }> {
  const supabase = await requireUser();
  const tokens = extractTokens(String(text ?? "").slice(0, 500_000)).slice(0, 3000);
  if (!tokens.length) return { ok: false, message: "No tracking numbers found in the text" };

  const found: MatchedOrder[] = [];
  for (let i = 0; i < tokens.length; i += 300) {
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_code, customer_name, tracking_id, status, payment_mode, order_type, cod_balance, cod_fee, order_date, dispatch_date, remittance_id")
      .in("tracking_id", tokens.slice(i, i + 300));
    if (error) return { ok: false, message: error.message.includes("remittance") ? "Run DATABASE-UPDATE-8.sql in Supabase first" : error.message };
    found.push(...((data ?? []) as MatchedOrder[]));
  }
  const foundIds = new Set(found.map((o) => o.tracking_id));
  // Only report "not found" for things that really look like tracking numbers
  const notFound = tokens.filter((t) => !foundIds.has(t) && (INDIA_POST.test(t) || (/^\d{10,16}$/.test(t) && !/^[6-9]\d{9}$/.test(t))));
  return { ok: true, orders: found, notFound, scanned: tokens.length };
}

const saveSchema = z.object({
  orderIds: z.array(z.uuid()).min(1, "No orders selected").max(3000),
  date: z.iso.date("Pick a date"),
  amount: z.number().int().min(0, "Amount can't be negative").max(100_000_000),
  reference: z.string().trim().max(80),
  note: z.string().trim().max(300),
  markDelivered: z.boolean(),
  addToExpenses: z.boolean(),
});

export async function saveRemittance(input: z.input<typeof saveSchema>): Promise<Result> {
  const supabase = await requireUser();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the details" };
  const { orderIds, date, amount, reference, note, markDelivered, addToExpenses } = parsed.data;

  // Only orders not already remitted
  const { data: orders, error: e0 } = await supabase
    .from("orders")
    .select("id, cod_balance, cod_fee, courier_id, remittance_id")
    .in("id", orderIds);
  if (e0) return { ok: false, message: e0.message };
  const fresh = (orders ?? []).filter((o) => !o.remittance_id);
  if (!fresh.length) return { ok: false, message: "These orders are already in a remittance" };
  const expected = fresh.reduce((s, o) => s + (o.cod_balance ?? 0) - (o.cod_fee ?? 0), 0);
  const courierIds = [...new Set(fresh.map((o) => o.courier_id).filter(Boolean))];

  const { data: rem, error: e1 } = await supabase
    .from("cod_remittances")
    .insert({
      date,
      amount,
      expected,
      reference: reference || null,
      note: note || null,
      courier_id: courierIds.length === 1 ? courierIds[0] : null,
    })
    .select("id")
    .single();
  if (e1) return { ok: false, message: e1.message.includes("cod_remittances") ? "Run DATABASE-UPDATE-8.sql in Supabase first" : e1.message };

  const ids = fresh.map((o) => o.id);
  const { error: e2 } = await supabase.from("orders").update({ remittance_id: rem.id }).in("id", ids).is("remittance_id", null);
  if (e2) return { ok: false, message: e2.message };

  if (markDelivered) {
    await supabase.from("orders").update({ status: "delivered" }).in("id", ids).in("status", ["new", "dispatched"]);
  }

  let extra = "";
  if (addToExpenses && amount > 0) {
    let { data: cat } = await supabase.from("expense_categories").select("id").eq("name", "COD remittance").maybeSingle();
    if (!cat) {
      const ins = await supabase.from("expense_categories").insert({ name: "COD remittance", kind: "income", sort: 80 }).select("id").single();
      cat = ins.data;
    }
    if (cat) {
      const { data: entry } = await supabase
        .from("cash_entries")
        .insert({ date, category_id: cat.id, amount, note: `COD remittance${reference ? ` · ${reference}` : ""} · ${ids.length} orders` })
        .select("id")
        .single();
      if (entry) {
        await supabase.from("cod_remittances").update({ cash_entry_id: entry.id }).eq("id", rem.id);
        extra = " and added to Expenses";
      }
    }
  }

  refresh();
  return { ok: true, message: `Remittance saved for ${ids.length} order${ids.length > 1 ? "s" : ""}${extra}` };
}

/** Removes a remittance: orders become "not paid yet" again, the Expenses entry is removed. Status is left as is. */
export async function undoRemittance(id: string): Promise<Result> {
  const supabase = await requireUser();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid remittance" };
  const { data: rem } = await supabase.from("cod_remittances").select("cash_entry_id").eq("id", id).single();
  await supabase.from("orders").update({ remittance_id: null }).eq("remittance_id", id);
  const { error } = await supabase.from("cod_remittances").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  if (rem?.cash_entry_id) await supabase.from("cash_entries").delete().eq("id", rem.cash_entry_id);
  refresh();
  return { ok: true, message: "Remittance removed" };
}
