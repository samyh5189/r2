import { useEffect, useState } from "react";
import type { Operator } from "../types";
import { getOperators, saveOperators } from "../storage";

export default function OperatorsEditor({ onAuthLost }: { onAuthLost: () => void }) {
  const [ops, setOps] = useState<Operator[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { getOperators().then(setOps); }, []);
  if (!ops) return null;

  function update(next: Operator[]) {
    setOps(next);
    setDirty(true);
    setMessage(null);
  }

  async function save() {
    const cleaned = ops!.map((o) => ({ ...o, name: o.name.trim(), rank: o.rank?.trim() || undefined })).filter((o) => o.name);
    setSaving(true);
    try {
      await saveOperators(cleaned);
      setOps(cleaned);
      setDirty(false);
      setMessage({ ok: true, text: "Operators saved." });
    } catch (e) {
      const text = e instanceof Error ? e.message : "Save failed.";
      if (/signed in|expired/i.test(text)) onAuthLost();
      setMessage({ ok: false, text });
    }
    setSaving(false);
  }

  return (
    <div className="editor-section ops-editor">
      <div className="editor-bar" style={{ padding: "10px 12px", margin: 0 }}>
        <div>
          <strong>Operators</strong>
          <span className="editor-sub">Names offered on the checklist. Shift in-charge can sign off inspections.</span>
        </div>
        <button className="btn-export" onClick={save} disabled={saving || !dirty}>{saving ? "Saving…" : "Save"}</button>
      </div>
      {message && <p className={message.ok ? "editor-ok" : "form-error"} style={{ padding: "0 12px" }}>{message.text}</p>}
      <div className="editor-items">
        {ops.length === 0 && <p className="editor-hint" style={{ margin: 0 }}>No operators yet — operators type their name freely until you add some.</p>}
        {ops.map((o, i) => (
          <div key={o.id} className="editor-item-row ops-row">
            <input className="editor-label" style={{ flex: 2, minWidth: 0 }} placeholder="Full name" value={o.name} onChange={(e) => update(ops.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <input className="editor-label" style={{ flex: 1, minWidth: 0 }} placeholder="Rank (e.g. LFM)" value={o.rank ?? ""} onChange={(e) => update(ops.map((x, j) => (j === i ? { ...x, rank: e.target.value } : x)))} />
            <label className="ops-check"><input type="checkbox" checked={o.inCharge} onChange={(e) => update(ops.map((x, j) => (j === i ? { ...x, inCharge: e.target.checked } : x)))} /> In-charge</label>
            <button className="icon-btn danger" title="Remove" onClick={() => update(ops.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button className="btn-new" onClick={() => update([...ops, { id: crypto.randomUUID(), name: "", inCharge: false }])}>+ Add operator</button>
      </div>
    </div>
  );
}
