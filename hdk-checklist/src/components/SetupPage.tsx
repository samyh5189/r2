import { useState } from "react";
import { ClipboardList, Database, Gauge, Mail, QrCode, SlidersHorizontal, Users } from "lucide-react";
import OperatorsEditor from "./OperatorsEditor";
import ChecklistEditor from "./ChecklistEditor";
import RulesEditor from "./RulesEditor";
import EmailSettingsEditor from "./EmailSettingsEditor";
import ServiceEditor from "./ServiceEditor";
import QrCodes from "./QrCodes";
import { downloadBackup, downloadFaultsCsv, downloadLogsCsv } from "../backup";
import { toast } from "../dialogs";

const SECTIONS = [
  { id: "people", label: "People", Icon: Users },
  { id: "checklists", label: "Checklists", Icon: ClipboardList },
  { id: "rules", label: "Rules", Icon: SlidersHorizontal },
  { id: "email", label: "Email", Icon: Mail },
  { id: "service", label: "Engine", Icon: Gauge },
  { id: "qr", label: "QR codes", Icon: QrCode },
  { id: "data", label: "Data", Icon: Database },
] as const;
type Section = (typeof SECTIONS)[number]["id"];

function DataPanel() {
  const [busy, setBusy] = useState<string | null>(null);
  async function run(id: string, job: () => Promise<string>) {
    setBusy(id);
    try { toast(await job()); } catch (e) { toast(e instanceof Error ? e.message : "Export failed.", "error"); }
    setBusy(null);
  }
  return (
    <div className="setup-card">
      <div className="setup-card-head">
        <div>
          <strong>Data</strong>
          <span className="editor-sub">Download your records. Keep a backup somewhere safe every month.</span>
        </div>
      </div>
      <div className="data-actions">
        <button className="data-btn" disabled={!!busy} onClick={() => run("csv-logs", async () => `Exported ${await downloadLogsCsv()} inspections.`)}>
          <strong>{busy === "csv-logs" ? "Preparing…" : "Inspections (Excel CSV)"}</strong><small>One row per inspection, with its fault items and sign-off.</small>
        </button>
        <button className="data-btn" disabled={!!busy} onClick={() => run("csv-faults", async () => `Exported ${await downloadFaultsCsv()} fault reports.`)}>
          <strong>{busy === "csv-faults" ? "Preparing…" : "Fault reports (Excel CSV)"}</strong><small>One row per report, with priority, status and repair.</small>
        </button>
        <button className="data-btn" disabled={!!busy} onClick={() => run("backup", async () => { const r = await downloadBackup(); return `Backup downloaded: ${r.logs} inspections, ${r.faults} fault reports.`; })}>
          <strong>{busy === "backup" ? "Preparing…" : "Full backup (JSON)"}</strong><small>Everything, including the setup. PINs and passwords are never included.</small>
        </button>
      </div>
    </div>
  );
}

/** Admin setup, one section at a time */
export default function SetupPage({ onAuthLost }: { onAuthLost: () => void }) {
  const [section, setSection] = useState<Section>(() => {
    try { return (localStorage.getItem("hdk_setup_section") as Section) || "people"; } catch { return "people"; }
  });
  function choose(id: Section) {
    setSection(id);
    try { localStorage.setItem("hdk_setup_section", id); } catch { /* ignore */ }
  }
  return (
    <div className="container setup">
      <nav className="setup-nav" aria-label="Setup sections">
        {SECTIONS.map(({ id, label, Icon }) => (
          <button key={id} className={`setup-tab${section === id ? " active" : ""}`} onClick={() => choose(id)} aria-current={section === id ? "page" : undefined}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </nav>
      {section === "people" && <OperatorsEditor onAuthLost={onAuthLost} />}
      {section === "checklists" && <ChecklistEditor onAuthLost={onAuthLost} />}
      {section === "rules" && <RulesEditor onAuthLost={onAuthLost} />}
      {section === "email" && <EmailSettingsEditor onAuthLost={onAuthLost} />}
      {section === "service" && <ServiceEditor onAuthLost={onAuthLost} />}
      {section === "qr" && <QrCodes />}
      {section === "data" && <DataPanel />}
    </div>
  );
}
