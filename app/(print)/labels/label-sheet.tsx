"use client";

import { useState, useTransition } from "react";
import { markLabelsPrinted } from "../../(app)/dispatch/actions";

export type LabelOrder = {
  id: string;
  order_code: string;
  order_date: string;
  customer_name: string;
  phone: string | null;
  address: string | null;
  pincode: string | null;
  payment_mode: "paid" | "cod";
  order_type: "normal" | "replacement";
  order_value: number;
  cod_balance: number;
  notes: string | null;
  items: { qty: number; product: { name: string } | null }[];
};

type Layout = "a4-4" | "a4-2" | "4x6";

const PAGE: Record<Layout, { css: string; perPage: number; w: string; h: string; cols: number }> = {
  "a4-4": { css: "A4 portrait", perPage: 4, w: "105mm", h: "148.5mm", cols: 2 },
  "a4-2": { css: "A4 portrait", perPage: 2, w: "210mm", h: "148.5mm", cols: 1 },
  "4x6": { css: "4in 6in", perPage: 1, w: "4in", h: "6in", cols: 1 },
};

const rs = (n: number) => "₹" + n.toLocaleString("en-IN");

export function LabelSheet({
  orders,
  initialLayout,
  from,
  note,
}: {
  orders: LabelOrder[];
  initialLayout: Layout;
  from: { name: string; address: string; phone: string };
  note: string;
}) {
  const [layout, setLayout] = useState<Layout>(initialLayout);
  const [marked, setMarked] = useState(false);
  const [, startTransition] = useTransition();
  const p = PAGE[layout];

  const pages: LabelOrder[][] = [];
  for (let i = 0; i < orders.length; i += p.perPage) pages.push(orders.slice(i, i + p.perPage));

  function print() {
    window.print();
    if (!marked) {
      setMarked(true);
      startTransition(async () => {
        await markLabelsPrinted(orders.map((o) => o.id));
      });
    }
  }

  return (
    <div className="min-h-screen bg-stone-200 print:bg-white">
      <style>{`
        @page { size: ${p.css}; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          .sheet { box-shadow: none !important; margin: 0 !important; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-stone-300 bg-white px-5 py-3 shadow-sm">
        <span className="font-semibold">
          {orders.length} label{orders.length === 1 ? "" : "s"} · {pages.length} page{pages.length === 1 ? "" : "s"}
        </span>
        <div className="flex gap-1 rounded-lg bg-stone-100 p-1">
          {(
            [
              ["a4-4", "A4 · 4 per page"],
              ["a4-2", "A4 · 2 per page"],
              ["4x6", "4×6 thermal"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setLayout(k)}
              className={`rounded-md px-3 py-1.5 text-sm ${layout === k ? "bg-white font-medium shadow-sm ring-1 ring-stone-200" : "text-stone-600"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-stone-500">In the print window set Margins: None and Scale: 100%.</span>
        <button onClick={print} className="ml-auto rounded-lg bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
          🖨 Print
        </button>
      </div>

      {/* Pages */}
      <div className="flex flex-col items-center gap-6 py-6 print:block print:gap-0 print:py-0">
        {pages.map((pageOrders, pi) => (
          <div
            key={pi}
            className="sheet bg-white shadow-lg"
            style={{
              width: layout === "4x6" ? "4in" : "210mm",
              height: layout === "4x6" ? "6in" : "297mm",
              display: "grid",
              gridTemplateColumns: `repeat(${p.cols}, ${p.w})`,
              gridAutoRows: p.h,
              breakAfter: pi < pages.length - 1 ? "page" : "auto",
              overflow: "hidden",
            }}
          >
            {pageOrders.map((o) => (
              <Label key={o.id} o={o} from={from} note={note} big={layout === "a4-2"} dashed={layout !== "4x6"} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Label({
  o,
  from,
  note,
  big,
  dashed,
}: {
  o: LabelOrder;
  from: { name: string; address: string; phone: string };
  note: string;
  big: boolean;
  dashed: boolean;
}) {
  const cod = o.order_type !== "replacement" && o.cod_balance > 0;
  const products = o.items.map((i) => `${i.product?.name ?? "?"}${i.qty > 1 ? ` × ${i.qty}` : ""}`).join(" + ");
  const pcs = o.items.reduce((s, i) => s + i.qty, 0);
  const s = big ? 1.25 : 1; // scale text up on the bigger label

  return (
    <div
      className="flex flex-col text-black"
      style={{
        padding: "6mm",
        outline: dashed ? "1px dashed #bbb" : "none",
        outlineOffset: "-0.5px",
        fontFamily: "Arial, Helvetica, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Payment box */}
      <div className="flex items-stretch gap-2">
        <div
          className="flex flex-1 flex-col items-center justify-center rounded-sm border-[2.5px] border-black py-1"
          style={{ background: cod ? "#000" : "#fff", color: cod ? "#fff" : "#000" }}
        >
          {cod ? (
            <>
              <div style={{ fontSize: `${11 * s}pt`, fontWeight: 700, letterSpacing: "0.08em" }}>COD</div>
              <div style={{ fontSize: `${22 * s}pt`, fontWeight: 800, lineHeight: 1 }}>{rs(o.cod_balance)}</div>
              <div style={{ fontSize: `${7 * s}pt` }}>Collect from receiver</div>
            </>
          ) : (
            <div style={{ fontSize: `${18 * s}pt`, fontWeight: 800, letterSpacing: "0.06em" }}>
              {o.order_type === "replacement" ? "NO COD" : "PREPAID"}
            </div>
          )}
        </div>
        <div className="flex w-[34%] flex-col justify-center rounded-sm border border-black px-1.5 text-center" style={{ fontSize: `${8 * s}pt` }}>
          <div style={{ fontWeight: 700, fontSize: `${10 * s}pt` }}>{o.order_code}</div>
          <div>{o.order_date.split("-").reverse().join("-")}</div>
          <div>
            {pcs} pc{pcs === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {/* TO */}
      <div className="mt-3 flex-1">
        <div style={{ fontSize: `${8 * s}pt`, fontWeight: 700, letterSpacing: "0.1em" }}>TO</div>
        <div style={{ fontSize: `${15 * s}pt`, fontWeight: 800, lineHeight: 1.15, textTransform: "uppercase" }}>{o.customer_name}</div>
        <div style={{ fontSize: `${11 * s}pt`, lineHeight: 1.3, whiteSpace: "pre-line", marginTop: "1mm" }}>{(o.address ?? "").replace(/,\s*/g, ", ")}</div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="rounded-sm border-2 border-black px-2" style={{ fontSize: `${17 * s}pt`, fontWeight: 800, letterSpacing: "0.12em" }}>
            PIN {o.pincode}
          </span>
          <span style={{ fontSize: `${12 * s}pt`, fontWeight: 700 }}>Ph: {o.phone}</span>
        </div>
      </div>

      {/* Contents */}
      <div className="mt-2 border-t border-black pt-1" style={{ fontSize: `${8 * s}pt` }}>
        <b>Contents:</b> {products}
        {o.notes ? <span> · {o.notes}</span> : null}
      </div>

      {/* FROM */}
      <div className="mt-1.5 border-t-2 border-black pt-1.5" style={{ fontSize: `${8.5 * s}pt`, lineHeight: 1.3 }}>
        <span style={{ fontWeight: 700, letterSpacing: "0.1em" }}>FROM: </span>
        <b>{from.name}</b>
        {from.address ? `, ${from.address}` : ""}
        {from.phone ? ` · Ph: ${from.phone}` : ""}
        {note && <div style={{ fontSize: `${7 * s}pt`, marginTop: "0.5mm" }}>{note}</div>}
      </div>
    </div>
  );
}
