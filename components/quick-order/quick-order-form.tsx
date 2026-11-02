"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { buildAddress, itemref, postbulkBlock, withoutDistrict } from "@/lib/address";
import { copyText } from "@/lib/dispatch";
import { lookupPin, smartFillMessage, type PinResult } from "@/lib/address-actions";
import type { PhoneOrder, QuickCourier, QuickOrderInput, QuickOrderResult, QuickProduct } from "@/lib/quick-order";

const rs = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const field =
  "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-base text-stone-900 outline-none placeholder:text-stone-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";
const label = "mb-1 block text-xs font-medium text-stone-500";
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
/** "Panangad (Ernakulam)" → "Panangad" */
const officeBase = (o: string) => o.replace(/\s*\(.*?\)\s*$/, "").replace(/\s+/g, " ").trim();

type Saved = { code: string; block: string; confirm: string; phone: string; indiaPost: boolean };

/**
 * Smart order form, used on the staff link and in your own app (Add order → Smart order).
 * The page passes in how to save and how to look up earlier orders for a phone.
 */
export function QuickOrderForm({
  products,
  couriers,
  business,
  create,
  phoneOrders: findPhoneOrders,
  back,
  takenBy,
  floatingSave = true,
}: {
  products: QuickProduct[];
  couriers: QuickCourier[];
  business: string;
  create: (input: QuickOrderInput) => Promise<QuickOrderResult>;
  phoneOrders: (phone: string) => Promise<PhoneOrder[]>;
  back?: { href: string; label: string };
  /** in your own app: who took the order (staff name); not shown on the staff link */
  takenBy?: { staffName: string };
  /** save bar fixed at the bottom of the screen (staff link). Off inside the app, which has its own bottom bar. */
  floatingSave?: boolean;
}) {
  const [paste, setPaste] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pincode, setPincode] = useState("");
  const [house, setHouse] = useState("");
  const [place, setPlace] = useState("");
  const [po, setPo] = useState("");
  const [pin, setPin] = useState<PinResult | "loading" | undefined>(undefined);
  const [phoneOrders, setPhoneOrders] = useState<PhoneOrder[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<"cod" | "paid">("cod");
  const [offer, setOffer] = useState("");
  const [advance, setAdvance] = useState("");
  const [notes, setNotes] = useState("");
  const [kind, setKind] = useState<"normal" | "replacement">("normal");
  const [courierId, setCourierId] = useState<string | null>(couriers[0]?.id ?? null);
  const [who, setWho] = useState<"owner" | "staff">("owner");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [fill, setFill] = useState<{ warnings: string[]; pins: { pincode: string; office: string; district: string }[] } | null>(null);
  const [filling, startFill] = useTransition();
  const [saving, startSave] = useTransition();
  const [, startLookup] = useTransition();

  /* ---------- lookups ---------- */
  function findPin(p: string) {
    if (!/^[1-9]\d{5}$/.test(p)) return setPin(undefined);
    setPin("loading");
    startLookup(async () => {
      const r = await lookupPin(p);
      setPin(r);
      if (r) setPlace((cur) => withoutDistrict(cur, r.info.district));
    });
  }
  function findPhone(p: string) {
    if (!/^[6-9]\d{9}$/.test(p)) return setPhoneOrders([]);
    startLookup(async () => setPhoneOrders(await findPhoneOrders(p)));
  }
  function onPincode(v: string) {
    const p = v.replace(/\D/g, "").slice(0, 6);
    setPincode(p);
    if (p.length === 6) findPin(p);
    else setPin(undefined);
  }
  function onPhone(v: string) {
    let p = v.replace(/\D/g, "");
    if (p.length === 12 && p.startsWith("91")) p = p.slice(2);
    if (p.length === 11 && p.startsWith("0")) p = p.slice(1);
    p = p.slice(0, 10);
    setPhone(p);
    findPhone(p);
  }
  function fillFromMessage() {
    startFill(async () => {
      const g = await smartFillMessage(paste);
      setName(g.name);
      setHouse(g.house);
      setPlace(g.place);
      setPo(g.po);
      if (g.phone) onPhone(g.phone);
      setPincode(g.pincode);
      setPin(g.pincode.length === 6 ? g.pin : undefined);
      if (g.payment && kind === "normal") {
        setMode(g.payment);
        setOffer("");
      }
      setFill({ warnings: g.warnings, pins: g.pinSuggestions });
    });
  }
  function choosePin(p: { pincode: string; office: string }) {
    onPincode(p.pincode);
    setPo(p.office);
    setFill((f) => (f ? { warnings: [], pins: [] } : f));
  }

  /* ---------- derived ---------- */
  const info = pin && pin !== "loading" ? pin.info : null;
  const chosen = products.filter((p) => (qty[p.id] ?? 0) > 0).map((p) => ({ ...p, qty: qty[p.id] }));
  const list = chosen.reduce((s, p) => s + (mode === "paid" ? p.price_paid : p.price_cod) * p.qty, 0);
  const repl = kind === "replacement";
  const value = repl ? 0 : offer === "" ? list : Number(offer);
  const adv = repl ? 0 : mode === "cod" ? Number(advance) || 0 : value;
  const codAmount = !repl && mode === "cod" ? Math.max(0, value - adv) : 0;
  const courier = couriers.find((c) => c.id === courierId);
  const indiaPost = !courier || /india\s*post/i.test(courier.name);
  const address = buildAddress({ house, place, po, district: info?.district ?? "", state: info?.state ?? "", pincode });
  const ref = itemref(chosen) + (repl ? " (REPLACEMENT)" : "");
  const block = postbulkBlock({ name, address, phone, paymentMode: repl ? "paid" : mode, codAmount, itemref: ref });

  const poKnown = !po || !info || info.offices.some((o) => officeBase(o).toLowerCase() === po.trim().toLowerCase().replace(/\s*p\.?\s?o\.?$/, ""));
  const text = `${house} ${place} ${po}`.toLowerCase();
  const otherDistrict =
    info && pin && pin !== "loading"
      ? pin.stateDistricts.find((d) => d.length > 3 && !info.districts.includes(d) && new RegExp(`\\b${d.toLowerCase()}\\b`).test(text))
      : undefined;

  const problems: string[] = [];
  if (name.trim().length < 2) problems.push("Name");
  if (!/^[6-9]\d{9}$/.test(phone)) problems.push("10-digit phone");
  if (!info) problems.push("Correct pincode");
  if (!house.trim() && !place.trim()) problems.push("House / place");
  if (!po.trim()) problems.push("Post office");
  if (!chosen.length) problems.push("Product");
  if (!repl && mode === "cod" && adv > value) problems.push("Advance more than amount");
  if (couriers.length && !courierId) problems.push("Courier");
  if (offer !== "" && !(Number(offer) >= 0)) problems.push("Amount");

  function save() {
    setError(null);
    startSave(async () => {
      const r = await create({
        customer_name: name,
        phone,
        pincode,
        address,
        order_type: kind,
        payment_mode: repl ? "paid" : mode,
        order_value: value,
        advance_paid: repl ? 0 : mode === "cod" ? adv : value,
        notes,
        courier_id: courierId,
        taken_by: takenBy ? who : undefined,
        items: chosen.map((p) => ({ product_id: p.id, qty: p.qty })),
      });
      if (!r.ok) return setError(r.message);
      const pay = repl
        ? "Free replacement — nothing to pay"
        : mode === "cod"
          ? `${rs(codAmount)} — pay when the parcel arrives${adv ? ` (${rs(adv)} advance received)` : ""}`
          : `${rs(value)} — paid ✓`;
      const confirm = [
        `Hi ${titleCase(name.trim())} 🙏`,
        `Thank you for ordering from ${business}. Please check your order details:`,
        ``,
        `📦 ${ref}${courier ? ` · by ${courier.name}` : ""}`,
        `💰 ${pay}`,
        `📍 ${name.trim().toUpperCase()}`,
        address,
        `📞 ${phone}`,
        ``,
        `Reply *OK* if everything is correct. If anything is wrong, tell us now so your parcel isn't delayed.`,
      ].join("\n");
      setSaved({ code: r.code, block, confirm, phone, indiaPost });
      window.scrollTo({ top: 0 });
    });
  }

  function reset() {
    setPaste("");
    setName("");
    setPhone("");
    setPincode("");
    setHouse("");
    setPlace("");
    setPo("");
    setPin(undefined);
    setPhoneOrders([]);
    setQty({});
    setMode("cod");
    setOffer("");
    setAdvance("");
    setNotes("");
    setKind("normal");
    setCourierId(couriers[0]?.id ?? null);
    setError(null);
    setSaved(null);
    window.scrollTo({ top: 0 });
  }

  const backLink = back ? (
    <Link href={back.href} className="text-sm font-medium text-emerald-700">
      ← {back.label}
    </Link>
  ) : null;

  /* ---------- after saving ---------- */
  if (saved) return <SavedView saved={saved} back={backLink} onNew={reset} />;

  /* ---------- form ---------- */
  return (
    <div className="space-y-4">
      {backLink && (
        <div>
          {backLink}
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">New order</h1>
        </div>
      )}

      {/* order type + courier (+ who took it, in your app) */}
      <Card title="Order">
        <div className="space-y-3">
          <Segment
            value={kind}
            onChange={(v) => setKind(v as "normal" | "replacement")}
            options={[
              ["normal", "New order"],
              ["replacement", "Replacement"],
            ]}
          />
          {couriers.length > 1 && (
            <div>
              <label className={label}>Courier</label>
              <Segment value={courierId ?? ""} onChange={setCourierId} options={couriers.map((c) => [c.id, c.name])} />
            </div>
          )}
          {takenBy && (
            <div>
              <label className={label}>Taken by</label>
              <Segment
                value={who}
                onChange={(v) => setWho(v as "owner" | "staff")}
                options={[
                  ["owner", "Me"],
                  ["staff", takenBy.staffName || "Staff"],
                ]}
              />
            </div>
          )}
          {repl && <Note tone="info">Replacement: nothing to collect from the customer. Write which order it replaces in the note below.</Note>}
        </div>
      </Card>

      {/* 1. paste */}
      <Card title="Customer's message" hint="Paste what the customer sent. Phone, pincode, name and post office get filled in for you.">
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={4}
          placeholder={"Ummerkoya Kozhikkodan\nKizhakkevalappil house, Pandikkad\nKondotty PO, Malappuram 673638\n9447112409"}
          className={field}
        />
        <button
          type="button"
          onClick={fillFromMessage}
          disabled={!paste.trim() || filling}
          className="mt-2 w-full rounded-xl bg-stone-900 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {filling ? "Reading…" : "Fill from message ↓"}
        </button>
        {fill && (
          <div className="mt-2 space-y-1.5">
            {fill.warnings.map((w) => (
              <Note key={w} tone="bad">
                {w}
              </Note>
            ))}
            {fill.pins.length > 0 && (
              <div className="rounded-lg bg-sky-50 px-2.5 py-2 text-xs text-sky-900 ring-1 ring-sky-200">
                <div className="mb-1.5 font-medium">Did the customer mean:</div>
                <div className="flex flex-wrap gap-1.5">
                  {fill.pins.map((p) => (
                    <button
                      key={p.pincode + p.office}
                      type="button"
                      onClick={() => choosePin(p)}
                      className="rounded-full bg-white px-2.5 py-1 font-medium ring-1 ring-sky-300"
                    >
                      {p.pincode} · {p.office}, {p.district}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Note tone="info">Filled from the message. Check each box below before saving.</Note>
          </div>
        )}
      </Card>

      {/* 2. customer */}
      <Card title="Customer">
        <div className="space-y-3">
          <div>
            <label className={label}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} autoComplete="off" />
          </div>
          <div>
            <label className={label}>Mobile number</label>
            <input
              value={phone}
              onChange={(e) => onPhone(e.target.value)}
              inputMode="numeric"
              placeholder="10 digits"
              className={`${field} font-mono tracking-wide ${phone && phone.length === 10 && !/^[6-9]/.test(phone) ? "border-red-400" : ""}`}
            />
            {phone.length > 0 && phone.length < 10 && <Note tone="warn">{10 - phone.length} more digit{phone.length === 9 ? "" : "s"}</Note>}
            {phone.length === 10 && !/^[6-9]/.test(phone) && <Note tone="bad">A mobile number starts with 6, 7, 8 or 9</Note>}
            {phoneOrders.length > 0 && (
              <Note tone="warn">
                This number already ordered: {phoneOrders.map((o) => `${o.code} (${o.date.split("-").reverse().slice(0, 2).join("/")}, ${o.status})`).join(", ")}. Make sure
                it&apos;s not the same order again.
              </Note>
            )}
          </div>
        </div>
      </Card>

      {/* 3. address */}
      <Card title="Address">
        <div className="space-y-3">
          <div>
            <label className={label}>Pincode</label>
            <input value={pincode} onChange={(e) => onPincode(e.target.value)} inputMode="numeric" placeholder="6 digits" className={`${field} font-mono tracking-widest`} />
            {pin === "loading" && <Note tone="info">Checking…</Note>}
            {pincode.length === 6 && pin === null && <Note tone="bad">This pincode doesn&apos;t exist. Ask the customer again now.</Note>}
            {info && (
              <Note tone="good">
                <b>{info.district}</b>, {info.state}
                {info.districts.length > 1 ? ` (also ${info.districts.slice(1).join(", ")})` : ""}
              </Note>
            )}
          </div>
          <div>
            <label className={label}>House name / number</label>
            <input value={house} onChange={(e) => setHouse(e.target.value)} placeholder="Kizhakkevalappil House" className={field} />
          </div>
          <div>
            <label className={label}>Place / street / landmark (one per line)</label>
            <textarea value={place} onChange={(e) => setPlace(e.target.value)} rows={2} placeholder="Pandikkad" className={field} />
          </div>
          <div>
            <label className={label}>Post office</label>
            <input value={po} onChange={(e) => setPo(e.target.value)} placeholder={info ? "Tap one below" : "Kondotty"} className={field} />
            {info && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {info.offices.map((o) => {
                  const on = po.trim().toLowerCase() === officeBase(o).toLowerCase();
                  return (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setPo(officeBase(o))}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${on ? "bg-emerald-700 text-white ring-emerald-700" : "bg-white text-stone-700 ring-stone-200"}`}
                    >
                      {officeBase(o)}
                    </button>
                  );
                })}
              </div>
            )}
            {po && info && !poKnown && <Note tone="warn">“{po}” isn&apos;t a post office of {pincode}. Tap the right one above, or check with the customer.</Note>}
          </div>
          {otherDistrict && (
            <Note tone="bad">
              The address mentions <b>{otherDistrict}</b>, but {pincode} is in <b>{info?.district}</b>. Ask the customer which is right.
            </Note>
          )}
        </div>
      </Card>

      {/* 4. products */}
      <Card title="Products">
        <div className="space-y-2">
          {products.map((p) => {
            const n = qty[p.id] ?? 0;
            return (
              <div key={p.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ring-1 ${n ? "bg-emerald-50 ring-emerald-300" : "ring-stone-200"}`}>
                <button type="button" onClick={() => setQty({ ...qty, [p.id]: n ? n : 1 })} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-semibold text-stone-900">{p.name}</span>
                  <span className="text-xs text-stone-500">
                    COD {rs(p.price_cod)} · Prepaid {rs(p.price_paid)}
                  </span>
                </button>
                {n ? (
                  <div className="flex items-center gap-1">
                    <Step onClick={() => setQty({ ...qty, [p.id]: n - 1 })}>−</Step>
                    <span className="w-6 text-center font-semibold">{n}</span>
                    <Step onClick={() => setQty({ ...qty, [p.id]: Math.min(50, n + 1) })}>+</Step>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setQty({ ...qty, [p.id]: 1 })}
                    className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-300"
                  >
                    Add
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {chosen.length > 1 && <Note tone="info">Combo: {ref}</Note>}
      </Card>

      {/* 5. payment */}
      <Card title={repl ? "Note" : "Payment"}>
        {!repl && (
          <>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-stone-100 p-1">
          {(["cod", "paid"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setOffer("");
              }}
              className={`rounded-lg py-2 text-sm font-semibold ${mode === m ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"}`}
            >
              {m === "cod" ? "COD" : "Prepaid"}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Amount {chosen.length > 1 || offer !== "" ? `(normal ${rs(list)})` : ""}</label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-stone-400">₹</span>
              <input
                value={offer === "" ? (list ? String(list) : "") : offer}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  setOffer(v === String(list) ? "" : v);
                }}
                inputMode="numeric"
                className={`${field} pl-8 font-semibold`}
              />
            </div>
            {offer !== "" && value < list && <Note tone="good">Offer: {rs(list - value)} off</Note>}
          </div>
          {mode === "cod" && (
            <div>
              <label className={label}>Advance paid (optional)</label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-stone-400">₹</span>
                <input value={advance} onChange={(e) => setAdvance(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="0" className={`${field} pl-8`} />
              </div>
            </div>
          )}
        </div>
        <div className="mt-3 rounded-xl bg-stone-50 px-3 py-2.5 text-sm ring-1 ring-stone-200">
          {mode === "cod" ? (
            <>
              Customer pays <b>{rs(codAmount)}</b> when the parcel arrives
              {adv > 0 ? ` (${rs(adv)} already paid)` : ""}
            </>
          ) : (
            <>
              Prepaid: <b>{rs(value)}</b> received
            </>
          )}
        </div>
          </>
        )}
        <div className={repl ? "" : "mt-3"}>
          <label className={label}>{repl ? "Replacement for (order ID / reason)" : "Note (optional)"}</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={repl ? "Replacement for KZT2431 (broken mirror)" : "Call before delivery…"} className={field} />
        </div>
      </Card>

      {/* preview */}
      <Card
        title={indiaPost ? "For postbulk" : `For ${courier?.name ?? "the courier"}`}
        hint={indiaPost ? "This is exactly how the order will look." : `Not booked in postbulk: book this one on ${courier?.name ?? "the courier"}.`}
      >
        <pre className="overflow-x-auto rounded-xl bg-stone-900 p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-stone-100">{block}</pre>
      </Card>

      {/* save bar */}
      <div
        className={
          floatingSave
            ? "fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur"
            : "rounded-2xl bg-white p-4 ring-1 ring-stone-200"
        }
      >
        <div className={floatingSave ? "mx-auto max-w-lg" : ""}>
          {error && <p className="mb-2 text-sm font-medium text-red-600">{error}</p>}
          {problems.length > 0 && !error && <p className="mb-2 truncate text-xs text-stone-500">Still needed: {problems.join(" · ")}</p>}
          <button
            type="button"
            onClick={save}
            disabled={saving || problems.length > 0}
            className="w-full rounded-xl bg-emerald-700 py-3 text-base font-semibold text-white shadow-sm disabled:opacity-40"
          >
            {saving
              ? "Saving…"
              : `Save ${repl ? "replacement" : "order"}${chosen.length && !repl ? ` · ${mode === "cod" ? `COD ${rs(codAmount)}` : `Prepaid ${rs(value)}`}` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function SavedView({ saved, back, onNew }: { saved: Saved; back: React.ReactNode; onNew: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(what: string, text: string) {
    if (await copyText(text)) {
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    }
  }
  return (
    <div className="space-y-4">
      {back}
      <div className="rounded-2xl bg-emerald-700 p-5 text-white">
        <div className="text-sm text-emerald-100">Order saved ✓</div>
        <div className="mt-1 text-3xl font-semibold tracking-tight">{saved.code}</div>
        <p className="mt-1 text-sm text-emerald-100">Now send the details to the customer to confirm.</p>
      </div>

      <a
        href={`https://wa.me/91${saved.phone}?text=${encodeURIComponent(saved.confirm)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] py-3 text-base font-semibold text-white"
      >
        Send confirmation to customer
      </a>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => copy("group", saved.block)} className="rounded-xl bg-white py-2.5 text-sm font-semibold text-stone-800 ring-1 ring-stone-300">
          {copied === "group" ? "Copied ✓" : saved.indiaPost ? "Copy for group" : "Copy details"}
        </button>
        <button type="button" onClick={() => copy("msg", saved.confirm)} className="rounded-xl bg-white py-2.5 text-sm font-semibold text-stone-800 ring-1 ring-stone-300">
          {copied === "msg" ? "Copied ✓" : "Copy message"}
        </button>
      </div>

      <pre className="overflow-x-auto rounded-xl bg-stone-900 p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-stone-100">{saved.block}</pre>

      <button type="button" onClick={onNew} className="w-full rounded-xl bg-stone-900 py-3 text-base font-semibold text-white">
        + New order
      </button>
    </div>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-stone-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Note({ tone, children }: { tone: "good" | "bad" | "warn" | "info"; children: React.ReactNode }) {
  const s = {
    good: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    bad: "bg-red-50 text-red-700 ring-red-200",
    warn: "bg-amber-50 text-amber-900 ring-amber-200",
    info: "bg-sky-50 text-sky-800 ring-sky-200",
  }[tone];
  const icon = { good: "✓", bad: "✕", warn: "!", info: "i" }[tone];
  return (
    <p className={`mt-1.5 flex gap-2 rounded-lg px-2.5 py-1.5 text-xs leading-snug ring-1 ${s}`}>
      <span className="font-bold">{icon}</span>
      <span>{children}</span>
    </p>
  );
}

function Step({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="grid size-8 place-items-center rounded-lg bg-white text-lg font-semibold text-stone-700 ring-1 ring-stone-300">
      {children}
    </button>
  );
}

function Segment({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: (readonly [string, string])[] }) {
  return (
    <div className="flex gap-1 rounded-xl bg-stone-100 p-1">
      {options.map(([k, text]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={`flex-1 truncate rounded-lg px-2 py-2 text-sm font-semibold ${value === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
