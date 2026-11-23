// POST /guest-booking — book without an account, or look a booking up by reference and mobile number.
//   { action: "book", quoteId, name, phone, handover, deliveryAddress?, acceptedTermsVersion }
//   { action: "lookup", reference, phone }
//   { action: "slip-url", reference, phone, ext } → signed upload link; { action: "slip", reference, phone, path, ocr }
// A guest booking is held unpaid; the office calls the number to confirm and take payment. When someone later
// verifies an account with the same mobile number, staff approval joins these bookings to it.
import { GuestBookingRequest, GuestLookupRequest } from "@shared/schemas.ts";
import { handler, HttpError, json } from "../_shared/http.ts";
import { parseTstzRange } from "../_shared/range.ts";
import { adminClient, clientIp, rateLimit } from "../_shared/supabase.ts";

const MV = 5 * 3_600_000;        // Maldives time, UTC+5
const OPEN_HOUR = 7, CLOSE_HOUR = 22; // counter hours, keep in sync with quote
const CALL_WINDOW = 2 * 3_600_000;    // time for the office to reach the guest

/** Hold long enough for the office to call during opening hours, but not past an hour after pickup time. */
function holdUntil(start: Date) {
  const now = Date.now();
  const local = new Date(now + MV);
  const h = local.getUTCHours() + local.getUTCMinutes() / 60;
  let t: number;
  if (h >= OPEN_HOUR && h < CLOSE_HOUR - 1) t = now + CALL_WINDOW;
  else {
    const day = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + (h >= OPEN_HOUR ? 1 : 0), OPEN_HOUR) - MV;
    t = day + CALL_WINDOW;
  }
  return new Date(Math.max(now + 30 * 60_000, Math.min(t, start.getTime() + 3_600_000)));
}

// deno-lint-ignore no-explicit-any
async function normPhone(db: any, phone: string) {
  const { data } = await db.rpc("norm_phone", { p: phone });
  if (!data) throw new HttpError(422, "BAD_PHONE", "Enter your mobile number: 7 digits, or with the country code if it isn't Maldivian.");
  return data as string;
}

