import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import SignaturePad from "signature_pad";
import { buildChecklist, defaultChecklistConfig, itemType } from "../checklistData";
import { KIND_LABEL, PERIOD_NAME } from "../checkKinds";
import type { CheckKind, ChecklistSection, ChecklistSectionConfig, ItemStatus, InspectionLog, FaultReport, EvidenceItem, Operator } from "../types";
import { saveLog, saveFaultReport, getFaultReports, sameInspectionWeek, getChecklistConfig, findLogForDate, getOperators, deviceId, emailFaultReport, describeEmail } from "../storage";
import { generateFaultReport } from "../faultReportAI";
import { showPdf } from "../pdfViewer";
import { exportInspectionPDF, exportFaultReportPDF } from "../pdfExport";
import { processFile } from "../evidenceUtils";
import rescue2Photo from "../assets/rescue2.jpg";

type Phase = "intro" | "item" | "review" | "outro" | "submitting" | "done" | "blocked";

interface RepeatFault {
  label: string;
  reportNumber: string;
  reportId: string;
}

interface FlatItem {
  sectionId: string;
  sectionTitle: string;
  sectionShort: string;
  itemId: string;
  itemIndex: number;
  globalIndex: number;
  label: string;
}

function buildFlatItems(sections: ChecklistSection[]): FlatItem[] {
  const flat: FlatItem[] = [];
  let g = 0;
  for (const sec of sections) {
    const short = sec.title.includes("—") ? sec.title.split("—").pop()!.trim() : sec.title;
    for (let i = 0; i < sec.items.length; i++) {
      flat.push({ sectionId: sec.id, sectionTitle: sec.title, sectionShort: short, itemId: sec.items[i].id, itemIndex: i, globalIndex: g++, label: sec.items[i].label });
    }
  }
  return flat;
}

function getItem(sections: ChecklistSection[], secId: string, itemId: string) {
  return sections.find((s) => s.id === secId)?.items.find((it) => it.id === itemId);
}

function useElapsedTimer(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (running) {
      ref.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else {
      if (ref.current) clearInterval(ref.current);
    }
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [running]);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return { elapsed: seconds, display: `${mm}:${ss}` };
}

const MAX_EVIDENCE = 5;

interface Props {
  kind?: CheckKind;
  /** Called after an inspection is saved, so the caller can refresh what's due */
  onSubmitted?: () => void;
  /** True while an inspection is under way (the check picker hides so progress isn't lost) */
  onActiveChange?: (active: boolean) => void;
}

