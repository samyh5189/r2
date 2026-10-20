import type { InspectionLog, FaultReport } from "./types";

const LS_LOGS = "hdk_inspection_logs";
const LS_FAULTS = "hdk_fault_reports";

function lsGet<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
}
function lsSet<T>(key: string, items: T[]) {
  try { localStorage.setItem(key, JSON.stringify(items)); } catch { /* storage full */ }
}

// ── Inspection logs ───────────────────────────────────────────────────

export async function getLogs(): Promise<InspectionLog[]> {
  try {
    const res = await fetch("/api/logs");
    if (res.ok) return await res.json();
  } catch { /* offline — fall through */ }
  return lsGet<InspectionLog>(LS_LOGS);
}

export async function saveLog(log: InspectionLog): Promise<void> {
  // Write to DB
  try {
    await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(log),
    });
  } catch { /* offline */ }
  // Mirror to localStorage as offline fallback
  const logs = lsGet<InspectionLog>(LS_LOGS);
  if (!logs.find((l) => l.id === log.id)) {
    lsSet(LS_LOGS, [log, ...logs]);
  }
}

// ── Fault reports ─────────────────────────────────────────────────────

export async function getFaultReports(): Promise<FaultReport[]> {
  try {
    const res = await fetch("/api/fault-reports");
    if (res.ok) return await res.json();
  } catch { /* offline */ }
  return lsGet<FaultReport>(LS_FAULTS);
}

export async function saveFaultReport(report: FaultReport): Promise<void> {
  try {
    await fetch("/api/fault-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
    });
  } catch { /* offline */ }
  const reports = lsGet<FaultReport>(LS_FAULTS);
  if (!reports.find((r) => r.id === report.id)) {
    lsSet(LS_FAULTS, [report, ...reports]);
  }
}

// ── Report number ─────────────────────────────────────────────────────

export async function nextFaultReportNumber(): Promise<string> {
  const reports = await getFaultReports();
  const year = new Date().getFullYear();
  const prefix = `HDK-ARFF/${year}/`;
  const existing = reports
    .map((r) => r.reportNumber)
    .filter((n) => n.startsWith(prefix))
    .map((n) => parseInt(n.replace(prefix, ""), 10))
    .filter((n) => !isNaN(n));
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${prefix}${String(next).padStart(2, "0")}`;
}
