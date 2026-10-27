"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { bumpCode } from "@/lib/orders";
import { codFeeFor, parseSlabs, shippingFor } from "@/lib/shipping";
import { isValidPhone, isValidPin, normalizePhone, normalizePin, todayIST } from "@/lib/validation";

type Supabase = Awaited<ReturnType<typeof requireUser>>;

export type BulkResult = { ok: boolean; message: string };
export type CreateOrderResult =
  | { ok: true; orderCode: string; message: string }
  | { ok: false; message: string; field?: string };

/* ---------------- shared pieces ---------------- */

const money = z.number({ error: "Enter a number" }).int("Whole rupees only").min(0, "Can't be negative");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));

const itemsSchema = z
  .array(z.object({ product_id: z.uuid("Choose a product"), qty: z.number().int().min(1).max(50) }))
  .min(1, "Add at least one product")
  .max(10);

const customerShape = {
  customer_name: z.string().trim().min(1, "Customer name is required").max(120),
  phone: z.string().transform(normalizePhone).refine(isValidPhone, "Phone must be a 10-digit mobile number"),
  address: z.string().trim().min(5, "Address is required").max(500),
  pincode: z.string().transform(normalizePin).refine(isValidPin, "PIN code must be 6 digits"),
};

/** Optional order ID typed by hand (e.g. KZT2395 for a late-entered Sunday order). Blank = automatic. */
const orderCode = z
  .string()
  .trim()
  .toUpperCase()
  .max(20, "Order ID is too long")
  .refine((v) => v === "" || /^[A-Z0-9][A-Z0-9-]*$/.test(v), "Order ID can only have letters, numbers and -")
  .transform((v) => (v === "" ? null : v));

/** Returns the codes from the list that already belong to another order. */
async function takenCodes(supabase: Supabase, codes: string[], exceptId?: string) {
  if (!codes.length) return [];
  let q = supabase.from("orders").select("order_code").in("order_code", codes);
  if (exceptId) q = q.neq("id", exceptId);
  const { data } = await q;
  return (data ?? []).map((r) => r.order_code as string);
}

function friendly(message: string): { message: string; field?: string } {
  if (message.includes("orders_order_code_key"))
    return { message: "This order ID is already used on another order", field: "order_code" };
  if (message.includes("orders_tracking_id_key"))
    return { message: "This tracking ID is already used on another order", field: "tracking_id" };
  if (message.includes("create_orders") || message.includes("replace_order_items") || message.includes("order_items"))
    return { message: "Run DATABASE-UPDATE-5.sql in Supabase first" };
  return { message };
}

/** Looks up cost + normal price for each item, so saved orders keep today's numbers. */
async function priceItems(
  supabase: Supabase,
  items: { product_id: string; qty: number }[],
  mode: "paid" | "cod",
) {
  const ids = [...new Set(items.map((i) => i.product_id))];
  const { data, error } = await supabase.from("products").select("id, cost, price_paid, price_cod").in("id", ids);
  if (error) throw new Error(error.message);
  const byId = new Map(data.map((p) => [p.id, p]));
  return items.map((i) => {
    const p = byId.get(i.product_id);
    if (!p) throw new Error("A product in this order no longer exists");
    return {
      product_id: i.product_id,
      qty: i.qty,
      unit_cost: p.cost,
      unit_price: mode === "paid" ? p.price_paid : p.price_cod,
    };
  });
}

/* ---------------- Create one order ---------------- */

const orderSchema = z
  .object({
    order_date: z.iso.date("Pick a date"),
    order_code: orderCode.optional(),
    ...customerShape,
    items: itemsSchema,
    order_type: z.enum(["normal", "replacement"]),
    payment_mode: z.enum(["paid", "cod"]),
    order_value: money,
    advance_paid: money,
    courier_id: z.uuid("Choose a courier"),
    shipping_cost: money,
    rto_charge: money,
    cod_fee: money,
    tracking_id: optionalText(40).transform((v) => (v ? v.toUpperCase() : v)),
    status: z.enum(["new", "dispatched"]),
    notes: optionalText(500),
  })
  .refine((o) => o.advance_paid <= o.order_value, {
    message: "Advance can't be more than the order value",
    path: ["advance_paid"],
  });

