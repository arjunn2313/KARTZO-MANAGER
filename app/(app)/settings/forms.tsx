"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { codFeeFor, type CodFeeSlab } from "@/lib/shipping";
import { saveCourier, type FormState } from "./actions";

export type Courier = {
  id: string;
  name: string;
  default_shipping_cost: number;
  shipping_cost_outside: number | null;
  default_rto_charge: number;
  cod_fee_slabs: CodFeeSlab[] | null;
  active: boolean;
};

const initial: FormState = { ok: false, message: null };

const box =
  "rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";
const input = "w-full " + box;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-stone-500">
      {label}
      <div className="mt-1">{children}</div>
      {hint && <div className="mt-1 font-normal text-stone-400">{hint}</div>}
    </label>
  );
}

function Money({ name, defaultValue, required = true, placeholder }: { name: string; defaultValue?: number | null; required?: boolean; placeholder?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-stone-400">₹</span>
      <input
        name={name}
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue ?? undefined}
        className={`${input} pl-7`}
      />
    </div>
  );
}

function SlabsEditor({ initialSlabs }: { initialSlabs: CodFeeSlab[] }) {
  const [slabs, setSlabs] = useState<{ upto: string; fee: string }[]>(
    initialSlabs.map((s) => ({ upto: String(s.upto), fee: String(s.fee) })),
  );
  const clean = slabs
    .map((s) => ({ upto: Math.round(Number(s.upto)), fee: Math.round(Number(s.fee)) }))
    .filter((s) => s.upto > 0 && s.fee >= 0 && Number.isFinite(s.fee));
  const sorted = [...clean].sort((a, b) => a.upto - b.upto);
  const last = sorted[sorted.length - 1];

  return (
    <div>
      <input type="hidden" name="cod_fee_slabs" value={JSON.stringify(clean)} />
      <div className="space-y-2">
        {slabs.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-sm text-stone-600">
            <span className="shrink-0 sm:w-24">
              <span className="hidden sm:inline">COD </span>up to ₹
            </span>
            <input
              type="number"
              min={1}
              value={s.upto}
              onChange={(e) => setSlabs(slabs.map((x, j) => (j === i ? { ...x, upto: e.target.value } : x)))}
              className={`${box} !w-auto min-w-0 flex-1 py-1.5 sm:!w-24 sm:flex-none`}
            />
            <span className="shrink-0">→ fee ₹</span>
            <input
              type="number"
              min={0}
              value={s.fee}
              onChange={(e) => setSlabs(slabs.map((x, j) => (j === i ? { ...x, fee: e.target.value } : x)))}
              className={`${box} !w-auto min-w-0 flex-1 py-1.5 sm:!w-20 sm:flex-none`}
            />
            <button
              type="button"
              onClick={() => setSlabs(slabs.filter((_, j) => j !== i))}
              className="rounded-md px-2 py-1 text-stone-400 hover:bg-stone-100 hover:text-red-600"
              aria-label="Remove"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setSlabs([...slabs, { upto: "", fee: "" }])}
        className="mt-2 text-sm font-medium text-emerald-700"
      >
        + Add slab
      </button>
      <p className="mt-2 text-xs text-stone-400">
        {last
          ? `Above ₹${last.upto}: same rate (e.g. ₹${last.upto * 2} COD → ₹${codFeeFor(sorted, last.upto * 2)}). Not charged on RTO.`
          : "No COD commission for this courier."}
      </p>
    </div>
  );
}

export function CourierForm({ courier }: { courier?: Courier }) {
  const [state, action, pending] = useActionState(saveCourier, initial);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!courier && state.ok) formRef.current?.reset();
  }, [state, courier]);

  return (
    <form
      ref={formRef}
      action={action}
      className={`rounded-xl p-4 ring-1 ${
        courier ? (courier.active ? "bg-white ring-stone-200" : "bg-stone-50 opacity-70 ring-stone-200") : "bg-emerald-50/50 ring-emerald-200"
      }`}
    >
      {courier && <input type="hidden" name="id" value={courier.id} />}
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Courier name">
          <input name="name" required defaultValue={courier?.name} className={input} />
        </Field>
        <Field label="Shipping inside Kerala">
          <Money name="default_shipping_cost" defaultValue={courier?.default_shipping_cost} />
        </Field>
        <Field label="Shipping outside Kerala" hint="Leave empty if same">
          <Money name="shipping_cost_outside" defaultValue={courier?.shipping_cost_outside} required={false} placeholder="same" />
        </Field>
        <Field label="Extra RTO charge" hint="Added to shipping on RTO">
          <Money name="default_rto_charge" defaultValue={courier?.default_rto_charge} />
        </Field>
      </div>

      <div className="mt-4 border-t border-stone-100 pt-4">
        <div className="mb-2 text-xs font-medium text-stone-500">COD commission</div>
        <SlabsEditor initialSlabs={courier?.cod_fee_slabs ?? []} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {courier ? (
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input type="checkbox" name="active" defaultChecked={courier.active} className="size-4 accent-emerald-700" />
            Active
          </label>
        ) : (
          <input type="hidden" name="active" value="true" />
        )}
        <div className="flex-1" />
        {pending ? (
          <span className="text-sm text-stone-400">Saving…</span>
        ) : (
          state.message && (
            <span className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-600"}`}>
              {state.ok ? "✓ " : ""}
              {state.message}
            </span>
          )
        )}
        <button
          disabled={pending}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {courier ? "Save" : "Add courier"}
        </button>
      </div>
    </form>
  );
}
