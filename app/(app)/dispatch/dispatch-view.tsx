"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { rs } from "@/components/charts/chart-utils";
import { Pager, usePaged } from "@/components/pager";
import { postbulkBlock } from "@/lib/address";
import { buildMessage, copyText, whatsappLink, type Lang } from "@/lib/dispatch";
import { extractTrackingIds } from "@/lib/parser/whatsapp";
import { setTrackingIds } from "../orders/actions";
import { markWhatsAppSent, saveDispatchSettings, type Result } from "./actions";

export type DispatchOrder = {
  id: string;
  order_code: string;
  order_date: string;
  created_at?: string;
  dispatch_date: string | null;
  customer_name: string;
  /** address lines ready for postbulk (to-pack orders only) */
  address?: string | null;
  phone: string | null;
  pincode: string | null;
  payment_mode: "paid" | "cod";
  order_type: "normal" | "replacement";
  order_value: number;
  cod_balance: number;
  tracking_id: string | null;
  status: string;
  whatsapp_sent_at: string | null;
  label_printed_at: string | null;
  items: { qty: number; product: { id: string; name: string } | null }[];
  courier?: { name: string } | null;
};

type Templates = Record<Lang, string>;
type Filter = "todo" | "sent" | "all";

const dmy = (iso: string) => iso.split("-").reverse().join("-");
const products = (o: DispatchOrder) => o.items.map((i) => (i.qty > 1 ? `${i.product?.name ?? "?"} × ${i.qty}` : (i.product?.name ?? "?"))).join(" + ");
const periodLabel = (d: string) => (d === "all" ? "all time" : `last ${d} days`);
/** Orders still out with the courier (not RTO / returned) that have tracking and haven't been messaged. */
const needsMessage = (o: DispatchOrder) => (o.status === "dispatched" || o.status === "delivered") && !!o.tracking_id && !o.whatsapp_sent_at && !!o.phone;

export function DispatchView({
  today,
  days,
  initialTab,
  toPack,
  dispatched,
  business,
  templates,
  labelNote,
}: {
  today: string;
  days: string;
  initialTab?: "send" | "sent";
  toPack: DispatchOrder[];
  dispatched: DispatchOrder[];
  business: string;
  templates: Templates;
  labelNote: string;
}) {
  const pendingMsgs = dispatched.filter(needsMessage);
  const [tab, setTab] = useState<"pack" | "send">(initialTab ? "send" : toPack.length || !pendingMsgs.length ? "pack" : "send");
  const [filter, setFilter] = useState<Filter>(initialTab === "sent" ? "sent" : "todo");
  const [toast, setToast] = useState<Result | null>(null);
  const [editing, setEditing] = useState(false);

  function showToast(r: Result) {
    setToast(r);
    setTimeout(() => setToast(null), r.ok ? 2200 : 5000);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dispatch</h1>
          <p className="mt-1 text-sm text-stone-500">Pack → print labels → book at the post office → add tracking IDs → send WhatsApp messages.</p>
        </div>
        <button onClick={() => setEditing(true)} className="rounded-lg px-3 py-2 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-white">
          Edit messages & label note
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Step n={1} label="To pack" value={toPack.length} sub={`${toPack.filter((o) => o.label_printed_at).length} labels printed`} active={tab === "pack"} onClick={() => setTab("pack")} />
        <Step
          n={2}
          label="Need tracking ID"
          value={dispatched.filter((o) => o.status === "dispatched" && !o.tracking_id).length}
          sub="Add on the Orders page"
          href="/orders?status=dispatched&range=7d"
        />
        <Step
          n={3}
          label="Messages to send"
          value={pendingMsgs.length}
          sub="WhatsApp tracking"
          active={tab === "send" && filter === "todo"}
          onClick={() => {
            setTab("send");
            setFilter("todo");
          }}
        />
        <Step
          n={4}
          label="Tracking sent"
          value={dispatched.filter((o) => o.whatsapp_sent_at).length}
          sub={`${periodLabel(days)} · view all →`}
          active={tab === "send" && filter === "sent"}
          onClick={() => {
            setTab("send");
            setFilter("sent");
          }}
        />
      </div>

      {tab === "pack" ? (
        <PackList orders={toPack} today={today} />
      ) : (
        <SendList orders={dispatched} days={days} filter={filter} setFilter={setFilter} business={business} templates={templates} today={today} onToast={showToast} />
      )}

      {editing && <SettingsDialog templates={templates} labelNote={labelNote} business={business} onClose={() => setEditing(false)} onToast={showToast} />}

      {toast && (
        <div className={`fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm font-medium shadow-lg ${toast.ok ? "bg-stone-900 text-white" : "bg-red-600 text-white"}`}>
          {toast.ok ? "✓ " : ""}
          {toast.message}
        </div>
      )}
    </div>
  );
}

