"use client";

import { useState, useTransition } from "react";
import { saveBusinessSettings } from "../staff/actions";

type Values = { business_name: string; business_address: string; business_phone: string; staff_name: string };

export function BusinessForm({ initial }: { initial: Values }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const input =
    "mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";
  const field = (k: keyof Values, label: string, placeholder?: string) => (
    <label className="block text-xs font-medium text-stone-500">
      {label}
      <input value={v[k]} placeholder={placeholder} onChange={(e) => setV({ ...v, [k]: e.target.value })} className={input} />
    </label>
  );

  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-stone-200">
      <div className="grid gap-3 sm:grid-cols-2">
        {field("business_name", "Business name", "Kartzo")}
        {field("business_phone", "Phone (optional)", "98xxxxxxxx")}
        {field("business_address", "Address", "Edappally, Ernakulam, Kerala")}
        {field("staff_name", "Staff name (for payout receipts)", "e.g. Rahul")}
      </div>
      <div className="mt-4 flex items-center justify-end gap-3">
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.ok ? "✓ " : ""}{msg.text}</span>}
        <button
          onClick={() => startTransition(async () => {
            const r = await saveBusinessSettings(v);
            setMsg({ ok: r.ok, text: r.message });
          })}
          disabled={pending}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
