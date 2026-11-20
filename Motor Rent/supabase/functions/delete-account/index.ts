// POST /delete-account — a rider deletes their own account.
// - Refused while a rental is open (held with a slip under review, confirmed, active, overdue, or in a damage claim).
// - Identity documents are always erased (files + rows).
// - No booking history: the auth user is deleted outright (profile cascades).
// - With booking history: bookings/payments are financial records and stay, but the person is anonymised
//   and the login is disabled.
import { handler, HttpError, json } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";

Deno.serve(handler(async (req) => {
  const db = adminClient();
  const user = await requireUser(req, db);

  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).single();
  if (profile && profile.role !== "rider") throw new HttpError(403, "STAFF_ACCOUNT", "Staff accounts are removed by the owner.");

  const { data: open } = await db.from("bookings").select("id, status").eq("rider_id", user.id)
    .in("status", ["held", "confirmed", "active", "overdue", "returned", "damage_claim"]);
  const { data: pendingSlips } = await db.from("transfer_slips").select("id").eq("rider_id", user.id).eq("status", "pending");
  if ((open ?? []).some((b) => b.status !== "held") || (pendingSlips ?? []).length) {
    throw new HttpError(409, "OPEN_RENTAL", "You have an open or paid rental. Please finish it or contact the office before deleting your account.");
  }
  // Unpaid reservations are simply cancelled.
  for (const b of open ?? []) await db.from("bookings").update({ status: "cancelled", held_until: null }).eq("id", b.id).eq("status", "held");

  // Erase identity documents.
  const { data: folders } = await db.storage.from("kyc").list(user.id, { limit: 100 });
  const paths: string[] = [];
  for (const f of folders ?? []) {
    const { data: files } = await db.storage.from("kyc").list(`${user.id}/${f.name}`, { limit: 100 });
    for (const x of files ?? []) paths.push(`${user.id}/${f.name}/${x.name}`);
  }
  if (paths.length) await db.storage.from("kyc").remove(paths);
  await db.from("kyc_submissions").delete().eq("profile_id", user.id); // cascades kyc_documents rows of submissions
  await db.from("kyc_documents").delete().eq("profile_id", user.id);

  const { count } = await db.from("bookings").select("id", { count: "exact", head: true }).eq("rider_id", user.id);
  if (!count) {
    const { error } = await db.auth.admin.deleteUser(user.id);
    if (error) throw error;
    return json({ deleted: true });
  }

  await db.from("profiles").update({ full_name: "Deleted rider", phone: null, date_of_birth: null }).eq("id", user.id);
  const { error } = await db.auth.admin.updateUserById(user.id, {
    email: `deleted-${user.id}@deleted.invalid`, phone: "", user_metadata: {}, ban_duration: "876000h",
  });
  if (error) throw error;
  await db.auth.admin.signOut(req.headers.get("Authorization")!.replace(/^Bearer\s+/i, ""), "global").catch(() => {});
  return json({ deleted: true, anonymised: true });
}));
