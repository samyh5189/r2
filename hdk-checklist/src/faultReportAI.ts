import type { ChecklistSection, FaultItem, FaultReport } from "./types";
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

async function generateWithAI(faults: FaultItem[], operatorName: string) {
  const faultList = faults
    .map((f, i) => {
      const evidenceNote = f.evidence.length > 0
        ? ` [${f.evidence.length} photo/video evidence attached]`
        : "";
      return `${i + 1}. [${f.status}] ${f.section.split("—").pop()?.trim() || f.section} — ${f.label}${f.remarks ? ` (Note: "${f.remarks}")` : ""}${evidenceNote}`;
    })
    .join("\n");

  const prompt = `You are an ARFF (Airport Rescue and Firefighting) vehicle maintenance officer at Kulhudhuffushi Airport (HDK), Maldives. Operator "${operatorName}" completed a daily inspection for RESCUE 3 and found the following faults:

${faultList}

Status: NOK = Minor defect but operational, U/S = Unserviceable
${faults.some(f => f.evidence.length > 0) ? "Note: Photographic/video evidence has been attached to the relevant fault items." : ""}

Generate a formal ARFF fault report as valid JSON:
{
  "faultTitle": "<ALL-CAPS SHORT TITLE, e.g. GEAR OIL LEAK or BRAKE SYSTEM FAULT>",
  "detailsOfDefects": "<Formal 2-4 sentence narrative beginning with 'During daily inspection,' describing findings, suspected cause, evidence collected, and urgency. Match the tone of an official ARFF maintenance report.>",
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
  const parsed = JSON.parse(data.content[0].text);

  const enrichedFaults = faults.map((f) => {
    const match = parsed.faults?.find((pf: { label: string }) =>
      f.label.toLowerCase().includes(pf.label.toLowerCase().substring(0, 8)) ||
      pf.label.toLowerCase().includes(f.label.toLowerCase().substring(0, 8))
    );
    return { ...f, severity: match?.severity ?? f.severity, recommendedAction: match?.recommendedAction ?? "Inspect and repair as required." };
  });

  return {
    faults: enrichedFaults,
    vehicleEquipmentLine: `RESCUE 3 (HDK-ARFF) ${parsed.faultTitle ?? "FAULT DETECTED"}`,
    detailsOfDefects: parsed.detailsOfDefects,
    faultSummary: parsed.faultSummary,
    assessment: parsed.assessment,
    priority: parsed.priority as "Routine" | "Urgent" | "Immediate Grounding",
  };
}

function generateLocal(faults: FaultItem[], operatorName: string) {
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

  let detailsOfDefects = `During daily inspection of RESCUE 3 (HDK-ARFF) conducted by ${operatorName}, `;
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

  const faultSummary = `${faults.length} fault(s) found during daily inspection of RESCUE 3 by ${operatorName}. Priority: ${priority}.`;
  const assessment = priority === "Immediate Grounding"
    ? "Vehicle must be grounded immediately. Do not deploy until cleared by the ARFFS Section Head."
    : priority === "Urgent"
    ? "Vehicle has reduced operational capability. Assess risk before deployment and arrange urgent maintenance."
    : "Vehicle is operational with minor defects. Schedule routine maintenance and continue normal operations.";

  return { faults: enrichedFaults, vehicleEquipmentLine: `RESCUE 3 (HDK-ARFF) ${faultTitle}`, detailsOfDefects, faultSummary, assessment, priority };
}

export async function generateFaultReport(
  sections: ChecklistSection[],
  operatorName: string,
  fleetNumber: string,
  operatorSignature: string,
): Promise<FaultReport | null> {
  const faults = collectFaults(sections);
  if (faults.length === 0) return null;

  const now = new Date();
  const date = now.toLocaleDateString("en-GB");
  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  let result;
  try { result = await generateWithAI(faults, operatorName); }
  catch { result = generateLocal(faults, operatorName); }

  return {
    id: crypto.randomUUID(),
    reportNumber: nextFaultReportNumber(),
    inspectionLogId: "",
    date, time,
    vehicle: "RESCUE 3 (HDK-ARFF)",
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
