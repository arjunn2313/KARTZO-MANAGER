/** Ad wallet maths (pure, no database). Spend = opening balance + recharges − next morning's balance. */

import { eachDay, shiftDays } from "./dashboard";

export type Reading = { date: string; balance: number };
export type Recharge = { id?: string; date: string; amount: number; note?: string | null };

export type Period = {
  /** first day covered (the morning of the opening reading) */
  from: string;
  /** last day covered (the day before the closing reading) */
  to: string;
  days: number;
  opening: number;
  recharges: Recharge[];
  rechargePaid: number;
  /** what actually landed in the wallet (paid minus GST) */
  rechargeCredited: number;
  closing: number;
  /** spend as Meta Ads Manager shows it */
  metaSpend: number;
  /** real cost to you (adds GST back when recharges include GST) */
  cost: number;
};

export const ADS_CATEGORY = "Ads wallet";

/**
 * Turns morning readings + recharges into spend periods.
 * A recharge dated on a reading day is counted AFTER that morning's reading.
 */
export function walletPeriods(readings: Reading[], recharges: Recharge[], gstPercent = 0): Period[] {
  const g = Math.max(0, gstPercent) / 100;
  const rs = [...readings].sort((a, b) => (a.date < b.date ? -1 : 1));
  const out: Period[] = [];
  for (let i = 0; i + 1 < rs.length; i++) {
    const a = rs[i];
    const b = rs[i + 1];
    const inside = recharges.filter((r) => r.date >= a.date && r.date < b.date);
    const paid = inside.reduce((s, r) => s + r.amount, 0);
    const credited = paid / (1 + g);
    const metaSpend = a.balance + credited - b.balance;
    out.push({
      from: a.date,
      to: shiftDays(b.date, -1),
      days: eachDay(a.date, shiftDays(b.date, -1)).length,
      opening: a.balance,
      recharges: inside,
      rechargePaid: paid,
      rechargeCredited: Math.round(credited),
      closing: b.balance,
      metaSpend: Math.round(metaSpend),
      cost: Math.round(metaSpend * (1 + g)),
    });
  }
  return out;
}

/** Spreads each period's cost over its days (a skipped morning splits evenly). date → ₹ */
export function spendByDay(periods: Period[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of periods) {
    const days = eachDay(p.from, p.to);
    const each = Math.floor(p.cost / days.length);
    days.forEach((d, i) => m.set(d, each + (i === days.length - 1 ? p.cost - each * days.length : 0)));
  }
  return m;
}
