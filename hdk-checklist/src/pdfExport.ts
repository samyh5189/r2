import jsPDF from "jspdf";
import type { InspectionLog, FaultReport } from "./types";
import { RACL_LOGO } from "./raclLogo";
import { KIND_LABEL, logKind } from "./checkKinds";
import { ENGINE_HOURS_ID, itemType } from "./checklistData";
import type { MonthlySummary } from "./monthlySummary";
import { getOperators, imageData } from "./storage";
import { buildFaultReportPdf, type FaultReportArt } from "./faultReportPdf";
import FR_LOGO from "./assets/fault-report/racl-logo.png";
import FR_WATERMARK from "./assets/fault-report/watermark.png";
import FR_FONT from "./assets/fault-report/carlito-regular.ttf?url";
import FR_FONT_BOLD from "./assets/fault-report/carlito-bold.ttf?url";
import FR_FONT_BOLDITALIC from "./assets/fault-report/carlito-bolditalic.ttf?url";
import type { QrItem } from "./components/QrCodes";

type RGB = [number, number, number];

export interface PdfFile {
  blob: Blob;
  filename: string;
}

function toFile(doc: jsPDF, filename: string): PdfFile {
  return { blob: doc.output("blob"), filename };
}

// Strip near-white pixels from a PNG data URL (for transparent signature rendering).
// Older signatures were captured with a light background; this makes them transparent.
async function stripWhiteBg(src: string): Promise<string> {
  // Uploaded signatures are links; jsPDF needs the image itself
  const dataUrl = await imageData(src).catch(() => "");
  if (!dataUrl) return "";
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

// Logo on a white tile so its brown/gold reads on the navy header bars
const LOGO_RATIO = 212 / 321;
function logoTile(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, w, h, 1, 1, "F");
  const lh = h - 1.6;
  const lw = Math.min(w - 2, lh / LOGO_RATIO);
  doc.addImage(RACL_LOGO, "PNG", x + (w - lw) / 2, y + (h - lw * LOGO_RATIO) / 2, lw, lw * LOGO_RATIO);
}

function header(doc: jsPDF, checklistName: string) {
  doc.setFillColor(...NAVY);
  doc.rect(10, 8, 190, 18, "F");
  logoTile(doc, 174, 9.5, 24, 15);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("REGIONAL AIRPORTS COMPANY LTD", 92, 14, { align: "center" });
  doc.setFontSize(8.5);
  doc.text(
    "AIRPORT RESCUE AND FIREFIGHTING DEPARTMENT — KULHUDHUFFUSHI AIRPORT (HDK)",
    92,
    18.5,
    { align: "center" }
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(
    `RESCUE 2  |  SECTION ONE — VEHICLE OPERATORS  |  ${checklistName}`,
    92,
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
}

// Page numbers go in once the page count is known (periodic checklists vary in length)
function numberPages(doc: jsPDF, headerPages: number[]) {
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GREY);
  for (const p of headerPages) {
    doc.setPage(p);
    doc.text(`Page ${p} of ${doc.getNumberOfPages()}`, 198, 31, { align: "right" });
  }
}

export async function exportInspectionPDF(log: InspectionLog) {
  const sig = log.operatorSignature ? await stripWhiteBg(log.operatorSignature) : "";
  const shiftSig = log.shiftSignoff ? await stripWhiteBg(log.shiftSignoff.signature) : "";
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const kind = logKind(log);
  const checklistName = `${KIND_LABEL[kind]} Inspection Checklist`;
  const headerPages = [1];
  header(doc, checklistName);

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
      header(doc, checklistName);
      headerPages.push(doc.getNumberOfPages());
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
        header(doc, checklistName);
        headerPages.push(doc.getNumberOfPages());
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
      const isValue = itemType(item) !== "status";
      doc.text(isValue && item.status === "OK" ? "" : item.status || "—", 140, y + 3.8);
      doc.setTextColor(...GREY);
      doc.setFont("helvetica", "normal");
      if (item.remarks) doc.text(`${item.remarks}${isValue && item.unit ? ` ${item.unit}` : ""}`.substring(0, 40), 155, y + 3.8);
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

  if (log.operatorSignature || log.shiftSignoff) {
    if (y > 255) { doc.addPage(); y = 40; }
    const sigBlock = (x: number, title: string, img: string, name: string) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(0, 0, 0);
      doc.text(title, x, y + 5);
      if (img) doc.addImage(img, "PNG", x, y + 7, 60, 20);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...GREY);
      doc.text(name, x, y + 30);
    };
    if (log.operatorSignature) sigBlock(12, "Operator Signature:", sig, log.operatorName);
    if (log.shiftSignoff) sigBlock(110, "Shift In-Charge Sign-off:", shiftSig, `${log.shiftSignoff.name} · ${new Date(log.shiftSignoff.signedAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}`);
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

  numberPages(doc, headerPages);
  return toFile(doc, `HDK-${kind === "daily" ? "Checklist" : `${KIND_LABEL[kind]}-Checklist`}-${log.date.replace(/\//g, "-")}-${log.operatorName}.pdf`);
}

