"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

const field = "w-full rounded-xl border border-line bg-panel px-3 py-2 outline-none transition focus:border-accent";

/** Printed on the letterhead of every rental agreement. */
export function CompanyDetails({ legalName, regNo, address, canEdit }: { legalName: string | null; regNo: string | null; address: string | null; canEdit: boolean }) {
  const router = useRouter();
  const [n, setN] = useState(legalName ?? "");
  const [r, setR] = useState(regNo ?? "");
  const [a, setA] = useState(address ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    const { error } = await supabaseBrowser().rpc("update_company_details", { p_legal_name: n, p_reg_no: r, p_address: a });
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Saved. New agreements use these details." });
    if (!error) router.refresh();
  }

  return (
    <section id="company" className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Company details</h2>
        <p className="text-sm text-muted">Shown on the letterhead of the rental agreement riders sign at handover, with the support phone and email.</p>
      </div>
      <form onSubmit={save} className="grid gap-3 rounded-2xl border border-line bg-panel p-4 sm:grid-cols-2">
        <label className="space-y-1"><span className="text-xs font-medium text-muted">Registered company name</span>
          <input className={field} value={n} onChange={(x) => setN(x.target.value)} placeholder="As on the registration certificate" disabled={!canEdit} /></label>
        <label className="space-y-1"><span className="text-xs font-medium text-muted">Registration number</span>
          <input className={field} value={r} onChange={(x) => setR(x.target.value)} placeholder="e.g. C-1234/2026" disabled={!canEdit} /></label>
        <label className="space-y-1 sm:col-span-2"><span className="text-xs font-medium text-muted">Registered address</span>
          <input className={field} value={a} onChange={(x) => setA(x.target.value)} placeholder="House, street, Kulhudhuffushi, Haa Dhaalu Atoll" disabled={!canEdit} /></label>
        {canEdit && <div><button className="btn btn-primary">Save</button></div>}
        {msg && <p role="status" className={`text-sm sm:col-span-2 ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>}
      </form>
    </section>
  );
}
