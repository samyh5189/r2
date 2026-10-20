import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import SignaturePad from "signature_pad";
import { buildBlankChecklist } from "../checklistData";
import type { ChecklistSection, ItemStatus, InspectionLog, FaultReport, EvidenceItem } from "../types";
import { saveLog, saveFaultReport } from "../storage";
import { generateFaultReport } from "../faultReportAI";
import { exportInspectionPDF, exportFaultReportPDF } from "../pdfExport";
import { processFile } from "../evidenceUtils";

type Phase = "intro" | "item" | "review" | "outro" | "submitting" | "done";

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

export default function ChecklistPage() {
  const [sections, setSections] = useState<ChecklistSection[]>(buildBlankChecklist);
  const [phase, setPhase] = useState<Phase>("intro");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [pendingStatus, setPendingStatus] = useState<ItemStatus>("");
  const [pendingRemarks, setPendingRemarks] = useState("");
  const [pendingEvidence, setPendingEvidence] = useState<EvidenceItem[]>([]);
  const [flash, setFlash] = useState<ItemStatus>("");
  const [uploadingEvidence, setUploadingEvidence] = useState(false);

  // Intro fields
  const [operatorName, setOperatorName] = useState("");

  // Outro fields
  const [overallCondition, setOverallCondition] = useState<"Excellent" | "Good" | "Poor" | "">("");
  const [comments, setComments] = useState("");

  // Results
  const [savedLog, setSavedLog] = useState<InspectionLog | null>(null);
  const [savedFault, setSavedFault] = useState<FaultReport | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sigPad = useRef<SignaturePad | null>(null);
  const remarksRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hoursInputRef = useRef<HTMLInputElement>(null);

  const flatItems = useMemo(() => buildFlatItems(sections), []);
  const total = flatItems.length;

  const answeredCount = sections.reduce((a, s) => a + s.items.filter((it) => it.status !== "").length, 0);
  const pct = Math.round((answeredCount / total) * 100);
  const faultsSoFar = sections.reduce((a, s) => a + s.items.filter((it) => it.status === "NOK" || it.status === "U/S").length, 0);

  const timerRunning = phase === "item";
  const { elapsed, display: timerDisplay } = useElapsedTimer(timerRunning);

  // Set up sig pad when we enter outro phase
  useEffect(() => {
    if (phase !== "outro" || !canvasRef.current || sigPad.current) return;
    sigPad.current = new SignaturePad(canvasRef.current, { backgroundColor: "#fafbfc", penColor: "#0B2A4A" });
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
    const sig = sigPad.current?.isEmpty() ? "" : (sigPad.current?.toDataURL() ?? "");
    const count = faultsSoFar;
    const now = new Date();
    const log: InspectionLog = {
      id: crypto.randomUUID(),
      date: now.toLocaleDateString("en-GB"),
      time: now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      duration: elapsed,
      operatorName: operatorName.trim(),
      fleetNumber: "",
      operatorSignature: sig,
      sections,
      overallCondition,
      comments,
      faultCount: count,
      createdAt: now.toISOString(),
    };

    let faultReport: FaultReport | null = null;
    if (count > 0) {
      faultReport = await generateFaultReport(sections, operatorName.trim(), "", sig);
      if (faultReport) {
        faultReport.inspectionLogId = log.id;
        log.faultReportId = faultReport.id;
        await saveFaultReport(faultReport);
      }
    }
    await saveLog(log);
    setSavedLog(log);
    setSavedFault(faultReport);
    setPhase("done");
  }

  function handleNew() {
    setSections(buildBlankChecklist());
    setPhase("intro"); setCurrentIdx(0);
    setPendingStatus(""); setPendingRemarks(""); setPendingEvidence([]); setFlash("");
    setOverallCondition(""); setComments("");
    setSavedLog(null); setSavedFault(null);
    sigPad.current = null;
  }

  // ── INTRO ────────────────────────────────────────────────────────────
  if (phase === "intro") {
    return (
      <div className="cl-screen">
        <div className="cl-intro-card">
          <div className="cl-intro-icon">🚒</div>
          <h2 className="cl-intro-title">Daily Inspection</h2>
          <p className="cl-intro-sub">RESCUE 2 · {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          <p className="cl-intro-count">{total} items across 9 sections</p>

          <div className="cl-intro-field">
            <label>Operator Name *</label>
            <input type="text" placeholder="Full name" value={operatorName} onChange={(e) => setOperatorName(e.target.value)} autoFocus />
          </div>
          <div className="legend cl-legend-compact">
            <span className="legend-item"><span className="legend-dot" style={{ background: "var(--ok)" }} /> OK — Good</span>
            <span className="legend-item"><span className="legend-dot" style={{ background: "var(--nok)" }} /> NOK — Minor defect</span>
            <span className="legend-item"><span className="legend-dot" style={{ background: "var(--us)" }} /> U/S — Unserviceable</span>
            <span className="legend-item"><span className="legend-dot" style={{ background: "var(--na)" }} /> N/A — Not applicable</span>
          </div>
          <button className="btn-submit" disabled={!operatorName.trim()} onClick={() => setPhase("item")}>
            Start Inspection →
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
          <div className="success-icon">{isCritical ? "🚨" : faultsSoFar > 0 ? "⚠️" : "✅"}</div>
          <h2>{isCritical ? "Vehicle Grounded" : "Inspection Complete"}</h2>
          <p>{savedLog.date} · {savedLog.time} · <strong>{savedLog.operatorName}</strong></p>
          <p style={{ fontSize: 12 }}>Duration: {durMin}m {durSec}s · {savedLog.faultCount} fault{savedLog.faultCount !== 1 ? "s" : ""}</p>
          {savedFault && (
            <div className={`fault-badge${isCritical ? " critical" : ""}`}>
              {isCritical ? "🔴 IMMEDIATE GROUNDING" : "⚠️ Fault Report"} — {savedFault.reportNumber}
            </div>
          )}
          {savedFault?.aiAssessment && (
            <p style={{ maxWidth: 500, margin: "0 auto 16px", fontSize: 13, color: isCritical ? "#991b1b" : "#92400e" }}>
              {savedFault.aiAssessment}
            </p>
          )}
          <div className="export-btns">
            <button className="btn-export" onClick={() => exportInspectionPDF(savedLog)}>↓ Checklist PDF</button>
            {savedFault && (
              <button className="btn-export secondary" onClick={() => exportFaultReportPDF(savedFault)}>↓ Fault Report PDF</button>
            )}
          </div>
          <br />
          <button className="btn-new" onClick={handleNew}>+ New Inspection</button>
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
  const isEngineHours = flat.itemId === "p1-10";

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
              {isEngineHours && currentItem?.remarks && (
                <span style={{ marginLeft: 8, fontSize: 12, color: "var(--muted)" }}>— {currentItem.remarks} hrs</span>
              )}
              {!isEngineHours && currentItem && currentItem.evidence.length > 0 && (
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
                    <button
                      className="cl-add-evidence-btn"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingEvidence}
                    >
                      {uploadingEvidence ? "Processing…" : "📷 Add Photo / Video"}
                    </button>
                  )}
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

        {isEngineHours && (
          <div className="cl-hours-wrap">
            <p className="cl-hours-hint">Enter the current engine hours reading from the dashboard</p>
            <input
              key={`hours-${currentIdx}`}
              ref={hoursInputRef}
              className="cl-hours-input"
              type="number"
              step="0.01"
              min="0"
              defaultValue={currentItem?.remarks ?? ""}
              placeholder="e.g. 271.35"
            />
            <button
              className="cl-confirm-btn"
              onClick={() => {
                const val = hoursInputRef.current?.value ?? currentItem?.remarks ?? "";
                applyStatus(flat.sectionId, flat.itemId, "OK", val, []);
                advance();
              }}
            >
              Record Hours →
            </button>
          </div>
        )}

        {!pendingStatus && !isEngineHours && (
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
