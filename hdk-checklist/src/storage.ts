import type { InspectionLog, FaultReport, ChecklistSectionConfig, Operator, ShiftSignoff, FaultRepair, FaultAcceptance } from "./types";
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

/** Returns an error message when the server rejects the log (e.g. today's inspection already exists). */
export async function saveLog(log: InspectionLog): Promise<string | null> {
  try {
    const res = await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(log),
    });
    if (res.status >= 400 && res.status < 500) {
      const data = await res.json().catch(() => ({}));
      return data.error ?? "The inspection was rejected.";
    }
  } catch { /* offline — keep it locally and sync later */ }
  // Mirror to localStorage as offline fallback
  const logs = lsGet<InspectionLog>(LS_LOGS);
  if (!logs.find((l) => l.id === log.id)) {
    lsSet(LS_LOGS, [log, ...logs]);
  }
  return null;
}

const LS_DEVICE = "hdk_device_id";

/** A random id kept on this device, so each device submits at most one inspection a day. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem(LS_DEVICE);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(LS_DEVICE, id); }
    return id;
  } catch { return ""; }
}

/** An inspection already submitted on this date from this device, or by this operator (one each per day). */
export async function findLogForDate(dateGB: string, operatorName = ""): Promise<InspectionLog | null> {
  const device = deviceId();
  // Logs saved before device ids existed are recognised by this device's local copy
  const savedHere = new Set(lsGet<InspectionLog>(LS_LOGS).map((l) => l.id));
  const name = operatorName.trim().toLowerCase();
  return (await getLogs()).find((l) => l.date === dateGB && (
    (device && l.deviceId === device) || savedHere.has(l.id) || (name && l.operatorName.trim().toLowerCase() === name)
  )) ?? null;
}

// ── Fault reports ─────────────────────────────────────────────────────

export async function getFaultReports(): Promise<FaultReport[]> {
  try {
    const res = await fetch("/api/fault-reports");
    if (res.ok) return await res.json();
  } catch { /* offline */ }
  return lsGet<FaultReport>(LS_FAULTS);
}

/** Saves the report; the server assigns the final report number, so use the returned copy. */
export async function saveFaultReport(report: FaultReport): Promise<FaultReport> {
  let saved = report;
  try {
    const res = await fetch("/api/fault-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.report) saved = data.report;
  } catch { /* offline */ }
  const reports = lsGet<FaultReport>(LS_FAULTS);
  if (!reports.find((r) => r.id === saved.id)) {
    lsSet(LS_FAULTS, [saved, ...reports]);
  }
  return saved;
}

// ── Report number ─────────────────────────────────────────────────────

/** Provisional number for display/offline; the server assigns the final one on save. */
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

// ── Admin-editable config (checklist, operators) ──────────────────────

async function getConfig<T>(path: string, cacheKey: string, fallback: () => T): Promise<T> {
  try {
    const res = await fetch(path);
    if (res.ok) {
      const { config } = await res.json();
      try { localStorage.setItem(cacheKey, JSON.stringify(config)); } catch { /* ignore */ }
      return config ?? fallback();
    }
  } catch { /* offline */ }
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (cached) return cached;
  } catch { /* ignore */ }
  return fallback();
}

async function putConfig(path: string, cacheKey: string, config: unknown) {
  await adminRequest("PUT", path, { config });
  try { localStorage.setItem(cacheKey, JSON.stringify(config)); } catch { /* ignore */ }
}

export const getChecklistConfig = () => getConfig<ChecklistSectionConfig[]>("/api/checklist-config", "hdk_checklist_config", defaultChecklistConfig);
/** Pass null to reset to the built-in checklist. */
export const saveChecklistConfig = (config: ChecklistSectionConfig[] | null) => putConfig("/api/checklist-config", "hdk_checklist_config", config);

export const getOperators = () => getConfig<Operator[]>("/api/operators", "hdk_operators", () => []);
export const saveOperators = (ops: Operator[]) => putConfig("/api/operators", "hdk_operators", ops);

// ── Shift in-charge sign-off ──────────────────────────────────────────

export async function signOffLog(logId: string, name: string, signature: string): Promise<ShiftSignoff> {
  const res = await fetch(`/api/logs/${logId}/signoff`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, signature }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Sign-off failed.");
  return data.shiftSignoff;
}

// ── Repair workflow ───────────────────────────────────────────────────

export async function updateRepair(reportId: string, repair: FaultRepair, acceptance: FaultAcceptance): Promise<FaultReport> {
  const res = await fetch(`/api/fault-reports/${reportId}/repair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repair, acceptance }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not save the repair.");
  lsReplace(LS_FAULTS, reportId, data.report);
  return data.report;
}
