import "server-only";
import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";

export type StaffUser = { id: string; name: string | null; role: "staff" | "manager" | "owner" };

/**
 * Data Access Layer: every console page calls this. It verifies the JWT with Supabase
 * (getUser, not getSession) and the role from the database. RLS still applies to every query.
 */
export async function requireStaff() {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await db.from("profiles").select("full_name, role").eq("id", user.id).single();
  if (!profile || profile.role === "rider") redirect("/login?error=not-staff");
  return { db, user: { id: user.id, name: profile.full_name, role: profile.role } as StaffUser };
}
