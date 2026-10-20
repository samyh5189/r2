import { useState, useMemo, useEffect, useCallback } from "react";
import type { InspectionLog, FaultReport } from "../types";
import { getLogs, getFaultReports } from "../storage";
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
}

function FaultModal({ report, onClose }: { report: FaultReport; onClose: () => void }) {
  const priorityKey = report.priority === "Immediate Grounding" ? "Grounding" : report.priority;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
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
            <button className="btn-export" onClick={() => exportFaultReportPDF(report)}>
              ↓ Export PDF
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

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button className="btn-export secondary" onClick={onClose} style={{ border: "1.5px solid var(--border)", background: "white", color: "var(--text)" }}>
              Close
            </button>
            <button className="btn-export" onClick={() => exportInspectionPDF(log)}>
              ↓ Export PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function exportWeekFor(log: InspectionLog, allLogs: InspectionLog[]) {
  const [d, m, y] = log.date.split("/").map(Number);
  const date = new Date(y, m - 1, d);
  const dow = date.getDay();
  const daysFromSat = dow === 6 ? 0 : dow + 1;
  const weekStart = new Date(date);
  weekStart.setDate(date.getDate() - daysFromSat);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const weekLogs = allLogs.filter(l => {
    const [ld, lm, ly] = l.date.split("/").map(Number);
    const ld2 = new Date(ly, lm - 1, ld);
    return ld2 >= weekStart && ld2 <= weekEnd;
  });
  exportWeeklyPDF(weekLogs);
}

export default function LogsPage({ showFaults }: Props) {
  const [logs, setLogs] = useState<InspectionLog[]>([]);
  const [faults, setFaults] = useState<FaultReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState("");
  const [filterOperator, setFilterOperator] = useState("");
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState<string | null>(null);

  const hasLocalData = !!(localStorage.getItem("hdk_inspection_logs") || localStorage.getItem("hdk_fault_reports"));

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
          placeholder="Filter by date (DD/MM/YYYY)"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
        />
        <input
          className="filter-input"
          type="text"
          placeholder="Filter by operator name"
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
                    <td>{log.date}</td>
                    <td>{log.time}</td>
                    <td>{log.operatorName}</td>
                    <td>
                      <span className={`badge badge-${log.overallCondition === "Excellent" || log.overallCondition === "Good" ? "ok" : "critical"}`}>
                        {log.overallCondition}
                      </span>
                    </td>
                    <td>
                      {log.faultCount > 0 ? (
                        <span className={`badge ${log.faultCount >= 3 ? "badge-critical" : "badge-fault"}`}>
                          {log.faultCount} fault{log.faultCount > 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="badge badge-ok">None</span>
                      )}
                    </td>
                    <td>
                      <button className="action-btn" onClick={() => setViewLog(log)}>View</button>
                      <button className="action-btn" onClick={() => exportInspectionPDF(log)}>PDF</button>
                      <button className="action-btn" onClick={() => exportWeekFor(log, logs)}>Week</button>
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
                      <td style={{ fontWeight: 600 }}>{fr.reportNumber}</td>
                      <td>{fr.date}</td>
                      <td>{fr.operatorName}</td>
                      <td>{fr.faults.length}</td>
                      <td>
                        <span className={`priority-label priority-${priorityKey}`} style={{ padding: "2px 8px", fontSize: 11 }}>
                          {fr.priority}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge-${fr.status === "Resolved" ? "resolved" : fr.status === "Open" ? "open" : "fault"}`}>
                          {fr.status}
                        </span>
                      </td>
                      <td>
                        <button className="action-btn" onClick={() => setViewFault(fr)}>View</button>
                        <button className="action-btn" onClick={() => exportFaultReportPDF(fr)}>PDF</button>
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
    </div>
  );
}
