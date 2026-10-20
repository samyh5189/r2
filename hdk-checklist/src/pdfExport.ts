import jsPDF from "jspdf";
import type { InspectionLog, FaultReport } from "./types";
import { RACL_LOGO } from "./raclLogo";

type RGB = [number, number, number];

// Strip near-white pixels from a PNG data URL (for transparent signature rendering).
// Older signatures were captured with a light background; this makes them transparent.
async function stripWhiteBg(dataUrl: string): Promise<string> {
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0);
    const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 230 && d[i + 1] > 230 && d[i + 2] > 230) d[i + 3] = 0;
    }
    ctx.putImageData(id, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return dataUrl;
  }
}
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
    "RESCUE 2  |  SECTION ONE — VEHICLE OPERATORS  |  Daily Inspection Checklist",
    105,
    23,
    { align: "center" }
  );
  doc.setFillColor(...LIGHT);
  doc.rect(10, 26, 190, 10, "F");
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.text("Document No: HDK-ARFF/R2/CHK", 12, 31);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GREY);
  doc.text("SOP: RACL-SQ-ARF-COP-24-2 (version 01)", 70, 31);
  doc.text(`Page ${page} of ${pages}`, 198, 31, { align: "right" });
}

export async function exportInspectionPDF(log: InspectionLog) {
  const sig = log.operatorSignature ? await stripWhiteBg(log.operatorSignature) : "";
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
    doc.addImage(sig, "PNG", 12, y + 7, 60, 20);
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

export async function exportFaultReportPDF(report: FaultReport) {
  const sig = report.operatorSignature ? await stripWhiteBg(report.operatorSignature) : undefined;
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

  // Logo (right)
  const LOGO_W = 31;
  const LOGO_H = LOGO_W * (212 / 321);
  doc.addImage(RACL_LOGO, "PNG", PW - M - LOGO_W, y - 5, LOGO_W, LOGO_H);

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
    doc.setFont("times", "normal");
    doc.setFontSize(9);
    doc.text(value, M + COL1 + 1.8, y + h / 2 + 1.5);
    y += h;
  }

  // Helper: label | tall text row
  function labelTextRow(label: string, text: string, h: number) {
    doc.rect(M, y, COL1, h, "D");
    doc.rect(M + COL1, y, COL2, h, "D");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...BK);
    doc.text(label, M + 1.8, y + h / 2 + 1.4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    const lines = doc.splitTextToSize(text, COL2 - 4);
    const textTop = y + h / 2 - (lines.length * 3.5) / 2 + 2.6;
    doc.text(lines, M + COL1 + COL2 / 2, textTop, { align: "center", lineHeightFactor: 1.4 });
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
    doc.setFont("times", "normal");
    doc.setFontSize(9);
    if (name) doc.text(name, M + COL1 + 1.8, y + h / 2 + 1.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("Signature", M + COL1 + NAME_W + SIG_LABEL / 2, y + h / 2 + 1.4, { align: "center" });
    if (sigImg) {
      try {
        doc.addImage(sigImg, "PNG", M + COL1 + NAME_W + SIG_LABEL + 1, y + 1, SIG_BOX - 2, h - 2);
      } catch { /* ignore bad image data */ }
    }
    y += h;
  }

  // Helper: date/time block — label line + contiguous digit strips (DDMMYYYY | hh:mm), two halves
  function dtBlock(leftLabel: string, rightLabel: string, leftDate: string, leftTime: string, rightDate: string, rightTime: string, h = 13) {
    doc.rect(M, y, TW, h, "D");
    const BW = 5.8;
    const BH = 4.6;
    const by = y + 6.5;

    function label(x: number, text: string) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...BK);
      doc.text(text, x, y + 4);
      const labelW = doc.getTextWidth(text);
      doc.setFont("helvetica", "italic");
      doc.text("(DD MM YYYY & hh:mm formal)", x + labelW + 1, y + 4);
    }

    function strip(x: number, chars: string[]) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      chars.forEach((c, i) => {
        const cx = x + i * BW;
        doc.rect(cx, by, BW, BH, "D");
        if (c.trim()) {
          if (c === ":") doc.setFont("helvetica", "bolditalic");
          doc.text(c, cx + BW / 2, by + BH / 2 + 1.3, { align: "center" });
          if (c === ":") doc.setFont("helvetica", "normal");
        }
      });
    }

    function half(x: number, text: string, dStr: string, tStr: string) {
      label(x, text);
      strip(x, dStr.padEnd(8).slice(0, 8).split(""));
      strip(x + 8 * BW + 3.8, [tStr[0] ?? " ", tStr[1] ?? " ", ":", tStr[2] ?? " ", tStr[3] ?? " "]);
    }

    half(M + 3.8, leftLabel, leftDate, leftTime);
    half(M + HALF + 3.8, rightLabel, rightDate, rightTime);
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
    doc.setFontSize(7);
    doc.text("Signature", M + LAB_W + SIG_LABEL / 2, y + h / 2 + 1.4, { align: "center" });
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
  sigRow("4. Reported by :", report.operatorName, 16, sig);

  // Malfunction / Notification date row
  dtBlock("MALFUNCTION DATE / TIME", "NOTIFICATION DATE / TIME", dateDigits, timeDigits, dateDigits, timeDigits);

  // Shift In-Charge (blank)
  sigRow("Shift In-Charge", "", 15);

  // ── DETAILS OF REPAIR ───────────────────────────────────────────────
  secHeader("DETAILS OF REPAIR");

  dtBlock("DESIRED START DATE / TIME", "REQUIRED END DATE / TIME", "", "", "", "");

  sigRow("1. Repaired by :", "", 13);
  blankRow("2. Details of Repair Works :", 22);
  blankRow("3. Remarks :", 26);

  // ── ACCEPTANCE TEST ─────────────────────────────────────────────────
  secHeader("ACCEPTANCE TEST");

  dtBlock("DATE / TIME", "REQUIRED END DATE / TIME", "", "", "", "");

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

