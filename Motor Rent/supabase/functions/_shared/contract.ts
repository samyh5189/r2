// The signed vehicle rental agreement as a PDF, on EasyRide letterhead. Built at handover by submit-inspection.
import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";
import { AGREEMENT_LAWS, AGREEMENT_SECTIONS, AGREEMENT_VERSION } from "@shared/agreement.ts";

export type ContractData = {
  reference: string; bookingId: string; signedAt: Date;
  company: { name: string; tagline: string; legalName: string | null; regNo: string | null; address: string | null; phone: string | null; email: string | null };
  rider: { name: string; dateOfBirth: string | null; idType: string | null; idNumber: string | null; licenceNumber: string | null;
    licenceExpires: string | null; categories: string[]; phone: string | null; checkedBy: "verified account" | "checked at the counter" };
  vehicle: { make: string; model: string; plate: string; kind: string; colour: string | null };
  start: Date; end: Date; handover: "counter" | "delivery"; place: string;
  currency: string; total: number; deposit: number; lines: { label: string; amount: number }[];
  odometer: number; engineHours: number | null; fuel: number; checklist: Record<string, string> | null; notes: string | null;
  staffName: string; termsVersion: string;
  riderSignature: string; staffSignature: string;
  photos: { label: string; bytes: Uint8Array }[];
};

const RED = rgb(0.843, 0.098, 0.165);
const INK = rgb(0.07, 0.07, 0.08);
const GREY = rgb(0.42, 0.42, 0.45);
const LINE = rgb(0.86, 0.85, 0.84);
const W = 595.28, H = 841.89, M = 48;

