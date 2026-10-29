"use client";

import { useState } from "react";

const label = (m: string) =>
  new Date(m + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

/** Download one month as an Excel file: summary with all calculations + every order, expense, staff day… */
export function BackupCard({ months }: { months: string[] }) {
  const [month, setMonth] = useState(months[0]);
  const [state, setState] = useState<{ busy: boolean; msg: string | null; ok?: boolean }>({ busy: false, msg: null });

  async function download() {
    setState({ busy: true, msg: null });
    try {
      const res = await fetch(`/backup?m=${month}`, { cache: "no-store" });
      if (!res.ok) throw new Error((await res.text()) || "Backup failed");
      if (!res.headers.get("content-type")?.includes("spreadsheet")) throw new Error("Please log in again, then try");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kartzo-backup-${month}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setState({ busy: false, msg: `${label(month)} backup downloaded`, ok: true });
    } catch (e) {
      setState({ busy: false, msg: e instanceof Error ? e.message : "Backup failed", ok: false });
    }
  }

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-stone-500">
          Month
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="mt-1 block w-60 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
          >
            {months.map((m, i) => (
              <option key={m} value={m}>
                {label(m)}
                {i === 0 ? " (this month)" : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={download}
          disabled={state.busy}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {state.busy ? (
            <>
              <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
              Preparing…
            </>
          ) : (
            <>
              <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden>
                <path d="M10 2.5a.75.75 0 0 1 .75.75v7.69l2.47-2.47a.75.75 0 1 1 1.06 1.06l-3.75 3.75a.75.75 0 0 1-1.06 0L5.72 9.53a.75.75 0 0 1 1.06-1.06l2.47 2.47V3.25A.75.75 0 0 1 10 2.5ZM3.5 13.75a.75.75 0 0 1 .75.75v.75c0 .69.56 1.25 1.25 1.25h9a1.25 1.25 0 0 0 1.25-1.25v-.75a.75.75 0 0 1 1.5 0v.75A2.75 2.75 0 0 1 14.5 18h-9a2.75 2.75 0 0 1-2.75-2.75v-.75a.75.75 0 0 1 .75-.75Z" />
              </svg>
              Download Excel backup
            </>
          )}
        </button>
        {state.msg && <span className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-600"}`}>{state.ok ? "✓ " : ""}{state.msg}</span>}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-stone-500">
        One Excel file with: <b>Summary</b> (sales, costs, ads, staff, expenses, net profit, order counts, COD), <b>Daily</b>, every{" "}
        <b>Order</b> with customer and tracking, <b>Products</b> profit, <b>Staff</b> pay, <b>Expenses</b>, <b>Ad wallet</b>, <b>COD received</b>,{" "}
        <b>Stock in</b> and product prices. Save it to Google Drive once a month.
      </p>
    </div>
  );
}
