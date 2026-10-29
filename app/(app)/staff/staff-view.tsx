"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CHART, rs, shortDate } from "@/components/charts/chart-utils";
import { WeekChart } from "@/components/charts/week-chart";
import { saveStaffDay, setStaffPay, setWeekPaid, type Result } from "./actions";
import { ReceiptDialog, type Business } from "./receipt";
import { StaffLink } from "./staff-link";

export type StaffDay = {
  date: string;
  amount: number;
  bonus: number;
  bonusNote: string | null;
  ordersTaken: number | null;
  /** her orders that count for pay (dispatched / delivered / RTO / returned) */
  dispatched: number;
  /** her orders not dispatched yet (will count once dispatched) */
  waiting: number;
  /** orders you took yourself */
  mine: number;
  /** amount is worked out from orders (not typed) */
  auto: boolean;
  paid: boolean;
  paidDate: string | null;
  /** how much this day was worth when it was paid (null = paid before this was tracked) */
  paidAmount: number | null;
  future: boolean;
  /** her paid orders that day by product (a combo order is one entry: "A + B") */
  products: { name: string; orders: number }[];
};
export type Week = {
  start: string;
  end: string;
  days: StaffDay[];
  current: boolean;
  products: { name: string; orders: number; pieces: number }[];
};
export type PaySettings = { ready: boolean; rate: number; autoFrom: string };

const weekday = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", {
    weekday: "short",
    timeZone: "UTC",
  });

function weekInfo(w: Week) {
  const worked = w.days.filter((d) => d.amount > 0 || d.bonus > 0);
  const pay = (d: StaffDay) => d.amount + d.bonus;
  const total = worked.reduce((s, d) => s + pay(d), 0);
  const bonus = worked.reduce((s, d) => s + d.bonus, 0);
  // a paid day can still owe money if more of her orders were added after paying
  const due = (d: StaffDay) =>
    !d.paid
      ? pay(d)
      : d.paidAmount === null
        ? 0
        : Math.max(0, pay(d) - d.paidAmount);
  const unpaid = worked.reduce((s, d) => s + due(d), 0);
  const orders = w.days.reduce(
    (s, d) => s + (d.auto ? d.dispatched : (d.ordersTaken ?? 0)),
    0,
  );
  const waiting = w.days.reduce((s, d) => s + d.waiting, 0);
  const mine = w.days.reduce((s, d) => s + d.mine, 0);
  const paidDate = worked.find((d) => d.paid)?.paidDate ?? null;
  const state: "empty" | "paid" | "unpaid" | "partial" = !worked.length
    ? "empty"
    : unpaid === 0
      ? "paid"
      : unpaid === total
        ? "unpaid"
        : "partial";
  return {
    worked: worked.filter((d) => d.amount > 0).length,
    total,
    bonus,
    unpaid,
    orders,
    waiting,
    mine,
    paidDate,
    state,
  };
}

