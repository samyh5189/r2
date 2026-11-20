"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/** Landing page of the admin "forgot password" email (the /auth/callback route signs the user in first). */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = pw.length >= 8 && /[a-z]/i.test(pw) && /\d/.test(pw) && pw === pw2;
  const input = "w-full rounded-xl border-[1.5px] border-line bg-panel px-3.5 py-3 outline-none focus:border-accent";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setError(/session/i.test(error.message) ? "This reset link has expired. Request a new one from the sign-in page." : error.message);
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-6">
      <form onSubmit={save} className="rise w-full max-w-sm space-y-4 rounded-2xl border border-line bg-panel p-6">
        <h1 className="text-2xl font-bold">Choose a new password</h1>
        <label className="block space-y-1"><span className="text-sm text-muted">New password</span>
          <input className={input} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" autoFocus /></label>
        <label className="block space-y-1"><span className="text-sm text-muted">Repeat new password</span>
          <input className={input} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></label>
        <p className="text-xs text-muted">At least 8 characters, with letters and a number.</p>
        {pw2 && pw !== pw2 && <p className="text-sm text-red-600">Passwords don&apos;t match.</p>}
        {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
        <button disabled={!valid || busy} className="w-full rounded-xl bg-accent px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save password"}</button>
      </form>
    </main>
  );
}
