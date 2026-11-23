// POST /viber-bot — the EasyRide Viber chatbot.
//  • Viber's webhook calls (signed with the bot token): a rider opens the bot from a booking's link
//    (context = the booking's private Viber code), taps "Send my booking details", is subscribed and gets them.
//  • { action: "send" } from pg_cron (vb_kick, cron secret): delivers queued updates.
//  • { action: "setup" } from a manager/owner in the admin: points Viber's webhook here and saves the bot's link.
// The bot token lives only in the VIBER_AUTH_TOKEN function secret.
import { adminClient } from "../_shared/supabase.ts";

const API = "https://chatapi.viber.com/pa";
const SELF = "https://xknvywpfnsnsvzuicuff.supabase.co/functions/v1/viber-bot";
const NAME = "EasyRide";
const token = () => Deno.env.get("VIBER_AUTH_TOKEN") ?? "";
const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

async function viber(path: string, body: unknown) {
  const res = await fetch(`${API}/${path}`, { method: "POST", headers: { "X-Viber-Auth-Token": token(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (data.status !== 0) throw new Error(`Viber ${path}: ${data.status_message ?? res.status}`);
  return data;
}
const sendText = (receiver: string, text: string, keyboard?: unknown) =>
  viber("send_message", { receiver, min_api_version: 1, sender: { name: NAME }, type: "text", text, ...(keyboard ? { keyboard } : {}) });

const detailsButton = (code: string) => ({
  Type: "keyboard", DefaultHeight: false,
  Buttons: [{ ActionType: "reply", ActionBody: `booking:${code}`, Text: "<b>Send my booking details</b>", TextSize: "large", BgColor: "#D7192A", Columns: 6, Rows: 1,
    TextHAlign: "center", TextVAlign: "middle", Silent: false }],
});

async function validSignature(raw: string, sig: string) {
  if (!token() || !sig) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(token()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.length === sig.length && [...hex].reduce((d, c, i) => d | (c.charCodeAt(0) ^ sig.charCodeAt(i)), 0) === 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "method" }, 405);
  const db = adminClient();
  const raw = await req.text();
  const sig = req.headers.get("x-viber-content-signature");

  // ── Viber webhook ──
  if (sig) {
    if (!(await validSignature(raw, sig))) return new Response("bad signature", { status: 403 });
    // deno-lint-ignore no-explicit-any
    const ev: any = JSON.parse(raw);
    const user = ev.user ?? ev.sender;
    try {
      if (ev.event === "conversation_started") {
        // Not subscribed yet: the only message allowed is this welcome, returned in the response.
        const code = typeof ev.context === "string" && UUID.test(ev.context) ? ev.context : null;
        const { data: b } = code ? await db.from("bookings").select("reference").eq("viber_token", code).maybeSingle() : { data: null };
        return Response.json({
          sender: { name: NAME }, type: "text",
          text: b ? `Hi${user?.name ? ` ${user.name}` : ""}! Tap the button to get booking ${b.reference} here, with updates until you return the vehicle.`
            : "Hi! This is EasyRide, Kulhudhuffushi MotoRentals. Open the Viber link on your booking page to get your booking details here.",
          ...(b ? { keyboard: detailsButton(code!) } : {}),
        });
      }
      if (ev.event === "subscribed" && user?.id) {
        await db.from("viber_subscribers").upsert({ viber_id: user.id, name: user.name ?? null, subscribed: true, updated_at: new Date().toISOString() });
      }
      if (ev.event === "unsubscribed" && ev.user_id) {
        await db.from("viber_subscribers").update({ subscribed: false, updated_at: new Date().toISOString() }).eq("viber_id", ev.user_id);
      }
      if (ev.event === "message" && user?.id) {
        await db.from("viber_subscribers").upsert({ viber_id: user.id, name: user.name ?? null, subscribed: true, updated_at: new Date().toISOString() });
        const text = String(ev.message?.text ?? "").trim();
        const code = text.startsWith("booking:") ? text.slice(8) : null;
        let bookingId: string | null = null;
        if (code && UUID.test(code)) {
          const { data: b } = await db.from("bookings").select("id").eq("viber_token", code).maybeSingle();
          if (b) {
            await db.from("viber_links").upsert({ booking_id: b.id, viber_id: user.id }, { ignoreDuplicates: true });
            bookingId = b.id;
          }
        }
        if (!bookingId) {
          // Any other message: the latest booking they follow, if any.
          const { data: l } = await db.from("viber_links").select("booking_id").eq("viber_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
          bookingId = l?.booking_id ?? null;
        }
        if (bookingId) {
          const { data: details } = await db.rpc("vb_booking_text", { b: bookingId });
          await sendText(user.id, `${details}\n\nWe'll message you here when it's confirmed, before pickup and before it's due back. To talk to us, call the number above.`);
        } else {
          await sendText(user.id, "Open the Viber link on your EasyRide booking page to get your booking details here.");
        }
      }
    } catch (e) {
      console.error(e);
    }
    return new Response("ok");
  }

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try { body = JSON.parse(raw || "{}"); } catch { return reply({ error: "bad json" }, 400); }

  // ── Cron: deliver queued updates ──
  if (body.action === "send") {
    const { data: ok } = await db.rpc("whatsapp_cron_secret_ok", { s: req.headers.get("x-cron-secret") ?? "" });
    if (!ok) return new Response("forbidden", { status: 403 });
    if (!token()) return reply({ sent: 0, reason: "VIBER_AUTH_TOKEN not set" });
    await db.from("viber_outbox").update({ status: "expired", error: "not sent within 2 hours" })
      .eq("status", "queued").lt("created_at", new Date(Date.now() - 2 * 3_600_000).toISOString());
    const { data: rows } = await db.from("viber_outbox").select("id, viber_id, body, attempts").eq("status", "queued").order("created_at").limit(50);
    let sent = 0;
    for (const r of rows ?? []) {
      try {
        await sendText(r.viber_id, r.body);
        await db.from("viber_outbox").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", r.id);
        sent++;
      } catch (e) {
        const attempts = r.attempts + 1;
        const msg = String((e as Error).message);
        // Viber says the user left the bot: stop messaging them.
        if (/not ?subscribed|receiverNotSubscribed|status 6/i.test(msg)) await db.from("viber_subscribers").update({ subscribed: false }).eq("viber_id", r.viber_id);
        await db.from("viber_outbox").update({ attempts, error: msg.slice(0, 300), status: attempts >= 3 ? "failed" : "queued" }).eq("id", r.id);
      }
    }
    return reply({ sent });
  }

  // ── Admin: connect the bot ──
  if (body.action === "setup") {
    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const { data: u } = await db.auth.getUser(jwt);
    const { data: me } = u.user ? await db.from("profiles").select("role").eq("id", u.user.id).single() : { data: null };
    if (!me || !["manager", "owner"].includes(me.role)) return reply({ error: { message: "Managers and owners only." } }, 403);
    if (!token()) return reply({ error: { message: "Set the bot token first: supabase secrets set VIBER_AUTH_TOKEN=…" } }, 422);
    try {
      await viber("set_webhook", { url: SELF, event_types: ["subscribed", "unsubscribed", "conversation_started", "message"], send_name: true });
      const info = await viber("get_account_info", {});
      await db.from("site_settings").update({ viber_uri: info.uri ?? null, viber_ready: true, updated_at: new Date().toISOString() }).eq("id", true);
      return reply({ ok: true, name: info.name, uri: info.uri, subscribers: info.subscribers_count ?? null });
    } catch (e) {
      return reply({ error: { message: String((e as Error).message) } }, 502);
    }
  }
  return reply({ error: "unknown action" }, 400);
});