function Step({
  n,
  label,
  value,
  sub,
  active,
  onClick,
  href,
}: {
  n: number;
  label: string;
  value: number;
  sub: string;
  active?: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-sm text-stone-500">
        <span className={`grid size-5 place-items-center rounded-full text-[11px] font-bold ${active ? "bg-emerald-600 text-white" : "bg-stone-200 text-stone-600"}`}>{n}</span>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-0.5 text-xs text-stone-500">{sub}</div>
    </>
  );
  const cls = `block rounded-2xl p-4 text-left ring-1 transition ${active ? "bg-white ring-2 ring-emerald-500" : "bg-white ring-stone-200 hover:ring-stone-300"}`;
  if (href)
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button onClick={onClick} className={cls}>
        {body}
      </button>
    );
  return <div className={cls}>{body}</div>;
}

/* ---------------- 1. To pack + labels ---------------- */

const LAYOUTS = [
  { key: "a4-4", label: "A4 · 4 per page" },
  { key: "a4-2", label: "A4 · 2 per page" },
  { key: "4x6", label: "4×6 in thermal" },
];

/** "CAR REAR VIEW MIRROR" or "CAR REAR VIEW MIRROR + PHONE HOLDER" (product set, quantities ignored) */
function groupOf(o: DispatchOrder) {
  const products = [...new Set(o.items.map((i) => (i.product?.name ?? "?").toUpperCase()))].sort().join(" + ") || "NO PRODUCT";
  return isIndiaPost(o) ? products : `${o.courier?.name ?? "Other"} · ${products}`;
}

/** India Post (or no courier set) → booked through postbulk */
const isIndiaPost = (o: DispatchOrder) => !o.courier || /india\s*post/i.test(o.courier.name);

function blockOf(o: DispatchOrder) {
  const ref =
    o.items.map((i) => `${i.product?.name ?? "?"}${i.qty > 1 ? ` x${i.qty}` : ""}`).join(" + ") + (o.order_type === "replacement" ? " (REPLACEMENT)" : "");
  return postbulkBlock({
    name: o.customer_name,
    address: o.address ?? "",
    phone: o.phone ?? "",
    paymentMode: o.cod_balance > 0 ? "cod" : "paid",
    codAmount: o.cod_balance,
    itemref: ref,
  });
}

