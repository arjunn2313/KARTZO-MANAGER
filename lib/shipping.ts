export type CodFeeSlab = { upto: number; fee: number };

export type CourierRates = {
  default_shipping_cost: number; // inside Kerala
  shipping_cost_outside: number | null; // outside Kerala (null = same as inside)
  cod_fee_slabs: CodFeeSlab[] | null;
};

/** Kerala PIN codes start with 67, 68 or 69. */
export function isKeralaPin(pin: string): boolean {
  return /^6[7-9]\d{4}$/.test(pin.replace(/\D/g, ""));
}

/** Shipping for a PIN: inside Kerala → base cost; outside → outside cost. Unknown PIN → base cost. */
export function shippingFor(courier: CourierRates | undefined, pin: string): number {
  if (!courier) return 0;
  const clean = pin.replace(/\D/g, "");
  if (clean.length === 6 && !isKeralaPin(clean) && courier.shipping_cost_outside != null) {
    return courier.shipping_cost_outside;
  }
  return courier.default_shipping_cost;
}

/**
 * COD commission on the cash collected.
 * Slabs like [{upto:299, fee:5}, {upto:499, fee:8}]: first slab that covers the amount wins.
 * Above the last slab, the fee grows at the same rate as the last slab (₹998 → ₹16).
 */
export function codFeeFor(slabs: CodFeeSlab[] | null | undefined, codAmount: number): number {
  if (!slabs?.length || codAmount <= 0) return 0;
  const sorted = [...slabs].filter((s) => s.upto > 0).sort((a, b) => a.upto - b.upto);
  if (!sorted.length) return 0;
  const slab = sorted.find((s) => codAmount <= s.upto);
  if (slab) return slab.fee;
  const last = sorted[sorted.length - 1];
  return Math.round((codAmount * last.fee) / last.upto);
}

export function parseSlabs(v: unknown): CodFeeSlab[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((s) => ({ upto: Number((s as CodFeeSlab)?.upto), fee: Number((s as CodFeeSlab)?.fee) }))
    .filter((s) => Number.isFinite(s.upto) && Number.isFinite(s.fee) && s.upto > 0 && s.fee >= 0);
}
