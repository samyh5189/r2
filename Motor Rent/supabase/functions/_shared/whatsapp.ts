// WhatsApp Cloud API (WhatsApp's official Business Platform) — the delivery channel only.
// Message content, codes, queueing and who-gets-what all live in our own database.
import type { SupabaseClient } from "@supabase/supabase-js";

export type WaConfig = { phone_number_id: string; token: string; waba_id?: string };

export const GRAPH = "https://graph.facebook.com/v21.0";
/** The login-code template (category AUTHENTICATION, copy-code button). Message templates live in public.whatsapp_templates. */
export const CODE_TEMPLATE = "rm_login_code";

export async function waConfig(db: SupabaseClient): Promise<WaConfig | null> {
  const { data } = await db.rpc("whatsapp_config");
  return data && (data as WaConfig).token ? (data as WaConfig) : null;
}

export async function graph(cfg: WaConfig, path: string, init?: { method?: string; body?: unknown }) {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.error_user_msg ?? body?.error?.message ?? `WhatsApp error ${res.status}`);
  return body;
}

/** Send an approved template. `params` fill {{1}}, {{2}} … in order; a code template also fills its copy-code button. */
export async function sendTemplate(cfg: WaConfig, to: string, template: string, params: string[], codeButton = false) {
  const components: unknown[] = params.length ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] : [];
  if (codeButton) components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: params[0] }] });
  const body = await graph(cfg, `${cfg.phone_number_id}/messages`, {
    method: "POST",
    body: { messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "template", template: { name: template, language: { code: "en" }, components } },
  });
  return body?.messages?.[0]?.id as string | undefined;
}

/** "7771234" → "+9607771234"; "+44 7700 900123" → "+447700900123". */
export function normalisePhone(raw: string): string | null {
  const s = raw.replace(/[\s()-]/g, "");
  const e164 = /^\d{7}$/.test(s) ? `+960${s}` : s.startsWith("00") ? `+${s.slice(2)}` : s;
  return /^\+[1-9]\d{6,14}$/.test(e164) ? e164 : null;
}