/** Copies orders in the exact postbulk text format (selected ones, or one product group). */
function PostbulkCard({
  orders,
  chosen: picked,
  groups,
}: {
  orders: DispatchOrder[];
  chosen: DispatchOrder[];
  groups: { key: string; combo: boolean; post: boolean; ids: string[] }[];
}) {
  // postbulk is only for India Post; other couriers are booked on their own site
  const chosen = picked.filter(isIndiaPost);
  const others = picked.length - chosen.length;
  const [copied, setCopied] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const byId = new Map(orders.map((o) => [o.id, o]));
  const problem = (o: DispatchOrder) => {
    const pins = (o.address ?? "").match(/(?<!\d)[1-9]\d{5}(?!\d)/g) ?? ([] as string[]);
    return (
      !/^[6-9]\d{9}$/.test(o.phone ?? "") ||
      !/^[1-9]\d{5}$/.test(o.pincode ?? "") ||
      !(o.address ?? "").trim() ||
      (pins.length > 0 && !pins.includes(o.pincode ?? ""))
    );
  };
  const bad = chosen.filter(problem);

  // the exact orders last copied, in the same order (postbulk gives barcodes back in this order)
  const [batch, setBatch] = useState<string[]>([]);
  async function copy(key: string, list: DispatchOrder[]) {
    if (!list.length) return;
    if (await copyText(list.map(blockOf).join("\n\n"))) {
      setCopied(key);
      setBatch(list.map((o) => o.id));
      setTimeout(() => setCopied(null), 2500);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-stone-200">
      <h2 className="font-semibold">Copy for postbulk</h2>
      <p className="text-xs text-stone-500">Orders are copied first added first. Paste into postbulk to make barcodes, then paste the barcodes back here.</p>
      <button
        type="button"
        onClick={() => copy("sel", chosen)}
        disabled={!chosen.length}
        className="mt-3 w-full rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-40"
      >
        {copied === "sel" ? `✓ Copied ${chosen.length} orders` : `Copy ${chosen.length} selected order${chosen.length === 1 ? "" : "s"}`}
      </button>
      {others > 0 && (
        <p className="mt-2 text-xs text-stone-500">
          {others} selected order{others === 1 ? " is" : "s are"} for another courier (DTDC…), so not included. Copy {others === 1 ? "it" : "them"} from the list below.
        </p>
      )}
      {bad.length > 0 && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          {bad.length} selected order{bad.length === 1 ? " has" : "s have"} a missing phone, pincode or address, or the pincode in the address doesn&apos;t match: {bad.map((o) => o.order_code).join(", ")}. Fix
          {bad.length === 1 ? " it" : " them"} in Orders first.
        </p>
      )}
      {groups.length > 1 && (
        <ul className="mt-3 divide-y divide-stone-100 rounded-lg ring-1 ring-stone-200">
          {groups.map((g) => (
            <li key={g.key} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 text-xs text-stone-700">
                {!g.post && <span className="font-semibold text-sky-700">Not postbulk · </span>}
                {g.combo && <span className="font-semibold text-amber-700">Combo · </span>}
                {g.key} <b className="text-stone-900">{g.ids.length}</b>
              </span>
              <button
                type="button"
                onClick={() => copy(g.key, g.ids.map((id) => byId.get(id)!).filter(Boolean))}
                className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50"
              >
                {copied === g.key ? "Copied ✓" : "Copy"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {chosen.length > 0 && (
        <button type="button" onClick={() => setShow(!show)} className="mt-3 text-xs font-medium text-emerald-700 hover:underline">
          {show ? "Hide preview" : "Preview"}
        </button>
      )}
      {batch.length > 0 && <BarcodePaste orders={batch.map((id) => byId.get(id)).filter((o): o is DispatchOrder => !!o)} onDone={() => setBatch([])} />}
      {show && chosen.length > 0 && (
        <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-stone-900 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-stone-100">
          {chosen.map(blockOf).join("\n\n")}
        </pre>
      )}
    </section>
  );
}

/** Step 2: paste the barcodes postbulk made; they go to the copied orders in the same order. */
function BarcodePaste({ orders, onDone }: { orders: DispatchOrder[]; onDone: () => void }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [saving, startSave] = useTransition();
  const ids = extractTrackingIds(text);
  const dupes = ids.filter((t, i) => ids.indexOf(t) !== i);
  const mismatch = ids.length > 0 && ids.length !== orders.length;

  function save() {
    startSave(async () => {
      const items = orders.map((o, i) => ({ id: o.id, tracking_id: ids[i] ?? "" })).filter((x) => x.tracking_id);
      const r = await setTrackingIds(items, true);
      setResult(r);
      if (r.ok) {
        setText("");
        setTimeout(onDone, 2500);
      }
    });
  }

  return (
    <div className="mt-4 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
      <div className="text-sm font-semibold text-stone-900">Then paste the barcodes</div>
      <p className="text-xs text-stone-500">
        For the {orders.length} order{orders.length === 1 ? "" : "s"} you just copied, in the same order (first added first). They&apos;re marked Dispatched.
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setResult(null);
        }}
        rows={3}
        placeholder={"CX064397338IN\nCX064397339IN\n…"}
        className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-xs uppercase outline-none placeholder:normal-case focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
      />
      {ids.length > 0 && (
        <>
          <div className={`mt-1 text-xs ${mismatch ? "text-amber-700" : "text-emerald-700"}`}>
            {ids.length} barcode{ids.length === 1 ? "" : "s"} for {orders.length} order{orders.length === 1 ? "" : "s"}
            {mismatch && (ids.length < orders.length ? ": the last orders stay without one" : ": extra barcodes are ignored")}
          </div>
          {dupes.length > 0 && <div className="mt-1 text-xs text-red-600">Repeated: {[...new Set(dupes)].join(", ")}</div>}
          <ol className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs">
            {orders.map((o, i) => (
              <li key={o.id} className="flex items-center gap-2 rounded-md bg-white px-2 py-1 ring-1 ring-stone-200">
                <span className="w-4 text-right text-stone-400">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">
                  <b className="text-stone-800">{o.customer_name}</b> <span className="text-stone-400">{o.order_code}</span>
                </span>
                <span className={`font-mono ${ids[i] ? "text-emerald-700" : "text-stone-300"}`}>{ids[i] ?? "—"}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      {result && <p className={`mt-2 text-xs font-medium ${result.ok ? "text-emerald-700" : "text-red-600"}`}>{result.ok ? "✓ " : ""}{result.message}</p>}
      <button
        type="button"
        onClick={save}
        disabled={!ids.length || dupes.length > 0 || saving}
        className="mt-2 w-full rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-40"
      >
        {saving ? "Saving…" : `Save ${Math.min(ids.length, orders.length) || ""} barcodes & mark Dispatched`}
      </button>
    </div>
  );
}

/** First added first (the order postbulk gets them in, so its barcodes come back in the same order). */
function oldestFirst(a: DispatchOrder, b: DispatchOrder) {
  return (
    a.order_date.localeCompare(b.order_date) ||
    (a.created_at ?? "").localeCompare(b.created_at ?? "") ||
    (Number(a.order_code.replace(/\D/g, "")) || 0) - (Number(b.order_code.replace(/\D/g, "")) || 0)
  );
}

function PackList({ orders: unsorted, today }: { orders: DispatchOrder[]; today: string }) {
  const orders = useMemo(() => [...unsorted].sort(oldestFirst), [unsorted]);
  const [selected, setSelected] = useState<Set<string>>(new Set(orders.filter((o) => !o.label_printed_at).map((o) => o.id)));
  // product filter: orders that contain a product, only combos, or one courier
  const [show, setShow] = useState<string>("all");
  const filters = useMemo(() => {
    const out: { key: string; label: string; test: (o: DispatchOrder) => boolean; tone?: "combo" | "courier" }[] = [];
    const names = new Map<string, string>();
    for (const o of orders) for (const i of o.items) if (i.product) names.set(i.product.id, i.product.name);
    for (const [id, name] of [...names].sort((a, b) => a[1].localeCompare(b[1])))
      out.push({ key: `p:${id}`, label: name, test: (o) => o.items.some((i) => i.product?.id === id) });
    out.push({ key: "combo", label: "Combos", tone: "combo", test: (o) => new Set(o.items.map((i) => i.product?.id)).size > 1 });
    const couriers = [...new Set(orders.filter((o) => !isIndiaPost(o)).map((o) => o.courier?.name ?? "Other"))];
    for (const c of couriers) out.push({ key: `c:${c}`, label: c, tone: "courier", test: (o) => !isIndiaPost(o) && (o.courier?.name ?? "Other") === c });
    return out.map((f) => ({ ...f, count: orders.filter(f.test).length })).filter((f) => f.count > 0);
  }, [orders]);
  const active = filters.find((f) => f.key === show);
  const shown = active ? orders.filter(active.test) : orders;
  const { pageItems, pager } = usePaged(shown, "dispatch-pack", 50);
  function pickFilter(key: string) {
    setShow(key);
    const f = filters.find((x) => x.key === key);
    // selecting a filter selects exactly those orders (ready to copy / print)
    setSelected(new Set((f ? orders.filter(f.test) : orders).map((o) => o.id)));
  }
  const [layout, setLayout] = useState("a4-4");

  const chosen = orders.filter((o) => selected.has(o.id));
  const packing = useMemo(() => {
    const m = new Map<string, { name: string; qty: number }>();
    for (const o of chosen)
      for (const i of o.items) {
        const k = i.product?.id ?? "?";
        const cur = m.get(k) ?? { name: i.product?.name ?? "?", qty: 0 };
        cur.qty += i.qty;
        m.set(k, cur);
      }
    return [...m.values()].sort((a, b) => b.qty - a.qty);
  }, [chosen]);

  const all = shown.length > 0 && shown.every((o) => selected.has(o.id));

  // product groups: each single product, and each combo on its own
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; combo: boolean; post: boolean; ids: string[] }>();
    for (const o of orders) {
      const key = groupOf(o);
      const g = m.get(key) ?? { key, combo: key.includes(" + "), post: isIndiaPost(o), ids: [] };
      g.ids.push(o.id);
      m.set(key, g);
    }
    return [...m.values()].sort((a, b) => Number(b.post) - Number(a.post) || Number(a.combo) - Number(b.combo) || b.ids.length - a.ids.length);
  }, [orders]);
  const labelsHref = `/labels?layout=${layout}&ids=${chosen.map((o) => o.id).join(",")}`;

  if (!orders.length)
    return (
      <div className="rounded-2xl bg-white p-10 text-center text-sm text-stone-500 ring-1 ring-stone-200">
        Nothing to pack. New orders appear here. <Link href="/orders/new" className="font-medium text-emerald-700 underline">Add orders</Link>
      </div>
    );

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <section className="rounded-2xl bg-white ring-1 ring-stone-200">
        <div className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-5 py-3">
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input type="checkbox" checked={all} onChange={() => setSelected(new Set(all ? [] : shown.map((o) => o.id)))} className="size-4 accent-emerald-700" />
            Select all ({shown.length})
          </label>
          <button onClick={() => setSelected(new Set(shown.filter((o) => !o.label_printed_at).map((o) => o.id)))} className="text-sm text-emerald-700 hover:underline">
            Only not printed
          </button>
        </div>
        {filters.length > 1 && (
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-b border-stone-100 px-5 py-2.5 sm:flex-wrap">
            {[{ key: "all", label: "All", count: orders.length, tone: undefined }, ...filters].map((f) => {
              const on = show === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => pickFilter(f.key)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ring-1 transition ${
                    on
                      ? "bg-stone-900 text-white ring-stone-900"
                      : f.tone === "combo"
                        ? "bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100"
                        : f.tone === "courier"
                          ? "bg-sky-50 text-sky-800 ring-sky-200 hover:bg-sky-100"
                          : "bg-white text-stone-700 ring-stone-200 hover:bg-stone-50"
                  }`}
                >
                  {f.label} <b>{f.count}</b>
                </button>
              );
            })}
          </div>
        )}
        <ul className="divide-y divide-stone-100">
          {pageItems.map((o) => (
            <li key={o.id}>
              <label className="flex cursor-pointer items-start gap-3 px-5 py-3 hover:bg-stone-50">
                <input
                  type="checkbox"
                  checked={selected.has(o.id)}
                  onChange={() =>
                    setSelected((prev) => {
                      const n = new Set(prev);
                      if (n.has(o.id)) n.delete(o.id);
                      else n.add(o.id);
                      return n;
                    })
                  }
                  className="mt-1 size-4 accent-emerald-700"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="font-medium text-stone-900">{o.customer_name}</span>
                    <span className="text-xs text-stone-400">
                      {o.order_code} · {o.order_date === today ? "today" : dmy(o.order_date)} · PIN {o.pincode}
                    </span>
                  </div>
                  <div className="text-sm text-stone-600">{products(o)}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {o.order_type === "replacement" ? (
                    <span className="rounded-md bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">REPLACEMENT</span>
                  ) : o.cod_balance > 0 ? (
                    <span className="rounded-md bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">COD {rs(o.cod_balance)}</span>
                  ) : (
                    <span className="rounded-md bg-emerald-700 px-2 py-0.5 text-xs font-semibold text-white">PREPAID</span>
                  )}
                  {!isIndiaPost(o) && <span className="rounded-md bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">{o.courier?.name}</span>}
                  {o.label_printed_at && <span className="text-[11px] text-stone-400">✓ label printed</span>}
                </div>
              </label>
            </li>
          ))}
        </ul>
        <Pager {...pager} noun="orders" className="border-t border-stone-100 px-5 py-3" />
      </section>

      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <PostbulkCard orders={orders} chosen={chosen} groups={groups} />

        <section className="rounded-2xl bg-white p-5 ring-1 ring-stone-200">
          <h2 className="font-semibold">Packing list</h2>
          <p className="text-xs text-stone-500">{chosen.length} orders selected</p>
          <ul className="mt-3 space-y-1.5">
            {packing.map((p) => (
              <li key={p.name} className="flex items-baseline justify-between text-sm">
                <span className="text-stone-700">{p.name}</span>
                <span className="text-lg font-semibold">{p.qty}</span>
              </li>
            ))}
            {!packing.length && <li className="text-sm text-stone-400">Select orders to see what to pack.</li>}
          </ul>
        </section>

        <section className="rounded-2xl bg-white p-5 ring-1 ring-stone-200">
          <h2 className="font-semibold">Print labels</h2>
          <div className="mt-3 grid gap-1.5">
            {LAYOUTS.map((l) => (
              <label key={l.key} className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1 ${layout === l.key ? "bg-emerald-50 ring-emerald-300" : "ring-stone-200 hover:bg-stone-50"}`}>
                <input type="radio" name="layout" checked={layout === l.key} onChange={() => setLayout(l.key)} className="accent-emerald-700" />
                {l.label}
              </label>
            ))}
          </div>
          <a
            href={chosen.length ? labelsHref : undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!chosen.length}
            className={`mt-4 block rounded-lg px-4 py-2.5 text-center text-sm font-medium text-white ${chosen.length ? "bg-emerald-700 hover:bg-emerald-800" : "pointer-events-none bg-stone-300"}`}
          >
            Print {chosen.length} label{chosen.length === 1 ? "" : "s"} →
          </a>
          <p className="mt-2 text-xs text-stone-500">Opens a print page in a new tab.</p>
        </section>
      </aside>
    </div>
  );
}


/* ---------------- 3. Send tracking on WhatsApp ---------------- */

const LANG_KEY = "kartzo.msgLang";
const langListeners = new Set<() => void>();
function readLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === "ml" ? "ml" : "en";
  } catch {
    return "en";
  }
}
function storeLang(l: Lang) {
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    /* private mode – just not remembered */
  }
  langListeners.forEach((f) => f());
}
/** Remembers English / Malayalam choice on this device. */
function useLang(): [Lang, (l: Lang) => void] {
  const lang = useSyncExternalStore(
    (cb) => {
      langListeners.add(cb);
      return () => langListeners.delete(cb);
    },
    readLang,
    () => "en" as Lang,
  );
  return [lang, storeLang];
}

const sentAt = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

const STATUS_CHIP: Record<string, string> = {
  delivered: "bg-sky-100 text-sky-800",
  rto: "bg-red-100 text-red-800",
  returned: "bg-red-100 text-red-800",
};

function SendList({
  orders,
  days,
  filter,
  setFilter,
  business,
  templates,
  today,
  onToast,
}: {
  orders: DispatchOrder[];
  days: string;
  filter: Filter;
  setFilter: (f: Filter) => void;
  business: string;
  templates: Templates;
  today: string;
  onToast: (r: Result) => void;
}) {
  const [lang, setLang] = useLang();
  const [preview, setPreview] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [q, setQ] = useState("");
  const [, startTransition] = useTransition();
  // optimistic: id → true (sent) / false (unsent) until the server refresh lands
  const [local, setLocal] = useState<Record<string, boolean>>({});

  const isSent = (o: DispatchOrder) => (o.id in local ? local[o.id] : !!o.whatsapp_sent_at);

  const counts = {
    todo: orders.filter((o) => needsMessage(o) && !local[o.id]).length,
    sent: orders.filter(isSent).length,
    all: orders.length,
  };

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter === "todo" && !(needsMessage(o) && !local[o.id])) return false;
      if (filter === "sent" && !(o.id in local ? local[o.id] : !!o.whatsapp_sent_at)) return false;
      if (!needle) return true;
      return [o.customer_name, o.order_code, o.phone ?? "", o.tracking_id ?? "", o.pincode ?? ""].some((s) => s.toLowerCase().includes(needle));
    });
  }, [orders, filter, q, local]);
  const { pageItems, pager } = usePaged(list, "dispatch-send", 25);

  function message(o: DispatchOrder) {
    return buildMessage(templates[lang], {
      name: o.customer_name,
      order: o.order_code,
      products: products(o),
      tracking: o.tracking_id ?? "",
      cod: o.cod_balance,
      business,
    });
  }

  function mark(o: DispatchOrder, sent: boolean, quiet = false) {
    setLocal((m) => ({ ...m, [o.id]: sent }));
    startTransition(async () => {
      const r = await markWhatsAppSent(o.id, sent);
      if (!r.ok || !quiet) onToast(r);
    });
  }

  function send(o: DispatchOrder) {
    if (!o.phone) return;
    window.open(whatsappLink(o.phone, message(o)), "_blank", "noopener");
    if (!isSent(o)) mark(o, true, true);
  }

  async function copy(text: string, what: string) {
    const ok = await copyText(text);
    onToast(ok ? { ok: true, message: `${what} copied` } : { ok: false, message: "Couldn't copy. Select the text and copy it by hand." });
  }

  function copyAll() {
    const lines = list.map((o) =>
      [o.order_code, o.customer_name, o.phone ?? "", o.tracking_id ?? "no tracking", o.cod_balance > 0 ? `COD ${o.cod_balance}` : "Prepaid"].join(" · "),
    );
    copy(lines.join("\n"), `${list.length} tracking IDs`);
  }

  const chips: [Filter, string][] = [
    ["todo", `To send (${counts.todo})`],
    ["sent", `Tracking sent (${counts.sent})`],
    ["all", `All dispatched (${counts.all})`],
  ];
  const tabParam = filter === "todo" ? "send" : "sent";

  return (
    <section className="rounded-2xl bg-white ring-1 ring-stone-200">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 px-5 py-3">
        {chips.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-full px-3 py-1 text-sm ${filter === k ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}
          >
            {label}
          </button>
        ))}
        <div className="flex items-center gap-1 text-sm text-stone-500">
          <span className="ml-1">Period:</span>
          {["14", "30", "90", "all"].map((d) => (
            <Link
              key={d}
              href={`/dispatch?days=${d}&tab=${tabParam}`}
              scroll={false}
              className={`rounded-md px-2 py-0.5 ${days === d ? "bg-emerald-50 font-medium text-emerald-800 ring-1 ring-emerald-200" : "hover:bg-stone-100"}`}
            >
              {d === "all" ? "All" : `${d}d`}
            </Link>
          ))}
        </div>
      </div>

      {/* Tools */}
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 px-5 py-2.5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, phone, tracking, order no…"
          className="w-full rounded-lg border border-stone-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 sm:w-72"
        />
        <div className="flex rounded-lg bg-stone-100 p-0.5 text-sm" role="group" aria-label="Message language">
          {(
            [
              ["en", "English"],
              ["ml", "മലയാളം"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} onClick={() => setLang(k)} className={`rounded-md px-3 py-1 ${lang === k ? "bg-white font-medium shadow-sm ring-1 ring-stone-200" : "text-stone-600"}`}>
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-sm text-stone-600">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="size-4 accent-emerald-700" />
          Show all messages
        </label>
        <button onClick={copyAll} disabled={!list.length} className="ml-auto rounded-lg px-3 py-1.5 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50 disabled:opacity-40">
          Copy list ({list.length})
        </button>
      </div>

      {list.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-stone-500">
          {q
            ? "No orders match your search."
            : filter === "todo"
              ? "All caught up. Every dispatched order with a tracking ID has been messaged. 🎉"
              : `No orders in the ${periodLabel(days)}. Try a longer period.`}
        </p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {pageItems.map((o) => {
            const sent = isSent(o);
            const open = showAll || preview === o.id;
            const canMsg = !!o.tracking_id && !!o.phone;
            return (
              <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="font-medium text-stone-900">{o.customer_name}</span>
                    <span className="text-xs text-stone-400">
                      {o.order_code} · dispatched {o.dispatch_date === today ? "today" : o.dispatch_date ? dmy(o.dispatch_date) : ""}
                    </span>
                    {STATUS_CHIP[o.status] && <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${STATUS_CHIP[o.status]}`}>{o.status}</span>}
                  </div>
                  <div className="text-sm text-stone-600">
                    {o.tracking_id ? (
                      <button onClick={() => copy(o.tracking_id!, "Tracking ID")} title="Copy tracking ID" className="font-mono hover:text-emerald-700 hover:underline">
                        {o.tracking_id}
                      </button>
                    ) : (
                      <span className="text-amber-700">No tracking ID yet</span>
                    )}{" "}
                    · {o.phone ?? "no phone"}
                    {o.cod_balance > 0 && <span className="text-stone-400"> · COD {rs(o.cod_balance)}</span>}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!showAll && (
                    <button onClick={() => setPreview(preview === o.id ? null : o.id)} className="px-1 text-sm text-stone-500 hover:text-stone-800">
                      {preview === o.id ? "Hide" : "Preview"}
                    </button>
                  )}
                  <button
                    onClick={() => copy(message(o), "Message")}
                    disabled={!o.tracking_id}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50 disabled:opacity-40"
                  >
                    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
                      <path d="M8 3h11a2 2 0 0 1 2 2v11h-2V5H8V3ZM4 7h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm0 2v11h11V9H4Z" />
                    </svg>
                    Copy
                  </button>
                  {sent ? (
                    <span className="flex items-center gap-2">
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800" title={o.whatsapp_sent_at ? `Sent ${sentAt(o.whatsapp_sent_at)}` : undefined}>
                        ✓ Sent{o.whatsapp_sent_at && !(o.id in local) ? ` · ${sentAt(o.whatsapp_sent_at)}` : ""}
                      </span>
                      <button onClick={() => send(o)} disabled={!canMsg} className="text-xs text-stone-500 hover:underline disabled:opacity-40">
                        Send again
                      </button>
                      <button onClick={() => mark(o, false)} className="text-xs text-stone-400 hover:underline">
                        Undo
                      </button>
                    </span>
                  ) : (
                    <>
                      <button
                        onClick={() => send(o)}
                        disabled={!canMsg}
                        className="flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-40"
                      >
                        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
                          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .2-1.2c-.1-.1-.3-.2-.5-.3Z" />
                        </svg>
                        WhatsApp
                      </button>
                      {o.tracking_id && (
                        <button onClick={() => mark(o, true)} className="text-xs text-stone-500 hover:underline" title="Use after you've sent it yourself (e.g. copied)">
                          Mark sent
                        </button>
                      )}
                    </>
                  )}
                </div>

                {open && o.tracking_id && (
                  <pre className="w-full whitespace-pre-wrap rounded-lg bg-[#e7ffdb] p-3 font-sans text-sm text-stone-800 ring-1 ring-emerald-100">{message(o)}</pre>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Pager {...pager} noun="orders" className="border-t border-stone-100 px-5 py-3" />
    </section>
  );
}

/* ---------------- Settings dialog ---------------- */

function SettingsDialog({
  templates,
  labelNote,
  business,
  onClose,
  onToast,
}: {
  templates: Templates;
  labelNote: string;
  business: string;
  onClose: () => void;
  onToast: (r: Result) => void;
}) {
  const [msgs, setMsgs] = useState<Templates>(templates);
  const [which, setWhich] = useState<Lang>("en");
  const [note, setNote] = useState(labelNote);
  const [pending, startTransition] = useTransition();
  const sample = buildMessage(msgs[which], { name: "FASIL SAMEER", order: "KZT2401", products: "Rear View Mirror", tracking: "CX064397338IN", cod: 499, business });

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative max-h-[94vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-3xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">WhatsApp messages & label note</h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-stone-400 hover:bg-stone-100" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="mb-3 flex w-fit rounded-lg bg-stone-100 p-0.5 text-sm">
          {(
            [
              ["en", "English message"],
              ["ml", "മലയാളം message"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} onClick={() => setWhich(k)} className={`rounded-md px-3 py-1 ${which === k ? "bg-white font-medium shadow-sm ring-1 ring-stone-200" : "text-stone-600"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-stone-700">
            Message
            <textarea
              value={msgs[which]}
              onChange={(e) => setMsgs((m) => ({ ...m, [which]: e.target.value }))}
              rows={14}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
            />
            <span className="mt-1 block text-xs font-normal text-stone-500">
              Fill-ins: {"{name} {order} {products} {tracking} {cod} {cod_line} {business}"}. *bold* works in WhatsApp.
            </span>
          </label>
          <div>
            <div className="text-sm font-medium text-stone-700">Preview</div>
            <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-[#e7ffdb] p-3 font-sans text-sm text-stone-800 ring-1 ring-emerald-100">{sample}</pre>
          </div>
        </div>
        <label className="mt-4 block text-sm font-medium text-stone-700">
          Note printed on every label (optional)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="If undelivered, please return to sender."
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-stone-600 hover:bg-stone-100">
            Cancel
          </button>
          <button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await saveDispatchSettings({ dispatch_message: msgs.en, dispatch_message_ml: msgs.ml, label_note: note });
                onToast(r);
                if (r.ok) onClose();
              })
            }
            className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
