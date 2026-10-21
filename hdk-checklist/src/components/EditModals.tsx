import { useState } from "react";
import type { InspectionLog, FaultReport, ItemStatus } from "../types";
import { itemType } from "../checklistData";
import EvidenceEditor from "./EvidenceEditor";
import { DEFAULT_RECOMMENDATION, LOCATION, defaultActionTaken } from "../faultReportPdf";

interface ModalProps<T> {
  item: T;
  onClose: () => void;
  onSave: (item: T) => Promise<void>;
}

function useSave<T>(onSave: (item: T) => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(item: T) {
    setBusy(true);
    setError(null);
    try { await onSave(item); }
    catch (e) { setError(e instanceof Error ? e.message : "Save failed."); setBusy(false); }
  }
  return { busy, error, save };
}

const STATUSES: ItemStatus[] = ["OK", "NOK", "U/S", "NA", ""];

export function EditLogModal({ item, onClose, onSave }: ModalProps<InspectionLog>) {
  const [log, setLog] = useState<InspectionLog>(() => structuredClone(item));
  const { busy, error, save } = useSave(onSave);

  function setItem(secId: string, itemId: string, patch: { status?: ItemStatus; remarks?: string }) {
    setLog((l) => ({
      ...l,
      sections: l.sections.map((s) => s.id !== secId ? s : { ...s, items: s.items.map((it) => it.id !== itemId ? it : { ...it, ...patch }) }),
    }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const faultCount = log.sections.reduce((a, s) => a + s.items.filter((it) => it.status === "NOK" || it.status === "U/S").length, 0);
    save({ ...log, faultCount });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-header">
          <span className="modal-title">Edit log — {item.date}</span>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body edit-form">
          <div className="edit-row">
            <label>Date (DD/MM/YYYY)<input value={log.date} pattern="\d{2}/\d{2}/\d{4}" onChange={(e) => setLog({ ...log, date: e.target.value })} required /></label>
            <label>Time<input value={log.time} pattern="\d{2}:\d{2}" onChange={(e) => setLog({ ...log, time: e.target.value })} required /></label>
          </div>
          <label>Operator<input value={log.operatorName} onChange={(e) => setLog({ ...log, operatorName: e.target.value })} required /></label>
          <label>Condition
            <select value={log.overallCondition} onChange={(e) => setLog({ ...log, overallCondition: e.target.value as InspectionLog["overallCondition"] })}>
              <option>Excellent</option><option>Good</option><option>Poor</option>
            </select>
          </label>
          <label>Comments<textarea rows={2} value={log.comments} onChange={(e) => setLog({ ...log, comments: e.target.value })} /></label>

          {log.sections.map((sec) => (
            <div key={sec.id} className="edit-items">
              <h4>{sec.title}</h4>
              {sec.items.map((it) => (
                <div key={it.id} className="edit-item">
                  <span>{it.label}</span>
                  {itemType(it) === "status" ? (
                    <select value={it.status} onChange={(e) => setItem(sec.id, it.id, { status: e.target.value as ItemStatus })}>
                      {STATUSES.map((s) => <option key={s} value={s}>{s || "—"}</option>)}
                    </select>
                  ) : (
                    <input className="edit-value" value={it.remarks} placeholder={it.unit ?? ""} onChange={(e) => setItem(sec.id, it.id, { remarks: e.target.value })} />
                  )}
                </div>
              ))}
            </div>
          ))}

          {error && <p className="form-error">{error}</p>}
          <button className="btn-submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </div>
  );
}

export function EditFaultModal({ item, onClose, onSave }: ModalProps<FaultReport>) {
  // Template fields an older report doesn't have start from what its PDF prints
  const [r, setR] = useState<FaultReport>(() => {
    const c = structuredClone(item);
    return {
      ...c,
      location: c.location ?? LOCATION,
      actionTaken: c.actionTaken ?? defaultActionTaken(c.priority),
      recommendation: c.recommendation ?? DEFAULT_RECOMMENDATION,
    };
  });
  const set = (patch: Partial<FaultReport>) => setR((cur) => ({ ...cur, ...patch }));
  const actions = (r.updates ?? []).filter((u) => u.kind === "action");
  const { busy, error, save } = useSave(onSave);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); save(r); }}>
        <div className="modal-header">
          <span className="modal-title">Edit {item.reportNumber}</span>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body edit-form">
          <label>Report number<input value={r.reportNumber} onChange={(e) => setR({ ...r, reportNumber: e.target.value })} required /></label>
          <div className="edit-row">
            <label>Date (DD/MM/YYYY)<input value={r.date} pattern="\d{2}/\d{2}/\d{4}" onChange={(e) => setR({ ...r, date: e.target.value })} required /></label>
            <label>Time<input value={r.time} pattern="\d{2}:\d{2}" onChange={(e) => setR({ ...r, time: e.target.value })} required /></label>
          </div>
          <label>Fault<input value={r.vehicleEquipmentLine} onChange={(e) => set({ vehicleEquipmentLine: e.target.value })} /></label>
          <label>Location<input value={r.location ?? ""} onChange={(e) => set({ location: e.target.value })} /></label>
          <div className="edit-row">
            <label>Reported by<input value={r.operatorName} onChange={(e) => set({ operatorName: e.target.value })} required /></label>
            <label>Designation<input value={r.reporterDesignation ?? ""} placeholder="From Setup → People" onChange={(e) => set({ reporterDesignation: e.target.value || undefined })} /></label>
          </div>
          <div className="edit-row">
            <label>Equipment name<input value={r.vehicle} onChange={(e) => set({ vehicle: e.target.value })} /></label>
            <label>Asset No.<input value={r.fleetNumber} onChange={(e) => set({ fleetNumber: e.target.value })} /></label>
          </div>
          <label>Brief description of fault<textarea rows={4} value={r.detailsOfDefects} onChange={(e) => set({ detailsOfDefects: e.target.value })} /></label>
          <label>Action taken<textarea rows={2} value={r.actionTaken ?? ""} onChange={(e) => set({ actionTaken: e.target.value })} /></label>
          <label>Recommendation<textarea rows={2} value={r.recommendation ?? ""} onChange={(e) => set({ recommendation: e.target.value })} /></label>
          <label>Summary (internal)<textarea rows={2} value={r.faultSummary} onChange={(e) => set({ faultSummary: e.target.value })} /></label>
          {actions.map((u, i) => (
            <div key={u.id} className="edit-items">
              <h4>Update {i + 1} · {u.by} · {new Date(u.at).toLocaleDateString("en-GB")}</h4>
              <label>Action taken<textarea rows={2} value={u.text ?? ""} onChange={(e) => setR((cur) => ({ ...cur, updates: cur.updates?.map((x) => (x.id === u.id ? { ...x, text: e.target.value } : x)) }))} /></label>
              <label>Recommendation<textarea rows={2} value={u.recommendation ?? ""} onChange={(e) => setR((cur) => ({ ...cur, updates: cur.updates?.map((x) => (x.id === u.id ? { ...x, recommendation: e.target.value } : x)) }))} /></label>
            </div>
          ))}
          {r.faults.map((f, i) => (
            <div key={f.itemId} className="edit-items">
              <h4>{f.label} · {f.status}</h4>
              <label>Operator note<textarea rows={2} value={f.remarks} onChange={(e) => setR((cur) => ({ ...cur, faults: cur.faults.map((x, j) => (j === i ? { ...x, remarks: e.target.value } : x)) }))} /></label>
              <label>Suggested action<input value={f.recommendedAction} onChange={(e) => setR((cur) => ({ ...cur, faults: cur.faults.map((x, j) => (j === i ? { ...x, recommendedAction: e.target.value } : x)) }))} /></label>
              <EvidenceEditor
                evidence={f.evidence ?? []}
                onChange={(evidence) => setR((cur) => ({ ...cur, faults: cur.faults.map((x, j) => (j === i ? { ...x, evidence } : x)) }))}
              />
            </div>
          ))}
          <div className="edit-row">
            <label>Priority
              <select value={r.priority} onChange={(e) => setR({ ...r, priority: e.target.value as FaultReport["priority"] })}>
                <option>Routine</option><option>Urgent</option><option>Immediate Grounding</option>
              </select>
            </label>
            <label>Status
              <select value={r.status} onChange={(e) => setR({ ...r, status: e.target.value as FaultReport["status"] })}>
                <option>Open</option><option>In Progress</option><option>Resolved</option>
              </select>
            </label>
          </div>
          {error && <p className="form-error">{error}</p>}
          <button className="btn-submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </div>
  );
}
