import "server-only";
import { districtsOfState, findOffice, lookupPincode, officeBase, placeKey, samePlace, type PinInfo } from "./pincode";

/**
 * "Fill from message": reads a customer's WhatsApp reply in any common shape
 * (labelled "Name: … Pincode: …", plain lines, or the whole address on one line, with emojis / Malayalam)
 * and uses the India Post list to find the post office, house and place.
 */

export type SmartFill = {
  name: string;
  phone: string;
  pincode: string;
  house: string;
  place: string;
  po: string;
  pin: { info: PinInfo; stateDistricts: string[] } | null;
  /** pincodes to offer when the customer's pincode is missing or wrong */
  pinSuggestions: { pincode: string; office: string; district: string }[];
  /** "COD" / "Prepaid" written in the message */
  payment: "cod" | "paid" | null;
  warnings: string[];
};

type Label = "name" | "phone" | "address" | "house" | "place" | "po" | "district" | "pincode" | "state" | "landmark";

const LABELS: [Label, RegExp][] = [
  ["pincode", /^(?:pin\s*code|pincode|pin|zip|postal\s*code|പിൻ\s*കോഡ്|പിൻകോഡ്)$/i],
  ["phone", /^(?:(?:mobile|mob|phone|ph|whats\s*app|contact|alternate)\s*(?:no\.?|number|num)?|number|ഫോൺ(?:\s*നമ്പർ)?|മൊബൈൽ(?:\s*നമ്പർ)?|നമ്പർ)$/i],
  ["name", /^(?:(?:full|customer|your)?\s*name|പേര്)$/i],
  ["house", /^(?:house(?:\s*name|\s*no\.?)?|h\.?\s*no\.?|veedu|വീട്(?:ട്)?(?:\s*പേര്)?)$/i],
  ["po", /^(?:p\.?\s?o\.?|post(?:\s*office)?|post\s*name|പോസ്റ്റ്(?:\s*ഓഫീസ്)?)$/i],
  ["district", /^(?:dist(?:rict)?\.?|ജില്ല)$/i],
  ["state", /^(?:state|സംസ്ഥാനം)$/i],
  ["landmark", /^(?:land\s*mark|near|അടയാളം)$/i],
  ["place", /^(?:place|street|area|locality|town|city|village|സ്ഥലം)$/i],
  ["address", /^(?:(?:full|delivery|complete|your)?\s*address|addr|വിലാസം|അഡ്രസ്സ്?)$/i],
];

const HOUSE_WORDS = /\b(house|manzil|manzi?l|veedu|veed|bhavan|bhavanam|nivas|niwas|villa|illam|mandiram|kottaram|cottage|apartments?|flat|quarters|\(h\)|h\.?\s*no)\b/i;
const HOUSE_END = /(?:nivas|niwas|bhavan|bhavanam|manzil|veedu|villa|mandiram|illam|house|cottage)$/i;
const isHouse = (s: string) => HOUSE_WORDS.test(s) || /\(\s*h\s*\)/i.test(s) || s.split(/\s+/).some((w) => HOUSE_END.test(w) && w.length > 6);
const NOISE_ONLY = /^(?:mob(?:ile)?|ph(?:one)?|contact|whats\s?app|wa|no|number|name|address|order|confirm|dist(?:rict)?|pin(?:\s*code)?|state)\.?$/i;
const PAYMENT = /^(?:cod|c\s*o\s*d|cash\s*on\s*delivery|prepaid|pre\s*paid|paid|gpay|google\s*pay|online|upi)$/i;
// common short forms of Kerala districts ("tvm", "ekm"): the district is already on the last line
const ABBR = /^(?:tvm|tvpm|klm|pta|alp|alpy|ktm|idk|ekm|tsr|tcr|pkd|mlp|kkd|clt|wyd|knr|ksd)\.?$/i;
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}\u{1F1E6}-\u{1F1FF}]/gu;
const MALAYALAM = /[ഀ-ൿ]/;
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s(.-])(\w)/g, (_, a, b) => a + b.toUpperCase());
const tidy = (s: string) => s.replace(/\s+/g, " ").replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "");

function labelOf(raw: string): Label | null {
  const l = raw.replace(EMOJI, "").replace(/[*_~]/g, "").replace(/\s+/g, " ").trim();
  for (const [k, re] of LABELS) if (re.test(l)) return k;
  return null;
}

