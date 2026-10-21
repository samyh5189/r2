import type { InspectionLog, ServiceSettings } from "./types";
import { ENGINE_HOURS_ID } from "./checklistData";
import { logTime } from "./trends";

const DAY_MS = 86_400_000;

export interface HoursReading { t: number; date: string; hours: number }

/** Engine running hours recorded on inspections, oldest first */
export function engineReadings(logs: InspectionLog[]): HoursReading[] {
  const out: HoursReading[] = [];
  for (const log of logs) {
    for (const sec of log.sections) {
      const it = sec.items.find((i) => i.id === ENGINE_HOURS_ID);
      const hours = it ? Number(String(it.remarks).replace(/[^\d.]/g, "")) : NaN;
      if (it && it.remarks && Number.isFinite(hours)) out.push({ t: logTime(log), date: log.date, hours });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Average engine hours per day over the last 60 days of readings */
function hoursPerDay(readings: HoursReading[]): number | null {
  const last = readings[readings.length - 1];
  const recent = readings.filter((r) => r.t >= last.t - 60 * DAY_MS);
  const first = recent[0];
  const days = (last.t - first.t) / DAY_MS;
  if (days < 3 || last.hours <= first.hours) return null;
  return (last.hours - first.hours) / days;
}

function parseGB(date: string): Date {
  const [d, m, y] = date.split("/").map(Number);
  return new Date(y, m - 1, d);
}

export type ServiceState = "unset" | "ok" | "soon" | "overdue";

export interface ServiceStatus {
  state: ServiceState;
  current?: HoursReading;
  perDay: number | null;
  nextHours?: number;
  hoursLeft?: number;
  /** When the hours run out at the current rate */
  estDate?: Date;
  /** Calendar deadline from the month interval */
  dueByDate?: Date;
  reasons: string[];
}

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Next engine service, due by hours or by months, whichever comes first. */
export function serviceStatus(logs: InspectionLog[], s: ServiceSettings, now = Date.now()): ServiceStatus {
  const readings = engineReadings(logs);
  const current = readings[readings.length - 1];
  const perDay = current ? hoursPerDay(readings) : null;
  const status: ServiceStatus = { state: "unset", current, perDay, reasons: [] };
  const byHours = s.intervalHours != null && s.lastServiceHours != null;
  const byDate = s.intervalMonths != null && !!s.lastServiceDate;
  if (!byHours && !byDate) return status;

  let state: ServiceState = "ok";
  if (byHours) {
    status.nextHours = s.lastServiceHours! + s.intervalHours!;
    if (current) {
      status.hoursLeft = status.nextHours - current.hours;
      const warn = s.warnHours ?? Math.max(25, Math.round(s.intervalHours! * 0.1));
      if (status.hoursLeft <= 0) { state = "overdue"; status.reasons.push(`${Math.round(-status.hoursLeft)} h past the ${status.nextHours} h service`); }
      else {
        if (status.hoursLeft <= warn) { state = "soon"; status.reasons.push(`${Math.round(status.hoursLeft)} h to the ${status.nextHours} h service`); }
        if (perDay) status.estDate = new Date(current.t + (status.hoursLeft / perDay) * DAY_MS);
      }
    }
  }
  if (byDate) {
    const due = parseGB(s.lastServiceDate!);
    due.setMonth(due.getMonth() + s.intervalMonths!);
    status.dueByDate = due;
    const daysLeft = (due.getTime() - now) / DAY_MS;
    if (daysLeft < 0) { state = "overdue"; status.reasons.push(`calendar service was due ${fmt(due)}`); }
    else if (daysLeft <= 14 && state !== "overdue") { state = "soon"; status.reasons.push(`calendar service due ${fmt(due)}`); }
  }
  status.state = state;
  return status;
}

export { fmt as fmtServiceDate };
