"use server";

import { districtsOfState, lookupPincode, type PinInfo } from "./pincode";
import { smartFill, type SmartFill } from "./smart-address";

export type PinResult = { info: PinInfo; stateDistricts: string[] } | null;

/** Area, district and post offices for a pincode (null = no such pincode). Public India Post data. */
export async function lookupPin(pin: string): Promise<PinResult> {
  if (!/^[1-9]\d{5}$/.test(pin)) return null;
  const info = lookupPincode(pin);
  return info ? { info, stateDistricts: districtsOfState(info.state) } : null;
}

/** Reads a customer's message (any common shape) and checks it against the India Post list. */
export async function smartFillMessage(text: string): Promise<SmartFill> {
  return smartFill(text.slice(0, 4000));
}
