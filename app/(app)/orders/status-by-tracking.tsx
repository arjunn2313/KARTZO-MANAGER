"use client";

import { useState, useTransition } from "react";
import { STATUS_LABEL, STATUS_STYLE, type OrderStatus } from "@/lib/orders";
import { extractTrackingIds } from "@/lib/parser/whatsapp";
import { findOrdersByTracking, setStatusForOrders, type TrackedOrder } from "./actions";

type Target = "delivered" | "rto" | "dispatched";

const TARGETS: { key: Target; label: string; hint: string }[] = [
  { key: "delivered", label: "Delivered", hint: "COD money is now due from India Post" },
  { key: "rto", label: "RTO", hint: "Came back. Only shipping is lost (no COD commission)" },
  { key: "dispatched", label: "Dispatched", hint: "Booked and on the way" },
];

const rs = (n: number) => "₹" + n.toLocaleString("en-IN");

/** "Update status by tracking IDs": paste a list → see the matching orders → change them all. */
export function StatusByTracking() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-white"
      >
        Update status by tracking
      </button>
      {open && <Dialog onClose={() => setOpen(false)} />}
    </>
  );
}

function Dialog({ onClose }: { onClose: () => void }) {
  const [target, setTarget] = useState<Target>("delivered");
  const [text, setText] = useState("");
  const [damaged, setDamaged] = useState(false);
  const [found, setFound] = useState<{ orders: TrackedOrder[]; missing: string[]; ids: string[] } | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [finding, startFind] = useTransition();
  const [saving, startSave] = useTransition();

  const ids = extractTrackingIds(text);
  // the list changed since the last check → check again
  const stale = !found || found.ids.join() !== ids.join();

  function check() {
    setResult(null);
    startFind(async () => {
      const r = await findOrdersByTracking(ids);
      if (!r.ok) return setResult(r);
      const have = new Set(r.orders.map((o) => o.tracking_id.toUpperCase()));
      // keep the pasted order
      const byId = new Map(r.orders.map((o) => [o.tracking_id.toUpperCase(), o]));
      setFound({ orders: ids.map((t) => byId.get(t)).filter(Boolean) as TrackedOrder[], missing: ids.filter((t) => !have.has(t)), ids });
    });
  }

  const orders = found?.orders ?? [];
  const willChange = orders.filter((o) => o.status !== target && o.status !== "cancelled" && o.status !== "returned");
  const already = orders.filter((o) => o.status === target);
  const skipped = orders.filter((o) => o.status !== target && (o.status === "cancelled" || o.status === "returned"));
  const codDue = target === "delivered" ? willChange.filter((o) => o.payment_mode === "cod").reduce((s, o) => s + o.cod_balance, 0) : 0;
  const tLabel = TARGETS.find((t) => t.key === target)!.label;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex max-h-[94vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:max-w-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Update status by tracking IDs</h2>
            <p className="text-xs text-stone-500">Paste the tracking numbers from India Post (delivered list, RTO list, Excel…). Other text is ignored.</p>
          </div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-stone-400 hover:bg-stone-100" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* new status */}
          <div>
            <div className="mb-1.5 text-sm font-medium text-stone-700">Mark them as</div>
            <div className="grid grid-cols-3 gap-2">
              {TARGETS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTarget(t.key)}
                  className={`rounded-xl px-3 py-2.5 text-left ring-1 transition ${
                    target === t.key ? "bg-emerald-50 ring-2 ring-emerald-500" : "ring-stone-200 hover:bg-stone-50"
                  }`}
                >
                  <span className="block text-sm font-semibold text-stone-900">{t.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-stone-500">{t.hint}</span>
                </button>
              ))}
            </div>
            {target === "rto" && (
              <label className="mt-2 flex items-center gap-2 text-sm text-stone-700">
                <input type="checkbox" checked={damaged} onChange={(e) => setDamaged(e.target.checked)} className="size-4 accent-emerald-700" />
                Products came back damaged (counts the product as a loss and doesn&apos;t return it to stock)
              </label>
            )}
          </div>

          {/* list */}
          <div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              autoFocus
              placeholder={"CX064397338IN\nCX064397339IN\nCX064397340IN"}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm uppercase outline-none placeholder:normal-case focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-xs text-stone-500">
                {ids.length} tracking ID{ids.length === 1 ? "" : "s"} found in the text
              </span>
              <button
                type="button"
                onClick={check}
                disabled={!ids.length || finding || !stale}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-40"
              >
                {finding ? "Finding…" : "Find orders"}
              </button>
            </div>
          </div>

          {/* preview */}
          {found && !stale && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800">{willChange.length} will change</span>
                {already.length > 0 && <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-600">{already.length} already {tLabel}</span>}
                {skipped.length > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">{skipped.length} cancelled / returned, left alone</span>}
                {found.missing.length > 0 && <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-700">{found.missing.length} not found</span>}
              </div>

              <ul className="max-h-64 divide-y divide-stone-100 overflow-y-auto rounded-lg text-sm ring-1 ring-stone-200">
                {orders.map((o) => {
                  const st = o.status as OrderStatus;
                  const changes = willChange.includes(o);
                  return (
                    <li key={o.id} className={`flex items-center gap-3 px-3 py-2 ${changes ? "" : "opacity-55"}`}>
                      <div className="min-w-0 flex-1">
                        <div className="truncate">
                          <span className="font-medium text-stone-900">{o.order_code}</span> <span className="text-stone-600">{o.customer_name}</span>
                        </div>
                        <div className="font-mono text-[11px] text-stone-400">
                          {o.tracking_id}
                          {o.payment_mode === "cod" && <span className="font-sans"> · COD {rs(o.cod_balance)}</span>}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[st] ?? "bg-stone-100 text-stone-600"}`}>
                        {STATUS_LABEL[st] ?? o.status}
                      </span>
                      {changes && (
                        <>
                          <span className="text-stone-400" aria-hidden>
                            →
                          </span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[target]}`}>{tLabel}</span>
                        </>
                      )}
                    </li>
                  );
                })}
                {found.missing.map((t) => (
                  <li key={t} className="flex items-center gap-3 bg-red-50/50 px-3 py-2">
                    <span className="min-w-0 flex-1 font-mono text-xs text-red-700">{t}</span>
                    <span className="text-xs text-red-600">No order has this tracking ID</span>
                  </li>
                ))}
              </ul>
              {codDue > 0 && <p className="text-xs text-stone-500">These COD orders add {rs(codDue)} to “Still owed to you” on the COD page.</p>}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-stone-100 px-5 py-3">
          {result && <span className={`mr-auto text-sm ${result.ok ? "text-emerald-700" : "text-red-600"}`}>{result.ok ? "✓ " : ""}{result.message}</span>}
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-stone-600 hover:bg-stone-100">
            {result?.ok ? "Done" : "Cancel"}
          </button>
          <button
            type="button"
            disabled={!found || stale || !willChange.length || saving || !!result?.ok}
            onClick={() =>
              startSave(async () => {
                const r = await setStatusForOrders({ ids: willChange.map((o) => o.id), status: target, damaged: target === "rto" && damaged });
                setResult(r);
              })
            }
            className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-40"
          >
            {saving ? "Saving…" : `Mark ${willChange.length || ""} as ${tLabel}`}
          </button>
        </div>
      </div>
    </div>
  );
}
