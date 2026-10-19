import type { InspectionLog, FaultReport } from "./types";

const LOGS_KEY = "hdk_inspection_logs";
const FAULTS_KEY = "hdk_fault_reports";

export function getLogs(): InspectionLog[] {
  try {
    return JSON.parse(localStorage.getItem(LOGS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveLog(log: InspectionLog): void {
  const logs = getLogs();
  logs.unshift(log);
  localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
}

export function getFaultReports(): FaultReport[] {
  try {
    return JSON.parse(localStorage.getItem(FAULTS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveFaultReport(report: FaultReport): void {
  const reports = getFaultReports();
  reports.unshift(report);
  localStorage.setItem(FAULTS_KEY, JSON.stringify(reports));
}

export function nextFaultReportNumber(): string {
  const reports = getFaultReports();
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
