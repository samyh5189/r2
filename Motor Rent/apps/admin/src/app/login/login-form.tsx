"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Method = "email" | "phone";
/** Phone (SMS) sign-in needs an SMS provider in Supabase; hidden until NEXT_PUBLIC_PHONE_AUTH=1. */
const PHONE_AUTH = process.env.NEXT_PUBLIC_PHONE_AUTH === "1";

function friendly(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "Email or password is wrong.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Wait a minute and try again.";
  if (m.includes("provider") || m.includes("unsupported phone")) return "Text-message sign-in is not switched on yet. Use email.";
  if (m.includes("signups not allowed") || m.includes("user not found")) return "No staff account uses that number.";
  return message;
}

/**
 * Staff sign-in. There is no sign-up here: accounts are created as riders and promoted to staff/manager/owner
 * in the database. A non-staff account that signs in is bounced back by requireStaff().
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [method, setMethod] = useState<Method>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("+960");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    params.get("error") === "not-staff" ? "This account is not a staff account. Ask the owner to grant access."
      : params.get("error") === "oauth" ? "Google / Apple sign-in did not complete. Try again or use email." : null,
  );
  const [oauthBusy, setOauthBusy] = useState<"google" | "apple" | null>(null);
  const supabase = supabaseBrowser();
  const cleanPhone = phone.replace(/\s/g, "");
  const cleanEmail = email.trim().toLowerCase();

  function signedIn() {
    router.replace("/");
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (method === "email") {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) setError(friendly(error.message));
        else signedIn();
      } else if (step === "phone") {
        const { error } = await supabase.auth.signInWithOtp({ phone: cleanPhone, options: { shouldCreateUser: false } });
        if (error) setError(friendly(error.message));
        else setStep("code");
      } else {
        const { error } = await supabase.auth.verifyOtp({ phone: cleanPhone, token: code, type: "sms" });
        if (error) setError("That code is wrong or expired.");
        else signedIn();
      }
    } finally {
      setBusy(false);
    }
  }

  async function oauth(provider: "google" | "apple") {
    setOauthBusy(provider);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}/auth/callback` } });
    if (error) {
      setOauthBusy(null);
      const name = provider === "google" ? "Google" : "Apple";
      setError(/not enabled|unsupported provider/i.test(error.message) ? `Sign in with ${name} is not switched on yet. Use email for now.` : error.message);
    }
  }

  async function forgot() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) return setError("Enter your email first.");
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password` });
    if (error) setError(friendly(error.message));
    else setInfo("If that email has an account, a reset link is on its way.");
  }

  const input =
    "w-full rounded-xl border-[1.5px] border-line bg-panel px-3.5 py-3 text-base outline-none transition focus:border-accent focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_18%,transparent)]";
  const disabled =
    busy ||
    (method === "email" ? !cleanEmail || !password : step === "code" ? code.length !== 6 : !/^\+\d{7,15}$/.test(cleanPhone));

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <button type="button" onClick={() => oauth("google")} disabled={!!oauthBusy}
        className="relative flex w-full items-center justify-center rounded-xl bg-accent px-4 py-3 font-semibold text-white shadow-[0_8px_20px_color-mix(in_srgb,var(--accent)_35%,transparent)] transition hover:-translate-y-0.5 active:scale-[.98] disabled:opacity-60">
        <span className="absolute left-2 flex h-9 w-9 items-center justify-center rounded-lg bg-white">
          <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
        </span>
        {oauthBusy === "google" ? "Redirecting…" : "Continue with Google"}
      </button>
      <button type="button" onClick={() => oauth("apple")} disabled={!!oauthBusy}
        className="relative flex w-full items-center justify-center rounded-xl border-[1.5px] border-line bg-panel px-4 py-3 font-semibold transition hover:-translate-y-0.5 active:scale-[.98] disabled:opacity-60">
        <svg viewBox="0 0 24 24" className="absolute left-4 h-5 w-5 fill-current" aria-hidden>
          <path d="M16.37 12.6c-.02-2.24 1.83-3.32 1.91-3.37-1.04-1.52-2.66-1.73-3.24-1.75-1.38-.14-2.69.81-3.39.81-.7 0-1.78-.79-2.92-.77-1.5.02-2.89.87-3.66 2.21-1.56 2.71-.4 6.72 1.12 8.92.74 1.08 1.63 2.28 2.79 2.24 1.12-.05 1.54-.72 2.89-.72 1.35 0 1.73.72 2.91.7 1.2-.02 1.96-1.1 2.7-2.18.85-1.25 1.2-2.46 1.22-2.52-.03-.01-2.33-.9-2.35-3.56zM14.15 6.02c.62-.75 1.03-1.78.92-2.82-.89.04-1.97.59-2.6 1.34-.57.66-1.07 1.72-.94 2.73.99.08 2.01-.5 2.62-1.25z" />
        </svg>
        {oauthBusy === "apple" ? "Redirecting…" : "Continue with Apple"}
      </button>
      <div className="flex items-center gap-3 text-sm text-muted"><span className="h-px flex-1 bg-line" />or use email<span className="h-px flex-1 bg-line" /></div>

      {PHONE_AUTH && <div role="tablist" className="grid grid-cols-2 rounded-xl bg-line/60 p-1">
        {(["email", "phone"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={method === m}
            onClick={() => { setMethod(m); setError(null); setInfo(null); }}
            className={`rounded-lg py-2 text-sm font-semibold transition ${method === m ? "bg-panel shadow-sm" : "text-muted hover:text-foreground"}`}>
            {m === "email" ? "Email" : "Phone"}
          </button>
        ))}
      </div>}

      <div key={method} className="rise space-y-4">
        {method === "email" ? (
          <>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-muted">Email</span>
              <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-muted">Password</span>
              <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </label>
          </>
        ) : step === "phone" ? (
          <label className="block space-y-1">
            <span className="text-sm font-medium text-muted">Mobile number</span>
            <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" autoFocus />
          </label>
        ) : (
          <label className="block space-y-1">
            <span className="text-sm font-medium text-muted">6-digit code sent to {phone}</span>
            <input className={`${input} text-center text-xl tracking-[0.5em]`} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric" autoComplete="one-time-code" autoFocus />
          </label>
        )}
      </div>

      {error && <p role="alert" className="rise rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {info && <p role="status" className="rise rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">{info}</p>}

      <button disabled={disabled}
        className="w-full rounded-xl bg-foreground px-4 py-3 font-semibold text-background transition hover:-translate-y-0.5 active:translate-y-0 active:scale-[.98] disabled:translate-y-0 disabled:opacity-40">
        {busy ? "Please wait…" : method === "email" ? "Sign in with email" : step === "code" ? "Sign in" : "Send code"}
      </button>

      {method === "email" && (
        <button type="button" onClick={forgot} className="w-full text-sm text-muted hover:text-foreground">Forgot password?</button>
      )}
      {method === "phone" && step === "code" && (
        <button type="button" onClick={() => { setStep("phone"); setCode(""); }} className="w-full text-sm text-muted hover:text-foreground">
          Use a different number
        </button>
      )}
    </form>
  );
}
