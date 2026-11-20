// POST /submit-inspection — staff record pickup / return. The only way a booking becomes `active` or `returned`.
import { lateFee } from "@shared/pricing.ts";
import { InspectionSubmit } from "@shared/schemas.ts";
import { handler, HttpError, json } from "../_shared/http.ts";
import { parseTstzRange } from "../_shared/range.ts";
import { adminClient, parseJson, requireUser } from "../_shared/supabase.ts";

const EARLY_PICKUP_MINUTES = 30;

Deno.serve(handler(async (req) => {
  const db = adminClient();
  const user = await requireUser(req, db);
  const input = await parseJson(req, InspectionSubmit);

  const { data: staff } = await db.from("profiles").select("role, branch_id").eq("id", user.id).single();
  if (!staff || staff.role === "rider") throw new HttpError(403, "FORBIDDEN", "Staff only.");

  const { data: b } = await db.from("bookings")
    .select("id, status, period, branch_id, vehicle_id, rider_id, currency, vehicles!inner(odometer_km, price_plans!inner(late_fee_per_hour, late_grace_minutes, daily))")
    .eq("id", input.bookingId).single();
  if (!b) throw new HttpError(404, "NOT_FOUND", "Booking not found.");
  if (staff.role === "staff" && staff.branch_id !== b.branch_id) throw new HttpError(403, "WRONG_BRANCH", "This booking belongs to another branch.");

  // Files must belong to this booking + phase (no re-using another booking's photos).
  const prefix = `${b.id}/${input.phase}/`;
  for (const p of [...input.photoPaths, input.riderSignaturePath, input.staffSignaturePath]) {
    if (!p.startsWith(prefix)) throw new HttpError(422, "BAD_PATH", "Photos must be taken for this booking.");
  }

  // deno-lint-ignore no-explicit-any
  const vehicle = b.vehicles as any;
  if (input.odometerKm < vehicle.odometer_km) throw new HttpError(422, "ODOMETER", `Odometer cannot be below ${vehicle.odometer_km} km.`);

  const { start, end } = parseTstzRange(b.period);
  const now = new Date();

  if (input.phase === "pickup") {
    if (b.status !== "confirmed") throw new HttpError(409, "NOT_CONFIRMED", "Booking is not paid / confirmed.");
    if (now.getTime() < start.getTime() - EARLY_PICKUP_MINUTES * 60_000) throw new HttpError(409, "TOO_EARLY", "Too early for pickup.");
    const { data: rider } = await db.from("profiles").select("kyc_status, licence_expires_on").eq("id", b.rider_id).single();
    if (rider?.kyc_status !== "approved" || !rider.licence_expires_on || new Date(rider.licence_expires_on) < end) {
      throw new HttpError(403, "KYC_REQUIRED", "Rider ID / licence not verified for this rental.");
    }
  } else if (b.status !== "active" && b.status !== "overdue") {
    throw new HttpError(409, "NOT_ON_RENT", "This bike is not currently rented out.");
  }

  const { error: insErr } = await db.from("inspections").insert({
    booking_id: b.id, phase: input.phase, photo_paths: input.photoPaths, fuel_level: input.fuelLevel,
    odometer_km: input.odometerKm, rider_signature_path: input.riderSignaturePath,
    staff_signature_path: input.staffSignaturePath, notes: input.notes, staff_id: user.id,
  });
  if (insErr?.code === "23505") throw new HttpError(409, "ALREADY_DONE", `The ${input.phase} inspection was already recorded.`);
  if (insErr) throw insErr;

  await db.from("vehicles").update({ odometer_km: input.odometerKm }).eq("id", b.vehicle_id);

  if (input.phase === "pickup") {
    await db.from("bookings").update({ status: "active", picked_up_at: now.toISOString() }).eq("id", b.id).eq("status", "confirmed");
    // TODO: create deposit authorisation hold off-session on the saved card (Stripe manual capture).
    return json({ status: "active" });
  }

  const plan = vehicle.price_plans;
  const fee = lateFee(end, now, { graceMinutes: plan.late_grace_minutes, perStartedHour: plan.late_fee_per_hour, cap: plan.daily });
  await db.from("bookings").update({ status: "returned", returned_at: now.toISOString() }).eq("id", b.id).in("status", ["active", "overdue"]);
  if (fee > 0) {
    await db.from("payments").upsert({
      booking_id: b.id, kind: "charge", provider: "stripe", idempotency_key: `${b.id}:late-fee`,
      amount: fee, currency: b.currency, status: "pending", recorded_by: user.id,
    }, { onConflict: "idempotency_key", ignoreDuplicates: true });
    // TODO: charge off-session (or capture from deposit) and notify the rider with the breakdown.
  }
  return json({ status: "returned", lateFee: fee });
}));
