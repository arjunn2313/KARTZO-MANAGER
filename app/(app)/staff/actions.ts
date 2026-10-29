"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { todayIST } from "@/lib/validation";

export type Result = { ok: boolean; message: string };

const daySchema = z.object({
  date: z.iso.date(),
  staff_amount: z.number().int().min(0).max(1_000_000).optional(),
  staff_orders_taken: z.number().int().min(0).max(10_000).nullable().optional(),
  staff_bonus: z.number().int().min(0).max(1_000_000).optional(),
  staff_bonus_note: z
    .string()
    .trim()
    .max(120)
    .transform((v) => (v === "" ? null : v))
    .optional(),
});

function friendly(m: string) {
  if (m.includes("staff_paid_amount") || m.includes("staff_recalc")) return "Run DATABASE-UPDATE-13.sql in Supabase first";
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

/** Marks the week paid / unpaid. Paying records how much each day was worth, so orders added later show up as "due". */
export async function setWeekPaid(input: z.input<typeof weekSchema>): Promise<Result> {
  const supabase = await requireUser();
  const parsed = weekSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid week" };
  const { from, to, paid, recordExpense, label } = parsed.data;

  const { data: rows, error: e1 } = await supabase.from("daily_inputs").select("*").gte("date", from).lte("date", to);
  if (e1) return { ok: false, message: e1.message };
  const pay = (d: { staff_amount?: number | null; staff_bonus?: number | null }) => (d.staff_amount ?? 0) + (d.staff_bonus ?? 0);
  const days = (rows ?? []).filter((d) => pay(d) > 0 || d.staff_paid);
  if (!days.length) return { ok: false, message: "No staff amounts in this week" };

  if (!paid) {
    let { error } = await supabase
      .from("daily_inputs")
      .update({ staff_paid: false, staff_paid_date: null, staff_paid_amount: null })
      .in("date", days.map((d) => d.date));
    if (error?.message.includes("staff_paid_amount"))
      ({ error } = await supabase.from("daily_inputs").update({ staff_paid: false, staff_paid_date: null }).in("date", days.map((d) => d.date)));
    if (error) return { ok: false, message: error.message };
    refresh();
    return { ok: true, message: "Marked as not paid" };
  }

  // only what hasn't been paid yet (days paid earlier may have grown since)
  const due = (d: (typeof days)[number]) => (d.staff_paid ? Math.max(0, pay(d) - (d.staff_paid_amount ?? pay(d))) : pay(d));
  const total = days.reduce((s, d) => s + due(d), 0);
  if (total <= 0) return { ok: false, message: "Nothing due for this week" };

  for (const d of days) {
    if (pay(d) <= 0) continue;
    let { error } = await supabase
      .from("daily_inputs")
      .update({ staff_paid: true, staff_paid_date: todayIST(), staff_paid_amount: pay(d) })
      .eq("date", d.date);
    if (error?.message.includes("staff_paid_amount"))
      ({ error } = await supabase.from("daily_inputs").update({ staff_paid: true, staff_paid_date: todayIST() }).eq("date", d.date));
    if (error) return { ok: false, message: error.message };
  }

  let note = "";
  if (recordExpense) {
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
  return { ok: true, message: `₹${total.toLocaleString("en-IN")} marked paid${note}` };
}

const paySchema = z.object({
  rate: z.number({ error: "Enter an amount" }).int("Whole rupees only").min(0).max(10_000),
  auto_from: z.iso.date("Pick a date"),
});

/**
 * Per-order pay settings. A new rate applies from today (paid weeks stay as they were);
 * moving the start date earlier recounts those days from the orders.
 */
export async function setStaffPay(input: z.input<typeof paySchema>): Promise<Result> {
  const supabase = await requireUser();
  const parsed = paySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the values" };
  const today = todayIST();
  if (parsed.data.auto_from > today) return { ok: false, message: "Start date can't be in the future" };

  const { data: old } = await supabase.from("app_settings").select("key, value").in("key", ["staff_rate", "staff_auto_from"]);
  const kv = Object.fromEntries((old ?? []).map((r) => [r.key, r.value]));
  const { error } = await supabase.from("app_settings").upsert(
    [
      { key: "staff_rate", value: String(parsed.data.rate) },
      { key: "staff_auto_from", value: parsed.data.auto_from },
    ],
    { onConflict: "key" },
  );
  if (error) return { ok: false, message: friendly(error.message) };

  const rateChanged = kv.staff_rate !== String(parsed.data.rate);
  const startMoved = kv.staff_auto_from !== parsed.data.auto_from;
  const recountFrom = startMoved && (!kv.staff_auto_from || parsed.data.auto_from < kv.staff_auto_from) ? parsed.data.auto_from : rateChanged ? today : null;
  if (recountFrom) {
    const { error: e2 } = await supabase.rpc("staff_recalc_range", { a: recountFrom > parsed.data.auto_from ? recountFrom : parsed.data.auto_from, b: today });
    if (e2) return { ok: false, message: e2.message.includes("staff_recalc") ? "Run DATABASE-UPDATE-13.sql in Supabase first" : e2.message };
  }
  refresh();
  return { ok: true, message: "Staff pay settings saved" };
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

/** Saves only the staff name (from the receipt). */
export async function saveStaffName(name: string): Promise<Result> {
  const supabase = await requireUser();
  const value = String(name ?? "").trim().slice(0, 80);
  if (!value) return { ok: false, message: "Enter a name" };
  const { error } = await supabase.from("app_settings").upsert({ key: "staff_name", value }, { onConflict: "key" });
  if (error) return { ok: false, message: friendly(error.message) };
  refresh();
  return { ok: true, message: "Name saved" };
}

/** Makes a new secret staff link (the old one stops working), or switches the link off. */
export async function changeStaffLink(mode: "new" | "off"): Promise<Result & { token?: string }> {
  const supabase = await requireUser();
  const token = mode === "new" ? crypto.randomUUID().replaceAll("-", "") : "";
  const { error } = await supabase.from("app_settings").upsert([{ key: "staff_link_token", value: token }], { onConflict: "key" });
  if (error) return { ok: false, message: friendly(error.message) };
  refresh();
  return mode === "new"
    ? { ok: true, message: "New link made. The old link no longer works.", token }
    : { ok: true, message: "Staff link switched off" };
}
