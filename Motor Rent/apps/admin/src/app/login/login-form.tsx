"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [phone, setPhone] = useState("+960");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") === "not-staff" ? "This account is not a staff account." : null);
  const supabase = supabaseBrowser();
  const cleanPhone = phone.replace(/\s/g, "");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (step === "phone") {
      const { error } = await supabase.auth.signInWithOtp({ phone: cleanPhone, options: { shouldCreateUser: false } });
      if (error) setError(error.message);
      else setStep("code");
    } else {
      const { error } = await supabase.auth.verifyOtp({ phone: cleanPhone, token: code, type: "sms" });
      if (error) setError("That code is wrong or expired.");
      else {
        router.replace("/");
        router.refresh();
      }
    }
    setBusy(false);
  }

  const input = "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-base outline-none focus:border-accent";
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {step === "phone" ? (
        <label className="block space-y-1">
          <span className="text-sm text-muted">Mobile number</span>
          <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" autoFocus />
        </label>
      ) : (
        <label className="block space-y-1">
          <span className="text-sm text-muted">6-digit code sent to {phone}</span>
          <input className={input} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric" autoComplete="one-time-code" autoFocus />
        </label>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button disabled={busy || (step === "code" && code.length !== 6)}
        className="w-full rounded-lg bg-accent px-4 py-2.5 font-medium text-white disabled:opacity-50">
        {busy ? "Please wait…" : step === "phone" ? "Send code" : "Sign in"}
      </button>
    </form>
  );
}
