import { useEffect, useState } from "react";
import type { FaultReport } from "../types";
import { describeEmail, emailPdf, getEmailSettings, saveEmailSettings, type EmailSettings } from "../storage";
import { toast } from "../dialogs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mail server presets; "Custom" leaves the fields as they are
const PRESETS: Record<string, { host: string; port: number; security: EmailSettings["security"]; help: string }> = {
  Gmail: { host: "smtp.gmail.com", port: 465, security: "ssl", help: "Use the Gmail address as the username and an app password (myaccount.google.com/apppasswords — needs 2-Step Verification), not the normal password." },
  "Outlook / Microsoft 365": { host: "smtp.office365.com", port: 587, security: "starttls", help: "Use the full email address and its password. The account's admin may need to allow SMTP sending (Authenticated SMTP)." },
};

const splitEmails = (text: string) => text.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);

/** Setup → Email: mail server, sender, recipients and when to send */
export default function EmailSettingsEditor({ onAuthLost }: { onAuthLost: () => void }) {
  const [s, setS] = useState<EmailSettings | null>(null);
  const [toText, setToText] = useState("");
  const [ccText, setCcText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  function load() {
    getEmailSettings()
      .then(({ settings, problem }) => {
        setS(settings);
        setToText(settings.to.join("\n"));
        setCcText(settings.cc.join("\n"));
        setProblem(problem);
        setDirty(false);
      })
      .catch((e) => setLoadError(e.message));
  }
  useEffect(load, []);
  if (!s) return loadError ? <p className="form-error">{loadError}</p> : null;

  const update = (patch: Partial<EmailSettings>) => { setS({ ...s, ...patch }); setDirty(true); };
  const to = splitEmails(toText), cc = splitEmails(ccText);
  const invalid = [...to, ...cc, s.fromAddress, s.replyTo].filter((e) => e && !EMAIL_RE.test(e));
  const preset = Object.entries(PRESETS).find(([, p]) => p.host === s.host)?.[0] ?? "Custom";

  async function save() {
    setBusy(true);
    try {
      await saveEmailSettings({ ...s!, to, cc });
      toast("Email settings saved.");
      load();
    } catch (e) {
      const text = e instanceof Error ? e.message : "Save failed.";
      if (/signed in|expired/i.test(text)) onAuthLost();
      toast(text, "error");
    }
    setBusy(false);
  }

  async function test() {
    setBusy(true);
    toast("Sending test email…");
    const r = await emailPdf("Test email", "This is a test from the HDK ARFF inspection app. New fault reports will arrive like this, with the PDF attached.");
    toast(describeEmail(r), "sent" in r ? (r.skipped ? "info" : "success") : "error");
    setBusy(false);
  }

  return (
    <div className="editor-section ops-editor">
      <div className="editor-bar" style={{ padding: "10px 12px", margin: 0 }}>
        <div>
          <strong>Email</strong>
          <span className="editor-sub">Fault reports and monthly summaries are emailed with the PDF attached.</span>
        </div>
        <button className="btn-export" onClick={save} disabled={busy || !dirty || invalid.length > 0}>Save</button>
      </div>
      {problem && <p className="form-error" style={{ padding: "0 12px" }}>{problem}</p>}

      <div className="editor-items edit-form">
        <h4 className="repair-step">Mail server</h4>
        <label>Provider
          <select value={preset} onChange={(e) => { const p = PRESETS[e.target.value]; if (p) update({ host: p.host, port: p.port, security: p.security }); }}>
            {[...Object.keys(PRESETS), "Custom"].map((k) => <option key={k}>{k}</option>)}
          </select>
        </label>
        {PRESETS[preset] && <p className="editor-hint" style={{ margin: 0 }}>{PRESETS[preset].help}</p>}
        <div className="edit-row">
          <label style={{ flex: 2 }}>SMTP server<input value={s.host} placeholder="smtp.example.com" onChange={(e) => update({ host: e.target.value })} /></label>
          <label>Port<input type="number" value={s.port} onChange={(e) => update({ port: Number(e.target.value) })} /></label>
        </div>
        <label>Security
          <select value={s.security} onChange={(e) => update({ security: e.target.value as EmailSettings["security"] })}>
            <option value="ssl">SSL/TLS (usually port 465)</option>
            <option value="starttls">STARTTLS (usually port 587)</option>
            <option value="none">None (not recommended)</option>
          </select>
        </label>
        <label>Username<input value={s.user} autoComplete="off" placeholder="name@gmail.com" onChange={(e) => update({ user: e.target.value })} /></label>
        <label>Password
          <input type="password" autoComplete="new-password" value={s.pass ?? ""}
            placeholder={s.hasPassword ? (s.passwordFromEnv ? "Set on the server — type to replace" : "Saved — leave blank to keep") : "App password"}
            onChange={(e) => update({ pass: e.target.value, clearPassword: false })} />
        </label>
        {s.hasPassword && !s.passwordFromEnv && (
          <button type="button" className="btn-small" style={{ alignSelf: "flex-start" }} onClick={() => update({ pass: "", clearPassword: true, hasPassword: false })}>Remove saved password</button>
        )}

        <h4 className="repair-step">Sender</h4>
        <div className="edit-row">
          <label>From name<input value={s.fromName} onChange={(e) => update({ fromName: e.target.value })} /></label>
          <label>From address<input value={s.fromAddress} placeholder="defaults to the username" onChange={(e) => update({ fromAddress: e.target.value })} /></label>
        </div>
        <p className="editor-hint" style={{ margin: 0 }}>Gmail and Outlook only send from the account itself (or an alias set up there).</p>
        <label>Reply-to (optional)<input value={s.replyTo} placeholder="where replies should go" onChange={(e) => update({ replyTo: e.target.value })} /></label>

        <h4 className="repair-step">Recipients</h4>
        <label>To (one per line)<textarea rows={3} value={toText} placeholder="chief@example.com" onChange={(e) => { setToText(e.target.value); setDirty(true); }} /></label>
        <label>CC (optional)<textarea rows={2} value={ccText} onChange={(e) => { setCcText(e.target.value); setDirty(true); }} /></label>

        <h4 className="repair-step">What to send</h4>
        <label className="ops-check" style={{ flexDirection: "row", alignItems: "center", textTransform: "none", fontSize: 13, color: "var(--text)" }}>
          <input type="checkbox" checked={s.faultEmails} onChange={(e) => update({ faultEmails: e.target.checked })} /> Email each new fault report
        </label>
        <label>Only for priority
          <select value={s.minPriority} disabled={!s.faultEmails} onChange={(e) => update({ minPriority: e.target.value as FaultReport["priority"] })}>
            <option value="Routine">All faults</option>
            <option value="Urgent">Urgent and Immediate Grounding</option>
            <option value="Immediate Grounding">Immediate Grounding only</option>
          </select>
        </label>
        <label>Subject prefix (optional)<input value={s.subjectPrefix} placeholder="e.g. [HDK ARFF]" onChange={(e) => update({ subjectPrefix: e.target.value })} /></label>
        <label>Footer (optional)<textarea rows={2} value={s.footer} placeholder="e.g. ARFF Section, Kulhudhuffushi Airport — do not reply" onChange={(e) => update({ footer: e.target.value })} /></label>

        {invalid.length > 0 && <p className="form-error" style={{ margin: 0 }}>Not a valid address: {invalid.join(", ")}</p>}
        <button type="button" className="btn-small" onClick={test} disabled={busy || dirty}>{dirty ? "Save first, then send a test" : "Send test email"}</button>
      </div>
    </div>
  );
}
