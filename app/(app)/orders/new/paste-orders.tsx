"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ItemsEditor } from "@/components/items-editor";
import { extractTrackingIds, matchProduct, parseWhatsAppOrders } from "@/lib/parser/whatsapp";
import { itemsCost, listPrice, type Item } from "@/lib/pricing";
import { codFeeFor, isKeralaPin, shippingFor } from "@/lib/shipping";
import { bumpCode } from "@/lib/orders";
import { isValidPhone, isValidPin, normalizePhone, normalizePin } from "@/lib/validation";
import { createOrdersBulk, findRecentOrdersByPhones } from "../actions";
import { TakenByToggle, type CourierOption, type ProductOption } from "./order-form";

type Kind = "cod" | "paid" | "replacement";

type Row = {
  key: number;
  include: boolean;
  customer_name: string;
  phone: string;
  address: string;
  pincode: string;
  items: Item[];
  unmatched: string[];
  kind: Kind | "";
  order_value: number;
  advance_paid: number;
  tracking: string;
  taken_by: "staff" | "owner";
  parseProblems: string[];
  raw: string;
};

type Earlier = Record<string, { order_code: string; order_date: string; status: string }[]>;

const rs = (n: number) => "₹" + n.toLocaleString("en-IN");
const field =
  "rounded-md border bg-white px-2.5 py-1.5 text-sm text-stone-900 outline-none focus:ring-2";
const input = "w-full " + field;
const ok = "border-stone-300 focus:border-emerald-600 focus:ring-emerald-600/20";
const bad = "border-red-400 bg-red-50/40 focus:border-red-500 focus:ring-red-500/20";

function normalPrice(items: Item[], products: ProductOption[], kind: Kind | "") {
  if (kind === "replacement" || kind === "") return 0;
  return listPrice(items, products, kind === "paid" ? "paid" : "cod");
}

