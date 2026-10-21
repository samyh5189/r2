import jsPDF from "jspdf";
import type { FaultReport, FaultUpdate } from "./types";

/**
 * The fault report in the RACL template (HDK/FR/…): logo and rule, report number, FAULT REPORT,
 * then the Fault / Equipment / Description / Action tables, the reporter's signature block,
 * and one photo per following page. Watermark and footer on every page.
 * Positions are millimetres measured from the template; it uses no browser APIs so it can be
 * checked against the template outside the app.
 */

type RGB = [number, number, number];
export type Img = string | Uint8Array;

export interface FaultReportArt {
  logo: Img;
  watermark: Img;
  /** Carlito (metric-compatible with the template's Calibri), base64 TTF; Helvetica without it */
  fonts?: { regular: string; bold: string; boldItalic: string };
}

export interface FaultReportExtras {
  /** The reporter's rank, for "Reported by" and DESIGNATION */
  designation: string;
  signatures: { operator?: Img; shift?: Img; repair?: Img; maintenance?: Img; arff?: Img; update?: Img };
  photos: Img[];
}

/** A maintenance update printed as its own report under the same number */
export interface UpdateView {
  entry: FaultUpdate;
  /** 1-based among the report's action updates */
  n: number;
  /** The last update of a closed report also carries the acceptance test */
  withAcceptance: boolean;
}

export const LOCATION = "Kulhudhuffushi Airport (HDK)";
export const DEFAULT_RECOMMENDATION = "Kindly inspect and repair the reported issue(s) at the earliest for the proper functioning of the vehicle.";
export const defaultActionTaken = (priority: FaultReport["priority"]) =>
  priority === "Routine" ? "Reported to maintenance." : "Reported to maintenance for urgent attention.";
export const FOOTER_LEFT = "HDK / RACL";
export const FOOTER_RIGHT = "maintenance.hdk@airports.mv";

const BLACK: RGB = [0, 0, 0];
const HEAD_FILL: RGB = [217, 217, 217];
const RULE: RGB = [165, 165, 165];
const GOLD: RGB = [198, 147, 78];
const BROWN: RGB = [60, 38, 28];
const NOTE: RGB = [128, 128, 128];

// Table geometry
const L = 14.39;
const R = 193.89;
const W = R - L;
const LABEL_W = 36.41;
const PAD = 2.1;
const ROW = 6.2;
const HEAD = 5.7;
const GAP = 3.47;
const LINE = 4.14;     // body line height (10pt)
const BASE = 3.55;     // first baseline below a row's top
const BODY_PT = 10;
const PAGE_BOTTOM = 266; // above the footer bars

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ordinal = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th");

/** Fault title without the vehicle prefix */
export const faultTitle = (r: Pick<FaultReport, "vehicleEquipmentLine" | "faults">) =>
  r.vehicleEquipmentLine.replace(/^RESCUE 2 \(HDK-ARFF\)\s*[—–-]?\s*/, "").trim() || r.faults.map((f) => f.label).join(", ");

/** PNG or JPEG from the data itself, so a photo saved as PNG still draws */
function formatOf(data: Img, fallback: string): string {
  if (typeof data === "string") return /^data:image\/png/i.test(data) ? "PNG" : /^data:image\/jpe?g/i.test(data) ? "JPEG" : fallback;
  return data[0] === 0x89 && data[1] === 0x50 ? "PNG" : data[0] === 0xff && data[1] === 0xd8 ? "JPEG" : fallback;
}

