"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Kind } from "./vehicle-photos";

export type Option = { id: string; name: string };
export type VehicleDraft = {
  id?: string; kind: Kind; plate: string; make: string; model: string; engine_cc: number | null; year: number | null;
  branch_id: string; price_plan_id: string; status: "active" | "maintenance" | "retired"; odometer_km: number;
};

const field = "w-full rounded-xl border-[1.5px] border-line bg-panel px-3 py-2 outline-none transition focus:border-accent";

function friendly(msg: string) {
  if (/only managers/i.test(msg)) return "Only managers and owners can change the fleet.";
  return msg.replace(/^.*?ERROR:\s*/i, "");
}

/** Add or edit a vehicle. Saves through the save_vehicle RPC (role + validation enforced in the database). */
export function VehicleForm({
  initial, branches, plans, onDone,
}: { initial?: VehicleDraft; branches: Option[]; plans: Option[]; onDone?: (id: string) => void }) {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [v, setV] = useState<VehicleDraft>(initial ?? {
    kind: "scooter", plate: "", make: "", model: "", engine_cc: 125, year: new Date().getFullYear(),
    branch_id: branches[0]?.id ?? "", price_plan_id: plans[0]?.id ?? "", status: "active", odometer_km: 0,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof VehicleDraft>(k: K, val: VehicleDraft[K]) => { setV((p) => ({ ...p, [k]: val })); setSaved(false); };
  const num = (s: string) => (s.trim() === "" ? null : Number(s));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { data, error } = await supabase.rpc("save_vehicle", {
      p_id: v.id ?? null, p_kind: v.kind, p_plate: v.plate, p_make: v.make, p_model: v.model,
      p_engine_cc: v.engine_cc, p_year: v.year, p_branch: v.branch_id, p_plan: v.price_plan_id,
      p_status: v.status, p_odometer: v.odometer_km,
    });
    setBusy(false);
    if (error) return setError(friendly(error.message));
    setSaved(true);
    router.refresh();
    onDone?.(data as string);
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <label className="space-y-1"><span className="text-xs font-medium text-muted">Type</span>
        <select className={`${field} capitalize`} value={v.kind} onChange={(e) => set("kind", e.target.value as Kind)}>
          {(["scooter", "motorbike", "car"] as const).map((k) => <option key={k} value={k}>{k}</option>)}
        </select></label>
      <label className="space-y-1"><span className="text-xs font-medium text-muted">Make</span>
        <input className={field} value={v.make} onChange={(e) => set("make", e.target.value)} placeholder="Honda" required maxLength={40} /></label>
      <label className="space-y-1"><span className="text-xs font-medium text-muted">Model</span>
        <input className={field} value={v.model} onChange={(e) => set("model", e.target.value)} placeholder="Dio" required maxLength={40} /></label>
      <label className="space-y-1"><span className="text-xs font-medium text-muted">Plate</span>
        <input className={`${field} font-mono uppercase`} value={v.plate} onChange={(e) => set("plate", e.target.value)} placeholder="P-1003" required maxLength={15} /></label>
      <label className="space-y-1"><span className="text-xs font-medium text-muted">Engine (cc)</span>
        <input className={field} inputMode="numeric" value={v.engine_cc ?? ""} onChange={(e) => set("engine_cc", num(e.target.value))} /></label>
      <label className="space-y-1"><span className="text-xs font-medium text-muted">Year</span>
        <input className={field} inputMode="numeric" value={v.year ?? ""} onChange={(e) => set("year", num(e.target.value))} /></label>
      <label className="space-y-1"><span className="text-xs font-medium text-muted">Odometer (km)</span>
        <input className={field} inputMode="numeric" value={v.odometer_km} onChange={(e) => set("odometer_km", num(e.target.value) ?? 0)} /></label>
      <label className="space-y-1"><span className="text-xs font-medium text-muted">Status</span>
        <select className={field} value={v.status} onChange={(e) => set("status", e.target.value as VehicleDraft["status"])}>
          <option value="active">Active — bookable</option>
          <option value="maintenance">Maintenance — hidden</option>
          <option value="retired">Retired</option>
        </select></label>
      <label className="col-span-2 space-y-1"><span className="text-xs font-medium text-muted">Branch</span>
        <select className={field} value={v.branch_id} onChange={(e) => set("branch_id", e.target.value)}>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select></label>
      <label className="col-span-2 space-y-1"><span className="text-xs font-medium text-muted">Price plan</span>
        <select className={field} value={v.price_plan_id} onChange={(e) => set("price_plan_id", e.target.value)}>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>

      {error && <p role="alert" className="col-span-full rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="col-span-full flex items-center gap-3">
        <button disabled={busy} className="btn btn-primary">
          {busy ? "Saving…" : v.id ? "Save changes" : "Add vehicle"}
        </button>
        {saved && <span className="rise text-sm text-emerald-600">Saved ✓</span>}
      </div>
    </form>
  );
}

/** Delete (never booked) or retire (has booking history). */
export function DeleteVehicle({ id, label, photos }: { id: string; label: string; photos: string[] }) {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc("delete_vehicle", { v: id });
    if (error) { setBusy(false); setConfirming(false); return setMsg(friendly(error.message)); }
    if (data === "deleted" && photos.length) {
      const { data: files } = await supabase.storage.from("vehicle-photos").list(id);
      if (files?.length) await supabase.storage.from("vehicle-photos").remove(files.map((f) => `${id}/${f.name}`));
    }
    setBusy(false);
    setMsg(data === "retired" ? "This vehicle has past bookings, so it was retired instead of deleted. It is hidden from riders." : null);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!confirming ? (
        <button type="button" onClick={() => setConfirming(true)}
          className="btn btn-secondary btn-sm">Delete vehicle</button>
      ) : (
        <>
          <span className="text-sm">Delete <b>{label}</b>? This cannot be undone.</span>
          <button type="button" disabled={busy} onClick={run} className="btn btn-primary btn-sm">
            {busy ? "Deleting…" : "Yes, delete"}</button>
          <button type="button" onClick={() => setConfirming(false)} className="btn btn-ghost btn-sm">Cancel</button>
        </>
      )}
      {msg && <p role="status" className="w-full text-sm text-amber-700 dark:text-amber-400">{msg}</p>}
    </div>
  );
}
