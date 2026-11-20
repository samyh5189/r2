import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./http.ts";

/** Service-role client: bypasses RLS. Only ever used server-side, after checking the caller. */
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireUser(req: Request, db: SupabaseClient) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "UNAUTHENTICATED", "Please sign in.");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "UNAUTHENTICATED", "Please sign in again.");
  return data.user;
}

export async function parseJson<T>(req: Request, schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "BAD_JSON", "Request body must be JSON.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HttpError(422, "VALIDATION", parsed.error.issues.map((i) => i.message).join("; "));
  return parsed.data;
}
