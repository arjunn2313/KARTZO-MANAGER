"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Pager, usePaged } from "@/components/pager";
import {
  spendByDay,
  type Period,
  type Reading,
  type Recharge,
} from "@/lib/ad-wallet";
import { shiftDays } from "@/lib/dashboard";
import {
  addRecharge,
  deleteReading,
  deleteRecharge,
  saveReading,
  setAdGst,
  type Result,
} from "./actions";

const rs = (n: number) =>
  (n < 0 ? "−" : "") + "₹" + Math.abs(Math.round(n)).toLocaleString("en-IN");
const dmy = (iso: string) => iso.split("-").reverse().join("-");
const short = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    weekday: "short",
    timeZone: "UTC",
  });
const input =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";

export function AdsView({
  today,
  all,
  readings,
  recharges,
  periods,
  gst,
}: {
  today: string;
  all: boolean;
  readings: Reading[];
  recharges: Recharge[];
  periods: Period[];
  gst: number;
}) {
  const [toast, setToast] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<Result>, after?: () => void) {
    startTransition(async () => {
      const r = await fn();
      setToast(r);
      setTimeout(() => setToast(null), r.ok ? 2200 : 5000);
      if (r.ok) after?.();
    });
  }

  /* ----- stats ----- */
  const byDay = useMemo(() => spendByDay(periods), [periods]);
  const sumDays = (n: number) => {
    let s = 0;
    let known = 0;
    for (let i = 1; i <= n; i++) {
      const v = byDay.get(shiftDays(today, -i));
      if (v !== undefined) {
        s += v;
        known++;
      }
    }
    return { s, known };
  };
  const yesterday = byDay.get(shiftDays(today, -1));
  const w7 = sumDays(7);
  const w30 = sumDays(30);

  const newestFirst = useMemo(() => [...periods].reverse(), [periods]);
  const { pageItems, pager } = usePaged(newestFirst, "ads-days", 30);
  const sortedReadings = [...readings].sort((a, b) =>
    a.date < b.date ? 1 : -1,
  );
  const last = sortedReadings[0];
  const openNow = last
    ? recharges
        .filter((r) => r.date >= last.date)
        .reduce((s, r) => s + r.amount, 0)
    : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ad wallet</h1>
          <p className="mt-1 text-sm text-stone-500">
            Every morning, type the Meta wallet balance <b>before</b> you
            recharge. Spend = yesterday&apos;s balance + recharges −
            today&apos;s balance. It goes into the dashboard automatically.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <BalanceCard
          today={today}
          readings={readings}
          recharges={recharges}
          gst={gst}
          pending={pending}
          run={run}
        />
        <RechargeCard today={today} gst={gst} pending={pending} run={run} />

        <section className="rounded-2xl bg-white p-5 ring-1 ring-stone-200">
          <h2 className="font-semibold">Ad spend</h2>
          <dl className="mt-3 space-y-2.5 text-sm">
            <Stat
              label="Yesterday"
              value={yesterday !== undefined ? rs(yesterday) : "—"}
              hint={
                yesterday === undefined
                  ? "Needs this morning's balance"
                  : undefined
              }
            />
            <Stat
              label="Last 7 days"
              value={rs(w7.s)}
              hint={
                w7.known < 7
                  ? `${w7.known} of 7 days known`
                  : `${rs(w7.s / 7)} a day`
              }
            />
            <Stat
              label="Last 30 days"
              value={rs(w30.s)}
              hint={
                w30.known < 30
                  ? `${w30.known} of 30 days known`
                  : `${rs(w30.s / 30)} a day`
              }
            />
          </dl>
          <label className="mt-4 flex items-start gap-2 rounded-lg bg-stone-50 p-3 text-sm text-stone-700 ring-1 ring-stone-200">
            <input
              type="checkbox"
              checked={gst > 0}
              disabled={pending}
              onChange={(e) => run(() => setAdGst(e.target.checked ? 18 : 0))}
              className="mt-0.5 size-4 accent-emerald-700"
            />
            <span>
              My recharge amount includes <b>18% GST</b>
              <span className="mt-0.5 block text-xs text-stone-500">
                Tick if paying ₹1,180 puts only ₹1,000 in the wallet (check your
                Meta receipt). Spend then includes the GST you paid.
              </span>
            </span>
          </label>
        </section>
      </div>

      {/* Spend history */}
      <section className="rounded-2xl bg-white ring-1 ring-stone-200">
        <div className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-5 py-3">
          <h2 className="font-semibold">Daily spend</h2>
          <span className="text-xs text-stone-500">
            {all ? "All time" : "Last 60 days"}
          </span>
          <Link
            href={all ? "/ads" : "/ads?show=all"}
            className="ml-auto text-sm text-emerald-700 hover:underline"
          >
            {all ? "Show last 60 days" : "Show all"}
          </Link>
        </div>
        {/* Phones */}
        <ul
          className="divide-y divide-stone-100 sm:hidden"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {last && (
            <li className="bg-emerald-50/40 px-5 py-3">
              <div className="flex justify-between gap-3">
                <span className="font-medium">
                  {last.date === today
                    ? "Today"
                    : `${short(last.date)} → today`}
                </span>
                <span className="text-stone-400">running…</span>
              </div>
              <div className="mt-0.5 text-xs text-stone-500">
                Opened {rs(last.balance)}
                {openNow ? ` + ${rs(openNow)} recharge` : ""}. Type tomorrow
                morning&apos;s balance to get the spend.
              </div>
            </li>
          )}
          {pageItems.map((p) => {
            const bad = p.metaSpend < 0;
            return (
              <li
                key={p.from}
                className={`px-5 py-3 ${bad ? "bg-red-50/50" : ""}`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-stone-800">
                    {p.days === 1
                      ? short(p.from)
                      : `${short(p.from)} – ${short(p.to)}`}
                  </span>
                  <span
                    className={`text-base font-semibold ${bad ? "text-red-600" : ""}`}
                  >
                    {rs(gst ? p.cost : p.metaSpend)}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-stone-500">
                  {rs(p.opening)}
                  {p.rechargePaid
                    ? ` + ${rs(gst ? p.rechargeCredited : p.rechargePaid)}`
                    : ""}{" "}
                  − {rs(p.closing)}
                  {gst > 0 && ` · Meta ${rs(p.metaSpend)} + GST`}
                </div>
                {p.days > 1 && (
                  <div className="text-xs text-amber-700">
                    {p.days} days, split evenly
                  </div>
                )}
                {bad && (
                  <div className="text-xs text-red-700">
                    Balance went up more than the recharges. Is a recharge
                    missing?
                  </div>
                )}
              </li>
            );
          })}
          {!last && (
            <li className="px-5 py-10 text-center text-sm text-stone-500">
              No balances yet. Type this morning&apos;s wallet balance above to
              start.
            </li>
          )}
        </ul>

        <div className="hidden overflow-x-auto sm:block">
          <table
            className="w-full min-w-[720px] text-sm"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            <thead>
              <tr className="bg-stone-50 text-left text-xs font-medium uppercase tracking-wide text-stone-500">
                <th className="px-5 py-2.5">Day</th>
                <th className="px-3 py-2.5 text-right">Morning balance</th>
                <th className="px-3 py-2.5 text-right">+ Recharge</th>
                <th className="px-3 py-2.5 text-right">− Next morning</th>
                <th className="px-3 py-2.5 text-right">
                  {gst ? "Meta spend" : "Spend"}
                </th>
                {gst > 0 && (
                  <th className="px-5 py-2.5 text-right">Cost incl. GST</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {last && (
                <tr className="bg-emerald-50/40">
                  <td className="px-5 py-2.5">
                    <div className="font-medium">
                      {last.date === today
                        ? "Today"
                        : `${short(last.date)} → today`}
                    </div>
                    <div className="text-xs text-stone-500">
                      Running. Type tomorrow morning&apos;s balance to get the
                      spend.
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">{rs(last.balance)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {openNow ? (
                      rs(openNow)
                    ) : (
                      <span className="text-stone-300">–</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-stone-400">?</td>
                  <td className="px-3 py-2.5 text-right text-stone-400">…</td>
                  {gst > 0 && (
                    <td className="px-5 py-2.5 text-right text-stone-400">…</td>
                  )}
                </tr>
              )}
              {pageItems.map((p) => {
                const bad = p.metaSpend < 0;
                return (
                  <tr
                    key={p.from}
                    className={bad ? "bg-red-50/50" : "hover:bg-stone-50/60"}
                  >
                    <td className="px-5 py-2.5">
                      <div className="font-medium text-stone-800">
                        {p.days === 1
                          ? short(p.from)
                          : `${short(p.from)} – ${short(p.to)}`}
                      </div>
                      {p.days > 1 && (
                        <div className="text-xs text-amber-700">
                          {p.days} days (a morning was skipped), split evenly
                        </div>
                      )}
                      {bad && (
                        <div className="text-xs text-red-700">
                          Balance went up more than the recharges. Is a recharge
                          missing?
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">{rs(p.opening)}</td>
                    <td className="px-3 py-2.5 text-right">
                      {p.rechargePaid ? (
                        <span
                          title={p.recharges
                            .map(
                              (r) =>
                                `${dmy(r.date)}: ${rs(r.amount)}${r.note ? ` (${r.note})` : ""}`,
                            )
                            .join("\n")}
                        >
                          {rs(p.rechargePaid)}
                          {gst > 0 && (
                            <span className="block text-[11px] text-stone-400">
                              {rs(p.rechargeCredited)} to wallet
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-stone-300">–</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">{rs(p.closing)}</td>
                    <td
                      className={`px-3 py-2.5 text-right font-semibold ${bad ? "text-red-600" : ""}`}
                    >
                      {rs(p.metaSpend)}
                    </td>
                    {gst > 0 && (
                      <td
                        className={`px-5 py-2.5 text-right font-semibold ${bad ? "text-red-600" : ""}`}
                      >
                        {rs(p.cost)}
                      </td>
                    )}
                  </tr>
                );
              })}
              {!last && (
                <tr>
                  <td
                    colSpan={gst ? 6 : 5}
                    className="px-5 py-10 text-center text-stone-500"
                  >
                    No balances yet. Type this morning&apos;s wallet balance
                    above to start. Spend shows from tomorrow.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager {...pager} noun="days" className="border-t border-stone-100 px-5 py-3" />
      </section>

      {/* Raw entries, for fixing mistakes */}
      <div className="grid gap-4 lg:grid-cols-2">
        <EntryList
          title="Morning balances"
          empty="No balances yet."
          rows={sortedReadings.map((r) => ({
            key: r.date,
            left: short(r.date),
            right: rs(r.balance),
          }))}
          onDelete={(key) => run(() => deleteReading(key))}
          disabled={pending}
        />
        <EntryList
          title="Recharges"
          note="Also listed on the Expenses page under Ads wallet."
          empty="No recharges in this period."
          rows={[...recharges]
            .sort((a, b) => (a.date < b.date ? 1 : -1))
            .map((r) => ({
              key: r.id!,
              left: short(r.date) + (r.note ? ` · ${r.note}` : ""),
              right: rs(r.amount),
            }))}
          onDelete={(key) => run(() => deleteRecharge(key))}
          disabled={pending}
        />
      </div>

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

type Run = (fn: () => Promise<Result>, after?: () => void) => void;

function BalanceCard({
  today,
  readings,
  recharges,
  gst,
  pending,
  run,
}: {
  today: string;
  readings: Reading[];
  recharges: Recharge[];
  gst: number;
  pending: boolean;
  run: Run;
}) {
  const [date, setDate] = useState(today);
  const existing = readings.find((r) => r.date === date);
  const [text, setText] = useState(existing ? String(existing.balance) : "");
  const [shownFor, setShownFor] = useState(date);
  if (shownFor !== date) {
    // switching date shows that day's saved balance (if any)
    setShownFor(date);
    setText(existing ? String(existing.balance) : "");
  }

  const prev = [...readings]
    .filter((r) => r.date < date)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const bal = text === "" ? null : Number(text);
  const between = prev
    ? recharges
        .filter((r) => r.date >= prev.date && r.date < date)
        .reduce((s, r) => s + r.amount, 0)
    : 0;
  const g = gst / 100;
  const meta =
    prev && bal !== null ? prev.balance + between / (1 + g) - bal : null;

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-stone-200">
      <h2 className="font-semibold">Morning balance</h2>
      <p className="text-xs text-stone-500">
        Before recharging. Shown in Ads Manager → Billing.
      </p>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (bal === null) return;
          run(() => saveReading({ date, balance: bal }));
        }}
      >
        <div className="grid grid-cols-2 gap-2">
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
            Wallet balance
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-stone-400">
                ₹
              </span>
              <input
                inputMode="numeric"
                value={text}
                onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="700"
                className={`${input} pl-7 text-base font-semibold`}
              />
            </div>
          </label>
        </div>

        {meta !== null && prev && (
          <div
            className={`rounded-lg p-3 text-sm ring-1 ${meta < 0 ? "bg-red-50 ring-red-200" : "bg-emerald-50 ring-emerald-200"}`}
          >
            <div className="text-xs text-stone-500">
              Spend{" "}
              {shiftDays(prev.date, 1) === date
                ? `on ${short(prev.date)}`
                : `from ${short(prev.date)} to ${short(shiftDays(date, -1))}`}
            </div>
            <div
              className="mt-0.5 font-medium"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {rs(prev.balance)} + {rs(gst ? between / (1 + g) : between)} −{" "}
              {rs(bal!)} = <b className="text-base">{rs(meta)}</b>
            </div>
            {gst > 0 && (
              <div className="text-xs text-stone-500">
                With {gst}% GST: {rs(meta * (1 + g))}
              </div>
            )}
            {meta < 0 && (
              <div className="mt-1 text-xs text-red-700">
                Below zero. Add the missing recharge first.
              </div>
            )}
          </div>
        )}
        {!prev && (
          <p className="text-xs text-stone-500">
            This is your first balance. Spend starts showing from the next
            morning.
          </p>
        )}

        <button
          disabled={pending || bal === null}
          className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {existing ? "Update balance" : "Save balance"}
        </button>
      </form>
    </section>
  );
}

function RechargeCard({
  today,
  gst,
  pending,
  run,
}: {
  today: string;
  gst: number;
  pending: boolean;
  run: Run;
}) {
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const n = Number(amount) || 0;

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-stone-200">
      <h2 className="font-semibold">Add recharge</h2>
      <p className="text-xs text-stone-500">The amount you paid to Meta.</p>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => addRecharge({ date, amount: n, note }),
            () => {
              setAmount("");
              setNote("");
            },
          );
        }}
      >
        <div className="grid grid-cols-2 gap-2">
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
            Amount paid
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
                placeholder="1200"
                className={`${input} pl-7 text-base font-semibold`}
              />
            </div>
          </label>
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional), e.g. UPI"
          className={input}
        />
        {gst > 0 && n > 0 && (
          <p className="text-xs text-stone-500">
            About {rs(n / (1 + gst / 100))} goes into the wallet after {gst}%
            GST.
          </p>
        )}
        <button
          disabled={pending || n <= 0}
          className="w-full rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
        >
          Add recharge
        </button>
      </form>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-stone-600">{label}</dt>
      <dd className="text-right">
        <span
          className="text-lg font-semibold"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {value}
        </span>
        {hint && (
          <span className="block text-[11px] text-stone-400">{hint}</span>
        )}
      </dd>
    </div>
  );
}

function EntryList({
  title,
  note,
  empty,
  rows,
  onDelete,
  disabled,
}: {
  title: string;
  note?: string;
  empty: string;
  rows: { key: string; left: string; right: string }[];
  onDelete: (key: string) => void;
  disabled: boolean;
}) {
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <section className="rounded-2xl bg-white ring-1 ring-stone-200">
      <div className="border-b border-stone-100 px-5 py-3">
        <h2 className="font-semibold">{title}</h2>
        {note && <p className="text-xs text-stone-500">{note}</p>}
      </div>
      <ul className="max-h-80 divide-y divide-stone-100 overflow-y-auto text-sm">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-3 px-5 py-2">
            <span className="flex-1 truncate text-stone-700">{r.left}</span>
            <span
              className="font-medium"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {r.right}
            </span>
            {confirm === r.key ? (
              <span className="flex gap-2 text-xs">
                <button
                  disabled={disabled}
                  onClick={() => {
                    onDelete(r.key);
                    setConfirm(null);
                  }}
                  className="font-semibold text-red-600 hover:underline"
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirm(null)}
                  className="text-stone-500 hover:underline"
                >
                  Keep
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirm(r.key)}
                className="text-stone-300 hover:text-red-600"
                aria-label="Delete"
              >
                ✕
              </button>
            )}
          </li>
        ))}
        {!rows.length && (
          <li className="px-5 py-6 text-center text-stone-400">{empty}</li>
        )}
      </ul>
    </section>
  );
}
