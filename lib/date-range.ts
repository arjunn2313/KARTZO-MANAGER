import { eachDay, shiftDays } from "@/lib/dashboard";

export type RangePreset = { key: string; label: string; from: string; to: string };

export function rangePresets(today: string): RangePreset[] {
  const monthStart = today.slice(0, 8) + "01";
  const lastMonthEnd = shiftDays(monthStart, -1);
  const lastMonthStart = lastMonthEnd.slice(0, 8) + "01";
  return [
    { key: "today", label: "Today", from: today, to: today },
    { key: "yesterday", label: "Yesterday", from: shiftDays(today, -1), to: shiftDays(today, -1) },
    { key: "7d", label: "Last 7 days", from: shiftDays(today, -6), to: today },
    { key: "30d", label: "Last 30 days", from: shiftDays(today, -29), to: today },
    { key: "month", label: "This month", from: monthStart, to: today },
    { key: "lastmonth", label: "Last month", from: lastMonthStart, to: lastMonthEnd },
    { key: "90d", label: "Last 90 days", from: shiftDays(today, -89), to: today },
  ];
}

/** Reads ?range= or ?from=&to= into a concrete date range. */
export function resolveRange(sp: Record<string, string | string[] | undefined>, today: string, defaultKey: string) {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const presets = rangePresets(today);
  let key = one(sp.range) ?? defaultKey;
  let from: string;
  let to: string;
  const preset = presets.find((p) => p.key === key);
  if (preset) ({ from, to } = preset);
  else if (isDate(one(sp.from)) && isDate(one(sp.to))) {
    key = "custom";
    from = one(sp.from)!;
    to = one(sp.to)!;
    if (from > to) [from, to] = [to, from];
  } else {
    const d = presets.find((p) => p.key === defaultKey)!;
    key = d.key;
    ({ from, to } = d);
  }
  return { key, from, to, days: eachDay(from, to).length, presets: presets.map(({ key, label }) => ({ key, label })) };
}
