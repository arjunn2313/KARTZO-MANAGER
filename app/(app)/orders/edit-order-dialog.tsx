"use client";

import { useState, useTransition } from "react";
import { ItemsEditor } from "@/components/items-editor";
import { rs, type OrderRow } from "@/lib/orders";
import { codFeeFor, isKeralaPin, shippingFor, type CodFeeSlab } from "@/lib/shipping";
import { isValidPhone, isValidPin, normalizePhone, normalizePin } from "@/lib/validation";
import { updateOrder, type BulkResult } from "./actions";

export type EditProduct = { id: string; name: string; cost: number; price_paid: number; price_cod: number };
type EditItem = { product_id: string; qty: number; unit_cost: number; unit_price: number };
export type EditCourier = {
  id: string;
  name: string;
  default_shipping_cost: number;
  shipping_cost_outside: number | null;
  default_rto_charge: number;
  cod_fee_slabs: CodFeeSlab[] | null;
};

type Kind = "cod" | "paid" | "replacement";

const box =
  "rounded-lg border bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:ring-2 border-stone-300 focus:border-emerald-600 focus:ring-emerald-600/20";
const input = "w-full " + box;
const bad = " !border-red-400 !bg-red-50/40";

export function EditOrderDialog({
  order: o,
  products,
  couriers,
  onClose,
  onDone,
}: {
  order: OrderRow;
  products: EditProduct[];
  couriers: EditCourier[];
  onClose: () => void;
  onDone: (r: BulkResult) => void;
}) {
  const [f, setF] = useState({
    order_code: o.order_code,
    order_date: o.order_date,
    dispatch_date: o.dispatch_date ?? "",
    customer_name: o.customer_name,
    phone: o.phone ?? "",
    address: o.address ?? "",
    pincode: o.pincode ?? "",
    kind: (o.order_type === "replacement" ? "replacement" : o.payment_mode) as Kind,
    order_value: o.order_value,
    advance_paid: o.advance_paid,
    courier_id: o.courier_id ?? couriers[0]?.id ?? "",
    shipping_cost: o.shipping_cost,
    rto_charge: o.rto_charge,
    cod_fee: o.cod_fee,
    tracking_id: o.tracking_id ?? "",
    notes: o.notes ?? "",
    taken_by: (o.taken_by ?? "staff") as "staff" | "owner",
  });
  const [items, setItems] = useState<EditItem[]>(
    o.items?.length
      ? o.items.map((i) => ({ product_id: i.product_id, qty: i.qty, unit_cost: i.unit_cost, unit_price: i.unit_price }))
      : [{ product_id: o.product_id, qty: o.qty, unit_cost: o.product_cost, unit_price: o.qty ? Math.round(o.order_value / o.qty) : 0 }],
  );
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((prev) => ({ ...prev, [k]: v }));

  const courier = couriers.find((c) => c.id === f.courier_id);
  const pin = normalizePin(f.pincode);
  const phoneOk = isValidPhone(normalizePhone(f.phone));
  const pinOk = isValidPin(pin);
  const codBalance = f.order_value - f.advance_paid;
  const suggestedShipping = shippingFor(courier, pin);
  const suggestedCodFee = f.kind === "cod" ? codFeeFor(courier?.cod_fee_slabs, codBalance) : 0;
  const mode = f.kind === "paid" ? "paid" : "cod";
  const cost = items.reduce((s, i) => s + i.unit_cost * i.qty, 0);
  const normal = items.reduce((s, i) => {
    const p = products.find((x) => x.id === i.product_id);
    return s + (p ? (mode === "paid" ? p.price_paid : p.price_cod) : i.unit_price) * i.qty;
  }, 0);
  const itemsOk = items.length > 0 && items.every((i) => i.product_id);
  const profit = f.order_value - cost - f.shipping_cost - f.cod_fee;

  /** Keep the saved cost of products that didn't change; new / swapped products use today's cost */
  function changeItems(next: { product_id: string; qty: number }[]) {
    setItems(
      next.map((n, idx) => {
        const old = items[idx];
        if (old && old.product_id === n.product_id) return { ...old, qty: n.qty };
        const p = products.find((x) => x.id === n.product_id);
        return { product_id: n.product_id, qty: n.qty, unit_cost: p?.cost ?? 0, unit_price: p ? (mode === "paid" ? p.price_paid : p.price_cod) : 0 };
      }),
    );
  }

  function setKind(k: Kind) {
    setF((prev) => ({
      ...prev,
      kind: k,
      order_value: k === "replacement" ? 0 : prev.order_value,
      advance_paid: k === "replacement" ? 0 : k === "paid" ? prev.order_value : prev.advance_paid === prev.order_value ? 0 : prev.advance_paid,
      cod_fee: k === "cod" ? prev.cod_fee : 0,
    }));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await updateOrder({
        id: o.id,
        order_code: f.order_code,
        order_date: f.order_date,
        dispatch_date: f.dispatch_date,
        customer_name: f.customer_name,
        phone: f.phone,
        address: f.address,
        pincode: f.pincode,
        items,
        order_type: f.kind === "replacement" ? "replacement" : "normal",
        payment_mode: f.kind === "paid" ? "paid" : "cod",
        order_value: f.order_value,
        advance_paid: f.advance_paid,
        courier_id: f.courier_id,
        shipping_cost: f.shipping_cost,
        rto_charge: f.rto_charge,
        cod_fee: f.kind === "cod" ? f.cod_fee : 0,
        tracking_id: f.tracking_id,
        taken_by: f.taken_by,
        notes: f.notes,
      });
      if (!r.ok) return setError({ message: r.message, field: r.field });
      onDone(r);
    });
  }

  const err = (field: string) => error?.field === field;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex max-h-[94vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:max-w-3xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Edit {o.order_code}</h2>
            <p className="text-xs text-stone-500">Status, RTO and returns are changed from the order list.</p>
          </div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-stone-400 hover:bg-stone-100" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Dates */}
          <Section title="Order ID & dates">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Order ID" hint={f.order_code.trim().toUpperCase() !== o.order_code ? `Was ${o.order_code}` : undefined}>
                <input
                  value={f.order_code}
                  onChange={(e) => set("order_code", e.target.value.toUpperCase())}
                  autoComplete="off"
                  className={input + " uppercase" + (err("order_code") ? bad : "")}
                />
              </Field>
              <Field label="Order date">
                <input type="date" value={f.order_date} onChange={(e) => set("order_date", e.target.value)} className={input + (err("order_date") ? bad : "")} />
              </Field>
              <Field label="Dispatch date" hint="Leave empty if not dispatched yet">
                <input type="date" value={f.dispatch_date} onChange={(e) => set("dispatch_date", e.target.value)} className={input} />
              </Field>
            </div>
          </Section>

          {/* Customer */}
          <Section title="Customer">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <input value={f.customer_name} onChange={(e) => set("customer_name", e.target.value)} className={input + (err("customer_name") ? bad : "")} />
              </Field>
              <Field label="Phone" hint={phoneOk ? undefined : "Must be a 10-digit mobile number"} hintBad={!phoneOk}>
                <input value={f.phone} inputMode="tel" onChange={(e) => set("phone", e.target.value)} className={input + (!phoneOk || err("phone") ? bad : "")} />
              </Field>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px]">
              <Field label="Address">
                <textarea rows={3} value={f.address} onChange={(e) => set("address", e.target.value)} className={input + " resize-y" + (err("address") ? bad : "")} />
              </Field>
              <Field
                label="PIN code"
                hint={!pinOk ? "Must be 6 digits" : isKeralaPin(pin) ? "Kerala" : "Outside Kerala"}
                hintBad={!pinOk}
              >
                <input value={f.pincode} inputMode="numeric" onChange={(e) => set("pincode", e.target.value)} className={input + (!pinOk || err("pincode") ? bad : "")} />
              </Field>
            </div>
          </Section>

          {/* Product & payment */}
          <Section title="Products & payment">
            <ItemsEditor items={items} products={products} onChange={changeItems} invalid={!itemsOk} />
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_2fr]">
              <Field label="Payment">
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-stone-100 p-1">
                  {(["cod", "paid", "replacement"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={`rounded-md py-1.5 text-xs font-semibold ${f.kind === k ? "bg-white shadow-sm ring-1 ring-stone-200" : "text-stone-500"}`}
                    >
                      {k === "cod" ? "COD" : k === "paid" ? "Paid" : "Repl."}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Field label="Order value">
                <Money value={f.order_value} disabled={f.kind === "replacement"} onChange={(v) => setF((p) => ({ ...p, order_value: v, advance_paid: p.kind === "paid" ? v : p.advance_paid }))} />
              </Field>
              <Field label="Advance paid" hint={f.kind === "cod" ? `COD to collect ${rs(codBalance)}` : undefined} hintBad={codBalance < 0}>
                <Money value={f.advance_paid} disabled={f.kind === "replacement"} onChange={(v) => set("advance_paid", v)} bad={codBalance < 0 || err("advance_paid")} />
              </Field>
              <Field label="Product cost">
                <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-700 ring-1 ring-stone-200">{rs(cost)}</div>
              </Field>
            </div>
            {f.kind !== "replacement" && normal > 0 && f.order_value !== normal && (
              <p className={`mt-2 text-xs ${f.order_value < normal ? "text-emerald-700" : "text-amber-700"}`}>
                Normal price {rs(normal)}
                {f.order_value < normal ? ` · Discount ${rs(normal - f.order_value)}` : ""}
                <button
                  type="button"
                  onClick={() => setF((p) => ({ ...p, order_value: normal, advance_paid: p.kind === "paid" ? normal : p.advance_paid }))}
                  className="ml-2 font-medium text-emerald-700 underline"
                >
                  Use normal price
                </button>
              </p>
            )}
          </Section>

          {/* Shipping */}
          <Section title="Shipping">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Courier">
                <select value={f.courier_id} onChange={(e) => set("courier_id", e.target.value)} className={input}>
                  {couriers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tracking ID">
                <input
                  value={f.tracking_id}
                  onChange={(e) => set("tracking_id", e.target.value)}
                  className={input + " font-mono uppercase" + (err("tracking_id") ? bad : "")}
                />
              </Field>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Field
                label="Shipping cost"
                hint={f.shipping_cost !== suggestedShipping ? `Usual for this PIN: ₹${suggestedShipping}` : undefined}
              >
                <Money value={f.shipping_cost} onChange={(v) => set("shipping_cost", v)} />
              </Field>
              <Field label="COD commission" hint={f.kind === "cod" && f.cod_fee !== suggestedCodFee ? `Usual: ₹${suggestedCodFee}` : undefined}>
                <Money value={f.kind === "cod" ? f.cod_fee : 0} disabled={f.kind !== "cod"} onChange={(v) => set("cod_fee", v)} />
              </Field>
              <Field label="Extra RTO charge">
                <Money value={f.rto_charge} onChange={(v) => set("rto_charge", v)} />
              </Field>
            </div>
            {(f.shipping_cost !== suggestedShipping || (f.kind === "cod" && f.cod_fee !== suggestedCodFee)) && (
              <button
                type="button"
                onClick={() => setF((p) => ({ ...p, shipping_cost: suggestedShipping, cod_fee: p.kind === "cod" ? suggestedCodFee : 0 }))}
                className="mt-2 text-xs font-medium text-emerald-700"
              >
                Use usual shipping & COD fee
              </button>
            )}
            <div className="mt-3">
              <Field label="Notes">
                <input value={f.notes} onChange={(e) => set("notes", e.target.value)} className={input} />
              </Field>
              <Field label="Order taken by" hint={f.taken_by === "staff" ? "Counts for staff pay once dispatched" : "Not counted in staff pay"}>
                <select value={f.taken_by} onChange={(e) => set("taken_by", e.target.value as "staff" | "owner")} className={input}>
                  <option value="staff">Staff</option>
                  <option value="owner">Me</option>
                </select>
              </Field>
            </div>
          </Section>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-stone-100 px-5 py-4">
          <div className="text-sm text-stone-600">
            Profit if delivered{" "}
            <b className={profit < 0 ? "text-red-600" : "text-emerald-700"}>{rs(profit)}</b>
          </div>
          {error && <span className="text-sm text-red-600">{error.message}</span>}
          <div className="flex-1" />
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-stone-600 hover:bg-stone-100">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={pending || !phoneOk || !pinOk || codBalance < 0 || !itemsOk}
            className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, hint, hintBad, children }: { label: string; hint?: string; hintBad?: boolean; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-stone-600">
      {label}
      <div className="mt-1">{children}</div>
      {hint && <div className={`mt-1 font-normal ${hintBad ? "text-red-600" : "text-stone-400"}`}>{hint}</div>}
    </label>
  );
}

function Money({ value, onChange, disabled, bad: isBad }: { value: number; onChange: (n: number) => void; disabled?: boolean; bad?: boolean }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-stone-400">₹</span>
      <input
        type="number"
        min={0}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value) || 0)))}
        className={input + " pl-7 disabled:bg-stone-50 disabled:text-stone-400" + (isBad ? bad : "")}
      />
    </div>
  );
}
