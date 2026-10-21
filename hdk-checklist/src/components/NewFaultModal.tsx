import { useEffect, useState } from "react";
import type { EvidenceItem, FaultReport, Operator } from "../types";
import { getOperators, saveFaultReport, saveOperatorSignature, verifyOperator } from "../storage";
import { generateManualFaultReport } from "../faultReportAI";
import { needsPin } from "../operators";
import OperatorField from "./OperatorField";
import SignatureChoice from "./SignatureChoice";
import EvidenceEditor from "./EvidenceEditor";
import FaultDraftReview from "./FaultDraftReview";

/** Report a fault outside the daily inspection: the operator's words, polished by AI, on the same report form. */
export default function NewFaultModal({ onClose, onDone }: { onClose: () => void; onDone: (report: FaultReport) => void }) {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [operatorName, setOperatorName] = useState("");
  const [pin, setPin] = useState("");
  // Set once the name (and PIN) check out, with the operator's saved signature
  const [verified, setVerified] = useState<{ saved: string | null } | null>(null);
  const [status, setStatus] = useState<"NOK" | "U/S">("NOK");
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [signature, setSignature] = useState("");
  const [saveSignature, setSaveSignature] = useState(false);
  const [busy, setBusy] = useState<"" | "checking" | "generating" | "saving">("");
  const [draft, setDraft] = useState<FaultReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { getOperators().then(setOperators); }, []);

  async function identify(e: React.FormEvent) {
    e.preventDefault();
    if (!operatorName.trim()) { setError("Enter your name."); return; }
    setError(null);
    if (operators.length === 0) { setVerified({ saved: null }); return; }
    setBusy("checking");
    try {
      const { signature: saved } = await verifyOperator(operatorName, pin);
      setVerified({ saved });
      setSignature(saved ?? "");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not check your PIN."); }
    setBusy("");
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) { setError("Describe the fault."); return; }
    if (!signature) { setError("Please sign the report."); return; }
    setError(null);
    setBusy("generating");
    setDraft(await generateManualFaultReport({ operatorName: operatorName.trim(), description, status, evidence, signature }));
    setBusy("");
  }

  async function save() {
    if (!draft) return;
    setBusy("saving");
    setError(null);
    try {
      const saved = await saveFaultReport(draft, pin);
      if (saveSignature && pin) saveOperatorSignature(operatorName, pin, signature).catch(() => { /* optional */ });
      onDone(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the report.");
      setBusy("");
    }
  }

  const title = draft ? "Check the report" : "Report a fault";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>

        {busy === "generating" ? (
          <div className="spinner-wrap"><div className="spinner" /><span className="spinner-text">Writing the fault report…</span></div>
        ) : draft ? (
          <div className="modal-body">
            <FaultDraftReview
              draft={draft}
              onChange={setDraft}
              operatorWords={[`[${status}] ${description.trim()}`]}
              busy={busy !== ""}
              error={error}
              saveLabel={busy === "saving" ? "Saving…" : "Save & view report"}
              onBack={() => { setDraft(null); setError(null); }}
              onSave={save}
            />
          </div>
        ) : !verified ? (
          <form className="modal-body edit-form" onSubmit={identify}>
            <OperatorField label="Operator name" operators={operators} name={operatorName} pin={pin}
              onName={(n) => { setOperatorName(n); setError(null); }} onPin={(p) => { setPin(p); setError(null); }} />
            {error && <p className="form-error">{error}</p>}
            <button className="btn-submit" disabled={busy !== "" || !operatorName.trim() || (needsPin(operators, operatorName) && pin.length < 4)}>
              {busy === "checking" ? "Checking…" : "Continue →"}
            </button>
          </form>
        ) : (
          <form className="modal-body edit-form" onSubmit={generate}>
            <p className="editor-hint" style={{ margin: 0 }}>Reporting as <strong>{operatorName}</strong></p>
            <div className="nf-status">
              <button type="button" className={`nf-status-btn nok${status === "NOK" ? " on" : ""}`} onClick={() => setStatus("NOK")}>NOK · still operational</button>
              <button type="button" className={`nf-status-btn us${status === "U/S" ? " on" : ""}`} onClick={() => setStatus("U/S")}>U/S · unserviceable</button>
            </div>
            <label>What's wrong?
              <textarea rows={4} maxLength={2000} placeholder="Describe the fault in your own words — what, where, when you noticed it." value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>

            <EvidenceEditor evidence={evidence} onChange={setEvidence} />

            <label style={{ marginBottom: -4 }}>Signature</label>
            <SignatureChoice saved={verified.saved} onChange={setSignature} canSave={needsPin(operators, operatorName)} onSaveChange={setSaveSignature} height={100} />
            {error && <p className="form-error">{error}</p>}
            <button className="btn-submit">Generate report →</button>
          </form>
        )}
      </div>
    </div>
  );
}
