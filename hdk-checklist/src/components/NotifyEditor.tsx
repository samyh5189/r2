import { useEffect, useState } from "react";
import { describeEmail, emailPdf, getNotifyEmails, saveNotifyEmails } from "../storage";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Setup: who receives new fault reports and monthly summaries by email */
export default function NotifyEditor({ onAuthLost }: { onAuthLost: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    getNotifyEmails().then((list) => setText(list.join("\n"))).catch((e) => { setText(""); setMessage({ ok: false, text: e.message }); });
  }, []);
  if (text === null) return null;

  const emails = text.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
  const invalid = emails.filter((e) => !EMAIL_RE.test(e));

  async function save() {
    setBusy(true);
    try {
      await saveNotifyEmails(emails);
      setDirty(false);
      setMessage({ ok: true, text: `Saved ${emails.length} recipient${emails.length === 1 ? "" : "s"}.` });
    } catch (e) {
      const t = e instanceof Error ? e.message : "Save failed.";
      if (/signed in|expired/i.test(t)) onAuthLost();
      setMessage({ ok: false, text: t });
    }
    setBusy(false);
  }

  async function test() {
    setBusy(true);
    const r = await emailPdf("Test email — HDK ARFF RESCUE 2", "This is a test from the HDK ARFF inspection app. New fault reports will arrive like this, with the PDF attached.");
    setMessage({ ok: "sent" in r, text: describeEmail(r) });
    setBusy(false);
  }

  return (
    <div className="editor-section ops-editor" style={{ marginTop: 16 }}>
      <div className="editor-bar" style={{ padding: "10px 12px", margin: 0 }}>
        <div>
          <strong>Email</strong>
          <span className="editor-sub">New fault reports are emailed here with the PDF attached.</span>
        </div>
        <button className="btn-export" onClick={save} disabled={busy || !dirty || invalid.length > 0}>Save</button>
      </div>
      {message && <p className={message.ok ? "editor-ok" : "form-error"} style={{ padding: "0 12px" }}>{message.text}</p>}
      <div className="editor-items edit-form">
        <label>Recipients (one per line)
          <textarea rows={3} value={text} placeholder="name@example.com" onChange={(e) => { setText(e.target.value); setDirty(true); setMessage(null); }} />
        </label>
        {invalid.length > 0 && <p className="form-error" style={{ margin: 0 }}>Not a valid address: {invalid.join(", ")}</p>}
        <button type="button" className="btn-small" onClick={test} disabled={busy || dirty || emails.length === 0}>Send test email</button>
      </div>
    </div>
  );
}
