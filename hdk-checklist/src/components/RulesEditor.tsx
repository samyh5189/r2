import { useEffect, useState } from "react";
import type { GeneralSettings } from "../types";
import { getGeneralSettings, saveGeneralSettings } from "../storage";
import { applyGeneral } from "../settings";
import { toast } from "../dialogs";

const TARGETS = [
  { key: "grounding", label: "Immediate grounding", def: 1 },
  { key: "urgent", label: "Urgent", def: 3 },
  { key: "routine", label: "Routine", def: 14 },
] as const;

/** Setup → Rules: how strict the checklist is and when a fault counts as overdue */
export default function RulesEditor({ onAuthLost }: { onAuthLost: () => void }) {
  const [s, setS] = useState<GeneralSettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { getGeneralSettings().then(setS); }, []);
  if (!s) return null;

  const update = (patch: Partial<GeneralSettings>) => { setS({ ...s, ...patch }); setDirty(true); };
  const setTarget = (key: "grounding" | "urgent" | "routine", v: string) =>
    update({ targetDays: { ...s.targetDays, [key]: v === "" ? undefined : Math.max(1, Math.min(365, Math.round(Number(v)))) } });

  async function save() {
    setSaving(true);
    try {
      await saveGeneralSettings(s!);
      applyGeneral(s!);
      setDirty(false);
      toast("Rules saved.");
    } catch (e) {
      const text = e instanceof Error ? e.message : "Save failed.";
      if (/signed in|expired/i.test(text)) onAuthLost();
      toast(text, "error");
    }
    setSaving(false);
  }

  return (
    <div className="setup-card">
      <div className="setup-card-head">
        <div>
          <strong>Rules</strong>
          <span className="editor-sub">How strict the checklist is, and when a fault counts as overdue.</span>
        </div>
        <button className="btn-export" onClick={save} disabled={saving || !dirty}>{saving ? "Saving…" : "Save"}</button>
      </div>

      <h4 className="setup-sub">Checklist</h4>
      <label className="switch-row">
        <span><strong>Photo required for U/S</strong><small>An item marked unserviceable can't be confirmed without at least one photo.</small></span>
        <input type="checkbox" className="switch" checked={!!s.requirePhotoUS} onChange={(e) => update({ requirePhotoUS: e.target.checked })} />
      </label>
      <label className="switch-row">
        <span><strong>Allow "Mark remaining OK"</strong><small>Lets the operator mark all unanswered items OK in one go (recorded on the log).</small></span>
        <input type="checkbox" className="switch" checked={s.allowMarkAllOk !== false} onChange={(e) => update({ allowMarkAllOk: e.target.checked })} />
      </label>

      <h4 className="setup-sub">Repair targets</h4>
      <p className="editor-hint" style={{ margin: "0 0 8px" }}>A fault open longer than this is shown as overdue on the home screen, the Faults tab and the monthly summary.</p>
      <div className="target-grid">
        {TARGETS.map((t) => (
          <label key={t.key} className="target-field">
            <span>{t.label}</span>
            <div><input type="number" min={1} max={365} inputMode="numeric" placeholder={String(t.def)} value={s.targetDays?.[t.key] ?? ""} onChange={(e) => setTarget(t.key, e.target.value)} /><em>days</em></div>
          </label>
        ))}
      </div>
    </div>
  );
}
