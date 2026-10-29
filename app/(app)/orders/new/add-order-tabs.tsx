"use client";

import { useState } from "react";
import { OrderForm, type CourierOption, type ProductOption } from "./order-form";
import { PasteOrders } from "./paste-orders";

export function AddOrderTabs(props: { products: ProductOption[]; couriers: CourierOption[]; today: string; staffName: string }) {
  const [tab, setTab] = useState<"paste" | "single">("paste");

  if (props.products.length === 0 || props.couriers.length === 0) {
    return (
      <p className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900 ring-1 ring-amber-200">
        Add at least one active product (Products page) and courier (Settings page) first.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg bg-stone-200/70 p-1">
        {(
          [
            ["paste", "Paste from WhatsApp"],
            ["single", "Single order"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              tab === key ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "paste" ? <PasteOrders {...props} /> : <OrderForm {...props} />}
    </div>
  );
}
