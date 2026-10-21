import type { CheckKind, InspectionLog } from "./types";

export const CHECK_KINDS: CheckKind[] = ["daily", "weekly", "monthly", "yearly"];

export const KIND_LABEL: Record<CheckKind, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };

/** "today", "this week", … — the period each check covers */
export const PERIOD_NAME: Record<CheckKind, string> = { daily: "today", weekly: "this week", monthly: "this month", yearly: "this year" };

/** Logs saved before check kinds existed are daily inspections */
export const logKind = (log: Pick<InspectionLog, "kind">): CheckKind => log.kind ?? "daily";

/**
 * The period a DD/MM/YYYY date falls in: the date itself, the Saturday that starts its
 * inspection week, MM/YYYY or YYYY. Mirrored in server.js, which enforces the limits.
 */
export function periodKey(kind: CheckKind, dateGB: string): string {
  const [d, m, y] = dateGB.split("/");
  if (kind === "daily") return dateGB;
  if (kind === "monthly") return `${m}/${y}`;
  if (kind === "yearly") return y;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  date.setDate(date.getDate() - ((date.getDay() + 1) % 7)); // back to Saturday
  return date.toLocaleDateString("en-GB");
}
