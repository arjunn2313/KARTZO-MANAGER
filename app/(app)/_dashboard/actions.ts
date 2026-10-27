"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const schema = z.object({
  date: z.iso.date(),
  ad_spend: z.number().int().min(0).max(10_000_000),
  staff_amount: z.number().int().min(0).max(10_000_000),
});

/** Saves the day's ad spend and staff amount (typed by hand on the dashboard). */
export async function saveDailyInput(input: z.input<typeof schema>): Promise<{ ok: boolean; message: string }> {
  const supabase = await requireUser();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter whole rupees" };
  const { error } = await supabase.from("daily_inputs").upsert(parsed.data, { onConflict: "date" });
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true, message: "Saved" };
}