export default function ChecklistPage({ kind = "daily", onSubmitted, onActiveChange }: Props) {
  const [sections, setSections] = useState<ChecklistSection[]>(() => buildChecklist(defaultChecklistConfig(kind)));
  const [config, setConfig] = useState<ChecklistSectionConfig[] | null>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [pendingStatus, setPendingStatus] = useState<ItemStatus>("");
  const [pendingRemarks, setPendingRemarks] = useState("");
  const [pendingEvidence, setPendingEvidence] = useState<EvidenceItem[]>([]);
  const [flash, setFlash] = useState<ItemStatus>("");
  const [uploadingEvidence, setUploadingEvidence] = useState(false);

  // Intro fields
  const [operatorName, setOperatorName] = useState("");
  const [operators, setOperators] = useState<Operator[]>([]);
  // undefined = still checking; null = no inspection yet today
  const [todayLog, setTodayLog] = useState<InspectionLog | null | undefined>(undefined);
  const [blockedMsg, setBlockedMsg] = useState("");
  const [starting, setStarting] = useState(false);

  // Outro fields
  const [overallCondition, setOverallCondition] = useState<"Excellent" | "Good" | "Poor" | "">("");
  const [comments, setComments] = useState("");

  // Results
  const [savedLog, setSavedLog] = useState<InspectionLog | null>(null);
  const [savedFault, setSavedFault] = useState<FaultReport | null>(null);
  const [repeatFaults, setRepeatFaults] = useState<RepeatFault[]>([]);
  const [emailNote, setEmailNote] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sigPad = useRef<SignaturePad | null>(null);
  const remarksRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const hoursInputRef = useRef<HTMLInputElement>(null);

  const flatItems = useMemo(() => buildFlatItems(sections), [sections]);
  const total = flatItems.length;

  const answeredCount = sections.reduce((a, s) => a + s.items.filter((it) => it.status !== "").length, 0);
  const pct = Math.round((answeredCount / total) * 100);
  const faultsSoFar = sections.reduce((a, s) => a + s.items.filter((it) => it.status === "NOK" || it.status === "U/S").length, 0);

  const timerRunning = phase === "item";
  const active = phase === "item" || phase === "review" || phase === "outro" || phase === "submitting";
  useEffect(() => { onActiveChange?.(active); }, [active, onActiveChange]);
  const { elapsed, display: timerDisplay } = useElapsedTimer(timerRunning);

  useEffect(() => {
    getOperators().then(setOperators);
    findLogForDate(new Date().toLocaleDateString("en-GB"), "", kind).then(setTodayLog);
  }, [kind]);

  // Load the admin-configured checklist; only swap it in before any item is answered
  useEffect(() => {
    getChecklistConfig(kind).then((cfg) => {
      setConfig(cfg);
      setSections((cur) => (cur.every((sec) => sec.items.every((it) => !it.status)) ? buildChecklist(cfg) : cur));
    });
  }, [kind]);

  // Set up sig pad when we enter outro phase
  useEffect(() => {
    if (phase !== "outro" || !canvasRef.current || sigPad.current) return;
    sigPad.current = new SignaturePad(canvasRef.current, { backgroundColor: "rgba(0,0,0,0)", penColor: "#0B2A4A" });
    const resize = () => {
      if (!canvasRef.current || !sigPad.current) return;
      const data = sigPad.current.toData();
      const canvas = canvasRef.current;
      const r = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * r;
      canvas.height = canvas.offsetHeight * r;
      canvas.getContext("2d")?.scale(r, r);
      sigPad.current.fromData(data);
    };
    window.addEventListener("resize", resize);
    resize();
    return () => window.removeEventListener("resize", resize);
  }, [phase]);

  useEffect(() => {
    if (pendingStatus === "NOK" || pendingStatus === "U/S") {
      setTimeout(() => remarksRef.current?.focus(), 80);
    }
  }, [pendingStatus]);

  const applyStatus = useCallback((secId: string, itemId: string, status: ItemStatus, remarks: string, evidence: EvidenceItem[]) => {
    setSections((prev) =>
      prev.map((s) => s.id !== secId ? s : {
        ...s,
        items: s.items.map((it) => it.id !== itemId ? it : { ...it, status, remarks, evidence }),
      })
    );
  }, []);

  function handleStatusTap(status: ItemStatus) {
    const flat = flatItems[currentIdx];
    const existing = getItem(sections, flat.sectionId, flat.itemId);
    if (status === "NOK" || status === "U/S") {
      setPendingStatus(status);
      setPendingRemarks(existing?.remarks ?? "");
      setPendingEvidence(existing?.evidence ?? []);
    } else {
      setFlash(status);
      applyStatus(flat.sectionId, flat.itemId, status, "", []);
      setTimeout(() => { setFlash(""); advance(); }, 260);
    }
  }

  async function handleFileCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (pendingEvidence.length >= MAX_EVIDENCE) return;
    setUploadingEvidence(true);
    const toProcess = Array.from(files).slice(0, MAX_EVIDENCE - pendingEvidence.length);
    const results: EvidenceItem[] = [];
    for (const f of toProcess) {
      const ev = await processFile(f);
      results.push(ev);
    }
    setPendingEvidence((prev) => [...prev, ...results]);
    setUploadingEvidence(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  }

  function removeEvidence(id: string) {
    setPendingEvidence((prev) => prev.filter((e) => e.id !== id));
  }

  function confirmFault() {
    const flat = flatItems[currentIdx];
    applyStatus(flat.sectionId, flat.itemId, pendingStatus, pendingRemarks, pendingEvidence);
    setPendingStatus(""); setPendingRemarks(""); setPendingEvidence([]);
    advance();
  }

  function advance() {
    if (currentIdx + 1 >= total) setPhase("review");
    else setCurrentIdx((i) => i + 1);
  }

  function goBack() {
    if (pendingStatus) { setPendingStatus(""); setPendingRemarks(""); setPendingEvidence([]); return; }
    if (currentIdx === 0) { setPhase("intro"); return; }
    setCurrentIdx((i) => i - 1);
  }

  function jumpToItem(globalIndex: number) {
    setCurrentIdx(globalIndex);
    setPendingStatus(""); setPendingRemarks(""); setPendingEvidence([]);
    setPhase("item");
  }

  async function handleSubmit() {
    if (!operatorName.trim() || !overallCondition) return;
    setPhase("submitting");
    // One inspection per device and per operator a day — check before spending time on the AI report
    if (await checkAlreadyDone()) return;
    const sig = sigPad.current?.isEmpty() ? "" : (sigPad.current?.toDataURL() ?? "");
    const count = faultsSoFar;
    const now = new Date();
    const log: InspectionLog = {
      id: crypto.randomUUID(),
      date: now.toLocaleDateString("en-GB"),
      time: now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      duration: elapsed,
      operatorName: operatorName.trim(),
      deviceId: deviceId(),
      kind,
      fleetNumber: "",
      operatorSignature: sig,
      sections,
      overallCondition,
      comments,
      faultCount: count,
      createdAt: now.toISOString(),
    };

    let faultReport: FaultReport | null = null;
    const repeats: RepeatFault[] = [];
    if (count > 0) {
      // Faults already on an open report from this week link to it instead of a new report
      const openThisWeek = (await getFaultReports()).filter((r) => r.status !== "Resolved" && sameInspectionWeek(r.date, log.date));
      const reportedIn = new Map<string, FaultReport>();
      for (const r of openThisWeek) for (const f of r.faults) if (!reportedIn.has(f.itemId)) reportedIn.set(f.itemId, r);
      for (const sec of sections) for (const it of sec.items) {
        const prior = reportedIn.get(it.id);
        if (prior && (it.status === "NOK" || it.status === "U/S")) repeats.push({ label: it.label, reportNumber: prior.reportNumber, reportId: prior.id });
      }
      faultReport = await generateFaultReport(sections, operatorName.trim(), "", sig, new Set(reportedIn.keys()), kind);
      if (faultReport) faultReport.inspectionLogId = log.id;
      log.faultReportId = faultReport?.id ?? repeats[0]?.reportId;
    }
    // The server enforces one inspection per day; save the log first so a rejected log leaves no report behind
    const rejected = await saveLog(log);
    if (rejected) {
      setBlockedMsg(rejected);
      setPhase("blocked");
      return;
    }
    if (faultReport) {
      const saved = await saveFaultReport(faultReport);
      faultReport = saved;
      // Email the PDF in the background; the result shows on the done screen
      setEmailNote("Emailing fault report…");
      exportFaultReportPDF(saved).then((pdf) => emailFaultReport(saved, pdf)).then((r) => setEmailNote(describeEmail(r)));
    }
    setTodayLog(log);
    setSavedLog(log);
    setSavedFault(faultReport);
    setRepeatFaults(repeats);
    setPhase("done");
    onSubmitted?.();
  }

  async function checkAlreadyDone() {
    const existing = await findLogForDate(new Date().toLocaleDateString("en-GB"), operatorName, kind);
    if (!existing) return false;
    setBlockedMsg(kind === "daily"
      ? `${existing.operatorName} already submitted today's inspection at ${existing.time}.`
      : `${existing.operatorName} already submitted ${PERIOD_NAME[kind]}'s ${kind} inspection on ${existing.date}.`);
    setPhase("blocked");
    return true;
  }

  async function handleStart() {
    setStarting(true);
    const done = await checkAlreadyDone();
    setStarting(false);
    if (!done) setPhase("item");
  }

  function handleNew() {
    setSections(buildChecklist(config ?? defaultChecklistConfig(kind)));
    setPhase("intro"); setCurrentIdx(0);
    setPendingStatus(""); setPendingRemarks(""); setPendingEvidence([]); setFlash("");
    setOverallCondition(""); setComments("");
    setSavedLog(null); setSavedFault(null); setRepeatFaults([]);
    sigPad.current = null;
  }

  // ── INTRO ────────────────────────────────────────────────────────────
  if (phase === "blocked" || (phase === "intro" && todayLog)) {
    return (
      <div className="cl-screen">
        <div className="cl-intro-card">
          <img className="cl-intro-photo" src={rescue2Photo} alt="RESCUE 2 fire vehicle" />
          <h2 className="cl-intro-title">{kind === "daily" ? "Today's inspection is done" : `${KIND_LABEL[kind]} inspection done`}</h2>
          <p className="cl-intro-sub">
            {blockedMsg || (kind === "daily"
              ? `Submitted by ${todayLog!.operatorName} at ${todayLog!.time}.`
              : `Submitted by ${todayLog!.operatorName} on ${todayLog!.date}. The next one is due after ${PERIOD_NAME[kind]}.`)}
          </p>
        </div>
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div className="cl-screen">
        <div className="cl-intro-card">
          <img className="cl-intro-photo" src={rescue2Photo} alt="RESCUE 2 fire vehicle" />
          <h2 className="cl-intro-title">{KIND_LABEL[kind]} Inspection</h2>
          <p className="cl-intro-sub">RESCUE 2 · {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          <p className="cl-intro-count">{total} items across {sections.length} sections</p>

          <div className="cl-intro-field">
            <label>Operator Name *</label>
            {operators.length > 0 ? (
              <select value={operatorName} onChange={(e) => setOperatorName(e.target.value)}>
                <option value="">Select your name…</option>
                {operators.map((o) => <option key={o.id} value={o.name}>{o.name}{o.rank ? ` (${o.rank})` : ""}</option>)}
              </select>
            ) : (
              <input type="text" placeholder="Full name" value={operatorName} onChange={(e) => setOperatorName(e.target.value)} autoFocus />
            )}
          </div>
          <div className="legend cl-legend-compact">
            <span className="legend-item"><span className="legend-dot" style={{ background: "var(--ok)" }} /> OK — Good</span>
            <span className="legend-item"><span className="legend-dot" style={{ background: "var(--nok)" }} /> NOK — Minor defect</span>
            <span className="legend-item"><span className="legend-dot" style={{ background: "var(--us)" }} /> U/S — Unserviceable</span>
            <span className="legend-item"><span className="legend-dot" style={{ background: "var(--na)" }} /> N/A — Not applicable</span>
          </div>
          <button className="btn-submit" disabled={!operatorName.trim() || todayLog === undefined || starting} onClick={handleStart}>
            {starting ? "Checking…" : "Start Inspection →"}
          </button>
        </div>
      </div>
    );
  }

  // ── SUBMITTING ────────────────────────────────────────────────────────
  if (phase === "submitting") {
    return (
      <div className="cl-screen">
        <div className="spinner-wrap">
          <div className="spinner" />
          <span className="spinner-text">{faultsSoFar > 0 ? "Generating AI fault report…" : "Saving inspection log…"}</span>
        </div>
      </div>
    );
  }

  // ── DONE ──────────────────────────────────────────────────────────────
  if (phase === "done" && savedLog) {
    const isCritical = savedFault?.priority === "Immediate Grounding";
    const durMin = Math.floor(savedLog.duration / 60);
    const durSec = savedLog.duration % 60;
    return (
      <div className="cl-screen">
        <div className="success-screen">
          <img className="success-photo" src={rescue2Photo} alt="RESCUE 2 fire vehicle" />
          <h2>{isCritical ? "Vehicle Grounded" : "Inspection Complete"}</h2>
          <p>{savedLog.date} · {savedLog.time} · <strong>{savedLog.operatorName}</strong></p>
          <p style={{ fontSize: 12 }}>Duration: {durMin}m {durSec}s · {savedLog.faultCount} fault{savedLog.faultCount !== 1 ? "s" : ""}</p>
          {savedFault && (
            <div className={`fault-badge${isCritical ? " critical" : ""}`}>
              {isCritical ? "🔴 IMMEDIATE GROUNDING" : "⚠️ Fault Report"} — {savedFault.reportNumber}
            </div>
          )}
          {repeatFaults.length > 0 && (
            <div className="repeat-note">
              <strong>Already reported this week — no new report:</strong>
              {repeatFaults.map((r) => <div key={r.label}>{r.label} · {r.reportNumber}</div>)}
            </div>
          )}
          {savedFault && emailNote && <p className="email-note">{emailNote}</p>}
          {savedFault?.aiAssessment && (
            <p style={{ maxWidth: 500, margin: "0 auto 16px", fontSize: 13, color: isCritical ? "#991b1b" : "#92400e" }}>
              {savedFault.aiAssessment}
            </p>
          )}
          <div className="export-btns">
            <button className="btn-export" onClick={() => showPdf(exportInspectionPDF(savedLog))}>View Checklist PDF</button>
            {savedFault && (
              <button className="btn-export secondary" onClick={() => showPdf(exportFaultReportPDF(savedFault))}>View Fault Report PDF</button>
            )}
          </div>
          <br />
          <button className="btn-new" onClick={handleNew}>Done</button>
        </div>
      </div>
    );
  }

  // ── REVIEW SCREEN ─────────────────────────────────────────────────────
  if (phase === "review") {
    const faultItems = flatItems.filter((fi) => {
      const it = getItem(sections, fi.sectionId, fi.itemId);
      return it?.status === "NOK" || it?.status === "U/S";
    });
    const counts = { OK: 0, NOK: 0, "U/S": 0, NA: 0 };
    for (const sec of sections) for (const it of sec.items) if (it.status) counts[it.status as keyof typeof counts]++;

    return (
      <div className="cl-screen">
        <div className="cl-item-wrap" style={{ maxWidth: 620 }}>
          <div className="cl-section-label">
            <span className="cl-section-name" style={{ background: "var(--navy)", color: "white" }}>Review</span>
            <span className="cl-item-count">{total}/{total} complete</span>
          </div>

          <div className="cl-review-summary">
            <div className="cl-review-stat" style={{ color: "var(--ok)" }}><strong>{counts.OK}</strong> OK</div>
            <div className="cl-review-stat" style={{ color: "var(--nok)" }}><strong>{counts.NOK}</strong> NOK</div>
            <div className="cl-review-stat" style={{ color: "var(--us)" }}><strong>{counts["U/S"]}</strong> U/S</div>
            <div className="cl-review-stat" style={{ color: "var(--na)" }}><strong>{counts.NA}</strong> N/A</div>
          </div>

          {faultItems.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Faults to review ({faultItems.length})
              </p>
              {faultItems.map((fi) => {
                const it = getItem(sections, fi.sectionId, fi.itemId)!;
                return (
                  <div key={fi.itemId} className={`cl-review-fault${it.status === "U/S" ? " us" : ""}`}
                    onClick={() => jumpToItem(fi.globalIndex)}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{fi.label}</span>
                      <span className={`badge ${it.status === "U/S" ? "badge-critical" : "badge-fault"}`}>{it.status}</span>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>{fi.sectionShort}</span>
                    {it.remarks && <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{it.remarks}</p>}
                    {it.evidence.length > 0 && (
                      <div className="cl-ev-thumbs" style={{ marginTop: 6 }}>
                        {it.evidence.map((ev) => (
                          <img key={ev.id} src={ev.dataUrl} alt={ev.name} className="cl-ev-thumb-sm" />
                        ))}
                      </div>
                    )}
                    <span style={{ fontSize: 11, color: "var(--navy)", marginTop: 4, display: "block" }}>Tap to edit →</span>
                  </div>
                );
              })}
            </div>
          )}

          {faultItems.length === 0 && (
            <div style={{ textAlign: "center", padding: "20px 0", color: "var(--ok)", fontWeight: 600 }}>
              ✅ No faults found — all items passed
            </div>
          )}

          <button className="btn-submit" onClick={() => setPhase("outro")}>
            Continue to Sign Off →
          </button>
          <button className="btn-new" style={{ display: "block", margin: "8px auto 0" }} onClick={() => jumpToItem(total - 1)}>
            ← Go back to last item
          </button>
        </div>
      </div>
    );
  }

  // ── OUTRO ─────────────────────────────────────────────────────────────
  if (phase === "outro") {
    return (
      <div className="cl-screen">
        <div className="container" style={{ paddingTop: 16 }}>
          <div className="progress-bar-wrap" style={{ marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Complete</span>
            <div className="progress-bar-track"><div className="progress-bar-fill" style={{ width: "100%" }} /></div>
            <span className="progress-pct">100%</span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{timerDisplay}</span>
          </div>

          <div className="card">
            <h3>Vehicle Overall Condition *</h3>
            <div className="condition-group">
              {(["Excellent", "Good", "Poor"] as const).map((c) => (
                <button key={c} className={`condition-btn${overallCondition === c ? ` sel-${c}` : ""}`} onClick={() => setOverallCondition(c)}>{c}</button>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>Comments</h3>
            <textarea className="comments-box" placeholder="Any additional observations…" value={comments} onChange={(e) => setComments(e.target.value)} />
          </div>

          <div className="card">
            <h3>Operator Signature</h3>
            <div className="sig-wrap">
              <canvas ref={canvasRef} className="sig-canvas" style={{ width: "100%", height: 120 }} />
              <div className="sig-actions">
                <span className="sig-hint">Sign with finger or mouse</span>
                <button className="btn-clear" onClick={() => sigPad.current?.clear()}>Clear</button>
              </div>
            </div>
          </div>

          <button className="btn-submit" disabled={!overallCondition} onClick={handleSubmit}>
            Submit Inspection
          </button>
          <button className="btn-new" style={{ display: "block", margin: "10px auto 0" }} onClick={() => setPhase("review")}>
            ← Back to Review
          </button>
        </div>
      </div>
    );
  }

  // ── ITEM-BY-ITEM ──────────────────────────────────────────────────────
  const flat = flatItems[currentIdx];
  const currentItem = getItem(sections, flat.sectionId, flat.itemId);
  const currentStatus = currentItem?.status ?? "";
  const prevSection = currentIdx > 0 ? flatItems[currentIdx - 1].sectionId : null;
  const isNewSection = prevSection !== flat.sectionId;
  const inputType = currentItem ? itemType(currentItem) : "status";
  const isValueItem = inputType !== "status";
  const unit = currentItem?.unit ?? "";
  const limits = [currentItem?.min != null && `min ${currentItem.min}`, currentItem?.max != null && `max ${currentItem.max}`].filter(Boolean).join(" · ");

  return (
    <div className="cl-screen">
      <div className="cl-progress-strip">
        <div className="cl-progress-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="cl-item-wrap">
        <div className={`cl-section-label${isNewSection ? " cl-section-new" : ""}`}>
          <span className="cl-section-name">{flat.sectionShort}</span>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="cl-timer">{timerDisplay}</span>
            <span className="cl-item-count">{currentIdx + 1} / {total}</span>
          </div>
        </div>

        {faultsSoFar > 0 && (
          <div className="cl-fault-strip">{faultsSoFar} fault{faultsSoFar > 1 ? "s" : ""} recorded</div>
        )}

        <div className={`cl-item-card${flash ? ` cl-flash-${flash.replace("/", "")}` : ""}`}>
          <div className="cl-item-num">#{currentIdx + 1}</div>
          <div className="cl-item-label">{flat.label}</div>

          {currentStatus && !pendingStatus && (
            <div className="cl-current-status">
              Currently: <span style={{ color: currentStatus === "OK" ? "var(--ok)" : currentStatus === "NOK" ? "var(--nok)" : currentStatus === "U/S" ? "var(--us)" : "var(--na)", fontWeight: 700 }}>{currentStatus}</span>
              {isValueItem && currentItem?.remarks && (
                <span style={{ marginLeft: 8, fontSize: 12, color: "var(--muted)" }}>— {currentItem.remarks} {unit}</span>
              )}
              {!isValueItem && currentItem && currentItem.evidence.length > 0 && (
                <span style={{ marginLeft: 8, fontSize: 11, color: "var(--muted)" }}>· {currentItem.evidence.length} evidence</span>
              )}
            </div>
          )}

          {pendingStatus && (
            <div className="cl-remarks-wrap">
              <div className="cl-pending-badge" style={{ background: pendingStatus === "U/S" ? "var(--us)" : "var(--nok)" }}>
                {pendingStatus}
              </div>
              <textarea
                ref={remarksRef}
                className="cl-remarks-input"
                placeholder="Describe the fault / remarks (optional)…"
                value={pendingRemarks}
                onChange={(e) => setPendingRemarks(e.target.value)}
                rows={2}
              />

              {/* Evidence capture */}
              <div className="cl-evidence-section">
                <div className="cl-evidence-header">
                  <span className="cl-evidence-title">Evidence ({pendingEvidence.length}/{MAX_EVIDENCE})</span>
                  {pendingEvidence.length < MAX_EVIDENCE && (
                    <div className="cl-ev-btn-group">
                      <button
                        className="cl-add-evidence-btn"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingEvidence}
                      >
                        📷 Camera
                      </button>
                      <button
                        className="cl-add-evidence-btn secondary"
                        onClick={() => uploadInputRef.current?.click()}
                        disabled={uploadingEvidence}
                      >
                        📁 Upload
                      </button>
                    </div>
                  )}
                  {uploadingEvidence && <span style={{ fontSize: 11, color: "var(--muted)" }}>Processing…</span>}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  capture="environment"
                  multiple
                  style={{ display: "none" }}
                  onChange={handleFileCapture}
                />
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={handleFileCapture}
                />
                {pendingEvidence.length > 0 && (
                  <div className="cl-ev-thumbs">
                    {pendingEvidence.map((ev) => (
                      <div key={ev.id} className="cl-ev-thumb-wrap">
                        <img src={ev.dataUrl} alt={ev.name} className="cl-ev-thumb" />
                        {ev.type === "video" && <span className="cl-ev-video-badge">▶</span>}
                        <button className="cl-ev-remove" onClick={() => removeEvidence(ev.id)}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button className="cl-confirm-btn" onClick={confirmFault} disabled={uploadingEvidence}>
                Confirm & Continue →
              </button>
            </div>
          )}
        </div>

        {isValueItem && (
          <div className="cl-hours-wrap">
            <p className="cl-hours-hint">
              {inputType === "number" ? `Enter the reading${unit ? ` (${unit})` : ""}` : "Enter the details"}
              {limits && <><br /><span style={{ fontSize: 11 }}>Allowed: {limits}</span></>}
            </p>
            <input
              key={`value-${currentIdx}`}
              ref={hoursInputRef}
              className={inputType === "number" ? "cl-hours-input" : "cl-remarks-input"}
              type={inputType === "number" ? "number" : "text"}
              step="any"
              defaultValue={currentItem?.remarks ?? ""}
              placeholder={inputType === "number" ? "e.g. 271.35" : "Type here…"}
            />
            <button
              className="cl-confirm-btn"
              onClick={() => {
                const val = (hoursInputRef.current?.value ?? currentItem?.remarks ?? "").trim();
                if (!val) return;
                // A number outside its configured limits is recorded as a fault
                const n = Number(val);
                const outOfRange = inputType === "number" && ((currentItem?.min != null && n < currentItem.min) || (currentItem?.max != null && n > currentItem.max));
                applyStatus(flat.sectionId, flat.itemId, outOfRange ? "NOK" : "OK", val, []);
                advance();
              }}
            >
              Record →
            </button>
          </div>
        )}

        {!pendingStatus && !isValueItem && (
          <div className="cl-status-grid">
            {[
              { status: "OK" as ItemStatus, label: "OK", desc: "Good", color: "var(--ok)" },
              { status: "NOK" as ItemStatus, label: "NOK", desc: "Minor defect", color: "var(--nok)" },
              { status: "U/S" as ItemStatus, label: "U/S", desc: "Unserviceable", color: "var(--us)" },
              { status: "NA" as ItemStatus, label: "N/A", desc: "Not applicable", color: "var(--na)" },
            ].map(({ status, label, desc, color }) => (
              <button
                key={status}
                className={`cl-status-btn${currentStatus === status ? " cl-status-selected" : ""}`}
                style={{ "--btn-color": color } as React.CSSProperties}
                onClick={() => handleStatusTap(status)}
              >
                <span className="cl-status-label">{label}</span>
                <span className="cl-status-desc">{desc}</span>
              </button>
            ))}
          </div>
        )}

        <div className="cl-nav">
          <button className="cl-back-btn" onClick={goBack}>← Back</button>
          {currentStatus && !pendingStatus && (
            <button className="cl-skip-btn" onClick={advance}>Next →</button>
          )}
        </div>
      </div>
    </div>
  );
}
