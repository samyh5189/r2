import { Suspense } from "react";
import { supabaseConfigured } from "@/lib/config";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Motor Rent Admin</h1>
          <p className="text-sm text-muted">Staff and managers only.</p>
        </div>
        {supabaseConfigured ? (
          <Suspense>
            <LoginForm />
          </Suspense>
        ) : (
          <p role="alert" className="rounded-lg border border-line bg-panel p-4 text-sm">
            Backend not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the Vercel project, then redeploy.
          </p>
        )}
      </div>
    </main>
  );
}
