import type { FaultReport, InspectionLog, ServiceSettings } from "./types";
import { logKind, periodKey } from "./checkKinds";
import { closedAt, faultAge, openedAt, TARGET_DAYS } from "./faultAge";
import { engineReadings, serviceStatus, type ServiceStatus } from "./service";
import { logTime } from "./trends";

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const isFault = (s: string) => s === "NOK" || s === "U/S";

export interface OpenFaultRow { reportNumber: string; title: string; priority: FaultReport["priority"]; status: string; ageDays: number; overdue: boolean }

export interface MonthlySummary {
  month: string;              // MM/YYYY
  title: string;              // October 2026
  daysInPeriod: number;       // days elapsed (whole month, or up to today)
  daily: { inspections: number; daysCovered: number; missedDates: string[]; withFaults: number; conditions: Record<string, number> };
  weekly: { date: string; operator: string }[];
  monthly: { date: string; operator: string } | null;
  yearly: { date: string; operator: string } | null;   // any time this year up to month end
  faults: {
    raised: number;
    byPriority: Record<FaultReport["priority"], number>;
    resolvedInMonth: number;
    avgDaysToClose: number | null;
    openAtEnd: OpenFaultRow[];
  };
  topItems: { label: string; count: number }[];
  engine: { start?: number; end?: number; used?: number };
  service: ServiceStatus;
  operators: { name: string; count: number }[];
}

/** Months that have any data, newest first, as MM/YYYY */
export function availableMonths(logs: InspectionLog[], reports: FaultReport[]): string[] {
  const set = new Set([...logs.map((l) => l.date.slice(3)), ...reports.map((r) => r.date.slice(3))]);
  const now = new Date();
  set.add(`${pad(now.getMonth() + 1)}/${now.getFullYear()}`);
  return [...set].filter((m) => /^\d{2}\/\d{4}$/.test(m))
    .sort((a, b) => (b.slice(3) + b.slice(0, 2)).localeCompare(a.slice(3) + a.slice(0, 2)));
}

export const monthTitle = (month: string) => {
  const [m, y] = month.split("/").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
};

export function monthlySummary(month: string, logs: InspectionLog[], reports: FaultReport[], settings: ServiceSettings, now = Date.now()): MonthlySummary {
  const [m, y] = month.split("/").map(Number);
  const start = new Date(y, m - 1, 1).getTime();
  const monthEnd = new Date(y, m, 1).getTime();          // exclusive
  const end = Math.min(monthEnd, now);                     // the summary's "as of" point
  const totalDays = new Date(y, m, 0).getDate();
  const today = new Date(now);
  const inMonth = logs.filter((l) => l.date.slice(3) === month);
  const daily = inMonth.filter((l) => logKind(l) === "daily");
  const covered = new Set(daily.map((l) => l.date));
  // In the current month, today only counts once it's been inspected (the day isn't over)
  const todayGB = `${pad(today.getDate())}/${pad(today.getMonth() + 1)}/${today.getFullYear()}`;
  const daysInPeriod = now >= monthEnd ? totalDays : now < start ? 0 : today.getDate() - (covered.has(todayGB) ? 0 : 1);
  const missedDates: string[] = [];
  for (let d = 1; d <= daysInPeriod; d++) {
    const ds = `${pad(d)}/${month}`;
    if (!covered.has(ds)) missedDates.push(ds);
  }
  const conditions: Record<string, number> = {};
  for (const l of daily) if (l.overallCondition) conditions[l.overallCondition] = (conditions[l.overallCondition] ?? 0) + 1;

  const pick = (l?: InspectionLog) => (l ? { date: l.date, operator: l.operatorName } : null);
  const weekly = inMonth.filter((l) => logKind(l) === "weekly").map((l) => ({ date: l.date, operator: l.operatorName })).sort((a, b) => a.date.localeCompare(b.date));
  const monthly = pick(inMonth.find((l) => logKind(l) === "monthly"));
  const yearly = pick(logs.find((l) => logKind(l) === "yearly" && periodKey("yearly", l.date) === String(y) && l.date.slice(3, 5) <= pad(m)));

  // Faults raised this month, and the state of all faults at the end of it
  const raisedList = reports.filter((r) => r.date.slice(3) === month);
  const byPriority = { "Immediate Grounding": 0, Urgent: 0, Routine: 0 } as Record<FaultReport["priority"], number>;
  for (const r of raisedList) byPriority[r.priority]++;
  const closedThisMonth = reports.filter((r) => { const c = closedAt(r); return c != null && c >= start && c < monthEnd; });
  const closeDays = closedThisMonth.map((r) => faultAge(r).days).filter((d) => !Number.isNaN(d));
  const openAtEnd: OpenFaultRow[] = reports
    .filter((r) => openedAt(r) < end && (closedAt(r) ?? Infinity) >= end && !(r.status === "Resolved" && closedAt(r) == null))
    .map((r) => {
      const ageDays = (end - openedAt(r)) / DAY_MS;
      return {
        reportNumber: r.reportNumber,
        title: r.vehicleEquipmentLine.replace(/^RESCUE 2 \(HDK-ARFF\)\s*/, "") || r.faults.map((f) => f.label).join(", "),
        priority: r.priority,
        status: r.status,
        ageDays,
        overdue: ageDays > TARGET_DAYS[r.priority],
      };
    })
    .sort((a, b) => b.ageDays - a.ageDays);

  const itemCounts = new Map<string, number>();
  for (const l of inMonth) for (const s of l.sections) for (const it of s.items) {
    if (isFault(it.status)) itemCounts.set(it.label, (itemCounts.get(it.label) ?? 0) + 1);
  }
  const topItems = [...itemCounts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 8);

  const hours = engineReadings(inMonth);
  const engine = hours.length ? { start: hours[0].hours, end: hours[hours.length - 1].hours, used: hours[hours.length - 1].hours - hours[0].hours } : {};

  const opCounts = new Map<string, number>();
  for (const l of inMonth) opCounts.set(l.operatorName, (opCounts.get(l.operatorName) ?? 0) + 1);

  return {
    month,
    title: monthTitle(month),
    daysInPeriod,
    daily: { inspections: daily.length, daysCovered: covered.size, missedDates, withFaults: daily.filter((l) => l.faultCount > 0).length, conditions },
    weekly,
    monthly,
    yearly,
    faults: {
      raised: raisedList.length,
      byPriority,
      resolvedInMonth: closedThisMonth.length,
      avgDaysToClose: closeDays.length ? closeDays.reduce((a, d) => a + d, 0) / closeDays.length : null,
      openAtEnd,
    },
    topItems,
    engine,
    // Service position as it stood at the end of the month
    service: serviceStatus(logs.filter((l) => logTime(l) < end), settings, end),
    operators: [...opCounts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
}
