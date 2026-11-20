// Our own one-time codes, delivered over WhatsApp.
//   { action: "send",   phone, purpose: "login" | "link" }
//   { action: "verify", phone, code, purpose }  → login: { tokenHash } for supabase.auth.verifyOtp; link: { linked: true }
import { z } from "zod";
import { handler, HttpError, json } from "../_shared/http.ts";
import { adminClient, parseJson, requireUser } from "../_shared/supabase.ts";
import { normalisePhone, sendTemplate, TEMPLATES, waConfig } from "../_shared/whatsapp.ts";

const Body = z.object({
  action: z.enum(["send", "verify"]),
  phone: z.string().min(6).max(24),
  purpose: z.enum(["login", "link"]),
  code: z.string().regex(/^\d{6}$/).optional(),
});

const TTL_MIN = 10;
const MAX_ATTEMPTS = 5;

async function hash(phone: string, code: string) {
  const pepper = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!.slice(-24);
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${phone}:${code}:${pepper}`));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(handler(async (req) => {
  const db = adminClient();
  const input = await parseJson(req, Body);
  const phone = normalisePhone(input.phone);
  if (!phone) throw new HttpError(422, "BAD_PHONE", "Enter a WhatsApp number, e.g. 7771234 or +44 7700 900123.");
  const user = input.purpose === "link" ? await requireUser(req, db) : null;

  if (input.action === "send") {
    const cfg = await waConfig(db);
    if (!cfg) throw new HttpError(503, "WHATSAPP_OFF", "WhatsApp codes aren't switched on yet. Use email or Google for now.");
    const since = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
    const [{ count: recent }, { count: today }] = await Promise.all([
      db.from("whatsapp_codes").select("id", { count: "exact", head: true }).eq("phone", phone).gte("created_at", since(10)),
      db.from("whatsapp_codes").select("id", { count: "exact", head: true }).eq("phone", phone).gte("created_at", since(24 * 60)),
    ]);
    if ((recent ?? 0) >= 3 || (today ?? 0) >= 10) throw new HttpError(429, "TOO_MANY", "Too many codes requested. Wait 10 minutes and try again.");
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    await db.from("whatsapp_codes").insert({ phone, purpose: input.purpose, code_hash: await hash(phone, code), expires_at: new Date(Date.now() + TTL_MIN * 60_000).toISOString() });
    try { await sendTemplate(cfg, phone, TEMPLATES.code, code, true); } catch (e) {
      console.error("whatsapp code", (e as Error).message);
      throw new HttpError(502, "SEND_FAILED", "We couldn't reach that number on WhatsApp. Check the number and try again.");
    }
    return json({ sent: true, phone });
  }

  // verify
  if (!input.code) throw new HttpError(422, "CODE_REQUIRED", "Enter the 6-digit code.");
  const { data: row } = await db.from("whatsapp_codes").select("id, code_hash, attempts, expires_at")
    .eq("phone", phone).eq("purpose", input.purpose).is("used_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!row || new Date(row.expires_at) < new Date()) throw new HttpError(410, "CODE_EXPIRED", "That code has expired. Request a new one.");
  if (row.attempts >= MAX_ATTEMPTS) throw new HttpError(429, "TOO_MANY", "Too many wrong tries. Request a new code.");
  if (row.code_hash !== await hash(phone, input.code)) {
    await db.from("whatsapp_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    throw new HttpError(401, "WRONG_CODE", "That code isn't right. Check WhatsApp and try again.");
  }
  await db.from("whatsapp_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);

  if (input.purpose === "link") {
    const { data: other } = await db.from("profiles").select("id").eq("whatsapp", phone).eq("whatsapp_verified", true).neq("id", user!.id).maybeSingle();
    if (other) throw new HttpError(409, "NUMBER_TAKEN", "This WhatsApp number is already linked to another account.");
    const { error } = await db.from("profiles").update({ whatsapp: phone, whatsapp_verified: true }).eq("id", user!.id);
    if (error) throw new HttpError(500, "SAVE_FAILED", "Could not save your number.");
    return json({ linked: true });
  }

  // login: find the account for this number, or create one.
  const synthetic = `wa${phone.slice(1)}@phone.rentamotor.invalid`;
  const { data: prof } = await db.from("profiles").select("id")
    .or(`and(whatsapp.eq.${phone},whatsapp_verified.eq.true),phone.eq.${phone}`).limit(1).maybeSingle();
  let email: string;
  if (prof) {
    const { data: u } = await db.auth.admin.getUserById(prof.id);
    if (!u?.user) throw new HttpError(404, "NO_ACCOUNT", "Account not found.");
    if (u.user.banned_until && new Date(u.user.banned_until) > new Date()) throw new HttpError(403, "BANNED", "This account is closed.");
    email = u.user.email ?? synthetic;
    if (!u.user.email) await db.auth.admin.updateUserById(prof.id, { email, email_confirm: true });
    await db.from("profiles").update({ whatsapp: phone, whatsapp_verified: true }).eq("id", prof.id);
  } else {
    const { data: created, error } = await db.auth.admin.createUser({ email: synthetic, email_confirm: true, user_metadata: { signup: "whatsapp" } });
    if (error || !created.user) throw new HttpError(500, "SIGNUP_FAILED", "Could not create your account. Try again.");
    email = synthetic;
    await db.from("profiles").update({ phone, whatsapp: phone, whatsapp_verified: true }).eq("id", created.user.id);
  }
  const { data: link, error: linkErr } = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr || !link?.properties?.hashed_token) throw new HttpError(500, "LOGIN_FAILED", "Could not sign you in. Try again.");
  return json({ tokenHash: link.properties.hashed_token });
}));
