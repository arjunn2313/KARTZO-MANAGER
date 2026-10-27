"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

export type FormState = { ok: boolean; message: string | null };

const rupees = z.coerce.number({ error: "Enter a number" }).int("Whole rupees only").min(0, "Can't be negative");

const courierSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  default_shipping_cost: rupees,
  shipping_cost_outside: z.preprocess((v) => (v === "" || v == null ? null : v), rupees.nullable()),
  default_rto_charge: rupees,
  cod_fee_slabs: z.preprocess(
    (v) => {
      try {
        return JSON.parse(String(v ?? "[]"));
      } catch {
        return null;
      }
    },
    z
      .array(z.object({ upto: z.number().int().positive("COD amount must be more than 0"), fee: z.number().int().min(0) }))
      .max(20),
  ),
  active: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

function friendly(message: string) {
  if (message.includes("duplicate key")) return "That name already exists";
  if (message.includes("shipping_cost_outside") || message.includes("cod_fee_slabs"))
    return "Run DATABASE-UPDATE-3.sql in Supabase first";
  return message;
}

export async function saveCourier(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await requireUser();
  const parsed = courierSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the values" };

  const data = { ...parsed.data, cod_fee_slabs: [...parsed.data.cod_fee_slabs].sort((a, b) => a.upto - b.upto) };
  const id = String(formData.get("id") ?? "");
  const { error } = id
    ? await supabase.from("couriers").update(data).eq("id", id)
    : await supabase.from("couriers").insert(data);

  if (error) return { ok: false, message: friendly(error.message) };
  refresh();
  return { ok: true, message: id ? "Saved" : "Courier added" };
}
