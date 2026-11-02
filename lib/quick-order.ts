import { z } from "zod";

/** One order from the smart order form (staff link or your own app). */
export const quickOrderSchema = z
  .object({
    customer_name: z.string().trim().min(2, "Enter the customer's name").max(80),
    phone: z.string().regex(/^[6-9]\d{9}$/, "Phone must be 10 digits starting with 6–9"),
    pincode: z.string().regex(/^[1-9]\d{5}$/, "Pincode must be 6 digits"),
    address: z.string().trim().min(10, "Address is too short").max(400),
    order_type: z.enum(["normal", "replacement"]),
    payment_mode: z.enum(["cod", "paid"]),
    order_value: z.number().int().min(0).max(1_000_000),
    advance_paid: z.number().int().min(0).max(1_000_000),
    notes: z.string().trim().max(300),
    courier_id: z.uuid("Choose a courier").nullable(),
    taken_by: z.enum(["staff", "owner"]).optional(),
    items: z.array(z.object({ product_id: z.uuid(), qty: z.number().int().min(1).max(50) })).min(1, "Add a product"),
  })
  .refine((o) => o.order_type === "replacement" || o.payment_mode === "paid" || o.advance_paid <= o.order_value, {
    message: "Advance can't be more than the amount",
  });

export type QuickOrderInput = z.input<typeof quickOrderSchema>;
export type QuickOrderResult = { ok: true; code: string } | { ok: false; message: string };
export type PhoneOrder = { code: string; date: string; status: string };
export type QuickProduct = { id: string; name: string; price_cod: number; price_paid: number };
export type QuickCourier = { id: string; name: string };
