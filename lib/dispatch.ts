export const DEFAULT_MESSAGE =
  "Hi {name}, your {business} order {order} ({products}) has been dispatched by India Post 📦\n\nTracking ID: *{tracking}*\nTrack here: https://www.indiapost.gov.in\n{cod_line}\nThank you for shopping with {business}!";

export const DEFAULT_MESSAGE_ML =
  "📦 *Order Dispatched! 🚚🇮🇳*\n\nDear Customer, നിങ്ങളുടെ order India Post വഴി dispatch ചെയ്തിട്ടുണ്ട്. 📮\n\n🚚 *Expected Delivery:* 3–4 working days 😊\n\n🔎 *Tracking ID:* {tracking}\n\n🌐 *Track Your Order:* https://www.indiapost.gov.in/\n\n❤️ Thank you for shopping with *{business}!* 🛍️";

export type Lang = "en" | "ml";

/** Copies text; falls back to a hidden textarea when the Clipboard API is blocked (e.g. phone over plain http). */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const t = document.createElement("textarea");
    t.value = text;
    t.style.position = "fixed";
    t.style.opacity = "0";
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  }
}

/** "FASIL SAMEER" → "Fasil Sameer" */
export function titleCase(s: string) {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|[\s.'-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
}

export type MessageData = {
  name: string;
  order: string;
  products: string;
  tracking: string;
  cod: number;
  business: string;
};

/** Fills {name} {order} {products} {tracking} {cod} {cod_line} {business} in the template. */
export function buildMessage(template: string, d: MessageData) {
  const codLine = d.cod > 0 ? `Please keep ₹${d.cod.toLocaleString("en-IN")} ready to pay at delivery (COD).` : "";
  return (template || DEFAULT_MESSAGE)
    .replaceAll("{name}", titleCase(d.name))
    .replaceAll("{order}", d.order)
    .replaceAll("{products}", d.products)
    .replaceAll("{tracking}", d.tracking || "(tracking ID)")
    .replaceAll("{cod}", `₹${d.cod.toLocaleString("en-IN")}`)
    .replaceAll("{cod_line}", codLine)
    .replaceAll("{business}", d.business)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** WhatsApp link that opens a chat with the message typed in (India numbers). */
export function whatsappLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "").slice(-10);
  return `https://wa.me/91${digits}?text=${encodeURIComponent(text)}`;
}
