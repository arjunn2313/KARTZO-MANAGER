import "server-only";
import data from "./pincodes.json";

// India Post pincode directory (19,159 pincodes, ~1.5 lakh post offices).
// Source: npm "indian-pincodes" (MIT, 2024). Compact form: pin → [district index(es), state index, post offices].
type Raw = { states: string[]; districts: string[]; pins: Record<string, [number | number[], number, string[]]> };
const D = data as unknown as Raw;

export type PinInfo = {
  pincode: string;
  district: string;
  /** every district this pincode covers (usually one) */
  districts: string[];
  state: string;
  offices: string[];
};

export function lookupPincode(pin: string): PinInfo | null {
  const clean = pin.replace(/\D/g, "");
  const row = D.pins[clean];
  if (!row) return null;
  const ds = (Array.isArray(row[0]) ? row[0] : [row[0]]).map((i) => D.districts[i]);
  return { pincode: clean, district: ds[0], districts: ds, state: D.states[row[1]], offices: row[2] };
}

let byState: Map<string, string[]> | null = null;
/** All district names in a state (to spot an address that names a different district). */
export function districtsOfState(state: string): string[] {
  if (!byState) {
    const m = new Map<string, Set<string>>();
    for (const row of Object.values(D.pins)) {
      const s = D.states[row[1]];
      const set = m.get(s) ?? new Set<string>();
      for (const i of Array.isArray(row[0]) ? row[0] : [row[0]]) set.add(D.districts[i]);
      m.set(s, set);
    }
    byState = new Map([...m].map(([k, v]) => [k, [...v]]));
  }
  return byState.get(state) ?? [];
}

/**
 * Loose spelling key for Kerala / Indian place names, so customer spellings still match India Post's:
 * "edakullangarra" = "Edakulangara", "Karunagappally" = "Karunagappaly", "Thrissur" = "Trissur".
 */
export function placeKey(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/th/g, "t")
    .replace(/ph/g, "f")
    .replace(/zh/g, "l")
    .replace(/w/g, "v")
    .replace(/y/g, "i")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/(.)\1+/g, "$1")
    .replace(/[aeiou]$/, "");
}

/** Edit distance (small strings only). */
export function editDistance(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Same place name allowing small typos (longer names allow a bit more). */
export function samePlace(a: string, b: string) {
  const x = placeKey(a);
  const y = placeKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (Math.min(x.length, y.length) < 5) return false;
  return editDistance(x, y) <= (Math.min(x.length, y.length) >= 9 ? 2 : 1);
}

/** "Panangad (Ernakulam)" → "Panangad" (India Post adds the district to tell same-named offices apart) */
export const officeBase = (o: string) => o.replace(/\s*\(.*?\)\s*$/, "").replace(/\s+/g, " ").trim();

let officeIndex: Map<string, { pincode: string; office: string }[]> | null = null;
/** Every pincode that has a post office with this name (loose match). */
export function findOffice(name: string): { pincode: string; office: string; district: string; state: string }[] {
  if (!officeIndex) {
    officeIndex = new Map();
    for (const [pin, row] of Object.entries(D.pins))
      for (const o of row[2]) {
        const k = placeKey(officeBase(o));
        const list = officeIndex.get(k) ?? [];
        list.push({ pincode: pin, office: officeBase(o) });
        officeIndex.set(k, list);
      }
  }
  const hits = officeIndex.get(placeKey(name)) ?? [];
  return hits.map((h) => {
    const info = lookupPincode(h.pincode)!;
    return { ...h, district: info.district, state: info.state };
  });
}
