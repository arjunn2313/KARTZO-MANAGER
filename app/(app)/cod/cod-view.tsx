"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Pager, usePaged } from "@/components/pager";
import { rs, shortDate } from "@/components/charts/chart-utils";
import {
  matchTracking,
  saveRemittance,
  undoRemittance,
  type MatchedOrder,
  type Result,
} from "./actions";

export type PendingOrder = {
  id: string;
  order_code: string;
  customer_name: string;
  phone: string | null;
  tracking_id: string | null;
  cod_balance: number;
  cod_fee: number;
  order_date: string;
  dispatch_date: string | null;
};

export type Remittance = {
  id: string;
  date: string;
  amount: number;
  expected: number;
  reference: string | null;
  note: string | null;
  orders: {
    id: string;
    order_code: string;
    customer_name: string;
    tracking_id: string | null;
    cod_balance: number;
    cod_fee: number;
  }[];
};

const daysBetween = (a: string, b: string) =>
  Math.round(
    (new Date(b + "T00:00:00Z").getTime() -
      new Date(a + "T00:00:00Z").getTime()) /
      864e5,
  );
const dmy = (iso: string) => iso.split("-").reverse().join("-");

export function CodView({
  today,
  pending,
  transit,
  remittances,
}: {
  today: string;
  pending: PendingOrder[];
  transit: { count: number; amount: number };
  remittances: Remittance[];
}) {
  const [toast, setToast] = useState<Result | null>(null);
  const [tab, setTab] = useState<"pending" | "history">("pending");

  const owed = pending.reduce((s, o) => s + o.cod_balance, 0);
  const owedNet = pending.reduce((s, o) => s + o.cod_balance - o.cod_fee, 0);
  const oldest = pending.reduce<number | null>((m, o) => {
    const d = o.dispatch_date ? daysBetween(o.dispatch_date, today) : null;
    return d === null ? m : m === null ? d : Math.max(m, d);
  }, null);
  const monthStart = today.slice(0, 8) + "01";
  const thisMonth = remittances
    .filter((r) => r.date >= monthStart)
    .reduce((s, r) => s + r.amount, 0);

  function showToast(r: Result) {
    setToast(r);
    setTimeout(() => setToast(null), r.ok ? 2800 : 5000);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          COD remittance
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Match India Post / courier COD payments to your orders and see what is
          still owed to you.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div
          className={`rounded-2xl p-4 ring-1 ${owed > 0 ? "bg-amber-50 ring-amber-200" : "bg-white ring-stone-200"}`}
        >
          <div className="text-sm text-stone-600">Still owed to you</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">
            {rs(owed)}
          </div>
          <div className="mt-1 text-xs text-stone-500">
            {pending.length} delivered order{pending.length === 1 ? "" : "s"} ·
            ≈{rs(owedNet)} after COD fees
          </div>
        </div>
        <Kpi
          label="Out for delivery"
          value={rs(transit.amount)}
          sub={`${transit.count} dispatched COD orders`}
        />
        <Kpi
          label="Received this month"
          value={rs(thisMonth)}
          sub={`${remittances.filter((r) => r.date >= monthStart).length} remittances`}
        />
        <Kpi
          label="Oldest unpaid"
          value={
            oldest === null ? "–" : `${oldest} day${oldest === 1 ? "" : "s"}`
          }
          sub="Since dispatch"
          tone={oldest !== null && oldest > 15 ? "bad" : undefined}
        />
      </div>

      <RecordRemittance today={today} onToast={showToast} />

      <section className="rounded-2xl bg-white ring-1 ring-stone-200">
        <div className="flex gap-1 border-b border-stone-100 px-4 pt-3">
          {(
            [
              ["pending", `Waiting for payment (${pending.length})`],
              ["history", `Remittance history (${remittances.length})`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? "border-emerald-600 text-emerald-800" : "border-transparent text-stone-500 hover:text-stone-800"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "pending" ? (
          <PendingList orders={pending} today={today} />
        ) : (
          <History remittances={remittances} onToast={showToast} />
        )}
      </section>

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

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "bad";
}) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <div className="text-sm text-stone-500">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold tracking-tight ${tone === "bad" ? "text-red-600" : "text-stone-900"}`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-stone-500">{sub}</div>}
    </div>
  );
}

/* ---------------- Record a remittance ---------------- */

type Match = { orders: MatchedOrder[]; notFound: string[]; scanned: number };

function RecordRemittance({
  today,
  onToast,
}: {
  today: string;
  onToast: (r: Result) => void;
}) {
  const [text, setText] = useState("");
  const [match, setMatch] = useState<Match | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [markDelivered, setMarkDelivered] = useState(true);
  const [addToExpenses, setAddToExpenses] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finding, startFind] = useTransition();
  const [saving, startSave] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function problem(o: MatchedOrder): string | null {
    if (o.remittance_id) return "Already paid in an earlier remittance";
    if (o.payment_mode !== "cod" || o.order_type === "replacement")
      return "Not a COD order";
    if (o.cod_balance <= 0) return "Nothing to collect on this order";
    if (
      o.status === "rto" ||
      o.status === "returned" ||
      o.status === "cancelled"
    )
      return `Order is ${o.status.toUpperCase()}`;
    return null;
  }

  function find(source = text) {
    setError(null);
    startFind(async () => {
      const r = await matchTracking(source);
      if (!r.ok) {
        setMatch(null);
        return setError(r.message);
      }
      setMatch(r);
      setSelected(
        new Set(r.orders.filter((o) => !problem(o)).map((o) => o.id)),
      );
    });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setText(content.slice(0, 200_000));
    find(content);
    e.target.value = "";
  }

  const chosen = useMemo(
    () => (match?.orders ?? []).filter((o) => selected.has(o.id)),
    [match, selected],
  );
  const collected = chosen.reduce((s, o) => s + o.cod_balance, 0);
  const fees = chosen.reduce((s, o) => s + o.cod_fee, 0);
  const expected = collected - fees;
  const received = Number(amount) || 0;
  const diff = received - expected;

  function save() {
    setError(null);
    startSave(async () => {
      const r = await saveRemittance({
        orderIds: chosen.map((o) => o.id),
        date,
        amount: Math.round(received),
        reference,
        note,
        markDelivered,
        addToExpenses,
      });
      onToast(r);
      if (r.ok) {
        setText("");
        setMatch(null);
        setSelected(new Set());
        setAmount("");
        setReference("");
        setNote("");
      } else setError(r.message);
    });
  }

  const input =
    "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-stone-200">
      <h2 className="font-semibold">Record a remittance</h2>
      <p className="text-xs text-stone-500">
        Paste the tracking numbers from India Post&apos;s remittance list (copy
        the column from Excel, a PDF or WhatsApp), or upload a CSV / text file.
      </p>

      {!match ? (
        <div className="mt-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={"CX064397338IN\nCX064397341IN\nCX064397355IN\n…"}
            className={`${input} w-full font-mono`}
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => find()}
              disabled={finding || !text.trim()}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {finding ? "Finding orders…" : "Find orders →"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,.tsv,text/plain,text/csv"
              onChange={onFile}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-lg px-4 py-2 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50"
            >
              Upload CSV / text file
            </button>
            <span className="text-xs text-stone-400">
              Excel file? Open it, select the tracking column, copy and paste
              here.
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              onClick={() => setMatch(null)}
              className="text-stone-600 hover:text-stone-900"
            >
              ← Change list
            </button>
            <span className="text-stone-500">
              Found <b className="text-stone-800">{match.orders.length}</b>{" "}
              order{match.orders.length === 1 ? "" : "s"}
              {match.notFound.length > 0 && (
                <>
                  , <b className="text-amber-700">{match.notFound.length}</b>{" "}
                  tracking number{match.notFound.length === 1 ? "" : "s"} not
                  found
                </>
              )}
            </span>
          </div>

          {match.notFound.length > 0 && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
              <div className="font-medium">Not found in your orders:</div>
              <div className="mt-1 font-mono text-xs">
                {match.notFound.join(", ")}
              </div>
              <div className="mt-1 text-xs text-amber-700">
                Add the tracking ID to the right order in Orders, then try
                again.
              </div>
            </div>
          )}

          {match.orders.length > 0 && (
            <ul
              className="-mx-5 divide-y divide-stone-100 border-y border-stone-100 sm:hidden"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {match.orders.map((o) => {
                const p = problem(o);
                return (
                  <li key={o.id}>
                    <label
                      className={`flex items-start gap-3 px-5 py-2.5 ${p ? "bg-stone-50 text-stone-400" : ""}`}
                    >
                      <input
                        type="checkbox"
                        disabled={!!p}
                        checked={selected.has(o.id)}
                        onChange={() =>
                          setSelected((prev) => {
                            const n = new Set(prev);
                            if (n.has(o.id)) n.delete(o.id);
                            else n.add(o.id);
                            return n;
                          })
                        }
                        className="mt-1 size-4 accent-emerald-700"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex justify-between gap-2">
                          <span className="font-medium">
                            {o.order_code}{" "}
                            <span className="text-sm font-normal text-stone-500">
                              {o.customer_name}
                            </span>
                          </span>
                          <span className="font-semibold">
                            {rs(o.cod_balance)}
                          </span>
                        </span>
                        <span className="block text-xs">
                          <span className="font-mono">{o.tracking_id}</span> ·
                          fee {rs(o.cod_fee)} ·{" "}
                          {p ? (
                            <span className="text-amber-700">{p}</span>
                          ) : (
                            <span className="text-emerald-700">✓ Ready</span>
                          )}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {match.orders.length > 0 && (
            <div className="-mx-5 hidden overflow-x-auto sm:block">
              <table
                className="w-full min-w-[720px] text-sm"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                <thead>
                  <tr className="border-y border-stone-100 bg-stone-50 text-left text-xs font-medium uppercase tracking-wide text-stone-500">
                    <th className="w-10 px-5 py-2">
                      <input
                        type="checkbox"
                        className="size-4 accent-emerald-700"
                        checked={
                          chosen.length > 0 &&
                          chosen.length ===
                            match.orders.filter((o) => !problem(o)).length
                        }
                        onChange={(e) =>
                          setSelected(
                            new Set(
                              e.target.checked
                                ? match.orders
                                    .filter((o) => !problem(o))
                                    .map((o) => o.id)
                                : [],
                            ),
                          )
                        }
                        aria-label="Select all"
                      />
                    </th>
                    <th className="px-3 py-2">Order</th>
                    <th className="px-3 py-2">Tracking</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">COD</th>
                    <th className="px-3 py-2 text-right">COD fee</th>
                    <th className="px-5 py-2">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {match.orders.map((o) => {
                    const p = problem(o);
                    return (
                      <tr
                        key={o.id}
                        className={p ? "bg-stone-50 text-stone-400" : ""}
                      >
                        <td className="px-5 py-2">
                          <input
                            type="checkbox"
                            disabled={!!p}
                            checked={selected.has(o.id)}
                            onChange={() =>
                              setSelected((prev) => {
                                const n = new Set(prev);
                                if (n.has(o.id)) n.delete(o.id);
                                else n.add(o.id);
                                return n;
                              })
                            }
                            className="size-4 accent-emerald-700"
                            aria-label={`Include ${o.order_code}`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-stone-800">
                            {o.order_code}
                          </div>
                          <div className="text-xs text-stone-500">
                            {o.customer_name}
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {o.tracking_id}
                        </td>
                        <td className="px-3 py-2 capitalize">{o.status}</td>
                        <td className="px-3 py-2 text-right">
                          {rs(o.cod_balance)}
                        </td>
                        <td className="px-3 py-2 text-right text-stone-500">
                          {rs(o.cod_fee)}
                        </td>
                        <td className="px-5 py-2 text-xs">
                          {p ? (
                            <span className="text-amber-700">{p}</span>
                          ) : (
                            <span className="text-emerald-700">✓ Ready</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-stone-500">
                Amount received in bank
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-stone-400">
                    ₹
                  </span>
                  <input
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) =>
                      setAmount(e.target.value.replace(/[^\d]/g, ""))
                    }
                    placeholder={String(expected)}
                    className={`${input} w-full pl-7 text-base font-semibold`}
                  />
                </div>
              </label>
              <label className="text-xs font-medium text-stone-500">
                Date received
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={`${input} mt-1 w-full`}
                />
              </label>
              <label className="text-xs font-medium text-stone-500">
                Reference / UTR (optional)
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className={`${input} mt-1 w-full`}
                />
              </label>
              <label className="text-xs font-medium text-stone-500">
                Note (optional)
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className={`${input} mt-1 w-full`}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-stone-700 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={markDelivered}
                  onChange={(e) => setMarkDelivered(e.target.checked)}
                  className="size-4 accent-emerald-700"
                />
                Mark these orders as Delivered (if they still show Dispatched)
              </label>
              <label className="flex items-center gap-2 text-sm text-stone-700 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={addToExpenses}
                  onChange={(e) => setAddToExpenses(e.target.checked)}
                  className="size-4 accent-emerald-700"
                />
                Add to Expenses as &quot;COD remittance&quot; (money in)
              </label>
            </div>

            <div className="rounded-xl bg-stone-50 p-4 ring-1 ring-stone-200">
              <dl className="space-y-1.5 text-sm">
                <Row
                  label={`COD collected (${chosen.length} orders)`}
                  value={rs(collected)}
                />
                <Row label="COD fees" value={`−${rs(fees)}`} muted />
                <div className="border-t border-stone-200 pt-1.5">
                  <Row label="Expected" value={rs(expected)} strong />
                </div>
                <Row
                  label="Received"
                  value={amount ? rs(received) : "–"}
                  strong
                />
                {amount && (
                  <div
                    className={`mt-2 rounded-md px-2 py-1.5 text-center text-sm font-medium ${diff === 0 ? "bg-emerald-100 text-emerald-800" : diff < 0 ? "bg-red-100 text-red-700" : "bg-sky-100 text-sky-800"}`}
                  >
                    {diff === 0
                      ? "✓ Matches exactly"
                      : diff < 0
                        ? `${rs(-diff)} less than expected`
                        : `${rs(diff)} more than expected`}
                  </div>
                )}
              </dl>
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              <button
                onClick={save}
                disabled={saving || chosen.length === 0 || amount === ""}
                className="mt-4 w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {saving
                  ? "Saving…"
                  : `Save remittance (${chosen.length} orders)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className={muted ? "text-stone-500" : "text-stone-600"}>{label}</dt>
      <dd
        className={`${strong ? "font-semibold text-stone-900" : muted ? "text-stone-500" : "text-stone-800"}`}
      >
        {value}
      </dd>
    </div>
  );
}

/* ---------------- Waiting for payment ---------------- */

function PendingList({
  orders,
  today,
}: {
  orders: PendingOrder[];
  today: string;
}) {
  const { pageItems, pager } = usePaged(orders, "cod-pending", 25);
  if (!orders.length)
    return (
      <p className="px-5 py-10 text-center text-sm text-stone-500">
        Nothing pending. Every delivered COD order has been paid. 🎉
      </p>
    );
  const waitChip = (days: number) => (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${days > 15 ? "bg-red-100 text-red-700" : days > 7 ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-600"}`}
    >
      {days} day{days === 1 ? "" : "s"}
    </span>
  );
  return (
    <>
      <ul
        className="divide-y divide-stone-100 sm:hidden"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {pageItems.map((o) => {
          const days = o.dispatch_date
            ? daysBetween(o.dispatch_date, today)
            : null;
          return (
            <li key={o.id} className="px-5 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-stone-800">
                  {o.order_code}{" "}
                  <span className="text-sm font-normal text-stone-500">
                    {o.customer_name}
                  </span>
                </span>
                <span className="font-semibold">{rs(o.cod_balance)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500">
                <span className="font-mono">
                  {o.tracking_id ?? "no tracking"}
                </span>
                {o.dispatch_date && <span>· sent {dmy(o.dispatch_date)}</span>}
                {days !== null && waitChip(days)}
              </div>
            </li>
          );
        })}
        <li className="flex justify-between bg-stone-50 px-5 py-3 font-semibold">
          <span>Total ({orders.length})</span>
          <span>{rs(orders.reduce((s, o) => s + o.cod_balance, 0))}</span>
        </li>
      </ul>
      <div className="hidden overflow-x-auto sm:block">
        <table
          className="w-full min-w-[640px] text-sm"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          <thead>
            <tr className="bg-stone-50 text-left text-xs font-medium uppercase tracking-wide text-stone-500">
              <th className="px-5 py-2">Order</th>
              <th className="px-3 py-2">Tracking</th>
              <th className="px-3 py-2">Dispatched</th>
              <th className="px-3 py-2">Waiting</th>
              <th className="px-5 py-2 text-right">COD</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {pageItems.map((o) => {
              const days = o.dispatch_date
                ? daysBetween(o.dispatch_date, today)
                : null;
              return (
                <tr key={o.id}>
                  <td className="px-5 py-2">
                    <div className="font-medium text-stone-800">
                      {o.order_code}
                    </div>
                    <div className="text-xs text-stone-500">
                      {o.customer_name}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-stone-600">
                    {o.tracking_id ?? "–"}
                  </td>
                  <td className="px-3 py-2 text-stone-600">
                    {o.dispatch_date ? dmy(o.dispatch_date) : "–"}
                  </td>
                  <td className="px-3 py-2">
                    {days === null ? (
                      "–"
                    ) : (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${days > 15 ? "bg-red-100 text-red-700" : days > 7 ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-600"}`}
                      >
                        {days} day{days === 1 ? "" : "s"}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-2 text-right font-medium">
                    {rs(o.cod_balance)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-stone-200 bg-stone-50 font-semibold">
              <td className="px-5 py-2.5" colSpan={4}>
                Total ({orders.length})
              </td>
              <td className="px-5 py-2.5 text-right">
                {rs(orders.reduce((s, o) => s + o.cod_balance, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    <Pager {...pager} noun="orders" className="border-t border-stone-100 px-5 py-3" />
    </>
  );
}

/* ---------------- History ---------------- */

function History({
  remittances,
  onToast,
}: {
  remittances: Remittance[];
  onToast: (r: Result) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!remittances.length)
    return (
      <p className="px-5 py-10 text-center text-sm text-stone-500">
        No remittances recorded yet.
      </p>
    );

  return (
    <ul className="divide-y divide-stone-100">
      {remittances.map((r) => {
        const diff = r.amount - r.expected;
        return (
          <li key={r.id}>
            <button
              onClick={() => setOpen(open === r.id ? null : r.id)}
              className="flex w-full flex-wrap items-center gap-x-5 gap-y-1 px-5 py-3 text-left hover:bg-stone-50"
            >
              <span
                className={`text-stone-400 transition ${open === r.id ? "rotate-90" : ""}`}
              >
                ▸
              </span>
              <span className="w-24 text-sm text-stone-600">
                {shortDate(r.date)}
              </span>
              <span className="text-lg font-semibold">{rs(r.amount)}</span>
              <span className="text-sm text-stone-500">
                {r.orders.length} orders
              </span>
              {r.reference && (
                <span className="font-mono text-xs text-stone-500">
                  {r.reference}
                </span>
              )}
              <span
                className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${diff === 0 ? "bg-emerald-100 text-emerald-800" : diff < 0 ? "bg-red-100 text-red-700" : "bg-sky-100 text-sky-800"}`}
              >
                {diff === 0
                  ? "✓ Matched"
                  : diff < 0
                    ? `${rs(-diff)} short`
                    : `${rs(diff)} extra`}
              </span>
            </button>
            {open === r.id && (
              <div className="bg-stone-50 px-5 pb-4 pt-1">
                <div className="mb-2 text-xs text-stone-500">
                  Expected {rs(r.expected)} · Received {rs(r.amount)}
                  {r.note ? ` · ${r.note}` : ""}
                </div>
                <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {r.orders.map((o) => (
                    <div key={o.id} className="flex justify-between gap-2">
                      <span className="truncate">
                        <b className="font-medium">{o.order_code}</b>{" "}
                        <span className="text-stone-500">
                          {o.customer_name}
                        </span>
                      </span>
                      <span>{rs(o.cod_balance)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3">
                  {confirm === r.id ? (
                    <span className="flex items-center gap-2 text-sm">
                      <span className="text-red-700">
                        Remove this remittance? Its orders go back to “waiting
                        for payment”.
                      </span>
                      <button
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () =>
                            onToast(await undoRemittance(r.id)),
                          )
                        }
                        className="rounded-md bg-red-600 px-2.5 py-1 font-medium text-white hover:bg-red-700"
                      >
                        Yes, remove
                      </button>
                      <button
                        onClick={() => setConfirm(null)}
                        className="rounded-md px-2 py-1 text-stone-500 hover:bg-stone-100"
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirm(r.id)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Undo this remittance
                    </button>
                  )}
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
