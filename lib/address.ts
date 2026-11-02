/** Address helpers for the postbulk format (shared by browser and server, no database). */

export type AddressParts = {
  house: string;
  /** street / place lines, one per line */
  place: string;
  po: string;
  district: string;
  state: string;
  pincode: string;
};

const up = (s: string) => s.replace(/\s+/g, " ").trim().toUpperCase();

/** Drops place lines that only repeat the district (it's already on the last line). */
export function withoutDistrict(place: string, district: string) {
  const d = district.trim().toLowerCase();
  return place
    .split("\n")
    .filter((l) => l.trim().toLowerCase().replace(/\s*dist(?:rict)?\.?$/, "") !== d)
    .join("\n");
}

/** "KONDOTTI" → "KONDOTTI PO" (leaves "… PO" / "P.O" as it is) */
export function poLine(po: string) {
  const p = up(po).replace(/\s*\b(?:P\.?\s?O\.?|POST(?:\s*OFFICE)?)\.?$/i, "").trim();
  return p ? `${p} PO` : "";
}

/**
 * The address block exactly as postbulk wants it:
 *   KIZHAKKEVALAPPIL HOUSE
 *   PANDIKKAD
 *   KONDOTTY PO
 *   MALAPPURAM, KERALA - 673638
 */
export function buildAddress(a: AddressParts) {
  const lines = [up(a.house), ...a.place.split("\n").map(up), poLine(a.po)].filter(Boolean);
  const last = [up(a.district), up(a.state)].filter(Boolean).join(", ");
  lines.push(`${last}${last ? " - " : ""}${a.pincode}`);
  return lines.join("\n");
}

/** One order as postbulk / the WhatsApp group expects it. */
export function postbulkBlock(o: { name: string; address: string; phone: string; paymentMode: "cod" | "paid"; codAmount: number; itemref: string }) {
  const pay = o.paymentMode === "cod" && o.codAmount > 0 ? `COD: ${o.codAmount}` : "PREPAID";
  return `${up(o.name)}\n${o.address}\nMob: ${o.phone} ${pay} Itemref: ${o.itemref.toUpperCase()}`;
}

/** "CAR REAR VIEW MIRROR + PHONE HOLDER", "GLASS WIPER X2" */
export function itemref(items: { name: string; qty: number }[]) {
  return items.map((i) => (i.qty > 1 ? `${i.name} x${i.qty}` : i.name)).join(" + ").toUpperCase();
}

export type GuessedAddress = { name: string; phone: string; pincode: string; house: string; place: string; po: string };

const STATE_WORDS = /\b(kerala|tamil\s*nadu|karnataka|india)\b/i;
const PO_RE = /^(.*?)\s*[,(]?\s*\b(?:p\.?\s?o\.?|post(?:\s*office)?)\b\.?\s*\)?\s*[,:-]?\s*(.*)$/i;
const NOISE = /^(?:name|address|addr|pin\s*code|pincode|pin|phone|mob(?:ile)?|ph|contact|house\s*name|landmark|district|dist|state|post)\s*(?:no\.?|number)?\s*[:.-]\s*/i;

/**
 * Best guess from whatever the customer typed on WhatsApp. The staff checks it afterwards.
 * Finds the phone and pincode anywhere, takes the first line as the name, a "… PO" line as the post office.
 */
export function guessAddress(text: string): GuessedAddress {
  const raw = text.replace(/\r/g, "");
  const phoneM = raw.match(/(?:\+?91[\s-]?|\b0)?([6-9](?:[\s-]?\d){9})\b/);
  const phone = phoneM ? phoneM[1].replace(/\D/g, "") : "";
  const withoutPhone = phoneM ? raw.replace(phoneM[0], " ") : raw;
  const pinM = withoutPhone.match(/(?<!\d)([1-9]\d{2}\s?\d{3})(?!\d)/);
  const pincode = pinM ? pinM[1].replace(/\s/g, "") : "";

  let po = "";
  const lines: string[] = [];
  for (let l of withoutPhone.split(/\n|,(?=\s*[A-Za-z])/)) {
    l = l.replace(NOISE, "").replace(/[*_~]/g, "").trim();
    if (pinM) l = l.replace(pinM[1], " ");
    l = l.replace(STATE_WORDS, " ").replace(/\b(?:pin|pincode|dist(?:rict)?)\b\.?/gi, " ").replace(/[\s,.-]+$/g, "").replace(/^[\s,.-]+/, "").replace(/\s+/g, " ");
    if (!l || /^\d+$/.test(l) || /^(?:ph(?:one)?|mob(?:ile)?|contact|whats\s?app|wa|no|number|name|address)\.?$/i.test(l)) continue;
    const m = l.match(PO_RE);
    if (!po && m && (m[1] || m[2])) {
      po = (m[1] || m[2]).trim();
      const rest = m[1] && m[2] ? m[2].trim() : "";
      if (rest) lines.push(rest);
      continue;
    }
    lines.push(l);
  }
  const [name = "", house = "", ...placeLines] = lines;
  return { name, phone, pincode, house, place: placeLines.join("\n"), po };
}
