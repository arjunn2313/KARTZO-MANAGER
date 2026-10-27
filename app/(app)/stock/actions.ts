"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

export type Result = { ok: boolean; message: string };

const BULK_STOCK = "Bulk stock";

function friendly(m: string) {
  if (/kind|supplier|unit_cost|stock_out_daily|product_demand_daily/.test(m) && /column|relation|does not exist|schema cache/.test(m))
    return "Run DATABASE-UPDATE-12.sql in Supabase first";
  if (m.includes("stock_in")) return "Run DATABASE-UPDATE-2.sql in Supabase first";
  return m;
}

const entrySchema = z
  .object({
    id: z.uuid().optional(),
    product_id: z.uuid("Choose a product"),
    date: z.iso.date("Pick a date"),
    kind: z.enum(["purchase", "opening", "adjust"]),
    qty: z.number({ error: "Enter the number of pieces" }).int("Whole pieces only").min(-100_000).max(100_000),
    supplier: z.string().trim().max(80),
    unit_cost: z.number().int().min(0).max(1_000_000).nullable(),
    note: z.string().trim().max(200),
    add_expense: z.boolean(),
  })
  .refine((e) => e.qty !== 0, { message: "Pieces can't be 0", path: ["qty"] })
  .refine((e) => e.kind === "adjust" || e.qty > 0, { message: "Use Correction to take stock away", path: ["qty"] });

export async function addStockEntry(input: z.input<typeof entrySchema>): Promise<Result> {
  const supabase = await requireUser();
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the values" };
  const { add_expense, id, ...e } = parsed.data;

  const row = {
    product_id: e.product_id,
    date: e.date,
    kind: e.kind,
    qty: e.qty,
    supplier: e.kind === "purchase" ? e.supplier || null : null,
    unit_cost: e.kind === "purchase" ? e.unit_cost : null,
    note: e.note || null,
  };
  if (id) {
    const { error } = await supabase.from("stock_in").update(row).eq("id", id);
    if (error) return { ok: false, message: friendly(error.message) };
    refresh();
    return { ok: true, message: "Stock entry updated" };
  }

  const { error } = await supabase.from("stock_in").insert(row);
  if (error) return { ok: false, message: friendly(error.message) };

  // Optional: the money paid also goes into the cash book (Expenses → Bulk stock)
  if (add_expense && e.kind === "purchase" && e.unit_cost && e.qty > 0) {
    const { data: cat } = await supabase.from("expense_categories").select("id").eq("name", BULK_STOCK).maybeSingle();
    if (!cat) {
      refresh();
      return { ok: true, message: `Stock saved. Add the payment on the Expenses page (no "${BULK_STOCK}" category found).` };
    }
    const { data: p } = await supabase.from("products").select("name").eq("id", e.product_id).single();
    const { error: e2 } = await supabase.from("cash_entries").insert({
      date: e.date,
      category_id: cat.id,
      amount: e.qty * e.unit_cost,
      note: `${p?.name ?? "Stock"} × ${e.qty}${e.supplier ? ` from ${e.supplier}` : ""}`,
    });
    if (e2) {
      refresh();
      return { ok: true, message: "Stock saved, but the expense wasn't: " + e2.message };
    }
  }

  refresh();
  return { ok: true, message: e.qty > 0 ? `${e.qty} pieces added` : `${-e.qty} pieces taken off` };
}

export async function deleteStockEntry(id: string): Promise<Result> {
  const supabase = await requireUser();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid entry" };
  const { error } = await supabase.from("stock_in").delete().eq("id", id);
  if (error) return { ok: false, message: friendly(error.message) };
  refresh();
  return { ok: true, message: "Stock entry deleted" };
}

export async function setLeadDays(days: number): Promise<Result> {
  const supabase = await requireUser();
  const parsed = z.number().int().min(0).max(90).safeParse(days);
  if (!parsed.success) return { ok: false, message: "Enter 0–90 days" };
  const { error } = await supabase.from("app_settings").upsert({ key: "stock_lead_days", value: String(parsed.data) }, { onConflict: "key" });
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true, message: "Saved" };
}
