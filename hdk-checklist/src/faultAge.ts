import type { FaultReport } from "./types";

const DAY_MS = 86_400_000;

/** Days a fault may stay open before it counts as overdue, by priority */
export const TARGET_DAYS: Record<FaultReport["priority"], number> = { "Immediate Grounding": 1, Urgent: 3, Routine: 14 };

function parseGB(date?: string, time?: string): number | null {
  if (!date || !/^\d{2}\/\d{2}\/\d{4}$/.test(date)) return null;
  const [d, m, y] = date.split("/").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0).getTime();
}

export const openedAt = (r: FaultReport) => Date.parse(r.createdAt) || parseGB(r.date, r.time) || Date.now();

/** When the report closed: the server's stamp, else the acceptance test date on older reports */
export function closedAt(r: FaultReport): number | null {
  if (r.status !== "Resolved") return null;
  return (r.resolvedAt && Date.parse(r.resolvedAt)) || parseGB(r.acceptance?.date, r.acceptance?.time);
}

export interface FaultAge {
  days: number;          // open so far, or how long it took to close
  closed: boolean;
  overdue: boolean;      // open past its target
  label: string;
}

export function faultAge(r: FaultReport, now = Date.now()): FaultAge {
  const closed = r.status === "Resolved";
  const end = closed ? closedAt(r) : now;
  const days = end == null ? NaN : Math.max(0, (end - openedAt(r)) / DAY_MS);
  const whole = Math.floor(days);
  const span = whole < 1 ? "<1 day" : `${whole} day${whole === 1 ? "" : "s"}`;
  return {
    days,
    closed,
    overdue: !closed && days > TARGET_DAYS[r.priority],
    label: closed ? (Number.isNaN(days) ? "Closed" : `Closed in ${span}`) : `Open ${span}`,
  };
}

export interface FaultAgeSummary {
  active: number;
  overdue: number;
  avgDaysToClose: number | null;
}

export function summarizeAges(reports: FaultReport[], now = Date.now()): FaultAgeSummary {
  const ages = reports.map((r) => faultAge(r, now));
  const closed = ages.filter((a) => a.closed && !Number.isNaN(a.days));
  return {
    active: ages.filter((a) => !a.closed).length,
    overdue: ages.filter((a) => a.overdue).length,
    avgDaysToClose: closed.length ? closed.reduce((s, a) => s + a.days, 0) / closed.length : null,
  };
}