const tz = "Indian/Maldives";
const when = (d: Date) => d.toLocaleString("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const day = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "-");
const amount = (n: number, c: string) => `${c} ${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Standard PDF fonts only cover Latin-1: straighten quotes and dashes, drop anything else. */
const safe = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
  .replace(/…/g, "...").replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "");

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of safe(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

export async function buildContract(d: ContractData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Vehicle rental agreement ${d.reference}`);
  pdf.setAuthor(d.company.legalName ?? d.company.name);
  pdf.setSubject(`Rental of ${d.vehicle.make} ${d.vehicle.model} (${d.vehicle.plate}) to ${d.rider.name}`);
  pdf.setCreationDate(d.signedAt);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page!: PDFPage;
  let y = 0;
  const text = (s: string, x: number, yy: number, size = 9.5, font = reg, color = INK) => page.drawText(safe(s), { x, y: yy, size, font, color });

  const letterhead = (first: boolean) => {
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: RED });
    const top = H - 30;
    page.drawRectangle({ x: M, y: top - 30, width: 34, height: 34, color: RED });
    text("ER", M + 7.5, top - 18, 14, bold, rgb(1, 1, 1));
    text(d.company.name, M + 44, top - 10, 17, bold);
    text(d.company.tagline, M + 44, top - 24, 9, reg, GREY);
    const right = [d.company.legalName, d.company.regNo ? `Reg. no. ${d.company.regNo}` : null, d.company.address,
      [d.company.phone, d.company.email].filter(Boolean).join("  |  ") || null].filter(Boolean) as string[];
    right.forEach((l, i) => {
      const s = safe(l);
      text(s, W - M - reg.widthOfTextAtSize(s, 8), top - 2 - i * 10.5, 8, i === 0 ? bold : reg, i === 0 ? INK : GREY);
    });
    page.drawLine({ start: { x: M, y: top - 44 }, end: { x: W - M, y: top - 44 }, thickness: 0.8, color: LINE });
    y = top - 62;
    if (!first) { text(`Vehicle rental agreement ${d.reference} (continued)`, M, y, 9, bold, GREY); y -= 18; }
  };
  const newPage = (first = false) => { page = pdf.addPage([W, H]); letterhead(first); };
  const need = (h: number) => { if (y - h < 70) newPage(); };

  const heading = (s: string) => {
    need(60);
    y -= 6;
    text(s.toUpperCase(), M, y, 8.5, bold, RED);
    y -= 5;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: LINE });
    y -= 13;
  };
  const para = (s: string, size = 9.5, indent = 0, font = reg, color = INK) => {
    for (const l of wrap(s, font, size, W - 2 * M - indent)) { need(size + 4); text(l, M + indent, y, size, font, color); y -= size + 3.5; }
  };
  /** Label/value rows in one or two columns. */
  const rows = (items: [string, string][], cols = 2) => {
    const colW = (W - 2 * M) / cols;
    for (let i = 0; i < items.length; i += cols) {
      const chunk = items.slice(i, i + cols);
      const heights = chunk.map(([, v]) => wrap(v, bold, 9.5, colW - 112).length);
      const h = Math.max(...heights) * 13 + 3;
      need(h);
      chunk.forEach(([k, v], j) => {
        const x = M + j * colW;
        text(k, x, y, 8.5, reg, GREY);
        wrap(v, bold, 9.5, colW - 112).forEach((l, n) => text(l, x + 104, y - n * 13, 9.5, bold));
      });
      y -= h;
    }
  };

  // ── Page 1 ──
  newPage(true);
  text("VEHICLE RENTAL AGREEMENT", M, y, 17, bold);
  y -= 16;
  text(`Agreement no. ${d.reference}   |   Signed ${when(d.signedAt)} (Maldives time)   |   Terms version ${AGREEMENT_VERSION}`, M, y, 8.5, reg, GREY);
  y -= 22;

  heading("The parties");
  const colW = (W - 2 * M) / 2;
  const partyTop = y;
  const party = (x: number, title: string, lines: string[]) => {
    let yy = partyTop;
    text(title, x, yy, 8.5, bold, GREY); yy -= 14;
    for (const l of lines) for (const w of wrap(l, reg, 9.5, colW - 16)) { text(w, x, yy, 9.5); yy -= 12.5; }
    return yy;
  };
  const yA = party(M, "EASYRIDE (\"EasyRide\")", [
    d.company.legalName ? `${d.company.legalName}, trading as ${d.company.name} - ${d.company.tagline}` : `${d.company.name} - ${d.company.tagline}`,
    ...(d.company.regNo ? [`Registration no. ${d.company.regNo}`] : []),
    ...(d.company.address ? [d.company.address] : []),
    ...([d.company.phone, d.company.email].filter(Boolean).length ? [[d.company.phone, d.company.email].filter(Boolean).join("  |  ")] : []),
    `Represented at handover by ${d.staffName}`,
  ]);
  const idLabel = d.rider.idType === "passport" ? "Passport" : "ID card";
  const yB = party(M + colW, "THE RIDER (\"the Rider\")", [
    d.rider.name,
    `${idLabel}: ${d.rider.idNumber ?? "-"}`,
    `Date of birth: ${day(d.rider.dateOfBirth)}`,
    `Driving licence: ${d.rider.licenceNumber ?? "-"}, categories ${d.rider.categories.join(", ") || "-"}, valid until ${day(d.rider.licenceExpires)}`,
    `Mobile: ${d.rider.phone ?? "-"}`,
    `Identity: ${d.rider.checkedBy}`,
  ]);
  y = Math.min(yA, yB) - 6;

  heading("Vehicle and rental period");
  rows([
    ["Vehicle", `${d.vehicle.make} ${d.vehicle.model}${d.vehicle.colour ? `, ${d.vehicle.colour}` : ""}`],
    ["Registration", d.vehicle.plate],
    ["Type", d.vehicle.kind === "car" ? "Car (licence category B)" : "Motorcycle / scooter (licence category A)"],
    ["Handover", d.handover === "delivery" ? `Delivered to ${d.place}` : `At ${d.place}`],
    ["Rental starts", when(d.start)],
    ["Return by", when(d.end)],
  ]);

  heading("Charges");
  rows([
    ...d.lines.map((l) => [l.label, amount(l.amount, d.currency)] as [string, string]),
    ["Total rental", amount(d.total, d.currency)],
    ["Refundable deposit", d.deposit ? amount(d.deposit, d.currency) : "None"],
  ]);

  heading("Condition at handover");
  rows([
    ["Odometer", `${d.odometer.toLocaleString("en-US")} km`],
    ["Fuel", d.fuel === 8 ? "Full" : d.fuel === 0 ? "Empty" : `${d.fuel}/8`],
    ["Engine hours", d.engineHours != null ? `${d.engineHours} h` : "No hour meter"],
    ["Photos", `${d.photos.length} taken together with the Rider (last page)`],
  ]);
  if (d.checklist && Object.keys(d.checklist).length) {
    para(`Checklist: ${Object.entries(d.checklist).map(([k, v]) => `${k.replace(/_/g, " ")} ${v === "ok" ? "OK" : "ISSUE"}`).join(", ")}.`, 9);
  }
  if (d.notes) para(`Notes: ${d.notes}`, 9);

  // ── Terms ──
  heading("Terms");
  para("The Rider rents the vehicle on these terms and the EasyRide rental terms (version " + d.termsVersion + ") accepted when booking.", 9, 0, reg, GREY);
  y -= 3;
  for (const s of AGREEMENT_SECTIONS) {
    need(40);
    text(s.title, M, y, 10, bold); y -= 14;
    s.clauses.forEach((c, i) => {
      const lines = wrap(c, reg, 9.2, W - 2 * M - 18);
      need(lines.length * 12.5);
      text(`${s.title.split(".")[0]}.${i + 1}`, M, y, 8.5, bold, GREY);
      lines.forEach((l) => { text(l, M + 22, y, 9.2); y -= 12.5; });
      y -= 2.5;
    });
    y -= 4;
  }
  para(`Laws referred to: ${AGREEMENT_LAWS.join("; ")}.`, 8.5, 0, reg, GREY);

  // ── Signatures ──
  need(200);
  heading("Signatures");
  para("By signing, the Rider confirms they have read and understood this agreement, that the identity and licence details above are theirs and correct, and that they received the vehicle in the condition recorded.", 9);
  y -= 6;
  const sigBox = async (x: number, who: string, name: string, svg: string) => {
    const top = y;
    page.drawRectangle({ x, y: top - 72, width: colW - 16, height: 72, borderColor: LINE, borderWidth: 0.8 });
    for (const m of svg.matchAll(/ d="([^"]+)"/g)) {
      page.drawSvgPath(m[1], { x: x + 6, y: top - 4, scale: (colW - 28) / 600, borderColor: INK, borderWidth: 1.6 });
    }
    text(who, x, top - 86, 8.5, reg, GREY);
    text(name, x, top - 99, 10, bold);
    text(when(d.signedAt), x, top - 111, 8.5, reg, GREY);
  };
  await sigBox(M, "Signed by the Rider", d.rider.name, d.riderSignature);
  await sigBox(M + colW, "Signed for EasyRide", d.staffName, d.staffSignature);
  y -= 124;

  // ── Photos ──
  if (d.photos.length) {
    newPage();
    heading("Condition photos taken at handover");
    const cols = 2, gap = 12, pw = (W - 2 * M - gap) / cols, ph = pw * 0.75;
    let i = 0;
    for (const p of d.photos) {
      let img: PDFImage | null = null;
      try { img = await pdf.embedJpg(p.bytes); } catch { try { img = await pdf.embedPng(p.bytes); } catch { img = null; } }
      const col = i % cols;
      if (col === 0) need(ph + 22);
      const x = M + col * (pw + gap), top = y;
      if (img) {
        const s = Math.min(pw / img.width, ph / img.height);
        page.drawImage(img, { x: x + (pw - img.width * s) / 2, y: top - ph + (ph - img.height * s) / 2, width: img.width * s, height: img.height * s });
      }
      page.drawRectangle({ x, y: top - ph, width: pw, height: ph, borderColor: LINE, borderWidth: 0.6 });
      text(p.label, x, top - ph - 11, 8.5, reg, GREY);
      if (col === cols - 1 || i === d.photos.length - 1) y -= ph + 22;
      i++;
    }
  }

  // Footer on every page.
  const pages = pdf.getPages();
  pages.forEach((p, n) => {
    p.drawLine({ start: { x: M, y: 44 }, end: { x: W - M, y: 44 }, thickness: 0.5, color: LINE });
    p.drawText(safe(`${d.company.name}  |  Vehicle rental agreement ${d.reference}  |  Booking ${d.bookingId}`), { x: M, y: 32, size: 7.5, font: reg, color: GREY });
    const pn = `Page ${n + 1} of ${pages.length}`;
    p.drawText(pn, { x: W - M - reg.widthOfTextAtSize(pn, 7.5), y: 32, size: 7.5, font: reg, color: GREY });
  });
  return await pdf.save();
}

export async function sha256Hex(bytes: Uint8Array) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)));
  return [...h].map((b) => b.toString(16).padStart(2, "0")).join("");
}
