"use client";

import { Pager } from "@/components/pager";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useMemo, useState, useTransition } from "react";
import { dmy, orderItemsLabel, rs, STATUSES, STATUS_LABEL, STATUS_STYLE, type OrderRow, type OrderStatus } from "@/lib/orders";
import { saveReturnDetails, setOrderDates, setTrackingIds, updateOrderStatus, type BulkResult } from "./actions";
import { EditOrderDialog, type EditCourier, type EditProduct } from "./edit-order-dialog";

type Summary = { orders: number; sales: number; profit: number; rto: number; codPending: number };

export function OrdersTable({
  products,
  couriers,
  rows,
  summary,
  page,
  pageCount,
  pageSize,
  total,
}: {
  products: EditProduct[];
  couriers: EditCourier[];
  rows: OrderRow[];
  summary: Summary;
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [editing, setEditing] = useState<OrderRow | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [returnFor, setReturnFor] = useState<{ order: OrderRow; status: "rto" | "returned" } | null>(null);
  const [toast, setToast] = useState<BulkResult | null>(null);
  const [pending, startTransition] = useTransition();

  // keep only ids that are still visible (after filters change)
  const visibleSelected = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);
  const allChecked = rows.length > 0 && visibleSelected.length === rows.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
  }

  function showToast(r: BulkResult) {
    setToast(r);
    setTimeout(() => setToast(null), r.ok ? 2500 : 6000);
  }

  function changeStatus(ids: string[], status: OrderStatus) {
    // A single order going to RTO / Returned: ask about damage and refund first
    if (ids.length === 1 && (status === "rto" || status === "returned")) {
      const order = rows.find((r) => r.id === ids[0]);
      if (order) return setReturnFor({ order, status });
    }
    startTransition(async () => {
      const r = await updateOrderStatus(ids, status);
      showToast(r);
      if (r.ok) setSelected(new Set());
    });
  }

  return (
    <div className="space-y-3">
      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Orders" value={summary.orders.toLocaleString("en-IN")} />
        <Stat label="Sales" value={rs(summary.sales)} />
        <Stat label="Profit (before ads)" value={rs(summary.profit)} tone={summary.profit >= 0 ? "ok" : "bad"} />
        <Stat label="RTO / Returns" value={String(summary.rto)} tone={summary.rto ? "bad" : undefined} />
        <Stat label="COD in transit" value={rs(summary.codPending)} hint="New + dispatched COD" />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center text-sm text-stone-500 ring-1 ring-stone-200">
          No orders match these filters.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl bg-white ring-1 ring-stone-200 lg:block">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs font-medium uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} className="size-4 accent-emerald-700" aria-label="Select all" />
                  </th>
                  <th className="px-3 py-3">Order</th>
                  <th className="px-3 py-3">Customer</th>
                  <th className="px-3 py-3">Product</th>
                  <th className="px-3 py-3">Payment</th>
                  <th className="px-3 py-3 text-right">Value</th>
                  <th className="px-3 py-3 text-right">COD bal.</th>
                  <th className="px-3 py-3">Tracking</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Profit</th>
                  <th className="w-12 px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {rows.map((o) => {
                  const isSel = selected.has(o.id);
                  const isOpen = expanded === o.id;
                  return (
                    <Fragment key={o.id}>
                      <tr className={`${isSel ? "bg-emerald-50/60" : o.status === "rto" || o.status === "returned" ? "bg-red-50/40" : "hover:bg-stone-50"}`}>
                        <td className="px-3 py-2.5">
                          <input type="checkbox" checked={isSel} onChange={() => toggle(o.id)} className="size-4 accent-emerald-700" aria-label={`Select ${o.order_code}`} />
                        </td>
                        <td className="px-3 py-2.5">
                          <button onClick={() => setExpanded(isOpen ? null : o.id)} className="text-left">
                            <div className="font-medium text-stone-900">{o.order_code}</div>
                            <div className="text-xs text-stone-500">{dmy(o.order_date)}</div>
                          </button>
                        </td>
                        <td className="max-w-[200px] px-3 py-2.5">
                          <button onClick={() => setExpanded(isOpen ? null : o.id)} className="w-full text-left">
                            <div className="truncate font-medium text-stone-800">{o.customer_name}</div>
                            <div className="text-xs text-stone-500">{o.phone}</div>
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-stone-700">
                          {orderItemsLabel(o)}
                        </td>
                        <td className="px-3 py-2.5">
                          <PaymentPill o={o} />
                        </td>
                        <td className="px-3 py-2.5 text-right">{rs(o.order_value)}</td>
                        <td className="px-3 py-2.5 text-right text-stone-600">{o.cod_balance ? rs(o.cod_balance) : "–"}</td>
                        <td className="px-3 py-2.5">
                          <TrackingCell o={o} onDone={showToast} />
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusSelect value={o.status} disabled={pending} onChange={(s) => changeStatus([o.id], s)} />
                        </td>
                        <td className={`px-3 py-2.5 text-right font-medium ${o.profit < 0 ? "text-red-600" : "text-stone-800"}`}>
                          {rs(o.profit)}
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <button
                            onClick={() => setEditing(o)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-stone-500 ring-1 ring-stone-200 hover:bg-white hover:text-emerald-700"
                            title="Edit order"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-stone-50">
                          <td />
                          <td colSpan={10} className="px-3 py-3 text-sm text-stone-600">
                            <Details o={o} onEdit={() => setEditing(o)} onEditReturn={(st) => setReturnFor({ order: o, status: st })} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile / tablet cards */}
          <div className="space-y-2 lg:hidden">
            <label className="flex items-center gap-2 px-1 text-sm text-stone-600">
              <input type="checkbox" checked={allChecked} onChange={toggleAll} className="size-4 accent-emerald-700" />
              Select all on this page
            </label>
            {rows.map((o) => {
              const isSel = selected.has(o.id);
              const isOpen = expanded === o.id;
              return (
                <div key={o.id} className={`rounded-xl bg-white p-3 ring-1 ${isSel ? "ring-2 ring-emerald-500" : "ring-stone-200"}`}>
                  <div className="flex gap-3">
                    <input type="checkbox" checked={isSel} onChange={() => toggle(o.id)} className="mt-1 size-4 shrink-0 accent-emerald-700" />
                    <button onClick={() => setExpanded(isOpen ? null : o.id)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{o.customer_name}</span>
                        <span className={`shrink-0 font-semibold ${o.profit < 0 ? "text-red-600" : ""}`}>{rs(o.order_value)}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-stone-500">
                        {o.order_code} · {dmy(o.order_date)} · {o.phone}
                      </div>
                      <div className="mt-1 text-sm text-stone-700">
                        {orderItemsLabel(o)}
                      </div>
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
                    <PaymentPill o={o} />
                    <StatusSelect value={o.status} disabled={pending} onChange={(s) => changeStatus([o.id], s)} />
                    <div className="ml-auto">
                      <TrackingCell o={o} onDone={showToast} />
                    </div>
                  </div>
                  {isOpen && (
                    <div className="mt-3 border-t border-stone-100 pl-7 pt-3 text-sm text-stone-600">
                      <Details o={o} onEdit={() => setEditing(o)} onEditReturn={(st) => setReturnFor({ order: o, status: st })} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Pagination page={page} pageCount={pageCount} total={total} size={pageSize} />
        </>
      )}

      {/* Bulk action bar */}
      {visibleSelected.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-stone-200 bg-white/95 px-4 py-3 lg:bottom-0 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur lg:left-64">
          <div className="flex w-full flex-wrap items-center gap-2">
            <span className="mr-2 text-sm font-medium">{visibleSelected.length} selected</span>
            <BulkButton disabled={pending} onClick={() => setTrackingOpen(true)} primary>
              Add tracking IDs
            </BulkButton>
            <a
              href={`/labels?layout=a4-4&ids=${visibleSelected.map((o) => o.id).join(",")}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50"
            >
              Print labels
            </a>
            <BulkButton disabled={pending} onClick={() => setDateOpen(true)}>
              Change date
            </BulkButton>
            <BulkButton disabled={pending} onClick={() => changeStatus(visibleSelected.map((o) => o.id), "dispatched")}>
              Mark Dispatched
            </BulkButton>
            <BulkButton disabled={pending} onClick={() => changeStatus(visibleSelected.map((o) => o.id), "delivered")}>
              Mark Delivered
            </BulkButton>
            <BulkButton disabled={pending} onClick={() => changeStatus(visibleSelected.map((o) => o.id), "rto")}>
              Mark RTO
            </BulkButton>
            <BulkButton disabled={pending} onClick={() => changeStatus(visibleSelected.map((o) => o.id), "cancelled")}>
              Cancel
            </BulkButton>
            <button onClick={() => setSelected(new Set())} className="ml-auto text-sm text-stone-500 hover:text-stone-800">
              Clear
            </button>
          </div>
        </div>
      )}
      {visibleSelected.length > 0 && <div className="h-16" />}

      {trackingOpen && (
        <TrackingDialog
          orders={visibleSelected}
          onClose={() => setTrackingOpen(false)}
          onDone={(r) => {
            showToast(r);
            if (r.ok) {
              setTrackingOpen(false);
              setSelected(new Set());
            }
          }}
        />
      )}

      {editing && (
        <EditOrderDialog
          key={editing.id}
          order={editing}
          products={products}
          couriers={couriers}
          onClose={() => setEditing(null)}
          onDone={(r) => {
            showToast(r);
            if (r.ok) setEditing(null);
          }}
        />
      )}

      {dateOpen && (
        <DateDialog
          count={visibleSelected.length}
          initial={visibleSelected[0]?.order_date ?? ""}
          onClose={() => setDateOpen(false)}
          onSave={(date) =>
            startTransition(async () => {
              const r = await setOrderDates(
                visibleSelected.map((o) => o.id),
                date,
              );
              showToast(r);
              if (r.ok) {
                setDateOpen(false);
                setSelected(new Set());
              }
            })
          }
          pending={pending}
        />
      )}

      {returnFor && (
        <ReturnDialog
          key={returnFor.order.id + returnFor.status}
          order={returnFor.order}
          initialStatus={returnFor.status}
          onClose={() => setReturnFor(null)}
          onDone={(r) => {
            showToast(r);
            if (r.ok) setReturnFor(null);
          }}
        />
      )}

      {toast && (
        <div
          className={`fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm font-medium shadow-lg ${
            toast.ok ? "bg-stone-900 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.ok ? "✓ " : ""}
          {toast.message}
        </div>
      )}
    </div>
  );
}

/* ---------------- pieces ---------------- */

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: "ok" | "bad"; hint?: string }) {
  return (
    <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-stone-200" title={hint}>
      <div className="text-xs text-stone-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold ${tone === "ok" ? "text-emerald-700" : tone === "bad" ? "text-red-600" : "text-stone-900"}`}>
        {value}
      </div>
    </div>
  );
}

function PaymentPill({ o }: { o: OrderRow }) {
  if (o.order_type === "replacement")
    return <span className="rounded-md bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">REPLACEMENT</span>;
  return o.payment_mode === "paid" ? (
    <span className="rounded-md bg-emerald-700 px-2 py-0.5 text-xs font-semibold text-white">PAID</span>
  ) : o.advance_paid > 0 ? (
    <span className="rounded-md bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">PART COD</span>
  ) : (
    <span className="rounded-md bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">COD</span>
  );
}

function StatusSelect({ value, onChange, disabled }: { value: OrderStatus; onChange: (s: OrderStatus) => void; disabled?: boolean }) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as OrderStatus)}
      className={`cursor-pointer appearance-none rounded-full border-0 py-1 pl-3 pr-7 text-xs font-semibold outline-none ring-0 focus:ring-2 focus:ring-emerald-600/30 ${STATUS_STYLE[value]}`}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='currentColor'%3E%3Cpath d='M5 8l5 5 5-5z' opacity='.6'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 6px center",
        backgroundSize: "14px",
      }}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

