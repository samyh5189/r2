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

/** The signed-in user, or null for a visitor (the anon key is not a user). */
export async function optionalUser(req: Request, db: SupabaseClient) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token === Deno.env.get("SUPABASE_ANON_KEY")) return null;
  const { data } = await db.auth.getUser(token);
  return data.user ?? null;
}

/** Best-effort caller address for rate limits (behind Supabase's proxy). */
export function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
}

/** Counts a sign-in-free request and refuses past `max` per `minutes` for this key. */
export async function rateLimit(db: SupabaseClient, kind: string, key: string, max: number, minutes: number) {
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const { count } = await db.from("guest_requests").select("id", { count: "exact", head: true }).eq("kind", kind).eq("key", key).gte("at", since);
  if ((count ?? 0) >= max) throw new HttpError(429, "TOO_MANY_REQUESTS", "Too many tries. Please wait a while, or call us.");
  await db.from("guest_requests").insert({ kind, key });
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
