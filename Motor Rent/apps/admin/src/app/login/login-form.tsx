"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Method = "email" | "phone";

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
  const [error, setError] = useState<string | null>(params.get("error") === "not-staff" ? "This account is not a staff account. Ask the owner to grant access." : null);
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

  async function forgot() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) return setError("Enter your email first.");
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo: window.location.origin + "/login" });
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
      <div role="tablist" className="grid grid-cols-2 rounded-xl bg-line/60 p-1">
        {(["email", "phone"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={method === m}
            onClick={() => { setMethod(m); setError(null); setInfo(null); }}
            className={`rounded-lg py-2 text-sm font-semibold transition ${method === m ? "bg-panel shadow-sm" : "text-muted hover:text-foreground"}`}>
            {m === "email" ? "Email" : "Phone"}
          </button>
        ))}
      </div>

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
        className="w-full rounded-xl bg-accent px-4 py-3 font-semibold text-white shadow-[0_8px_20px_color-mix(in_srgb,var(--accent)_35%,transparent)] transition hover:-translate-y-0.5 active:translate-y-0 active:scale-[.98] disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none">
        {busy ? "Please wait…" : method === "email" || step === "code" ? "Sign in" : "Send code"}
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
