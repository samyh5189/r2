// POST /delete-account — a rider deletes their own account (rules in _shared/delete-rider.ts).
import { deleteRider } from "../_shared/delete-rider.ts";
import { handler, HttpError, json } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";

Deno.serve(handler(async (req) => {
  const db = adminClient();
  const user = await requireUser(req, db);
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).single();
  if (profile && profile.role !== "rider") throw new HttpError(403, "STAFF_ACCOUNT", "Staff accounts are removed by the owner.");
  const result = await deleteRider(db, user.id, { who: "self" });
  if (result.anonymised) await db.auth.admin.signOut(req.headers.get("Authorization")!.replace(/^Bearer\s+/i, ""), "global").catch(() => {});
  return json(result);
}));
