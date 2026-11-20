// POST /quote — server-side price. The client sends only vehicle, period and extras.
import { quote } from "@shared/pricing.ts";
import { QuoteRequest } from "@shared/schemas.ts";
import { handler, HttpError, json } from "../_shared/http.ts";
import { adminClient, parseJson, requireUser } from "../_shared/supabase.ts";

const MAX_DAYS = 30;
const HOUR = 3_600_000;

Deno.serve(handler(async (req) => {
  const db = adminClient();
  const user = await requireUser(req, db);
  const input = await parseJson(req, QuoteRequest);

  const start = new Date(input.start);
  const end = new Date(input.end);
  if (start.getTime() < Date.now() - 5 * 60_000) throw new HttpError(422, "START_IN_PAST", "Start time is in the past.");
  if (end.getTime() - start.getTime() < HOUR) throw new HttpError(422, "TOO_SHORT", "Minimum rental is 1 hour.");
  if (end.getTime() - start.getTime() > MAX_DAYS * 24 * HOUR) throw new HttpError(422, "TOO_LONG", `Maximum rental is ${MAX_DAYS} days.`);

  const { data: vehicle } = await db
    .from("vehicles")
    .select("id, status, price_plans!inner(hourly, daily, weekly, deposit, multiplier, currency, active)")
    .eq("id", input.vehicleId)
    .single();
  if (!vehicle || vehicle.status !== "active") throw new HttpError(404, "VEHICLE_UNAVAILABLE", "This bike is not available.");
  const plan = vehicle.price_plans as unknown as {
    hourly: number; daily: number; weekly: number; deposit: number; multiplier: number; currency: string; active: boolean;
  };
  if (!plan.active) throw new HttpError(404, "VEHICLE_UNAVAILABLE", "This bike is not available.");

  const period = `[${start.toISOString()},${end.toISOString()})`;
  const { data: available } = await db.rpc("vehicle_is_available", { v: input.vehicleId, p: period });
  if (!available) throw new HttpError(409, "NOT_AVAILABLE", "This bike is already booked for that time.");

  const codes = input.extras.map((e) => e.code);
  const { data: extraRows } = codes.length
    ? await db.from("extras").select("code, label, per_day, max_quantity").in("code", codes).eq("active", true)
    : { data: [] as { code: string; label: string; per_day: number; max_quantity: number }[] };
  const extras = input.extras.map((e) => {
    const row = extraRows?.find((r) => r.code === e.code);
    if (!row) throw new HttpError(422, "UNKNOWN_EXTRA", `Unknown extra: ${e.code}`);
    if (e.quantity > row.max_quantity) throw new HttpError(422, "EXTRA_LIMIT", `Max ${row.max_quantity} × ${row.label}`);
    return { code: row.code, label: row.label, perDay: row.per_day, quantity: e.quantity };
  });

  // TODO(v1.1): promo codes table → promoPercent
  const q = quote({ plan: { ...plan, multiplier: Number(plan.multiplier) }, start, end, extras });

  const { data: saved, error } = await db
    .from("quotes")
    .insert({
      rider_id: user.id, vehicle_id: input.vehicleId, period, extras: input.extras,
      lines: q.lines, total: q.total, deposit: q.deposit, currency: plan.currency,
    })
    .select("id, expires_at")
    .single();
  if (error) throw error;

  return json({ quoteId: saved.id, expiresAt: saved.expires_at, currency: plan.currency, ...q });
}));
