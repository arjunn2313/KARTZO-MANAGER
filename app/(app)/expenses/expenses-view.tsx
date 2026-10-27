"use client";

import { useMemo, useState, useTransition } from "react";
import { Pager, usePaged } from "@/components/pager";
import { CHART, rs, shortDate } from "@/components/charts/chart-utils";
import { LineLegend, TrendChart } from "@/components/charts/trend-chart";
import { eachDay } from "@/lib/dashboard";
import { deleteEntry, saveEntry, type Result } from "./actions";

export type Category = {
  id: string;
  name: string;
  kind: "cost" | "transfer" | "income";
  active: boolean;
  sort: number;
};
export type Entry = {
  id: string;
  date: string;
  amount: number;
  note: string | null;
  category_id: string;
  created_at: string;
};

const KIND: Record<
  Category["kind"],
  { label: string; badge: string; help: string }
> = {
  cost: {
    label: "Business cost",
    badge: "bg-red-50 text-red-700 ring-red-200",
    help: "Reduces net profit",
  },
  transfer: {
    label: "Cash out",
    badge: "bg-stone-100 text-stone-600 ring-stone-200",
    help: "Already counted in orders / ad spend",
  },
  income: {
    label: "Money in",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    help: "Cash received",
  },
};

export function ExpensesView({
  range,
  rangeBar,
  categories,
  entries,
  advances,
}: {
  range: { key: string; from: string; to: string; days: number; today: string };
  rangeBar: React.ReactNode;
  categories: Category[];
  entries: Entry[];
  advances: { date: string; amount: number }[];
}) {
  const [dialog, setDialog] = useState<{
    entry?: Entry;
    kind: "out" | "in";
  } | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [toast, setToast] = useState<Result | null>(null);

  const catById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const isIn = (e: Entry) => catById.get(e.category_id)?.kind === "income";

  const moneyOut = entries
    .filter((e) => !isIn(e))
    .reduce((s, e) => s + e.amount, 0);
  const advancesTotal = advances.reduce((s, a) => s + a.amount, 0);
  const moneyInEntries = entries.filter(isIn).reduce((s, e) => s + e.amount, 0);
  const moneyIn = moneyInEntries + advancesTotal;
  const businessCosts = entries
    .filter((e) => catById.get(e.category_id)?.kind === "cost")
    .reduce((s, e) => s + e.amount, 0);

  const byCategory = categories
    .map((c) => ({
      c,
      total: entries
        .filter((e) => e.category_id === c.id)
        .reduce((s, e) => s + e.amount, 0),
      count: entries.filter((e) => e.category_id === c.id).length,
    }))
    .filter((x) => x.total > 0 || (x.c.active && filter === x.c.id));
  const outRows = byCategory
    .filter((x) => x.c.kind !== "income" && x.total > 0)
    .sort((a, b) => b.total - a.total);
  const inRows = byCategory
    .filter((x) => x.c.kind === "income" && x.total > 0)
    .sort((a, b) => b.total - a.total);

  const trendSeries = [
    { key: "in", name: "Money in", color: CHART.series[0] },
    { key: "out", name: "Money out", color: CHART.series[1] },
  ];
  const trendPoints = useMemo(() => {
    const days = eachDay(range.from, range.to);
    const m = new Map(days.map((d) => [d, { in: 0, out: 0 }]));
    for (const e of entries) {
      const v = m.get(e.date);
      if (!v) continue;
      if (isIn(e)) v.in += e.amount;
      else v.out += e.amount;
    }
    for (const a of advances) {
      const v = m.get(a.date);
      if (v) v.in += a.amount;
    }
    return days.map((d) => ({ date: d, values: m.get(d)! }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, advances, range.from, range.to]);

  const shown =
    filter === "all"
      ? entries
      : filter === "in"
        ? entries.filter(isIn)
        : filter === "out"
          ? entries.filter((e) => !isIn(e))
          : entries.filter((e) => e.category_id === filter);
  const { pageItems, pager } = usePaged(shown, "expenses", 25);

  function showToast(r: Result) {
    setToast(r);
    setTimeout(() => setToast(null), r.ok ? 2200 : 5000);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
          <p className="mt-1 text-sm text-stone-500">
            Your cash book: every rupee in and out. Business costs also reduce
            net profit on the Dashboard.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setDialog({ kind: "in" })}
            className="rounded-lg px-4 py-2 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50"
          >
            + Money in
          </button>
          <button
            onClick={() => setDialog({ kind: "out" })}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            + Add expense
          </button>
        </div>
      </div>

      {rangeBar}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Money out"
          value={rs(moneyOut)}
          sub={`${entries.filter((e) => !isIn(e)).length} entries`}
        />
        <Kpi
          label="Money in"
          value={rs(moneyIn)}
          sub={
            advancesTotal
              ? `incl. ${rs(advancesTotal)} order advances`
              : "COD remittance & other"
          }
        />
        <Kpi
          label="Net cash flow"
          value={rs(moneyIn - moneyOut)}
          tone={moneyIn - moneyOut < 0 ? "bad" : "good"}
          sub="Money in − money out"
        />
        <Kpi
          label="Business costs"
          value={rs(businessCosts)}
          sub="Taken off net profit"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card
          title="Money in and out"
          note={range.days > 1 ? "Daily" : shortDate(range.from)}
          right={<LineLegend series={trendSeries} />}
        >
          {range.days > 1 ? (
            <TrendChart
              points={trendPoints}
              series={trendSeries}
              height={240}
            />
          ) : (
            <p className="py-16 text-center text-sm text-stone-400">
              Pick a longer date range to see the chart.
            </p>
          )}
        </Card>
        <Card
          title="Where the cash went"
          note={`${shortDate(range.from)} – ${shortDate(range.to)}`}
        >
          <BarList
            rows={outRows.map((x) => ({
              label: x.c.name,
              value: x.total,
              tag: x.c.kind,
            }))}
            total={moneyOut}
            empty="No expenses in this period."
          />
          {(inRows.length > 0 || advancesTotal > 0) && (
            <div className="mt-5 border-t border-stone-100 pt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
                Money in
              </div>
              <BarList
                rows={[
                  ...inRows.map((x) => ({
                    label: x.c.name,
                    value: x.total,
                    tag: "income" as const,
                  })),
                  ...(advancesTotal
                    ? [
                        {
                          label: "Advances on orders",
                          value: advancesTotal,
                          tag: "income" as const,
                          auto: true,
                        },
                      ]
                    : []),
                ]}
                total={moneyIn}
                accent
              />
            </div>
          )}
        </Card>
      </div>

      {/* Entries */}
      <Card title="Entries" note="Click an entry to edit it.">
        <div className="no-scrollbar -mx-5 -mt-1 mb-4 flex gap-1.5 overflow-x-auto px-5 pb-1">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>
            All
          </Chip>
          <Chip active={filter === "out"} onClick={() => setFilter("out")}>
            Money out
          </Chip>
          <Chip active={filter === "in"} onClick={() => setFilter("in")}>
            Money in
          </Chip>
          <span className="mx-1 w-px shrink-0 bg-stone-200" />
          {categories
            .filter(
              (c) => c.active || entries.some((e) => e.category_id === c.id),
            )
            .map((c) => (
              <Chip
                key={c.id}
                active={filter === c.id}
                onClick={() => setFilter(c.id)}
              >
                {c.name}
              </Chip>
            ))}
        </div>

        {shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-stone-500">
            No entries here yet.
          </p>
        ) : (
          <>
            {/* Phones */}
            <ul
              className="-mx-5 divide-y divide-stone-100 border-t border-stone-100 sm:hidden"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {pageItems.map((e) => {
                const c = catById.get(e.category_id);
                const income = c?.kind === "income";
                return (
                  <li key={e.id}>
                    <button
                      onClick={() =>
                        setDialog({ entry: e, kind: income ? "in" : "out" })
                      }
                      className="w-full px-5 py-2.5 text-left active:bg-stone-50"
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate font-medium text-stone-800">
                          {c?.name ?? "?"}
                        </span>
                        <span
                          className={`shrink-0 font-semibold ${income ? "text-emerald-700" : "text-stone-900"}`}
                        >
                          {income ? "+" : "−"}
                          {rs(e.amount)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-stone-500">
                        {new Date(e.date + "T00:00:00Z").toLocaleDateString(
                          "en-IN",
                          { day: "numeric", month: "short", timeZone: "UTC" },
                        )}
                        {c && (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${KIND[c.kind].badge}`}
                          >
                            {KIND[c.kind].label}
                          </span>
                        )}
                        {e.note && <span className="truncate">{e.note}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
              <li className="flex justify-between bg-stone-50 px-5 py-2.5 font-semibold">
                <span>Total ({shown.length})</span>
                <span>
                  {(() => {
                    const net = shown.reduce(
                      (s, e) => s + (isIn(e) ? e.amount : -e.amount),
                      0,
                    );
                    return `${net >= 0 ? "+" : "−"}${rs(Math.abs(net))}`;
                  })()}
                </span>
              </li>
            </ul>
            <div className="-mx-5 hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-y border-stone-100 bg-stone-50 text-left text-xs font-medium uppercase tracking-wide text-stone-500">
                    <th className="px-5 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Category</th>
                    <th className="px-3 py-2.5">Note</th>
                    <th className="px-5 py-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody
                  className="divide-y divide-stone-100"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {pageItems.map((e) => {
                    const c = catById.get(e.category_id);
                    const income = c?.kind === "income";
                    return (
                      <tr
                        key={e.id}
                        onClick={() =>
                          setDialog({ entry: e, kind: income ? "in" : "out" })
                        }
                        className="cursor-pointer hover:bg-stone-50"
                      >
                        <td className="whitespace-nowrap px-5 py-2.5 text-stone-600">
                          {e.date.split("-").reverse().join("-")}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="font-medium text-stone-800">
                            {c?.name ?? "?"}
                          </span>
                          {c && (
                            <span
                              className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${KIND[c.kind].badge}`}
                            >
                              {KIND[c.kind].label}
                            </span>
                          )}
                        </td>
                        <td className="max-w-[320px] truncate px-3 py-2.5 text-stone-500">
                          {e.note}
                        </td>
                        <td
                          className={`px-5 py-2.5 text-right font-semibold ${income ? "text-emerald-700" : "text-stone-900"}`}
                        >
                          {income ? "+" : "−"}
                          {rs(e.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-stone-200 bg-stone-50 font-semibold">
                    <td className="px-5 py-2.5" colSpan={3}>
                      Total ({shown.length})
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      {(() => {
                        const net = shown.reduce(
                          (s, e) => s + (isIn(e) ? e.amount : -e.amount),
                          0,
                        );
                        return `${net >= 0 ? "+" : "−"}${rs(Math.abs(net))}`;
                      })()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <Pager {...pager} noun="entries" className="-mx-5 -mb-5 mt-0 border-t border-stone-100 px-5 py-3" />
          </>
        )}
      </Card>

      {dialog && (
        <EntryDialog
          key={dialog.entry?.id ?? dialog.kind}
          entry={dialog.entry}
          initialKind={dialog.kind}
          categories={categories}
          today={range.today}
          onClose={() => setDialog(null)}
          onDone={(r) => {
            showToast(r);
            if (r.ok) setDialog(null);
          }}
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

/* ---------------- pieces ---------------- */

function Card({
  title,
  note,
  right,
  children,
}: {
  title: string;
  note?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-stone-200">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-stone-900">{title}</h2>
          {note && <p className="text-xs text-stone-500">{note}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
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
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <div className="text-sm text-stone-500">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold tracking-tight ${tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-700" : "text-stone-900"}`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-stone-500">{sub}</div>}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1 text-sm transition ${active ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}
    >
      {children}
    </button>
  );
}

function BarList({
  rows,
  total,
  empty,
  accent,
}: {
  rows: {
    label: string;
    value: number;
    tag: Category["kind"];
    auto?: boolean;
  }[];
  total: number;
  empty?: string;
  accent?: boolean;
}) {
  if (!rows.length) return <p className="text-sm text-stone-500">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const pct = total ? Math.round((r.value / total) * 100) : 0;
        return (
          <li key={r.label}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5 text-stone-700">
                {r.label}
                {r.tag === "cost" && (
                  <span className="rounded bg-red-50 px-1 text-[10px] font-semibold text-red-700">
                    COST
                  </span>
                )}
                {r.auto && (
                  <span className="text-[10px] text-stone-400">
                    (from orders)
                  </span>
                )}
              </span>
              <span className="text-stone-800">
                {rs(r.value)}{" "}
                <span className="text-xs text-stone-400">{pct}%</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-stone-100">
              <div
                className="h-1.5 rounded-full"
                style={{
                  width: `${pct}%`,
                  background: accent
                    ? CHART.series[0]
                    : r.tag === "cost"
                      ? CHART.series[1]
                      : "#a8a69e",
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------- Add / edit entry ---------------- */

function EntryDialog({
  entry,
  initialKind,
  categories,
  today,
  onClose,
  onDone,
}: {
  entry?: Entry;
  initialKind: "out" | "in";
  categories: Category[];
  today: string;
  onClose: () => void;
  onDone: (r: Result) => void;
}) {
  const [kind, setKind] = useState<"out" | "in">(initialKind);
  const options = categories.filter(
    (c) =>
      (c.active || c.id === entry?.category_id) &&
      (kind === "in" ? c.kind === "income" : c.kind !== "income"),
  );
  const [categoryId, setCategoryId] = useState(
    entry?.category_id ?? options[0]?.id ?? "",
  );
  const [date, setDate] = useState(entry?.date ?? today);
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const cat = categories.find((c) => c.id === categoryId);

  function switchKind(k: "out" | "in") {
    setKind(k);
    const first = categories.find(
      (c) =>
        c.active && (k === "in" ? c.kind === "income" : c.kind !== "income"),
    );
    setCategoryId(first?.id ?? "");
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await saveEntry({
        id: entry?.id,
        date,
        category_id: categoryId,
        amount: Math.round(Number(amount) || 0),
        note,
      });
      if (!r.ok) return setError(r.message);
      onDone(r);
    });
  }

  function remove() {
    if (!entry) return;
    startTransition(async () => onDone(await deleteEntry(entry.id)));
  }

  const input =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {entry ? "Edit entry" : kind === "in" ? "Money in" : "Add expense"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-stone-400 hover:bg-stone-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1">
          {(["out", "in"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => switchKind(k)}
              className={`rounded-md py-1.5 text-sm font-medium ${kind === k ? "bg-white shadow-sm ring-1 ring-stone-200" : "text-stone-500"}`}
            >
              {k === "out" ? "Money out" : "Money in"}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-sm font-medium text-stone-700">
              Category
            </div>
            <div className="flex flex-wrap gap-1.5">
              {options.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  className={`rounded-full px-3 py-1.5 text-sm ring-1 transition ${
                    categoryId === c.id
                      ? "bg-emerald-700 text-white ring-emerald-700"
                      : "bg-white text-stone-700 ring-stone-200 hover:bg-stone-50"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
            {cat && (
              <p className="mt-1.5 text-xs text-stone-500">
                {KIND[cat.kind].label}: {KIND[cat.kind].help}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-medium text-stone-700">
              Amount
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
                  className={`${input} pl-7 text-lg font-semibold`}
                  placeholder="0"
                />
              </div>
            </label>
            <label className="text-sm font-medium text-stone-700">
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`${input} mt-1`}
              />
            </label>
          </div>

          <label className="block text-sm font-medium text-stone-700">
            Note (optional)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Meta ads recharge, 100 mirrors from vendor"
              className={`${input} mt-1`}
            />
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex items-center gap-2">
          {entry &&
            (confirmDelete ? (
              <span className="flex items-center gap-2 text-sm">
                <span className="text-red-700">Delete this entry?</span>
                <button
                  onClick={remove}
                  disabled={pending}
                  className="rounded-md bg-red-600 px-2.5 py-1 font-medium text-white hover:bg-red-700"
                >
                  Yes, delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-md px-2 py-1 text-stone-500 hover:bg-stone-100"
                >
                  No
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            ))}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={pending || !categoryId || !(Number(amount) > 0)}
            className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