export async function exportWeeklyPDF(logs: InspectionLog[]) {
  if (logs.length === 0) return;
  const sigs = new Map(await Promise.all(logs.map(async (l) => [l, l.operatorSignature ? await stripWhiteBg(l.operatorSignature) : ""] as const)));

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function parseDateGB(s: string): Date {
    const [d, m, y] = s.split("/").map(Number);
    return new Date(y, m - 1, d);
  }

  function fmtDateGB(d: Date): string {
    return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
  }

  // Find week (Sat–Fri) containing the most recent log
  const recentDate = parseDateGB(logs[0].date);
  const dow = recentDate.getDay(); // 0=Sun … 6=Sat
  const daysFromSat = dow === 6 ? 0 : dow + 1;
  const weekStart = new Date(recentDate);
  weekStart.setDate(weekStart.getDate() - daysFromSat);

  const DAY_NAMES = ["Sat","Sun","Mon","Tue","Wed","Thu","Fri"];
  const days: Date[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d;
  });
  const dayStrs = days.map(fmtDateGB);

  const logByDate: Record<string, InspectionLog> = {};
  for (const log of logs) {
    if (!logByDate[log.date]) logByDate[log.date] = log;
  }
  const dayLogs: (InspectionLog | null)[] = dayStrs.map(ds => logByDate[ds] ?? null);
  const templateLog = dayLogs.find(l => l !== null)!;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const M = 10;
  const PW = 210;
  const TW = PW - 2 * M; // 190

  // Column widths
  const NUM_W = 7;
  const DESC_W = 68;
  const DAY_W = 13;
  const REM_W = TW - NUM_W - DESC_W - 7 * DAY_W; // 190-7-68-91=24

  const H_DAY = 5.5;
  const H_DATE = 4.0;
  const H_OP = 3.5;   // operator name sub-row
  const H_ITEM = 5.5;
  const LIGHT_BLUE: RGB = [232, 240, 250];
  const PART_BG: RGB = [50, 80, 120];
  const SEC_BG: RGB = [200, 210, 225];
  const LINE: RGB = [180, 185, 195];
  const OK_BG: RGB = [220, 252, 231];

  // Centred green checkmark drawn as one rounded stroke (scale 1 fits an item cell)
  function drawTick(cx: number, cy: number, scale: number) {
    doc.setDrawColor(0, 130, 55);
    doc.setLineWidth(0.55 * scale);
    doc.setLineCap("round");
    doc.setLineJoin("round");
    doc.lines([[1.1 * scale, 1.1 * scale], [2.1 * scale, -2.4 * scale]], cx - 1.6 * scale, cy + 0.05 * scale, [1, 1], "S");
    doc.setLineCap("butt");
    doc.setLineJoin("miter");
  }
  const NOK_BG: RGB = [254, 243, 199];
  const US_BG: RGB = [254, 226, 226];

  let y = 10;

  function drawPageHeader() {
    doc.setFillColor(...NAVY);
    doc.rect(M, y, TW, 11, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("REGIONAL AIRPORTS COMPANY LTD — ARFF DEPARTMENT", PW / 2, y + 4.5, { align: "center" });
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text("RESCUE 2  |  SECTION ONE — VEHICLE OPERATORS  |  Weekly Inspection Log", PW / 2, y + 9, { align: "center" });
    y += 13;

    const weekEndDate = days[6];
    const range = `${days[0].getDate()}-${MONTHS[days[0].getMonth()]}-${days[0].getFullYear()}  to  ${weekEndDate.getDate()}-${MONTHS[weekEndDate.getMonth()]}-${weekEndDate.getFullYear()}`;
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(`Week: ${range}`, M, y + 3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...GREY);
    doc.text("Note: The items/things included in this section shall be inspected and filled out by the assigned Vehicle Operators.", M, y + 7);
    doc.setTextColor(0, 0, 0);
    y += 10;

    drawColumnHeaders();
  }

  function drawColumnHeaders() {
    const totalH = H_DAY + H_DATE + H_OP;
    doc.setFillColor(...LIGHT_BLUE);
    doc.rect(M, y, TW, totalH, "F");
    doc.setLineWidth(0.3);
    doc.setDrawColor(...LINE);

    // # cell
    doc.rect(M, y, NUM_W, totalH, "D");
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(0,0,0);
    doc.text("#", M + NUM_W / 2, y + totalH / 2 + 1.5, { align: "center" });

    // Description cell
    doc.rect(M + NUM_W, y, DESC_W, totalH, "D");
    doc.text("Type and Location of Inspection", M + NUM_W + 2, y + totalH / 2 + 1.5);

    // Day columns — 3 sub-rows: day name | date | operator
    for (let i = 0; i < 7; i++) {
      const x = M + NUM_W + DESC_W + i * DAY_W;
      doc.rect(x, y, DAY_W, H_DAY, "D");
      doc.rect(x, y + H_DAY, DAY_W, H_DATE, "D");
      doc.rect(x, y + H_DAY + H_DATE, DAY_W, H_OP, "D");

      doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(0,0,0);
      doc.text(DAY_NAMES[i], x + DAY_W / 2, y + H_DAY / 2 + 1.5, { align: "center" });

      doc.setFont("helvetica", "normal"); doc.setFontSize(5.5); doc.setTextColor(60,60,60);
      doc.text(`${days[i].getDate()}-${MONTHS[days[i].getMonth()]}`, x + DAY_W / 2, y + H_DAY + H_DATE / 2 + 1.4, { align: "center" });

      // Operator initials
      const opLog = dayLogs[i];
      if (opLog) {
        const parts = opLog.operatorName.trim().split(" ");
        const initials = parts.map(p => p[0]?.toUpperCase() ?? "").join("").substring(0, 3);
        doc.setFontSize(4.8); doc.setTextColor(40, 80, 140);
        doc.text(initials, x + DAY_W / 2, y + H_DAY + H_DATE + H_OP / 2 + 1.2, { align: "center" });
      }
      doc.setTextColor(0,0,0);
    }

    // Remarks cell
    const remX = M + NUM_W + DESC_W + 7 * DAY_W;
    doc.rect(remX, y, REM_W, totalH, "D");
    doc.setFont("helvetica", "bold"); doc.setFontSize(6);
    doc.text("Remarks", remX + REM_W / 2, y + totalH / 2 + 1.5, { align: "center" });

    y += totalH;
  }

  function checkPageBreak(needed = H_ITEM) {
    if (y + needed > 282) {
      doc.addPage();
      y = 10;
      drawColumnHeaders();
    }
  }

  function drawPartRow(title: string) {
    checkPageBreak(6);
    doc.setFillColor(...PART_BG);
    doc.rect(M, y, TW, 6, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5);
    doc.text(title, M + 2, y + 4.2);
    y += 6;
  }

  function drawSectionRow(title: string) {
    checkPageBreak(5);
    doc.setFillColor(...SEC_BG);
    doc.rect(M, y, TW, 5, "F");
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3);
    doc.rect(M, y, TW, 5, "D");
    doc.setTextColor(20, 40, 80);
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5);
    doc.text(title, M + 2, y + 3.6);
    y += 5;
  }

  function drawItemRow(secId: string, itemIdx: number, label: string, isHours: boolean, rowNum: number) {
    checkPageBreak(H_ITEM);
    const rowBg = rowNum % 2 === 0 ? WHITE : LIGHT;
    doc.setFillColor(...rowBg);
    doc.rect(M, y, TW, H_ITEM, "F");
    doc.setDrawColor(...LINE); doc.setLineWidth(0.25);

    // # cell
    doc.rect(M, y, NUM_W, H_ITEM, "D");
    doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(100,100,100);
    doc.text(String(rowNum), M + NUM_W / 2, y + H_ITEM / 2 + 1.3, { align: "center" });

    // Description cell
    doc.rect(M + NUM_W, y, DESC_W, H_ITEM, "D");
    doc.setTextColor(0,0,0); doc.setFontSize(6);
    doc.text(isHours ? "Engine Running Hours" : label, M + NUM_W + 2, y + H_ITEM / 2 + 1.3);

    // Day cells
    const remX = M + NUM_W + DESC_W + 7 * DAY_W;
    const weekRemarks: string[] = [];

    for (let di = 0; di < 7; di++) {
      const x = M + NUM_W + DESC_W + di * DAY_W;
      doc.rect(x, y, DAY_W, H_ITEM, "D");
      const dl = dayLogs[di];
      if (dl) {
        const sec = dl.sections.find(s => s.id === secId);
        const it = sec?.items[itemIdx];
        if (it) {
          if (isHours) {
            if (it.remarks) {
              doc.setFillColor(...OK_BG);
              doc.rect(x + 0.15, y + 0.15, DAY_W - 0.3, H_ITEM - 0.3, "F");
              doc.setFontSize(5.5); doc.setTextColor(0, 100, 50);
              doc.text(it.remarks, x + DAY_W / 2, y + H_ITEM / 2 + 1.3, { align: "center" });
            }
          } else if (it.status === "OK") {
            doc.setFillColor(...OK_BG);
            doc.rect(x + 0.15, y + 0.15, DAY_W - 0.3, H_ITEM - 0.3, "F");
            drawTick(x + DAY_W / 2, y + H_ITEM / 2, 1);
            doc.setDrawColor(...LINE); doc.setLineWidth(0.25);
          } else if (it.status === "NOK") {
            doc.setFillColor(...NOK_BG);
            doc.rect(x + 0.15, y + 0.15, DAY_W - 0.3, H_ITEM - 0.3, "F");
            doc.setTextColor(160, 80, 0); doc.setFont("helvetica", "bold"); doc.setFontSize(5.5);
            doc.text("NOK", x + DAY_W / 2, y + H_ITEM / 2 + 1.3, { align: "center" });
            if (it.remarks) weekRemarks.push(it.remarks);
          } else if (it.status === "U/S") {
            doc.setFillColor(...US_BG);
            doc.rect(x + 0.15, y + 0.15, DAY_W - 0.3, H_ITEM - 0.3, "F");
            doc.setTextColor(180, 30, 30); doc.setFont("helvetica", "bold"); doc.setFontSize(5.5);
            doc.text("U/S", x + DAY_W / 2, y + H_ITEM / 2 + 1.3, { align: "center" });
            if (it.remarks) weekRemarks.push(it.remarks);
          } else if (it.status === "NA") {
            doc.setTextColor(160,160,160); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
            doc.text("—", x + DAY_W / 2, y + H_ITEM / 2 + 1.3, { align: "center" });
          }
          doc.setFont("helvetica", "normal"); doc.setTextColor(0,0,0);
        }
      }
    }

    // Remarks cell
    doc.rect(remX, y, REM_W, H_ITEM, "D");
    if (weekRemarks.length > 0) {
      doc.setFontSize(4.8); doc.setTextColor(100,100,100);
      const rem = weekRemarks.join("; ");
      doc.text(rem.length > 28 ? rem.substring(0, 28) + "…" : rem, remX + 1, y + H_ITEM / 2 + 1.3);
    }

    y += H_ITEM;
  }

  // ── Render ────────────────────────────────────────────────────────────
  drawPageHeader();

  let lastPart = "";
  let itemCounter = 0;

  for (const sec of templateLog.sections) {
    const hasPartPrefix = sec.title.startsWith("PART ");
    let partTitle = "";
    let sectionLabel = sec.title;

    if (hasPartPrefix) {
      const dashIdx = sec.title.indexOf(" — ");
      if (dashIdx > 0) {
        partTitle = sec.title.substring(0, dashIdx);
        sectionLabel = sec.title.substring(dashIdx + 3);
      } else {
        partTitle = sec.title;
        sectionLabel = "";
      }
    }

    if (partTitle && partTitle !== lastPart) {
      drawPartRow(partTitle);
      lastPart = partTitle;
    }
    if (sectionLabel) drawSectionRow(sectionLabel);

    for (let idx = 0; idx < sec.items.length; idx++) {
      itemCounter++;
      const lbl = sec.items[idx].label;
      const isHours = sec.items[idx].id === "p1-10";
      drawItemRow(sec.id, idx, lbl, isHours, itemCounter);
    }
  }

  // ── Operator signature row ───────────────────────────────────────────
  const SIG_H = 22;
  if (y + SIG_H + 8 > 282) { doc.addPage(); y = 10; }
  y += 5;

  // Header bar
  doc.setFillColor(...PART_BG);
  doc.rect(M, y, TW, 5.5, "F");
  doc.setTextColor(255,255,255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.5);
  doc.text("OPERATOR SIGNATURES", M + 2, y + 3.8);
  y += 5.5;

  // One cell per day
  const cellW = TW / 7;
  for (let i = 0; i < 7; i++) {
    const x = M + i * cellW;
    const dl = dayLogs[i];
    doc.setFillColor(...LIGHT_BLUE);
    doc.rect(x, y, cellW, SIG_H, "F");
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3);
    doc.rect(x, y, cellW, SIG_H, "D");

    // Day + date header inside cell
    doc.setFont("helvetica", "bold"); doc.setFontSize(5.5); doc.setTextColor(20,40,80);
    doc.text(`${DAY_NAMES[i]}  ${days[i].getDate()}-${MONTHS[days[i].getMonth()]}`, x + cellW / 2, y + 3.5, { align: "center" });

    if (dl) {
      const sigData = sigs.get(dl);
      if (sigData) {
        try {
          doc.addImage(sigData, "PNG", x + 1, y + 5, cellW - 2, SIG_H - 10);
        } catch { /* no-op */ }
      }
      const nameParts = dl.operatorName.trim().split(" ");
      const shortName = nameParts[0];
      doc.setFont("helvetica", "normal"); doc.setFontSize(4.8); doc.setTextColor(60,60,60);
      doc.text(shortName, x + cellW / 2, y + SIG_H - 2, { align: "center" });
    } else {
      doc.setFont("helvetica", "normal"); doc.setFontSize(5); doc.setTextColor(160,160,160);
      doc.text("No inspection", x + cellW / 2, y + SIG_H / 2 + 1, { align: "center" });
    }
  }
  y += SIG_H;

  // Footer on every page
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(5.5); doc.setTextColor(...GREY);
    const legend = "= OK    NOK = Minor defect but operational    U/S = Unserviceable    — = Not Applicable";
    const TICK_W = 3.6;
    const legendX = PW / 2 - (doc.getTextWidth("Legend:  " + legend) + TICK_W) / 2;
    const tickX = legendX + doc.getTextWidth("Legend:  ");
    doc.text("Legend:", legendX, 293);
    drawTick(tickX + 0.9, 292.3, 0.55);
    doc.setTextColor(...GREY);
    doc.text(legend, tickX + TICK_W, 293);
    doc.text(`Page ${p} of ${totalPages}  |  HDK-ARFF/R2/CHK`, PW - M, 293, { align: "right" });
  }

  const ws = `${String(days[0].getDate()).padStart(2,"0")}-${MONTHS[days[0].getMonth()]}`;
  const we = `${String(days[6].getDate()).padStart(2,"0")}-${MONTHS[days[6].getMonth()]}-${days[6].getFullYear()}`;
  doc.save(`HDK-Weekly-${ws}-to-${we}.pdf`);
}
