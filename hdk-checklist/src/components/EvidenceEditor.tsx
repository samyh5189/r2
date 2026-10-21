import { useRef, useState } from "react";
import type { EvidenceItem } from "../types";
import { processFile } from "../evidenceUtils";

const MAX_EVIDENCE = 5;

/** Photos/videos attached to one fault: remove any, or add by camera or upload. */
export default function EvidenceEditor({ evidence, onChange }: { evidence: EvidenceItem[]; onChange: (next: EvidenceItem[]) => void }) {
  const [processing, setProcessing] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  async function addFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_EVIDENCE - evidence.length);
    e.target.value = "";
    if (files.length === 0) return;
    setProcessing(true);
    const added: EvidenceItem[] = [];
    for (const f of files) {
      try { added.push(await processFile(f)); } catch { /* unreadable file — skip it */ }
    }
    onChange([...evidence, ...added]);
    setProcessing(false);
  }

  return (
    <div className="cl-evidence-section">
      <div className="cl-evidence-header">
        <span className="cl-evidence-title">Photos / video ({evidence.length}/{MAX_EVIDENCE})</span>
        {evidence.length < MAX_EVIDENCE && (
          <div className="cl-ev-btn-group">
            <button type="button" className="cl-add-evidence-btn" onClick={() => cameraRef.current?.click()} disabled={processing}>📷 Camera</button>
            <button type="button" className="cl-add-evidence-btn secondary" onClick={() => uploadRef.current?.click()} disabled={processing}>📁 Upload</button>
          </div>
        )}
        {processing && <span style={{ fontSize: 11, color: "var(--muted)" }}>Processing…</span>}
      </div>
      <input ref={cameraRef} type="file" accept="image/*,video/*" capture="environment" multiple style={{ display: "none" }} onChange={addFiles} />
      <input ref={uploadRef} type="file" accept="image/*,video/*" multiple style={{ display: "none" }} onChange={addFiles} />
      {evidence.length > 0 && (
        <div className="cl-ev-thumbs">
          {evidence.map((ev) => (
            <div key={ev.id} className="cl-ev-thumb-wrap">
              <img src={ev.dataUrl} alt={ev.name} className="cl-ev-thumb" />
              {ev.type === "video" && <span className="cl-ev-video-badge">▶</span>}
              <button type="button" className="cl-ev-remove" title="Remove" onClick={() => onChange(evidence.filter((x) => x.id !== ev.id))}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
