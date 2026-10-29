import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CardsSkeleton } from "@/components/skeleton";
import { eachDay, shiftDays } from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/server";
import { requestToday } from "@/lib/today";
import { EarningsChart } from "./earnings-chart";

// Private read-only page for the staff member. Opened from a secret link (/s/<token>), no login.
// All data comes from the staff_dashboard() database function, which checks the token and
// returns only her own pay and order counts (no customer details, prices or profit).

export const metadata: Metadata = {
  title: "My orders & pay",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Data = {
  name: string | null;
  business: string | null;
  rate: string | null;
  auto_from: string | null;
  days: {
    date: string;
    amount: number;
    bonus: number;
    bonus_note: string | null;
    orders_taken: number | null;
    paid: boolean;
    paid_date: string | null;
    paid_amount: number | null;
  }[];
  orders: { d: string; s: string; p: string[] }[];
};

type Day = {
  date: string;
  pay: number;
  orders: number;
  waiting: number;
  due: number;
  paid: boolean;
  products: { name: string; orders: number }[];
  future: boolean;
};

// (chart-utils is a client module, so these two are repeated here for the server)
const rs = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const shortDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

const PAID_STATUSES = new Set(["dispatched", "delivered", "rto", "returned"]);
const WEEKS = 8;

const weekday = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", {
    weekday: "short",
    timeZone: "UTC",
  });

function weekStart(iso: string) {
  return shiftDays(iso, -new Date(iso + "T00:00:00Z").getUTCDay());
}

type Search = Record<string, string | string[] | undefined>;

const monthName = (ym: string, withYear = false) =>
  new Date(ym + "-01T00:00:00Z").toLocaleDateString("en-IN", {
    month: withYear ? "short" : "long",
    year: withYear ? "numeric" : undefined,
    timeZone: "UTC",
  });

function lastDayOf(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** months to pick from: this month and the 5 before it ("2026-10", "2026-09", …) */
function recentMonths(today: string, n = 6) {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: n }, (_, i) =>
    new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7),
  );
}