Deno.serve(handler(async (req) => {
  const db = adminClient();
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { throw new HttpError(400, "BAD_JSON", "Request body must be JSON."); }
  const ip = clientIp(req);

  // Bank transfer slip: get an upload link, then submit the uploaded file for review.
  if (body.action === "slip-url" || body.action === "slip") {
    const parsed = GuestLookupRequest.safeParse(body);
    if (!parsed.success) throw new HttpError(422, "VALIDATION", parsed.error.issues.map((i) => i.message).join("; "));
    await rateLimit(db, "slip", ip, 12, 60);
    const phone = await normPhone(db, parsed.data.phone);
    const { data: b } = await db.from("bookings").select("id, status, held_until")
      .eq("reference", parsed.data.reference).eq("guest_phone", phone).maybeSingle();
    if (!b) throw new HttpError(404, "NOT_FOUND", "No booking with that reference and mobile number.");
    if (b.status !== "held" || (b.held_until && new Date(b.held_until) < new Date())) {
      throw new HttpError(409, "NOT_PAYABLE", "This booking is no longer waiting for payment.");
    }
    if (body.action === "slip-url") {
      const ext = ["jpg", "png", "webp"].includes(String(body.ext)) ? String(body.ext) : "jpg";
      const path = `guest/${b.id}/${Date.now()}.${ext}`;
      const { data, error } = await db.storage.from("payment-slips").createSignedUploadUrl(path);
      if (error || !data) throw new HttpError(500, "UPLOAD_LINK", "Could not prepare the upload. Try again.");
      return json({ path, token: data.token });
    }
    const path = String(body.path ?? "");
    const ocr = body.ocr && typeof body.ocr === "object" ? body.ocr : null;
    const { error } = await db.rpc("submit_guest_slip", { p_booking: b.id, p_path: path, p_ocr: ocr });
    if (error) throw new HttpError(409, "SLIP", error.message);
    return json({ ok: true });
  }

  if (body.action === "lookup") {
    const parsed = GuestLookupRequest.safeParse(body);
    if (!parsed.success) throw new HttpError(422, "VALIDATION", parsed.error.issues.map((i) => i.message).join("; "));
    await rateLimit(db, "lookup", ip, 20, 60);
    const phone = await normPhone(db, parsed.data.phone);
    const { data: b } = await db.from("bookings")
      .select("id, reference, status, period, total, currency, held_until, handover, delivery_address, guest_name, rider_id, viber_token, vehicles(make, model, plate, kind), branches(name)")
      .eq("reference", parsed.data.reference).eq("guest_phone", phone).maybeSingle();
    if (!b) throw new HttpError(404, "NOT_FOUND", "No booking with that reference and mobile number.");
    const { rider_id, id, ...rest } = b;
    const { data: slip } = await db.from("transfer_slips").select("status, reject_reason, created_at").eq("booking_id", id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    return json({ booking: { ...rest, id, linked: !!rider_id, slip } });
  }

  const parsed = GuestBookingRequest.safeParse(body);
  if (!parsed.success) throw new HttpError(422, "VALIDATION", parsed.error.issues.map((i) => i.message).join("; "));
  const input = parsed.data;
  await rateLimit(db, "book", ip, 6, 60);
  const phone = await normPhone(db, input.phone);

  // Retry after a dropped connection: same quote, same number → same booking.
  const { data: existing } = await db.from("bookings").select("id, reference, status, held_until, total, currency, viber_token, guest_phone").eq("quote_id", input.quoteId).maybeSingle();
  if (existing) {
    if (existing.guest_phone !== phone) throw new HttpError(404, "QUOTE_NOT_FOUND", "Quote not found.");
    const { guest_phone: _, ...booking } = existing;
    return json({ booking });
  }

  const { data: q } = await db.from("quotes").select("*, vehicles!inner(branch_id)").eq("id", input.quoteId).single();
  if (!q || q.rider_id) throw new HttpError(404, "QUOTE_NOT_FOUND", "Quote not found.");
  if (q.used_at) throw new HttpError(409, "QUOTE_USED", "This quote was already used.");
  if (new Date(q.expires_at) < new Date()) throw new HttpError(410, "QUOTE_EXPIRED", "Price expired, please refresh.");

  // Someone the office has blocked can't get round it by booking without an account.
  const { data: accounts } = await db.from("profiles").select("id").eq("phone", phone);
  for (const a of accounts ?? []) {
    const { data: blocked } = await db.rpc("is_blocked", { u: a.id });
    if (blocked) throw new HttpError(403, "ACCOUNT_BLOCKED", "We can't take this booking online. Please contact the rental office.");
  }
  // One unpaid booking at a time (the database enforces it too); paid, confirmed ones don't count.
  const ids = (accounts ?? []).map((a) => a.id);
  const { count } = await db.from("bookings").select("id", { count: "exact", head: true }).eq("status", "held")
    .or(`guest_phone.eq.${phone}${ids.length ? `,rider_id.in.(${ids.join(",")})` : ""}`);
  if (count) throw new HttpError(409, "ONE_UNPAID", "You already have a booking waiting for payment. We'll call you about it; once it's paid you can book again."); 

  const { data: claimed } = await db.from("quotes").update({ used_at: new Date().toISOString() }).eq("id", q.id).is("used_at", null).select("id");
  if (!claimed?.length) throw new HttpError(409, "QUOTE_USED", "This quote was already used.");

  const { start } = parseTstzRange(q.period);
  const { data: booking, error } = await db.from("bookings").insert({
    rider_id: null,
    guest_name: input.name,
    guest_phone: phone,
    handover: input.handover,
    delivery_address: input.handover === "delivery" ? input.deliveryAddress : null,
    vehicle_id: q.vehicle_id,
    branch_id: (q.vehicles as unknown as { branch_id: string }).branch_id,
    quote_id: q.id,
    period: q.period,
    price_snapshot: { lines: q.lines, extras: q.extras },
    total: q.total,
    deposit: q.deposit,
    currency: q.currency,
    terms_version: input.acceptedTermsVersion,
    held_until: holdUntil(start).toISOString(),
  }).select("id, reference, status, held_until, total, currency, viber_token").single();
  if (error) {
    if (error.code === "P0001") throw new HttpError(409, "ONE_UNPAID", error.message);
    if (error.code === "23P01") throw new HttpError(409, "JUST_TAKEN", "Sorry, this vehicle was just booked for a time too close to yours. Pick another time or vehicle.");
    throw error;
  }
  return json({ booking }, 201);
}));