function TrackingCell({ o, onDone }: { o: OrderRow; onDone: (r: BulkResult) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(o.tracking_id ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    const v = value.trim().toUpperCase();
    if (v === (o.tracking_id ?? "")) return setEditing(false);
    startTransition(async () => {
      const r = await setTrackingIds([{ id: o.id, tracking_id: v }], o.status === "new" && v !== "");
      onDone(r);
      if (r.ok) setEditing(false);
    });
  }

  if (editing)
    return (
      <input
        autoFocus
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setValue(o.tracking_id ?? "");
            setEditing(false);
          }
        }}
        placeholder="Tracking ID"
        className="w-36 rounded-md border border-emerald-500 px-2 py-1 font-mono text-xs uppercase outline-none ring-2 ring-emerald-500/20"
      />
    );

  return (
    <button
      onClick={() => {
        setValue(o.tracking_id ?? "");
        setEditing(true);
      }}
      className="group text-left" title="Click to edit tracking ID">
      {o.tracking_id ? (
        <>
          <div className="font-mono text-xs text-stone-700 group-hover:text-emerald-700">{o.tracking_id}</div>
          <div className="text-[11px] text-stone-400">{o.courier?.name}</div>
        </>
      ) : (
        <span className="rounded-md border border-dashed border-stone-300 px-2 py-0.5 text-xs text-stone-400 group-hover:border-emerald-500 group-hover:text-emerald-700">
          + Add
        </span>
      )}
    </button>
  );
}