export default function StaffLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Search>;
}) {
  return (
    <div className="min-h-dvh bg-stone-100">
      <div className="mx-auto max-w-lg px-4 pt-6 pb-12">
        <Suspense fallback={<CardsSkeleton />}>
          <Dashboard params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function Dashboard({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Search>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const today = await requestToday();
  const thisWeek = weekStart(today);
  const months = recentMonths(today);
  const mParam = Array.isArray(sp.m) ? sp.m[0] : sp.m;
  const month = mParam && months.includes(mParam) ? mParam : null; // null = recent weeks
  const from = month ? `${month}-01` : shiftDays(thisWeek, -7 * (WEEKS - 1));
  const to = month ? lastDayOf(month) : shiftDays(thisWeek, 6);
  const base = `/s/${encodeURIComponent(token)}`;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_dashboard", {
    p_token: token,
    p_from: from,
    p_to: to,
  });
  if (error || !data) {
    return (
      <Message
        title={error ? "This page isn't ready yet" : "This link doesn't work"}
        text={
          error
            ? "Please try again later."
            : "It may have been changed. Ask for the new link."
        }
      />
    );
  }
  const d = data as Data;
  const rate = Number(d.rate ?? 20) || 0;
  const autoFrom = d.auto_from ?? today;
  const name = (d.name ?? "").trim();

  // her orders per day: counted (dispatched or later) and waiting (not dispatched yet), by product set
  const counted = new Map<string, Map<string, number>>();
  const waiting = new Map<string, number>();
  for (const o of d.orders) {
    if (PAID_STATUSES.has(o.s)) {
      const label = [...o.p].sort().join(" + ") || "Order";
      const m = counted.get(o.d) ?? new Map<string, number>();
      m.set(label, (m.get(label) ?? 0) + 1);
      counted.set(o.d, m);
    } else if (o.s === "new") waiting.set(o.d, (waiting.get(o.d) ?? 0) + 1);
  }
  const inputs = new Map(d.days.map((x) => [x.date, x]));

  // weeks (newest first) that overlap the period; days outside the period are left out
  const starts: string[] = [];
  for (let st = weekStart(to); shiftDays(st, 6) >= from; st = shiftDays(st, -7))
    starts.push(st);
  const weeks = starts.map((start) => {
    const end = shiftDays(start, 6);
    const days: Day[] = eachDay(
      start < from ? from : start,
      end > to ? to : end,
    ).map((date) => {
      const inp = inputs.get(date);
      const m = counted.get(date) ?? new Map<string, number>();
      const products = [...m.entries()]
        .map(([n, c]) => ({ name: n, orders: c }))
        .sort((a, b) => b.orders - a.orders);
      const auto = date >= autoFrom;
      const amount = inp?.amount ?? 0;
      const bonus = inp?.bonus ?? 0;
      const paid = !!inp?.paid;
      // bonus isn't shown on this page, so only the order pay part of anything still due
      const due = Math.min(
        amount,
        !paid
          ? amount + bonus
          : inp?.paid_amount == null
            ? 0
            : Math.max(0, amount + bonus - inp.paid_amount),
      );
      return {
        date,
        pay: amount,
        orders: auto
          ? products.reduce((s, p) => s + p.orders, 0)
          : (inp?.orders_taken ?? 0),
        waiting: waiting.get(date) ?? 0,
        due,
        paid: paid && due === 0 && amount > 0,
        products,
        future: date > today,
      };
    });
    const total = days.reduce((s, x) => s + x.pay, 0);
    const due = days.reduce((s, x) => s + x.due, 0);
    const orders = days.reduce((s, x) => s + x.orders, 0);
    const wait = days.reduce((s, x) => s + x.waiting, 0);
    const prod = new Map<string, number>();
    for (const x of days)
      for (const p of x.products)
        for (const n of p.name.split(" + "))
          prod.set(n, (prod.get(n) ?? 0) + p.orders);
    const state =
      total === 0
        ? "empty"
        : due === 0
          ? "paid"
          : due === total
            ? "unpaid"
            : "partial";
    return {
      start,
      end,
      days,
      total,
      due,
      orders,
      waiting: wait,
      state,
      current: start === thisWeek,
      products: [...prod.entries()].sort((a, b) => b[1] - a[1]),
    };
  });

  const week = weeks.find((w) => w.current) ?? weeks[0];
  const todayRow = week.days.find((x) => x.date === today);
  const toPay = weeks.reduce((s, w) => s + w.due, 0);
  const paidTotal = weeks.reduce((s, w) => s + (w.total - w.due), 0);
  const periodTotal = weeks.reduce((s, w) => s + w.total, 0);
  const periodOrders = weeks.reduce((s, w) => s + w.orders, 0);
  const periodWaiting = weeks.reduce((s, w) => s + w.waiting, 0);

  // chart: each day (last 14 days, or the whole month up to today) and each week, oldest first
  const pastDays = weeks
    .flatMap((w) => w.days)
    .filter((x) => !x.future)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const daily = (month ? pastDays : pastDays.slice(-14)).map((x) => ({
    date: x.date,
    label: shortDate(x.date),
    values: { orders: x.pay },
  }));
  const weekly = [...weeks]
    .reverse()
    .filter((w) => w.start <= today)
    .map((w) => ({
      date: w.start,
      label: shortDate(w.days[0]?.date ?? w.start),
      values: { orders: w.total },
    }));

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium tracking-wide text-emerald-700 uppercase">
            {d.business || "Kartzo"}
          </div>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-stone-900">
            {name ? `Hi ${name} 👋` : "My orders & pay"}
          </h1>
        </div>
        <div className="rounded-full bg-white px-3 py-1 text-xs text-stone-500 ring-1 ring-stone-200">
          {weekday(today)}, {shortDate(today)}
        </div>
      </header>

      {/* period filter */}
      <nav className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {[null, ...months].map((m) => {
          const on = m === month;
          return (
            <Link
              key={m ?? "recent"}
              href={m ? `${base}?m=${m}` : base}
              scroll={false}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition ${
                on
                  ? "bg-stone-900 text-white ring-stone-900"
                  : "bg-white text-stone-600 ring-stone-200"
              }`}
            >
              {m ? monthName(m, m.slice(0, 4) !== today.slice(0, 4)) : "Recent"}
            </Link>
          );
        })}
      </nav>

      {!month && (
        <section className="rounded-2xl bg-emerald-800 p-5 text-white shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-emerald-100">Today</div>
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium">
              {rs(rate)} per order
            </span>
          </div>
          <div className="mt-1 flex items-end justify-between gap-3">
            <div className="text-4xl font-semibold tracking-tight">
              {rs(todayRow?.pay ?? 0)}
            </div>
            <div className="pb-1 text-right text-sm text-emerald-100">
              {todayRow?.orders ?? 0} order{todayRow?.orders === 1 ? "" : "s"}{" "}
              counted
              {todayRow?.waiting ? (
                <div className="text-amber-200">
                  +{todayRow.waiting} waiting to dispatch (
                  {rs(todayRow.waiting * rate)})
                </div>
              ) : null}
            </div>
          </div>
          {!!todayRow?.products.length && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {todayRow.products.map((p) => (
                <span
                  key={p.name}
                  className="rounded-full bg-white/15 px-2.5 py-1 text-xs"
                >
                  {p.name} <b>{p.orders}</b>
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {/* totals */}
      <section className="grid grid-cols-2 gap-3">
        {month ? (
          <Tile
            label={`${monthName(month)} earnings`}
            value={rs(periodTotal)}
            sub={`${periodOrders} orders${periodWaiting ? ` · ${periodWaiting} waiting` : ""} · ${rs(rate)}/order`}
          />
        ) : (
          <Tile
            label="This week"
            value={rs(week.total)}
            sub={`${week.orders} orders${week.waiting ? ` · ${week.waiting} waiting` : ""}`}
          />
        )}
        <Tile
          label="Not paid yet"
          value={rs(toPay)}
          sub={toPay ? "Will be paid soon" : "Everything is paid ✓"}
          tone={toPay ? "amber" : "plain"}
        />
      </section>

      <EarningsChart
        key={month ?? "recent"}
        daily={daily}
        weekly={weekly}
        period={month ? `in ${monthName(month)}` : null}
      />

      {/* weeks */}
      <section className="space-y-3">
        <h2 className="px-1 text-sm font-semibold text-stone-700">
          Week by week
        </h2>
        {weeks.map((w) => (
          <details
            key={w.start}
            open={month ? w === weeks[0] : w.current}
            className="group overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200"
          >
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-stone-900">
                  {w.current
                    ? "This week"
                    : `${shortDate(w.days[0]?.date ?? w.start)} – ${shortDate(w.days[w.days.length - 1]?.date ?? w.end)}`}
                </div>
                <div className="text-xs text-stone-500">
                  {w.orders} orders{w.waiting ? ` · ${w.waiting} waiting` : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="text-base font-semibold text-stone-900">
                  {rs(w.total)}
                </div>
                <StatePill state={w.state} due={w.due} />
              </div>
              <span
                className="text-stone-400 transition group-open:rotate-180"
                aria-hidden
              >
                ▾
              </span>
            </summary>

            {w.products.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-t border-stone-100 px-4 py-2.5">
                {w.products.map(([n, c]) => (
                  <span
                    key={n}
                    className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-700"
                  >
                    {n} <b className="text-stone-900">{c}</b>
                  </span>
                ))}
              </div>
            )}

            <ul className="divide-y divide-stone-100 border-t border-stone-100">
              {w.days
                .filter((x) => !x.future || x.waiting)
                .map((x) => (
                  <li
                    key={x.date}
                    className={`px-4 py-2.5 ${x.date === today ? "bg-emerald-50/60" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-16 shrink-0">
                        <div className="text-sm font-medium text-stone-900">
                          {weekday(x.date)}
                        </div>
                        <div className="text-[11px] text-stone-500">
                          {shortDate(x.date)}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1 text-xs text-stone-600">
                        {x.orders || x.waiting ? (
                          <>
                            {x.orders} order{x.orders === 1 ? "" : "s"}
                            {x.waiting ? (
                              <span className="text-amber-700">
                                {" "}
                                · {x.waiting} waiting
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-stone-400">No orders</span>
                        )}
                      </div>
                      <div className="text-right">
                        <div
                          className={`text-sm font-semibold ${x.pay ? "text-stone-900" : "text-stone-300"}`}
                        >
                          {rs(x.pay)}
                        </div>
                        {x.pay > 0 && (
                          <div
                            className={`text-[11px] ${x.paid ? "text-emerald-700" : "text-amber-700"}`}
                          >
                            {x.paid
                              ? "Paid ✓"
                              : x.due < x.pay
                                ? `${rs(x.due)} due`
                                : "Not paid"}
                          </div>
                        )}
                      </div>
                    </div>
                    {x.products.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1 pl-[76px]">
                        {x.products.map((p) => (
                          <span
                            key={p.name}
                            className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-700"
                          >
                            {p.name} {p.orders} · {rs(p.orders * rate)}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
            </ul>
          </details>
        ))}
      </section>

      <p className="pt-2 text-center text-xs text-stone-400">
        Paid {month ? `in ${monthName(month)}` : `in the last ${WEEKS} weeks`}:{" "}
        {rs(paidTotal)} · Pull down to refresh
      </p>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  tone = "plain",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "plain" | "amber";
}) {
  return (
    <div
      className={`rounded-2xl p-4 ring-1 ${tone === "amber" ? "bg-amber-50 ring-amber-200" : "bg-white ring-stone-200"}`}
    >
      <div className="text-xs text-stone-600">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-stone-500">{sub}</div>}
    </div>
  );
}

function StatePill({ state, due }: { state: string; due: number }) {
  if (state === "empty") return null;
  if (state === "paid")
    return (
      <div className="text-[11px] font-medium text-emerald-700">Paid ✓</div>
    );
  return (
    <div className="text-[11px] font-medium text-amber-700">
      {state === "partial" ? `${rs(due)} due` : "Not paid yet"}
    </div>
  );
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <div className="mt-24 rounded-2xl bg-white p-8 text-center ring-1 ring-stone-200">
      <div className="text-3xl">🔒</div>
      <h1 className="mt-3 text-lg font-semibold text-stone-900">{title}</h1>
      <p className="mt-1 text-sm text-stone-500">{text}</p>
    </div>
  );
}