export type CreateOrderInput = z.input<typeof orderSchema>;

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const supabase = await requireUser();
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: issue?.message ?? "Check the form", field: issue?.path[0]?.toString() };
  }
  const code0 = parsed.data.order_code;
  if (code0 && (await takenCodes(supabase, [code0])).length)
    return { ok: false, message: `Order ID ${code0} is already used. Leave it blank for an automatic one.`, field: "order_code" };
  try {
    const items = await priceItems(supabase, parsed.data.items, parsed.data.payment_mode);
    const { data, error } = await supabase.rpc("create_orders", { payload: [{ ...parsed.data, items }] });
    if (error) return { ok: false, ...friendly(error.message) };
    const code = (data as string[])[0];
    refresh();
    return { ok: true, orderCode: code, message: `Order ${code} saved` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** Past orders for a phone number, to flag repeat customers / duplicates. */
export async function findOrdersByPhone(rawPhone: string) {
  const supabase = await requireUser();
  const phone = normalizePhone(rawPhone);
  if (!isValidPhone(phone)) return [];
  const { data } = await supabase
    .from("orders")
    .select("order_code, order_date, customer_name, status")
    .eq("phone", phone)
    .order("order_date", { ascending: false })
    .limit(5);
  return data ?? [];
}

/* ---------------- Bulk create (WhatsApp paste) ---------------- */

const bulkRowSchema = z
  .object({
    ...customerShape,
    items: itemsSchema,
    kind: z.enum(["cod", "paid", "replacement"]),
    order_value: z.number().int().min(0),
    advance_paid: z.number().int().min(0),
  })
  .refine((r) => r.advance_paid <= r.order_value, { message: "Advance more than value", path: ["advance_paid"] });

const bulkSchema = z.object({
  order_date: z.iso.date(),
  first_code: orderCode.optional(),
  courier_id: z.uuid("Choose a courier"),
  status: z.enum(["new", "dispatched"]),
  rows: z.array(bulkRowSchema).min(1, "Nothing to save").max(300),
});

export type BulkCreateInput = z.input<typeof bulkSchema>;
export type BulkCreateResult = { ok: true; codes: string[] } | { ok: false; message: string; row?: number };

export async function createOrdersBulk(input: BulkCreateInput): Promise<BulkCreateResult> {
  const supabase = await requireUser();
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const rowIdx = issue?.path[0] === "rows" ? Number(issue.path[1]) : undefined;
    return {
      ok: false,
      message: (rowIdx !== undefined ? `Order ${rowIdx + 1}: ` : "") + (issue?.message ?? "Check the orders"),
      row: rowIdx,
    };
  }
  const { order_date, first_code, courier_id, status, rows } = parsed.data;

  // Manual numbering: first order gets first_code, the next ones count up from it
  let codes: (string | null)[] = rows.map(() => null);
  if (first_code) {
    const list = rows.map((_, i) => bumpCode(first_code, i));
    if (list.some((c) => !c)) return { ok: false, message: "First order ID must end in a number, like KZT2395" };
    codes = list;
    const taken = await takenCodes(supabase, list as string[]);
    if (taken.length)
      return {
        ok: false,
        message: `Order ID${taken.length > 1 ? "s" : ""} ${taken.join(", ")} already used. Pick a different starting ID or leave it blank.`,
      };
  }

  const { data: courier, error: cErr } = await supabase
    .from("couriers")
    .select("default_shipping_cost, shipping_cost_outside, default_rto_charge, cod_fee_slabs")
    .eq("id", courier_id)
    .single();
  if (cErr) return { ok: false, message: cErr.message };
  const rates = { ...courier, cod_fee_slabs: parseSlabs(courier.cod_fee_slabs) };

  try {
    const payload = [];
    for (const [idx, r] of rows.entries()) {
      const mode = r.kind === "paid" ? "paid" : "cod";
      const value = r.kind === "replacement" ? 0 : r.order_value;
      const advance = r.kind === "replacement" ? 0 : r.advance_paid;
      payload.push({
        order_date,
        order_code: codes[idx],
        customer_name: r.customer_name,
        phone: r.phone,
        address: r.address,
        pincode: r.pincode,
        order_type: r.kind === "replacement" ? "replacement" : "normal",
        payment_mode: mode,
        order_value: value,
        advance_paid: advance,
        courier_id,
        shipping_cost: shippingFor(rates, r.pincode),
        rto_charge: rates.default_rto_charge,
        cod_fee: r.kind === "cod" ? codFeeFor(rates.cod_fee_slabs, value - advance) : 0,
        status,
        items: await priceItems(supabase, r.items, mode),
      });
    }
    // One database call = all or nothing, so a failure never leaves half the batch saved
    const { data, error } = await supabase.rpc("create_orders", { payload });
    if (error) return { ok: false, message: friendly(error.message).message };
    refresh();
    return { ok: true, codes: data as string[] };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** Earlier orders (last 60 days) for a list of phones, to flag duplicates before saving. */
export async function findRecentOrdersByPhones(phones: string[]) {
  const supabase = await requireUser();
  const clean = [...new Set(phones.map(normalizePhone).filter(isValidPhone))].slice(0, 300);
  if (!clean.length) return {} as Record<string, { order_code: string; order_date: string; status: string }[]>;
  const since = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("orders")
    .select("phone, order_code, order_date, status")
    .in("phone", clean)
    .gte("order_date", since)
    .order("order_date", { ascending: false });
  const out: Record<string, { order_code: string; order_date: string; status: string }[]> = {};
  for (const o of data ?? []) (out[o.phone!] ??= []).push({ order_code: o.order_code, order_date: o.order_date, status: o.status });
  return out;
}

/* ---------------- Orders list: status + tracking ---------------- */

const idsSchema = z.array(z.uuid()).min(1, "Select at least one order").max(500);
const statusSchema = z.enum(["new", "dispatched", "delivered", "rto", "returned", "cancelled"]);

export async function updateOrderStatus(ids: string[], status: string): Promise<BulkResult> {
  const supabase = await requireUser();
  const idsParsed = idsSchema.safeParse(ids);
  const statusParsed = statusSchema.safeParse(status);
  if (!idsParsed.success || !statusParsed.success) return { ok: false, message: "Invalid selection" };

  const { error } = await supabase.from("orders").update({ status: statusParsed.data }).in("id", idsParsed.data);
  if (error) return { ok: false, message: error.message };

  // Anything that has left the warehouse needs a dispatch date (keeps an existing one)
  if (["dispatched", "delivered", "rto", "returned"].includes(statusParsed.data)) {
    await supabase.from("orders").update({ dispatch_date: todayIST() }).in("id", idsParsed.data).is("dispatch_date", null);
  }

  refresh();
  const n = idsParsed.data.length;
  return { ok: true, message: `${n} order${n > 1 ? "s" : ""} updated` };
}

const trackingSchema = z
  .array(
    z.object({
      id: z.uuid(),
      tracking_id: z
        .string()
        .trim()
        .toUpperCase()
        .max(40)
        .transform((v) => (v === "" ? null : v)),
    }),
  )
  .min(1)
  .max(500);

/** Saves tracking IDs. Orders still 'new' become 'dispatched' when markDispatched is true. */
export async function setTrackingIds(
  items: { id: string; tracking_id: string }[],
  markDispatched: boolean,
): Promise<BulkResult> {
  const supabase = await requireUser();
  const parsed = trackingSchema.safeParse(items);
  if (!parsed.success) return { ok: false, message: "Invalid tracking data" };

  const failed: string[] = [];
  for (const item of parsed.data) {
    const { error } = await supabase.from("orders").update({ tracking_id: item.tracking_id }).eq("id", item.id);
    if (error) failed.push(item.tracking_id ?? "(blank)");
  }

  if (markDispatched) {
    const ok = parsed.data.filter((i) => i.tracking_id && !failed.includes(i.tracking_id)).map((i) => i.id);
    if (ok.length) await supabase.from("orders").update({ status: "dispatched" }).in("id", ok).eq("status", "new");
  }

  refresh();
  if (failed.length)
    return { ok: false, message: `Already used on another order: ${failed.join(", ")}. The rest were saved.` };
  const n = parsed.data.length;
  return { ok: true, message: `Tracking saved for ${n} order${n > 1 ? "s" : ""}` };
}

/* ---------------- RTO / return details ---------------- */

const returnSchema = z.object({
  id: z.uuid(),
  status: z.enum(["rto", "returned"]),
  damaged: z.boolean(),
  refund_amount: z.number().int().min(0),
  return_shipping: z.number().int().min(0),
});

export async function saveReturnDetails(input: z.input<typeof returnSchema>): Promise<BulkResult> {
  const supabase = await requireUser();
  const parsed = returnSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the values" };
  const { id, status, ...details } = parsed.data;

  // 1) change status (database fills defaults), 2) save what you entered
  const { error: e1 } = await supabase.from("orders").update({ status }).eq("id", id);
  if (e1)
    return {
      ok: false,
      message: e1.message.includes("orders_status_check") ? "Run DATABASE-UPDATE-4.sql in Supabase first" : e1.message,
    };
  const { error: e2 } = await supabase
    .from("orders")
    .update({ ...details, return_shipping: status === "rto" ? 0 : details.return_shipping })
    .eq("id", id);
  if (e2) return { ok: false, message: e2.message };

  refresh();
  return { ok: true, message: status === "rto" ? "Marked as RTO" : "Marked as returned" };
}

/* ---------------- Edit order ---------------- */

const editSchema = z
  .object({
    id: z.uuid(),
    order_date: z.iso.date("Pick an order date"),
    order_code: z
      .string()
      .trim()
      .toUpperCase()
      .min(1, "Order ID can't be empty")
      .max(20, "Order ID is too long")
      .regex(/^[A-Z0-9][A-Z0-9-]*$/, "Order ID can only have letters, numbers and -"),
    dispatch_date: z.union([z.iso.date(), z.literal("")]).transform((v) => (v === "" ? null : v)),
    ...customerShape,
    items: z
      .array(
        z.object({
          product_id: z.uuid("Choose a product"),
          qty: z.number().int().min(1).max(50),
          unit_cost: money,
          unit_price: money,
        }),
      )
      .min(1, "Add at least one product")
      .max(10),
    order_type: z.enum(["normal", "replacement"]),
    payment_mode: z.enum(["paid", "cod"]),
    order_value: money,
    advance_paid: money,
    courier_id: z.uuid("Choose a courier"),
    shipping_cost: money,
    rto_charge: money,
    cod_fee: money,
    tracking_id: optionalText(40).transform((v) => (v ? v.toUpperCase() : v)),
    notes: optionalText(500),
  })
  .refine((o) => o.advance_paid <= o.order_value, {
    message: "Advance can't be more than the order value",
    path: ["advance_paid"],
  });

export type EditOrderInput = z.input<typeof editSchema>;

export async function updateOrder(input: EditOrderInput): Promise<BulkResult & { field?: string }> {
  const supabase = await requireUser();
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: issue?.message ?? "Check the form", field: issue?.path[0]?.toString() };
  }
  const { id, items, ...data } = parsed.data;

  if ((await takenCodes(supabase, [data.order_code], id)).length)
    return { ok: false, message: `Order ID ${data.order_code} is already used on another order`, field: "order_code" };

  const { error: e1 } = await supabase.rpc("replace_order_items", { p_order: id, items });
  if (e1) return { ok: false, ...friendly(e1.message) };

  const { error } = await supabase.from("orders").update(data).eq("id", id);
  if (error) return { ok: false, ...friendly(error.message) };

  refresh();
  return { ok: true, message: "Order updated" };
}

/** Change the order date of several orders at once (e.g. a whole paste saved with the wrong date). */
export async function setOrderDates(ids: string[], date: string): Promise<BulkResult> {
  const supabase = await requireUser();
  const idsParsed = idsSchema.safeParse(ids);
  const dateParsed = z.iso.date().safeParse(date);
  if (!idsParsed.success || !dateParsed.success) return { ok: false, message: "Pick a valid date" };
  const { error } = await supabase.from("orders").update({ order_date: dateParsed.data }).in("id", idsParsed.data);
  if (error) return { ok: false, message: error.message };
  refresh();
  const n = idsParsed.data.length;
  return { ok: true, message: `Date changed on ${n} order${n > 1 ? "s" : ""}` };
}
