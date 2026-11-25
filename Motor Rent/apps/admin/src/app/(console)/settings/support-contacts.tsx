"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

const field = "w-full rounded-xl border border-line bg-panel px-3 py-2 outline-none transition focus:border-accent";

/** Phone / email riders see on their Account page (call us, breakdown help). */
export function SupportContacts({ phone, email, canEdit }: { phone: string | null; email: string | null; canEdit: boolean }) {
  const router = useRouter();
  const [p, setP] = useState(phone ?? "");
  const [e, setE] = useState(email ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    const { error } = await supabaseBrowser().rpc("update_support_contacts", { p_phone: p, p_email: e });
    setMsg(error ? { ok: false, text: /check constraint/.test(error.message) ? "Check the phone number (digits, optional +) and email." : error.message } : { ok: true, text: "Saved ✓" });
    if (!error) router.refresh();
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Support contacts</h2>
        <p className="text-sm text-muted">Shown to riders on their Account page for help and breakdowns.</p>
      </div>
      <form onSubmit={save} className="grid gap-3 rounded-2xl border border-line bg-panel p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="space-y-1"><span className="text-xs font-medium text-muted">Phone / WhatsApp</span>
          <input className={field} value={p} onChange={(x) => setP(x.target.value)} placeholder="+960 7xx xxxx" inputMode="tel" disabled={!canEdit} /></label>
        <label className="space-y-1"><span className="text-xs font-medium text-muted">Email</span>
          <input className={field} type="email" value={e} onChange={(x) => setE(x.target.value)} placeholder="hello@yourdomain.mv" disabled={!canEdit} /></label>
        {canEdit && <button className="btn btn-primary">Save</button>}
        {msg && <p role="status" className={`text-sm sm:col-span-3 ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>}
      </form>
    </section>
  );
}
