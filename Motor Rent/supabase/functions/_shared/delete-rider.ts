// Shared by delete-account (rider deletes themselves) and admin-delete-rider (owner/manager).
// - Refused while a rental is open (paid/active/overdue/damage claim, or a slip under review).
// - Identity documents and profile photos are always erased.
// - No booking history: the auth user is deleted outright (profile cascades).
// - With booking history: bookings/payments are financial records and stay; the person is anonymised and login disabled.
import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./http.ts";

export async function deleteRider(db: SupabaseClient, uid: string, opts: { who: "self" | "office" }) {
  const { data: open } = await db.from("bookings").select("id, status").eq("rider_id", uid)
    .in("status", ["held", "confirmed", "active", "overdue", "returned", "damage_claim"]);
  const { data: pendingSlips } = await db.from("transfer_slips").select("id").eq("rider_id", uid).eq("status", "pending");
  if ((open ?? []).some((b) => b.status !== "held") || (pendingSlips ?? []).length) {
    throw new HttpError(409, "OPEN_RENTAL", opts.who === "self"
      ? "You have an open or paid rental. Please finish it or contact the office before deleting your account."
      : "This rider has an open or paid rental or a slip under review. Close or cancel it first.");
  }
  for (const b of open ?? []) await db.from("bookings").update({ status: "cancelled", held_until: null }).eq("id", b.id).eq("status", "held");

  const { data: folders } = await db.storage.from("kyc").list(uid, { limit: 100 });
  const paths: string[] = [];
  for (const f of folders ?? []) {
    const { data: files } = await db.storage.from("kyc").list(`${uid}/${f.name}`, { limit: 100 });
    for (const x of files ?? []) paths.push(`${uid}/${f.name}/${x.name}`);
  }
  if (paths.length) await db.storage.from("kyc").remove(paths);
  await db.from("kyc_submissions").delete().eq("profile_id", uid);
  await db.from("kyc_documents").delete().eq("profile_id", uid);
  const { data: pics } = await db.storage.from("avatars").list(uid, { limit: 100 });
  if (pics?.length) await db.storage.from("avatars").remove(pics.map((f) => `${uid}/${f.name}`));

  const { count } = await db.from("bookings").select("id", { count: "exact", head: true }).eq("rider_id", uid);
  if (!count) {
    const { error } = await db.auth.admin.deleteUser(uid);
    if (error) throw error;
    return { deleted: true, anonymised: false };
  }
  await db.from("profiles").update({ full_name: "Deleted rider", phone: null, whatsapp: null, whatsapp_verified: false, date_of_birth: null, avatar_path: null }).eq("id", uid);
  await db.from("booking_messages").update({ author_name: "Deleted rider", author_avatar: null }).eq("author", uid);
  const { error } = await db.auth.admin.updateUserById(uid, {
    email: `deleted-${uid}@deleted.invalid`, phone: "", user_metadata: {}, ban_duration: "876000h",
  });
  if (error) throw error;
  return { deleted: true, anonymised: true };
}
