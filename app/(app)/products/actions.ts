"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

export type ActionResult = { ok: boolean; message: string };

const rupees = z.coerce.number({ error: "Enter a number" }).int("Whole rupees only").min(0, "Can't be negative");

const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  price_paid: rupees,
  price_cod: rupees,
  cost: rupees,
  low_stock_alert: z.coerce.number().int().min(0),
  image_url: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  active: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

const stockSchema = z.object({
  product_id: z.uuid(),
  qty: z.coerce
    .number({ error: "Enter a number" })
    .int("Whole numbers only")
    .refine((n) => n !== 0, "Quantity can't be 0"),
  date: z.iso.date("Pick a date"),
  note: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v === "" ? null : v)),
});

function friendly(message: string) {
  if (message.includes("duplicate key")) return "A product with that name already exists";
  if (message.includes("stock_in") && message.includes("does not exist"))
    return "Run DATABASE-UPDATE-2.sql in Supabase first";
  return message;
}

export async function saveProduct(formData: FormData): Promise<ActionResult> {
  const supabase = await requireUser();
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the values" };

  const id = String(formData.get("id") ?? "");
  const { error } = id
    ? await supabase.from("products").update(parsed.data).eq("id", id)
    : await supabase.from("products").insert(parsed.data);

  if (error) return { ok: false, message: friendly(error.message) };
  refresh();
  return { ok: true, message: id ? "Product saved" : "Product added" };
}

export async function addStock(formData: FormData): Promise<ActionResult> {
  const supabase = await requireUser();
  const parsed = stockSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the values" };

  const { error } = await supabase.from("stock_in").insert(parsed.data);
  if (error) return { ok: false, message: friendly(error.message) };
  refresh();
  return { ok: true, message: "Stock updated" };
}
