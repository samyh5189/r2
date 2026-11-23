import { Suspense } from "react";
import { supabaseConfigured } from "@/lib/config";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="grid flex-1 lg:grid-cols-2">
      <div className="relative hidden overflow-hidden lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/stock/hero.jpg" alt="" className="kenburns absolute inset-0 h-full w-full object-cover object-[50%_62%]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/30" />
        <div className="rise absolute inset-x-10 bottom-10 text-white">
          <p className="text-sm font-semibold text-white/80">Staff console</p>
          <p className="mt-2 max-w-md text-4xl font-bold leading-tight tracking-tight">Every bike, booking and handover in one place.</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="relative h-36 overflow-hidden rounded-2xl lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/stock/hero.jpg" alt="" className="kenburns absolute inset-0 h-full w-full object-cover object-[50%_62%]" />
          </div>
          <div className="rise">
            <div className="flex items-center gap-3"><span className="brand-mark" aria-hidden>ER</span><h1 className="text-3xl font-bold tracking-tight">EasyRide</h1></div>
            <p className="text-sm text-muted">Staff and managers only.</p>
          </div>
          <div className="rise rounded-2xl border border-line bg-panel p-5 " style={{ animationDelay: "120ms" }}>
            {supabaseConfigured ? (
              <Suspense>
                <LoginForm />
              </Suspense>
            ) : (
              <p role="alert" className="text-sm">
                Backend not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the Vercel project, then redeploy.
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
