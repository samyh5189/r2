import type { CheckKind, FaultBrief, GeneralSettings, ServiceSettings, InspectionLog, FaultReport, ChecklistSectionConfig, Operator, ShiftSignoff, FaultRepair, FaultAcceptance } from "./types";
import { defaultChecklistConfig } from "./checklistData";
import { logKind, periodKey } from "./checkKinds";
import { engineEntries, type EngineEntry } from "./service";

const LS_LOGS = "hdk_inspection_logs";
const LS_FAULTS = "hdk_fault_reports";

function lsGet<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
}
function lsSet<T>(key: string, items: T[]) {
  try { localStorage.setItem(key, JSON.stringify(items)); } catch { /* storage full */ }
}

// ── Images ────────────────────────────────────────────────────────────
// Signatures and photos are uploaded one by one and records keep only their link, so no request
// or list comes near Vercel's 4.5 MB limit. Offline, images stay inline and the server moves them later.

async function uploadImage(dataUrl: string): Promise<string> {
  try {
    const res = await fetch("/api/files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl }) });
    if (res.ok) return (await res.json()).url;
  } catch { /* offline */ }
  return dataUrl;
}

/** Returns a copy of the value with every inline image replaced by its uploaded link */
export async function uploadImages<T>(value: T): Promise<T> {
  if (typeof value === "string") return (value.startsWith("data:image/") ? await uploadImage(value) : value) as T;
  if (Array.isArray(value)) return (await Promise.all(value.map((v) => uploadImages(v)))) as T;
  if (value && typeof value === "object") {
    const entries = await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await uploadImages(v)] as const));
    return Object.fromEntries(entries) as T;
  }
  return value;
}

