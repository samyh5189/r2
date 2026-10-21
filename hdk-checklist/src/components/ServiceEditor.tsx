import { useEffect, useState } from "react";
import type { ServiceSettings } from "../types";
import { getLogs, getServiceSettings, saveServiceSettings } from "../storage";
import { engineReadings } from "../service";

const toInputDate = (gb?: string) => (gb ? gb.split("/").reverse().join("-") : "");
const fromInputDate = (iso: string) => (iso ? iso.split("-").reverse().join("/") : undefined);
const num = (v: string) => (v === "" ? undefined : Math.max(0, Number(v)));

/** Setup: engine service interval and the last service done */
export default function ServiceEditor({ onAuthLost }: { onAuthLost: () => void }) {
  const [s, setS] = useState<ServiceSettings | null>(null);
  const [currentHours, setCurrentHours] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    getServiceSettings().then(setS);
    getLogs().then((logs) => setCurrentHours(engineReadings(logs).pop()?.hours ?? null));
  }, []);
  if (!s) return null;

  const update = (patch: Partial<ServiceSettings>) => { setS({ ...s, ...patch }); setDirty(true); setMessage(null); };

  async function save() {
    setSaving(true);
    try {
      await saveServiceSettings(s!);
      setDirty(false);
      setMessage({ ok: true, text: "Service schedule saved." });
    } catch (e) {
      const text = e instanceof Error ? e.message : "Save failed.";
      if (/signed in|expired/i.test(text)) onAuthLost();
      setMessage({ ok: false, text });
    }
    setSaving(false);
  }

  return (
    <div className="editor-section ops-editor" style={{ marginTop: 16 }}>
      <div className="editor-bar" style={{ padding: "10px 12px", margin: 0 }}>
        <div>
          <strong>Engine service</strong>
          <span className="editor-sub">Due by engine hours or months, whichever comes first.</span>
        </div>
        <button className="btn-export" onClick={save} disabled={saving || !dirty}>{saving ? "Saving…" : "Save"}</button>
      </div>
      {message && <p className={message.ok ? "editor-ok" : "form-error"} style={{ padding: "0 12px" }}>{message.text}</p>}
      <div className="editor-items edit-form">
        <div className="edit-row">
          <label>Every (hours)<input type="number" min={0} value={s.intervalHours ?? ""} placeholder="e.g. 250" onChange={(e) => update({ intervalHours: num(e.target.value) })} /></label>
          <label>Or every (months)<input type="number" min={0} value={s.intervalMonths ?? ""} placeholder="e.g. 6" onChange={(e) => update({ intervalMonths: num(e.target.value) })} /></label>
        </div>
        <div className="edit-row">
          <label>Last service at (hours)<input type="number" min={0} value={s.lastServiceHours ?? ""} onChange={(e) => update({ lastServiceHours: num(e.target.value) })} /></label>
          <label>Last service date<input type="date" value={toInputDate(s.lastServiceDate)} onChange={(e) => update({ lastServiceDate: fromInputDate(e.target.value) })} /></label>
        </div>
        <label>Warn when this many hours are left<input type="number" min={0} value={s.warnHours ?? ""} placeholder="default: 10% of the interval" onChange={(e) => update({ warnHours: num(e.target.value) })} /></label>
        <button type="button" className="btn-small" disabled={currentHours == null} onClick={() => update({
          lastServiceHours: currentHours ?? undefined,
          lastServiceDate: new Date().toLocaleDateString("en-GB"),
        })}>
          🔧 Service done today{currentHours != null ? ` at ${currentHours.toLocaleString()} h` : ""}
        </button>
      </div>
    </div>
  );
}