// Template art and fonts, fetched once on the first fault report
let artPromise: Promise<FaultReportArt> | null = null;
function loadArt(): Promise<FaultReportArt> {
  const bytes = (url: string) => fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((b) => new Uint8Array(b));
  const b64 = async (url: string) => {
    const u8 = await bytes(url);
    let bin = "";
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  artPromise ??= Promise.all([
    bytes(FR_LOGO), bytes(FR_WATERMARK),
    Promise.all([b64(FR_FONT), b64(FR_FONT_BOLD), b64(FR_FONT_BOLDITALIC)]).catch(() => null),
  ]).then(([logo, watermark, f]) => ({ logo, watermark, fonts: f ? { regular: f[0], bold: f[1], boldItalic: f[2] } : undefined }))
    .catch((e) => { artPromise = null; throw e; });
  return artPromise;
}

/**
 * The fault report in the RACL template (see faultReportPdf.ts). With `updateId`, that maintenance
 * update printed as its own report under the same number.
 */
export async function exportFaultReportPDF(report: FaultReport, updateId?: string) {
  const actions = (report.updates ?? []).filter((u) => u.kind === "action");
  const i = updateId ? actions.findIndex((u) => u.id === updateId) : -1;
  const view = i >= 0 ? { entry: actions[i], n: i + 1, withAcceptance: report.status === "Resolved" && i === actions.length - 1 } : undefined;
  const clean = (d?: string) => (d ? stripWhiteBg(d) : Promise.resolve(undefined));
  const photoSrcs = report.faults.flatMap((f) => f.evidence ?? []).filter((ev) => ev.type === "photo").map((ev) => ev.dataUrl);
  const [art, operators, operator, shift, repair, maintenance, arff, update, photos] = await Promise.all([
    loadArt(),
    getOperators().catch(() => []),
    clean(report.operatorSignature),
    clean(report.shiftSignoff?.signature),
    clean(report.repair?.repairedBySignature),
    clean(report.acceptance?.maintenanceSignature),
    clean(report.acceptance?.arffSignature),
    clean(view?.entry.signature),
    Promise.all(photoSrcs.map((src) => imageData(src).catch(() => ""))),
  ]);
  const me = operators.find((o) => o.name.trim().toLowerCase() === report.operatorName.trim().toLowerCase());
  const doc = buildFaultReportPdf(report, {
    designation: me?.rank?.trim() || "ARFF",
    signatures: { operator, shift, repair, maintenance, arff, update },
    photos: photos.filter(Boolean),
  }, art, view);
  return toFile(doc, `${report.reportNumber.replace(/\//g, "-")}${view ? `-Update-${view.n}` : ""}.pdf`);
}

/**
 * Weekly sheet of the daily inspections (Sat–Fri). One column per day; a day with more than one
 * inspection shows the most serious answer, a missed day is greyed. Fault remarks are numbered in
 * the Notes column and written out in full after the table, then operator and in-charge signatures.
 */
export async function exportWeeklyPDF(logs: InspectionLog[]) {
  if (logs.length === 0) return;
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const DAY_NAMES = ["Sat","Sun","Mon","Tue","Wed","Thu","Fri"];
  const parseGB = (s: string) => { const [d, m, y] = s.split("/").map(Number); return new Date(y, m - 1, d); };
  const fmtGB = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  const shortName = (n: string) => { const p = n.trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0]; };
  const initials = (n: string) => n.trim().split(/\s+/).map((p) => p[0]?.toUpperCase() ?? "").join("").slice(0, 3);

  // The week (Sat–Fri) of the most recent log, and each day's inspections in time order
  const latest = logs.map((l) => parseGB(l.date)).sort((a, b) => b.getTime() - a.getTime())[0];
  const weekStart = new Date(latest);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 1) % 7));
  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i));
  const dayLogs = days.map((d) => logs.filter((l) => l.date === fmtGB(d)).sort((a, b) => a.time.localeCompare(b.time)));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const missed = days.map((d, i) => dayLogs[i].length === 0 && d.getTime() < today.getTime());
  const templateLog = [...dayLogs].reverse().find((l) => l.length > 0)!.slice(-1)[0];
  // Signature images by their source (operators often reuse a saved signature)
  const sources = [...new Set(logs.flatMap((l) => [l.operatorSignature, l.shiftSignoff?.signature ?? ""]).filter(Boolean))];
  const sigs = new Map(await Promise.all(sources.map(async (src) => [src, await stripWhiteBg(src)] as const)));

  const RANK: Record<string, number> = { "U/S": 4, NOK: 3, OK: 2, NA: 1, "": 0 };
  /** A day's answer for an item: the most serious across that day's inspections; readings use the last one */
  function dayAnswer(di: number, secId: string, itemId: string) {
    let best: { status: string; remarks: string } | null = null;
    for (const l of dayLogs[di]) {
      const it = l.sections.find((s) => s.id === secId)?.items.find((i) => i.id === itemId)
        ?? l.sections.flatMap((s) => s.items).find((i) => i.id === itemId);
      if (!it) continue;
      if (!best || RANK[it.status] >= RANK[best.status]) best = { status: it.status, remarks: it.remarks };
    }
    return best;
  }

  // Notes: one per item + remark, listing the days it was recorded
  interface Note { n: number; item: string; status: string; remark: string; days: string[]; operators: Set<string> }
  const notes: Note[] = [];
  const noteFor = new Map<string, Note>();

  const range = `${days[0].getDate()} ${MONTHS[days[0].getMonth()]}${days[0].getFullYear() !== days[6].getFullYear() ? ` ${days[0].getFullYear()}` : ""} – ${days[6].getDate()} ${MONTHS[days[6].getMonth()]} ${days[6].getFullYear()}`;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const M = 10, PW = 210, TW = PW - 2 * M, BOTTOM = 282;
  const NUM_W = 7, DESC_W = 70, DAY_W = 13, NOTE_W = TW - NUM_W - DESC_W - 7 * DAY_W; // 22
  const DAYS_X = M + NUM_W + DESC_W, NOTE_X = DAYS_X + 7 * DAY_W;
  const H_DAY = 5, H_DATE = 3.8, H_OP = 3.6, H_ITEM = 5.4;
  const HEAD_BG: RGB = [232, 238, 246], PART_BG: RGB = [36, 62, 98], SEC_BG: RGB = [221, 228, 238];
  const LINE: RGB = [196, 201, 209], OK_BG: RGB = [226, 248, 234], NOK_BG: RGB = [254, 243, 199], US_BG: RGB = [254, 226, 226];
  const MISS_BG: RGB = [241, 242, 244];

  function drawTick(cx: number, cy: number, scale: number) {
    doc.setDrawColor(0, 130, 55);
    doc.setLineWidth(0.5 * scale);
    doc.setLineCap("round"); doc.setLineJoin("round");
    doc.lines([[1.1 * scale, 1.1 * scale], [2.1 * scale, -2.4 * scale]], cx - 1.6 * scale, cy + 0.05 * scale, [1, 1], "S");
    doc.setLineCap("butt"); doc.setLineJoin("miter");
  }
  const cellFill = (x: number, y0: number, h: number, c: RGB) => { doc.setFillColor(...c); doc.rect(x + 0.2, y0 + 0.2, DAY_W - 0.4, h - 0.4, "F"); };

  let y = 0;

  // ── First page: letterhead, week and summary ─────────────────────────
  header(doc, "Weekly Inspection Log — Daily Checks");
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...NAVY);
  doc.text(`Week ${range}`, PW - M - 2, 31, { align: "right" });
  y = 39;

  const inspectedDays = dayLogs.filter((d) => d.length > 0).length;
  const elapsedDays = days.filter((d) => d.getTime() <= today.getTime()).length;
  const faultItems = new Set<string>();
  for (const dl of dayLogs) for (const l of dl) for (const s of l.sections) for (const it of s.items) if (it.status === "NOK" || it.status === "U/S") faultItems.add(it.id);
  const operators = [...new Set(logs.map((l) => l.operatorName.trim()))];
  const tiles: [string, string][] = [
    [`${inspectedDays} / ${Math.min(7, Math.max(elapsedDays, inspectedDays))}`, "days inspected"],
    [String(logs.length), logs.length === 1 ? "inspection" : "inspections"],
    [String(faultItems.size), faultItems.size === 1 ? "item with a fault" : "items with faults"],
    [String(operators.length), operators.length === 1 ? "operator" : "operators"],
  ];
  const tileW = (TW - 3 * 3) / 4;
  tiles.forEach(([big, small], i) => {
    const x = M + i * (tileW + 3);
    doc.setFillColor(...LIGHT); doc.roundedRect(x, y, tileW, 11, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...(i === 2 && faultItems.size ? [180, 83, 9] as RGB : NAVY));
    doc.text(big, x + 4, y + 7.2);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.3); doc.setTextColor(...GREY);
    doc.text(small, x + 4 + doc.getTextWidth(big) * (10 / 6.3) + 2, y + 7);
  });
  y += 14;
  doc.setFont("helvetica", "italic"); doc.setFontSize(6); doc.setTextColor(...GREY);
  doc.text("To be inspected and filled out by the assigned vehicle operators. Where a day has more than one inspection, the most serious answer is shown.", M, y + 1);
  y += 4;
  drawColumnHeaders();

  function continuationHeader() {
    doc.setFillColor(...NAVY); doc.rect(M, 8, TW, 7, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(7);
    doc.text("RESCUE 2  |  Weekly Inspection Log — Daily Checks", M + 3, 12.6);
    doc.setFont("helvetica", "normal");
    doc.text(`Week ${range}  (continued)`, PW - M - 3, 12.6, { align: "right" });
    y = 17;
  }

  function drawColumnHeaders() {
    const H = H_DAY + H_DATE + H_OP;
    doc.setFillColor(...HEAD_BG); doc.rect(M, y, TW, H, "F");
    doc.setDrawColor(...LINE); doc.setLineWidth(0.25);
    doc.rect(M, y, NUM_W, H, "D"); doc.rect(M + NUM_W, y, DESC_W, H, "D"); doc.rect(NOTE_X, y, NOTE_W, H, "D");
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(20, 30, 50);
    doc.text("#", M + NUM_W / 2, y + H / 2 + 1.2, { align: "center" });
    doc.text("Item inspected", M + NUM_W + 2, y + H / 2 + 1.2);
    doc.text("Notes", NOTE_X + NOTE_W / 2, y + H / 2 + 1.2, { align: "center" });
    for (let i = 0; i < 7; i++) {
      const x = DAYS_X + i * DAY_W;
      if (missed[i]) { doc.setFillColor(...MISS_BG); doc.rect(x, y, DAY_W, H, "F"); }
      doc.rect(x, y, DAY_W, H, "D");
      doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...(missed[i] ? [150, 150, 150] as RGB : [20, 30, 50] as RGB));
      doc.text(DAY_NAMES[i], x + DAY_W / 2, y + 3.6, { align: "center" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(5.6);
      doc.text(`${days[i].getDate()} ${MONTHS[days[i].getMonth()]}`, x + DAY_W / 2, y + H_DAY + 2.8, { align: "center" });
      doc.setFontSize(5); doc.setFont("helvetica", "bold");
      doc.setTextColor(...(missed[i] ? [185, 28, 28] as RGB : [40, 80, 140] as RGB));
      const who = missed[i] ? "MISSED" : dayLogs[i].map((l) => initials(l.operatorName)).join("+");
      doc.text(who, x + DAY_W / 2, y + H_DAY + H_DATE + 2.6, { align: "center" });
    }
    y += H;
  }

  // Column headings repeat on new pages only while the item table continues
  let inTable = true;
  function ensure(h: number) {
    if (y + h > BOTTOM) { doc.addPage(); continuationHeader(); if (inTable) drawColumnHeaders(); }
  }

  function bandRow(title: string, bg: RGB, fg: RGB, h: number, size: number) {
    ensure(h + H_ITEM);
    doc.setFillColor(...bg); doc.rect(M, y, TW, h, "F");
    doc.setTextColor(...fg); doc.setFont("helvetica", "bold"); doc.setFontSize(size);
    doc.text(title, M + 2.5, y + h / 2 + size * 0.13);
    y += h;
  }

  function itemRow(secId: string, itemId: string, label: string, isValue: boolean, n: number) {
    ensure(H_ITEM);
    doc.setFillColor(...(n % 2 ? WHITE : [248, 249, 251] as RGB)); doc.rect(M, y, TW, H_ITEM, "F");
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2);
    doc.rect(M, y, NUM_W, H_ITEM, "D"); doc.rect(M + NUM_W, y, DESC_W, H_ITEM, "D"); doc.rect(NOTE_X, y, NOTE_W, H_ITEM, "D");
    const mid = y + H_ITEM / 2 + 1.1;
    doc.setFont("helvetica", "normal"); doc.setFontSize(5.8); doc.setTextColor(130, 130, 130);
    doc.text(String(n), M + NUM_W / 2, mid, { align: "center" });
    doc.setFontSize(6.4); doc.setTextColor(15, 23, 42);
    const text = itemId === ENGINE_HOURS_ID ? "Engine Running Hours" : label;
    doc.text(doc.splitTextToSize(text, DESC_W - 3)[0], M + NUM_W + 2, mid);

    const rowNotes: number[] = [];
    for (let di = 0; di < 7; di++) {
      const x = DAYS_X + di * DAY_W;
      if (missed[di]) { doc.setFillColor(...MISS_BG); doc.rect(x, y, DAY_W, H_ITEM, "F"); }
      doc.setDrawColor(...LINE); doc.rect(x, y, DAY_W, H_ITEM, "D");
      const a = dayAnswer(di, secId, itemId);
      if (!a) continue;
      if (isValue) {
        if (!a.remarks) continue;
        const bad = a.status === "NOK" || a.status === "U/S";
        cellFill(x, y, H_ITEM, bad ? NOK_BG : OK_BG);
        doc.setFont("helvetica", "bold"); doc.setFontSize(5.4); doc.setTextColor(...(bad ? [160, 80, 0] as RGB : [6, 95, 70] as RGB));
        doc.text(doc.splitTextToSize(a.remarks, DAY_W - 1)[0], x + DAY_W / 2, mid, { align: "center" });
        continue;
      }
      if (a.status === "OK") { cellFill(x, y, H_ITEM, OK_BG); drawTick(x + DAY_W / 2, y + H_ITEM / 2, 0.95); }
      else if (a.status === "NA") { doc.setTextColor(160, 160, 160); doc.setFontSize(7); doc.text("–", x + DAY_W / 2, mid + 0.2, { align: "center" }); }
      else if (a.status === "NOK" || a.status === "U/S") {
        const us = a.status === "U/S";
        cellFill(x, y, H_ITEM, us ? US_BG : NOK_BG);
        doc.setFont("helvetica", "bold"); doc.setFontSize(5.6); doc.setTextColor(...(us ? [185, 28, 28] as RGB : [160, 80, 0] as RGB));
        doc.text(a.status, x + DAY_W / 2, mid, { align: "center" });
        const key = `${itemId}|${a.status}|${a.remarks.trim().toLowerCase()}`;
        let note = noteFor.get(key);
        if (!note) { note = { n: notes.length + 1, item: text, status: a.status, remark: a.remarks.trim(), days: [], operators: new Set() }; notes.push(note); noteFor.set(key, note); }
        note.days.push(DAY_NAMES[di]);
        dayLogs[di].forEach((l) => note!.operators.add(l.operatorName));
        if (!rowNotes.includes(note.n)) rowNotes.push(note.n);
      }
    }
    if (rowNotes.length) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(5.8); doc.setTextColor(...NAVY);
      doc.text(rowNotes.map((n) => `Note ${n}`).join(", "), NOTE_X + NOTE_W / 2, mid, { align: "center" });
    }
    doc.setFont("helvetica", "normal");
    y += H_ITEM;
  }

  // ── Table ─────────────────────────────────────────────────────────────
  let lastPart = "";
  let n = 0;
  for (const sec of templateLog.sections) {
    let part = "", label = sec.title;
    if (sec.title.startsWith("PART ")) {
      const dash = sec.title.indexOf(" — ");
      part = dash > 0 ? sec.title.slice(0, dash) : sec.title;
      label = dash > 0 ? sec.title.slice(dash + 3) : "";
    }
    if (part && part !== lastPart) { bandRow(part, PART_BG, [255, 255, 255], 5.6, 6.6); lastPart = part; }
    if (label) bandRow(label, SEC_BG, [20, 40, 80], 4.8, 6.3);
    for (const it of sec.items) itemRow(sec.id, it.id, it.label, itemType(it) !== "status", ++n);
  }

  inTable = false;

  // ── Notes: faults and remarks in full ────────────────────────────────
  if (notes.length) {
    y += 5;
    bandRow("FAULTS AND REMARKS THIS WEEK", PART_BG, [255, 255, 255], 5.6, 6.6);
    const cols = [14, 50, 12, 24, 90]; // note, item, status, days, remark
    const heads = ["Note", "Item", "Status", "Days", "Remark (operator)"];
    ensure(5);
    doc.setFillColor(...HEAD_BG); doc.rect(M, y, TW, 5, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(20, 30, 50);
    let cx = M;
    heads.forEach((h, i) => { doc.text(h, cx + 2, y + 3.4); cx += cols[i]; });
    y += 5;
    for (const note of notes) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.2);
      const remark = `${note.remark || "No remark"} (${[...note.operators].map(shortName).join(", ")})`;
      const lines = doc.splitTextToSize(remark, cols[4] - 4) as string[];
      const h = Math.max(5, lines.length * 2.8 + 2.2);
      ensure(h);
      doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(M, y + h, M + TW, y + h);
      cx = M;
      doc.setFont("helvetica", "bold"); doc.setTextColor(...NAVY); doc.text(`Note ${note.n}`, cx + 2, y + 3.4); cx += cols[0];
      doc.setFont("helvetica", "normal"); doc.setTextColor(15, 23, 42); doc.text(doc.splitTextToSize(note.item, cols[1] - 3)[0], cx + 2, y + 3.4); cx += cols[1];
      doc.setFont("helvetica", "bold"); doc.setTextColor(...(note.status === "U/S" ? [185, 28, 28] as RGB : [160, 80, 0] as RGB)); doc.text(note.status, cx + 2, y + 3.4); cx += cols[2];
      doc.setFont("helvetica", "normal"); doc.setTextColor(15, 23, 42); doc.text(note.days.join(", "), cx + 2, y + 3.4); cx += cols[3];
      doc.setTextColor(55, 65, 81); doc.text(lines, cx + 2, y + 3.4);
      y += h;
    }
  }

  // ── Signatures: operator and shift in-charge, per day ────────────────
  const SIG_H = 19, LABEL_W = 20, cellW = (TW - LABEL_W) / 7;
  y += 5;
  ensure(5.6 + 5 + SIG_H * 2);
  bandRow("SIGNATURES", PART_BG, [255, 255, 255], 5.6, 6.6);
  doc.setFillColor(...HEAD_BG); doc.rect(M, y, TW, 5, "F");
  doc.setDrawColor(...LINE); doc.setLineWidth(0.25); doc.rect(M, y, LABEL_W, 5, "D");
  for (let i = 0; i < 7; i++) {
    const x = M + LABEL_W + i * cellW;
    doc.rect(x, y, cellW, 5, "D");
    doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(20, 30, 50);
    doc.text(`${DAY_NAMES[i]} ${days[i].getDate()} ${MONTHS[days[i].getMonth()]}`, x + cellW / 2, y + 3.4, { align: "center" });
  }
  y += 5;

  function sigRow(label: string, pick: (l: InspectionLog) => { name: string; sig?: string; note: string } | null) {
    doc.setFillColor(...LIGHT); doc.rect(M, y, LABEL_W, SIG_H, "F");
    doc.setDrawColor(...LINE); doc.rect(M, y, LABEL_W, SIG_H, "D");
    doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(20, 30, 50);
    doc.text(doc.splitTextToSize(label, LABEL_W - 3), M + 2, y + SIG_H / 2);
    for (let i = 0; i < 7; i++) {
      const x = M + LABEL_W + i * cellW;
      if (missed[i]) { doc.setFillColor(...MISS_BG); doc.rect(x, y, cellW, SIG_H, "F"); }
      doc.setDrawColor(...LINE); doc.rect(x, y, cellW, SIG_H, "D");
      const entries = dayLogs[i].map(pick).filter((e): e is NonNullable<typeof e> => e != null);
      if (entries.length === 0) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(5.4); doc.setTextColor(160, 160, 160);
        doc.text(missed[i] ? "Not inspected" : dayLogs[i].length ? "Not signed off" : "", x + cellW / 2, y + SIG_H / 2 + 1, { align: "center" });
        continue;
      }
      const w = (cellW - 2) / entries.length;
      entries.forEach((e, k) => {
        const sx = x + 1 + k * w;
        const img = e.sig ? sigs.get(e.sig) : "";
        if (img) { try { doc.addImage(img, "PNG", sx + 0.5, y + 1.5, w - 1, SIG_H - 9); } catch { /* unreadable signature */ } }
        doc.setFont("helvetica", "bold"); doc.setFontSize(entries.length > 1 ? 4.6 : 5.2); doc.setTextColor(30, 41, 59);
        doc.text(doc.splitTextToSize(shortName(e.name), w - 0.5)[0], sx + w / 2, y + SIG_H - 4.2, { align: "center" });
        doc.setFont("helvetica", "normal"); doc.setTextColor(120, 120, 120);
        doc.text(e.note, sx + w / 2, y + SIG_H - 1.6, { align: "center" });
      });
    }
    y += SIG_H;
  }
  sigRow("Vehicle operator", (l) => ({ name: l.operatorName, sig: l.operatorSignature, note: l.time }));
  sigRow("Shift in-charge", (l) => l.shiftSignoff ? {
    name: l.shiftSignoff.name, sig: l.shiftSignoff.signature,
    note: new Date(l.shiftSignoff.signedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
  } : null);

  // ── Footer on every page: legend, generated time, page number ────────
  const total = doc.getNumberOfPages();
  const generated = new Date().toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(M, 288, PW - M, 288);
    doc.setFont("helvetica", "normal"); doc.setFontSize(5.8); doc.setTextColor(...GREY);
    drawTick(M + 1.6, 291.6, 0.55);
    doc.setTextColor(...GREY);
    doc.text("OK     NOK minor defect, operational     U/S unserviceable     – not applicable     grey = no inspection", M + 4, 292.4);
    doc.text(`HDK-ARFF/R2/CHK  ·  Generated ${generated}  ·  Page ${p} of ${total}`, PW - M, 292.4, { align: "right" });
  }

  const ws = `${String(days[0].getDate()).padStart(2, "0")}-${MONTHS[days[0].getMonth()]}`;
  const we = `${String(days[6].getDate()).padStart(2, "0")}-${MONTHS[days[6].getMonth()]}-${days[6].getFullYear()}`;
  return toFile(doc, `HDK-Weekly-${ws}-to-${we}.pdf`);
}

