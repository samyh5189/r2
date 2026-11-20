// Owner only. Submits every template in public.whatsapp_templates to Meta for approval (already-submitted ones are
// left alone), then records each template's review status. The access token never leaves the server.
import { handler, HttpError, json } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import { graph, waConfig } from "../_shared/whatsapp.ts";

type Tpl = { name: string; category: "UTILITY" | "AUTHENTICATION"; body: string; example: string[] };

function components(t: Tpl) {
  if (t.category === "AUTHENTICATION") {
    return [
      { type: "BODY", add_security_recommendation: true },
      { type: "FOOTER", code_expiration_minutes: 10 },
      { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "Copy code" }] },
    ];
  }
  return [{ type: "BODY", text: t.body, ...(t.example.length ? { example: { body_text: [t.example] } } : {}) }];
}

Deno.serve(handler(async (req) => {
  const db = adminClient();
  const user = await requireUser(req, db);
  const { data: me } = await db.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "owner") throw new HttpError(403, "OWNER_ONLY", "Only the owner can set up WhatsApp templates.");
  const cfg = await waConfig(db);
  if (!cfg?.waba_id) throw new HttpError(409, "NOT_CONNECTED", "Connect WhatsApp first, including the WhatsApp account ID.");

  const { data: tpls } = await db.from("whatsapp_templates").select("name, category, body, example").order("name");
  const existing = new Map<string, { status: string; rejected_reason?: string }>();
  const list = await graph(cfg, `${cfg.waba_id}/message_templates?fields=name,status,rejected_reason,language&limit=200`);
  for (const t of list?.data ?? []) if (t.language === "en") existing.set(t.name, t);

  const errors: Record<string, string> = {};
  for (const t of (tpls ?? []) as Tpl[]) {
    if (existing.has(t.name)) continue;
    try {
      const r = await graph(cfg, `${cfg.waba_id}/message_templates`, {
        method: "POST", body: { name: t.name, language: "en", category: t.category, components: components(t) },
      });
      existing.set(t.name, { status: r.status ?? "PENDING" });
    } catch (e) { errors[t.name] = (e as Error).message; }
  }
  const now = new Date().toISOString();
  for (const t of (tpls ?? []) as Tpl[]) {
    const m = existing.get(t.name);
    await db.from("whatsapp_templates").update({
      status: m?.status ?? "NOT_SUBMITTED", rejected_reason: errors[t.name] ?? m?.rejected_reason ?? null, synced_at: now,
    }).eq("name", t.name);
  }
  return json({ submitted: existing.size, errors });
}));
