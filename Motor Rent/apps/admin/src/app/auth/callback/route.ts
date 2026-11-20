import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * OAuth return URL (Google / Apple). Exchanges the one-time PKCE code for a session cookie,
 * then sends the user to the console; requireStaff() still decides whether they may stay.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/";
  // Only same-site paths (no protocol-relative "//evil.com").
  const next = /^\/(?!\/)[\w\-/]*$/.test(nextParam) ? nextParam : "/";
  if (url.searchParams.get("error")) {
    return NextResponse.redirect(new URL(`/login?error=oauth`, url.origin));
  }
  if (code) {
    const db = await supabaseServer();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=oauth", url.origin));
}
