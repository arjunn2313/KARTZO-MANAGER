"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { rs } from "@/components/charts/chart-utils";
import { Pager, usePaged } from "@/components/pager";
import { buildMessage, copyText, whatsappLink, type Lang } from "@/lib/dispatch";
import { markWhatsAppSent, saveDispatchSettings, type Result } from "./actions";

export type DispatchOrder = {
  id: string;
  order_code: string;
  order_date: string;
  dispatch_date: string | null;
  customer_name: string;
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

function PackList({ orders, today }: { orders: DispatchOrder[]; today: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(orders.filter((o) => !o.label_printed_at).map((o) => o.id)));
  const { pageItems, pager } = usePaged(orders, "dispatch-pack", 50);
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

  const all = orders.length > 0 && chosen.length === orders.length;
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
            <input type="checkbox" checked={all} onChange={() => setSelected(new Set(all ? [] : orders.map((o) => o.id)))} className="size-4 accent-emerald-700" />
            Select all ({orders.length})
          </label>
          <button onClick={() => setSelected(new Set(orders.filter((o) => !o.label_printed_at).map((o) => o.id)))} className="text-sm text-emerald-700 hover:underline">
            Only not printed
          </button>
        </div>
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
                  {o.label_printed_at && <span className="text-[11px] text-stone-400">✓ label printed</span>}
                </div>
              </label>
            </li>
          ))}
        </ul>
        <Pager {...pager} noun="orders" className="border-t border-stone-100 px-5 py-3" />
      </section>

      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
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
