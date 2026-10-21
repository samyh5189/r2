import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import type { CheckKind, InspectionLog, FaultBrief, FaultReport, Operator } from "../types";
import { ChevronRight, FileText } from "lucide-react";
import { emailFaultReport, describeEmail, uploadImages, listLogs, listAllLogs, listFaults, getFaultBriefs, getOverview, countUnsynced, getOperators, updateLog, deleteLog, updateFaultReport, deleteFaultReport, type FaultQuery } from "../storage";
import { EditLogModal, EditFaultModal } from "./EditModals";
import { SignOffModal, RepairModal } from "./WorkflowModals";
import NewFaultModal from "./NewFaultModal";
import { faultAge, summarizeAges, TARGET_DAYS } from "../faultAge";
import { CHECK_KINDS, GROUP_NOUN, KIND_LABEL, logGroup, logKind, periodKey } from "../checkKinds";
import { logTime } from "../trends";
import { availableMonths, monthTitle } from "../monthlySummary";
import { showPdf } from "../pdfViewer";
import { RACL_LOGO } from "../raclLogo";
import { exportInspectionPDF, exportFaultReportPDF, exportWeeklyPDF } from "../pdfExport";
import { confirmDialog, toast } from "../dialogs";

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

function FaultModal({ report, onClose, actions }: { report: FaultReport; onClose: () => void; actions?: React.ReactNode }) {
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

          <div className="sheet-actions">
            <button className="btn-export" onClick={() => showPdf(exportFaultReportPDF(report))}>View PDF</button>
            {actions}
          </div>
        </div>
      </div>
    </div>
  );
}

