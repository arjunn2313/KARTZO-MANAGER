"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { ADS_CATEGORY } from "@/lib/ad-wallet";
import { requireUser } from "@/lib/auth";

export type Result = { ok: boolean; message: string };

const rupees = z.number({ error: "Enter an amount" }).int("Whole rupees only").min(0, "Can't be negative").max(100_000_000);

function friendly(m: string) {
  if (m.includes("ad_wallet_readings")) return "Run DATABASE-UPDATE-11.sql in Supabase first";
  if (m.includes("cash_entries") || m.includes("expense_categories")) return "Run DATABASE-UPDATE-6.sql in Supabase first";
  return m;
}

/** Saves (or replaces) the morning balance for a date. */
export async function saveReading(input: { date: string; balance: number }): Promise<Result> {
  const supabase = await requireUser();
  const parsed = z.object({ date: z.iso.date("Pick a date"), balance: rupees }).safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the balance" };
  const { error } = await supabase.from("ad_wallet_readings").upsert(parsed.data, { onConflict: "date" });
  if (error) return { ok: false, message: friendly(error.message) };
  refresh();
  return { ok: true, message: "Balance saved" };
}

export async function deleteReading(date: string): Promise<Result> {
  const supabase = await requireUser();
  if (!z.iso.date().safeParse(date).success) return { ok: false, message: "Invalid date" };
  const { error } = await supabase.from("ad_wallet_readings").delete().eq("date", date);
  if (error) return { ok: false, message: friendly(error.message) };
  refresh();
  return { ok: true, message: "Balance deleted" };
}

/** Adds a recharge to the cash book under "Ads wallet". */
export async function addRecharge(input: { date: string; amount: number; note: string }): Promise<Result> {
  const supabase = await requireUser();
  const parsed = z
    .object({
      date: z.iso.date("Pick a date"),
      amount: rupees.refine((n) => n > 0, "Amount must be more than 0"),
      note: z.string().trim().max(300),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the recharge" };

  let { data: cat } = await supabase.from("expense_categories").select("id").eq("name", ADS_CATEGORY).maybeSingle();
  if (!cat) {
    const ins = await supabase.from("expense_categories").insert({ name: ADS_CATEGORY, kind: "transfer", sort: 10 }).select("id").single();
    if (ins.error) return { ok: false, message: friendly(ins.error.message) };
    cat = ins.data;
  }
  const { error } = await supabase.from("cash_entries").insert({
    date: parsed.data.date,
    amount: parsed.data.amount,
    note: parsed.data.note || null,
    category_id: cat.id,
  });
  if (error) return { ok: false, message: friendly(error.message) };
  refresh();
  return { ok: true, message: "Recharge added" };
}

export async function deleteRecharge(id: string): Promise<Result> {
  const supabase = await requireUser();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid recharge" };
  const { error } = await supabase.from("cash_entries").delete().eq("id", id);
  if (error) return { ok: false, message: friendly(error.message) };
  refresh();
  return { ok: true, message: "Recharge deleted" };
}

export async function setAdGst(percent: number): Promise<Result> {
  const supabase = await requireUser();
  const parsed = z.number().int().min(0).max(28).safeParse(percent);
  if (!parsed.success) return { ok: false, message: "GST must be 0–28%" };
  const { error } = await supabase.from("app_settings").upsert({ key: "ad_gst_percent", value: String(parsed.data) }, { onConflict: "key" });
  if (error) return { ok: false, message: error.message.includes("app_settings") ? "Run DATABASE-UPDATE-7.sql in Supabase first" : error.message };
  refresh();
  return { ok: true, message: parsed.data ? `Recharges now count ${parsed.data}% GST` : "GST off" };
}
