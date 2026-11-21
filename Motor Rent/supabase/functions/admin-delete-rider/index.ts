// POST /admin-delete-rider { riderId } — managers and owners delete a rider (same rules as self-deletion).
import { z } from "zod";
import { deleteRider } from "../_shared/delete-rider.ts";
import { handler, HttpError, json } from "../_shared/http.ts";
import { adminClient, parseJson, requireUser } from "../_shared/supabase.ts";

const Body = z.object({ riderId: z.string().uuid() });

Deno.serve(handler(async (req) => {
  const db = adminClient();
  const user = await requireUser(req, db);
  const { riderId } = await parseJson(req, Body);
  const { data: me } = await db.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "manager" && me?.role !== "owner") throw new HttpError(403, "FORBIDDEN", "Only managers and owners can delete riders.");
  const { data: target } = await db.from("profiles").select("role").eq("id", riderId).maybeSingle();
  if (!target) throw new HttpError(404, "NOT_FOUND", "Rider not found.");
  if (target.role !== "rider") throw new HttpError(403, "STAFF_ACCOUNT", "Staff accounts can't be deleted here.");
  const result = await deleteRider(db, riderId, { who: "office" });
  await db.from("audit_log").insert({ actor: user.id, action: "delete", entity: "profiles", entity_id: riderId, before: null, after: { by: "office", ...result } });
  return json(result);
}));
