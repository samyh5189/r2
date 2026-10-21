import type { CheckKind, CheckSchedule, InspectionLog } from "./types";

export const CHECK_KINDS: CheckKind[] = ["daily", "weekly", "monthly", "yearly"];

export const KIND_LABEL: Record<CheckKind, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };

/** "today", "this week", … — the period each check covers */
export const PERIOD_NAME: Record<CheckKind, string> = { daily: "today", weekly: "this week", monthly: "this month", yearly: "this year" };

/** Logs saved before check kinds existed are daily inspections */
export const logKind = (log: Pick<InspectionLog, "kind">): CheckKind => log.kind ?? "daily";

/** Setup → Rules: the day each periodic check falls due. Set by applyGeneral (src/settings.ts). */
export const SCHEDULE: Required<CheckSchedule> = { weeklyDay: 6, monthlyDay: 1, yearlyMonth: 1, yearlyDay: 1, startFrom: {} };
export const DEFAULT_SCHEDULE: Required<CheckSchedule> = { ...SCHEDULE };

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const parseGB = (dateGB: string) => { const [d, m, y] = dateGB.split("/").map(Number); return new Date(y, m - 1, d); };
const daysIn = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate();
// A day past the month's end (e.g. 31 in April) falls on its last day
const onDay = (y: number, m0: number, day: number) => new Date(y, m0, Math.min(day, daysIn(y, m0)));

/** The day the current cycle of a check began: the latest scheduled day on or before `date` */
export function cycleStart(kind: CheckKind, date: Date, s: Required<CheckSchedule> = SCHEDULE): Date {
  const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
  if (kind === "daily") return new Date(y, m, d);
  if (kind === "weekly") return new Date(y, m, d - ((date.getDay() - s.weeklyDay + 7) % 7));
  if (kind === "monthly") {
    const here = onDay(y, m, s.monthlyDay);
    return d >= here.getDate() ? here : onDay(y, m - 1, s.monthlyDay);
  }
  const here = onDay(y, s.yearlyMonth - 1, s.yearlyDay);
  return date >= here ? here : onDay(y - 1, s.yearlyMonth - 1, s.yearlyDay);
}

/** The day the next cycle begins after the one starting on `start` */
export function nextCycle(kind: CheckKind, start: Date, s: Required<CheckSchedule> = SCHEDULE): Date {
  const y = start.getFullYear(), m = start.getMonth();
  if (kind === "daily") return new Date(y, m, start.getDate() + 1);
  if (kind === "weekly") return new Date(y, m, start.getDate() + 7);
  if (kind === "monthly") return onDay(y, m + 1, s.monthlyDay);
  return onDay(y + 1, s.yearlyMonth - 1, s.yearlyDay);
}

/**
 * The period a DD/MM/YYYY date falls in: the date itself, the day its weekly cycle began,
 * or the MM/YYYY / YYYY its monthly or yearly cycle began in. Mirrored in server.js.
 */
export function periodKey(kind: CheckKind, dateGB: string): string {
  if (kind === "daily") return dateGB;
  const start = cycleStart(kind, parseGB(dateGB));
  if (kind === "weekly") return start.toLocaleDateString("en-GB");
  if (kind === "monthly") return `${String(start.getMonth() + 1).padStart(2, "0")}/${start.getFullYear()}`;
  return String(start.getFullYear());
}

/** The Saturday that starts a date's inspection week (Sat–Fri), for the week sheet and Logs grouping */
export function inspectionWeek(dateGB: string): string {
  const date = parseGB(dateGB);
  date.setDate(date.getDate() - ((date.getDay() + 1) % 7));
  return date.toLocaleDateString("en-GB");
}

/** The first day a check is due under its start date (null: due from the first cycle) */
export function firstDue(kind: CheckKind, s: Required<CheckSchedule> = SCHEDULE): Date | null {
  const from = kind === "daily" ? undefined : s.startFrom?.[kind];
  if (!from) return null;
  const day = parseGB(from);
  const start = cycleStart(kind, day, s);
  return start.getTime() === day.getTime() ? day : nextCycle(kind, start, s);
}

export interface CheckStatus {
  /** Shown on the Checklist: not done this cycle, and past its start date */
  due: boolean;
  /** Done in the current cycle: hidden until `next` */
  done: boolean;
  /** Its start date hasn't come yet: hidden until `next` */
  notStarted: boolean;
  /** Not done, and the cycle before went without it too */
  overdue: boolean;
  since: Date;
  next: Date;
}

/** Whether a periodic check is due: it appears on its scheduled day and stays until someone does it */
export function checkStatus(kind: CheckKind, last: Pick<InspectionLog, "date"> | null, now = new Date()): CheckStatus {
  const first = firstDue(kind);
  if (first && now < first) return { due: false, done: false, notStarted: true, overdue: false, since: first, next: first };
  const since = cycleStart(kind, now);
  const next = nextCycle(kind, since);
  const lastDate = last ? parseGB(last.date) : null;
  const done = !!lastDate && lastDate >= since;
  const prevStart = cycleStart(kind, new Date(since.getFullYear(), since.getMonth(), since.getDate() - 1));
  // A cycle before the start date doesn't count as missed
  const overdue = !done && !!lastDate && lastDate < prevStart && (!first || prevStart >= first);
  return { due: !done, done, notStarted: false, overdue, since, next };
}

/** "Sat 25 Oct", with the year when it isn't this year */
export const dayLabel = (d: Date) =>
  d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });

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
  const [sd, sm, sy] = inspectionWeek(dateGB).split("/").map(Number);
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
