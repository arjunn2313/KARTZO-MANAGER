"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ItemsEditor } from "@/components/items-editor";
import { itemsCost, listPrice, type Item } from "@/lib/pricing";
import { codFeeFor, isKeralaPin, shippingFor, type CodFeeSlab } from "@/lib/shipping";
import { isValidPhone, isValidPin, normalizePhone, normalizePin } from "@/lib/validation";
import { createOrder, findOrdersByPhone } from "../actions";

export type ProductOption = { id: string; name: string; price_paid: number; price_cod: number; cost: number; image_url: string | null };
type Pay = "cod" | "part" | "paid";
const DEFAULT_PART_ADVANCE = 99;

export type CourierOption = {
  id: string;
  name: string;
  default_shipping_cost: number;
  shipping_cost_outside: number | null;
  default_rto_charge: number;
  cod_fee_slabs: CodFeeSlab[] | null;
};

type PastOrder = { order_code: string; order_date: string; customer_name: string; status: string };
type PinInfo = { status: "idle" | "loading" | "ok" | "notfound"; place?: string };

const rs = (n: number) => (n < 0 ? "−" : "") + "₹" + Math.abs(n).toLocaleString("en-IN");

const input =
  "w-full rounded-lg border bg-white px-3 py-2 text-stone-900 outline-none focus:ring-2 disabled:bg-stone-50 disabled:text-stone-500";
const okBorder = "border-stone-300 focus:border-emerald-600 focus:ring-emerald-600/20";
const badBorder = "border-red-400 focus:border-red-500 focus:ring-red-500/20";

