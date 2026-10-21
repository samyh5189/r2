import type { ChecklistItemConfig } from "./types";

/**
 * Drafts the "what to check" text for checklist items, for the admin to review and correct.
 * Locations and vehicle-specific values are left to the admin: the AI doesn't know this truck.
 */
export async function draftGuides(sectionTitle: string, items: ChecklistItemConfig[]): Promise<Record<string, string>> {
  const list = items.map((it) => `- ${it.id}: ${it.label}${it.type === "number" ? ` (reading${it.unit ? ` in ${it.unit}` : ""})` : ""}`).join("\n");
  const prompt = `You are writing short guidance for firefighters doing a routine check of an airport rescue and firefighting (ARFF) crash tender, RESCUE 2.

Section: ${sectionTitle}
Items:
${list}

For each item write ONE or TWO plain sentences (max 30 words) telling the operator what to look at and what "OK" looks like.
Rules:
- Use general, widely accepted practice only.
- Do not invent locations, part numbers, brands or exact values for this vehicle. Where a value depends on the vehicle, refer to the gauge marks, the indicator or the manufacturer's manual.
- No safety disclaimers, no numbering.

Reply with JSON only: {"<item id>": "<text>", ...}`;
  const res = await fetch("/api/fault-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`AI error ${res.status}`);
  const text: string = (await res.json()).content?.[0]?.text ?? "";
  const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  const ids = new Set(items.map((it) => it.id));
  return Object.fromEntries(Object.entries(parsed).filter(([id, v]) => ids.has(id) && typeof v === "string").map(([id, v]) => [id, String(v).trim()]));
}
