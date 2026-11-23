// POST /create-booking — turns a valid quote into a `held` booking and a payment intent.
// Idempotent: calling twice with the same quote returns the same booking.
import { CreateBookingRequest } from "@shared/schemas.ts";
import { handler, HttpError, json } from "../_shared/http.ts";
import { parseTstzRange } from "../_shared/range.ts";
import { stripeClient } from "../_shared/stripe.ts";
import { adminClient, parseJson, requireUser } from "../_shared/supabase.ts";

const HOLD_MINUTES_CARD = 15;
const HOLD_MINUTES_TRANSFER = 60; // time to make a bank transfer and upload the slip; extended on upload
const MIN_AGE = 18; // TODO: confirm local legal minimum

Deno.serve(handler(async (req) => {
  const db = adminClient();
  const user = await requireUser(req, db);
  const input = await parseJson(req, CreateBookingRequest);

  // Idempotency: a retry after a dropped connection gets the same booking back.
  const { data: existing } = await db.from("bookings").select("*").eq("quote_id", input.quoteId).maybeSingle();
  if (existing) {
    if (existing.rider_id !== user.id) throw new HttpError(404, "QUOTE_NOT_FOUND", "Quote not found.");
    return json(await withPayment(db, existing, user));
  }

  const { data: q } = await db.from("quotes").select("*, vehicles!inner(branch_id)").eq("id", input.quoteId).single();
  if (!q || q.rider_id !== user.id) throw new HttpError(404, "QUOTE_NOT_FOUND", "Quote not found.");
  if (q.used_at) throw new HttpError(409, "QUOTE_USED", "This quote was already used.");
  if (new Date(q.expires_at) < new Date()) throw new HttpError(410, "QUOTE_EXPIRED", "Price expired, please refresh.");

  // Staff blocklist (unpaid balances, damage, abuse). The rider only learns that they cannot book.
  const { data: blocked } = await db.rpc("is_blocked", { u: user.id });
  if (blocked) throw new HttpError(403, "ACCOUNT_BLOCKED", "This account cannot make bookings. Please contact the rental office.");

  // Verification isn't needed to book (payment is confirmed by the office and the licence is checked at the
  // latest at pickup), but a verified rider's documents must cover the whole rental, and we need a number to call.
  const { data: profile } = await db.from("profiles")
    .select("kyc_status, date_of_birth, licence_expires_on, phone").eq("id", user.id).single();
  const rentalEnd = parseTstzRange(q.period).end;
  if (profile?.kyc_status === "approved" && (!profile.licence_expires_on || new Date(profile.licence_expires_on) < rentalEnd)) {
    throw new HttpError(403, "LICENCE_EXPIRES", "Your licence expires before the rental ends.");
  }
  if (!profile?.phone) {
    const { data: phone } = input.phone ? await db.rpc("norm_phone", { p: input.phone }) : { data: null };
    if (!phone) throw new HttpError(422, "PHONE_REQUIRED", "Add your mobile number so we can reach you about the booking.");
    await db.from("profiles").update({ phone }).eq("id", user.id);
  }
  if (profile?.date_of_birth) {
    const age = (Date.now() - new Date(profile.date_of_birth).getTime()) / (365.25 * 24 * 3_600_000);
    if (age < MIN_AGE) throw new HttpError(403, "TOO_YOUNG", `Riders must be at least ${MIN_AGE}.`);
  }

  const { data: claimed } = await db.from("quotes")
    .update({ used_at: new Date().toISOString() }).eq("id", q.id).is("used_at", null).select("id");
  if (!claimed?.length) throw new HttpError(409, "QUOTE_USED", "This quote was already used.");

  const { data: booking, error } = await db.from("bookings").insert({
    rider_id: user.id,
    vehicle_id: q.vehicle_id,
    branch_id: (q.vehicles as unknown as { branch_id: string }).branch_id,
    quote_id: q.id,
    period: q.period,
    price_snapshot: { lines: q.lines, extras: q.extras },
    total: q.total,
    deposit: q.deposit,
    currency: q.currency,
    terms_version: input.acceptedTermsVersion,
    handover: input.handover,
    delivery_address: input.handover === "delivery" ? input.deliveryAddress : null,
    held_until: new Date(Date.now() + (stripeClient() ? HOLD_MINUTES_CARD : HOLD_MINUTES_TRANSFER) * 60_000).toISOString(),
  }).select("*").single();

  if (error) {
    // 23P01 = exclusion violation: someone else booked it a moment ago, or maintenance.
    if (error.code === "23P01") throw new HttpError(409, "JUST_TAKEN", "Sorry, this vehicle was just booked for a time too close to yours. Pick another time or vehicle.");
    throw error;
  }
  return json(await withPayment(db, booking, user), 201);
}));

// deno-lint-ignore no-explicit-any
async function withPayment(db: any, booking: any, user: { id: string; email?: string; phone?: string }) {
  const stripe = stripeClient();
  if (!stripe) return { booking, payment: { provider: "bank_transfer", heldUntil: booking.held_until } };

  const idempotencyKey = `${booking.id}:charge`;
  const { data: prior } = await db.from("payments").select("provider_ref").eq("idempotency_key", idempotencyKey).maybeSingle();

  let intent;
  if (prior?.provider_ref) {
    intent = await stripe.paymentIntents.retrieve(prior.provider_ref);
  } else {
    intent = await stripe.paymentIntents.create(
      {
        amount: booking.total,
        currency: booking.currency.toLowerCase(),
        // Save the card so the deposit hold (at pickup) and any damage/late fee can be charged off-session.
        setup_future_usage: "off_session",
        automatic_payment_methods: { enabled: true },
        metadata: { booking_id: booking.id, rider_id: user.id, reference: booking.reference },
      },
      { idempotencyKey },
    );
    await db.from("payments").insert({
      booking_id: booking.id, kind: "charge", provider: "stripe", provider_ref: intent.id,
      idempotency_key: idempotencyKey, amount: booking.total, currency: booking.currency, status: "pending",
    });
  }
  return { booking, payment: { provider: "stripe", clientSecret: intent.client_secret, heldUntil: booking.held_until } };
}