export function buildFaultReportPdf(report: FaultReport, x: FaultReportExtras, art: FaultReportArt, update?: UpdateView): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let F = "helvetica";
  if (art.fonts) {
    doc.addFileToVFS("Carlito-Regular.ttf", art.fonts.regular);
    doc.addFileToVFS("Carlito-Bold.ttf", art.fonts.bold);
    doc.addFileToVFS("Carlito-BoldItalic.ttf", art.fonts.boldItalic);
    doc.addFont("Carlito-Regular.ttf", "Carlito", "normal");
    doc.addFont("Carlito-Bold.ttf", "Carlito", "bold");
    doc.addFont("Carlito-BoldItalic.ttf", "Carlito", "bolditalic");
    F = "Carlito";
  }
  const font = (style: "normal" | "bold" | "bolditalic", pt = BODY_PT, color: RGB = BLACK) => {
    doc.setFont(F, style);
    doc.setFontSize(pt);
    doc.setTextColor(...color);
  };
  const img = (data: Img, fmt: string, ...box: [number, number, number, number]) => {
    try { doc.addImage(data, formatOf(data, fmt), ...box); } catch { /* unreadable image: leave the space */ }
  };

  // ── Page furniture ──────────────────────────────────────────────────
  function furniture() {
    img(art.watermark, "PNG", 145.0, 152.06, 39.56, 88.14);
    img(art.logo, "PNG", 14.31, 5.93, 38.69, 25.57);
    doc.setFillColor(...GOLD);
    doc.rect(0, 271.15, 210, 1.52, "F");
    doc.setFillColor(...BROWN);
    doc.rect(0, 272.67, 210, 2.79, "F");
    font("bold", 10, GOLD);
    doc.text(FOOTER_LEFT, 14.9, 279.99);
    doc.text(FOOTER_RIGHT, 191.35, 279.99, { align: "right" });
  }
  function newPage() {
    doc.addPage();
    furniture();
  }

  furniture();
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.42);
  doc.line(14.31, 34.08, 190.42, 34.08);

  font("bold", 10);
  doc.text(`Report No.: ${report.reportNumber}`, 14.56, 39.45);
  if (update) doc.text(`Update ${update.n}`, 190.42, 39.45, { align: "right" });

  font("bold", 18);
  const title = "FAULT REPORT";
  const tw = doc.getTextWidth(title);
  doc.text(title, 104.27, 46.5, { align: "center" });
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.4);
  doc.line(104.27 - tw / 2, 47.45, 104.27 + tw / 2, 47.45);

  doc.setLineWidth(0.176);
  doc.setDrawColor(...BLACK);
  let y = 51.82;

  /** "15th July 2025" with the suffix raised, as in the template */
  function dateText(dateGB: string, x0: number, base: number) {
    const [d, m, yy] = dateGB.split("/").map(Number);
    if (!d || !m || !yy) { doc.text(dateGB, x0, base); return; }
    font("normal");
    doc.text(String(d), x0, base);
    let cx = x0 + doc.getTextWidth(String(d));
    font("normal", BODY_PT * 0.62);
    doc.text(ordinal(d), cx, base - 1.35);
    cx += doc.getTextWidth(ordinal(d));
    font("normal");
    doc.text(` ${MONTHS[m - 1]} ${yy}`, cx, base);
  }

  // Wrapped value lines for a cell of width w
  const wrap = (text: string, w: number) => {
    font("normal");
    return doc.splitTextToSize(text || "-", w - 2 * PAD) as string[];
  };

  /** Label | value row; grows for wrapped values */
  function row(label: string, value: string | ((x0: number, base: number) => void), minH = ROW, labelW = LABEL_W, left = L, width = W) {
    const lines = typeof value === "string" ? wrap(value, width - labelW) : [""];
    const h = (lines.length - 1) * LINE + minH;
    if (y + h > PAGE_BOTTOM) { newPage(); y = 36; }
    doc.rect(left, y, labelW, h);
    doc.rect(left + labelW, y, width - labelW, h);
    font("bold");
    doc.text(label, left + PAD, y + BASE);
    if (typeof value === "string") { font("normal"); doc.text(lines, left + labelW + PAD, y + BASE, { lineHeightFactor: LINE / (BODY_PT * 0.3528) }); }
    else value(left + labelW + PAD, y + BASE);
    y += h;
  }

  function header(text: string) {
    if (y + HEAD + ROW > PAGE_BOTTOM) { newPage(); y = 36; }
    doc.setFillColor(...HEAD_FILL);
    doc.rect(L, y, W, HEAD, "FD");
    font("bold");
    doc.text(text, L + PAD, y + 3.75);
    y += HEAD;
  }

  /** Full-width text box (description) */
  function textBox(text: string, minH: number) {
    const lines = wrap(text, W);
    const h = Math.max(minH, lines.length * LINE + 4.94);
    doc.rect(L, y, W, h);
    font("normal");
    doc.text(lines, L + PAD, y + 3.43, { lineHeightFactor: LINE / (BODY_PT * 0.3528) });
    y += h;
  }

  /** Full-width row with a bold lead-in ("Action Taken:  …") */
  function leadRow(lead: string, text: string, minH: number) {
    font("bold");
    const leadW = doc.getTextWidth(lead + "  ");
    const lines = text ? wrap(text, W - leadW) : [];
    const h = Math.max(minH, (Math.max(1, lines.length) - 1) * LINE + ROW);
    doc.rect(L, y, W, h);
    font("bold");
    doc.text(lead, L + PAD, y + BASE);
    if (lines.length) { font("normal"); doc.text(lines, L + PAD + leadW, y + BASE, { lineHeightFactor: LINE / (BODY_PT * 0.3528) }); }
    y += h;
  }

  // ── Fault ───────────────────────────────────────────────────────────
  const designation = report.reporterDesignation?.trim() || x.designation;
  const reportedBy = designation ? `${report.operatorName} (${designation})` : report.operatorName;
  row("Fault:", faultTitle(report));
  row("Location:", report.location?.trim() || LOCATION);
  row("Reported by:", reportedBy);
  row("Date:", (x0, b) => dateText(report.date, x0, b));
  y += GAP;

  header("EQUIPMENT NAME AND DETAIL:");
  row("Name:", report.vehicle || "RESCUE 2", 7.02);
  row("Asset No.:", report.fleetNumber || "-", 7.12);
  y += GAP;

  header("BREIF DESCRIPTION OF FAULT:");
  textBox(report.detailsOfDefects || report.faultSummary, 21.5);
  y += GAP;

  header("ACTION TAKEN / RECOMMENDATION:");
  // The original report's own action and recommendation; an update prints maintenance's
  const actionTaken = update ? update.entry.text || "-" : report.actionTaken?.trim() || defaultActionTaken(report.priority);
  const recommendation = update ? update.entry.recommendation?.trim() || "-" : report.recommendation?.trim() || DEFAULT_RECOMMENDATION;
  leadRow("Action Taken:", actionTaken, 5.34);
  leadRow("Recommendation:", recommendation, 7.11);

  // ── Signature block ─────────────────────────────────────────────────
  if (y + 52 > PAGE_BOTTOM) { newPage(); y = 36; }
  const sigTop = y + 25.48;
  font("bold");
  doc.text("SIGNATURE:", 95.33, sigTop - 4.62);
  // The original is signed by the reporter, an update by the maintenance officer who wrote it
  const signer = update
    ? { sig: x.signatures.update, name: update.entry.by, designation: update.entry.designation || "Maintenance", date: new Date(update.entry.at).toLocaleDateString("en-GB") }
    : { sig: x.signatures.operator, name: report.operatorName, designation: designation || "-", date: report.date };
  if (signer.sig) fitImage(signer.sig, "PNG", 115, sigTop - 12.6, 24, 14.2, "bottom");
  y = sigTop;
  const SL = 93.64, SW = 194.23 - 93.64, SLW = 25.49;
  row("NAME:", signer.name, 6.01, SLW, SL, SW);
  row("DESIGNATION:", signer.designation, 6.1, SLW, SL, SW);
  row("DATE:", (x0, b) => dateText(signer.date, x0, b), 5.84, SLW, SL, SW);

  const photos = update ? [] : x.photos;
  if (photos.length) {
    y += 7.2;
    // ➢ drawn, since the template's Wingdings arrow isn't in the font
    doc.setFillColor(...NOTE);
    doc.triangle(20.91, y - 2.6, 20.91, y - 0.6, 22.61, y - 1.6, "F");
    font("bolditalic", 12.2, NOTE);
    doc.text(`Photos are attached on the following page${photos.length > 1 ? "s" : ""} for the reference.`, 27.09, y);
  }

  // ── Photos: one per page, full width, straight after page 1 as in the template; sign-offs last ────────────
  for (const p of photos) {
    newPage();
    fitImage(p, "JPEG", 14.31, 32.3, 180.0, 135.2, "top");
  }

  // ── Sign-offs, when recorded (same table style): the action taken and recommendation are on page 1 ──
  // The original carries the shift in-charge sign-off (and, on reports from before updates, the repair);
  // the last update of a closed report carries the acceptance test
  const rp = report.repair ?? {};
  const ac = report.acceptance ?? {};
  const legacy = !update && !report.updates?.some((u) => u.kind === "action");
  const sh = update ? undefined : report.shiftSignoff;
  const hasRepair = legacy && !!(rp.details || rp.repairedBy || rp.repairedBySignature || rp.desiredStartDate || rp.requiredEndDate);
  const hasAccept = (update ? update.withAcceptance : legacy) && Object.values(ac).some(Boolean);
  if (sh || hasRepair || hasAccept) {
    newPage();
    font("bold", 10);
    doc.text(`Report No.: ${report.reportNumber}`, 14.56, 39.45);
    if (update) doc.text(`Update ${update.n}`, 190.42, 39.45, { align: "right" });
    doc.setLineWidth(0.176);
    doc.setDrawColor(...BLACK);
    y = 44;
    const sigRow = (label: string, name: string | undefined, sig?: Img) => {
      row(label, name || "-", sig ? 16 : ROW);
      if (sig) fitImage(sig, "PNG", R - 46, y - 15, 44, 14, "center");
    };
    const when = (d?: string, t?: string) => [d, t].filter(Boolean).join(" ") || "-";
    const stamp = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    if (sh) {
      header("SHIFT IN-CHARGE:");
      sigRow("Name:", sh.name, x.signatures.shift);
      row("Signed:", stamp(sh.signedAt));
      y += GAP;
    }
    if (hasRepair) {
      header("REPAIR:");
      if (rp.details) row("Action taken:", rp.details);
      if (rp.remarks) row("Recommendation:", rp.remarks);
      sigRow("Repaired by:", rp.repairedBy, x.signatures.repair);
      if (report.repairStartedAt) row("Recorded:", stamp(report.repairStartedAt));
      // Reports from before the template change may carry a schedule
      if (rp.desiredStartDate) row("Desired start:", when(rp.desiredStartDate, rp.desiredStartTime));
      if (rp.requiredEndDate) row("Required end:", when(rp.requiredEndDate, rp.requiredEndTime));
      y += GAP;
    }
    if (hasAccept) {
      header("ACCEPTANCE TEST:");
      row("Date / time:", when(ac.date, ac.time));
      if (ac.requiredEndDate) row("Required end:", when(ac.requiredEndDate, ac.requiredEndTime));
      row("Comments:", ac.comments || "-");
      sigRow("Maintenance:", ac.maintenanceName, x.signatures.maintenance);
      sigRow("ARFF:", ac.arffName, x.signatures.arff);
    }
  }

  return doc;

  /** Draws an image inside a box, keeping its proportions */
  function fitImage(data: Img, fmt: string, bx: number, by: number, bw: number, bh: number, align: "top" | "bottom" | "center") {
    let w = bw, h = bh;
    try {
      const p = doc.getImageProperties(data);
      const s = Math.min(bw / p.width, bh / p.height);
      w = p.width * s; h = p.height * s;
    } catch { /* unknown size: fill the box */ }
    const ox = align === "center" ? bx + (bw - w) / 2 : align === "top" ? bx + (bw - w) / 2 : bx;
    const oy = align === "bottom" ? by + bh - h : align === "center" ? by + (bh - h) / 2 : by;
    img(data, fmt, ox, oy, w, h);
  }
}
