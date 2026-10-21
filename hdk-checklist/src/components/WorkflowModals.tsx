import { useEffect, useState } from "react";
import type { FaultAcceptance, FaultRepair, FaultReport, InspectionLog, Operator } from "../types";
import { getOperators, signOffLog, updateRepair, verifyOperator } from "../storage";
import SignatureChoice from "./SignatureChoice";
import OperatorField from "./OperatorField";
import { isMaintenance, needsPin } from "../operators";

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
              <OperatorField label="Shift in-charge" operators={operators ?? []} inChargeOnly rememberAs="in-charge" name={name} pin={pin} onName={setName} onPin={setPin} />
              {error && <p className="form-error">{error}</p>}
              <button className="btn-submit" disabled={busy || !name || (needsPin(inCharge, name) && pin.length < 4)}>{busy ? "Checking…" : "Continue"}</button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

/** A signature box: the one already given, or a "Sign" button that opens the pad (saved signature offered) */
function SignSlot({ existing, saved, value, onChange }: { existing?: string; saved: string | null; value?: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  if (existing) return <img src={existing} alt="signature" className="signed-img" />;
  if (!open) return <button type="button" className="sign-btn" onClick={() => setOpen(true)}>✍️ Sign</button>;
  return (
    <div className="sign-open">
      <SignatureChoice saved={saved} onChange={onChange} canSave={false} onSaveChange={() => {}} height={90} />
      <button type="button" className="btn-new" style={{ fontSize: 12 }} onClick={() => { setOpen(false); onChange(""); }}>{value ? "Remove signature" : "Cancel"}</button>
    </div>
  );
}

/**
 * Repair progress, following the fault report template: the action taken and recommendation (printed
 * in the report's ACTION TAKEN / RECOMMENDATION table), then the acceptance test that closes it.
 * The person recording it identifies first (name + PIN). Maintenance officers record the action and
 * the maintenance half of the acceptance test; ARFF operators sign the ARFF half. Until any
 * maintenance officer is listed, an ARFF operator can fill in everything.
 */
export function RepairModal({ report, onClose, onDone }: { report: FaultReport; onClose: () => void; onDone: () => void }) {
  const [repair, setRepair] = useState<FaultRepair>(() => ({ ...report.repair }));
  const [acceptance, setAcceptance] = useState<FaultAcceptance>(() => ({ ...report.acceptance }));
  const [operators, setOperators] = useState<Operator[]>([]);
  const [recordedBy, setRecordedBy] = useState("");
  const [pin, setPin] = useState("");
  const [verified, setVerified] = useState<{ saved: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { getOperators().then(setOperators); }, []);

  const r = (patch: Partial<FaultRepair>) => setRepair((v) => ({ ...v, ...patch }));
  const a = (patch: Partial<FaultAcceptance>) => setAcceptance((v) => ({ ...v, ...patch }));
  const signed = { ...report.repair, ...report.acceptance };
  const me = operators.find((o) => o.name === recordedBy);
  const split = operators.some(isMaintenance);
  const canRepair = !split || isMaintenance(me);
  const canArff = !split || !isMaintenance(me);

  async function identify(e: React.FormEvent) {
    e.preventDefault();
    if (!recordedBy.trim()) { setError("Choose your name."); return; }
    setBusy(true);
    setError(null);
    try {
      const { signature } = operators.length ? await verifyOperator(recordedBy, pin) : { signature: null };
      setVerified({ saved: signature });
      // Prefill the names this person is filling in
      if (isMaintenance(me)) {
        if (!repair.repairedBy) r({ repairedBy: recordedBy });
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Could not check your PIN."); }
    setBusy(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try { await updateRepair(report.id, recordedBy, pin, repair, acceptance); onDone(); }
    catch (err) { setError(err instanceof Error ? err.message : "Save failed."); setBusy(false); }
  }

  const dateTime = (label: string, date: string | undefined, time: string | undefined, set: (d: string, t: string) => void, disabled = false) => (
    <div className="edit-row">
      <label>{label} date<input type="date" disabled={disabled} value={toInputDate(date)} onChange={(e) => set(fromInputDate(e.target.value), time ?? "")} /></label>
      <label>Time<input type="time" disabled={disabled} value={time ?? ""} onChange={(e) => set(date ?? "", e.target.value)} /></label>
    </div>
  );
  const readOnly = (label: string, value?: string) => (
    <div className="ro-field"><span>{label}</span><strong>{value || "—"}</strong></div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={verified ? submit : identify}>
        <div className="modal-header">
          <span className="modal-title">Repair — {report.reportNumber}</span>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        {!verified ? (
          <div className="modal-body edit-form">
            <p className="editor-hint">
              {split
                ? "Maintenance officers record the action taken and sign for maintenance. ARFF operators sign the acceptance test for ARFF."
                : "Record the action taken as the work goes. The report closes when maintenance and ARFF both sign the acceptance test."}
            </p>
            <OperatorField label="Who is recording this?" operators={operators} withMaintenance rememberAs="repair"
              name={recordedBy} pin={pin} onName={(n) => { setRecordedBy(n); setError(null); }} onPin={setPin} />
            {error && <p className="form-error">{error}</p>}
            <button className="btn-submit" disabled={busy || !recordedBy.trim() || (needsPin(operators, recordedBy) && pin.length < 4)}>{busy ? "Checking…" : "Continue"}</button>
          </div>
        ) : (
          <div className="modal-body edit-form">
            <p className="editor-hint" style={{ margin: 0 }}>Recording as <strong>{recordedBy}</strong>{split && (isMaintenance(me) ? " · Maintenance" : " · ARFF")}</p>

            <h4 className="repair-step">1 · Action taken</h4>
            {canRepair ? (
              <>
                <label>Action taken<textarea rows={3} value={repair.details ?? ""} onChange={(e) => r({ details: e.target.value })} placeholder="What was done to fix it" /></label>
                <label>Recommendation<textarea rows={2} value={repair.remarks ?? ""} onChange={(e) => r({ remarks: e.target.value })} placeholder="Further work or follow-up, if any" /></label>
                <NameField label="Repaired by" value={repair.repairedBy ?? ""} onChange={(v) => r({ repairedBy: v })} />
                <SignSlot existing={signed.repairedBySignature} saved={verified.saved} value={repair.repairedBySignature} onChange={(v) => r({ repairedBySignature: v })} />
                <p className="editor-hint" style={{ margin: 0 }}>Shown on the fault report under ACTION TAKEN / RECOMMENDATION.</p>
              </>
            ) : (
              <>
                {readOnly("Action taken", repair.details)}
                {repair.remarks && readOnly("Recommendation", repair.remarks)}
                {readOnly("Repaired by", repair.repairedBy)}
              </>
            )}

            <h4 className="repair-step">2 · Acceptance test</h4>
            {dateTime("Test", acceptance.date, acceptance.time, (d, t) => a({ date: d, time: t }))}
            <label>Comments<textarea rows={2} value={acceptance.comments ?? ""} onChange={(e) => a({ comments: e.target.value })} /></label>
            <div className="sign-pair">
              <div>
                <span className="sign-label">Maintenance (HDK){signed.maintenanceName ? ` · ${signed.maintenanceName}` : ""}</span>
                {canRepair
                  ? <SignSlot existing={signed.maintenanceSignature} saved={verified.saved} value={acceptance.maintenanceSignature} onChange={(v) => a({ maintenanceSignature: v, maintenanceName: v ? (acceptance.maintenanceName || recordedBy) : acceptance.maintenanceName })} />
                  : signed.maintenanceSignature ? <img src={signed.maintenanceSignature} alt="signature" className="signed-img" /> : <p className="editor-hint" style={{ margin: 0 }}>Not signed yet</p>}
              </div>
              <div>
                <span className="sign-label">ARFF{signed.arffName ? ` · ${signed.arffName}` : ""}</span>
                {canArff
                  ? <SignSlot existing={signed.arffSignature} saved={verified.saved} value={acceptance.arffSignature} onChange={(v) => a({ arffSignature: v, arffName: v ? (acceptance.arffName || recordedBy) : acceptance.arffName })} />
                  : signed.arffSignature ? <img src={signed.arffSignature} alt="signature" className="signed-img" /> : <p className="editor-hint" style={{ margin: 0 }}>Not signed yet</p>}
              </div>
            </div>
            {!split && (
              <>
                <NameField label="Maintenance team name (HDK)" value={acceptance.maintenanceName ?? ""} onChange={(v) => a({ maintenanceName: v })} />
                <NameField label="ARFF name" value={acceptance.arffName ?? ""} onChange={(v) => a({ arffName: v })} operators={operators.filter((o) => !isMaintenance(o))} />
              </>
            )}

            {error && <p className="form-error">{error}</p>}
            <button className="btn-submit" disabled={busy}>{busy ? "Saving…" : "Save progress"}</button>
          </div>
        )}
      </form>
    </div>
  );
}
