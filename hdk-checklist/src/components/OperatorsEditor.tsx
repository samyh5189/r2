import { useEffect, useState } from "react";
import type { Operator } from "../types";
import { getOperatorEmails, getOperators, saveOperators } from "../storage";
import { toast } from "../dialogs";

export default function OperatorsEditor({ onAuthLost }: { onAuthLost: () => void }) {
  const [ops, setOps] = useState<Operator[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Addresses are admin-only; without them (offline) the saved ones are kept
  useEffect(() => {
    Promise.all([getOperators(), getOperatorEmails().catch(() => null)])
      .then(([list, emails]) => setOps(emails ? list.map((o) => ({ ...o, email: emails[o.id] ?? "" })) : list));
  }, []);
  if (!ops) return null;

  function update(next: Operator[]) {
    setOps(next);
    setDirty(true);
   
  }

  const badPin = ops.some((o) => o.pin && !/^\d{4,8}$/.test(o.pin));
  const badEmail = ops.some((o) => o.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email.trim()));
  const noPin = ops.filter((o) => o.name.trim() && !o.pin && (!o.hasPin || o.clearPin)).length;
  const set = (i: number, patch: Partial<Operator>) => update(ops.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function save() {
    const cleaned = ops!.map((o) => ({ ...o, name: o.name.trim(), rank: o.rank?.trim() || undefined, email: o.email?.trim() })).filter((o) => o.name);
    setSaving(true);
    try {
      await saveOperators(cleaned);
      // Show the saved state: new PINs become "PIN set", cleared ones go
      setOps(cleaned.map(({ pin, clearPin, clearSignature, ...o }) => ({
        ...o, hasPin: pin ? true : clearPin ? false : o.hasPin, hasSignature: clearSignature ? false : o.hasSignature,
      })));
      setDirty(false);
      toast("Operators saved.");
    } catch (e) {
      const text = e instanceof Error ? e.message : "Save failed.";
      if (/signed in|expired/i.test(text)) onAuthLost();
      toast(text, "error");
    }
    setSaving(false);
  }

  return (
    <div className="editor-section ops-editor">
      <div className="editor-bar" style={{ padding: "10px 12px", margin: 0 }}>
        <div>
          <strong>People</strong>
          <span className="editor-sub">Only these people can use the app, each with their own 4–8 digit PIN. ARFF operators do the checks and report faults; shift in-charge also sign off inspections. Maintenance officers record repairs and sign the maintenance part of the acceptance test.</span>
        </div>
        <button className="btn-export" onClick={save} disabled={saving || !dirty || badPin || badEmail}>{saving ? "Saving…" : "Save"}</button>
      </div>
      {badPin && <p className="form-error" style={{ padding: "0 12px" }}>PINs are 4 to 8 digits.</p>}
      {badEmail && <p className="form-error" style={{ padding: "0 12px" }}>Check the email addresses.</p>}
      {ops.length > 0 && noPin > 0 && <p className="editor-hint" style={{ padding: "0 12px", margin: "6px 0 0" }}>⚠ {noPin} operator{noPin === 1 ? " has" : "s have"} no PIN and can submit without one.</p>}
      <div className="editor-items">
        {ops.length === 0 && <p className="editor-hint" style={{ margin: 0 }}>No operators yet — operators type their name freely until you add some.</p>}
        {ops.map((o, i) => (
          <div key={o.id} className="ops-item">
            <div className="editor-item-row ops-row">
              <input className="editor-label" style={{ flex: 2, minWidth: 0 }} placeholder="Full name" value={o.name} onChange={(e) => set(i, { name: e.target.value })} />
              <input className="editor-label" style={{ flex: 1, minWidth: 0 }} placeholder="Rank (e.g. LFM)" value={o.rank ?? ""} onChange={(e) => set(i, { rank: e.target.value })} />
              <button className="icon-btn danger" title="Remove" onClick={() => update(ops.filter((_, j) => j !== i))}>×</button>
            </div>
            {o.email !== undefined && (
              <div className="editor-item-row ops-row">
                <input className="editor-label" style={{ flex: 1, minWidth: 0 }} type="email" inputMode="email" autoComplete="off" placeholder="Email (for fault report updates they follow)"
                  value={o.email} onChange={(e) => set(i, { email: e.target.value })} />
              </div>
            )}
            <div className="editor-item-row ops-row">
              <select className="ops-role" value={o.role ?? "arff"} onChange={(e) => set(i, e.target.value === "maintenance" ? { role: "maintenance", inCharge: false } : { role: undefined })}>
                <option value="arff">ARFF operator</option>
                <option value="maintenance">Maintenance officer</option>
              </select>
              {o.role !== "maintenance" && <label className="ops-check"><input type="checkbox" checked={o.inCharge} onChange={(e) => set(i, { inCharge: e.target.checked })} /> Shift in-charge</label>}
            </div>
            <div className="editor-item-row ops-row">
              <input className="editor-num pin-input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={8}
                placeholder={o.hasPin && !o.clearPin ? "PIN set ✓" : "Set PIN"} value={o.pin ?? ""}
                onChange={(e) => set(i, { pin: e.target.value.replace(/\D/g, "") || undefined, clearPin: false })} />
              {o.hasPin && !o.clearPin && !o.pin && <button className="btn-small" onClick={() => set(i, { clearPin: true })}>Remove PIN</button>}
              {o.hasSignature && !o.clearSignature && <button className="btn-small" onClick={() => set(i, { clearSignature: true })}>Clear saved signature</button>}
              {(o.clearPin || o.clearSignature) && <span className="editor-sub">Removed on save</span>}
            </div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <button className="btn-new" onClick={() => update([...ops, { id: crypto.randomUUID(), name: "", inCharge: false, email: "" }])}>+ Add ARFF operator</button>
          <button className="btn-new" onClick={() => update([...ops, { id: crypto.randomUUID(), name: "", inCharge: false, role: "maintenance", email: "" }])}>+ Add maintenance officer</button>
        </div>
      </div>
    </div>
  );
}
