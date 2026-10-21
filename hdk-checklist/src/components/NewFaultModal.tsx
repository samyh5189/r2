import { useEffect, useRef, useState } from "react";
import type { EvidenceItem, FaultReport, Operator } from "../types";
import { getOperators, saveFaultReport } from "../storage";
import { generateManualFaultReport } from "../faultReportAI";
import { processFile } from "../evidenceUtils";
import SignatureField from "./SignatureField";

const MAX_EVIDENCE = 5;

/** Report a fault outside the daily inspection: the operator's words, polished by AI, on the same report form. */
export default function NewFaultModal({ onClose, onDone }: { onClose: () => void; onDone: (report: FaultReport) => void }) {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [operatorName, setOperatorName] = useState("");
  const [status, setStatus] = useState<"NOK" | "U/S">("NOK");
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [signature, setSignature] = useState("");
  const [processing, setProcessing] = useState(false);
  const [busy, setBusy] = useState<"" | "generating" | "saving">("");
  const [draft, setDraft] = useState<FaultReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => { getOperators().then(setOperators); }, []);

  async function addFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_EVIDENCE - evidence.length);
    e.target.value = "";
    if (files.length === 0) return;
    setProcessing(true);
    const items: EvidenceItem[] = [];
    for (const f of files) {
      try { items.push(await processFile(f)); } catch { /* unreadable file — skip it */ }
    }
    setEvidence((prev) => [...prev, ...items]);
    setProcessing(false);
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!operatorName.trim() || !description.trim()) { setError("Enter your name and describe the fault."); return; }
    if (!signature) { setError("Please sign the report."); return; }
    setError(null);
    setBusy("generating");
    setDraft(await generateManualFaultReport({ operatorName: operatorName.trim(), description, status, evidence, signature }));
    setBusy("");
  }

  async function save() {
    if (!draft) return;
    setBusy("saving");
    onDone(await saveFaultReport(draft));
  }

  const edit = (patch: Partial<FaultReport>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{draft ? "Check the report" : "Report a fault"}</span>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>

        {busy === "generating" ? (
          <div className="spinner-wrap"><div className="spinner" /><span className="spinner-text">Writing the fault report…</span></div>
        ) : draft ? (
          <div className="modal-body edit-form">
            <p className="editor-hint">AI has written up your description. Check it, change anything that's wrong, then save.</p>
            <label>Report title
              <input value={draft.vehicleEquipmentLine} onChange={(e) => edit({ vehicleEquipmentLine: e.target.value })} />
            </label>
            <label>Details of defects
              <textarea rows={6} value={draft.detailsOfDefects} onChange={(e) => edit({ detailsOfDefects: e.target.value })} />
            </label>
            <label>Priority
              <select value={draft.priority} onChange={(e) => edit({ priority: e.target.value as FaultReport["priority"] })}>
                <option>Routine</option><option>Urgent</option><option>Immediate Grounding</option>
              </select>
            </label>
            <p className="editor-hint" style={{ margin: 0 }}><strong>Your words:</strong> {description.trim()}</p>
            <div className="edit-row">
              <button type="button" className="btn-small" onClick={() => setDraft(null)} disabled={busy !== ""}>← Edit</button>
              <button type="button" className="btn-submit" onClick={save} disabled={busy !== ""}>{busy === "saving" ? "Saving…" : "Save & view report"}</button>
            </div>
          </div>
        ) : (
          <form className="modal-body edit-form" onSubmit={generate}>
            <label>Operator name
              {operators.length > 0 ? (
                <select value={operatorName} onChange={(e) => setOperatorName(e.target.value)}>
                  <option value="">Select your name…</option>
                  {operators.map((o) => <option key={o.id} value={o.name}>{o.name}{o.rank ? ` (${o.rank})` : ""}</option>)}
                </select>
              ) : (
                <input value={operatorName} placeholder="Full name" onChange={(e) => setOperatorName(e.target.value)} />
              )}
            </label>
            <div className="nf-status">
              <button type="button" className={`nf-status-btn nok${status === "NOK" ? " on" : ""}`} onClick={() => setStatus("NOK")}>NOK · still operational</button>
              <button type="button" className={`nf-status-btn us${status === "U/S" ? " on" : ""}`} onClick={() => setStatus("U/S")}>U/S · unserviceable</button>
            </div>
            <label>What's wrong?
              <textarea rows={4} maxLength={2000} placeholder="Describe the fault in your own words — what, where, when you noticed it." value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>

            <div className="cl-evidence-section">
              <div className="cl-evidence-header">
                <span className="cl-evidence-title">Photos / video ({evidence.length}/{MAX_EVIDENCE})</span>
                {evidence.length < MAX_EVIDENCE && (
                  <div className="cl-ev-btn-group">
                    <button type="button" className="cl-add-evidence-btn" onClick={() => cameraRef.current?.click()} disabled={processing}>📷 Camera</button>
                    <button type="button" className="cl-add-evidence-btn secondary" onClick={() => uploadRef.current?.click()} disabled={processing}>📁 Upload</button>
                  </div>
                )}
                {processing && <span style={{ fontSize: 11, color: "var(--muted)" }}>Processing…</span>}
              </div>
              <input ref={cameraRef} type="file" accept="image/*,video/*" capture="environment" multiple style={{ display: "none" }} onChange={addFiles} />
              <input ref={uploadRef} type="file" accept="image/*,video/*" multiple style={{ display: "none" }} onChange={addFiles} />
              {evidence.length > 0 && (
                <div className="cl-ev-thumbs">
                  {evidence.map((ev) => (
                    <div key={ev.id} className="cl-ev-thumb-wrap">
                      <img src={ev.dataUrl} alt={ev.name} className="cl-ev-thumb" />
                      {ev.type === "video" && <span className="cl-ev-video-badge">▶</span>}
                      <button type="button" className="cl-ev-remove" onClick={() => setEvidence((prev) => prev.filter((x) => x.id !== ev.id))}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <label style={{ marginBottom: -4 }}>Signature</label>
            <SignatureField onChange={setSignature} height={100} />
            {error && <p className="form-error">{error}</p>}
            <button className="btn-submit" disabled={processing}>Generate report →</button>
          </form>
        )}
      </div>
    </div>
  );
}
