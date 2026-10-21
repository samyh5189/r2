import { useEffect, useState } from "react";
import type { CheckSchedule, GeneralSettings } from "../types";
import { getGeneralSettings, saveGeneralSettings } from "../storage";
import { applyGeneral } from "../settings";
import { DEFAULT_SCHEDULE, WEEKDAYS, dayLabel, firstDue } from "../checkKinds";
import { toast } from "../dialogs";

const TARGETS = [
  { key: "grounding", label: "Immediate grounding", def: 1 },
  { key: "urgent", label: "Urgent", def: 3 },
  { key: "routine", label: "Routine", def: 14 },
] as const;

const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString("en-GB", { month: "long" }));
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

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

  const sched = { ...DEFAULT_SCHEDULE, ...s.schedule };
  const setSched = (patch: CheckSchedule) => update({ schedule: { ...sched, ...patch } });
  // Start dates: DD/MM/YYYY stored, YYYY-MM-DD in the date field
  const toIso = (gb?: string) => (gb ? gb.split("/").reverse().join("-") : "");
  const setFrom = (kind: "weekly" | "monthly" | "yearly", iso: string) =>
    setSched({ startFrom: { ...sched.startFrom, [kind]: iso ? iso.split("-").reverse().join("/") : undefined } });
  const startField = (kind: "weekly" | "monthly" | "yearly") => {
    const first = firstDue(kind, sched); // under the edited, unsaved schedule
    return (
      <div className="start-from">
        <small>Starts from</small>
        <input type="date" value={toIso(sched.startFrom?.[kind])} onChange={(e) => setFrom(kind, e.target.value)} aria-label={`${kind} checks start from`} />
        <small className="start-first">{first ? `First due ${dayLabel(first)}` : "Due from now"}</small>
      </div>
    );
  };

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

      <h4 className="setup-sub">Check schedule</h4>
      <p className="editor-hint" style={{ margin: "0 0 8px" }}>Each check appears on the Checklist on its day and stays there until someone does it. Once done, it's hidden until the next one is due. Leave "Starts from" empty for a check that's due now.</p>
      <div className="target-grid">
        <label className="target-field">
          <span>Weekly, every</span>
          <select value={sched.weeklyDay} onChange={(e) => setSched({ weeklyDay: Number(e.target.value) })}>
            {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
          {startField("weekly")}
        </label>
        <label className="target-field">
          <span>Monthly, on the</span>
          <select value={sched.monthlyDay} onChange={(e) => setSched({ monthlyDay: Number(e.target.value) })}>
            {DAYS.map((d) => <option key={d} value={d}>{d === 31 ? "Last day" : ordinal(d)}{d > 28 && d < 31 ? " (or last day)" : ""}</option>)}
          </select>
          {startField("monthly")}
        </label>
        <label className="target-field">
          <span>Yearly, on</span>
          <div>
            <select value={Math.min(sched.yearlyDay, new Date(2001, sched.yearlyMonth, 0).getDate())} onChange={(e) => setSched({ yearlyDay: Number(e.target.value) })} aria-label="Day">
              {DAYS.slice(0, new Date(2001, sched.yearlyMonth, 0).getDate()).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={sched.yearlyMonth} onChange={(e) => setSched({ yearlyMonth: Number(e.target.value) })} aria-label="Month">
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          {startField("yearly")}
        </label>
      </div>

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