function Details({
  o,
  onEdit,
  onEditReturn,
}: {
  o: OrderRow;
  onEdit: () => void;
  onEditReturn: (s: "rto" | "returned") => void;
}) {
  const isReturn = o.status === "rto" || o.status === "returned";
  return (
    <div className="grid gap-x-6 gap-y-2 sm:grid-cols-[2fr_1fr_1fr]">
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-stone-400">Address</div>
        <div className="whitespace-pre-line text-stone-700">{o.address}</div>
        <div className="font-medium text-stone-800">PIN {o.pincode}</div>
      </div>
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-stone-400">Money</div>
        <div>Value {rs(o.order_value)}</div>
        {(() => {
          const normal = (o.items ?? []).reduce((t, i) => t + i.unit_price * i.qty, 0);
          return o.order_type !== "replacement" && normal > o.order_value ? (
            <div className="text-emerald-700">Discount {rs(normal - o.order_value)}</div>
          ) : null;
        })()}
        <div>Advance {rs(o.advance_paid)}</div>
        <div>COD to collect {rs(o.cod_balance)}</div>
      </div>
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-stone-400">Shipping</div>
        <div>
          {o.courier?.name} · {rs(o.shipping_cost)}
          {o.cod_fee > 0 && ` · COD fee ${rs(o.cod_fee)}`}
        </div>
        <div>Dispatched {o.dispatch_date ? dmy(o.dispatch_date) : "–"}</div>
        {o.notes && <div className="mt-1 text-stone-500">Note: {o.notes}</div>}
      </div>
      {isReturn && (
        <div className="sm:col-span-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-red-50 px-3 py-2 text-red-900">
          <span className="font-medium">{o.status === "rto" ? "RTO" : "Returned"}:</span>
          {o.damaged ? <span>Product damaged</span> : <span>Product back in stock</span>}
          <span>Refunded {rs(o.refund_amount)}</span>
          {o.status === "returned" && <span>Return courier {rs(o.return_shipping)}</span>}
          <span className="font-semibold">Result {rs(o.profit)}</span>
          <button
            onClick={() => onEditReturn(o.status as "rto" | "returned")}
            className="ml-auto rounded-md px-2 py-1 text-sm font-medium text-red-700 ring-1 ring-red-200 hover:bg-white"
          >
            Edit details
          </button>
        </div>
      )}
      <div className="sm:col-span-3">
        <button
          onClick={onEdit}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50"
        >
          Edit order details
        </button>
      </div>
    </div>
  );
}

