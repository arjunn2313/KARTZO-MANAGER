"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

export type Result = { ok: boolean; message: string };

const entrySchema = z.object({
  id: z.uuid().optional(),
  date: z.iso.date("Pick a date"),
  category_id: z.uuid("Choose a category"),
  amount: z.number({ error: "Enter an amount" }).int("Whole rupees only").positive("Amount must be more than 0").max(100_000_000),
  note: z
    .string()
    .trim()
    .max(300)
    .transform((v) => (v === "" ? null : v)),
});

function friendly(m: string) {
  if (m.includes("cash_entries") || m.includes("expense_categories")) return "Run DATABASE-UPDATE-6.sql in Supabase first";
  if (m.includes("duplicate key")) return "A category with that name already exists";
  return m;
}

export async function saveEntry(input: z.input<typeof entrySchema>): Promise<Result> {
  const supabase = await requireUser();
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the entry" };
  const { id, ...data } = parsed.data;
  const { error } = id
    ? await supabase.from("cash_entries").update(data).eq("id", id)
    : await supabase.from("cash_entries").insert(data);
  if (error) return { ok: false, message: friendly(error.message) };
  refresh();
  return { ok: true, message: id ? "Entry updated" : "Entry added" };
}

export async function deleteEntry(id: string): Promise<Result> {
  const supabase = await requireUser();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid entry" };
  const { error } = await supabase.from("cash_entries").delete().eq("id", id);
  if (error) return { ok: false, message: friendly(error.message) };
  refresh();
  return { ok: true, message: "Entry deleted" };
}

const categorySchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Name is required").max(60),
  kind: z.enum(["cost", "transfer", "income"]),
  active: z.boolean(),
});

export async function saveCategory(input: z.input<typeof categorySchema>): Promise<Result> {
  const supabase = await requireUser();
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the category" };
  const { id, ...data } = parsed.data;
  const { error } = id
    ? await supabase.from("expense_categories").update(data).eq("id", id)
    : await supabase.from("expense_categories").insert({ ...data, sort: 95 });
  if (error) return { ok: false, message: friendly(error.message) };
  refresh();
  return { ok: true, message: id ? "Saved" : "Category added" };
}
