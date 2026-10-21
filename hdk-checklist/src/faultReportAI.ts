import type { CheckKind, ChecklistSection, EvidenceItem, FaultItem, FaultReport } from "./types";
import { nextFaultReportNumber } from "./storage";

function collectFaults(sections: ChecklistSection[]): FaultItem[] {
  const faults: FaultItem[] = [];
  for (const sec of sections) {
    for (const item of sec.items) {
      if (item.status === "NOK" || item.status === "U/S") {
        faults.push({
          itemId: item.id,
          section: sec.title,
          label: item.label,
          status: item.status,
          remarks: item.remarks,
          evidence: item.evidence ?? [],
          severity: item.status === "U/S" ? "Critical" : "Minor",
          recommendedAction: "",
        });
      }
    }
  }
  return faults;
}

// The model sometimes wraps the JSON in a code fence
function parseJson(text: string) {
  return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
}

async function askAI(prompt: string) {
  const response = await fetch("/api/fault-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(`AI error ${response.status}`);
  const data = await response.json();
  return parseJson(data.content[0].text);
}

async function generateWithAI(faults: FaultItem[], operatorName: string, kind: CheckKind) {
  const faultList = faults
    .map((f, i) => {
      const evidenceNote = f.evidence.length > 0
        ? ` [${f.evidence.length} photo/video evidence attached]`
        : "";
      return `${i + 1}. [${f.status}] ${f.section.split("—").pop()?.trim() || f.section} — ${f.label}${f.remarks ? ` (Note: "${f.remarks}")` : ""}${evidenceNote}`;
    })
    .join("\n");

  const prompt = `You are an ARFF (Airport Rescue and Firefighting) vehicle maintenance officer at Kulhudhuffushi Airport (HDK), Maldives. Operator "${operatorName}" completed a ${kind} inspection for RESCUE 2 and found the following faults:

${faultList}

Status: NOK = Minor defect but operational, U/S = Unserviceable
${faults.some(f => f.evidence.length > 0) ? "Note: Photographic/video evidence has been attached to the relevant fault items." : ""}

Write this up as a formal ARFF fault report. Report only what the inspection recorded: the items, their status and the operator's notes. Correct spelling and grammar, but do not add causes, measurements, parts, locations or observations that were not recorded — and do not state that something else was checked or found fine. If the operator's note is empty, describe only the item and its status. Return valid JSON:
{
  "faultTitle": "<ALL-CAPS SHORT TITLE naming the recorded fault(s), e.g. ENGINE OIL LEVEL LOW>",
  "detailsOfDefects": "<Formal 2-4 sentence narrative beginning with 'During ${kind} inspection,' stating the recorded findings, any evidence attached, and the urgency implied by the status. Official ARFF maintenance report tone.>",
  "faultSummary": "<1-2 sentence plain summary for internal records>",
  "assessment": "<1 sentence on vehicle operational status>",
  "priority": "Routine|Urgent|Immediate Grounding",
  "faults": [
    { "label": "<item name>", "severity": "Minor|Major|Critical", "recommendedAction": "<specific action>" }
  ]
}

Priority rules:
- "Immediate Grounding": any U/S item in firefighting systems, brakes, steering, or fuel
- "Urgent": any U/S item, or 3+ NOK items
- "Routine": 1-2 minor NOK items only

Respond with only the JSON object.`;

  const parsed = await askAI(prompt);

  const enrichedFaults = faults.map((f) => {
    const match = parsed.faults?.find((pf: { label: string }) =>
      f.label.toLowerCase().includes(pf.label.toLowerCase().substring(0, 8)) ||
      pf.label.toLowerCase().includes(f.label.toLowerCase().substring(0, 8))
    );
    return { ...f, severity: match?.severity ?? f.severity, recommendedAction: match?.recommendedAction ?? "Inspect and repair as required." };
  });

  return {
    faults: enrichedFaults,
    vehicleEquipmentLine: `RESCUE 2 (HDK-ARFF) ${parsed.faultTitle ?? "FAULT DETECTED"}`,
    detailsOfDefects: parsed.detailsOfDefects,
    faultSummary: parsed.faultSummary,
    assessment: parsed.assessment,
    priority: parsed.priority as "Routine" | "Urgent" | "Immediate Grounding",
  };
}

function generateLocal(faults: FaultItem[], operatorName: string, kind: CheckKind) {
  const hasUS = faults.some((f) => f.status === "U/S");
  const criticalSystems = ["brake", "steering", "fuel", "water tank", "foam tank", "pump", "turret"];
  const isCritical = faults.some((f) => criticalSystems.some((s) => f.label.toLowerCase().includes(s)));
  const priority: "Routine" | "Urgent" | "Immediate Grounding" =
    hasUS && isCritical ? "Immediate Grounding" : hasUS || faults.length >= 3 ? "Urgent" : "Routine";

  const enrichedFaults = faults.map((f) => ({
    ...f,
    severity: f.status === "U/S" ? "Critical" : faults.length > 3 ? "Major" : "Minor",
    recommendedAction: f.status === "U/S"
      ? "Remove from service immediately. Full inspection and repair required before return to operation."
      : "Schedule maintenance at earliest opportunity. Monitor condition during operations.",
  }));

  const usList = faults.filter((f) => f.status === "U/S").map((f) => f.label);
  const nokList = faults.filter((f) => f.status === "NOK").map((f) => f.label);
  const evidenceTotal = faults.reduce((a, f) => a + f.evidence.length, 0);
  const faultTitle = faults.length === 1 ? faults[0].label.toUpperCase()
    : hasUS ? `${usList[0].toUpperCase()} AND OTHER FAULTS` : "MULTIPLE FAULTS";

  let detailsOfDefects = `During ${kind} inspection of RESCUE 2 (HDK-ARFF) conducted by ${operatorName}, `;
  detailsOfDefects += faults.length === 1
    ? `a fault was identified with the ${faults[0].label.toLowerCase()}. `
    : `${faults.length} fault(s) were identified. `;
  if (usList.length) detailsOfDefects += `The following item(s) are unserviceable: ${usList.join("; ")}. `;
  if (nokList.length) detailsOfDefects += `The following item(s) have minor defects but remain operational: ${nokList.join("; ")}. `;
  if (evidenceTotal > 0) detailsOfDefects += `${evidenceTotal} photo/video evidence item(s) have been attached to this report. `;
  detailsOfDefects += priority === "Immediate Grounding"
    ? "The vehicle must be grounded immediately and must not be deployed until unserviceable system(s) are repaired and cleared by the ARFFS Section Head in accordance with ARFF SOP RACL-SQ-ARF-COP-24-2."
    : priority === "Urgent"
    ? "Urgent inspection and repair are required to prevent further deterioration and ensure the vehicle remains safe and fully operational."
    : "The fault(s) are minor in nature; however, maintenance is recommended at the earliest opportunity to prevent escalation.";

  const faultSummary = `${faults.length} fault(s) found during ${kind} inspection of RESCUE 2 by ${operatorName}. Priority: ${priority}.`;
  const assessment = priority === "Immediate Grounding"
    ? "Vehicle must be grounded immediately. Do not deploy until cleared by the ARFFS Section Head."
    : priority === "Urgent"
    ? "Vehicle has reduced operational capability. Assess risk before deployment and arrange urgent maintenance."
    : "Vehicle is operational with minor defects. Schedule routine maintenance and continue normal operations.";

  return { faults: enrichedFaults, vehicleEquipmentLine: `RESCUE 2 (HDK-ARFF) ${faultTitle}`, detailsOfDefects, faultSummary, assessment, priority };
}

export async function generateFaultReport(
  sections: ChecklistSection[],
  operatorName: string,
  fleetNumber: string,
  operatorSignature: string,
  skipItemIds: Set<string> = new Set(),
  kind: CheckKind = "daily",
): Promise<FaultReport | null> {
  // Faults already on an open report this week are not reported again
  const faults = collectFaults(sections).filter((f) => !skipItemIds.has(f.itemId));
  if (faults.length === 0) return null;

  const now = new Date();
  const date = now.toLocaleDateString("en-GB");
  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  let result;
  try { result = await generateWithAI(faults, operatorName, kind); }
  catch { result = generateLocal(faults, operatorName, kind); }

  return {
    id: crypto.randomUUID(),
    reportNumber: await nextFaultReportNumber(),
    inspectionLogId: "",
    date, time,
    vehicle: "RESCUE 2 (HDK-ARFF)",
    vehicleEquipmentLine: result.vehicleEquipmentLine,
    operatorName,
    fleetNumber,
    operatorSignature,
    faults: result.faults,
    detailsOfDefects: result.detailsOfDefects,
    faultSummary: result.faultSummary,
    aiAssessment: result.assessment,
    priority: result.priority,
    status: "Open",
    createdAt: now.toISOString(),
  };
}

// ── Fault reported outside the daily inspection ───────────────────────

export interface ManualFaultInput {
  operatorName: string;
  description: string;
  status: "NOK" | "U/S";
  evidence: EvidenceItem[];
  signature: string;
}

const PRIORITIES = ["Routine", "Urgent", "Immediate Grounding"] as const;
const SEVERITIES = ["Minor", "Major", "Critical"];

async function enhanceWithAI(input: ManualFaultInput) {
  const prompt = `You are an ARFF (Airport Rescue and Firefighting) vehicle maintenance officer at Kulhudhuffushi Airport (HDK), Maldives. Operator "${input.operatorName}" reported a fault on RESCUE 2 outside the daily inspection. Their own words:

"""
${input.description}
"""

Status given by the operator: ${input.status === "U/S" ? "U/S — Unserviceable" : "NOK — Minor defect, vehicle still operational"}
${input.evidence.length > 0 ? `${input.evidence.length} photo/video evidence item(s) attached.` : ""}

Rewrite this as a formal ARFF fault report. Keep every fact the operator gave; correct spelling and grammar; do not invent measurements, causes or parts the operator did not mention or clearly imply. Return valid JSON:
{
  "faultTitle": "<ALL-CAPS SHORT TITLE, e.g. GEAR OIL LEAK>",
  "itemLabel": "<the affected component, short, e.g. Gear oil seal>",
  "section": "<vehicle system, e.g. Engine, Brakes, Firefighting system, Lights, Body & cab>",
  "detailsOfDefects": "<Formal 2-4 sentence narrative describing the defect as reported, any evidence, and urgency. Official ARFF maintenance report tone.>",
  "faultSummary": "<1 sentence plain summary>",
  "assessment": "<1 sentence on vehicle operational status>",
  "priority": "Routine|Urgent|Immediate Grounding",
  "severity": "Minor|Major|Critical",
  "recommendedAction": "<specific action>"
}

Priority rules:
- "Immediate Grounding": unserviceable firefighting system, brakes, steering or fuel
- "Urgent": any other unserviceable item
- "Routine": minor defect, vehicle operational

Respond with only the JSON object.`;
  const p = await askAI(prompt);
  return {
    title: String(p.faultTitle || "FAULT REPORTED"),
    label: String(p.itemLabel || "Reported fault"),
    section: String(p.section || "Reported outside inspection"),
    detailsOfDefects: String(p.detailsOfDefects || input.description),
    faultSummary: String(p.faultSummary || ""),
    assessment: String(p.assessment || ""),
    priority: PRIORITIES.includes(p.priority) ? p.priority as FaultReport["priority"] : input.status === "U/S" ? "Urgent" : "Routine",
    severity: SEVERITIES.includes(p.severity) ? String(p.severity) : input.status === "U/S" ? "Critical" : "Minor",
    recommendedAction: String(p.recommendedAction || "Inspect and repair as required."),
  };
}

function enhanceLocal(input: ManualFaultInput) {
  const us = input.status === "U/S";
  const text = input.description.trim().replace(/\s+/g, " ");
  const firstLine = text.split(/[.\n]/)[0].slice(0, 60);
  return {
    title: firstLine.toUpperCase(),
    label: firstLine,
    section: "Reported outside inspection",
    detailsOfDefects: `${input.operatorName} reported the following fault on RESCUE 2 (HDK-ARFF): ${text}${/[.!?]$/.test(text) ? "" : "."}${input.evidence.length ? ` ${input.evidence.length} photo/video evidence item(s) have been attached to this report.` : ""}`,
    faultSummary: `Fault reported on RESCUE 2 by ${input.operatorName}.`,
    assessment: us ? "Item is unserviceable. Assess risk before deployment and arrange urgent maintenance." : "Vehicle is operational with a minor defect. Schedule maintenance.",
    priority: (us ? "Urgent" : "Routine") as FaultReport["priority"],
    severity: us ? "Critical" : "Minor",
    recommendedAction: us ? "Inspect and repair before return to full operation." : "Schedule maintenance at earliest opportunity.",
  };
}

/** Builds a fault report from an operator's own description, polished by AI when available. */
export async function generateManualFaultReport(input: ManualFaultInput): Promise<FaultReport> {
  let r;
  try { r = await enhanceWithAI(input); }
  catch { r = enhanceLocal(input); }

  const now = new Date();
  return {
    id: crypto.randomUUID(),
    reportNumber: await nextFaultReportNumber(),
    inspectionLogId: "",
    date: now.toLocaleDateString("en-GB"),
    time: now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    vehicle: "RESCUE 2 (HDK-ARFF)",
    vehicleEquipmentLine: `RESCUE 2 (HDK-ARFF) ${r.title}`,
    operatorName: input.operatorName,
    fleetNumber: "",
    operatorSignature: input.signature,
    faults: [{
      itemId: `manual-${crypto.randomUUID().slice(0, 8)}`,
      section: r.section,
      label: r.label,
      status: input.status,
      remarks: input.description.trim(),
      evidence: input.evidence,
      severity: r.severity,
      recommendedAction: r.recommendedAction,
    }],
    detailsOfDefects: r.detailsOfDefects,
    faultSummary: r.faultSummary,
    aiAssessment: r.assessment,
    priority: r.priority,
    status: "Open",
    createdAt: now.toISOString(),
  };
}
