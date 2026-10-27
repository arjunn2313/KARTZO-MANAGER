"use client";

import { toPng } from "html-to-image";
import { useRef, useState } from "react";
import type { StaffDay, Week } from "./staff-view";

export type Business = { name: string; address: string; phone: string; staffName: string; ready: boolean };

const rs = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const longDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dayLabel = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });

export function receiptNo(week: Week) {
  return `KZT-PAY-${week.start.replace(/-/g, "")}`;
}

export function ReceiptDialog({ week, business, today, onClose }: { week: Week; business: Business; today: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<null | "share" | "download" | "print">(null);
  const [note, setNote] = useState<string | null>(null);

  const worked = week.days.filter((d) => d.amount > 0 || d.bonus > 0);
  const wages = worked.reduce((s, d) => s + d.amount, 0);
  const bonuses = worked.filter((d) => d.bonus > 0);
  const bonusTotal = bonuses.reduce((s, d) => s + d.bonus, 0);
  const total = wages + bonusTotal;
  const orders = worked.reduce((s, d) => s + (d.ordersTaken ?? 0), 0);
  const allPaid = worked.length > 0 && worked.every((d) => d.paid);
  const paidDate = worked.find((d) => d.paidDate)?.paidDate ?? null;
  const no = receiptNo(week);
  const fileName = `${no}.png`;

  async function makePng() {
    if (!ref.current) throw new Error("Receipt not ready");
    return toPng(ref.current, { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true });
  }

  async function download() {
    setBusy("download");
    setNote(null);
    try {
      const url = await makePng();
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      setNote("Image downloaded.");
    } catch {
      setNote("Couldn't create the image. Try Print instead.");
    }
    setBusy(null);
  }

  async function share() {
    setBusy("share");
    setNote(null);
    try {
      const url = await makePng();
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], fileName, { type: "image/png" });
      const text = `${business.name} payout ${longDate(week.start)} – ${longDate(week.end)}: ${rs(total)}`;
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Payout receipt ${no}`, text });
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        setNote("Sharing isn't available in this browser, so the image was downloaded. Attach it in WhatsApp.");
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setNote("Couldn't share. Try Download instead.");
    }
    setBusy(null);
  }

  async function print() {
    setBusy("print");
    try {
      const url = await makePng();
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(
          `<html><head><title>${no}</title><style>@page{margin:12mm}body{margin:0;display:flex;justify-content:center}img{width:100%;max-width:520px}</style></head><body><img src="${url}" onload="setTimeout(()=>{window.print()},200)"/></body></html>`,
        );
        w.document.close();
      } else setNote("Allow pop-ups for this site to print.");
    } catch {
      setNote("Couldn't prepare the receipt for printing.");
    }
    setBusy(null);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex max-h-[94vh] w-full flex-col rounded-t-2xl bg-stone-100 shadow-xl sm:max-w-[520px] sm:rounded-2xl">
        <div className="flex items-center justify-between px-5 py-3">
          <h2 className="font-semibold">Payout receipt</h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-stone-400 hover:bg-stone-200" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          {/* ---------- the receipt itself (this is what becomes the image) ---------- */}
          <div ref={ref} className="mx-auto w-full max-w-[460px] bg-white p-7 text-stone-900" style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-lg bg-emerald-600 text-sm font-bold text-white">
                    {business.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-xl font-bold tracking-tight">{business.name}</span>
                </div>
                {business.address && <div className="mt-1.5 text-xs text-stone-500">{business.address}</div>}
                {business.phone && <div className="text-xs text-stone-500">Ph: {business.phone}</div>}
              </div>
              <div className="text-right">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Payout receipt</div>
                <div className="mt-1 text-xs font-medium">{no}</div>
                <div className="text-xs text-stone-500">{longDate(paidDate ?? today)}</div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 rounded-lg bg-stone-50 p-3 text-sm">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-stone-400">Paid to</div>
                <div className="font-semibold">{business.staffName || "Staff"}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-stone-400">Period</div>
                <div className="font-semibold">
                  {longDate(week.start)} – {longDate(week.end)}
                </div>
              </div>
            </div>

            <table className="mt-5 w-full text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
              <thead>
                <tr className="border-b border-stone-200 text-left text-[11px] uppercase tracking-wide text-stone-400">
                  <th className="pb-2 font-medium">Day</th>
                  <th className="pb-2 text-right font-medium">Orders</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {worked
                  .filter((d) => d.amount > 0)
                  .map((d: StaffDay) => (
                    <tr key={d.date} className="border-b border-stone-100">
                      <td className="py-1.5">{dayLabel(d.date)}</td>
                      <td className="py-1.5 text-right text-stone-600">{d.ordersTaken ?? "–"}</td>
                      <td className="py-1.5 text-right">{rs(d.amount)}</td>
                    </tr>
                  ))}
                {bonuses.map((d) => (
                  <tr key={`b-${d.date}`} className="border-b border-stone-100">
                    <td className="py-1.5" colSpan={2}>
                      Bonus{d.bonusNote ? ` – ${d.bonusNote}` : ""} <span className="text-stone-400">({dayLabel(d.date)})</span>
                    </td>
                    <td className="py-1.5 text-right">{rs(d.bonus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between text-stone-600">
                <span>
                  Wages ({worked.filter((d) => d.amount > 0).length} days, {orders} orders)
                </span>
                <span>{rs(wages)}</span>
              </div>
              {bonusTotal > 0 && (
                <div className="flex justify-between text-stone-600">
                  <span>Bonus</span>
                  <span>{rs(bonusTotal)}</span>
                </div>
              )}
              <div className="mt-2 flex items-baseline justify-between border-t-2 border-stone-900 pt-2">
                <span className="font-semibold">Total</span>
                <span className="text-2xl font-bold">{rs(total)}</span>
              </div>
            </div>

            <div className="mt-6 flex items-end justify-between">
              <span
                className={`rounded-md border-2 px-3 py-1 text-sm font-bold uppercase tracking-wider ${
                  allPaid ? "border-emerald-600 text-emerald-700" : "border-amber-500 text-amber-700"
                }`}
              >
                {allPaid ? `Paid${paidDate ? ` · ${longDate(paidDate)}` : ""}` : "Payment due"}
              </span>
              <div className="text-center">
                <div className="h-8 w-32 border-b border-stone-300" />
                <div className="mt-1 text-[11px] text-stone-400">Signature</div>
              </div>
            </div>

            <div className="mt-6 text-center text-[11px] text-stone-400">Thank you for your work this week.</div>
          </div>
          {/* ---------- end receipt ---------- */}
          {!business.staffName && (
            <p className="mx-auto mt-3 max-w-[460px] text-xs text-stone-500">
              Tip: add the staff member&apos;s name in <b>Settings → Business details</b> so it shows on the receipt.
            </p>
          )}
        </div>

        <div className="space-y-2 px-5 py-4">
          {note && <p className="text-center text-xs text-stone-600">{note}</p>}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={share}
              disabled={!!busy}
              className="rounded-lg bg-emerald-700 px-3 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {busy === "share" ? "Preparing…" : "Share"}
            </button>
            <button
              onClick={download}
              disabled={!!busy}
              className="rounded-lg bg-white px-3 py-2.5 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50 disabled:opacity-60"
            >
              {busy === "download" ? "Preparing…" : "Download"}
            </button>
            <button
              onClick={print}
              disabled={!!busy}
              className="rounded-lg bg-white px-3 py-2.5 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50 disabled:opacity-60"
            >
              {busy === "print" ? "Preparing…" : "Print / PDF"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
