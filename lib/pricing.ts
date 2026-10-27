export type PriceProduct = { id: string; name: string; price_paid: number; price_cod: number; cost: number };
export type Item = { product_id: string; qty: number };
export type ItemPayload = { product_id: string; qty: number; unit_cost: number; unit_price: number };

/** Normal price of one piece for this payment type */
export function unitPrice(p: PriceProduct | undefined, mode: "paid" | "cod") {
  if (!p) return 0;
  return mode === "paid" ? p.price_paid : p.price_cod;
}

/** Normal (list) price of all items before any discount */
export function listPrice(items: Item[], products: PriceProduct[], mode: "paid" | "cod") {
  return items.reduce((s, it) => s + unitPrice(products.find((p) => p.id === it.product_id), mode) * it.qty, 0);
}

export function itemsCost(items: Item[], products: PriceProduct[]) {
  return items.reduce((s, it) => s + (products.find((p) => p.id === it.product_id)?.cost ?? 0) * it.qty, 0);
}

export function itemsPayload(items: Item[], products: PriceProduct[], mode: "paid" | "cod"): ItemPayload[] {
  return items
    .filter((it) => it.product_id)
    .map((it) => {
      const p = products.find((x) => x.id === it.product_id);
      return { product_id: it.product_id, qty: it.qty, unit_cost: p?.cost ?? 0, unit_price: unitPrice(p, mode) };
    });
}

export function itemsLabel(items: { qty: number; name: string }[]) {
  return items.map((i) => (i.qty > 1 ? `${i.name} × ${i.qty}` : i.name)).join(" + ");
}
