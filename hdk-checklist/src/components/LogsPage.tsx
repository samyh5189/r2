import { useState, useMemo, useEffect, useCallback } from "react";
import type { InspectionLog, FaultReport } from "../types";
import { getLogs, getFaultReports, sameInspectionWeek, updateLog, deleteLog, updateFaultReport, deleteFaultReport } from "../storage";
import { EditLogModal, EditFaultModal } from "./EditModals";
import { SignOffModal, RepairModal } from "./WorkflowModals";
import NewFaultModal from "./NewFaultModal";
import { showPdf } from "../pdfViewer";
import { RACL_LOGO } from "../raclLogo";
import { exportInspectionPDF, exportFaultReportPDF, exportWeeklyPDF } from "../pdfExport";

async function migrateLocalStorage(): Promise<{ logs: number; faults: number }> {
  let migratedLogs = 0, migratedFaults = 0;
  try {
    const rawLogs = localStorage.getItem("hdk_inspection_logs");
    if (rawLogs) {
      const logs: InspectionLog[] = JSON.parse(rawLogs);
      for (const log of logs) {
        const res = await fetch("/api/logs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(log) });
        if (res.ok) migratedLogs++;
      }
    }
  } catch { /* ignore */ }
  try {
    const rawFaults = localStorage.getItem("hdk_fault_reports");
    if (rawFaults) {
      const faults: FaultReport[] = JSON.parse(rawFaults);
      for (const fault of faults) {
        const res = await fetch("/api/fault-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fault) });
        if (res.ok) migratedFaults++;
      }
    }
  } catch { /* ignore */ }
  return { logs: migratedLogs, faults: migratedFaults };
}

interface Props {
  showFaults: boolean;
  isAdmin: boolean;
  onAuthLost: () => void;
}

function FaultModal({ report, onClose }: { report: FaultReport; onClose: () => void }) {
  const priorityKey = report.priority === "Immediate Grounding" ? "Grounding" : report.priority;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <img src={RACL_LOGO} alt="RACL" className="modal-logo" />
          <span className="modal-title">{report.reportNumber} — Fault Report</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="modal-section">
            <h4>Report Details</h4>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <tbody>
                {[
                  ["Report No.", report.reportNumber],
                  ["Date / Time", `${report.date} · ${report.time}`],
                  ["Vehicle", report.vehicle],
                  ["Operator", report.operatorName],
                  ["Status", report.status],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ padding: "4px 8px 4px 0", color: "var(--muted)", width: 100 }}>{k}</td>
                    <td style={{ padding: "4px 0", fontWeight: 600 }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 8 }}>
              <span className={`priority-label priority-${priorityKey}`}>
                {report.priority}
              </span>
            </div>
          </div>

          <div className="modal-section">
            <h4>Fault Details ({report.faults.length} items)</h4>
            {report.faults.map((f, i) => (
              <div className="fault-row" key={f.itemId}>
                <div className="fault-row-header">
                  <span className="fault-item-name">{i + 1}. {f.label}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span
                      className="badge"
                      style={{
                        background: f.status === "U/S" ? "#fee2e2" : "#fef3c7",
                        color: f.status === "U/S" ? "#991b1b" : "#92400e",
                      }}
                    >
                      {f.status}
                    </span>
                    <span className="badge" style={{ background: "#f3f4f6", color: "#374151" }}>
                      {f.severity}
                    </span>
                  </div>
                </div>
                <p className="fault-item-meta" style={{ marginBottom: 4 }}>
                  Section: {f.section.split("—").pop()?.trim() || f.section}
                </p>
                {f.remarks && (
                  <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
                    Operator note: {f.remarks}
                  </p>
                )}
                <p style={{ fontSize: 12, color: "var(--text)" }}>
                  <strong>Action:</strong> {f.recommendedAction}
                </p>
              </div>
            ))}
          </div>

          <div className="modal-section">
            <h4>Fault Summary</h4>
            <div className="assessment-box">{report.faultSummary}</div>
          </div>

          {(report.repair || report.acceptance) && (
            <div className="modal-section">
              <h4>Repair Progress</h4>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <tbody>
                  {([
                    ["Desired start", [report.repair?.desiredStartDate, report.repair?.desiredStartTime].filter(Boolean).join(" ")],
                    ["Required end", [report.repair?.requiredEndDate, report.repair?.requiredEndTime].filter(Boolean).join(" ")],
                    ["Repaired by", report.repair?.repairedBy],
                    ["Repair works", report.repair?.details],
                    ["Remarks", report.repair?.remarks],
                    ["Acceptance test", [report.acceptance?.date, report.acceptance?.time].filter(Boolean).join(" ")],
                    ["Comments", report.acceptance?.comments],
                    ["Maintenance (HDK)", report.acceptance?.maintenanceName],
                    ["ARFF", report.acceptance?.arffName],
                  ] as [string, string | undefined][]).filter(([, v]) => v).map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ padding: "4px 8px 4px 0", color: "var(--muted)", width: 120, verticalAlign: "top" }}>{k}</td>
                      <td style={{ padding: "4px 0" }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="modal-section">
            <h4>Operational Assessment</h4>
            <div
              className="assessment-box"
              style={{
                color:
                  report.priority === "Immediate Grounding"
                    ? "#991b1b"
                    : report.priority === "Urgent"
                    ? "#92400e"
                    : "#15803d",
                fontWeight: 600,
              }}
            >
              {report.aiAssessment}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button className="btn-export secondary" onClick={onClose} style={{ border: "1.5px solid var(--border)", background: "white", color: "var(--text)" }}>
              Close
            </button>
            <button className="btn-export" onClick={() => showPdf(exportFaultReportPDF(report))}>
              View PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LogModal({ log, onClose }: { log: InspectionLog; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <img src={RACL_LOGO} alt="RACL" className="modal-logo" />
          <span className="modal-title">Inspection — {log.date} · {log.operatorName}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="modal-section">
            <h4>Overview</h4>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <tbody>
                {[
                  ["Date / Time", `${log.date} · ${log.time}`],
                  ["Operator", log.operatorName],
                  ...(log.fleetNumber ? [["Fleet No.", log.fleetNumber]] : []),
                  ...(log.duration ? [["Duration", `${Math.floor(log.duration / 60)}m ${log.duration % 60}s`]] : []),
                  ["Overall Condition", log.overallCondition],
                  ["Faults Found", String(log.faultCount)],
                  ["Comments", log.comments || "None"],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ padding: "4px 8px 4px 0", color: "var(--muted)", width: 120, verticalAlign: "top" }}>{k}</td>
                    <td style={{ padding: "4px 0", fontWeight: 600 }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {log.sections.map((sec) => (
            <div className="modal-section" key={sec.id}>
              <h4>{sec.title}</h4>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <tbody>
                  {sec.items.map((item, idx) => (
                    <tr key={item.id} style={{ borderBottom: "1px solid var(--section-bg)", verticalAlign: "top" }}>
                      <td style={{ padding: "4px 6px", color: "var(--muted)", width: 24 }}>{idx + 1}</td>
                      <td style={{ padding: "4px 6px" }}>
                        {item.label}
                        {item.remarks && <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{item.remarks}</p>}
                        {item.evidence?.length > 0 && (
                          <div className="cl-ev-thumbs" style={{ marginTop: 4 }}>
                            {item.evidence.map((ev) => (
                              <img key={ev.id} src={ev.dataUrl} alt={ev.name} className="cl-ev-thumb-sm" title={ev.name} />
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "4px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <span className="badge" style={{
                          background: item.status === "OK" ? "#dcfce7" : item.status === "NOK" ? "#fef3c7" : item.status === "U/S" ? "#fee2e2" : "#f3f4f6",
                          color: item.status === "OK" ? "#15803d" : item.status === "NOK" ? "#92400e" : item.status === "U/S" ? "#991b1b" : "#6b7280",
                        }}>
                          {item.status || "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {log.operatorSignature && (
            <div className="modal-section">
              <h4>Operator Signature</h4>
              <img src={log.operatorSignature} alt="signature" style={{ maxWidth: 200, border: "1px solid var(--border)", borderRadius: 6 }} />
              <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{log.operatorName}</p>
            </div>
          )}

          <div className="modal-section">
            <h4>Shift In-Charge Sign-off</h4>
            {log.shiftSignoff ? (
              <>
                <img src={log.shiftSignoff.signature} alt="signature" className="signed-img" />
                <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                  {log.shiftSignoff.name} · {new Date(log.shiftSignoff.signedAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                </p>
              </>
            ) : <p style={{ fontSize: 12, color: "var(--muted)" }}>Not signed off yet.</p>}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button className="btn-export secondary" onClick={onClose} style={{ border: "1.5px solid var(--border)", background: "white", color: "var(--text)" }}>
              Close
            </button>
            <button className="btn-export" onClick={() => showPdf(exportInspectionPDF(log))}>
              View PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function exportWeekFor(log: InspectionLog, allLogs: InspectionLog[]) {
  showPdf(exportWeeklyPDF(allLogs.filter((l) => sameInspectionWeek(l.date, log.date))));
}

function localIds(key: string): string[] {
  try { return (JSON.parse(localStorage.getItem(key) || "[]") as { id: string }[]).map((r) => r.id); } catch { return []; }
}

export default function LogsPage({ showFaults, isAdmin, onAuthLost }: Props) {
  const [logs, setLogs] = useState<InspectionLog[]>([]);
  const [faults, setFaults] = useState<FaultReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState("");
  const [filterOperator, setFilterOperator] = useState("");
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState<string | null>(null);


  const reload = useCallback(() => {
    Promise.all([getLogs(), getFaultReports()])
      .then(([l, f]) => { setLogs(l); setFaults(f); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleMigrate = async () => {
    setMigrating(true);
    const result = await migrateLocalStorage();
    setMigrateResult(`Migrated ${result.logs} log${result.logs !== 1 ? "s" : ""} and ${result.faults} fault report${result.faults !== 1 ? "s" : ""} to the database.`);
    setMigrating(false);
    setLoading(true);
    reload();
  };
  const [viewLog, setViewLog] = useState<InspectionLog | null>(null);
  const [viewFault, setViewFault] = useState<FaultReport | null>(null);
  const [editLog, setEditLog] = useState<InspectionLog | null>(null);
  const [editFault, setEditFault] = useState<FaultReport | null>(null);
  const [signOff, setSignOff] = useState<InspectionLog | null>(null);
  const [repairFault, setRepairFault] = useState<FaultReport | null>(null);
  const [newFault, setNewFault] = useState(false);

  // Every save is mirrored locally, so only offer a sync when this device holds records the DB lacks
  const hasLocalData = useMemo(() => {
    const dbIds = new Set([...logs, ...faults].map((r) => r.id));
    return [...localIds("hdk_inspection_logs"), ...localIds("hdk_fault_reports")].some((id) => !dbIds.has(id));
  }, [logs, faults]);

  async function adminAction(action: () => Promise<void>) {
    try {
      await action();
      reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Request failed.";
      if (/signed in|expired/i.test(msg)) onAuthLost();
      throw e;
    }
  }

  function confirmDelete(what: string, action: () => Promise<void>) {
    if (!window.confirm(`Delete ${what}? This cannot be undone.`)) return;
    adminAction(action).catch((e) => window.alert(e instanceof Error ? e.message : "Delete failed."));
  }

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (filterDate && !l.date.includes(filterDate)) return false;
      if (filterOperator && !l.operatorName.toLowerCase().includes(filterOperator.toLowerCase())) return false;
      return true;
    });
  }, [logs, filterDate, filterOperator]);

  const filteredFaults = useMemo(() => {
    return faults.filter((f) => {
      if (filterDate && !f.date.includes(filterDate)) return false;
      if (filterOperator && !f.operatorName.toLowerCase().includes(filterOperator.toLowerCase())) return false;
      return true;
    });
  }, [faults, filterDate, filterOperator]);

  if (loading) return (
    <div className="container" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
      Loading records…
    </div>
  );

  return (
    <div className="container">
      {migrateResult && (
        <div className="migrate-banner" style={{ background: "#dcfce7", borderColor: "#86efac", color: "#15803d" }}>
          <span>{migrateResult}</span>
          <button onClick={() => setMigrateResult(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#15803d" }}>×</button>
        </div>
      )}
      {!migrateResult && hasLocalData && (
        <div className="migrate-banner">
          <span>Local records found. Sync them to the database?</span>
          <button className="btn-export" style={{ padding: "6px 14px", fontSize: 12 }} onClick={handleMigrate} disabled={migrating}>
            {migrating ? "Syncing…" : "Sync to DB"}
          </button>
        </div>
      )}
      <div className="logs-filters">
        <input
          className="filter-input"
          type="text"
          placeholder="Date DD/MM/YYYY"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
        />
        <input
          className="filter-input"
          type="text"
          placeholder="Operator"
          value={filterOperator}
          onChange={(e) => setFilterOperator(e.target.value)}
        />
      </div>

      {!showFaults ? (
        <>
          <div className="log-table-wrap">
            <table className="log-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Operator</th>
                  <th>Condition</th>
                  <th>Faults</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr><td colSpan={6} className="empty-state">No inspection logs yet.</td></tr>
                ) : filteredLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="ga-a" data-label="Date">{log.date}</td>
                    <td className="ga-b" data-label="Time">{log.time}</td>
                    <td className="ga-line" data-label="Operator">{log.operatorName}</td>
                    <td className="ga-c" data-label="Condition">
                      <span className={`badge badge-${log.overallCondition === "Excellent" || log.overallCondition === "Good" ? "ok" : "critical"}`}>
                        {log.overallCondition}
                      </span>
                    </td>
                    <td className="ga-d" data-label="Faults">
                      {log.faultCount > 0 ? (
                        <span className={`badge ${log.faultCount >= 3 ? "badge-critical" : "badge-fault"}`}>
                          {log.faultCount} fault{log.faultCount > 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="badge badge-ok">None</span>
                      )}
                    </td>
                    <td className="log-actions">
                      <button className="action-btn" onClick={() => setViewLog(log)}>View</button>
                      <button className="action-btn" onClick={() => showPdf(exportInspectionPDF(log))}>PDF</button>
                      <button className="action-btn" onClick={() => exportWeekFor(log, logs)}>Week</button>
                      {!log.shiftSignoff && <button className="action-btn accent" onClick={() => setSignOff(log)}>Sign off</button>}
                      {isAdmin && <>
                        <button className="action-btn" onClick={() => setEditLog(log)}>Edit</button>
                        <button className="action-btn danger" onClick={() => confirmDelete(`the log from ${log.date}`, () => deleteLog(log.id))}>Delete</button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ textAlign: "right", fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
            {filteredLogs.length} record{filteredLogs.length !== 1 ? "s" : ""}
          </p>
        </>
      ) : (
        <>
          <button className="btn-report-fault" onClick={() => setNewFault(true)}>+ Report a fault</button>
          <div className="log-table-wrap">
            <table className="log-table">
              <thead>
                <tr>
                  <th>Report No.</th>
                  <th>Date</th>
                  <th>Operator</th>
                  <th>Faults</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFaults.length === 0 ? (
                  <tr><td colSpan={7} className="empty-state">No fault reports yet.</td></tr>
                ) : filteredFaults.map((fr) => {
                  const priorityKey = fr.priority === "Immediate Grounding" ? "Grounding" : fr.priority;
                  return (
                    <tr key={fr.id}>
                      <td className="ga-a" data-label="Report No." style={{ fontWeight: 600 }}>{fr.reportNumber}</td>
                      <td className="ga-b" data-label="Date">{fr.date}</td>
                      <td className="ga-line" data-label="Operator">{fr.operatorName}</td>
                      <td className="ga-meta" data-label="Faults">{fr.faults.length} fault{fr.faults.length !== 1 ? "s" : ""}</td>
                      <td className="ga-c" data-label="Priority">
                        <span className={`priority-label priority-${priorityKey}`} style={{ padding: "2px 8px", fontSize: 11 }}>
                          {fr.priority}
                        </span>
                      </td>
                      <td className="ga-d" data-label="Status">
                        <span className={`badge badge-${fr.status === "Resolved" ? "resolved" : fr.status === "Open" ? "open" : "fault"}`}>
                          {fr.status}
                        </span>
                      </td>
                      <td className="log-actions">
                        <button className="action-btn" onClick={() => setViewFault(fr)}>View</button>
                        <button className="action-btn" onClick={() => showPdf(exportFaultReportPDF(fr))}>PDF</button>
                        {fr.status !== "Resolved" && <button className="action-btn accent" onClick={() => setRepairFault(fr)}>Repair</button>}
                        {isAdmin && <>
                          <button className="action-btn" onClick={() => setEditFault(fr)}>Edit</button>
                          <button className="action-btn danger" onClick={() => confirmDelete(fr.reportNumber, () => deleteFaultReport(fr.id))}>Delete</button>
                        </>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ textAlign: "right", fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
            {filteredFaults.length} report{filteredFaults.length !== 1 ? "s" : ""}
          </p>
        </>
      )}

      {viewLog && <LogModal log={viewLog} onClose={() => setViewLog(null)} />}
      {viewFault && <FaultModal report={viewFault} onClose={() => setViewFault(null)} />}
      {signOff && <SignOffModal log={signOff} onClose={() => setSignOff(null)} onDone={() => { setSignOff(null); reload(); }} />}
      {newFault && <NewFaultModal onClose={() => setNewFault(false)} onDone={(r) => { setNewFault(false); reload(); showPdf(exportFaultReportPDF(r)); }} />}
      {repairFault && <RepairModal report={repairFault} onClose={() => setRepairFault(null)} onDone={() => { setRepairFault(null); reload(); }} />}
      {editLog && <EditLogModal item={editLog} onClose={() => setEditLog(null)} onSave={(l) => adminAction(() => updateLog(l)).then(() => setEditLog(null))} />}
      {editFault && <EditFaultModal item={editFault} onClose={() => setEditFault(null)} onSave={(r) => adminAction(() => updateFaultReport(r)).then(() => setEditFault(null))} />}
    </div>
  );
}