export function StaffView({
  weeks,
  today,
  shownWeeks,
  business,
  pay,
  linkToken,
}: {
  weeks: Week[];
  today: string;
  shownWeeks: number;
  business: Business;
  pay: PaySettings;
  linkToken?: string;
}) {
  const [open, setOpen] = useState<string | null>(weeks[0]?.start ?? null);
  const [receipt, setReceipt] = useState<Week | null>(null);
  const [toast, setToast] = useState<Result | null>(null);

  const infos = weeks.map(weekInfo);
  const toPay = infos.reduce((s, i) => s + i.unpaid, 0);
  const paidTotal = infos.reduce((s, i) => s + (i.total - i.unpaid), 0);
  const daysWorked = infos.reduce((s, i) => s + i.worked, 0);
  const allTotal = infos.reduce((s, i) => s + i.total, 0);
  const thisWeek = infos[0];

  const series = [
    { key: "paid", name: "Paid", color: CHART.series[0] },
    { key: "unpaid", name: "Not paid yet", color: CHART.series[1] },
  ];
  // per day: what's been paid and what's still due (same rule as the week totals)
  const dayValues = weeks.flatMap((w) =>
    w.days.map((d) => {
      const pay = d.amount + d.bonus;
      const due = !d.paid ? pay : d.paidAmount === null ? 0 : Math.max(0, pay - d.paidAmount);
      return { date: d.date, values: { paid: pay - due, unpaid: due } };
    }),
  );

  function showToast(r: Result) {
    setToast(r);
    setTimeout(() => setToast(null), r.ok ? 2500 : 5000);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Staff payouts</h1>
        <p className="mt-1 text-sm text-stone-500">
          Weekly totals, Sunday to Saturday.{" "}
          {pay.ready
            ? "Pay is counted from the orders automatically; add any bonus here."
            : "Enter each day's amount and any bonus here."}{" "}
          Both are included in net profit.
        </p>
      </div>

      <PayRule
        pay={pay}
        staffName={business.staffName || "Staff"}
        onToast={showToast}
      />

      <StaffLink
        token={linkToken}
        staffName={business.staffName || "Staff"}
        onToast={showToast}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div
          className={`rounded-2xl p-4 ring-1 ${toPay > 0 ? "bg-amber-50 ring-amber-200" : "bg-white ring-stone-200"}`}
        >
          <div className="text-sm text-stone-600">To pay now</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
            {rs(toPay)}
          </div>
          <div className="mt-1 text-xs text-stone-500">
            {toPay > 0 ? "Not marked paid yet" : "Everything is paid"}
          </div>
        </div>
        <Kpi
          label="This week so far"
          value={rs(thisWeek?.total ?? 0)}
          sub={`${thisWeek?.orders ?? 0} orders${thisWeek?.waiting ? ` · ${thisWeek.waiting} waiting to dispatch` : ""}`}
        />
        <Kpi label={`Paid (last ${shownWeeks} weeks)`} value={rs(paidTotal)} />
        <Kpi
          label="Average per working day"
          value={rs(daysWorked ? allTotal / daysWorked : 0)}
          sub={`${daysWorked} days worked`}
        />
      </div>

<WeekChart
        title="Staff pay"
        series={series}
        weeks={weeks.map((w) => w.start)}
        days={dayValues}
        currentWeek={weeks.find((w) => w.current)?.start ?? weeks[0]?.start ?? today}
      />

      <div className="space-y-3">
        {weeks.map((w, idx) => (
          <WeekCard
            key={w.start}
            week={w}
            info={infos[idx]}
            today={today}
            open={open === w.start}
            onToggle={() => setOpen(open === w.start ? null : w.start)}
            onToast={showToast}
            onReceipt={() => setReceipt(w)}
            rate={pay.rate}
            staffName={business.staffName || "Staff"}
          />
        ))}
      </div>

      {shownWeeks < 52 && (
        <div className="text-center">
          <Link
            href={`/staff?weeks=${Math.min(52, shownWeeks + 8)}`}
            scroll={false}
            className="text-sm font-medium text-emerald-700 hover:underline"
          >
            Show older weeks
          </Link>
        </div>
      )}

      {!business.ready && (
        <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          Run <b>DATABASE-UPDATE-7.sql</b> in Supabase to turn on bonuses and
          receipt details.
        </p>
      )}

      {receipt && (
        <ReceiptDialog
          week={receipt}
          business={business}
          today={today}
          onClose={() => setReceipt(null)}
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

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <div className="text-sm text-stone-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-stone-500">{sub}</div>}
    </div>
  );
}

function WeekCard({
  week,
  info,
  today,
  open,
  onToggle,
  onToast,
  onReceipt,
  rate,
  staffName,
}: {
  week: Week;
  info: ReturnType<typeof weekInfo>;
  today: string;
  open: boolean;
  onToggle: () => void;
  onToast: (r: Result) => void;
  onReceipt: () => void;
  rate: number;
  staffName: string;
}) {
  const [recordExpense, setRecordExpense] = useState(true);
  const [bonusOpen, setBonusOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const label = `${shortDate(week.start)} – ${shortDate(week.end)}`;
  const finished = week.end < today;

  function mark(paid: boolean) {
    startTransition(async () => {
      onToast(
        await setWeekPaid({
          from: week.start,
          to: week.end,
          paid,
          recordExpense,
          label,
        }),
      );
    });
  }

  const badge = {
    empty: null,
    paid: (
      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
        ✓ Paid{info.paidDate ? ` on ${shortDate(info.paidDate)}` : ""}
      </span>
    ),
    unpaid: (
      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
        Not paid
      </span>
    ),
    partial: (
      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
        Partly paid · {rs(info.unpaid)} due
      </span>
    ),
  }[info.state];

  return (
    <section
      className={`rounded-2xl bg-white ring-1 ${info.state === "unpaid" && finished ? "ring-amber-300" : "ring-stone-200"}`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
        <button
          onClick={onToggle}
          className="flex min-w-[180px] items-center gap-2 text-left"
        >
          <span
            className={`text-stone-400 transition ${open ? "rotate-90" : ""}`}
          >
            ▸
          </span>
          <span>
            <span className="block font-semibold text-stone-900">
              {label}
              {week.current && (
                <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                  THIS WEEK
                </span>
              )}
            </span>
            <span className="text-xs text-stone-500">
              {info.orders} order{info.orders === 1 ? "" : "s"} by {staffName}
              {info.waiting > 0 && ` · ${info.waiting} waiting`}
              {info.mine > 0 && ` · ${info.mine} by you`}
            </span>
          </span>
        </button>
        <div>
          <div className="text-xl font-semibold tracking-tight">
            {rs(info.total)}
          </div>
          {info.bonus > 0 && (
            <div className="text-xs text-emerald-700">
              incl. {rs(info.bonus)} bonus
            </div>
          )}
        </div>
        {badge}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <button
            onClick={() => setBonusOpen(true)}
            className="rounded-lg px-3 py-2 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50"
          >
            + Bonus
          </button>
          {info.total > 0 && (
            <button
              onClick={onReceipt}
              className="rounded-lg px-3 py-2 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50"
            >
              Receipt
            </button>
          )}
          {(info.state === "unpaid" || info.state === "partial") && (
            <>
              <label
                className="flex items-center gap-1.5 text-xs text-stone-600"
                title="Adds a 'Staff salary' cash-out entry in Expenses"
              >
                <input
                  type="checkbox"
                  checked={recordExpense}
                  onChange={(e) => setRecordExpense(e.target.checked)}
                  className="size-3.5 accent-emerald-700"
                />
                Add to Expenses
              </label>
              <button
                onClick={() => mark(true)}
                disabled={pending}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {pending ? "Saving…" : `Mark ${rs(info.unpaid)} paid`}
              </button>
            </>
          )}
          {info.state === "paid" && (
            <button
              onClick={() => mark(false)}
              disabled={pending}
              className="rounded-md px-2 py-1 text-xs text-stone-500 hover:bg-stone-100"
            >
              Undo paid
            </button>
          )}
        </div>
      </div>

      {week.products.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-stone-100 px-4 py-2.5 text-xs">
          <span className="text-stone-500">{staffName}&apos;s orders:</span>
          {week.products.map((p) => (
            <span
              key={p.name}
              className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-700"
            >
              {p.name}{" "}
              <b className="font-semibold text-stone-900">{p.orders}</b>
              {p.pieces !== p.orders && (
                <span className="text-stone-500"> ({p.pieces} pcs)</span>
              )}
            </span>
          ))}
        </div>
      )}

      {bonusOpen && (
        <BonusDialog
          week={week}
          today={today}
          onClose={() => setBonusOpen(false)}
          onToast={onToast}
        />
      )}

      {open && (
        <div className="overflow-x-auto border-t border-stone-100">
          <table
            className="block w-full text-sm sm:table sm:min-w-[560px]"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            <thead className="hidden sm:table-header-group">
              <tr className="bg-stone-50 text-left text-xs font-medium uppercase tracking-wide text-stone-500">
                <th className="px-4 py-2">Day</th>
                <th className="px-3 py-2">Orders taken</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Bonus</th>
                <th className="px-4 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="block divide-y divide-stone-100 sm:table-row-group">
              {week.days.map((d) => (
                <DayRow
                  key={`${d.date}-${d.amount}-${d.bonus}-${d.bonusNote ?? ""}`}
                  day={d}
                  today={today}
                  onToast={onToast}
                  rate={rate}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DayRow({
  day: d,
  today,
  onToast,
  rate,
}: {
  day: StaffDay;
  today: string;
  onToast: (r: Result) => void;
  rate: number;
}) {
  const [amount, setAmount] = useState(d.amount ? String(d.amount) : "");
  const [orders, setOrders] = useState(
    d.ordersTaken !== null ? String(d.ordersTaken) : "",
  );
  const [bonus, setBonus] = useState(d.bonus ? String(d.bonus) : "");
  const [bonusNote, setBonusNote] = useState(d.bonusNote ?? "");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    const a = Math.round(Number(amount) || 0);
    const o = orders === "" ? null : Math.round(Number(orders) || 0);
    const b = Math.round(Number(bonus) || 0);
    const bonusChanged =
      b !== d.bonus || (bonusNote.trim() || null) !== (d.bonusNote ?? null);
    if (
      d.auto
        ? !bonusChanged
        : a === d.amount && o === d.ordersTaken && !bonusChanged
    )
      return;
    startTransition(async () => {
      const r = await saveStaffDay({
        date: d.date,
        // automatic days: the amount comes from the orders, only the bonus is typed
        ...(d.auto ? {} : { staff_amount: a, staff_orders_taken: o }),
        // only send bonus fields when they changed (works before DATABASE-UPDATE-7 too)
        ...(bonusChanged
          ? { staff_bonus: b, staff_bonus_note: bonusNote }
          : {}),
      });
      if (!r.ok) onToast(r);
      else {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }
    });
  }

  const box = `rounded-md border bg-white py-1 text-right text-sm outline-none focus:ring-2 disabled:bg-stone-50 ${
    saved
      ? "border-emerald-500 focus:ring-emerald-600/20"
      : "border-stone-200 focus:border-emerald-600 focus:ring-emerald-600/20"
  } ${pending ? "opacity-60" : ""}`;

  return (
    <tr
      className={`grid grid-cols-3 items-end gap-x-2 gap-y-1.5 px-4 py-2.5 sm:table-row sm:p-0 ${d.future ? "opacity-40" : ""}`}
    >
      <td className="order-1 col-span-2 whitespace-nowrap text-stone-700 sm:table-cell sm:px-4 sm:py-2">
        <span className="inline-block w-10 text-stone-400">
          {weekday(d.date)}
        </span>
        {d.date.split("-").reverse().join("-")}
        {d.date === today && (
          <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
            TODAY
          </span>
        )}
        {d.auto && d.products.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1 whitespace-normal">
            {d.products.map((p) => (
              <span key={p.name} className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-600">
                {p.name} <b className="font-semibold text-stone-900">{p.orders}</b>
                <span className="text-emerald-700"> · {rs(p.orders * rate)}</span>
              </span>
            ))}
          </span>
        )}
      </td>
      <td className="order-3 sm:table-cell sm:px-3 sm:py-1.5">
        <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-stone-400 sm:hidden">
          Orders
        </span>
        {d.auto ? (
          <div className="text-sm">
            <b className="font-semibold text-stone-900">{d.dispatched}</b>
            {(d.waiting > 0 || d.mine > 0) && (
              <span className="ml-1.5 text-xs text-stone-400">
                {d.waiting > 0 && `+${d.waiting} waiting`}
                {d.waiting > 0 && d.mine > 0 && " · "}
                {d.mine > 0 && `${d.mine} by you`}
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-2">
            <input
              inputMode="numeric"
              value={orders}
              disabled={d.future}
              placeholder="–"
              onChange={(e) => setOrders(e.target.value.replace(/[^\d]/g, ""))}
              onBlur={save}
              onKeyDown={(e) =>
                e.key === "Enter" && (e.target as HTMLInputElement).blur()
              }
              className={`${box} w-14 px-2 sm:w-16`}
              aria-label={`Orders taken on ${d.date}`}
            />
            {d.dispatched > 0 && (
              <span className="text-xs text-stone-400">
                {d.dispatched} dispatched
              </span>
            )}
          </div>
        )}
      </td>
      <td className="order-3 sm:table-cell sm:px-3 sm:py-1.5">
        <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-stone-400 sm:hidden">
          Amount
        </span>
        {d.auto ? (
          <div
            className="text-sm"
            title="Worked out from her dispatched orders"
          >
            <b className="font-semibold text-stone-900">{rs(d.amount)}</b>
            {d.dispatched > 0 && (
              <span className="ml-1.5 text-xs text-stone-400">
                {d.dispatched} × {rs(rate)}
              </span>
            )}
          </div>
        ) : (
          <div className="relative inline-block">
            <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs text-stone-400">
              ₹
            </span>
            <input
              inputMode="numeric"
              value={amount}
              disabled={d.future}
              placeholder="0"
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
              onBlur={save}
              onKeyDown={(e) =>
                e.key === "Enter" && (e.target as HTMLInputElement).blur()
              }
              className={`${box} w-20 pl-5 pr-2 sm:w-24`}
              aria-label={`Staff amount on ${d.date}`}
            />
          </div>
        )}
      </td>
      <td className="order-3 sm:table-cell sm:px-3 sm:py-1.5">
        <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-stone-400 sm:hidden">
          Bonus
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative inline-block">
            <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs text-stone-400">
              ₹
            </span>
            <input
              inputMode="numeric"
              value={bonus}
              disabled={d.future}
              placeholder="0"
              onChange={(e) => setBonus(e.target.value.replace(/[^\d]/g, ""))}
              onBlur={save}
              onKeyDown={(e) =>
                e.key === "Enter" && (e.target as HTMLInputElement).blur()
              }
              className={`${box} w-20 pl-5 pr-2`}
              aria-label={`Bonus on ${d.date}`}
            />
          </div>
          {(Number(bonus) > 0 || bonusNote) && (
            <input
              value={bonusNote}
              placeholder="Reason"
              onChange={(e) => setBonusNote(e.target.value)}
              onBlur={save}
              onKeyDown={(e) =>
                e.key === "Enter" && (e.target as HTMLInputElement).blur()
              }
              className={`${box.replace("text-right", "text-left")} w-28 px-2`}
              aria-label={`Bonus reason on ${d.date}`}
            />
          )}
        </div>
      </td>
      <td className="order-2 self-center text-right text-xs sm:table-cell sm:px-4 sm:py-2">
        {d.amount + d.bonus > 0 ? (
          d.paid &&
          (d.paidAmount === null || d.paidAmount >= d.amount + d.bonus) ? (
            <span className="text-emerald-700">Paid</span>
          ) : d.paid ? (
            <span className="text-amber-700">
              {rs(d.amount + d.bonus - (d.paidAmount ?? 0))} due
            </span>
          ) : (
            <span className="text-amber-700">Due</span>
          )
        ) : (
          <span className="text-stone-300">–</span>
        )}
      </td>
    </tr>
  );
}

function BonusDialog({
  week,
  today,
  onClose,
  onToast,
}: {
  week: Week;
  today: string;
  onClose: () => void;
  onToast: (r: Result) => void;
}) {
  const days = week.days.filter((d) => !d.future);
  const defaultDay =
    days.find((d) => d.date === today)?.date ??
    days[days.length - 1]?.date ??
    week.start;
  const [date, setDate] = useState(defaultDay);
  const existing = week.days.find((d) => d.date === date);
  const [amount, setAmount] = useState(
    existing?.bonus ? String(existing.bonus) : "",
  );
  const [reason, setReason] = useState(existing?.bonusNote ?? "");
  const [pending, startTransition] = useTransition();

  function pick(d: string) {
    setDate(d);
    const e = week.days.find((x) => x.date === d);
    setAmount(e?.bonus ? String(e.bonus) : "");
    setReason(e?.bonusNote ?? "");
  }

  function save() {
    startTransition(async () => {
      const r = await saveStaffDay({
        date,
        staff_bonus: Math.round(Number(amount) || 0),
        staff_bonus_note: reason,
      });
      onToast(
        r.ok
          ? {
              ok: true,
              message: Number(amount) > 0 ? "Bonus saved" : "Bonus removed",
            }
          : r,
      );
      if (r.ok) onClose();
    });
  }

  const input =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-sm sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add bonus</h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-stone-400 hover:bg-stone-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="space-y-4">
          <label className="block text-sm font-medium text-stone-700">
            Day
            <select
              value={date}
              onChange={(e) => pick(e.target.value)}
              className={`${input} mt-1`}
            >
              {days.map((d) => (
                <option key={d.date} value={d.date}>
                  {weekday(d.date)}, {d.date.split("-").reverse().join("-")}
                  {d.bonus ? ` (bonus ₹${d.bonus})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-stone-700">
            Bonus amount
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-stone-400">
                ₹
              </span>
              <input
                autoFocus
                inputMode="numeric"
                value={amount}
                onChange={(e) =>
                  setAmount(e.target.value.replace(/[^\d]/g, ""))
                }
                onKeyDown={(e) => e.key === "Enter" && save()}
                placeholder="0"
                className={`${input} pl-7 text-lg font-semibold`}
              />
            </div>
          </label>
          <label className="block text-sm font-medium text-stone-700">
            Reason (optional)
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Diwali, extra orders"
              className={`${input} mt-1`}
            />
          </label>
          <p className="text-xs text-stone-500">
            Added to this week&apos;s payout and the receipt, and counted as
            staff cost on the Dashboard.
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={pending}
            className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save bonus"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** "₹20 per order taken by Anu, once dispatched" with an inline editor. */
function PayRule({
  pay,
  staffName,
  onToast,
}: {
  pay: PaySettings;
  staffName: string;
  onToast: (r: Result) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [rate, setRate] = useState(String(pay.rate));
  const [from, setFrom] = useState(pay.autoFrom);
  const [pending, startTransition] = useTransition();

  if (!pay.ready)
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
        Run <b>DATABASE-UPDATE-13.sql</b> in Supabase to count staff pay
        automatically from orders (₹ per dispatched order she takes).
      </p>
    );

  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      {!editing ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-700 ring-1 ring-emerald-200">
            {rs(pay.rate)}
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-medium text-stone-900">
              {rs(pay.rate)} for every order {staffName} takes, once it&apos;s
              dispatched
            </div>
            <div className="text-xs text-stone-500">
              One payment per order, even with 2 products · RTO still counts ·
              cancelled and orders taken by you don&apos;t · counting since{" "}
              {shortDate(pay.autoFrom)}
            </div>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50"
          >
            Change
          </button>
        </div>
      ) : (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const r = await setStaffPay({
                rate: Number(rate) || 0,
                auto_from: from,
              });
              onToast(r);
              if (r.ok) setEditing(false);
            });
          }}
        >
          <label className="text-xs font-medium text-stone-500">
            Pay per order
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-stone-400">
                ₹
              </span>
              <input
                inputMode="numeric"
                value={rate}
                onChange={(e) => setRate(e.target.value.replace(/[^\d]/g, ""))}
                className="w-28 rounded-lg border border-stone-300 py-2 pl-7 pr-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>
          </label>
          <label className="text-xs font-medium text-stone-500">
            Count automatically from
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
            />
          </label>
          <p className="min-w-[200px] flex-1 text-xs text-stone-500">
            A new rate applies from today; paid weeks stay as they are. An
            earlier start date recounts those days from the orders (replacing
            amounts typed by hand).
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100"
            >
              Cancel
            </button>
            <button
              disabled={pending}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
