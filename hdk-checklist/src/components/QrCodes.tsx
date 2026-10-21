import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { CheckKind } from "../types";
import { CHECK_KINDS, KIND_LABEL } from "../checkKinds";
import { showPdf } from "../pdfViewer";
import { exportQrSheetPDF } from "../pdfExport";

export interface QrItem { kind: CheckKind; label: string; url: string; image: string }

/** Setup: QR codes for the vehicle — scanning one opens that checklist */
export default function QrCodes() {
  const [items, setItems] = useState<QrItem[]>([]);

  useEffect(() => {
    Promise.all(CHECK_KINDS.map(async (kind) => {
      const url = `${window.location.origin}/?check=${kind}`;
      const image = await QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 1, width: 600, color: { dark: "#0B2A4A" } });
      return { kind, label: `${KIND_LABEL[kind]} inspection`, url, image };
    })).then(setItems);
  }, []);

  if (items.length === 0) return null;
  return (
    <div className="editor-section ops-editor">
      <div className="editor-bar" style={{ padding: "10px 12px", margin: 0 }}>
        <div>
          <strong>QR codes</strong>
          <span className="editor-sub">Stick these on RESCUE 2. Scanning one opens that checklist on the phone.</span>
        </div>
        <button className="btn-export" onClick={() => showPdf(exportQrSheetPDF(items))}>Print sheet</button>
      </div>
      <div className="qr-grid">
        {items.map((q) => (
          <div key={q.kind} className="qr-card">
            <img src={q.image} alt={`QR code for the ${q.label}`} />
            <span>{q.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
