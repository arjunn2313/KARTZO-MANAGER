"use client";

import { useState, useTransition } from "react";
import { saveCategory } from "../expenses/actions";

type Cat = { id?: string; name: string; kind: "cost" | "transfer" | "income"; active: boolean };

const KINDS = [
  { value: "cost", label: "Business cost", help: "Reduces net profit (packing, phone, rent)" },
  { value: "transfer", label: "Cash out", help: "Already counted elsewhere (ads wallet, shipping, stock)" },
  { value: "income", label: "Money in", help: "COD remittance, other income" },
] as const;

export function CategoryRow({ cat }: { cat?: Cat }) {
  const [name, setName] = useState(cat?.name ?? "");
  const [kind, setKind] = useState<Cat["kind"]>(cat?.kind ?? "cost");
  const [active, setActive] = useState(cat?.active ?? true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = !cat || name !== cat.name || kind !== cat.kind || active !== cat.active;

  function save() {
    startTransition(async () => {
      const r = await saveCategory({ id: cat?.id, name, kind, active });
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok && !cat) {
        setName("");
        setKind("cost");
      }
    });
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-xl p-3 ring-1 ${cat ? (active ? "bg-white ring-stone-200" : "bg-stone-50 opacity-70 ring-stone-200") : "bg-emerald-50/50 ring-emerald-200"}`}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New category name"
        className="min-w-[180px] flex-1 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
      />
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as Cat["kind"])}
        title={KINDS.find((k) => k.value === kind)?.help}
        className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-emerald-600"
      >
        {KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </select>
      {cat && (
        <label className="flex items-center gap-1.5 text-sm text-stone-600">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4 accent-emerald-700" />
          Active
        </label>
      )}
      {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.ok ? "✓ " : ""}{msg.text}</span>}
      <button
        onClick={save}
        disabled={pending || !name.trim() || !dirty}
        className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-40"
      >
        {pending ? "Saving…" : cat ? "Save" : "Add"}
      </button>
    </div>
  );
}