export function smartFill(text: string): SmartFill {
  const warnings: string[] = [];
  const lines = text
    .replace(/\r/g, "")
    .replace(/\bp\s*\.\s*o\b\.?/gi, " PO ")
    .replace(/([A-Za-z])(\d{6,})/g, "$1 $2")
    .replace(/(\d{6,})([A-Za-z])/g, "$1 $2")
    .replace(EMOJI, " ")
    .replace(/[*_~]/g, "")
    .split("\n")
    .map((l) => l.replace(/^\s*\[?\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4},?\s+\d{1,2}:\d{2}[^\]]*\]?\s*[^:]{0,40}:\s*(?=\S)/, "").trim())
    .filter(Boolean);

  // 1) labelled values ("Full Name : muneer"); a value may continue on the next unlabelled lines
  const vals: Partial<Record<Label, string>> = {};
  const free: string[] = [];
  let current: Label | null = null;
  for (const line of lines) {
    const m = line.match(/^([^:：=]{1,32}?)\s*[:：=]\s*(.*)$/) ?? line.match(/^([A-Za-z.\s]{2,20}?)\s+[-–]\s+(.*)$/);
    const lab = m ? labelOf(m[1]) : null;
    if (lab) {
      let value = m![2];
      // "Name: Manoj P M, Pulimoottinkalayil, …" → the name is only the first part, the rest is address
      if (["name", "phone", "pincode", "district", "state"].includes(lab) && value.includes(",")) {
        const [first, ...more] = value.split(",");
        value = first;
        free.push(...more.map((x) => x.trim()).filter(Boolean));
        current = null;
      } else current = lab;
      vals[lab] = tidy([vals[lab], value].filter(Boolean).join("\n"));
      continue;
    }
    // instructions in Malayalam ("Order confirm ചെയ്യാൻ …") or with no letters/digits are skipped
    if (MALAYALAM.test(line) && !/[a-z]{3,}.*\d|\d{6}/i.test(line.replace(/order|confirm|details|please|send/gi, ""))) continue;
    if (current && ["address", "place", "landmark"].includes(current)) vals[current] = `${vals[current]}\n${line}`;
    else {
      current = null;
      free.push(line);
    }
  }

  // 2) phone + pincode (labelled ones first, otherwise anywhere)
  const all = [Object.values(vals).join("\n"), free.join("\n")].join("\n");
  const phoneSrc = vals.phone ?? all;
  const pm = phoneSrc.match(/(?:\+?91[\s-]?|\b0)?([6-9](?:[\s-]?\d){9})(?!\d)/) ?? all.match(/(?:\+?91[\s-]?|\b0)?([6-9](?:[\s-]?\d){9})(?!\d)/);
  const phone = pm ? pm[1].replace(/\D/g, "") : "";
  const strip = (s: string) => (pm ? s.split(pm[0]).join(" ") : s);
  const pinSrc = strip(vals.pincode ?? "") || strip(all);
  const pinM = pinSrc.match(/(?<!\d)([1-9]\d{2}\s?\d{3})(?!\d)/) ?? strip(all).match(/(?<!\d)([1-9]\d{2}\s?\d{3})(?!\d)/);
  const pincode = pinM ? pinM[1].replace(/\s/g, "") : "";

  // 3) name: labelled, otherwise the first free line
  const freeLines = free.map((l) => tidy(strip(l).replace(pinM?.[1] ?? "\u0000", " "))).filter((l) => l && !/^\d+$/.test(l));
  let name = vals.name ? tidy(vals.name.split("\n")[0]) : "";
  let payment: "cod" | "paid" | null = null;

  // 4) everything that describes the address, in order
  const info = pincode ? lookupPincode(pincode) : null;
  const stateDistricts = info ? districtsOfState(info.state) : [];
  const districtNames = new Set([...(info ? stateDistricts : []), ...(vals.district ? [vals.district] : [])].map(placeKey));
  const noise = (seg: string) =>
    tidy(
      seg
        .replace(pinM?.[1] ?? "\u0000", " ")
        .replace(/\b(?:kerala|tamil\s*nadu|karnataka|india)\b/gi, " ")
        .replace(/\b(?:pin(?:\s*code)?|dist(?:rict)?|state)\b\.?\s*[:-]?/gi, " "),
    );
  const segments: string[] = [];
  for (const block of [vals.house, vals.address, vals.place, vals.landmark, ...freeLines].map((b) => (b ? strip(b) : b)))
    if (block)
      for (const s of block.split(/\n|,|;|(?<=[A-Za-z0-9)]{2})\s*\.\s*(?=[A-Za-z(])|\s+[-–]\s+/)) {
        const t = noise(s);
        if (!t || /^\d+$/.test(t) || NOISE_ONLY.test(t) || ABBR.test(t)) continue;
        if (PAYMENT.test(t)) {
          payment ??= /^(?:cod|c\s*o\s*d|cash\s*on\s*delivery)$/i.test(t) ? "cod" : "paid";
          continue;
        }
        if (districtNames.has(placeKey(t))) continue; // "Kollam" on its own: already on the last line
        segments.push(t);
      }

  if (!name) {
    const i = segments.findIndex((x) => !/^po$/i.test(x) && !isHouse(x));
    if (i >= 0) {
      let n = segments[i];
      segments.splice(i, 1);
      // initials on their own ("Ks", "K S") belong to the next word: "Ks Babu"
      while (/^[a-z]{1,2}$|^[b-df-hj-np-tv-z]{3}$|^(?:[a-z]\s){1,3}[a-z]?$/i.test(n.trim()) && segments[i] && !isHouse(segments[i]) && !/^po$/i.test(segments[i]) && n.split(" ").length < 4) {
        n = `${n} ${segments[i]}`;
        segments.splice(i, 1);
      }
      name = n;
    }
  }

  const pinSuggestionsEarly: SmartFill["pinSuggestions"] = [];
  // 5) post office: labelled, "X po" inside the text, or any of this pincode's post offices named in the text
  let po = "";
  let poCustomer = "";
  let house = vals.house ? noise(vals.house.split("\n")[0]) : "";
  const place: string[] = [];
  const official = (cand: string) => {
    const o = info?.offices.find((x) => samePlace(officeBase(x), cand));
    return o ? officeBase(o) : undefined;
  };

  if (vals.po) poCustomer = tidy(vals.po.replace(/\b(?:p\.?\s?o\.?|post(?:\s*office)?)\b\.?/gi, " "));
  let poAt = -1; // segment index the PO was found in
  let before = "";
  let after = "";
  if (!poCustomer) {
    for (let i = 0; i < segments.length && poAt < 0; i++) {
      const m = segments[i].match(/^(.*?)\s*\(?\b(?:p\.?\s?o\.?|post(?:\s*office)?)\b\.?\)?\s*(.*)$/i);
      if (!m) continue;
      const words = m[1].split(/\s+/).filter(Boolean);
      if (!words.length && !m[2]) {
        const next = segments[i + 1] ?? "";
        const prev = segments[i - 1] ?? "";
        const useNext = official(next) || !(official(prev) || (prev && !isHouse(prev) && i - 1 > 0));
        const j = useNext ? i + 1 : i - 1;
        if (segments[j]) {
          poCustomer = segments[j];
          segments[j] = "";
          poAt = i;
        }
        continue;
      }
      // the PO is the last 1–3 words before "po"; prefer the shortest that is a real post office of this pincode
      let k = 1;
      for (let n = 1; n <= Math.min(3, words.length); n++)
        if (official(words.slice(-n).join(" "))) {
          k = n;
          break;
        }
      if (!words.length && m[2]) {
        // "PO: Edakulangara" style inside a segment
        const w = m[2].split(/\s+/);
        let k = 1;
        for (let n = Math.min(3, w.length); n >= 1; n--)
          if (official(w.slice(0, n).join(" "))) {
            k = n;
            break;
          }
        poCustomer = w.slice(0, k).join(" ");
        after = w.slice(k).join(" ");
      } else {
        poCustomer = words.slice(-k).join(" ");
        before = words.slice(0, -k).join(" ");
        after = m[2];
      }
      poAt = i;
    }
  }
  if (!poCustomer && info) {
    // no "po" written: look for one of this pincode's post offices anywhere in the text
    outer: for (let i = 0; i < segments.length; i++) {
      const words = segments[i].split(/\s+/);
      for (let n = 3; n >= 1; n--)
        for (let s = 0; s + n <= words.length; s++) {
          const cand = words.slice(s, s + n).join(" ");
          if (official(cand)) {
            poCustomer = cand;
            before = words.slice(0, s).join(" ");
            after = words.slice(s + n).join(" ");
            poAt = i;
            break outer;
          }
        }
    }
  }

  if (poCustomer) {
    const off = official(poCustomer);
    if (off) po = off;
    else {
      po = poCustomer;
      // the customer's PO belongs to another pincode?
      const elsewhere = findOffice(poCustomer).slice(0, 4);
      if (elsewhere.length && info) {
        po = elsewhere[0].office;
        for (const e of elsewhere) pinSuggestionsEarly.push({ pincode: e.pincode, office: e.office, district: e.district });
        warnings.push(`${titleCase(poCustomer)} PO is pincode ${elsewhere.map((e) => e.pincode).join(" / ")}, but the customer wrote ${pincode}. Ask which is right.`);
      } else if (info) warnings.push(`“${titleCase(poCustomer)}” isn't a post office of ${pincode}. Check the post office with the customer.`);
    }
  }

  // 6) house + place from what's left
  const rest: string[] = [];
  segments.forEach((s, i) => {
    if (i === poAt) {
      if (before) rest.push(before);
      rest.push("\u0000PO"); // marker: where the PO sat
      if (after) rest.push(after);
    } else if (!(vals.house && i === 0 && s === house)) rest.push(s);
  });
  const parts = rest.filter((s) => s && s !== "\u0000PO");
  if (!house) {
    const idx = parts.findIndex((s) => isHouse(s));
    const pick = idx >= 0 ? idx : 0;
    house = parts[pick] ?? "";
    parts.splice(pick, 1);
  } else {
    const idx = parts.findIndex((s) => placeKey(s) === placeKey(house));
    if (idx >= 0) parts.splice(idx, 1);
  }
  for (const s of parts) if (s && placeKey(s) !== placeKey(po)) place.push(s);

  // 7) pincode checks / suggestions
  const pinSuggestions: SmartFill["pinSuggestions"] = [...pinSuggestionsEarly];
  if (vals.district && info && !info.districts.some((d) => samePlace(d, vals.district!)))
    warnings.push(`Customer wrote district “${titleCase(vals.district)}”, but ${pincode} is in ${info.district}. Ask which is right.`);
  if (!info && (poCustomer || segments.length)) {
    if (pincode) warnings.push(`Pincode ${pincode} doesn't exist. Ask the customer again.`);
    else warnings.push("No pincode in the message.");
    let cands = poCustomer ? findOffice(poCustomer) : [];
    if (!cands.length)
      for (const seg of segments) {
        const words = seg.split(/\s+/);
        for (let n = 2; n >= 1 && !cands.length; n--)
          for (let s = 0; s + n <= words.length && !cands.length; s++) {
            const w = words.slice(s, s + n).join(" ");
            if (placeKey(w).length < 5 || HOUSE_WORDS.test(w)) continue;
            const hits = findOffice(w);
            // only trust it if the district is also mentioned, or the name is rare
            const textKey = placeKey(text);
            const near = hits.filter((h) => textKey.includes(placeKey(h.district)));
            if (near.length) cands = near;
            else if (hits.length && hits.length <= 3) cands = hits;
          }
      }
    if (cands.length && !poCustomer) po = cands[0].office;
    // the PO and district are known now: don't repeat them as place lines
    for (let i = place.length - 1; i >= 0; i--)
      if (samePlace(place[i], po) || cands.some((c) => samePlace(place[i], c.district))) place.splice(i, 1);
    const district = vals.district ? placeKey(vals.district) : "";
    for (const c of cands)
      if (!district || samePlace(c.district, vals.district!)) pinSuggestions.push({ pincode: c.pincode, office: c.office, district: c.district });
  }
  if (!phone) warnings.push("No 10-digit mobile number in the message.");

  return {
    name: titleCase(name),
    phone,
    pincode,
    house: titleCase(house),
    place: place.map(titleCase).join("\n"),
    po: titleCase(po),
    pin: info ? { info, stateDistricts } : null,
    pinSuggestions: pinSuggestions.slice(0, 6),
    payment,
    warnings,
  };
}