/** An image as a data URL, fetching uploaded ones (jsPDF and canvas work need the bytes) */
export async function imageData(src: string): Promise<string> {
  if (!src || src.startsWith("data:")) return src;
  const blob = await (await fetch(src)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// ── Lists, a page at a time ───────────────────────────────────────────
// The server sends 50 records at a time, newest first; `next` asks for the page after.
// Offline, the copies saved on this device are filtered the same way.

export interface Page<T> { items: T[]; next: string | null; offline?: boolean }

interface ListQuery { date?: string; operator?: string; from?: string; to?: string; limit?: number; before?: string | null }
export interface LogQuery extends ListQuery { kind?: CheckKind; period?: string; faults?: boolean; unsigned?: boolean }
export interface FaultQuery extends ListQuery { status?: "open" | "resolved"; q?: string }

const ymd = (dateGB: string) => dateGB.split("/").reverse().join("");

function localMatch(r: { date: string; operatorName: string }, q: ListQuery) {
  return (!q.date || r.date.includes(q.date))
    && (!q.operator || r.operatorName.toLowerCase().includes(q.operator.toLowerCase()))
    && (!q.from || ymd(r.date) >= ymd(q.from))
    && (!q.to || ymd(r.date) <= ymd(q.to));
}

async function fetchPage<T extends { createdAt: string }>(path: string, q: object, localKey: string, match: (r: T) => boolean): Promise<Page<T>> {
  const params = new URLSearchParams({ limit: "50" });
  for (const [k, v] of Object.entries(q)) if (v != null && v !== "" && v !== false) params.set(k, v === true ? "1" : String(v));
  try {
    const res = await fetch(`${path}?${params}`);
    if (res.ok) return await res.json();
  } catch { /* offline — fall through */ }
  const items = lsGet<T>(localKey).filter(match).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { items, next: null, offline: true };
}

export const listLogs = (q: LogQuery) => fetchPage<InspectionLog>("/api/logs", q, LS_LOGS, (l) =>
  localMatch(l, q) && (!q.kind || logKind(l) === q.kind) && (!q.period || periodKey(logKind(l), l.date) === q.period)
  && (!q.faults || l.faultCount > 0) && (!q.unsigned || !l.shiftSignoff));

export const listFaults = (q: FaultQuery) => fetchPage<FaultReport>("/api/fault-reports", q, LS_FAULTS, (r) =>
  localMatch(r, q) && (!q.status || (q.status === "resolved") === (r.status === "Resolved"))
  && (!q.q || JSON.stringify([r.reportNumber, r.vehicleEquipmentLine, r.operatorName, r.faults.map((f) => f.label)]).toLowerCase().includes(q.q.toLowerCase())));

/** Every record matching the query (for a week, a month, …), following the pages */
async function listAll<T>(list: (q: ListQuery) => Promise<Page<T>>, q: ListQuery): Promise<T[]> {
  const out: T[] = [];
  let before: string | null | undefined;
  do {
    const page = await list({ ...q, limit: 200, before });
    out.push(...page.items);
    before = page.next;
  } while (before);
  return out;
}
export const listAllLogs = (q: LogQuery) => listAll((p) => listLogs({ ...q, ...p }), q);
export const listAllFaults = (q: FaultQuery) => listAll((p) => listFaults({ ...q, ...p }), q);

/** Every fault report, cut down to what age tracking and the monthly summary use */
export async function getFaultBriefs(): Promise<FaultBrief[]> {
  try {
    const res = await fetch("/api/fault-reports/brief");
    if (res.ok) return await res.json();
  } catch { /* offline */ }
  return lsGet<FaultReport>(LS_FAULTS);
}

/** What the home screen and service status need, without loading every record */
export interface Overview {
  counts: Record<CheckKind, number>;
  /** The latest check of each kind, without its items and signature */
  latest: Record<CheckKind, Omit<InspectionLog, "sections" | "operatorSignature"> | null>;
  openFaults: FaultReport[];
  engine: EngineEntry[];
  /** MM/YYYY with any inspections or fault reports */
  months: string[];
  offline?: boolean;
}

function localOverview(): Overview {
  const logs = lsGet<InspectionLog>(LS_LOGS).sort((a, b) => ymd(b.date).localeCompare(ymd(a.date)) || b.createdAt.localeCompare(a.createdAt));
  const faults = lsGet<FaultReport>(LS_FAULTS);
  const kinds: CheckKind[] = ["daily", "weekly", "monthly", "yearly"];
  return {
    counts: Object.fromEntries(kinds.map((k) => [k, logs.filter((l) => logKind(l) === k).length])) as Overview["counts"],
    latest: Object.fromEntries(kinds.map((k) => [k, logs.find((l) => logKind(l) === k) ?? null])) as Overview["latest"],
    openFaults: faults.filter((r) => r.status !== "Resolved"),
    engine: engineEntries(logs),
    months: [...new Set([...logs, ...faults].map((r) => r.date.slice(3)))],
    offline: true,
  };
}

let overviewCache: { at: number; data: Promise<Overview> } | null = null;

/** Cached for a few seconds so screens shown together share one request; `fresh` after a save */
export function getOverview(fresh = false): Promise<Overview> {
  if (!fresh && overviewCache && Date.now() - overviewCache.at < 10_000) return overviewCache.data;
  const data = fetch("/api/overview")
    .then((res) => (res.ok ? res.json() as Promise<Overview> : localOverview()))
    .catch(() => localOverview());
  overviewCache = { at: Date.now(), data };
  return data;
}

/** How many records saved on this device the database doesn't have */
export async function countUnsynced(): Promise<number> {
  const logs = lsGet<InspectionLog>(LS_LOGS).map((l) => l.id);
  const faults = lsGet<FaultReport>(LS_FAULTS).map((r) => r.id);
  if (logs.length + faults.length === 0) return 0;
  try {
    const data = await postJson<{ logs: string[]; faults: string[] }>("/api/records/missing", { logs, faults }, "");
    return data.logs.length + data.faults.length;
  } catch { return 0; }
}

// ── Inspection logs ───────────────────────────────────────────────────

export interface Rejection { error: string; conflict: boolean }

/**
 * Saves the log with the operator's PIN. Returns the server's reason when it refuses the log:
 * `conflict` when the inspection is already done, otherwise e.g. a wrong PIN.
 * Returns the saved copy (images as links) otherwise.
 */
export async function saveLog(log: InspectionLog, pin = ""): Promise<{ saved: InspectionLog } | Rejection> {
  const uploaded = await uploadImages(log);
  let offline = false;
  try {
    const res = await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...uploaded, pin }),
    });
    if (res.status >= 400 && res.status < 500) {
      const data = await res.json().catch(() => ({}));
      return { error: data.error ?? "The inspection was rejected.", conflict: res.status === 409 };
    }
    offline = !res.ok;
  } catch { offline = true; }
  // Mirror to localStorage; an unsent log keeps the PIN so it can sync later
  const logs = lsGet<InspectionLog>(LS_LOGS);
  if (!logs.find((l) => l.id === uploaded.id)) {
    lsSet(LS_LOGS, [offline && pin ? { ...uploaded, pin } : uploaded, ...logs]);
  }
  return { saved: uploaded };
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

