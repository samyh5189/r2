import type { InspectionLog, FaultReport, ChecklistSectionConfig } from "./types";
import { defaultChecklistConfig } from "./checklistData";

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

// ── Inspection week (Sat–Fri, same as the weekly sheet) ───────────────

export function inspectionWeekStart(dateGB: string): Date {
  const [d, m, y] = dateGB.split("/").map(Number);
  const date = new Date(y, m - 1, d);
  const daysFromSat = date.getDay() === 6 ? 0 : date.getDay() + 1;
  date.setDate(date.getDate() - daysFromSat);
  return date;
}

export function sameInspectionWeek(a: string, b: string): boolean {
  return inspectionWeekStart(a).getTime() === inspectionWeekStart(b).getTime();
}

// ── Admin (edit / delete) ─────────────────────────────────────────────

const LS_ADMIN = "hdk_admin_token";

export function getAdminToken(): string | null {
  try { return localStorage.getItem(LS_ADMIN); } catch { return null; }
}

export function signOutAdmin() {
  try { localStorage.removeItem(LS_ADMIN); } catch { /* ignore */ }
}

export async function adminLogin(email: string, password: string): Promise<string | null> {
  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return data.error ?? "Sign-in failed.";
  try { localStorage.setItem(LS_ADMIN, data.token); } catch { /* ignore */ }
  return null;
}

async function adminRequest(method: "PUT" | "DELETE", path: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAdminToken() ?? ""}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) signOutAdmin();
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
}

function lsReplace<T extends { id: string }>(key: string, id: string, item: T | null) {
  const items = lsGet<T>(key);
  lsSet(key, item ? items.map((i) => (i.id === id ? item : i)) : items.filter((i) => i.id !== id));
}

export async function updateLog(log: InspectionLog) {
  await adminRequest("PUT", `/api/logs/${log.id}`, log);
  lsReplace(LS_LOGS, log.id, log);
}

export async function deleteLog(id: string) {
  await adminRequest("DELETE", `/api/logs/${id}`);
  lsReplace<InspectionLog>(LS_LOGS, id, null);
}

export async function updateFaultReport(report: FaultReport) {
  await adminRequest("PUT", `/api/fault-reports/${report.id}`, report);
  lsReplace(LS_FAULTS, report.id, report);
}

export async function deleteFaultReport(id: string) {
  await adminRequest("DELETE", `/api/fault-reports/${id}`);
  lsReplace<FaultReport>(LS_FAULTS, id, null);
}

// ── Checklist config ──────────────────────────────────────────────────

const LS_CONFIG = "hdk_checklist_config";

export async function getChecklistConfig(): Promise<ChecklistSectionConfig[]> {
  try {
    const res = await fetch("/api/checklist-config");
    if (res.ok) {
      const { config } = await res.json();
      try { localStorage.setItem(LS_CONFIG, JSON.stringify(config)); } catch { /* ignore */ }
      return config ?? defaultChecklistConfig();
    }
  } catch { /* offline */ }
  try {
    const cached = JSON.parse(localStorage.getItem(LS_CONFIG) || "null");
    if (Array.isArray(cached)) return cached;
  } catch { /* ignore */ }
  return defaultChecklistConfig();
}

/** Pass null to reset to the built-in checklist. */
export async function saveChecklistConfig(config: ChecklistSectionConfig[] | null) {
  await adminRequest("PUT", "/api/checklist-config", { config });
  try { localStorage.setItem(LS_CONFIG, JSON.stringify(config)); } catch { /* ignore */ }
}
