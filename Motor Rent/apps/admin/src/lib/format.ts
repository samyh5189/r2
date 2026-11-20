import { formatMoney, type Currency } from "@motor-rent/shared";

export const money = (minor: number, currency: string = "MVR") => formatMoney(minor, currency as Currency);

export function parseRange(value: string) {
  const m = /^[[(]"?([^",]+)"?,"?([^",)\]]+)"?[)\]]$/.exec(value.trim());
  if (!m) return null;
  const d = (s: string) => new Date(s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  return { start: d(m[1]!), end: d(m[2]!) };
}

export const dt = (d: Date) =>
  d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Indian/Maldives" });
