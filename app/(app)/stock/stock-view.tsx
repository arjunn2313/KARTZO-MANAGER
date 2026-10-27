"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Pager, usePaged } from "@/components/pager";
import {
  health,
  ledger,
  type Demand,
  type StockIn,
  type StockKind,
  type StockOut,
} from "@/lib/stock";
import {
  addStockEntry,
  deleteStockEntry,
  setLeadDays,
  type Result,
} from "./actions";

export type StockProduct = {
  id: string;
  name: string;
  image_url: string | null;
  active: boolean;
  cost: number;
  low_stock_alert: number;
  stock_added: number;
  sold: number;
  pending: number;
};

const rs = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const num = (n: number) => n.toLocaleString("en-IN");
const short = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
const dayName = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", {
    weekday: "short",
    timeZone: "UTC",
  });
const input =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";

const STATUS = {
  out: { label: "Out of stock", cls: "bg-red-600 text-white" },
  reorder: { label: "Reorder now", cls: "bg-amber-400 text-amber-950" },
  ok: { label: "OK", cls: "bg-emerald-100 text-emerald-800" },
  idle: { label: "No recent sales", cls: "bg-stone-100 text-stone-600" },
};

export function StockView({
  today,
  days,
  productFilter,
  products,
  ins,
  outs,
  demand,
  leadDays,
}: {
  today: string;
  days: string;
  productFilter: string | null;
  products: StockProduct[];
  ins: StockIn[];
  outs: StockOut[];
  demand: Demand[];
  leadDays: number;
}) {
  const [toast, setToast] = useState<Result | null>(null);
  const [adding, setAdding] = useState<{
    productId: string;
    qty?: number;
    entry?: StockIn;
  } | null>(null);
  const entryById = useMemo(() => new Map(ins.map((e) => [e.id, e])), [ins]);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<Result>, after?: () => void) {
    startTransition(async () => {
      const r = await fn();
      setToast(r);
      setTimeout(() => setToast(null), r.ok ? 2500 : 5000);
      if (r.ok) after?.();
    });
  }

  const cards = useMemo(
    () =>
      products
        .map((p) => ({
          p,
          h: health(
            p,
            demand.filter((d) => d.product_id === p.id),
            today,
            leadDays,
            p.low_stock_alert,
          ),
        }))
        // hide inactive products with nothing in stock and no sales
        .filter(({ p, h }) => p.active || h.inStock !== 0 || h.perDay > 0),
    [products, demand, today, leadDays],
  );

  const nameOf = useMemo(
    () => new Map(products.map((p) => [p.id, p.name])),
    [products],
  );
  const filtered = productFilter
    ? products.find((p) => p.id === productFilter)
    : null;
  const rows = useMemo(
    () =>
      ledger(ins, outs, filtered ? filtered.stock_added - filtered.sold : null),
    [ins, outs, filtered],
  );

  const href = (patch: { days?: string; product?: string | null }) => {
    const q = new URLSearchParams();
    const d = patch.days ?? days;
    const p = patch.product === undefined ? productFilter : patch.product;
    if (d !== "30") q.set("days", d);
    if (p) q.set("product", p);
    const s = q.toString();
    return s ? `/stock?${s}` : "/stock";
  };

  const totalIn = rows
    .filter((r) => r.change > 0)
    .reduce((s, r) => s + r.change, 0);
  const totalOut = rows
    .filter((r) => r.change < 0)
    .reduce((s, r) => s - r.change, 0);
  const { pageItems, pager } = usePaged(rows, "stock-history", 25);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stock</h1>
          <p className="mt-1 text-sm text-stone-500">
            Stock goes down when an order is dispatched and comes back on RTO /
            returns (unless damaged). &quot;Sold per day&quot; uses the last 30
            days of orders.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LeadDays
            value={leadDays}
            disabled={pending}
            onSave={(n) => run(() => setLeadDays(n))}
          />
          <button
            onClick={() =>
              setAdding({ productId: productFilter ?? cards[0]?.p.id ?? "" })
            }
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            + Stock in
          </button>
        </div>
      </div>

      {/* Product cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ p, h }) => (
          <section
            key={p.id}
            className={`overflow-hidden rounded-2xl bg-white ring-1 ${h.status === "out" ? "ring-red-300" : h.status === "reorder" ? "ring-amber-300" : "ring-stone-200"}`}
          >
            <div className="flex items-start gap-3 p-5">
              {p.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.image_url}
                  alt=""
                  className="size-14 shrink-0 rounded-lg object-cover ring-1 ring-stone-200"
                />
              ) : (
                <div className="grid size-14 shrink-0 place-items-center rounded-lg bg-stone-100 text-lg font-semibold text-stone-400">
                  {p.name[0]}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold leading-tight">{p.name}</h2>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[h.status].cls}`}
                  >
                    {STATUS[h.status].label}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span
                    className={`text-3xl font-semibold tracking-tight ${h.inStock <= 0 ? "text-red-600" : ""}`}
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {num(h.inStock)}
                  </span>
                  <span className="text-sm text-stone-500">in stock</span>
                </div>
              </div>
            </div>

            <dl
              className="grid grid-cols-3 border-t border-stone-100 text-center text-sm"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              <Cell label="To pack" value={num(h.toPack)} />
              <Cell
                label="Free"
                value={num(h.free)}
                tone={h.free <= 0 ? "bad" : undefined}
              />
              <Cell
                label="Sold / day"
                value={h.perDay ? h.perDay.toFixed(h.perDay < 10 ? 1 : 0) : "0"}
              />
            </dl>

            <div className="space-y-2 border-t border-stone-100 px-5 py-3 text-sm">
              {h.daysLeft !== null ? (
                <p className="text-stone-700">
                  Lasts about <b>{Math.floor(h.daysLeft)} days</b>
                  {h.runsOut && h.daysLeft > 0 && (
                    <span className="text-stone-500">
                      {" "}
                      (runs out ~{dayName(h.runsOut)} {short(h.runsOut)})
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-stone-500">No orders in the last 30 days.</p>
              )}
              {(h.status === "reorder" || h.status === "out") && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200">
                  {h.suggest > 0 ? (
                    <>
                      Order about <b>{num(h.suggest)} pcs</b>
                      {p.cost ? (
                        <span className="text-amber-800">
                          {" "}
                          (~{rs(h.suggest * p.cost)})
                        </span>
                      ) : null}
                      : enough for a month after it arrives.
                    </>
                  ) : (
                    <>Below your low-stock level ({p.low_stock_alert}).</>
                  )}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() =>
                    setAdding({ productId: p.id, qty: h.suggest || undefined })
                  }
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-emerald-800 ring-1 ring-emerald-300 hover:bg-emerald-50"
                >
                  + Stock in
                </button>
                <Link
                  href={href({ product: productFilter === p.id ? null : p.id })}
                  scroll={false}
                  className={`rounded-lg px-3 py-1.5 text-sm ring-1 ${productFilter === p.id ? "bg-stone-900 text-white ring-stone-900" : "text-stone-600 ring-stone-200 hover:bg-stone-50"}`}
                >
                  History
                </Link>
              </div>
            </div>
          </section>
        ))}
        {!cards.length && (
          <p className="text-sm text-stone-500">
            No products yet. Add them on the Products page.
          </p>
        )}
      </div>

      {/* History */}
      <section className="rounded-2xl bg-white ring-1 ring-stone-200">
        <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 px-5 py-3">
          <h2 className="mr-2 font-semibold">Stock history</h2>
          <select
            value={productFilter ?? ""}
            onChange={(e) =>
              (window.location.href = href({ product: e.target.value || null }))
            }
            className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm"
            aria-label="Product"
          >
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1 text-sm">
            {[
              ["30", "30 days"],
              ["90", "90 days"],
              ["all", "All"],
            ].map(([d, l]) => (
              <Link
                key={d}
                href={href({ days: d })}
                scroll={false}
                className={`rounded-md px-2 py-1 ${days === d ? "bg-emerald-50 font-medium text-emerald-800 ring-1 ring-emerald-200" : "text-stone-600 hover:bg-stone-100"}`}
              >
                {l}
              </Link>
            ))}
          </div>
          <span
            className="w-full text-sm text-stone-500 sm:ml-auto sm:w-auto"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            In <b className="text-emerald-700">+{num(totalIn)}</b> · Out{" "}
            <b className="text-stone-800">−{num(totalOut)}</b>
          </span>
        </div>

        {/* Phones */}
        <ul
          className="divide-y divide-stone-100 sm:hidden"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {pageItems.map((r) => (
            <li
              key={r.key}
              className={`px-5 py-2.5 ${r.change > 0 ? "bg-emerald-50/30" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span
                    className={
                      r.change > 0
                        ? "font-medium text-emerald-800"
                        : r.label === "Damaged return"
                          ? "text-red-700"
                          : "text-stone-800"
                    }
                  >
                    {r.label}
                  </span>
                  <span className="ml-2 text-xs text-stone-500">
                    {r.date === today
                      ? "Today"
                      : `${dayName(r.date)} ${short(r.date)}`}
                  </span>
                </span>
                <span
                  className={`shrink-0 font-semibold ${r.change > 0 ? "text-emerald-700" : "text-stone-800"}`}
                >
                  {r.change > 0 ? `+${num(r.change)}` : `−${num(-r.change)}`}
                  {filtered && r.balance !== null && (
                    <span className="ml-2 text-xs font-normal text-stone-400">
                      → {num(r.balance)}
                    </span>
                  )}
                </span>
              </div>
              {(!filtered || r.detail || r.entryId) && (
                <div className="mt-0.5 flex items-center justify-between gap-3 text-xs text-stone-500">
                  <span className="min-w-0 truncate">
                    {[!filtered ? nameOf.get(r.product_id) : null, r.detail]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {r.entryId && (
                    <span className="flex shrink-0 items-center gap-3">
                      <button
                        onClick={() => {
                          const entry = entryById.get(r.entryId!);
                          if (entry)
                            setAdding({ productId: entry.product_id, entry });
                        }}
                        className="font-medium text-emerald-700"
                      >
                        Edit
                      </button>
                      <DeleteButton
                        disabled={pending}
                        onConfirm={() =>
                          run(() => deleteStockEntry(r.entryId!))
                        }
                      />
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
          {!rows.length && (
            <li className="px-5 py-10 text-center text-sm text-stone-500">
              No stock movements in this period.
            </li>
          )}
        </ul>

        <div className="hidden overflow-x-auto sm:block">
          <table
            className="w-full min-w-[640px] text-sm"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            <thead>
              <tr className="bg-stone-50 text-left text-xs font-medium uppercase tracking-wide text-stone-500">
                <th className="px-5 py-2.5">Date</th>
                {!filtered && <th className="px-3 py-2.5">Product</th>}
                <th className="px-3 py-2.5">What</th>
                <th className="px-3 py-2.5 text-right">In</th>
                <th className="px-3 py-2.5 text-right">Out</th>
                {filtered && (
                  <th className="px-3 py-2.5 text-right">Stock after</th>
                )}
                <th className="w-28 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {pageItems.map((r) => (
                <tr
                  key={r.key}
                  className={r.change > 0 ? "bg-emerald-50/30" : ""}
                >
                  <td className="whitespace-nowrap px-5 py-2 text-stone-700">
                    {r.date === today
                      ? "Today"
                      : `${dayName(r.date)} ${short(r.date)}`}
                  </td>
                  {!filtered && (
                    <td className="px-3 py-2 text-stone-700">
                      {nameOf.get(r.product_id) ?? "?"}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <span
                      className={
                        r.change > 0
                          ? "font-medium text-emerald-800"
                          : r.label === "Damaged return"
                            ? "text-red-700"
                            : "text-stone-700"
                      }
                    >
                      {r.label}
                    </span>
                    {r.detail && (
                      <span className="ml-2 text-xs text-stone-500">
                        {r.detail}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-emerald-700">
                    {r.change > 0 ? `+${num(r.change)}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right text-stone-700">
                    {r.change < 0 ? `−${num(-r.change)}` : ""}
                  </td>
                  {filtered && (
                    <td className="px-3 py-2 text-right font-semibold">
                      {r.balance !== null ? num(r.balance) : ""}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right">
                    {r.entryId && (
                      <span className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => {
                            const entry = entryById.get(r.entryId!);
                            if (entry)
                              setAdding({ productId: entry.product_id, entry });
                          }}
                          className="text-xs font-medium text-emerald-700 hover:underline"
                        >
                          Edit
                        </button>
                        <DeleteButton
                          disabled={pending}
                          onConfirm={() =>
                            run(() => deleteStockEntry(r.entryId!))
                          }
                        />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-10 text-center text-stone-500"
                  >
                    No stock movements in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager {...pager} noun="entries" className="border-t border-stone-100 px-5 py-3" />
        <p className="border-t border-stone-100 px-5 py-2.5 text-xs text-stone-500">
          Dispatched pieces are grouped per day. Pick one product to see the
          stock after each entry.
        </p>
      </section>

      {adding && (
        <AddStockDialog
          products={products}
          initial={adding}
          today={today}
          pending={pending}
          onClose={() => setAdding(null)}
          onSave={(v) =>
            run(
              () => addStockEntry(v),
              () => setAdding(null),
            )
          }
        />
      )}

      {toast && (
        <div
          className={`fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm font-medium shadow-lg ${toast.ok ? "bg-stone-900 text-white" : "bg-red-600 text-white"}`}
        >
          {toast.ok ? "✓ " : ""}
          {toast.message}
        </div>
      )}
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "bad";
}) {
  return (
    <div className="border-r border-stone-100 px-2 py-2.5 last:border-r-0">
      <dt className="text-[11px] uppercase tracking-wide text-stone-500">
        {label}
      </dt>
      <dd
        className={`mt-0.5 font-semibold ${tone === "bad" ? "text-red-600" : "text-stone-900"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function LeadDays({
  value,
  disabled,
  onSave,
}: {
  value: number;
  disabled: boolean;
  onSave: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));
  return (
    <label
      className="flex items-center gap-2 text-sm text-stone-600"
      title="Used for the reorder warning"
    >
      New stock arrives in
      <input
        inputMode="numeric"
        value={text}
        disabled={disabled}
        onChange={(e) =>
          setText(e.target.value.replace(/[^\d]/g, "").slice(0, 2))
        }
        onBlur={() => Number(text) !== value && onSave(Number(text) || 0)}
        onKeyDown={(e) =>
          e.key === "Enter" && (e.target as HTMLInputElement).blur()
        }
        className="w-12 rounded-md border border-stone-300 px-2 py-1 text-center"
      />
      days
    </label>
  );
}

function DeleteButton({
  onConfirm,
  disabled,
}: {
  onConfirm: () => void;
  disabled: boolean;
}) {
  const [ask, setAsk] = useState(false);
  if (!ask)
    return (
      <button
        onClick={() => setAsk(true)}
        className="text-stone-300 hover:text-red-600"
        aria-label="Delete entry"
      >
        ✕
      </button>
    );
  return (
    <span className="flex justify-end gap-2 whitespace-nowrap text-xs">
      <button
        disabled={disabled}
        onClick={onConfirm}
        className="font-semibold text-red-600 hover:underline"
      >
        Delete
      </button>
      <button
        onClick={() => setAsk(false)}
        className="text-stone-500 hover:underline"
      >
        Keep
      </button>
    </span>
  );
}

function AddStockDialog({
  products,
  initial,
  today,
  pending,
  onClose,
  onSave,
}: {
  products: StockProduct[];
  initial: { productId: string; qty?: number; entry?: StockIn };
  today: string;
  pending: boolean;
  onClose: () => void;
  onSave: (v: Parameters<typeof addStockEntry>[0]) => void;
}) {
  const e0 = initial.entry;
  const editing = !!e0;
  const [productId, setProductId] = useState(initial.productId);
  const [kind, setKind] = useState<StockKind>(e0?.kind ?? "purchase");
  const [date, setDate] = useState(e0?.date ?? today);
  const [qty, setQty] = useState(
    e0 ? String(Math.abs(e0.qty)) : initial.qty ? String(initial.qty) : "",
  );
  const [minus, setMinus] = useState(e0 ? e0.qty < 0 : false);
  const [supplier, setSupplier] = useState(e0?.supplier ?? "");
  const product = products.find((p) => p.id === productId);
  const [cost, setCost] = useState(
    e0
      ? e0.unit_cost != null
        ? String(e0.unit_cost)
        : ""
      : product?.cost
        ? String(product.cost)
        : "",
  );
  const [note, setNote] = useState(e0?.note ?? "");
  const [addExpense, setAddExpense] = useState(false);

  const n = Number(qty) || 0;
  const signed = kind === "adjust" && minus ? -n : n;
  const unit = cost === "" ? null : Number(cost);
  // when editing, take the old entry out first so "stock after" is right
  const stockNow = product
    ? product.stock_added -
      product.sold -
      (e0 && e0.product_id === productId ? e0.qty : 0)
    : 0;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            id: e0?.id,
            product_id: productId,
            date,
            kind,
            qty: signed,
            supplier: kind === "purchase" ? supplier : "",
            unit_cost: kind === "purchase" ? unit : null,
            note,
            add_expense: !editing && kind === "purchase" && addExpense,
          });
        }}
        className="relative max-h-[94vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {editing ? "Edit stock entry" : "Stock in"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-stone-400 hover:bg-stone-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 flex rounded-lg bg-stone-100 p-0.5 text-sm">
          {(
            [
              ["purchase", "New stock bought"],
              ["opening", "Opening stock"],
              ["adjust", "Correction"],
            ] as const
          ).map(([k, l]) => (
            <button
              type="button"
              key={k}
              onClick={() => setKind(k)}
              className={`flex-1 rounded-md px-2 py-1.5 ${kind === k ? "bg-white font-medium shadow-sm ring-1 ring-stone-200" : "text-stone-600"}`}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-stone-500 sm:col-span-2">
            Product
            <select
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                const p = products.find((x) => x.id === e.target.value);
                setCost(p?.cost ? String(p.cost) : "");
              }}
              className={`${input} mt-1`}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {!p.active ? " (inactive)" : ""}
                </option>
              ))}
            </select>
            {product && !editing && (
              <span className="mt-1 block font-normal text-stone-400">
                In stock now: {num(stockNow)}
              </span>
            )}
          </label>
          <label className="text-xs font-medium text-stone-500">
            Date
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              className={`${input} mt-1`}
            />
          </label>
          <label className="text-xs font-medium text-stone-500">
            Pieces
            <div className="mt-1 flex gap-1">
              {kind === "adjust" && (
                <div className="flex rounded-lg bg-stone-100 p-0.5 text-sm">
                  <button
                    type="button"
                    onClick={() => setMinus(false)}
                    className={`rounded-md px-2.5 ${!minus ? "bg-white font-semibold shadow-sm" : "text-stone-500"}`}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => setMinus(true)}
                    className={`rounded-md px-2.5 ${minus ? "bg-white font-semibold shadow-sm" : "text-stone-500"}`}
                  >
                    −
                  </button>
                </div>
              )}
              <input
                inputMode="numeric"
                value={qty}
                autoFocus
                onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="100"
                className={`${input} text-base font-semibold`}
              />
            </div>
          </label>

          {kind === "purchase" && (
            <>
              <label className="text-xs font-medium text-stone-500">
                Supplier (optional)
                <input
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="e.g. Meesho seller, Delhi"
                  className={`${input} mt-1`}
                />
              </label>
              <label className="text-xs font-medium text-stone-500">
                Cost per piece
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-stone-400">
                    ₹
                  </span>
                  <input
                    inputMode="numeric"
                    value={cost}
                    onChange={(e) =>
                      setCost(e.target.value.replace(/[^\d]/g, ""))
                    }
                    className={`${input} pl-7`}
                  />
                </div>
                {unit !== null && n > 0 && (
                  <span className="mt-1 block font-normal text-stone-500">
                    Total {rs(unit * n)}
                  </span>
                )}
              </label>
            </>
          )}

          <label className="text-xs font-medium text-stone-500 sm:col-span-2">
            Note (optional)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                kind === "adjust"
                  ? "e.g. counted shelf, 3 broken"
                  : "e.g. invoice no."
              }
              className={`${input} mt-1`}
            />
          </label>
        </div>

        {editing && kind === "purchase" && (
          <p className="mt-3 text-xs text-stone-500">
            If this purchase is also on the Expenses page, update the amount
            there too.
          </p>
        )}
        {!editing &&
          kind === "purchase" &&
          unit !== null &&
          unit > 0 &&
          n > 0 && (
            <label className="mt-3 flex items-start gap-2 rounded-lg bg-stone-50 p-3 text-sm text-stone-700 ring-1 ring-stone-200">
              <input
                type="checkbox"
                checked={addExpense}
                onChange={(e) => setAddExpense(e.target.checked)}
                className="mt-0.5 size-4 accent-emerald-700"
              />
              <span>
                Also add {rs(unit * n)} to Expenses as <b>Bulk stock</b>
                <span className="block text-xs text-stone-500">
                  Leave off if you already entered this payment on the Expenses
                  page.
                </span>
              </span>
            </label>
          )}
        {kind === "adjust" && (
          <p className="mt-3 text-xs text-stone-500">
            Use a correction after counting your shelf, or for broken / lost
            pieces (−).
          </p>
        )}

        <div className="mt-5 flex items-center justify-between gap-2">
          <span className="text-sm text-stone-500">
            {n > 0 && product && (
              <>
                Stock after:{" "}
                <b className="text-stone-900">{num(stockNow + signed)}</b>
              </>
            )}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
            >
              Cancel
            </button>
            <button
              disabled={pending || n <= 0 || !productId}
              className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {pending
                ? "Saving…"
                : editing
                  ? "Save changes"
                  : kind === "adjust" && minus
                    ? "Take off"
                    : "Add stock"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
