/** Indian mobile: strips spaces, dashes, +91 / 91 / leading 0. Returns 10 digits or the cleaned input. */
export function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}

export function isValidPhone(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone);
}

export function normalizePin(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function isValidPin(pin: string): boolean {
  return /^[1-9]\d{5}$/.test(pin);
}

export function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