function DateDialog({
  count,
  initial,
  pending,
  onClose,
  onSave,
}: {
  count: number;
  initial: string;
  pending: boolean;
  onClose: () => void;
  onSave: (date: string) => void;
}) {
  const [date, setDate] = useState(initial);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-sm sm:rounded-2xl">
        <h2 className="text-lg font-semibold">Change order date</h2>
        <p className="mt-1 text-sm text-stone-500">
          Sets the order date on the {count} selected order{count > 1 ? "s" : ""}.
        </p>
        <input
          type="date"
          value={date}
          autoFocus
          onChange={(e) => setDate(e.target.value)}
          className="mt-4 w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-stone-600 hover:bg-stone-100">
            Cancel
          </button>
          <button
            onClick={() => onSave(date)}
            disabled={pending || !date}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Change date"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- RTO / Return dialog ---------------- */

function ReturnDialog({
  order: o,
  initialStatus,
  onClose,
  onDone,
}: {
  order: OrderRow;
  initialStatus: "rto" | "returned";
  onClose: () => void;
  onDone: (r: BulkResult) => void;
}) {
  const already = o.status === initialStatus;
  const [status, setStatus] = useState<"rto" | "returned">(initialStatus);
  const [damaged, setDamaged] = useState(already ? o.damaged : false);
  const [refund, setRefund] = useState(
    already ? o.refund_amount : initialStatus === "rto" ? o.advance_paid : o.order_value,
  );
  const [returnShip, setReturnShip] = useState(already ? o.return_shipping : o.shipping_cost);
  const [pending, startTransition] = useTransition();

  function switchTo(s: "rto" | "returned") {
    setStatus(s);
    setRefund(s === "rto" ? o.advance_paid : o.order_value);
    if (s === "returned" && !returnShip) setReturnShip(o.shipping_cost);
  }

  const fullCost = o.items_cost ?? o.product_cost * o.qty;
  const productLoss = damaged ? fullCost : 0;
  const result =
    status === "rto"
      ? o.advance_paid - refund - o.shipping_cost - o.rto_charge - productLoss
      : o.order_value - refund - o.shipping_cost - o.cod_fee - returnShip - productLoss;

  const lines: [string, number][] =
    status === "rto"
      ? [
          ["Advance received", o.advance_paid],
          ["Refunded", -refund],
          ["Shipping", -o.shipping_cost],
          ...(o.rto_charge ? ([["RTO charge", -o.rto_charge]] as [string, number][]) : []),
          ...(damaged ? ([["Damaged product", -productLoss]] as [string, number][]) : []),
        ]
      : [
          ["Customer paid", o.order_value],
          ["Refunded", -refund],
          ["Shipping", -o.shipping_cost],
          ...(o.cod_fee ? ([["COD commission", -o.cod_fee]] as [string, number][]) : []),
          ["Return courier", -returnShip],
          ...(damaged ? ([["Damaged product", -productLoss]] as [string, number][]) : []),
        ];

  function save() {
    startTransition(async () => {
      onDone(
        await saveReturnDetails({
          id: o.id,
          status,
          damaged,
          refund_amount: refund,
          return_shipping: status === "returned" ? returnShip : 0,
        }),
      );
    });
  }

  const money =
    "w-28 rounded-lg border border-stone-300 px-3 py-2 text-right outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{o.order_code}: RTO / Return</h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-stone-400 hover:bg-stone-100" aria-label="Close">
            ✕
          </button>
        </div>
        <p className="mb-4 text-sm text-stone-500">
          {o.customer_name} · {orderItemsLabel(o)} · {rs(o.order_value)}
        </p>

        <div className="grid grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1">
          {(
            [
              ["rto", "RTO", "Came back undelivered"],
              ["returned", "Customer return", "Delivered, then sent back"],
            ] as const
          ).map(([k, label, sub]) => (
            <button
              key={k}
              type="button"
              onClick={() => switchTo(k)}
              className={`rounded-md px-3 py-2 text-left ${status === k ? "bg-white shadow-sm ring-1 ring-stone-200" : "text-stone-500"}`}
            >
              <div className="text-sm font-semibold">{label}</div>
              <div className="text-xs text-stone-500">{sub}</div>
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          <label className="flex items-start gap-3 rounded-lg p-2 ring-1 ring-stone-200">
            <input type="checkbox" checked={damaged} onChange={(e) => setDamaged(e.target.checked)} className="mt-0.5 size-4 accent-red-600" />
            <span className="text-sm">
              <span className="font-medium">Product damaged</span>
              <span className="block text-xs text-stone-500">
                Counts {rs(fullCost)} product cost as loss and doesn&apos;t add it back to stock
              </span>
            </span>
          </label>

          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              <span className="font-medium">Refunded to customer</span>
              <span className="block text-xs text-stone-500">
                {status === "rto"
                  ? o.advance_paid > 0
                    ? `Advance was ${rs(o.advance_paid)}. Set ₹0 if you kept it.`
                    : "No advance on this order"
                  : `Customer paid ${rs(o.order_value)}`}
              </span>
            </span>
            <input
              type="number"
              min={0}
              value={refund}
              onChange={(e) => setRefund(Math.max(0, Math.round(Number(e.target.value) || 0)))}
              className={money}
            />
          </label>

          {status === "returned" && (
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                <span className="font-medium">Return courier charge</span>
                <span className="block text-xs text-stone-500">What you paid to get it back</span>
              </span>
              <input
                type="number"
                min={0}
                value={returnShip}
                onChange={(e) => setReturnShip(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                className={money}
              />
            </label>
          )}
        </div>

        <dl className="mt-4 space-y-1 rounded-lg bg-stone-50 p-3 text-sm">
          {lines.map(([label, v]) => (
            <div key={label} className="flex justify-between">
              <dt className="text-stone-500">{label}</dt>
              <dd className={v < 0 ? "text-stone-700" : "text-stone-900"}>{rs(v)}</dd>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-stone-200 pt-1 font-semibold">
            <dt>Result on this order</dt>
            <dd className={result < 0 ? "text-red-600" : "text-emerald-700"}>{rs(result)}</dd>
          </div>
        </dl>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-stone-600 hover:bg-stone-100">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={pending}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {pending ? "Saving…" : status === "rto" ? "Save as RTO" : "Save as returned"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkButton({
  children,
  onClick,
  disabled,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
        primary ? "bg-emerald-700 text-white hover:bg-emerald-800" : "text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50"
      }`}
    >
      {children}
    </button>
  );
}

function Pagination({ page, pageCount, total, size }: { page: number; pageCount: number; total: number; size: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function go(patch: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <Pager
      className={`px-1 transition ${pending ? "opacity-60" : ""}`}
      page={page}
      pageCount={pageCount}
      total={total}
      size={size}
      noun="orders"
      onPage={(p) => go({ page: String(p) })}
      onSize={(n) => {
        document.cookie = `kartzo_rows_orders=${n}; path=/; max-age=31536000; samesite=lax`;
        go({ size: String(n), page: "1" });
      }}
    />
  );
}

/* ---------------- Bulk tracking dialog ---------------- */

function TrackingDialog({
  orders,
  onClose,
  onDone,
}: {
  orders: OrderRow[];
  onClose: () => void;
  onDone: (r: BulkResult) => void;
}) {
  const [text, setText] = useState("");
  const [markDispatched, setMarkDispatched] = useState(true);
  const [pending, startTransition] = useTransition();

  // one tracking ID per line (also accepts spaces/commas between IDs)
  const ids = text
    .split(/[\s,]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const mismatch = ids.length !== orders.length;
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);

  function save() {
    startTransition(async () => {
      const items = orders.map((o, i) => ({ id: o.id, tracking_id: ids[i] ?? "" })).filter((x) => x.tracking_id);
      const r = await setTrackingIds(items, markDispatched);
      onDone(r);
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:max-w-3xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Add tracking IDs</h2>
            <p className="text-sm text-stone-500">
              Paste one tracking ID per line, in the same order as the {orders.length} orders shown.
            </p>
          </div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-stone-400 hover:bg-stone-100" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 sm:grid-cols-2">
          <div>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={Math.min(14, Math.max(6, orders.length + 1))}
              placeholder={"CX064397338IN\nCX064397341IN\n…"}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
            />
            <div className={`mt-1 text-xs ${mismatch ? "text-amber-700" : "text-emerald-700"}`}>
              {ids.length} tracking IDs for {orders.length} orders
              {mismatch && (ids.length < orders.length ? " — the last orders will be left empty" : " — extra IDs will be ignored")}
            </div>
            {dupes.length > 0 && <div className="mt-1 text-xs text-red-600">Repeated: {[...new Set(dupes)].join(", ")}</div>}
          </div>

          <ol className="space-y-1 text-sm">
            {orders.map((o, i) => (
              <li key={o.id} className="flex items-center gap-2 rounded-md bg-stone-50 px-2 py-1.5">
                <span className="w-5 text-right text-xs text-stone-400">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{o.customer_name}</span>{" "}
                  <span className="text-xs text-stone-400">{o.order_code}</span>
                </span>
                <span className={`font-mono text-xs ${ids[i] ? "text-emerald-700" : "text-stone-300"}`}>{ids[i] ?? "—"}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-stone-100 px-5 py-4">
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" checked={markDispatched} onChange={(e) => setMarkDispatched(e.target.checked)} className="size-4 accent-emerald-700" />
            Mark new orders as Dispatched
          </label>
          <div className="flex-1" />
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-stone-600 hover:bg-stone-100">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={pending || ids.length === 0 || dupes.length > 0}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save tracking IDs"}
          </button>
        </div>
      </div>
    </div>
  );
}
