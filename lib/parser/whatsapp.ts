/**
 * Reads orders pasted from the "Kartzo Orders" WhatsApp group. Runs in the browser; free, no AI.
 *
 * Expected shape of each order (blank lines between orders are optional):
 *
 *   FASIL SAMEER
 *   Echilamvayal Badr Juma Masjid
 *   Payyanur, Kerala - 670307
 *   Mob: 9847351156 COD: 299 Itemref: Glass Wiper
 *
 * The "Mob:" line closes an order. Payment can be "COD: 499", "PREPAID" / "PAID", or "REPLACEMENT".
 * Quantity is optional: "Itemref: Glass Wiper x2".
 * Several products: "Itemref: CAR REAR VIEW MIRROR + Glass Wiper" (also "&", "," or "and").
 * Tracking ID (optional), any of:
 *   "Mob: 98... COD: 299 Itemref: Glass Wiper Track: CX064397338IN"   (same line)
 *   "Tracking: CX064397338IN"   or just   "CX064397338IN"            (its own line, before or right after the Mob line)
 */

export type ParsedOrder = {
  raw: string;
  customer_name: string;
  address: string;
  pincode: string;
  phone: string;
  payment: "cod" | "paid" | "replacement" | null;
  cod_amount: number | null;
  item: string; // full item text
  items: { text: string; qty: number }[];
  /** courier tracking ID, "" if none was given */
  tracking: string;
  problems: string[];
};

