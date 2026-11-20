// WhatsApp Cloud API (WhatsApp's official Business Platform) — the delivery channel only.
// Message content, codes, queueing and who-gets-what all live in our own database.
import type { SupabaseClient } from "@supabase/supabase-js";

export type WaConfig = { phone_number_id: string; token: string };

/** Template names the owner creates in WhatsApp Manager (see admin Settings → WhatsApp). */
export const TEMPLATES = { rider: "rm_rider_update", staff: "rm_staff_alert", code: "rm_login_code" } as const;

export async function waConfig(db: SupabaseClient): Promise<WaConfig | null> {
  const { data } = await db.rpc("whatsapp_config");
  return data && (data as WaConfig).token ? (data as WaConfig) : null;
}

/** Template parameters may not contain new lines, tabs or 4+ spaces in a row. */
const clean = (s: string) => s.replace(/[\n\t]+/g, " ").replace(/ {4,}/g, "   ").slice(0, 900);

export async function sendTemplate(cfg: WaConfig, to: string, template: string, text: string, codeButton = false) {
  const components: unknown[] = [{ type: "body", parameters: [{ type: "text", text: clean(text) }] }];
  if (codeButton) components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text }] });
  const res = await fetch(`https://graph.facebook.com/v21.0/${cfg.phone_number_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "template",
      template: { name: template, language: { code: "en" }, components },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message ?? `WhatsApp error ${res.status}`);
  return body?.messages?.[0]?.id as string | undefined;
}

/** "7771234" → "+9607771234"; "+44 7700 900123" → "+447700900123". */
export function normalisePhone(raw: string): string | null {
  const s = raw.replace(/[\s()-]/g, "");
  const e164 = /^\d{7}$/.test(s) ? `+960${s}` : s.startsWith("00") ? `+${s.slice(2)}` : s;
  return /^\+[1-9]\d{6,14}$/.test(e164) ? e164 : null;
}
