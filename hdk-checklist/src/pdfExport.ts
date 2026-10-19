import jsPDF from "jspdf";
import type { InspectionLog, FaultReport } from "./types";

type RGB = [number, number, number];
const NAVY: RGB = [11, 42, 74];
const GREY: RGB = [85, 85, 85];
const LIGHT: RGB = [238, 241, 244];
const WHITE: RGB = [255, 255, 255];
// RED kept for potential future use
const _RED: RGB = [180, 30, 30]; void _RED;

function header(doc: jsPDF, page: number, pages: number) {
  doc.setFillColor(...NAVY);
  doc.rect(10, 8, 190, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("REGIONAL AIRPORTS COMPANY LTD", 105, 14, { align: "center" });
  doc.setFontSize(8.5);
  doc.text(
    "AIRPORT RESCUE AND FIREFIGHTING DEPARTMENT — KULHUDHUFFUSHI AIRPORT (HDK)",
    105,
    18.5,
    { align: "center" }
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(
    "RESCUE 3  |  SECTION ONE — VEHICLE OPERATORS  |  Daily Inspection Checklist",
    105,
    23,
    { align: "center" }
  );
  doc.setFillColor(...LIGHT);
  doc.rect(10, 26, 190, 10, "F");
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.text("Document No: HDK-ARFF/R3/CHK", 12, 31);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GREY);
  doc.text("SOP: RACL-SQ-ARF-COP-24-2 (version 01)", 70, 31);
  doc.text(`Page ${page} of ${pages}`, 198, 31, { align: "right" });
}

export function exportInspectionPDF(log: InspectionLog) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pages = 2;
  header(doc, 1, pages);

  let y = 40;
  doc.setFontSize(7);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.text(`Date: ${log.date}  ${log.time}`, 12, y);
  doc.text(`Operator: ${log.operatorName}`, 80, y);
  doc.text(`Overall Condition: ${log.overallCondition}`, 150, y);
  y += 6;

  const statusColors: Record<string, [number, number, number]> = {
    OK: [0, 120, 60],
    NOK: [200, 120, 0],
    "U/S": [180, 30, 30],
    NA: [100, 100, 100],
  };

  for (const sec of log.sections) {
    if (y > 265) {
      doc.addPage();
      header(doc, 2, pages);
      y = 40;
    }
    doc.setFillColor(31, 51, 77);
    doc.rect(10, y, 190, 6, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text(sec.title, 12, y + 4);
    y += 6;

    for (let i = 0; i < sec.items.length; i++) {
      if (y > 270) {
        doc.addPage();
        header(doc, doc.getNumberOfPages(), pages);
        y = 40;
      }
      const item = sec.items[i];
      const bg = i % 2 === 0 ? WHITE : LIGHT;
      doc.setFillColor(...bg);
      doc.rect(10, y, 190, 5.5, "F");
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.text(`${i + 1}.`, 12, y + 3.8);
      doc.text(item.label, 18, y + 3.8);
      const col = statusColors[item.status] ?? ([150, 150, 150] as [number, number, number]);
      doc.setTextColor(...col);
      doc.setFont("helvetica", "bold");
      doc.text(item.status || "—", 140, y + 3.8);
      doc.setTextColor(...GREY);
      doc.setFont("helvetica", "normal");
      if (item.remarks) doc.text(item.remarks.substring(0, 40), 155, y + 3.8);
      y += 5.5;
    }
    y += 2;
  }

  if (log.comments) {
    if (y > 255) { doc.addPage(); y = 40; }
    doc.setFillColor(31, 51, 77);
    doc.rect(10, y, 190, 6, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text("COMMENTS", 12, y + 4);
    y += 8;
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    const lines = doc.splitTextToSize(log.comments, 185);
    doc.text(lines, 12, y);
    y += lines.length * 4 + 4;
  }

  if (log.operatorSignature) {
    if (y > 255) { doc.addPage(); y = 40; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
    doc.text("Operator Signature:", 12, y + 5);
    doc.addImage(log.operatorSignature, "PNG", 12, y + 7, 60, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...GREY);
    doc.text(log.operatorName, 12, y + 30);
  }

  doc.setFontSize(5.5);
  doc.setTextColor(...GREY);
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.text(
      "Legend:  OK = Good    NOK = Minor defect but operational    U/S = Unserviceable    NA = Not Applicable",
      105,
      290,
      { align: "center" }
    );
  }

  doc.save(`HDK-Checklist-${log.date.replace(/\//g, "-")}-${log.operatorName}.pdf`);
}

export function exportFaultReportPDF(report: FaultReport) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const M = 12;
  const PW = 210;
  const TW = PW - 2 * M; // 186mm
  const FORM_GREY: RGB = [237, 237, 237];
  const BK: RGB = [0, 0, 0];

  // Parse date "DD/MM/YYYY" → "DDMMYYYY", time "HH:MM" → "HHMM"
  const dp = report.date.split("/");
  const dateDigits = dp.length === 3 ? dp[0] + dp[1] + dp[2] : "        ";
  const timeDigits = report.time.replace(":", "");

  doc.setDrawColor(...BK);
  doc.setLineWidth(0.35);

  // ── HEADER ──────────────────────────────────────────────────────────
  let y = 11;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...BK);
  doc.text("AIRPORT RESCUE AND FIREFIGHTING DEPARTMENT", M, y);
  doc.text("REIGIONAL AIRPORTS COMPANY LTD", M, y + 5);

  // Logo box (right)
  const logoX = PW - M - 30;
  doc.setLineWidth(0.6);
  doc.rect(logoX, y - 4, 30, 20, "D");
  doc.setLineWidth(0.35);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(60, 60, 60);
  doc.text("REGIONAL", logoX + 15, y + 1, { align: "center" });
  doc.text("AIRPORTS", logoX + 15, y + 5.5, { align: "center" });
  doc.text("COMPANY LTD", logoX + 15, y + 10, { align: "center" });
  // simple graphic lines
  doc.setLineWidth(1);
  doc.setDrawColor(80, 80, 80);
  doc.line(logoX + 6, y - 2, logoX + 6, y + 14);
  doc.setLineWidth(0.35);
  doc.setDrawColor(...BK);

  // Title
  y = 32;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...BK);
  doc.text("FAULT REPORT FORM", PW / 2, y, { align: "center" });
  const tw = doc.getTextWidth("FAULT REPORT FORM");
  doc.line(PW / 2 - tw / 2, y + 0.8, PW / 2 + tw / 2, y + 0.8);

  y = 38;

  // Column widths
  const COL1 = 50; // label column
  const COL2 = TW - COL1;
  const HALF = TW / 2;
  const SIG_LABEL = 17;
  const SIG_BOX = 50;
  const NAME_W = COL2 - SIG_LABEL - SIG_BOX;

  // Helper: section header row
  function secHeader(title: string, h = 7) {
    doc.setFillColor(...FORM_GREY);
    doc.rect(M, y, TW, h, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...BK);
    doc.text(title, M + TW / 2, y + h / 2 + 1.6, { align: "center" });
    y += h;
  }

  // Helper: simple label | value row
  function labelRow(label: string, value: string, h = 7) {
    doc.rect(M, y, COL1, h, "D");
    doc.rect(M + COL1, y, COL2, h, "D");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...BK);
    doc.text(label, M + 1.8, y + h / 2 + 1.4);
    doc.setFont("helvetica", "normal");
    doc.text(value, M + COL1 + 1.8, y + h / 2 + 1.4);
    y += h;
  }

  // Helper: label | tall text row
  function labelTextRow(label: string, text: string, h: number) {
    doc.rect(M, y, COL1, h, "D");
    doc.rect(M + COL1, y, COL2, h, "D");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...BK);
    doc.text(label, M + 1.8, y + 5.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    const lines = doc.splitTextToSize(text, COL2 - 4);
    doc.text(lines, M + COL1 + 2, y + 5.5, { maxWidth: COL2 - 4 });
    y += h;
  }

  // Helper: name + signature row (label | name | Signature | box)
  function sigRow(label: string, name: string, h = 16, sigImg?: string) {
    doc.rect(M, y, COL1, h, "D");
    doc.rect(M + COL1, y, NAME_W, h, "D");
    doc.rect(M + COL1 + NAME_W, y, SIG_LABEL, h, "D");
    doc.rect(M + COL1 + NAME_W + SIG_LABEL, y, SIG_BOX, h, "D");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...BK);
    doc.text(label, M + 1.8, y + h / 2 + 1.4);
    doc.setFont("helvetica", "normal");
    if (name) doc.text(name, M + COL1 + 1.8, y + h / 2 + 1.4);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text("Signature", M + COL1 + NAME_W + 1.8, y + 5.5);
    if (sigImg) {
      try {
        doc.addImage(sigImg, "PNG", M + COL1 + NAME_W + SIG_LABEL + 1, y + 1, SIG_BOX - 2, h - 2);
      } catch { /* ignore bad image data */ }
    }
    y += h;
  }

  // Helper: date/time header row (two halves)
  function dtHeader(leftLabel: string, rightLabel: string, h = 6.5) {
    doc.rect(M, y, HALF, h, "D");
    doc.rect(M + HALF, y, HALF, h, "D");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...BK);
    doc.text(leftLabel, M + 1.8, y + 3.2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.8);
    doc.text("(DD MM YYYY & hh:mm formal)", M + 1.8, y + h - 0.8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text(rightLabel, M + HALF + 1.8, y + 3.2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.8);
    doc.text("(DD MM YYYY & hh:mm formal)", M + HALF + 1.8, y + h - 0.8);
    y += h;
  }

  // Helper: draw digit boxes row (two halves)
  function dtBoxRow(leftDate: string, leftTime: string, rightDate: string, rightTime: string, h = 11) {
    doc.rect(M, y, HALF, h, "D");
    doc.rect(M + HALF, y, HALF, h, "D");

    function drawBoxes(startX: number, dStr: string, tStr: string) {
      const BW = 4.8;
      const BH = 7.5;
      const G = 0.6;
      let cx = startX;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      // DD
      for (let i = 0; i < 2; i++) {
        doc.rect(cx, y + 1.5, BW, BH, "D");
        if (dStr[i] && dStr[i] !== " ") doc.text(dStr[i], cx + BW / 2, y + 1.5 + BH - 1.5, { align: "center" });
        cx += BW + G;
      }
      cx += 1.5;
      // MM
      for (let i = 2; i < 4; i++) {
        doc.rect(cx, y + 1.5, BW, BH, "D");
        if (dStr[i] && dStr[i] !== " ") doc.text(dStr[i], cx + BW / 2, y + 1.5 + BH - 1.5, { align: "center" });
        cx += BW + G;
      }
      cx += 1.5;
      // YYYY
      for (let i = 4; i < 8; i++) {
        doc.rect(cx, y + 1.5, BW, BH, "D");
        if (dStr[i] && dStr[i] !== " ") doc.text(dStr[i], cx + BW / 2, y + 1.5 + BH - 1.5, { align: "center" });
        cx += BW + G;
      }
      cx += 3;
      // HH
      for (let i = 0; i < 2; i++) {
        doc.rect(cx, y + 1.5, BW, BH, "D");
        if (tStr[i] && tStr[i] !== " ") doc.text(tStr[i], cx + BW / 2, y + 1.5 + BH - 1.5, { align: "center" });
        cx += BW + G;
      }
      doc.setFontSize(8);
      doc.text(":", cx, y + 1.5 + BH - 1.5);
      cx += 3.5;
      // MM
      for (let i = 2; i < 4; i++) {
        doc.rect(cx, y + 1.5, BW, BH, "D");
        if (tStr[i] && tStr[i] !== " ") doc.text(tStr[i], cx + BW / 2, y + 1.5 + BH - 1.5, { align: "center" });
        cx += BW + G;
      }
    }

    drawBoxes(M + 2, leftDate, leftTime);
    drawBoxes(M + HALF + 2, rightDate, rightTime);
    y += h;
  }

  // Helper: blank tall box row for repair sections
  function blankRow(label: string, h: number) {
    doc.rect(M, y, COL1, h, "D");
    doc.rect(M + COL1, y, COL2, h, "D");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...BK);
    doc.text(label, M + 1.8, y + 5.5);
    y += h;
  }

  // Helper: bottom two-col row (label | Signature | box) full width
  function maintRow(label: string, h = 13) {
    const LAB_W = 74;
    doc.rect(M, y, LAB_W, h, "D");
    doc.rect(M + LAB_W, y, SIG_LABEL, h, "D");
    doc.rect(M + LAB_W + SIG_LABEL, y, TW - LAB_W - SIG_LABEL, h, "D");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...BK);
    doc.text(label, M + 1.8, y + h / 2 + 1.4);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text("Signature", M + LAB_W + 1.8, y + 5.5);
    y += h;
  }

  // ── DETAILS OF REPORT ───────────────────────────────────────────────
  secHeader("DETAILS OF REPORT");

  labelRow("1. Document Number :", report.reportNumber, 6.5);
  labelRow("2. Type of Vehicle / Equipment :", report.vehicleEquipmentLine || report.vehicle, 6.5);

  // 3. Details of Defects — dynamic height
  const defectText = report.detailsOfDefects || report.faultSummary;
  const defectLines = doc.splitTextToSize(defectText, COL2 - 4);
  const defectH = Math.max(26, defectLines.length * 4.6 + 8);
  doc.setFontSize(7);
  labelTextRow("3. Details of Defects :", defectText, defectH);

  // 4. Reported by
  sigRow("4. Reported by :", report.operatorName, 16, report.operatorSignature);

  // Malfunction / Notification date row
  dtHeader("MALFUNCTION DATE / TIME", "NOTIFICATION DATE / TIME");
  dtBoxRow(dateDigits, timeDigits, dateDigits, timeDigits);

  // Shift In-Charge (blank)
  sigRow("Shift In-Charge", "", 15);

  // ── DETAILS OF REPAIR ───────────────────────────────────────────────
  secHeader("DETAILS OF REPAIR");

  dtHeader("DESIRED START DATE / TIME", "REQUIRED END DATE / TIME");
  dtBoxRow("        ", "    ", "        ", "    ");

  sigRow("1. Repaired by :", "", 13);
  blankRow("2. Details of Repair Works :", 22);
  blankRow("3. Remarks :", 26);

  // ── ACCEPTANCE TEST ─────────────────────────────────────────────────
  secHeader("ACCEPTANCE TEST");

  dtHeader("DATE / TIME", "REQUIRED END DATE / TIME");
  dtBoxRow("        ", "    ", "        ", "    ");

  blankRow("Comments :", 16);
  maintRow("MAINTENANCE TEAM (RUL) :");
  maintRow("ARFF (Name) :");

  // ── PHOTOGRAPHIC EVIDENCE (new page if faults have evidence) ──────────
  const faultsWithEvidence = report.faults.filter((f) => f.evidence && f.evidence.length > 0);
  if (faultsWithEvidence.length > 0) {
    doc.addPage();

    // Evidence page header
    doc.setFillColor(...NAVY);
    doc.rect(M, 10, TW, 14, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("PHOTOGRAPHIC / VIDEO EVIDENCE", M + TW / 2, 17, { align: "center" });
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(`${report.reportNumber}  ·  ${report.date}  ·  ${report.operatorName}`, M + TW / 2, 21.5, { align: "center" });

    let ey = 30;
    const IMG_W = 56;
    const IMG_H = 42;
    const IMG_GAP = 6;
    const IMGS_PER_ROW = 3;

    for (const fault of faultsWithEvidence) {
      if (ey > 250) { doc.addPage(); ey = 14; }

      // Fault label bar
      doc.setFillColor(31, 51, 77);
      doc.rect(M, ey, TW, 7, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      const secShort = fault.section.includes("—") ? fault.section.split("—").pop()!.trim() : fault.section;
      doc.text(`[${fault.status}]  ${fault.label}  —  ${secShort}`, M + 2, ey + 4.8);
      ey += 9;

      // Evidence grid
      let col = 0;
      for (const ev of fault.evidence) {
        if (ey + IMG_H + 10 > 280) { doc.addPage(); ey = 14; col = 0; }
        const ex = M + col * (IMG_W + IMG_GAP);
        try {
          doc.addImage(ev.dataUrl, "JPEG", ex, ey, IMG_W, IMG_H);
        } catch {
          doc.setFillColor(...LIGHT);
          doc.rect(ex, ey, IMG_W, IMG_H, "F");
          doc.setTextColor(...GREY);
          doc.setFontSize(8);
          doc.text("No preview", ex + IMG_W / 2, ey + IMG_H / 2, { align: "center" });
        }
        // Caption
        doc.setFont("helvetica", "normal");
        doc.setFontSize(5.5);
        doc.setTextColor(...GREY);
        const cap = `${ev.type === "video" ? "▶ VIDEO" : "📷"} ${ev.name.length > 20 ? ev.name.substring(0, 20) + "…" : ev.name}`;
        doc.text(cap, ex + IMG_W / 2, ey + IMG_H + 3.5, { align: "center" });

        col++;
        if (col >= IMGS_PER_ROW) { col = 0; ey += IMG_H + 10; }
      }
      if (col > 0) ey += IMG_H + 12;
      ey += 4;
    }
  }

  doc.save(`HDK-FaultReport-${report.reportNumber.replace(/\//g, "-")}.pdf`);
}
