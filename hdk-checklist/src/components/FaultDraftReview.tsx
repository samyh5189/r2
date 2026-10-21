import type { FaultReport } from "../types";

interface Props {
  draft: FaultReport;
  onChange: (draft: FaultReport) => void;
  /** What the operator actually recorded, shown for comparison */
  operatorWords: string[];
  busy: boolean;
  saveLabel: string;
  onBack: () => void;
  onSave: () => void;
  error?: string | null;
}

/** The AI-written fault report, for the operator to check and correct before it's saved */
export default function FaultDraftReview({ draft, onChange, operatorWords, busy, saveLabel, onBack, onSave, error }: Props) {
  const edit = (patch: Partial<FaultReport>) => onChange({ ...draft, ...patch });
  return (
    <div className="edit-form">
      <p className="editor-hint">AI has written up the fault report. Check it against what you found, change anything that's wrong, then save.</p>
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
      <div className="editor-hint" style={{ margin: 0 }}>
        <strong>What was recorded:</strong>
        {operatorWords.map((w, i) => <div key={i}>{w}</div>)}
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="edit-row">
        <button type="button" className="btn-small" onClick={onBack} disabled={busy}>← Back</button>
        <button type="button" className="btn-submit" onClick={onSave} disabled={busy}>{saveLabel}</button>
      </div>
    </div>
  );
}
