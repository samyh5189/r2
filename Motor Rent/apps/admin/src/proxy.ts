import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfigured } from "./lib/config";

// Refreshes the Supabase session cookie on each request. Authorization is NOT done here
// (see lib/auth.ts requireStaff) — proxy is only an optimistic, cookie-level step.
export async function proxy(request: NextRequest) {
  if (!supabaseConfigured) {
    return request.nextUrl.pathname.startsWith("/login") || request.nextUrl.pathname.startsWith("/auth/") ? NextResponse.next() : NextResponse.redirect(new URL("/login", request.url));
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const open = ["/login", "/auth/"].some((p) => request.nextUrl.pathname.startsWith(p));
  if (!user && !open) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|stock/).*)"],
};
