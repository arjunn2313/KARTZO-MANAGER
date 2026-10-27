"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { todayIST } from "@/lib/validation";

export type Result = { ok: boolean; message: string };

const daySchema = z.object({
  date: z.iso.date(),
  staff_amount: z.number().int().min(0).max(1_000_000),
  staff_orders_taken: z.number().int().min(0).max(10_000).nullable(),
  staff_bonus: z.number().int().min(0).max(1_000_000).optional(),
  staff_bonus_note: z
    .string()
    .trim()
    .max(120)
    .transform((v) => (v === "" ? null : v))
    .optional(),
});

function friendly(m: string) {
  if (m.includes("staff_bonus") || m.includes("app_settings")) return "Run DATABASE-UPDATE-7.sql in Supabase first";
  return m;
}

/** Saves one day's staff amount, orders taken and bonus. Leaves ad spend untouched. */
export async function saveStaffDay(input: z.input<typeof daySchema>): Promise<Result> {
  const supabase = await requireUser();
  const parsed = daySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter whole numbers" };
  const { error } = await supabase.from("daily_inputs").upsert(parsed.data, { onConflict: "date" });
  if (error) return { ok: false, message: friendly(error.message) };
  refresh();
  return { ok: true, message: "Saved" };
}

const weekSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  paid: z.boolean(),
  recordExpense: z.boolean(),
  label: z.string().max(80),
});

/** Marks every day in the week paid / unpaid. Optionally logs the payout in Expenses as cash out. */
export async function setWeekPaid(input: z.input<typeof weekSchema>): Promise<Result> {
  const supabase = await requireUser();
  const parsed = weekSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid week" };
  const { from, to, paid, recordExpense, label } = parsed.data;

  const { data: rows, error: e1 } = await supabase.from("daily_inputs").select("*").gte("date", from).lte("date", to);
  if (e1) return { ok: false, message: e1.message };
  const days = (rows ?? []).filter((d) => (d.staff_amount ?? 0) + (d.staff_bonus ?? 0) > 0);
  if (!days.length) return { ok: false, message: "No staff amounts in this week" };
  const total = days.reduce((s, d) => s + (d.staff_amount ?? 0) + (d.staff_bonus ?? 0), 0);

  const { error } = await supabase
    .from("daily_inputs")
    .update({ staff_paid: paid, staff_paid_date: paid ? todayIST() : null })
    .in(
      "date",
      days.map((d) => d.date),
    );
  if (error) return { ok: false, message: error.message };

  let note = "";
  if (paid && recordExpense) {
    // Staff pay is already in net profit (Dashboard), so this is "cash out", not a business cost
    let { data: cat } = await supabase.from("expense_categories").select("id").eq("name", "Staff salary").maybeSingle();
    if (!cat) {
      const ins = await supabase.from("expense_categories").insert({ name: "Staff salary", kind: "transfer", sort: 55 }).select("id").single();
      cat = ins.data;
    }
    if (cat) {
      const { error: e3 } = await supabase
        .from("cash_entries")
        .insert({ date: todayIST(), category_id: cat.id, amount: total, note: `Staff payout ${label}` });
      note = e3 ? " (couldn't add to Expenses: run DATABASE-UPDATE-6.sql)" : " and added to Expenses";
    }
  }

  refresh();
  return { ok: true, message: paid ? `₹${total.toLocaleString("en-IN")} marked paid${note}` : "Marked as not paid" };
}

const settingsSchema = z.object({
  business_name: z.string().trim().max(80),
  business_address: z.string().trim().max(160),
  business_phone: z.string().trim().max(40),
  staff_name: z.string().trim().max(80),
});

/** Business details used on receipts. */
export async function saveBusinessSettings(input: z.input<typeof settingsSchema>): Promise<Result> {
  const supabase = await requireUser();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the details" };
  const rows = Object.entries(parsed.data).map(([key, value]) => ({ key, value }));
  const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) return { ok: false, message: friendly(error.message) };
  refresh();
  return { ok: true, message: "Saved" };
}
