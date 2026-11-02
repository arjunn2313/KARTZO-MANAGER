"use server";

import { lookupPincode } from "@/lib/pincode";
import { quickOrderSchema, type PhoneOrder, type QuickOrderInput, type QuickOrderResult } from "@/lib/quick-order";
import { createClient } from "@/lib/supabase/server";

/** Orders from this phone in the last 30 days (to avoid taking the same order twice). */
export async function recentOrdersForPhone(token: string, phone: string): Promise<PhoneOrder[]> {
  if (!/^[6-9]\d{9}$/.test(phone)) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("staff_phone_orders", { p_token: token, p_phone: phone });
  return (data ?? []) as PhoneOrder[];
}

/** Saves the order through the staff link (checked again in the database). Always "taken by staff". */
export async function createStaffOrder(token: string, input: QuickOrderInput): Promise<QuickOrderResult> {
  const parsed = quickOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the order" };
  if (!lookupPincode(parsed.data.pincode)) return { ok: false, message: "This pincode doesn't exist. Ask the customer again." };
  const { taken_by: _ignored, ...order } = parsed.data;
  void _ignored;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_create_order", { p_token: token, p: order });
  if (error) {
    const m = error.message;
    if (/staff_create_order|function .* does not exist/i.test(m)) return { ok: false, message: "Not set up yet: run DATABASE-UPDATE-16.sql and 17 in Supabase" };
    return { ok: false, message: m };
  }
  return { ok: true, code: data as string };
}
