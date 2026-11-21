// Reporting periods in Maldives time (UTC+5).
const MV = 5 * 3_600_000;
const DAY = 86_400_000;
export const PRESETS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "year", label: "This year" },
] as const;
export type PresetKey = (typeof PRESETS)[number]["key"];

/** Returns [from, to) as UTC instants for a preset. */
export function periodFor(key: string, now = Date.now()): { key: PresetKey; from: Date; to: Date; label: string } {
  const local = new Date(now + MV); // wall-clock in Maldives, read with getUTC*
  const y = local.getUTCFullYear(), m = local.getUTCMonth();
  const at = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm, dd) - MV);
  const today = at(y, m, local.getUTCDate());
  const k = (PRESETS.some((p) => p.key === key) ? key : "month") as PresetKey;
  const label = PRESETS.find((p) => p.key === k)!.label;
  switch (k) {
    case "today": return { key: k, label, from: today, to: new Date(today.getTime() + DAY) };
    case "7d": return { key: k, label, from: new Date(today.getTime() - 6 * DAY), to: new Date(today.getTime() + DAY) };
    case "last-month": return { key: k, label, from: at(y, m - 1, 1), to: at(y, m, 1) };
    case "year": return { key: k, label, from: at(y, 0, 1), to: at(y + 1, 0, 1) };
    default: return { key: k, label, from: at(y, m, 1), to: at(y, m + 1, 1) };
  }
}