// "Track: X", "Tracking ID - X", "AWB X", "Consignment no: X" (the ID must contain a digit)
const TRACK_KEYWORD =
  /\b(?:track(?:ing)?(?:\s*(?:id|no\.?|number|#))?|awb(?:\s*no\.?)?|consignment(?:\s*no\.?)?|c\.?n\.?\s*no\.?)\s*[:.#=-]?\s*((?=[A-Z0-9-]*\d)[A-Z0-9-]{6,25})\b/i;
// India Post article number, e.g. CX064397338IN / EK123456789IN
const INDIA_POST = /\b([A-Z]{2}\d{9}IN)\b/i;

/** Pulls a tracking ID out of a piece of text; returns the ID and the text without it. */
export function findTracking(text: string): { id: string; rest: string } | null {
  const m = text.match(TRACK_KEYWORD) ?? text.match(INDIA_POST);
  if (!m) return null;
  return { id: m[1].toUpperCase(), rest: (text.slice(0, m.index) + " " + text.slice(m.index! + m[0].length)).replace(/\s+/g, " ").trim() };
}

/** A line that holds nothing but a tracking ID (optionally with its label). */
function trackingOnly(line: string) {
  const t = findTracking(line);
  return t && !t.rest.replace(/[:.#=-]/g, "").trim() ? t.id : null;
}

// "[27/10/26, 8:03 am] Kartzo: " or "27/10/2026, 08:03 - Kartzo: " added when copying several messages
const WA_PREFIX = /^\s*\[?\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?\s?m\.?)?\]?\s*(?:-\s*)?[^:\n]{1,40}:\s*/i;
const MOB_LINE = /\b(?:mob(?:ile)?|ph(?:one)?|contact)\s*(?:no\.?|number)?\s*[:.-]/i;

function cleanLine(line: string) {
  return line.replace(WA_PREFIX, "").replace(/[*_~]/g, "").replace(/\s+/g, " ").trim();
}

export function parseWhatsAppOrders(text: string): ParsedOrder[] {
  const lines = text.replace(/\r/g, "").split("\n").map(cleanLine);

  const orders: ParsedOrder[] = [];
  let buffer: string[] = [];
  let pendingTracking = "";

  for (const line of lines) {
    if (!line) continue;
    const t = MOB_LINE.test(line) ? null : trackingOnly(line);
    if (t) {
      // right after a Mob line → belongs to the order just closed; otherwise to the order being read
      const last = orders[orders.length - 1];
      if (!buffer.length && last && !last.tracking) last.tracking = t;
      else pendingTracking = t;
      continue;
    }
    if (MOB_LINE.test(line)) {
      const o = buildOrder(buffer, line);
      if (!o.tracking && pendingTracking) o.tracking = pendingTracking;
      orders.push(o);
      buffer = [];
      pendingTracking = "";
    } else {
      buffer.push(line);
    }
  }

  // Leftover lines with no "Mob:" line → still show them so nothing is silently lost
  if (buffer.length) {
    const o = buildOrder(buffer, "");
    if (pendingTracking) o.tracking = pendingTracking;
    o.problems.unshift("No “Mob:” line found");
    orders.push(o);
  }
  return orders;
}

function buildOrder(blockLines: string[], rawMobLine: string): ParsedOrder {
  // a tracking ID on the Mob line is taken out first, so it never ends up in the product name
  const tr = findTracking(rawMobLine.replace(/(?:\+?91[\s-]?)?[6-9](?:[\s-]?\d){9}/, " "));
  let mobLine = rawMobLine;
  let tracking = "";
  if (tr) {
    tracking = tr.id;
    mobLine = rawMobLine.replace(new RegExp(`(?:\\b(?:track(?:ing)?(?:\\s*(?:id|no\\.?|number|#))?|awb(?:\\s*no\\.?)?|consignment(?:\\s*no\\.?)?|c\\.?n\\.?\\s*no\\.?)\\s*[:.#=-]?\\s*)?${tr.id}`, "i"), " ").replace(/\s+/g, " ").trim();
  }
  // Drop stray header words that sometimes sit above an order
  const lines = blockLines.filter((l) => !/^(paid|prepaid|cod|replacement|orders?)\s*:?\s*$/i.test(l));

  const problems: string[] = [];
  const customer_name = (lines[0] ?? "").replace(/^name\s*[:.-]\s*/i, "");
  const addressLines = lines.slice(1);

  // PIN: last 6-digit number in the address (usually "City, State - 670307")
  let pincode = "";
  for (let i = addressLines.length - 1; i >= 0 && !pincode; i--) {
    const m = addressLines[i].match(/(?<!\d)([1-9]\d{2}\s?\d{3})(?!\d)/g);
    if (m) pincode = m[m.length - 1].replace(/\s/g, "");
  }
  if (!pincode) {
    const m = mobLine.match(/pin\s*(?:code)?\s*[:.-]?\s*([1-9]\d{5})/i);
    if (m) pincode = m[1];
  }

  const address = addressLines.join("\n");

  // Phone: first 10-digit mobile number on the Mob line (handles +91, spaces, dashes)
  let phone = "";
  const afterMob = mobLine.replace(/^.*?(?:mob(?:ile)?|ph(?:one)?|contact)\s*(?:no\.?|number)?\s*[:.-]/i, "");
  const digitsRun = afterMob.match(/(?:\+?91[\s-]?)?[6-9](?:[\s-]?\d){9}/);
  if (digitsRun) phone = digitsRun[0].replace(/\D/g, "").slice(-10);

  // Payment
  let payment: ParsedOrder["payment"] = null;
  let cod_amount: number | null = null;
  const all = (mobLine + " " + lines.join(" ")).toUpperCase();
  if (/\bREPLACE?MENT\b/.test(all)) payment = "replacement";
  const cod = mobLine.match(/\bCOD\s*[:=-]?\s*(?:RS\.?|₹|INR)?\s*(\d{2,6})/i);
  if (payment !== "replacement") {
    if (cod) {
      payment = "cod";
      cod_amount = Number(cod[1]);
    } else if (/\b(PRE-?PAID|PAID)\b/i.test(mobLine)) payment = "paid";
    else if (/\bCOD\b/i.test(mobLine)) payment = "cod";
  }

  // Items + quantities
  let item = "";
  const items: { text: string; qty: number }[] = [];
  const itemMatch = mobLine.match(/item\s*(?:ref|name)?\s*[:.-]\s*(.+)$/i);
  if (itemMatch) {
    item = itemMatch[1].trim();
    for (const part of item.split(/\s*(?:\+|&|,|\band\b)\s*/i)) {
      const one = parseItemPart(part);
      if (one) items.push(one);
    }
  }

  if (!customer_name) problems.push("Name missing");
  if (!address) problems.push("Address missing");
  if (!pincode) problems.push("PIN not found");
  if (!phone) problems.push("Phone not found");
  if (!payment) problems.push("Payment type not found");
  if (!items.length) problems.push("Item not found");

  return {
    raw: [...blockLines, rawMobLine].filter(Boolean).join("\n"),
    customer_name,
    address,
    pincode,
    phone,
    payment,
    cod_amount,
    item,
    items,
    tracking,
    problems,
  };
}

/** "Glass Wiper x2", "2 x Glass Wiper", "Glass Wiper (2)", "Glass Wiper qty 2" → { text, qty } */
function parseItemPart(raw: string): { text: string; qty: number } | null {
  let text = raw.trim();
  if (!text) return null;
  let qty = 1;
  const suffix = text.match(/(?:\s*[x×*]\s?(\d{1,2})|\(\s*(\d{1,2})\s*\)|\bqty\s*[:.-]?\s*(\d{1,2})|\s(\d{1,2})\s*(?:nos?|pcs?)\.?)\s*$/i);
  if (suffix) {
    qty = Number(suffix[1] ?? suffix[2] ?? suffix[3] ?? suffix[4]) || 1;
    text = text.slice(0, suffix.index).trim();
  } else {
    const prefix = text.match(/^(\d{1,2})\s*(?:[x×*]|nos?|pcs?)?\s+(.+)$/i);
    if (prefix) {
      qty = Number(prefix[1]) || 1;
      text = prefix[2].trim();
    }
  }
  return text ? { text, qty } : null;
}

/** Matches "CAR REAR VIEW MIRROR" → "Rear View Mirror", "wiper" → "Glass Wiper", etc. */
export function matchProduct<T extends { id: string; name: string }>(item: string, products: T[]): T | null {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w && !["car", "the", "for", "new", "set", "pcs", "pc"].includes(w));
  const itemWords = norm(item);
  if (!itemWords.length) return null;

  let best: T | null = null;
  let bestScore = 0;
  for (const p of products) {
    const words = norm(p.name);
    if (!words.length) continue;
    const hits = words.filter((w) => itemWords.some((iw) => iw === w || iw.startsWith(w) || w.startsWith(iw))).length;
    const score = hits / words.length + hits / Math.max(itemWords.length, 1) / 10;
    if (hits > 0 && score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

/**
 * A list of tracking IDs pasted in one go (one per line, or copied from a booking receipt / Excel).
 * India Post numbers are picked out even when other text is mixed in; otherwise every code with a digit counts.
 */
export function extractTrackingIds(text: string): string[] {
  const indiaPost = text.toUpperCase().match(/\b[A-Z]{2}\d{9}IN\b/g);
  if (indiaPost?.length) return indiaPost;
  return text
    .toUpperCase()
    .split(/[\s,;|]+/)
    .map((t) => t.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, ""))
    .filter((t) => /^(?=[A-Z0-9-]*\d)[A-Z0-9-]{6,25}$/.test(t) && !/^[6-9]\d{9}$/.test(t));
}
