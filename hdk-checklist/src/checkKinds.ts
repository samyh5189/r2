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

const SHORT = (d: Date, withYear: boolean) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });

/**
 * Logs tab grouping: daily inspections by inspection week (Sat–Fri), weekly checks by month,
 * monthly checks by year. Yearly checks aren't grouped (null).
 */
export function logGroup(kind: CheckKind, dateGB: string): { key: string; label: string } | null {
  const [, m, y] = dateGB.split("/");
  if (kind === "yearly") return null;
  if (kind === "monthly") return { key: y, label: y };
  if (kind === "weekly") {
    return { key: `${y}-${m}`, label: new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) };
  }
  const [sd, sm, sy] = periodKey("weekly", dateGB).split("/").map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(sy, sm - 1, sd + 6);
  return {
    key: `${sy}-${String(sm).padStart(2, "0")}-${String(sd).padStart(2, "0")}`,
    label: start.getMonth() === end.getMonth()
      ? `${start.getDate()} – ${SHORT(end, true)}`
      : `${SHORT(start, start.getFullYear() !== end.getFullYear())} – ${SHORT(end, true)}`,
  };
}

/** What a group covers, for its header: "Week", "Month", "Year" */
export const GROUP_NOUN: Record<CheckKind, string> = { daily: "Week", weekly: "Month", monthly: "Year", yearly: "" };
