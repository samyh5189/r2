// POST /rental-agreement { bookingId } — staff (re)make the signed rental agreement PDF from the pickup record,
// e.g. after filling in the company details. Returns a short-lived download link.
import { z } from "zod";
import { makeAgreement } from "../_shared/agreement-file.ts";
import { handler, HttpError, json } from "../_shared/http.ts";
import { adminClient, parseJson, requireUser } from "../_shared/supabase.ts";

const Body = z.object({ bookingId: z.guid() });

Deno.serve(handler(async (req) => {
  const db = adminClient();
  const user = await requireUser(req, db);
  const { bookingId } = await parseJson(req, Body);
  const { data: staff } = await db.from("profiles").select("role, branch_id").eq("id", user.id).single();
  if (!staff || staff.role === "rider") throw new HttpError(403, "FORBIDDEN", "Staff only.");
  const { data: b } = await db.from("bookings").select("branch_id").eq("id", bookingId).single();
  if (!b) throw new HttpError(404, "NOT_FOUND", "Booking not found.");
  if (staff.role === "staff" && staff.branch_id !== b.branch_id) throw new HttpError(403, "WRONG_BRANCH", "This booking belongs to another branch.");
  const { data: insp } = await db.from("inspections").select("id").eq("booking_id", bookingId).eq("phase", "pickup").maybeSingle();
  if (!insp) throw new HttpError(409, "NO_HANDOVER", "The vehicle hasn't been handed over yet.");
  const { path } = await makeAgreement(db, bookingId);
  const { data: url } = await db.storage.from("contracts").createSignedUrl(path, 600, { download: true });
  return json({ path, url: url?.signedUrl ?? null });
}));