export function PasteOrders({
  products,
  couriers,
  today,
  staffName,
}: {
  products: ProductOption[];
  couriers: CourierOption[];
  today: string;
  staffName: string;
}) {
  const defaultCourier = couriers.find((c) => c.name.toLowerCase().includes("india post")) ?? couriers[0];
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [earlier, setEarlier] = useState<Earlier>({});
  const [orderDate, setOrderDate] = useState(today);
  const [firstCode, setFirstCode] = useState("");
  const [courierId, setCourierId] = useState(defaultCourier?.id ?? "");
  const [status, setStatus] = useState<"new" | "dispatched">("new");
  const [trackedDispatched, setTrackedDispatched] = useState(true);
  const [takenAll, setTakenAll] = useState<"staff" | "owner">("staff");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();

  function read() {
    setError(null);
    setSaved(null);
    const parsed = parseWhatsAppOrders(text);
    const next: Row[] = parsed.map((o, i) => {
      const matched = o.items.map((it) => ({ it, p: matchProduct(it.text, products) }));
      const items: Item[] = matched.length
        ? matched.map(({ it, p }) => ({ product_id: p?.id ?? "", qty: it.qty }))
        : [{ product_id: "", qty: 1 }];
      const kind: Kind | "" = o.payment ?? "";
      // The COD amount in the message is the real price (may include a combo discount)
      const value = kind === "cod" && o.cod_amount ? o.cod_amount : normalPrice(items, products, kind);
      return {
        key: i,
        include: true,
        customer_name: o.customer_name,
        phone: o.phone,
        address: o.address,
        pincode: o.pincode,
        items,
        unmatched: matched.filter((m) => !m.p).map((m) => m.it.text),
        kind,
        order_value: value,
        advance_paid: kind === "paid" ? value : 0,
        tracking: o.tracking,
        taken_by: takenAll,
        parseProblems: o.problems,
        raw: o.raw,
      };
    });
    setRows(next);
    setEarlier({});
    const phones = next.map((r) => r.phone).filter(Boolean);
    if (phones.length) findRecentOrdersByPhones(phones).then(setEarlier).catch(() => {});
  }

  function update(key: number, patch: Partial<Row>, reprice = false) {
    setRows((prev) =>
      prev!.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if (reprice) {
          next.order_value = normalPrice(next.items, products, next.kind);
          next.advance_paid = next.kind === "paid" ? next.order_value : 0;
        }
        return next;
      }),
    );
  }

  // ----- checks -----
  const phoneCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) if (r.include) m.set(normalizePhone(r.phone), (m.get(normalizePhone(r.phone)) ?? 0) + 1);
    return m;
  }, [rows]);

  const trackingCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) {
      const t = r.tracking.trim().toUpperCase();
      if (r.include && t) m.set(t, (m.get(t) ?? 0) + 1);
    }
    return m;
  }, [rows]);

  function issues(r: Row) {
    const e: string[] = [];
    if (!r.customer_name.trim()) e.push("name");
    if (!isValidPhone(normalizePhone(r.phone))) e.push("phone");
    if (r.address.trim().length < 5) e.push("address");
    if (!isValidPin(normalizePin(r.pincode))) e.push("pincode");
    if (!r.items.length || r.items.some((it) => !it.product_id)) e.push("product");
    if (!r.kind) e.push("kind");
    if (r.advance_paid > r.order_value) e.push("value");
    const t = r.tracking.trim().toUpperCase();
    if (t && (!/^[A-Z0-9-]{6,25}$/.test(t) || (trackingCounts.get(t) ?? 0) > 1)) e.push("tracking");
    return e;
  }

  const courier = couriers.find((c) => c.id === courierId);
  function costs(r: Row) {
    const shipping = shippingFor(courier, normalizePin(r.pincode));
    const codFee = r.kind === "cod" ? codFeeFor(courier?.cod_fee_slabs, r.order_value - r.advance_paid) : 0;
    const value = r.kind === "replacement" ? 0 : r.order_value;
    return { shipping, codFee, profit: value - itemsCost(r.items, products) - shipping - codFee };
  }

  const included = (rows ?? []).filter((r) => r.include);
  const invalid = included.filter((r) => issues(r).length > 0);
  const totals = {
    count: included.length,
    cod: included.filter((r) => r.kind === "cod").length,
    paid: included.filter((r) => r.kind === "paid").length,
    repl: included.filter((r) => r.kind === "replacement").length,
    value: included.reduce((s, r) => s + (r.kind === "replacement" ? 0 : r.order_value), 0),
    codToCollect: included.reduce((s, r) => s + (r.kind === "cod" ? r.order_value - r.advance_paid : 0), 0),
    shipping: included.reduce((s, r) => s + costs(r).shipping, 0),
    codFees: included.reduce((s, r) => s + costs(r).codFee, 0),
    profit: included.reduce((s, r) => s + costs(r).profit, 0),
    byProduct: products
      .map((p) => ({
        name: p.name,
        qty: included.reduce((s, r) => s + r.items.filter((it) => it.product_id === p.id).reduce((a, it) => a + it.qty, 0), 0),
      }))
      .filter((x) => x.qty > 0),
  };

  const codeRange = firstCode.trim()
    ? (() => {
        const a = bumpCode(firstCode, 0);
        const b = bumpCode(firstCode, Math.max(0, included.length - 1));
        return a && b ? (a === b ? a : `${a} to ${b}`) : null;
      })()
    : "";

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await createOrdersBulk({
        order_date: orderDate,
        first_code: firstCode,
        courier_id: courierId,
        status,
        tracked_dispatched: trackedDispatched,
        rows: included.map((x) => ({
          customer_name: x.customer_name,
          phone: x.phone,
          address: x.address,
          pincode: x.pincode,
          items: x.items,
          kind: x.kind as Kind,
          order_value: x.order_value,
          advance_paid: x.advance_paid,
          tracking_id: x.tracking,
          taken_by: x.taken_by,
        })),
      });
      if (!r.ok) return setError(r.message);
      setSaved(r.codes);
      setFirstCode("");
      setRows(null);
      setText("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* ---------- Step 1: paste ---------- */
  if (!rows) {
    return (
      <div className="space-y-4">
        {saved && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
            <span className="font-semibold">
              ✓ {saved.length} order{saved.length > 1 ? "s" : ""} saved ({saved[0]}
              {saved.length > 1 ? ` – ${saved[saved.length - 1]}` : ""}).
            </span>
            <Link href="/orders?range=today" className="font-medium text-emerald-700 underline">
              View today&apos;s orders
            </Link>
          </div>
        )}
        <div className="rounded-xl bg-white p-5 ring-1 ring-stone-200">
          <label className="block text-sm font-medium text-stone-700">
            Paste orders from the WhatsApp group
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={14}
              autoFocus
              placeholder={
                "FASIL SAMEER\nEchilamvayal Badr Juma Masjid\nPayyanur, Kerala - 670307\nMob: 9847351156 COD: 299 Itemref: Glass Wiper\n\nASWATHY VS\nThundathil Puthenveedu\nKollam, Kerala - 691507\nMob: 8075367591 PREPAID Itemref: Glass Wiper"
              }
              className={`${input} ${ok} mt-2 font-mono text-[13px] leading-relaxed`}
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="flex-1 text-xs text-stone-500">
              Each order ends with the <b>Mob:</b> line. Use <b>COD: 499</b>, <b>PREPAID</b> or <b>REPLACEMENT</b>. Add{" "}
              <b>x2</b> after the item for 2 pieces. Tracking ID is optional: add <b>Track: CX064397338IN</b> at the end of the Mob line or on the line
              below it.
            </p>
            <button
              onClick={read}
              disabled={!text.trim()}
              className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              Read orders →
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- Step 2: check & save ---------- */
  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => setRows(null)} className="text-sm text-stone-600 hover:text-stone-900">
          ← Back to pasted text
        </button>
        <span className="text-sm text-stone-500">
          Found <b className="text-stone-800">{rows.length}</b> orders. Check them, fix anything in red, then save.
        </span>
      </div>

      {/* Shared settings */}
      <div className="grid gap-3 rounded-xl bg-white p-4 ring-1 ring-stone-200 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs font-medium text-stone-500">
          Order date (all)
          <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className={`${input} ${ok} mt-1`} />
        </label>
        <label className="text-xs font-medium text-stone-500">
          First order ID (optional)
          <input
            value={firstCode}
            onChange={(e) => setFirstCode(e.target.value.toUpperCase())}
            placeholder="Auto, e.g. KZT2395"
            autoComplete="off"
            className={`${input} ${firstCode && !codeRange ? bad : ok} mt-1 uppercase placeholder:normal-case`}
          />
          <span className={`mt-1 block font-normal ${firstCode && !codeRange ? "text-red-600" : "text-stone-400"}`}>
            {!firstCode
              ? "Blank = next numbers automatically"
              : codeRange
                ? `${included.length} orders → ${codeRange}`
                : "Must end in a number, like KZT2395"}
          </span>
        </label>
        <label className="text-xs font-medium text-stone-500">
          Courier (all)
          <select value={courierId} onChange={(e) => setCourierId(e.target.value)} className={`${input} ${ok} mt-1`}>
            {couriers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} (₹{c.default_shipping_cost})
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-stone-500">
          Status (all)
          <select value={status} onChange={(e) => setStatus(e.target.value as "new" | "dispatched")} className={`${input} ${ok} mt-1`}>
            <option value="new">New (not dispatched)</option>
            <option value="dispatched">Dispatched</option>
          </select>
        </label>
        <div className="text-xs font-medium text-stone-500">
          Taken by (all)
          <div className="mt-1">
            <TakenByToggle
              value={takenAll}
              staffName={staffName}
              onChange={(v) => {
                setTakenAll(v);
                setRows((prev) => prev!.map((r) => ({ ...r, taken_by: v })));
              }}
            />
          </div>
          <span className="mt-1 block font-normal text-stone-400">
            {(() => {
              const mine = included.filter((r) => r.taken_by === "owner").length;
              return mine ? `${included.length - mine} by ${staffName} · ${mine} by you` : `All count for ${staffName}'s pay once dispatched`;
            })()}
          </span>
        </div>
      </div>

      <BulkTracking
        orders={included.map((r) => ({ key: r.key, n: rows.indexOf(r) + 1, name: r.customer_name, tracking: r.tracking }))}
        onApply={(byKey) => setRows((prev) => prev!.map((r) => (byKey.has(r.key) ? { ...r, tracking: byKey.get(r.key)! } : r)))}
      />

      {status === "new" && included.some((r) => r.tracking.trim()) && (
        <label className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
          <input type="checkbox" checked={trackedDispatched} onChange={(e) => setTrackedDispatched(e.target.checked)} className="size-4 accent-emerald-700" />
          Save the {included.filter((r) => r.tracking.trim()).length} order{included.filter((r) => r.tracking.trim()).length === 1 ? "" : "s"} that have a tracking ID as
          <b>Dispatched</b> (the rest stay New)
        </label>
      )}

      {/* Orders */}
      <div className="space-y-3">
        {rows.map((r, i) => {
          const errs = r.include ? issues(r) : [];
          const phone = normalizePhone(r.phone);
          const prev = earlier[phone] ?? [];
          const dupInPaste = r.include && (phoneCounts.get(phone) ?? 0) > 1;
          const normal = normalPrice(r.items, products, r.kind);
          return (
            <div
              key={r.key}
              className={`rounded-xl bg-white p-4 ring-1 ${
                !r.include ? "opacity-50 ring-stone-200" : errs.length ? "ring-2 ring-red-300" : "ring-stone-200"
              }`}
            >
              <div className="mb-3 flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={r.include}
                  onChange={(e) => update(r.key, { include: e.target.checked })}
                  className="size-4 accent-emerald-700"
                  aria-label={`Include order ${i + 1}`}
                />
                <span className="text-xs font-semibold text-stone-400">#{i + 1}</span>
                <TakenByToggle size="sm" value={r.taken_by} staffName={staffName} onChange={(v) => update(r.key, { taken_by: v })} />
                <div className="flex flex-wrap gap-1.5">
                  {errs.length > 0 && <Tag tone="bad">Needs fixing</Tag>}
                  {dupInPaste && <Tag tone="warn">Same phone twice in this paste</Tag>}
                  {prev.length > 0 && (
                    <Tag tone="warn">
                      Ordered before: {prev.map((p) => `${p.order_code} (${p.order_date.split("-").reverse().join("-")})`).join(", ")}
                    </Tag>
                  )}
                  {!r.include && <Tag>Skipped</Tag>}
                </div>
                <div className="ml-auto text-sm font-semibold">
                  {r.kind === "replacement" ? <span className="text-violet-700">Replacement</span> : rs(r.order_value)}
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[1.1fr_1.6fr_1fr]">
                {/* customer */}
                <div className="space-y-2">
                  <input
                    value={r.customer_name}
                    onChange={(e) => update(r.key, { customer_name: e.target.value })}
                    placeholder="Name"
                    className={`${input} ${errs.includes("name") ? bad : ok} font-medium`}
                  />
                  <input
                    value={r.phone}
                    onChange={(e) => update(r.key, { phone: e.target.value })}
                    placeholder="Phone"
                    inputMode="tel"
                    className={`${input} ${errs.includes("phone") ? bad : ok}`}
                  />
                  <input
                    value={r.pincode}
                    onChange={(e) => update(r.key, { pincode: e.target.value })}
                    placeholder="PIN"
                    inputMode="numeric"
                    className={`${input} ${errs.includes("pincode") ? bad : ok}`}
                  />
                  <input
                    value={r.tracking}
                    onChange={(e) => update(r.key, { tracking: e.target.value.toUpperCase().replace(/\s/g, "") })}
                    placeholder="Tracking ID (optional)"
                    autoComplete="off"
                    className={`${input} ${errs.includes("tracking") ? bad : ok} font-mono text-[13px] uppercase placeholder:font-sans placeholder:normal-case`}
                    aria-label="Tracking ID"
                  />
                  {errs.includes("tracking") && (
                    <div className="text-xs text-red-600">
                      {(trackingCounts.get(r.tracking.trim().toUpperCase()) ?? 0) > 1 ? "Same tracking ID on two orders" : "Check this tracking ID"}
                    </div>
                  )}
                </div>
                {/* address */}
                <textarea
                  value={r.address}
                  onChange={(e) => update(r.key, { address: e.target.value })}
                  rows={4}
                  placeholder="Address"
                  className={`${input} ${errs.includes("address") ? bad : ok} resize-y`}
                />
                {/* product & payment */}
                <div className="space-y-2">
                  <ItemsEditor
                    compact
                    items={r.items}
                    products={products}
                    invalid={errs.includes("product")}
                    onChange={(items) =>
                      update(
                        r.key,
                        { items },
                        // keep a COD special price from the message; re-price only if it matched the old normal price
                        r.order_value === normalPrice(r.items, products, r.kind),
                      )
                    }
                  />
                  {r.unmatched.length > 0 && r.items.some((it) => !it.product_id) && (
                    <div className="text-xs text-red-600">Couldn&apos;t match “{r.unmatched.join("”, “")}”</div>
                  )}
                  <div className={`grid grid-cols-3 gap-1 rounded-md p-0.5 ${errs.includes("kind") ? "bg-red-100" : "bg-stone-100"}`}>
                    {(["cod", "paid", "replacement"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => update(r.key, { kind: k }, true)}
                        className={`rounded px-1 py-1 text-xs font-semibold ${
                          r.kind === k ? "bg-white shadow-sm ring-1 ring-stone-200" : "text-stone-500"
                        }`}
                      >
                        {k === "cod" ? "COD" : k === "paid" ? "Paid" : "Repl."}
                      </button>
                    ))}
                  </div>
                  {(() => {
                    const c = costs(r);
                    const pin = normalizePin(r.pincode);
                    const outside = isValidPin(pin) && !isKeralaPin(pin);
                    return (
                      <div className="text-xs text-stone-500">
                        Ship {rs(c.shipping)}
                        {outside && <span className="text-amber-700"> (outside Kerala)</span>}
                        {c.codFee > 0 && <> · COD fee {rs(c.codFee)}</>} · Profit{" "}
                        <span className={c.profit < 0 ? "text-red-600" : "text-emerald-700"}>
                          {c.profit < 0 ? "−" : ""}
                          {rs(Math.abs(c.profit))}
                        </span>
                      </div>
                    );
                  })()}
                  {r.kind !== "replacement" && r.kind !== "" && (
                    <div className="flex items-center gap-2 text-xs text-stone-500">
                      <span className="shrink-0">Value ₹</span>
                      <input
                        type="number"
                        min={0}
                        value={r.order_value}
                        onChange={(e) => {
                          const v = Math.max(0, Number(e.target.value) || 0);
                          update(r.key, { order_value: v, advance_paid: r.kind === "paid" ? v : r.advance_paid });
                        }}
                        className={`${field} ${errs.includes("value") ? bad : ok} w-24`}
                      />
                      {normal > 0 && r.order_value < normal && (
                        <span className="text-emerald-700">
                          Discount {rs(normal - r.order_value)} (normal {rs(normal)})
                        </span>
                      )}
                      {normal > 0 && r.order_value > normal && <span className="text-amber-700">normal {rs(normal)}</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-stone-200 bg-white/95 px-4 py-3 lg:bottom-0 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur lg:left-64">
        <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2">
          <div className="text-sm">
            <b>{totals.count}</b> orders · {totals.cod} COD · {totals.paid} Paid
            {totals.repl > 0 && ` · ${totals.repl} Repl.`}
            <span className="text-stone-500">
              {" "}
              · {totals.byProduct.map((p) => `${p.qty} ${p.name}`).join(", ")} · Value {rs(totals.value)} · COD to collect{" "}
              {rs(totals.codToCollect)} · Shipping {rs(totals.shipping)}
              {totals.codFees > 0 && ` · COD fees ${rs(totals.codFees)}`} · Profit if all delivered{" "}
              <b className="text-emerald-700">{rs(totals.profit)}</b>
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {error && <span className="text-sm text-red-600">{error}</span>}
            {!error && invalid.length > 0 && (
              <span className="text-sm text-red-600">
                Fix {invalid.length} order{invalid.length > 1 ? "s" : ""} in red, or untick to skip
              </span>
            )}
            <button
              onClick={save}
              disabled={pending || totals.count === 0 || invalid.length > 0 || codeRange === null}
              className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {pending ? "Saving…" : `Save ${totals.count} order${totals.count === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: "bad" | "warn" }) {
  const cls =
    tone === "bad" ? "bg-red-100 text-red-700" : tone === "warn" ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-600";
  return <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

/* ---------- paste a whole list of tracking IDs, given out to the orders in order ---------- */

function BulkTracking({
  orders,
  onApply,
}: {
  orders: { key: number; n: number; name: string; tracking: string }[];
  onApply: (byKey: Map<number, string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const ids = extractTrackingIds(text);
  const targets = onlyEmpty ? orders.filter((o) => !o.tracking.trim()) : orders;
  const pairs = targets.map((o, i) => ({ ...o, id: ids[i] ?? "" }));
  const extra = ids.length - targets.length;
  const willAdd = Math.min(ids.length, pairs.length);

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-left text-sm ring-1 ring-stone-200 hover:bg-stone-50"
      >
        <span>
          <b className="font-medium text-stone-800">Paste tracking IDs for all orders</b>
          <span className="block text-xs text-stone-500">
            Already booked? Paste the list from the post office receipt or Excel. 1st ID goes to order #1, 2nd to #2, and so on.
          </span>
        </span>
        <span className="shrink-0 font-medium text-emerald-700">Open</span>
      </button>
    );

  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-emerald-300">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-stone-900">Paste tracking IDs</h3>
          <p className="text-xs text-stone-500">One per line, in the same order as the orders below. Other text and phone numbers are ignored.</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-stone-400 hover:bg-stone-100" aria-label="Close">
          ✕
        </button>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          autoFocus
          placeholder={"CX064397338IN\nCX064397339IN\nCX064397340IN"}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm uppercase outline-none placeholder:normal-case focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
        />
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-stone-600">
              {ids.length} ID{ids.length === 1 ? "" : "s"} found · {targets.length} order{targets.length === 1 ? "" : "s"}
            </span>
            <label className="flex items-center gap-1.5 text-stone-600">
              <input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} className="size-3.5 accent-emerald-700" />
              Only orders without a tracking ID
            </label>
          </div>
          <ol className="max-h-56 divide-y divide-stone-100 overflow-y-auto rounded-lg ring-1 ring-stone-200">
            {pairs.map((p) => (
              <li key={p.key} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <span className="w-7 shrink-0 text-xs text-stone-400">#{p.n}</span>
                <span className="min-w-0 flex-1 truncate text-stone-700">{p.name || "—"}</span>
                <span className={`shrink-0 font-mono text-xs ${p.id ? "text-emerald-700" : "text-stone-300"}`}>{p.id || "no ID"}</span>
              </li>
            ))}
            {!pairs.length && <li className="px-3 py-3 text-center text-xs text-stone-400">Every order already has a tracking ID.</li>}
          </ol>
          {ids.length > 0 && extra !== 0 && (
            <p className={`mt-1.5 text-xs ${extra > 0 ? "text-red-600" : "text-amber-700"}`}>
              {extra > 0
                ? `${extra} more ID${extra === 1 ? "" : "s"} than orders, so the last ${extra === 1 ? "one is" : `${extra} are`} left out. Check none are missing above.`
                : `${-extra} order${extra === -1 ? "" : "s"} will get no ID. You can type ${extra === -1 ? "it" : "them"} in on the order.`}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm text-stone-600 hover:bg-stone-100">
          Cancel
        </button>
        <button
          type="button"
          disabled={!willAdd}
          onClick={() => {
            onApply(new Map(pairs.filter((p) => p.id).map((p) => [p.key, p.id])));
            setText("");
            setOpen(false);
          }}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          Add {willAdd} tracking ID{willAdd === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}
