import { getChecklistConfig, getGeneralSettings, getOperators, getServiceSettings, listAllFaults, listAllLogs } from "./storage";
import { CHECK_KINDS, KIND_LABEL, logKind } from "./checkKinds";

function download(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

/** Everything in one JSON file: inspections, fault reports and the setup (no PINs or passwords) */
export async function downloadBackup(): Promise<{ logs: number; faults: number }> {
  const [logs, faults, operators, service, rules, ...checklists] = await Promise.all([
    listAllLogs({}), listAllFaults({}), getOperators(), getServiceSettings(), getGeneralSettings(),
    ...CHECK_KINDS.map((k) => getChecklistConfig(k)),
  ]);
  const data = {
    app: "HDK ARFF — RESCUE 2", exportedAt: new Date().toISOString(),
    inspections: logs, faultReports: faults,
    setup: { operators, serviceSettings: service, rules, checklists: Object.fromEntries(CHECK_KINDS.map((k, i) => [k, checklists[i]])) },
  };
  download(`hdk-arff-backup-${stamp()}.json`, "application/json", JSON.stringify(data, null, 1));
  return { logs: logs.length, faults: faults.length };
}

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

/** One row per inspection, for Excel */
export async function downloadLogsCsv(): Promise<number> {
  const logs = await listAllLogs({});
  const rows: unknown[][] = [["Date", "Time", "Check", "Operator", "Condition", "Faults", "Fault items", "Signed off by", "Comments"]];
  for (const l of logs) {
    const faulty = l.sections.flatMap((s) => s.items).filter((i) => i.status === "NOK" || i.status === "U/S").map((i) => `${i.label} (${i.status})`);
    rows.push([l.date, l.time, KIND_LABEL[logKind(l)], l.operatorName, l.overallCondition, l.faultCount, faulty.join("; "), l.shiftSignoff?.name ?? "", l.comments]);
  }
  download(`hdk-arff-inspections-${stamp()}.csv`, "text/csv", csv(rows));
  return logs.length;
}

/** One row per fault report, for Excel */
export async function downloadFaultsCsv(): Promise<number> {
  const faults = await listAllFaults({});
  const rows: unknown[][] = [["Report No.", "Date", "Time", "Operator", "Priority", "Status", "Fault", "Items", "Repaired by", "Resolved at"]];
  for (const r of faults) {
    rows.push([r.reportNumber, r.date, r.time, r.operatorName, r.priority, r.status, r.vehicleEquipmentLine.replace(/^RESCUE 2 \(HDK-ARFF\)\s*/, ""),
      r.faults.map((f) => `${f.label} (${f.status})`).join("; "), r.repair?.repairedBy ?? "", r.resolvedAt ? new Date(r.resolvedAt).toLocaleString("en-GB") : ""]);
  }
  download(`hdk-arff-fault-reports-${stamp()}.csv`, "text/csv", csv(rows));
  return faults.length;
}