// ── Monthly summary (management report) ───────────────────────────────

export async function exportMonthlySummaryPDF(sum: MonthlySummary) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const M = 12, W = 186, BOTTOM = 280;
  let y = 0;

  function pageHeader() {
    doc.setFillColor(...NAVY);
    doc.rect(10, 8, 190, 18, "F");
    logoTile(doc, 174, 9.5, 24, 15);
    doc.setTextColor(...WHITE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("REGIONAL AIRPORTS COMPANY LTD", 92, 14, { align: "center" });
    doc.setFontSize(8.5);
    doc.text("AIRPORT RESCUE AND FIREFIGHTING DEPARTMENT — KULHUDHUFFUSHI AIRPORT (HDK)", 92, 18.5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(`RESCUE 2  |  Monthly Summary — ${sum.title}`, 92, 23, { align: "center" });
    y = 34;
  }

  function ensure(h: number) {
    if (y + h > BOTTOM) { doc.addPage(); pageHeader(); }
  }

  function heading(text: string) {
    ensure(14);
    doc.setFillColor(...NAVY);
    doc.rect(M, y, W, 6.5, "F");
    doc.setTextColor(...WHITE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(text.toUpperCase(), M + 2, y + 4.4);
    y += 11;
  }

  function line(label: string, value: string, color: RGB = [0, 0, 0]) {
    ensure(6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text(label, M + 2, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(value, W - 72) as string[];
    doc.text(lines, M + 70, y);
    y += 4.6 * lines.length + 0.8;
  }

  /** Simple striped table; widths in mm */
  function table(head: string[], rows: string[][], widths: number[], colors?: (RGB | null)[][]) {
    ensure(12);
    doc.setFillColor(...LIGHT);
    doc.rect(M, y - 3.6, W, 5.4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(...NAVY);
    let x = M + 2;
    head.forEach((h, i) => { doc.text(h, x, y); x += widths[i]; });
    y += 5;
    doc.setFont("helvetica", "normal");
    rows.forEach((row, ri) => {
      const cells = row.map((c, i) => doc.splitTextToSize(c, widths[i] - 3) as string[]);
      const h = Math.max(...cells.map((c) => c.length)) * 3.6 + 1.6;
      ensure(h + 2);
      if (ri % 2) { doc.setFillColor(248, 249, 251); doc.rect(M, y - 3.4, W, h, "F"); }
      x = M + 2;
      cells.forEach((c, i) => {
        doc.setTextColor(...(colors?.[ri]?.[i] ?? ([30, 30, 30] as RGB)));
        doc.text(c, x, y);
        x += widths[i];
      });
      y += h;
    });
    y += 2;
  }

  pageHeader();

  // Key figures
  const cov = sum.daysInPeriod ? Math.round((sum.daily.daysCovered / sum.daysInPeriod) * 100) : 0;
  const figures: [string, string][] = [
    [`${sum.daily.daysCovered}/${sum.daysInPeriod}`, `days inspected (${cov}%)`],
    [String(sum.faults.raised), "fault reports raised"],
    [String(sum.faults.resolvedInMonth), "faults resolved"],
    [sum.faults.avgDaysToClose == null ? "—" : sum.faults.avgDaysToClose.toFixed(1), "avg days to fix"],
    [String(sum.faults.openAtEnd.length), "open at month end"],
  ];
  const bw = (W - 4 * 3) / 5;
  figures.forEach(([v, l], i) => {
    const bx = M + i * (bw + 3);
    doc.setFillColor(...LIGHT);
    doc.roundedRect(bx, y, bw, 16, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...NAVY);
    doc.text(v, bx + bw / 2, y + 7.5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...GREY);
    doc.text(l, bx + bw / 2, y + 12.5, { align: "center" });
  });
  y += 23;

  heading("Daily inspections");
  line("Inspections submitted", String(sum.daily.inspections));
  line("Days covered", `${sum.daily.daysCovered} of ${sum.daysInPeriod} days`);
  line("Days missed", sum.daily.missedDates.length ? sum.daily.missedDates.map((d) => d.slice(0, 5)).join(", ") : "None", sum.daily.missedDates.length ? [180, 30, 30] : [0, 120, 60]);
  line("Inspections with faults", String(sum.daily.withFaults));
  line("Overall condition", Object.entries(sum.daily.conditions).map(([k, v]) => `${k}: ${v}`).join("   ") || "—");

  heading("Weekly, monthly and yearly checks");
  line("Weekly checks", sum.weekly.length ? sum.weekly.map((w) => `${w.date.slice(0, 5)} (${w.operator})`).join(", ") : "None this month", sum.weekly.length ? [0, 0, 0] : [180, 30, 30]);
  line("Monthly check", sum.monthly ? `Done ${sum.monthly.date} by ${sum.monthly.operator}` : "Not done", sum.monthly ? [0, 120, 60] : [180, 30, 30]);
  line(`Yearly check (${sum.month.slice(3)})`, sum.yearly ? `Done ${sum.yearly.date} by ${sum.yearly.operator}` : "Not done yet");

  heading("Faults");
  const p = sum.faults.byPriority;
  line("Raised by priority", `Immediate grounding: ${p["Immediate Grounding"]}   Urgent: ${p.Urgent}   Routine: ${p.Routine}`);
  line("Resolved this month", `${sum.faults.resolvedInMonth}${sum.faults.avgDaysToClose == null ? "" : ` — average ${sum.faults.avgDaysToClose.toFixed(1)} days to fix`}`);
  if (sum.faults.openAtEnd.length) {
    y += 1;
    table(
      ["Report", "Fault", "Priority", "Status", "Open"],
      sum.faults.openAtEnd.map((f) => [f.reportNumber, f.title, f.priority, f.status, `${Math.floor(f.ageDays)} d${f.overdue ? " (overdue)" : ""}`]),
      [34, 78, 30, 22, 22],
      sum.faults.openAtEnd.map((f) => [null, null, null, null, f.overdue ? ([180, 30, 30] as RGB) : null]),
    );
  } else {
    line("Open at month end", "None", [0, 120, 60]);
  }

  if (sum.topItems.length) {
    heading("Most frequent fault items");
    table(["Item", "Times marked NOK / U/S"], sum.topItems.map((t) => [t.label, String(t.count)]), [140, 46]);
  }

  heading("Engine and service");
  line("Engine hours", sum.engine.end == null ? "No readings this month" : `${sum.engine.start!.toFixed(1)} to ${sum.engine.end.toFixed(1)} h (${(sum.engine.used ?? 0).toFixed(1)} h used)`);
  const sv = sum.service;
  const svColor: RGB = sv.state === "overdue" ? [180, 30, 30] : sv.state === "soon" ? [200, 120, 0] : [0, 0, 0];
  line("Service status", sv.state === "unset" ? "Service schedule not set up" : sv.state === "ok" ? "OK" : sv.reasons.join("; "), svColor);
  if (sv.nextHours != null) line("Next service", `${sv.nextHours} h${sv.hoursLeft != null ? ` (${Math.round(sv.hoursLeft)} h left)` : ""}`);
  if (sv.dueByDate) line("Calendar due", sv.dueByDate.toLocaleDateString("en-GB"));

  if (sum.operators.length) {
    heading("Inspections by operator");
    table(["Operator", "Inspections"], sum.operators.map((o) => [o.name, String(o.count)]), [140, 46]);
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...GREY);
    doc.text(`Generated ${new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}  ·  Page ${i} of ${pages}`, 105, 290, { align: "center" });
  }
  return toFile(doc, `HDK-Monthly-Summary-${sum.month.replace("/", "-")}.pdf`);
}

// ── QR code sheet (stickers for the vehicle) ──────────────────────────

export async function exportQrSheetPDF(items: QrItem[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const CELL_W = 90, CELL_H = 128, GAP = 6;
  items.forEach((q, i) => {
    const x = 12 + (i % 2) * (CELL_W + GAP);
    const y = 14 + Math.floor(i / 2) * (CELL_H + GAP);
    doc.setDrawColor(200, 200, 200);
    doc.setLineDashPattern([2, 2], 0);
    doc.roundedRect(x, y, CELL_W, CELL_H, 3, 3, "S"); // cut line
    doc.setLineDashPattern([], 0);
    doc.setFillColor(...NAVY);
    doc.roundedRect(x + 4, y + 4, CELL_W - 8, 16, 2, 2, "F");
    logoTile(doc, x + CELL_W - 28, y + 5.5, 20, 13);
    doc.setTextColor(...WHITE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("RESCUE 2", x + 8, y + 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("HDK ARFF", x + 8, y + 16);
    doc.addImage(q.image, "PNG", x + 12, y + 25, CELL_W - 24, CELL_W - 24);
    doc.setTextColor(...NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(q.label.toUpperCase(), x + CELL_W / 2, y + CELL_W + 10, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text("Scan with the phone camera to start", x + CELL_W / 2, y + CELL_W + 16, { align: "center" });
    doc.setFontSize(6.5);
    doc.text(q.url, x + CELL_W / 2, y + CELL_W + 21, { align: "center" });
  });
  return toFile(doc, "HDK-RESCUE2-QR-codes.pdf");
}
