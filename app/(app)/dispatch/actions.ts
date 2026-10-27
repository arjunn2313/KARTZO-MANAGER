"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

export type Result = { ok: boolean; message: string };

function friendly(m: string) {
  if (m.includes("whatsapp_sent_at") || m.includes("label_printed_at")) return "Run DATABASE-UPDATE-9.sql in Supabase first";
  return m;
}

export async function markWhatsAppSent(id: string, sent: boolean): Promise<Result> {
  const supabase = await requireUser();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid order" };
  const { error } = await supabase.from("orders").update({ whatsapp_sent_at: sent ? new Date().toISOString() : null }).eq("id", id);
  if (error) return { ok: false, message: friendly(error.message) };
  refresh();
  return { ok: true, message: sent ? "Marked as sent" : "Marked as not sent" };
}

export async function markLabelsPrinted(ids: string[]): Promise<Result> {
  const supabase = await requireUser();
  const parsed = z.array(z.uuid()).min(1).max(500).safeParse(ids);
  if (!parsed.success) return { ok: false, message: "Invalid selection" };
  const { error } = await supabase.from("orders").update({ label_printed_at: new Date().toISOString() }).in("id", parsed.data);
  if (error) return { ok: false, message: friendly(error.message) };
  refresh();
  return { ok: true, message: "Labels marked as printed" };
}

export async function saveDispatchSettings(input: { dispatch_message: string; dispatch_message_ml: string; label_note: string }): Promise<Result> {
  const supabase = await requireUser();
  const parsed = z
    .object({ dispatch_message: z.string().max(1500), dispatch_message_ml: z.string().max(1500), label_note: z.string().max(200) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Message is too long" };
  const rows = Object.entries(parsed.data).map(([key, value]) => ({ key, value }));
  const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) return { ok: false, message: error.message.includes("app_settings") ? "Run DATABASE-UPDATE-7.sql in Supabase first" : error.message };
  refresh();
  return { ok: true, message: "Saved" };
}