function LogModal({ log, onClose, actions }: { log: InspectionLog; onClose: () => void; actions?: React.ReactNode }) {
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

          <div className="sheet-actions">
            <button className="btn-export" onClick={() => showPdf(exportInspectionPDF(log))}>View PDF</button>
            {actions}
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
const FAULT_VIEW_LABEL = { active: "Active", overdue: "Overdue", resolved: "Closed", all: "All" } as const;
const PRIORITY_RANK: Record<FaultReport["priority"], number> = { "Immediate Grounding": 3, Urgent: 2, Routine: 1 };
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
  // Filters: month (YYYY-MM from the picker), operator, quick toggles, and text search for faults
  const [month, setMonth] = useState("");
  const [operator, setOperator] = useState("");
  const [faultsOnly, setFaultsOnly] = useState(false);
  const [unsignedOnly, setUnsignedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const q = useSettled(search.trim());
  const date = month; // MM/YYYY
  const [operators, setOperators] = useState<Operator[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  useEffect(() => {
    getOperators().then(setOperators);
    getOverview().then((o) => setMonths(availableMonths(o.months)));
  }, []);
  const [kindTab, setKindTab] = useState<CheckKind>("daily");
  // Groups the user opened or closed; others follow the default (newest open)
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [faultView, setFaultView] = useState<"active" | "overdue" | "resolved" | "all">("active");
  const [migrating, setMigrating] = useState(false);
  const request = useRef(0);

  const query = useCallback((before: string | null, limit = PAGE) => {
    const common = { date, operator, before, limit };
    return showFaults
      ? listFaults({ ...common, status: FAULT_STATUS[faultView], q })
      : listLogs({ ...common, kind: kindTab, faults: faultsOnly, unsigned: unsignedOnly });
  }, [showFaults, date, operator, faultView, kindTab, q, faultsOnly, unsignedOnly]);

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
    toast(`Synced ${result.logs} log${result.logs !== 1 ? "s" : ""} and ${result.faults} fault report${result.faults !== 1 ? "s" : ""} to the database.`);
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

  async function confirmDelete(what: string, action: () => Promise<void>) {
    if (!await confirmDialog({ title: `Delete ${what}?`, message: "This can't be undone.", confirmLabel: "Delete", danger: true })) return;
    adminAction(action).then(() => toast(`Deleted ${what}.`)).catch((e) => toast(e instanceof Error ? e.message : "Delete failed.", "error"));
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
  const filtering = !!(date || operator || faultsOnly || unsignedOnly || q);

  // Open faults: most serious first, then oldest. Closed ones: newest first, grouped by month.
  const filteredFaults = useMemo(() => {
    const list = faults.filter((f) => {
      const age = faultAge(f);
      if (faultView === "active" || faultView === "overdue") return !age.closed && (faultView === "active" || age.overdue);
      if (faultView === "resolved") return age.closed;
      return true;
    });
    if (faultView === "active" || faultView === "overdue") {
      list.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || faultAge(b).days - faultAge(a).days);
    }
    return list;
  }, [faults, faultView]);
  const faultGroups = useMemo(() => {
    if (faultView === "active" || faultView === "overdue") return [{ key: "all", label: "", items: filteredFaults }];
    const groups = new Map<string, { key: string; label: string; items: FaultReport[] }>();
    for (const f of filteredFaults) {
      const [, m, y] = f.date.split("/");
      const key = `${y}-${m}`;
      if (!groups.has(key)) groups.set(key, { key, label: new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" }), items: [] });
      groups.get(key)!.items.push(f);
    }
    return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key));
  }, [filteredFaults, faultView]);

  const viewCounts = useMemo(() => {
    const ages = briefs.map((b) => faultAge(b));
    return { active: ages.filter((a) => !a.closed).length, overdue: ages.filter((a) => a.overdue).length, resolved: ages.filter((a) => a.closed).length, all: briefs.length };
  }, [briefs]);

  const loadMoreButton = next && (
    <button className="load-more" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load older"}</button>
  );

  const isOpen = (key: string, index: number) => key === "all" || filtering || (toggled[key] ?? index === 0);
  const groupHead = (key: string, open: boolean, title: React.ReactNode, meta: React.ReactNode, extra?: React.ReactNode) => (
    <div className="rec-group-head">
      <button className="rec-group-toggle" onClick={() => setToggled((t) => ({ ...t, [key]: !open }))} aria-expanded={open}>
        <ChevronRight size={16} className={`rec-caret${open ? " open" : ""}`} />
        <span className="rec-group-title">{title}</span>
        <span className="rec-group-meta">{meta}</span>
      </button>
      {extra}
    </div>
  );

  const operatorFilter = operators.length > 0 ? (
    <select className="filter-input" value={operator} onChange={(e) => setOperator(e.target.value)} aria-label="Operator">
      <option value="">All operators</option>
      {operators.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
    </select>
  ) : (
    <input className="filter-input" placeholder="Operator" value={operator} onChange={(e) => setOperator(e.target.value)} />
  );

  if (loading) return (
    <div className="container" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
      Loading records…
    </div>
  );

  return (
    <div className="container records">
      {unsynced > 0 && (
        <div className="migrate-banner">
          <span>{unsynced} record{unsynced === 1 ? "" : "s"} on this device {unsynced === 1 ? "isn't" : "aren't"} in the database yet. Sync now?</span>
          <button className="btn-export" style={{ padding: "6px 14px", fontSize: 12 }} onClick={handleMigrate} disabled={migrating}>
            {migrating ? "Syncing…" : "Sync to DB"}
          </button>
        </div>
      )}

      {!showFaults ? (
        <>
          <div className="seg seg-full" role="tablist">
            {CHECK_KINDS.map((k) => (
              <button key={k} role="tab" aria-selected={k === kindTab} className={`seg-btn${k === kindTab ? " active" : ""}`} onClick={() => setKindTab(k)}>
                {KIND_LABEL[k]}{counts && <span className="seg-count">{counts[k]}</span>}
              </button>
            ))}
          </div>
          <div className="rec-filters">
            <select className="filter-input" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
              <option value="">All months</option>
              {months.map((m) => <option key={m} value={m}>{monthTitle(m)}</option>)}
            </select>
            {operatorFilter}
          </div>
          <div className="chip-row">
            <button className={`chip${faultsOnly ? " on" : ""}`} onClick={() => setFaultsOnly((v) => !v)}>With faults</button>
            <button className={`chip${unsignedOnly ? " on" : ""}`} onClick={() => setUnsignedOnly((v) => !v)}>Needs sign-off</button>
            {filtering && <button className="chip clear" onClick={() => { setMonth(""); setOperator(""); setFaultsOnly(false); setUnsignedOnly(false); }}>Clear</button>}
          </div>

          {logGroups.length === 0 && (
            <p className="empty-state log-empty">
              {filtering ? "No inspections match." : `No ${KIND_LABEL[kindTab].toLowerCase()} inspections yet.`}
            </p>
          )}
          {logGroups.map((g, gi) => {
            const open = isOpen(g.key, gi);
            const withFaults = g.logs.filter((l) => l.faultCount > 0).length;
            return (
              <section key={g.key} className="rec-group">
                {g.key !== "all" && groupHead(g.key, open,
                  <><span className="rec-group-noun">{GROUP_NOUN[kindTab]}</span> {g.label}</>,
                  <>{g.logs.length}{withFaults > 0 && <span className="rec-group-bad"> · {withFaults} with faults</span>}</>,
                  kindTab === "daily" && <button className="rec-group-pdf" onClick={() => exportWeekFor(g.logs[0].date)} aria-label={`Week PDF ${g.label}`}><FileText size={16} /> PDF</button>,
                )}
                {open && (
                  <ul className="rec-list">
                    {g.logs.map((log) => {
                      const [d, m, y] = log.date.split("/").map(Number);
                      const day = new Date(y, m - 1, d);
                      return (
                        <li key={log.id}>
                          <button className="rec-row" onClick={() => setViewLog(log)}>
                            <span className="rec-date">
                              <strong>{d}</strong>
                              <small>{day.toLocaleDateString("en-GB", kindTab === "daily" ? { weekday: "short" } : { month: "short" })}</small>
                            </span>
                            <span className="rec-main">
                              <span className="rec-title">{log.operatorName}</span>
                              <span className="rec-sub">{log.time}{log.overallCondition ? ` · ${log.overallCondition}` : ""}{!log.shiftSignoff ? " · not signed off" : ""}</span>
                            </span>
                            <span className={`rec-pill ${log.faultCount === 0 ? "ok" : log.faultCount >= 3 ? "bad" : "warn"}`}>
                              {log.faultCount === 0 ? "OK" : `${log.faultCount} fault${log.faultCount > 1 ? "s" : ""}`}
                            </span>
                            <ChevronRight size={18} className="rec-chev" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
          {loadMoreButton}
          <p className="rec-foot">
            {filtering || !counts ? `${filteredLogs.length} shown` : `${filteredLogs.length} of ${counts[kindTab]} shown`}
          </p>
        </>
      ) : (
        <>
          <button className="btn-report-fault" onClick={() => setNewFault(true)}>+ Report a fault</button>
          {(() => {
            const sum = summarizeAges(briefs);
            return (
              <div className="age-summary">
                <div><strong>{sum.active}</strong>active</div>
                <div className={sum.overdue ? "bad" : ""}><strong>{sum.overdue}</strong>overdue</div>
                <div><strong>{sum.avgDaysToClose == null ? "—" : sum.avgDaysToClose.toFixed(1)}</strong>avg days to fix</div>
              </div>
            );
          })()}
          <div className="seg seg-full" role="tablist">
            {(["active", "overdue", "resolved", "all"] as const).map((v) => (
              <button key={v} role="tab" aria-selected={faultView === v} className={`seg-btn${faultView === v ? " active" : ""}`} onClick={() => setFaultView(v)}>
                {FAULT_VIEW_LABEL[v]}<span className={`seg-count${v === "overdue" && viewCounts.overdue ? " bad" : ""}`}>{viewCounts[v]}</span>
              </button>
            ))}
          </div>
          <div className="rec-filters">
            <input className="filter-input" type="search" placeholder="Search faults" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="filter-input" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
              <option value="">All months</option>
              {months.map((m) => <option key={m} value={m}>{monthTitle(m)}</option>)}
            </select>
          </div>
          <p className="editor-hint" style={{ margin: "0 0 10px" }}>
            Overdue: open longer than {TARGET_DAYS["Immediate Grounding"]} day (grounding), {TARGET_DAYS.Urgent} days (urgent) or {TARGET_DAYS.Routine} days (routine).
          </p>

          {filteredFaults.length === 0 && (
            <p className="empty-state log-empty">{briefs.length ? (faultView === "active" ? "No open faults. 👍" : "No reports match.") : "No fault reports yet."}</p>
          )}
          {faultGroups.map((g, gi) => {
            const open = isOpen(g.key, gi);
            return (
              <section key={g.key} className="rec-group">
                {g.key !== "all" && g.items.length > 0 && groupHead(g.key, open, g.label, g.items.length)}
                {open && g.items.length > 0 && (
                  <ul className="rec-list">
                    {g.items.map((fr) => {
                      const age = faultAge(fr);
                      const p = fr.priority === "Immediate Grounding" ? "g" : fr.priority === "Urgent" ? "u" : "r";
                      const title = fr.vehicleEquipmentLine.replace(/^RESCUE 2 \(HDK-ARFF\)\s*/, "") || fr.faults.map((f) => f.label).join(", ");
                      return (
                        <li key={fr.id}>
                          <button className={`rec-row prio-${p}`} onClick={() => setViewFault(fr)}>
                            <span className="rec-main">
                              <span className="rec-title">{title}</span>
                              <span className="rec-sub">{fr.reportNumber} · {fr.date} · {fr.operatorName}</span>
                            </span>
                            <span className="rec-side">
                              <span className={`rec-pill ${fr.status === "Resolved" ? "ok" : fr.status === "In Progress" ? "info" : p === "g" ? "bad" : "warn"}`}>
                                {fr.status === "Open" ? (p === "g" ? "Grounding" : fr.priority) : fr.status}
                              </span>
                              <span className={`rec-age${age.overdue ? " overdue" : ""}`}>{age.overdue ? "⚠ " : ""}{age.label}</span>
                            </span>
                            <ChevronRight size={18} className="rec-chev" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
          {loadMoreButton}
          <p className="rec-foot">{filteredFaults.length} shown</p>
        </>
      )}

      {viewLog && (
        <LogModal log={viewLog} onClose={() => setViewLog(null)} actions={<>
          {!viewLog.shiftSignoff && <button className="btn-export secondary" onClick={() => { setSignOff(viewLog); setViewLog(null); }}>Sign off</button>}
          {logKind(viewLog) === "daily" && <button className="btn-export secondary" onClick={() => exportWeekFor(viewLog.date)}>Week PDF</button>}
          {isAdmin && <>
            <button className="btn-export secondary" onClick={() => { setEditLog(viewLog); setViewLog(null); }}>Edit</button>
            <button className="btn-export danger" onClick={() => { const l = viewLog; setViewLog(null); confirmDelete(`the log from ${l.date}`, () => deleteLog(l.id)); }}>Delete</button>
          </>}
        </>} />
      )}
      {viewFault && (
        <FaultModal report={viewFault} onClose={() => setViewFault(null)} actions={<>
          {viewFault.status !== "Resolved" && <button className="btn-export secondary" onClick={() => { setRepairFault(viewFault); setViewFault(null); }}>Repair</button>}
          {isAdmin && <>
            <button className="btn-export secondary" onClick={() => { setEditFault(viewFault); setViewFault(null); }}>Edit</button>
            <button className="btn-export danger" onClick={() => { const r = viewFault; setViewFault(null); confirmDelete(r.reportNumber, () => deleteFaultReport(r.id)); }}>Delete</button>
          </>}
        </>} />
      )}
      {signOff && <SignOffModal log={signOff} onClose={() => setSignOff(null)} onDone={() => { setSignOff(null); reload(logs.length); toast("Inspection signed off."); }} />}
      {newFault && <NewFaultModal onClose={() => setNewFault(false)} onDone={(r) => {
        setNewFault(false);
        reload();
        const pdf = exportFaultReportPDF(r);
        showPdf(pdf);
        toast(`${r.reportNumber} saved. Emailing it…`, "info");
        pdf.then((file) => emailFaultReport(r, file)).then((res) => toast(describeEmail(res), "error" in res ? "error" : res.skipped ? "info" : "success"));
      }} />}
      {repairFault && <RepairModal report={repairFault} onClose={() => setRepairFault(null)} onDone={() => { setRepairFault(null); reload(faults.length); toast("Repair progress saved."); }} />}
      {editLog && <EditLogModal item={editLog} onClose={() => setEditLog(null)} onSave={(l) => adminAction(() => updateLog(l)).then(() => { setEditLog(null); toast("Inspection updated."); })} />}
      {editFault && <EditFaultModal item={editFault} onClose={() => setEditFault(null)} onSave={(r) => adminAction(() => updateFaultReport(r)).then(() => { setEditFault(null); toast("Fault report updated."); })} />}
    </div>
  );
}
