"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

const field = "w-full rounded-xl border-[1.5px] border-line bg-panel px-3 py-2 outline-none focus:border-accent";

type Rider = { id: string; full_name: string | null; phone: string | null; whatsapp: string | null; date_of_birth: string | null; licence_expires_on: string | null };

/** Managers and owners edit a rider's details (every change is recorded in the history). */
export function EditRider({ rider }: { rider: Rider }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: rider.full_name ?? "", phone: rider.phone ?? "", whatsapp: rider.whatsapp ?? "", dob: rider.date_of_birth ?? "", licence: rider.licence_expires_on ?? "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const wa = v.whatsapp.replace(/[\s()-]/g, "");
    const { error } = await supabaseBrowser().rpc("admin_update_rider", {
      p_id: rider.id, p_full_name: v.name, p_phone: v.phone, p_whatsapp: /^\d{7}$/.test(wa) ? `+960${wa}` : wa,
      p_date_of_birth: v.dob || null, p_licence_expires_on: v.licence || null,
    });
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Saved" });
    if (!error) { setOpen(false); router.refresh(); }
  }

  if (!open) return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary">Edit details</button>
      {msg?.ok && <span role="status" className="text-sm text-emerald-600">{msg.text}</span>}
    </div>
  );
  return (
    <form onSubmit={save} className="grid gap-3 rounded-2xl border border-line bg-panel p-4 sm:grid-cols-2">
      <label className="space-y-1 sm:col-span-2"><span className="text-xs font-medium text-muted">Full name</span><input className={field} value={v.name} onChange={set("name")} /></label>
      <label className="space-y-1"><span className="text-xs font-medium text-muted">Phone</span><input className={field} inputMode="tel" value={v.phone} onChange={set("phone")} /></label>
      <label className="space-y-1"><span className="text-xs font-medium text-muted">WhatsApp</span><input className={field} inputMode="tel" placeholder="7771234" value={v.whatsapp} onChange={set("whatsapp")} /></label>
      <label className="space-y-1"><span className="text-xs font-medium text-muted">Date of birth</span><input className={field} type="date" value={v.dob} onChange={set("dob")} /></label>
      <label className="space-y-1"><span className="text-xs font-medium text-muted">Licence valid until</span><input className={field} type="date" value={v.licence} onChange={set("licence")} /></label>
      {msg && !msg.ok && <p role="alert" className="text-sm text-red-600 sm:col-span-2">{msg.text}</p>}
      <div className="flex gap-3 sm:col-span-2">
        <button className="btn btn-primary">Save</button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted">Cancel</button>
      </div>
    </form>
  );
}

/** Delete or anonymise a rider. Refused while they have an open rental. */
export function DeleteRider({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function del() {
    setBusy(true); setErr(null);
    const { data, error } = await supabaseBrowser().functions.invoke<{ anonymised: boolean }>("admin-delete-rider", { body: { riderId: id } });
    setBusy(false);
    if (error) {
      const ctx = (error as { context?: Response }).context;
      const body = ctx ? await ctx.json().catch(() => null) : null;
      return setErr(body?.error?.message ?? "Could not delete this rider.");
    }
    router.push(data?.anonymised ? `/riders/${id}` : "/riders");
    router.refresh();
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost btn-sm">Delete rider</button>;
  return (
    <div className="space-y-2 rounded-2xl border border-red-500/40 bg-red-500/5 p-4 text-sm">
      <p><b>This can&apos;t be undone.</b> Identity documents and the profile photo are erased. If {name} has past rentals, those stay as financial records but their name and contact details are removed and they can no longer sign in.</p>
      <label className="block space-y-1"><span className="text-xs text-muted">Type DELETE to confirm</span>
        <input className={field} value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
      {err && <p role="alert" className="text-red-600">{err}</p>}
      <div className="flex gap-3">
        <button type="button" disabled={confirm !== "DELETE" || busy} onClick={del} className="btn btn-primary">{busy ? "Deleting…" : "Delete rider"}</button>
        <button type="button" onClick={() => setOpen(false)} className="text-muted">Cancel</button>
      </div>
    </div>
  );
}
