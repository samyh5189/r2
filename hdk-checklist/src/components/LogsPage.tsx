import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import type { CheckKind, InspectionLog, FaultBrief, FaultReport } from "../types";
import { emailFaultReport, describeEmail, uploadImages, listLogs, listAllLogs, listFaults, getFaultBriefs, getOverview, countUnsynced, updateLog, deleteLog, updateFaultReport, deleteFaultReport, type FaultQuery } from "../storage";
import { EditLogModal, EditFaultModal } from "./EditModals";
import { SignOffModal, RepairModal } from "./WorkflowModals";
import NewFaultModal from "./NewFaultModal";
import { faultAge, summarizeAges, TARGET_DAYS } from "../faultAge";
import { CHECK_KINDS, GROUP_NOUN, KIND_LABEL, logGroup, logKind, periodKey } from "../checkKinds";
import { logTime } from "../trends";
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
        // Upload images first so the request stays small; an unsent log carries its operator's PIN
        const res = await fetch("/api/logs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(await uploadImages(log)) });
        if (res.ok) migratedLogs++;
      }
    }
  } catch { /* ignore */ }
  try {
    const rawFaults = localStorage.getItem("hdk_fault_reports");
    if (rawFaults) {
      const faults: FaultReport[] = JSON.parse(rawFaults);
      for (const fault of faults) {
        const res = await fetch("/api/fault-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(await uploadImages(fault)) });
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

interface TimelineStep { at: number | null; title: string; detail?: string; pending?: boolean; late?: boolean }

const fmtWhen = (t: number) => new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const parseGB = (date?: string, time?: string) => {
  if (!date || !/^\d{2}\/\d{2}\/\d{4}$/.test(date)) return null;
  const [d, m, y] = date.split("/").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0).getTime();
};

/** Reported → signed off → repair started → accepted → resolved, with what's still to come */
function faultTimeline(r: FaultReport): TimelineStep[] {
  const steps: TimelineStep[] = [];
  const opened = Date.parse(r.createdAt) || parseGB(r.date, r.time);
  steps.push({ at: opened, title: "Reported", detail: `${r.operatorName}${r.inspectionLogId ? " · from an inspection" : ""}` });
  if (r.emailedAt) steps.push({ at: Date.parse(r.emailedAt), title: "Emailed", detail: r.emailedTo ? `${r.emailedTo} recipient${r.emailedTo === 1 ? "" : "s"}` : undefined });
  if (r.shiftSignoff) steps.push({ at: Date.parse(r.shiftSignoff.signedAt), title: "Signed off by shift in-charge", detail: r.shiftSignoff.name });
  if (r.repairStartedAt) steps.push({ at: Date.parse(r.repairStartedAt), title: "Repair started", detail: [r.repairStartedBy && `recorded by ${r.repairStartedBy}`, r.repair?.repairedBy && `repaired by ${r.repair.repairedBy}`].filter(Boolean).join(" · ") || undefined });
  else if (r.repair?.desiredStartDate) steps.push({ at: parseGB(r.repair.desiredStartDate, r.repair.desiredStartTime), title: "Repair planned to start", detail: r.repair.repairedBy });
  if (r.repairUpdatedAt && r.repairUpdatedAt !== r.repairStartedAt && r.status !== "Resolved") steps.push({ at: Date.parse(r.repairUpdatedAt), title: "Repair updated", detail: r.repairUpdatedBy });
  if (r.acceptance?.date) steps.push({ at: parseGB(r.acceptance.date, r.acceptance.time), title: "Acceptance test", detail: [r.acceptance.maintenanceName, r.acceptance.arffName].filter(Boolean).join(" & ") || undefined });
  if (r.status === "Resolved") {
    const age = faultAge(r);
    steps.push({ at: r.resolvedAt ? Date.parse(r.resolvedAt) : null, title: "Resolved", detail: age.label });
  } else {
    const age = faultAge(r);
    const due = opened ? opened + TARGET_DAYS[r.priority] * 86_400_000 : null;
    if (!r.shiftSignoff && r.inspectionLogId) steps.push({ at: null, title: "Awaiting shift in-charge sign-off", pending: true });
    steps.push({
      at: due,
      title: r.repairStartedAt || r.repair?.details ? "Awaiting acceptance test" : "Awaiting repair",
      detail: due ? `${age.overdue ? "Overdue — target was" : "Target:"} ${TARGET_DAYS[r.priority]} day${TARGET_DAYS[r.priority] === 1 ? "" : "s"} (${r.priority.toLowerCase()})` : undefined,
      pending: true,
      late: age.overdue,
    });
  }
  return steps;
}

function FaultTimeline({ report }: { report: FaultReport }) {
  return (
    <ol className="timeline">
      {faultTimeline(report).map((st, i) => (
        <li key={i} className={`timeline-step${st.pending ? " pending" : ""}${st.late ? " late" : ""}`}>
          <span className="timeline-dot" />
          <div>
            <div className="timeline-title">{st.title}</div>
            <div className="timeline-meta">
              {st.at != null && !Number.isNaN(st.at) && <span>{st.pending ? `due ${fmtWhen(st.at)}` : fmtWhen(st.at)}</span>}
              {st.detail && <span>{st.detail}</span>}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
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
            <h4>Timeline</h4>
            <FaultTimeline report={report} />
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
          <span className="modal-title">{KIND_LABEL[logKind(log)]} inspection — {log.date} · {log.operatorName}</span>
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
                  ...(log.markedAllOk ? [["Marked OK in one go", `${log.markedAllOk} items`]] : []),
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

// The week sheet covers the daily inspections only, fetched for that week (Sat–Fri)
function exportWeekFor(dateGB: string) {
  const start = periodKey("weekly", dateGB);
  const [d, m, y] = start.split("/").map(Number);
  const end = new Date(y, m - 1, d + 6).toLocaleDateString("en-GB");
  showPdf(listAllLogs({ kind: "daily", from: start, to: end }).then(exportWeeklyPDF));
}

const PAGE = 50;
const FAULT_STATUS: Record<"active" | "overdue" | "resolved" | "all", FaultQuery["status"]> = { active: "open", overdue: "open", resolved: "resolved", all: undefined };

/** The value, once it has stopped changing for a moment (typed filters) */
function useSettled<T>(value: T, ms = 350): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => { const t = setTimeout(() => setSettled(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return settled;
}

export default function LogsPage({ showFaults, isAdmin, onAuthLost }: Props) {
  // Loaded so far (newest first); `next` fetches the page after
  const [logs, setLogs] = useState<InspectionLog[]>([]);
  const [faults, setFaults] = useState<FaultReport[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [counts, setCounts] = useState<Record<CheckKind, number> | null>(null);
  const [briefs, setBriefs] = useState<FaultBrief[]>([]);
  const [unsynced, setUnsynced] = useState(0);
  const [filterDate, setFilterDate] = useState("");
  const [filterOperator, setFilterOperator] = useState("");
  const date = useSettled(filterDate.trim());
  const operator = useSettled(filterOperator.trim());
  const [kindTab, setKindTab] = useState<CheckKind>("daily");
  // Groups the user opened or closed; others follow the default (newest open)
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [faultView, setFaultView] = useState<"active" | "overdue" | "resolved" | "all">("active");
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState<string | null>(null);
  const request = useRef(0);

  const query = useCallback((before: string | null, limit = PAGE) => {
    const common = { date, operator, before, limit };
    return showFaults ? listFaults({ ...common, status: FAULT_STATUS[faultView] }) : listLogs({ ...common, kind: kindTab });
  }, [showFaults, date, operator, faultView, kindTab]);

  /** Reloads the first page; `keep` reloads as many as are showing, e.g. after an edit */
  const reload = useCallback((keep = 0) => {
    const id = ++request.current;
    return Promise.all([
      query(null, Math.min(200, Math.max(PAGE, keep))),
      showFaults ? getFaultBriefs() : getOverview(true),
    ]).then(([page, extra]) => {
      if (id !== request.current) return;
      if (showFaults) { setFaults(page.items as FaultReport[]); setBriefs(extra as FaultBrief[]); }
      else { setLogs(page.items as InspectionLog[]); setCounts((extra as Awaited<ReturnType<typeof getOverview>>).counts); }
      setNext(page.next);
      setLoading(false);
    });
  }, [query, showFaults]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { countUnsynced().then(setUnsynced); }, []);

  async function loadMore() {
    if (!next) return;
    const id = request.current;
    setLoadingMore(true);
    const page = await query(next);
    if (id === request.current) {
      if (showFaults) setFaults((f) => [...f, ...(page.items as FaultReport[])]);
      else setLogs((l) => [...l, ...(page.items as InspectionLog[])]);
      setNext(page.next);
    }
    setLoadingMore(false);
  }

  const handleMigrate = async () => {
    setMigrating(true);
    const result = await migrateLocalStorage();
    setMigrateResult(`Migrated ${result.logs} log${result.logs !== 1 ? "s" : ""} and ${result.faults} fault report${result.faults !== 1 ? "s" : ""} to the database.`);
    setMigrating(false);
    setUnsynced(await countUnsynced());
    reload();
  };
  const [viewLog, setViewLog] = useState<InspectionLog | null>(null);
  const [viewFault, setViewFault] = useState<FaultReport | null>(null);
  const [editLog, setEditLog] = useState<InspectionLog | null>(null);
  const [editFault, setEditFault] = useState<FaultReport | null>(null);
  const [signOff, setSignOff] = useState<InspectionLog | null>(null);
  const [repairFault, setRepairFault] = useState<FaultReport | null>(null);
  const [newFault, setNewFault] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function adminAction(action: () => Promise<void>) {
    try {
      await action();
      reload(showFaults ? faults.length : logs.length);
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

  // The server filters; this just keeps the loaded page tidy while a new one is on its way
  const filteredLogs = useMemo(() => logs.filter((l) => logKind(l) === kindTab).sort((a, b) => logTime(b) - logTime(a)), [logs, kindTab]);

  // Newest group first; yearly checks form a single ungrouped list
  const logGroups = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; logs: InspectionLog[] }>();
    for (const l of filteredLogs) {
      const g = logGroup(kindTab, l.date) ?? { key: "all", label: "" };
      if (!groups.has(g.key)) groups.set(g.key, { ...g, logs: [] });
      groups.get(g.key)!.logs.push(l);
    }
    return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key));
  }, [filteredLogs, kindTab]);
  const filtering = !!(date || operator);

  const filteredFaults = useMemo(() => faults.filter((f) => {
    const age = faultAge(f);
    if (faultView === "active" || faultView === "overdue") return !age.closed && (faultView === "active" || age.overdue);
    if (faultView === "resolved") return age.closed;
    return true;
  }), [faults, faultView]);

  const loadMoreButton = next && (
    <button className="load-more" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load older"}</button>
  );

  if (loading) return (
    <div className="container" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
      Loading records…
    </div>
  );

  return (
    <div className="container">
      {notice && (
        <div className="migrate-banner">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
      )}
      {migrateResult && (
        <div className="migrate-banner" style={{ background: "#dcfce7", borderColor: "#86efac", color: "#15803d" }}>
          <span>{migrateResult}</span>
          <button onClick={() => setMigrateResult(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#15803d" }}>×</button>
        </div>
      )}
      {!migrateResult && unsynced > 0 && (
        <div className="migrate-banner">
          <span>{unsynced} record{unsynced === 1 ? "" : "s"} on this device {unsynced === 1 ? "isn't" : "aren't"} in the database yet. Sync now?</span>
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
          <div className="kind-tabs" style={{ padding: 0, margin: "0 0 12px" }}>
            {CHECK_KINDS.map((k) => (
              <button key={k} className={`kind-tab${k === kindTab ? " active" : ""}`} onClick={() => setKindTab(k)}>
                {KIND_LABEL[k]}{counts && <span className="kind-count">{counts[k]}</span>}
              </button>
            ))}
          </div>
          {logGroups.length === 0 && (
            <p className="empty-state log-empty">
              {filtering ? "No inspections match." : `No ${KIND_LABEL[kindTab].toLowerCase()} inspections yet.`}
            </p>
          )}
          {logGroups.map((g, gi) => {
            const open = g.key === "all" || filtering || (toggled[g.key] ?? gi === 0);
            const withFaults = g.logs.filter((l) => l.faultCount > 0).length;
            return (
              <div key={g.key} className="log-group">
                {g.key !== "all" && (
                  <div className="log-group-head">
                    <button className="log-group-toggle" onClick={() => setToggled((t) => ({ ...t, [g.key]: !open }))} aria-expanded={open}>
                      <span className="log-group-caret">{open ? "▾" : "▸"}</span>
                      <span className="log-group-title">
                        <span className="log-group-noun">{GROUP_NOUN[kindTab]}</span> {g.label}
                      </span>
                      <span className="log-group-meta">
                        {g.logs.length} inspection{g.logs.length !== 1 ? "s" : ""}
                        {withFaults > 0 && <span className="log-group-faults"> · {withFaults} with faults</span>}
                      </span>
                    </button>
                    {kindTab === "daily" && (
                      <button className="action-btn" onClick={() => exportWeekFor(g.logs[0].date)}>Week PDF</button>
                    )}
                  </div>
                )}
                {open && (
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
                        {g.logs.map((log) => (
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
                )}
              </div>
            );
          })}
          {loadMoreButton}
          <p style={{ textAlign: "right", fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
            {filtering || !counts ? `${filteredLogs.length} shown` : `${filteredLogs.length} of ${counts[kindTab]} shown`}
          </p>
        </>
      ) : (
        <>
          <button className="btn-report-fault" onClick={() => setNewFault(true)}>+ Report a fault</button>
          {(() => {
            const sum = summarizeAges(briefs);
            return (
              <>
                <div className="age-summary">
                  <div><strong>{sum.active}</strong>active</div>
                  <div className={sum.overdue ? "bad" : ""}><strong>{sum.overdue}</strong>overdue</div>
                  <div><strong>{sum.avgDaysToClose == null ? "—" : sum.avgDaysToClose.toFixed(1)}</strong>avg days to fix</div>
                </div>
                <div className="age-filters">
                  {(["active", "overdue", "resolved", "all"] as const).map((v) => (
                    <button key={v} className={`trend-window${faultView === v ? " active" : ""}`} onClick={() => setFaultView(v)}>
                      {v[0].toUpperCase() + v.slice(1)}
                    </button>
                  ))}
                </div>
                <p className="editor-hint" style={{ margin: "0 0 8px" }}>
                  Overdue: open longer than {TARGET_DAYS["Immediate Grounding"]} day (grounding), {TARGET_DAYS.Urgent} days (urgent) or {TARGET_DAYS.Routine} days (routine).
                </p>
              </>
            );
          })()}
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
                  <th>Age</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFaults.length === 0 ? (
                  <tr><td colSpan={8} className="empty-state">{briefs.length ? "No reports match." : "No fault reports yet."}</td></tr>
                ) : filteredFaults.map((fr) => {
                  const priorityKey = fr.priority === "Immediate Grounding" ? "Grounding" : fr.priority;
                  const age = faultAge(fr);
                  return (
                    <tr key={fr.id}>
                      <td className="ga-a" data-label="Report No." style={{ fontWeight: 600 }}>{fr.reportNumber}</td>
                      <td className="ga-b" data-label="Date">{fr.date}</td>
                      <td className="ga-line" data-label="Operator">{fr.operatorName}</td>
                      <td className="ga-meta" data-label="Faults">{fr.faults.length} fault{fr.faults.length !== 1 ? "s" : ""}</td>
                      <td className="ga-c" data-label="Priority">
                        <span className={`priority-label priority-${priorityKey}`} style={{ padding: "2px 8px", fontSize: 11 }}>
                          {fr.priority === "Immediate Grounding" ? "Grounding" : fr.priority}
                        </span>
                      </td>
                      <td className="ga-d" data-label="Status">
                        <span className={`badge badge-${fr.status === "Resolved" ? "resolved" : fr.status === "Open" ? "open" : "fault"}`}>
                          {fr.status}
                        </span>
                      </td>
                      <td className="ga-age" data-label="Age">
                        <span className={`age-badge${age.overdue ? " overdue" : age.closed ? " closed" : ""}`}>{age.overdue ? "⚠ " : ""}{age.label}</span>
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
          {loadMoreButton}
          <p style={{ textAlign: "right", fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
            {filteredFaults.length} shown
          </p>
        </>
      )}

      {viewLog && <LogModal log={viewLog} onClose={() => setViewLog(null)} />}
      {viewFault && <FaultModal report={viewFault} onClose={() => setViewFault(null)} />}
      {signOff && <SignOffModal log={signOff} onClose={() => setSignOff(null)} onDone={() => { setSignOff(null); reload(logs.length); }} />}
      {newFault && <NewFaultModal onClose={() => setNewFault(false)} onDone={(r) => {
        setNewFault(false);
        reload();
        const pdf = exportFaultReportPDF(r);
        showPdf(pdf);
        setNotice("Emailing fault report…");
        pdf.then((file) => emailFaultReport(r, file)).then((res) => setNotice(describeEmail(res)));
      }} />}
      {repairFault && <RepairModal report={repairFault} onClose={() => setRepairFault(null)} onDone={() => { setRepairFault(null); reload(faults.length); }} />}
      {editLog && <EditLogModal item={editLog} onClose={() => setEditLog(null)} onSave={(l) => adminAction(() => updateLog(l)).then(() => setEditLog(null))} />}
      {editFault && <EditFaultModal item={editFault} onClose={() => setEditFault(null)} onSave={(r) => adminAction(() => updateFaultReport(r)).then(() => setEditFault(null))} />}
    </div>
  );
}
