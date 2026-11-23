"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

const field = "w-full rounded-xl border-[1.5px] border-line bg-panel px-3 py-2 outline-none transition focus:border-accent";

export type Branch = { id: string; name: string; address: string; lat: number | null; lng: number | null; opening_hours: { open?: string; close?: string } | null };

/** The counter riders come to: address, map pin and opening hours shown on the website. */
export function BranchSettings({ branch, canEdit }: { branch: Branch; canEdit: boolean }) {
  const router = useRouter();
  const [address, setAddress] = useState(branch.address);
  const [pin, setPin] = useState(branch.lat != null && branch.lng != null ? `${branch.lat}, ${branch.lng}` : "");
  const [open, setOpen] = useState(branch.opening_hours?.open ?? "07:00");
  const [close, setClose] = useState(branch.opening_hours?.close ?? "22:00");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(pin);
    if (pin.trim() && !m) return setMsg({ ok: false, text: "Paste the location as “latitude, longitude”, e.g. 6.6224, 73.0702." });
    const { error } = await supabaseBrowser().rpc("update_branch", {
      p_id: branch.id, p_address: address, p_lat: m ? Number(m[1]) : null, p_lng: m ? Number(m[2]) : null, p_open: open, p_close: close,
    });
    setMsg(error ? { ok: false, text: error.message.replace(/^.*?ERROR:\s*/i, "") } : { ok: true, text: "Saved ✓ The website shows it on the next visit." });
    if (!error) router.refresh();
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Counter: {branch.name}</h2>
        <p className="text-sm text-muted">Shown on the website’s “Our counter” page, the footer and the open-now badge. For the map pin, long-press the counter in Google Maps and copy the numbers it shows.</p>
      </div>
      <form onSubmit={save} className="grid gap-3 rounded-2xl border border-line bg-panel p-4 sm:grid-cols-2">
        <label className="space-y-1 sm:col-span-2"><span className="text-xs font-medium text-muted">Address riders will find</span>
          <input className={field} value={address} onChange={(x) => setAddress(x.target.value)} placeholder="e.g. Next to the harbour, Kulhudhuffushi" maxLength={160} disabled={!canEdit} /></label>
        <label className="space-y-1 sm:col-span-2"><span className="text-xs font-medium text-muted">Map location (latitude, longitude)</span>
          <input className={field} value={pin} onChange={(x) => setPin(x.target.value)} placeholder="6.6224, 73.0702" disabled={!canEdit} /></label>
        <label className="space-y-1"><span className="text-xs font-medium text-muted">Opens</span>
          <input className={field} type="time" value={open} onChange={(x) => setOpen(x.target.value)} disabled={!canEdit} /></label>
        <label className="space-y-1"><span className="text-xs font-medium text-muted">Closes</span>
          <input className={field} type="time" value={close} onChange={(x) => setClose(x.target.value)} disabled={!canEdit} /></label>
        {canEdit && <button className="btn btn-primary sm:col-span-2 sm:justify-self-start">Save counter details</button>}
        {msg && <p role="status" className={`text-sm sm:col-span-2 ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>}
      </form>
    </section>
  );
}