export function OrderForm({
  products,
  couriers,
  today,
}: {
  products: ProductOption[];
  couriers: CourierOption[];
  today: string;
}) {
  const defaultCourier = couriers.find((c) => c.name.toLowerCase().includes("india post")) ?? couriers[0];

  // ----- products & payment -----
  const [items, setItems] = useState<Item[]>([{ product_id: products[0]?.id ?? "", qty: 1 }]);
  const [orderType, setOrderType] = useState<"normal" | "replacement">("normal");
  const [payment, setPayment] = useState<Pay>("cod");
  const [discount, setDiscount] = useState(0);
  const [partAdvance, setPartAdvance] = useState(DEFAULT_PART_ADVANCE);

  // ----- shipping -----
  const [courierId, setCourierId] = useState(defaultCourier?.id ?? "");
  const courier = couriers.find((c) => c.id === courierId);
  const [shippingOverride, setShippingOverride] = useState<number | null>(null);
  const [codFeeOverride, setCodFeeOverride] = useState<number | null>(null);
  const [rtoCharge, setRtoCharge] = useState(defaultCourier?.default_rto_charge ?? 0);

  // ----- customer -----
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [pinInfo, setPinInfo] = useState<PinInfo>({ status: "idle" });
  const [pastOrders, setPastOrders] = useState<PastOrder[]>([]);

  const [resetKey, setResetKey] = useState(0);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);

  function applyCourier(id: string) {
    const c = couriers.find((x) => x.id === id);
    setCourierId(id);
    setShippingOverride(null);
    setCodFeeOverride(null);
    if (c) setRtoCharge(c.default_rto_charge);
  }

  // ----- PIN lookup (free India Post API; ignored if unreachable) -----
  useEffect(() => {
    if (!isValidPin(pin)) return;
    let cancelled = false;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setPinInfo({ status: "loading" });
      try {
        const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`, { signal: ctrl.signal });
        const json = await res.json();
        const po = json?.[0]?.PostOffice?.[0];
        if (cancelled) return;
        setPinInfo(po ? { status: "ok", place: `${po.District}, ${po.State}` } : { status: "notfound" });
      } catch {
        if (!cancelled) setPinInfo({ status: "idle" });
      }
    }, 300);
    return () => {
      cancelled = true;
      ctrl.abort();
      clearTimeout(t);
    };
  }, [pin]);

  // ----- repeat customer check -----
  useEffect(() => {
    const p = normalizePhone(phone);
    if (!isValidPhone(p)) return;
    let cancelled = false;
    findOrdersByPhone(p).then((rows) => {
      if (!cancelled) setPastOrders(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [phone]);

  const phoneDigits = normalizePhone(phone);
  const phoneBad = phone !== "" && phoneDigits.length >= 10 && !isValidPhone(phoneDigits);
  const phoneShort = phone !== "" && phoneDigits.length < 10;
  const pinDigits = normalizePin(pin);
  const pinBad = pin !== "" && (pinDigits.length > 6 || (pinDigits.length === 6 && !isValidPin(pinDigits)));

  // ----- money -----
  const isRepl = orderType === "replacement";
  const mode = payment === "paid" ? "paid" : "cod";
  const list = listPrice(items, products, mode);
  const orderValue = isRepl ? 0 : Math.max(0, list - discount);
  const advance = isRepl ? 0 : payment === "paid" ? orderValue : payment === "part" ? Math.min(partAdvance, orderValue) : 0;
  const codBalance = orderValue - advance;
  const cost = itemsCost(items, products);
  const units = items.reduce((s, i) => s + i.qty, 0);
  const itemsOk = items.length > 0 && items.every((i) => i.product_id);

  const autoShipping = shippingFor(courier, pinDigits);
  const shipping = shippingOverride ?? autoShipping;
  const autoCodFee = payment !== "paid" && !isRepl ? codFeeFor(courier?.cod_fee_slabs, codBalance) : 0;
  const codFee = codFeeOverride ?? autoCodFee;
  const outsideKerala = isValidPin(pinDigits) && !isKeralaPin(pinDigits);
  const profitIfDelivered = orderValue - cost - shipping - codFee;
  const lossIfRto = -(shipping + rtoCharge);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(null);
    const fd = new FormData(e.currentTarget);
    const text = (k: string) => String(fd.get(k) ?? "");
    startTransition(async () => {
      const r = await createOrder({
        order_date: text("order_date"),
        order_code: text("order_code"),
        customer_name: text("customer_name"),
        phone,
        address: text("address"),
        pincode: pin,
        items,
        order_type: orderType,
        payment_mode: mode,
        order_value: orderValue,
        advance_paid: advance,
        courier_id: courierId,
        shipping_cost: shipping,
        rto_charge: rtoCharge,
        cod_fee: codFee,
        tracking_id: text("tracking_id"),
        status: text("status") === "dispatched" ? "dispatched" : "new",
        notes: text("notes"),
      });
      if (!r.ok) {
        setError({ message: r.message, field: r.field });
        return;
      }
      setSaved(r.orderCode);
      // clear customer fields, keep products / payment / courier / date for the next order
      setPhone("");
      setPin("");
      setDiscount(0);
      setShippingOverride(null);
      setCodFeeOverride(null);
      setPinInfo({ status: "idle" });
      setPastOrders([]);
      setResetKey((k) => k + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => nameRef.current?.focus(), 50);
    });
  }

  const fieldErr = (f: string) => (error?.field === f ? error.message : null);
  const first = products.find((p) => p.id === items[0]?.product_id);

  if (products.length === 0 || couriers.length === 0) {
    return (
      <p className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900 ring-1 ring-amber-200">
        Add at least one active product (Products page) and courier (Settings page) first.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        {saved && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
            <span className="font-semibold">✓ Order {saved} saved.</span>
            <span className="text-emerald-800">Enter the next order below, or</span>
            <Link href="/orders" className="font-medium text-emerald-700 underline">
              view all orders
            </Link>
          </div>
        )}

        {/* Customer */}
        <Card title="Customer">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer name" error={fieldErr("customer_name")}>
              <input
                key={`name-${resetKey}`}
                ref={nameRef}
                name="customer_name"
                required
                autoFocus
                autoComplete="off"
                className={`${input} ${fieldErr("customer_name") ? badBorder : okBorder}`}
              />
            </Field>
            <Field
              label="Phone"
              error={fieldErr("phone") ?? (phoneBad ? "Must start with 6, 7, 8 or 9" : null)}
              hint={
                phoneShort ? `${phoneDigits.length}/10 digits` : isValidPhone(phoneDigits) ? "✓ Valid mobile number" : undefined
              }
              hintTone={isValidPhone(phoneDigits) ? "ok" : "muted"}
            >
              <input
                required
                inputMode="tel"
                autoComplete="off"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setPastOrders([]);
                }}
                placeholder="98765 43210"
                className={`${input} ${phoneBad || fieldErr("phone") ? badBorder : okBorder}`}
              />
            </Field>
          </div>

          {pastOrders.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
              <span className="font-semibold">Repeat customer:</span>{" "}
              {pastOrders.map((o) => `${o.order_code} (${o.order_date.split("-").reverse().join("-")}, ${o.status})`).join(" · ")}
              <div className="text-xs text-amber-700">Check this isn&apos;t a duplicate of an order already entered.</div>
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_180px]">
            <Field label="Address" error={fieldErr("address")}>
              <textarea
                key={`addr-${resetKey}`}
                name="address"
                required
                rows={3}
                className={`${input} ${fieldErr("address") ? badBorder : okBorder} resize-y`}
              />
            </Field>
            <Field
              label="PIN code"
              error={fieldErr("pincode") ?? (pinBad ? "PIN must be 6 digits, not starting with 0" : null)}
              hint={
                pinInfo.status === "loading"
                  ? "Checking…"
                  : pinInfo.status === "ok" && isValidPin(pinDigits)
                    ? `✓ ${pinInfo.place}`
                    : pinInfo.status === "notfound" && isValidPin(pinDigits)
                      ? "PIN not found — double-check it"
                      : pin && pinDigits.length < 6
                        ? `${pinDigits.length}/6 digits`
                        : undefined
              }
              hintTone={pinInfo.status === "ok" ? "ok" : pinInfo.status === "notfound" ? "warn" : "muted"}
            >
              <input
                required
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setPinInfo({ status: "idle" });
                }}
                placeholder="682024"
                className={`${input} ${pinBad || fieldErr("pincode") ? badBorder : okBorder}`}
              />
            </Field>
          </div>
        </Card>

        {/* Products & payment */}
        <Card title="Products & payment">
          <ItemsEditor items={items} products={products} onChange={setItems} invalid={!!error && !itemsOk} />

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Order type">
              <Segmented
                value={orderType}
                options={[
                  { value: "normal", label: "Normal" },
                  { value: "replacement", label: "Replacement" },
                ]}
                onChange={(v) => setOrderType(v as "normal" | "replacement")}
              />
            </Field>
            <Field label="Payment">
              <Segmented
                value={payment}
                options={[
                  { value: "cod", label: "COD" },
                  { value: "part", label: "Part COD" },
                  { value: "paid", label: "Paid" },
                ]}
                onChange={(v) => {
                  setPayment(v as Pay);
                  if (v === "part") setPartAdvance(DEFAULT_PART_ADVANCE);
                }}
              />
            </Field>
          </div>

          {!isRepl && (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="Normal price" hint={units > 1 ? `${units} pieces` : undefined}>
                <div className="rounded-lg bg-stone-50 px-3 py-2 text-stone-700 ring-1 ring-stone-200">{rs(list)}</div>
              </Field>
              <Field label="Discount" hint={discount > 0 ? "Special price" : "For combos / offers"}>
                <MoneyInput value={discount} onChange={(v) => setDiscount(Math.min(v, list))} />
              </Field>
              <Field label="Order value" hint="Type the special price here">
                <MoneyInput value={orderValue} onChange={(v) => setDiscount(Math.max(0, list - v))} />
              </Field>
              <Field
                label="Advance paid"
                error={fieldErr("advance_paid")}
                hint={payment === "part" ? `Balance ₹${codBalance} as COD` : payment === "paid" ? "Fully paid" : "None"}
              >
                <MoneyInput value={advance} onChange={setPartAdvance} disabled={payment !== "part"} />
              </Field>
            </div>
          )}
        </Card>

        {/* Shipping */}
        <Card title="Shipping">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Courier">
              <select value={courierId} onChange={(e) => applyCourier(e.target.value)} className={`${input} ${okBorder}`}>
                {couriers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Shipping cost"
              hint={
                shippingOverride !== null
                  ? `Changed by you (auto ₹${autoShipping})`
                  : isValidPin(pinDigits)
                    ? outsideKerala
                      ? "Outside Kerala rate"
                      : "Kerala rate"
                    : "Fills in from the PIN code"
              }
            >
              <MoneyInput value={shipping} onChange={setShippingOverride} />
            </Field>
            <Field
              label="COD commission"
              hint={
                codFeeOverride !== null
                  ? `Changed by you (auto ₹${autoCodFee})`
                  : payment !== "paid" && !isRepl
                    ? `Auto for ₹${codBalance} COD`
                    : "None on paid orders"
              }
            >
              <MoneyInput value={codFee} onChange={setCodFeeOverride} />
            </Field>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Order date">
              <input name="order_date" type="date" required defaultValue={today} className={`${input} ${okBorder}`} />
            </Field>
            <Field label="Tracking ID (optional)" error={fieldErr("tracking_id")}>
              <input
                key={`trk-${resetKey}`}
                name="tracking_id"
                autoComplete="off"
                placeholder="CX064397338IN"
                className={`${input} ${fieldErr("tracking_id") ? badBorder : okBorder} uppercase`}
              />
            </Field>
            <Field label="Status">
              <select name="status" defaultValue="new" className={`${input} ${okBorder}`}>
                <option value="new">New (not dispatched)</option>
                <option value="dispatched">Dispatched</option>
              </select>
            </Field>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-[200px_1fr_200px]">
            <Field label="Order ID (optional)" hint="Blank = next number" error={fieldErr("order_code")}>
              <input
                key={`code-${resetKey}`}
                name="order_code"
                autoComplete="off"
                placeholder="Auto"
                className={`${input} ${fieldErr("order_code") ? badBorder : okBorder} uppercase`}
              />
            </Field>
            <Field label="Notes (optional)">
              <input key={`notes-${resetKey}`} name="notes" autoComplete="off" className={`${input} ${okBorder}`} />
            </Field>
            <Field label="Extra RTO charge" hint={courier ? `Default ₹${courier.default_rto_charge}` : undefined}>
              <MoneyInput value={rtoCharge} onChange={setRtoCharge} />
            </Field>
          </div>
        </Card>
      </div>

      {/* Summary */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-xl bg-white p-5 ring-1 ring-stone-200">
          <div className="flex items-center gap-3">
            {first?.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={first.image_url} alt="" className="size-12 rounded-lg object-cover ring-1 ring-stone-200" />
            ) : (
              <div className="grid size-12 place-items-center rounded-lg bg-stone-100 font-semibold text-stone-400">
                {first?.name.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <div className="font-medium">
                {items
                  .filter((i) => i.product_id)
                  .map((i) => {
                    const n = products.find((p) => p.id === i.product_id)?.name ?? "";
                    return i.qty > 1 ? `${n} × ${i.qty}` : n;
                  })
                  .join(" + ") || "Choose a product"}
              </div>
              <div className="text-xs text-stone-500">
                {isRepl ? "Replacement" : payment === "paid" ? "Paid" : payment === "part" ? `Part COD (₹${advance} advance)` : "COD"} ·{" "}
                {courier?.name}
              </div>
            </div>
          </div>

          <dl className="mt-4 space-y-2 text-sm">
            {!isRepl && discount > 0 && (
              <>
                <Row label="Normal price" value={rs(list)} muted />
                <Row label="Discount" value={rs(-discount)} tone="bad" muted />
              </>
            )}
            <Row label="Order value" value={rs(orderValue)} />
            <Row label="Advance paid" value={rs(advance)} />
            <Row label="COD to collect" value={rs(codBalance)} strong={codBalance > 0} />
            <div className="my-2 border-t border-stone-100" />
            <Row label={`Product cost${units > 1 ? ` (${units} pcs)` : ""}`} value={rs(-cost)} muted />
            <Row label={outsideKerala ? "Shipping (outside Kerala)" : "Shipping"} value={rs(-shipping)} muted />
            {codFee > 0 && <Row label="COD commission" value={rs(-codFee)} muted />}
            <div className="my-2 border-t border-stone-100" />
            <Row label="Profit if delivered" value={rs(profitIfDelivered)} strong tone={profitIfDelivered >= 0 ? "ok" : "bad"} />
            <Row label="Loss if RTO" value={rs(lossIfRto)} tone="bad" muted />
          </dl>

          {error && !error.field && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error.message}</p>}
          {error?.field && <p className="mt-4 text-sm text-red-600">{error.message}</p>}

          <button
            disabled={pending || phoneBad || pinBad || codBalance < 0 || !itemsOk}
            className="mt-5 w-full rounded-lg bg-emerald-700 px-4 py-3 font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save order"}
          </button>
          {!itemsOk && <p className="mt-2 text-xs text-red-600">Choose a product for every line.</p>}
        </div>
      </aside>
    </form>
  );
}

/* ---------------- small pieces ---------------- */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-5 ring-1 ring-stone-200">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-500">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  hintTone = "muted",
  error,
  children,
}: {
  label: string;
  hint?: string;
  hintTone?: "muted" | "ok" | "warn";
  error?: string | null;
  children: React.ReactNode;
}) {
  const tone = { muted: "text-stone-400", ok: "text-emerald-700", warn: "text-amber-700" }[hintTone];
  return (
    <label className="block text-sm font-medium text-stone-700">
      {label}
      <div className="mt-1">{children}</div>
      {error ? (
        <div className="mt-1 text-xs font-normal text-red-600">{error}</div>
      ) : hint ? (
        <div className={`mt-1 text-xs font-normal ${tone}`}>{hint}</div>
      ) : null}
    </label>
  );
}

function MoneyInput({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-stone-400">₹</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value) || 0)))}
        className={`${input} ${okBorder} pl-7`}
      />
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div
      className="grid gap-1 rounded-lg bg-stone-100 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            value === o.value ? "bg-white text-stone-900 shadow-sm ring-1 ring-stone-200" : "text-stone-500 hover:text-stone-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  tone?: "ok" | "bad";
}) {
  const color = tone === "ok" ? "text-emerald-700" : tone === "bad" ? "text-red-600" : muted ? "text-stone-500" : "text-stone-900";
  return (
    <div className="flex justify-between gap-3">
      <dt className={muted ? "text-stone-500" : "text-stone-600"}>{label}</dt>
      <dd className={`${color} ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}
