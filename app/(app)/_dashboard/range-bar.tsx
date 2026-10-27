"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

export function RangeBar({
  presets,
  current,
}: {
  presets: { key: string; label: string }[];
  current: { key: string; from: string; to: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function go(params: Record<string, string>) {
    const q = new URLSearchParams(params).toString();
    startTransition(() => router.replace(`${pathname}?${q}`, { scroll: false }));
  }

  return (
    <div className={`flex flex-col gap-2 transition sm:flex-row sm:flex-wrap sm:items-center ${pending ? "opacity-60" : ""}`}>
      {/* phones: one row that scrolls sideways; bigger screens: wraps */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {presets.map((p) => (
          <button
            key={p.key}
            onClick={() => go({ range: p.key })}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition ${
              current.key === p.key ? "bg-stone-900 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className={`flex w-fit max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-sm ring-1 ${current.key === "custom" ? "bg-stone-900 text-white ring-stone-900" : "bg-white text-stone-500 ring-stone-200"}`}>
        <input
          type="date"
          value={current.from}
          max={current.to}
          onChange={(e) => e.target.value && go({ from: e.target.value, to: current.to })}
          className="bg-transparent px-1 py-1 outline-none [color-scheme:light]"
          aria-label="From date"
        />
        <span>–</span>
        <input
          type="date"
          value={current.to}
          min={current.from}
          onChange={(e) => e.target.value && go({ from: current.from, to: e.target.value })}
          className="bg-transparent px-1 py-1 outline-none"
          aria-label="To date"
        />
      </div>
    </div>
  );
}
