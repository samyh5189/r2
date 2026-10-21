import { useEffect, useState } from "react";
import type { FaultAcceptance, FaultRepair, FaultReport, InspectionLog, Operator } from "../types";
import { getOperators, signOffLog, updateRepair, verifyOperator } from "../storage";
import SignatureField from "./SignatureField";
import SignatureChoice from "./SignatureChoice";
import OperatorField from "./OperatorField";
import { needsPin } from "../operators";

// <input type="date"> uses YYYY-MM-DD; the form and PDF use DD/MM/YYYY
const toInputDate = (gb?: string) => (gb && /^\d{2}\/\d{2}\/\d{4}$/.test(gb) ? gb.split("/").reverse().join("-") : "");
const fromInputDate = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");

function NameField({ label, value, onChange, operators }: { label: string; value: string; onChange: (v: string) => void; operators?: Operator[] }) {
  const listId = `ops-${label.replace(/\W/g, "")}`;
  return (
    <label>{label}
      <input value={value} onChange={(e) => onChange(e.target.value)} list={operators?.length ? listId : undefined} />
      {operators?.length ? <datalist id={listId}>{operators.map((o) => <option key={o.id} value={o.name} />)}</datalist> : null}
    </label>
  );
}

function SignedOrPad({ existing, onChange }: { existing?: string; onChange: (v: string) => void }) {
  return existing
    ? <img src={existing} alt="signature" className="signed-img" />
    : <SignatureField onChange={onChange} height={90} />;
}

export function SignOffModal({ log, onClose, onDone }: { log: InspectionLog; onClose: () => void; onDone: () => void }) {
  const [operators, setOperators] = useState<Operator[] | null>(null);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  // Set once the name and PIN check out: the in-charge's saved signature (or null)
  const [verified, setVerified] = useState<{ saved: string | null } | null>(null);
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { getOperators().then(setOperators); }, []);
  const inCharge = operators?.filter((o) => o.inCharge) ?? [];

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { signature: saved } = await verifyOperator(name, pin, true);
      setVerified({ saved });
      setSignature(saved ?? "");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not check your PIN."); }
    setBusy(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!signature) { setError("Please sign."); return; }
    setBusy(true);
    setError(null);
    try { await signOffLog(log.id, name, pin, signature); onDone(); }
    catch (err) { setError(err instanceof Error ? err.message : "Sign-off failed."); setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal modal-sm" onClick={(e) => e.stopPropagation()} onSubmit={verified ? submit : check}>
        <div className="modal-header">
          <span className="modal-title">Shift in-charge sign-off</span>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body edit-form">
          <p className="editor-hint">Inspection {log.date} · {log.time} by {log.operatorName}</p>
          {operators && inCharge.length === 0 ? (
            <p className="form-error">No shift in-charge is set up yet. An admin can add them under Setup → Operators.</p>
          ) : verified ? (
            <>
              <p className="editor-hint" style={{ margin: 0 }}>Signing as <strong>{name}</strong></p>
              <SignatureChoice saved={verified.saved} onChange={setSignature} canSave={false} onSaveChange={() => {}} />
              {error && <p className="form-error">{error}</p>}
              <button className="btn-submit" disabled={busy}>{busy ? "Signing…" : "Sign off"}</button>
            </>
          ) : (
            <>
              <OperatorField label="Shift in-charge" operators={operators ?? []} inChargeOnly name={name} pin={pin} onName={setName} onPin={setPin} />
              {error && <p className="form-error">{error}</p>}
              <button className="btn-submit" disabled={busy || !name || (needsPin(inCharge, name) && pin.length < 4)}>{busy ? "Checking…" : "Continue"}</button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

export function RepairModal({ report, onClose, onDone }: { report: FaultReport; onClose: () => void; onDone: () => void }) {
  const [repair, setRepair] = useState<FaultRepair>(() => ({ ...report.repair }));
  const [acceptance, setAcceptance] = useState<FaultAcceptance>(() => ({ ...report.acceptance }));
  const [operators, setOperators] = useState<Operator[]>([]);
  const [recordedBy, setRecordedBy] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { getOperators().then(setOperators); }, []);

  const r = (patch: Partial<FaultRepair>) => setRepair((v) => ({ ...v, ...patch }));
  const a = (patch: Partial<FaultAcceptance>) => setAcceptance((v) => ({ ...v, ...patch }));
  const signed = { ...report.repair, ...report.acceptance };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try { await updateRepair(report.id, recordedBy, pin, repair, acceptance); onDone(); }
    catch (err) { setError(err instanceof Error ? err.message : "Save failed."); setBusy(false); }
  }

  const dateTime = (label: string, date: string | undefined, time: string | undefined, set: (d: string, t: string) => void) => (
    <div className="edit-row">
      <label>{label} date<input type="date" value={toInputDate(date)} onChange={(e) => set(fromInputDate(e.target.value), time ?? "")} /></label>
      <label>Time<input type="time" value={time ?? ""} onChange={(e) => set(date ?? "", e.target.value)} /></label>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-header">
          <span className="modal-title">Repair — {report.reportNumber}</span>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body edit-form">
          <p className="editor-hint">Fill in each step as the work progresses and save. The report closes as Resolved when the maintenance team and ARFF both sign the acceptance test.</p>

          <h4 className="repair-step">1 · Schedule</h4>
          {dateTime("Desired start", repair.desiredStartDate, repair.desiredStartTime, (d, t) => r({ desiredStartDate: d, desiredStartTime: t }))}
          {dateTime("Required end", repair.requiredEndDate, repair.requiredEndTime, (d, t) => r({ requiredEndDate: d, requiredEndTime: t }))}

          <h4 className="repair-step">2 · Repair</h4>
          <NameField label="Repaired by" value={repair.repairedBy ?? ""} onChange={(v) => r({ repairedBy: v })} />
          <SignedOrPad existing={signed.repairedBySignature} onChange={(v) => r({ repairedBySignature: v })} />
          <label>Details of repair works<textarea rows={3} value={repair.details ?? ""} onChange={(e) => r({ details: e.target.value })} /></label>
          <label>Remarks<textarea rows={2} value={repair.remarks ?? ""} onChange={(e) => r({ remarks: e.target.value })} /></label>

          <h4 className="repair-step">3 · Acceptance test</h4>
          {dateTime("Test", acceptance.date, acceptance.time, (d, t) => a({ date: d, time: t }))}
          <label>Comments<textarea rows={2} value={acceptance.comments ?? ""} onChange={(e) => a({ comments: e.target.value })} /></label>
          <NameField label="Maintenance team (HDK)" value={acceptance.maintenanceName ?? ""} onChange={(v) => a({ maintenanceName: v })} />
          <SignedOrPad existing={signed.maintenanceSignature} onChange={(v) => a({ maintenanceSignature: v })} />
          <NameField label="ARFF (name)" value={acceptance.arffName ?? ""} onChange={(v) => a({ arffName: v })} operators={operators} />
          <SignedOrPad existing={signed.arffSignature} onChange={(v) => a({ arffSignature: v })} />

          <h4 className="repair-step">Recorded by</h4>
          <OperatorField label="ARFF operator saving this update" operators={operators} name={recordedBy} pin={pin} onName={setRecordedBy} onPin={setPin} />
          {error && <p className="form-error">{error}</p>}
          <button className="btn-submit" disabled={busy || !recordedBy || (needsPin(operators, recordedBy) && pin.length < 4)}>{busy ? "Saving…" : "Save progress"}</button>
        </div>
      </form>
    </div>
  );
}