/**
 * The inspection of this kind already covering the date's period. A daily inspection counts
 * when it came from this device or this operator (one each per day); the weekly, monthly and
 * yearly checks are one per period for the vehicle.
 */
export async function findLogForDate(dateGB: string, operatorName = "", kind: CheckKind = "daily"): Promise<InspectionLog | null> {
  if (kind !== "daily") return (await listLogs({ kind, period: periodKey(kind, dateGB), limit: 1 })).items[0] ?? null;
  const logs = await listAllLogs({ kind, from: dateGB, to: dateGB });
  const device = deviceId();
  // Logs saved before device ids existed are recognised by this device's local copy
  const savedHere = new Set(lsGet<InspectionLog>(LS_LOGS).map((l) => l.id));
  const name = operatorName.trim().toLowerCase();
  return logs.find((l) => l.date === dateGB && (
    (device && l.deviceId === device) || savedHere.has(l.id) || (name && l.operatorName.trim().toLowerCase() === name)
  )) ?? null;
}

// ── Fault reports ─────────────────────────────────────────────────────

/**
 * Saves the report with the reporter's PIN; the server assigns the final report number, so use
 * the returned copy. Throws when the server refuses it (e.g. wrong PIN).
 */
export async function saveFaultReport(report: FaultReport, pin = ""): Promise<FaultReport> {
  let saved = await uploadImages(report);
  let offline = false;
  try {
    const res = await fetch("/api/fault-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...saved, pin }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status >= 400 && res.status < 500) throw new Error(data.error ?? "The fault report was rejected.");
    if (res.ok && data.report) saved = data.report;
    else offline = true;
  } catch (e) {
    if (e instanceof Error && !(e instanceof TypeError)) throw e; // a refusal, not a network failure
    offline = true;
  }
  if (offline && pin) saved = { ...saved, pin } as FaultReport;
  const reports = lsGet<FaultReport>(LS_FAULTS);
  if (!reports.find((r) => r.id === saved.id)) {
    lsSet(LS_FAULTS, [saved, ...reports]);
  }
  return saved;
}

// ── Report number ─────────────────────────────────────────────────────

/** Provisional number for display/offline; the server assigns the final one on save. */
export async function nextFaultReportNumber(): Promise<string> {
  const reports = await getFaultBriefs();
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
  log = await uploadImages(log);
  await adminRequest("PUT", `/api/logs/${log.id}`, log);
  lsReplace(LS_LOGS, log.id, log);
}

export async function deleteLog(id: string) {
  await adminRequest("DELETE", `/api/logs/${id}`);
  lsReplace<InspectionLog>(LS_LOGS, id, null);
}

export async function updateFaultReport(report: FaultReport) {
  report = await uploadImages(report);
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
  config = await uploadImages(config);
  await adminRequest("PUT", path, { config });
  try { localStorage.setItem(cacheKey, JSON.stringify(config)); } catch { /* ignore */ }
}

// Daily keeps its original path and cache key; the periodic checklists get their own
const configPath = (kind: CheckKind) => (kind === "daily" ? "/api/checklist-config" : `/api/checklist-config/${kind}`);
const configCache = (kind: CheckKind) => (kind === "daily" ? "hdk_checklist_config" : `hdk_checklist_config_${kind}`);

export const getChecklistConfig = (kind: CheckKind = "daily") =>
  getConfig<ChecklistSectionConfig[]>(configPath(kind), configCache(kind), () => defaultChecklistConfig(kind));
/** Pass null to reset to the built-in checklist. */
export const saveChecklistConfig = (config: ChecklistSectionConfig[] | null, kind: CheckKind = "daily") =>
  putConfig(configPath(kind), configCache(kind), config);

export const getOperators = () => getConfig<Operator[]>("/api/operators", "hdk_operators", () => []);
/** Admin: new PINs go to the server only; the local cache keeps just whether one is set */
export async function saveOperators(ops: Operator[]) {
  await adminRequest("PUT", "/api/operators", { config: ops });
  const cached = ops.map(({ pin, clearPin, clearSignature, ...o }) => ({
    ...o,
    hasPin: pin ? true : clearPin ? false : o.hasPin,
    hasSignature: clearSignature ? false : o.hasSignature,
  }));
  try { localStorage.setItem("hdk_operators", JSON.stringify(cached)); } catch { /* ignore */ }
}

async function postJson<T>(path: string, body: object, fallbackError: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("No connection — try again when online.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? fallbackError);
  return data as T;
}

/** Checks an operator's name and PIN; returns their saved signature link, if any */
export async function verifyOperator(name: string, pin: string, inCharge = false, role?: "arff"): Promise<{ name: string; signature: string | null }> {
  return postJson("/api/operators/verify", { name, pin, inCharge, role }, "Could not check your PIN.");
}

/** Saves (or with null, clears) the operator's signature for next time */
export async function saveOperatorSignature(name: string, pin: string, signature: string | null): Promise<void> {
  await postJson("/api/operators/signature", { name, pin, signature: signature && await uploadImages(signature) }, "Could not save your signature.");
}

// ── Shift in-charge sign-off ──────────────────────────────────────────

export async function signOffLog(logId: string, name: string, pin: string, signature: string): Promise<ShiftSignoff> {
  const data = await postJson<{ shiftSignoff: ShiftSignoff }>(`/api/logs/${logId}/signoff`, { name, pin, signature: await uploadImages(signature) }, "Sign-off failed.");
  return data.shiftSignoff;
}

// ── Repair workflow ───────────────────────────────────────────────────

/** Repair progress, recorded by an ARFF operator identified with their PIN */
export async function updateRepair(reportId: string, recordedBy: string, pin: string, repair: FaultRepair, acceptance: FaultAcceptance): Promise<FaultReport> {
  const data = await postJson<{ report: FaultReport }>(`/api/fault-reports/${reportId}/repair`, {
    recordedBy, pin, repair: await uploadImages(repair), acceptance: await uploadImages(acceptance),
  }, "Could not save the repair.");
  lsReplace(LS_FAULTS, reportId, data.report);
  return data.report;
}

// ── Service schedule and email ────────────────────────────────────────

export const getGeneralSettings = () => getConfig<GeneralSettings>("/api/general-settings", "hdk_general", () => ({}));
export const saveGeneralSettings = (settings: GeneralSettings) => putConfig("/api/general-settings", "hdk_general", settings);

export const getServiceSettings = () => getConfig<ServiceSettings>("/api/service-settings", "hdk_service_settings", () => ({}));
export const saveServiceSettings = (settings: ServiceSettings) => putConfig("/api/service-settings", "hdk_service_settings", settings);

/** Setup → Email. The password is write-only: the server only says whether one is saved. */
export interface EmailSettings {
  host: string;
  port: number;
  security: "ssl" | "starttls" | "none";
  user: string;
  pass?: string;            // only sent when changing it
  clearPassword?: boolean;
  hasPassword?: boolean;
  passwordFromEnv?: boolean;
  fromName: string;
  fromAddress: string;
  replyTo: string;
  to: string[];
  cc: string[];
  subjectPrefix: string;
  footer: string;
  faultEmails: boolean;
  minPriority: FaultReport["priority"];
}

export async function getEmailSettings(): Promise<{ settings: EmailSettings; problem: string | null }> {
  const res = await fetch("/api/email-settings", { headers: { Authorization: `Bearer ${getAdminToken() ?? ""}` } });
  if (res.status === 401) signOutAdmin();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not load email settings.");
  return data;
}
export const saveEmailSettings = (settings: EmailSettings) => adminRequest("PUT", "/api/email-settings", { settings });

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

type EmailResult = { sent: number; skipped?: string } | { error: string };

async function postEmail(path: string, body: object, admin: boolean): Promise<EmailResult> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(admin ? { Authorization: `Bearer ${getAdminToken() ?? ""}` } : {}) },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { sent: data.sent ?? 0, skipped: data.skipped } : { error: data.error ?? `Email failed (${res.status})` };
  } catch {
    return { error: "No connection — email not sent." };
  }
}

/** Emails a newly created fault report's PDF to the recipients set in Setup (once per report). */
export async function emailFaultReport(report: FaultReport, pdf: { blob: Blob; filename: string }): Promise<EmailResult> {
  return postEmail(`/api/fault-reports/${report.id}/email`, { pdf: await blobToBase64(pdf.blob), filename: pdf.filename }, false);
}

/** Admin: email any PDF (monthly summary) to the recipients. */
export async function emailPdf(subject: string, text: string, pdf?: { blob: Blob; filename: string }): Promise<EmailResult> {
  return postEmail("/api/email", { subject, text, ...(pdf ? { pdf: await blobToBase64(pdf.blob), filename: pdf.filename } : {}) }, true);
}

export const describeEmail = (r: EmailResult) =>
  "error" in r ? `Email not sent: ${r.error}`
    : r.skipped ? `Not emailed: ${r.skipped}`
    : `📧 Emailed to ${r.sent} recipient${r.sent === 1 ? "" : "s"}.`;
