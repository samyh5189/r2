import type { InspectionLog, ItemInputType, ItemStatus } from "./types";
import { itemType } from "./checklistData";

export type Severity = "high" | "medium" | "low";

export interface Finding {
  itemId: string;
  label: string;
  section: string;
  severity: Severity;
  reasons: string[];
  /** Chronological statuses in the window (oldest → newest), for the strip */
  history: ItemStatus[];
  faults: number;
}

export interface Reading {
  itemId: string;
  label: string;
  unit: string;
  latest: number;
  perDay: number | null;
  min?: number;
  max?: number;
  /** Days until the trend crosses a limit; 0 = already outside */
  daysToLimit: number | null;
  count: number;
}

export interface TrendReport {
  inspections: number;
  inspectionsWithFaults: number;
  totalFaults: number;
  findings: Finding[];
  readings: Reading[];
}

const DAY_MS = 86_400_000;
const isFault = (s: ItemStatus) => s === "NOK" || s === "U/S";
const RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function logTime(log: Pick<InspectionLog, "date" | "time">): number {
  const [d, m, y] = log.date.split("/").map(Number);
  const [hh, mm] = (log.time || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0).getTime();
}

function shortSection(title: string) {
  return title.includes("—") ? title.split("—").pop()!.trim() : title;
}

// Least-squares slope of value against time, in units per day
function slopePerDay(points: { t: number; v: number }[]): number | null {
  if (points.length < 2) return null;
  const xs = points.map((p) => (p.t - points[0].t) / DAY_MS);
  const mx = xs.reduce((a, x) => a + x, 0) / xs.length;
  const my = points.reduce((a, p) => a + p.v, 0) / points.length;
  let num = 0, den = 0;
  points.forEach((p, i) => { num += (xs[i] - mx) * (p.v - my); den += (xs[i] - mx) ** 2; });
  return den === 0 ? null : num / den;
}

export function analyzeTrends(allLogs: InspectionLog[], windowDays: number, now = Date.now()): TrendReport {
  const start = now - windowDays * DAY_MS;
  const midpoint = now - (windowDays / 2) * DAY_MS;
  const logs = allLogs.filter((l) => logTime(l) >= start).sort((a, b) => logTime(a) - logTime(b));

  type Entry = { t: number; status: ItemStatus; value: string };
  const items = new Map<string, { label: string; section: string; type: ItemInputType; unit: string; min?: number; max?: number; entries: Entry[] }>();
  let totalFaults = 0;

  for (const log of logs) {
    const t = logTime(log);
    for (const sec of log.sections) {
      for (const it of sec.items) {
        if (!it.status && !it.remarks) continue;
        const rec = items.get(it.id) ?? { label: it.label, section: shortSection(sec.title), type: itemType(it), unit: it.unit ?? "", entries: [] };
        // Latest log wins for label / limits
        Object.assign(rec, { label: it.label, section: shortSection(sec.title), type: itemType(it), unit: it.unit ?? "", min: it.min, max: it.max });
        rec.entries.push({ t, status: it.status, value: it.remarks });
        items.set(it.id, rec);
        if (isFault(it.status)) totalFaults++;
      }
    }
  }

  const findings: Finding[] = [];
  const readings: Reading[] = [];

  for (const [itemId, rec] of items) {
    const statuses = rec.entries.map((e) => e.status);
    const faults = statuses.filter(isFault).length;
    const reasons: string[] = [];
    let severity: Severity | null = null;
    const raise = (s: Severity, reason: string) => {
      reasons.push(reason);
      if (!severity || RANK[s] > RANK[severity]) severity = s;
    };

    if (rec.type === "number") {
      const points = rec.entries.map((e) => ({ t: e.t, v: Number(e.value) })).filter((p) => Number.isFinite(p.v)).slice(-10);
      if (points.length > 0) {
        const latest = points[points.length - 1].v;
        const perDay = slopePerDay(points);
        let daysToLimit: number | null = null;
        if ((rec.max != null && latest > rec.max) || (rec.min != null && latest < rec.min)) daysToLimit = 0;
        else if (perDay && perDay > 0 && rec.max != null) daysToLimit = (rec.max - latest) / perDay;
        else if (perDay && perDay < 0 && rec.min != null) daysToLimit = (latest - rec.min) / -perDay;

        readings.push({ itemId, label: rec.label, unit: rec.unit, latest, perDay, min: rec.min, max: rec.max, daysToLimit, count: points.length });
        if (daysToLimit === 0) raise("high", `Latest reading ${latest}${rec.unit ? ` ${rec.unit}` : ""} is outside the allowed range`);
        else if (daysToLimit != null && daysToLimit <= 14) raise("medium", `Trending toward its limit — about ${plural(Math.ceil(daysToLimit), "day")} left at the current rate`);
        else if (daysToLimit != null && daysToLimit <= 30) raise("low", `Will reach its limit in about ${plural(Math.ceil(daysToLimit), "day")} at the current rate`);
      }
    }

    if (faults > 0) {
      // Trailing run of faulted inspections = still unresolved
      let streak = 0;
      for (let i = statuses.length - 1; i >= 0 && isFault(statuses[i]); i--) streak++;
      // Separate episodes: fault after a non-fault answer
      let episodes = 0;
      statuses.forEach((s, i) => { if (isFault(s) && (i === 0 || !isFault(statuses[i - 1]))) episodes++; });
      const recent = rec.entries.filter((e) => e.t >= midpoint && isFault(e.status)).length;
      const earlier = faults - recent;
      const last = statuses[statuses.length - 1];
      const prevFault = statuses.slice(0, -1).reverse().find(isFault);

      if (last === "U/S" && prevFault === "NOK") raise("high", "Deteriorated from NOK to U/S");
      if (streak >= 2) raise(last === "U/S" ? "high" : "medium", `Faulted in the last ${streak} inspections — still unresolved`);
      else if (streak === 1 && last === "U/S") raise("high", "Unserviceable at the latest inspection");
      if (episodes >= 2) raise("medium", `Fault returned ${episodes} times after being cleared — likely intermittent; find the root cause`);
      else if (faults >= 3 && streak < 2) raise("medium", `${faults} faults in the last ${windowDays} days`);
      if (recent >= 2 && recent > earlier * 1.5 && earlier > 0) raise("medium", `Faults increasing (${earlier} → ${recent} in the last ${windowDays / 2} days)`);
      if (!severity && faults >= 1) raise("low", `${faults} fault${faults > 1 ? "s" : ""} in the last ${windowDays} days — keep an eye on it`);
    }

    if (severity) findings.push({ itemId, label: rec.label, section: rec.section, severity, reasons, history: statuses.slice(-14), faults });
  }

  findings.sort((a, b) => RANK[b.severity] - RANK[a.severity] || b.faults - a.faults);
  return {
    inspections: logs.length,
    inspectionsWithFaults: logs.filter((l) => l.sections.some((s) => s.items.some((it) => isFault(it.status)))).length,
    totalFaults,
    findings,
    readings,
  };
}
