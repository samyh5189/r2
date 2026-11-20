// Delivers queued WhatsApp notifications. Called every minute by pg_cron (wa_kick) with a vault secret.
import { adminClient } from "../_shared/supabase.ts";
import { sendTemplate, waConfig } from "../_shared/whatsapp.ts";

Deno.serve(async (req) => {
  const db = adminClient();
  const { data: ok } = await db.rpc("whatsapp_cron_secret_ok", { s: req.headers.get("x-cron-secret") ?? "" });
  if (!ok) return new Response("forbidden", { status: 403 });
  const cfg = await waConfig(db);
  if (!cfg) return Response.json({ sent: 0, reason: "not configured" });

  // Stale news is worse than none: verified messages that waited over 2 hours are dropped.
  await db.from("whatsapp_outbox").update({ status: "expired", error: "not sent within 2 hours" })
    .eq("status", "queued").eq("to_verified", true).lt("created_at", new Date(Date.now() - 2 * 3_600_000).toISOString());

  const { data: rows } = await db.from("whatsapp_outbox").select("id, to_phone, template, params, attempts")
    .eq("status", "queued").eq("to_verified", true).not("template", "is", null).order("created_at").limit(40);
  let sent = 0;
  for (const r of rows ?? []) {
    try {
      const id = await sendTemplate(cfg, r.to_phone, r.template, r.params ?? []);
      await db.from("whatsapp_outbox").update({ status: "sent", sent_at: new Date().toISOString(), provider_id: id ?? null, error: null }).eq("id", r.id);
      sent++;
    } catch (e) {
      const attempts = r.attempts + 1;
      await db.from("whatsapp_outbox").update({ attempts, error: String((e as Error).message).slice(0, 300), status: attempts >= 3 ? "failed" : "queued" }).eq("id", r.id);
    }
  }
  return Response.json({ sent });
});
