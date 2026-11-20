"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { money } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";

export type Plan = {
  id: string; name: string; currency: "MVR" | "USD"; hourly: number; daily: number; weekly: number;
  deposit: number; late_fee_per_hour: number; active: boolean; vehicles: number;
};

const PRICE_FIELDS = [
  ["hourly", "Per hour"], ["daily", "Per day"], ["weekly", "Per week"], ["deposit", "Deposit"], ["late_fee_per_hour", "Late fee / hour"],
] as const;
type PriceKey = (typeof PRICE_FIELDS)[number][0];

const field = "w-full rounded-xl border-[1.5px] border-line bg-panel px-3 py-2 outline-none transition focus:border-accent";
const toMajor = (minor: number) => (minor / 100).toFixed(2);
const toMinor = (s: string) => Math.round(Number(s.replace(/[^\d.]/g, "")) * 100);

function PlanForm({ plan, onClose }: { plan?: Plan; onClose: () => void }) {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [name, setName] = useState(plan?.name ?? "");
  const [currency, setCurrency] = useState<"MVR" | "USD">(plan?.currency ?? "MVR");
  const [active, setActive] = useState(plan?.active ?? true);
  const [prices, setPrices] = useState<Record<PriceKey, string>>(() =>
    Object.fromEntries(PRICE_FIELDS.map(([k]) => [k, plan ? toMajor(plan[k]) : ""])) as Record<PriceKey, string>);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const m = Object.fromEntries(PRICE_FIELDS.map(([k]) => [k, toMinor(prices[k] || "0")])) as Record<PriceKey, number>;
    const { error } = await supabase.rpc("save_price_plan", {
      p_id: plan?.id ?? null, p_name: name, p_currency: currency, p_hourly: m.hourly, p_daily: m.daily, p_weekly: m.weekly,
      p_deposit: m.deposit, p_late_fee_per_hour: m.late_fee_per_hour, p_active: active,
    });
    setBusy(false);
    if (error) return setError(error.message);
    router.refresh();
    onClose();
  }

  return (
    <form onSubmit={save} className="rise grid grid-cols-2 gap-3 rounded-2xl border border-accent/40 bg-panel p-4 sm:grid-cols-4">
      <label className="col-span-2 space-y-1"><span className="text-xs font-medium text-muted">Plan name</span>
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Scooter 110–125cc" required maxLength={60} /></label>
      <label className="space-y-1"><span className="text-xs font-medium text-muted">Currency</span>
        <select className={field} value={currency} onChange={(e) => setCurrency(e.target.value as "MVR" | "USD")}>
          <option value="MVR">MVR (Rf)</option><option value="USD">USD ($)</option>
        </select></label>
      <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" /> Active</label>
      {PRICE_FIELDS.map(([k, label]) => (
        <label key={k} className="space-y-1"><span className="text-xs font-medium text-muted">{label}</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">{currency === "MVR" ? "Rf" : "$"}</span>
            <input className={`${field} pl-8 tabular-nums`} inputMode="decimal" value={prices[k]} placeholder="0.00"
              onChange={(e) => setPrices((p) => ({ ...p, [k]: e.target.value }))} required={k === "hourly" || k === "daily"} />
          </div></label>
      ))}
      {plan && plan.vehicles > 0 && <p className="col-span-full text-xs text-muted">Changes apply to new quotes for all {plan.vehicles} vehicle(s) on this plan. Existing bookings keep their price.</p>}
      {error && <p role="alert" className="col-span-full rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
      <div className="col-span-full flex gap-2">
        <button disabled={busy} className="rounded-xl bg-accent px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : plan ? "Save prices" : "Create plan"}</button>
        <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-muted">Cancel</button>
      </div>
    </form>
  );
}

export function PricePlans({ plans, canEdit }: { plans: Plan[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Prices</h2>
          <p className="text-sm text-muted">Each vehicle uses one price plan. Riders are always quoted from these prices on the server.</p>
        </div>
        {canEdit && editing !== "new" && (
          <button type="button" onClick={() => setEditing("new")} className="rounded-xl border border-line px-3 py-2 text-sm font-semibold hover:border-accent">＋ New plan</button>
        )}
      </div>
      {editing === "new" && <PlanForm onClose={() => setEditing(null)} />}
      <ul className="grid gap-3 sm:grid-cols-2">
        {plans.map((p) => editing === p.id ? (
          <li key={p.id} className="sm:col-span-2"><PlanForm plan={p} onClose={() => setEditing(null)} /></li>
        ) : (
          <li key={p.id} className={`rounded-2xl border border-line bg-panel p-4 ${p.active ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{p.name}</p>
                <p className="text-xs text-muted">{p.vehicles} vehicle{p.vehicles === 1 ? "" : "s"}{p.active ? "" : " · inactive"}</p>
              </div>
              {canEdit && <button type="button" onClick={() => setEditing(p.id)} className="rounded-lg px-2 py-1 text-sm font-semibold text-accent hover:bg-accent/10">Edit</button>}
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div><dt className="text-xs text-muted">Hour</dt><dd className="font-semibold tabular-nums">{money(p.hourly, p.currency)}</dd></div>
              <div><dt className="text-xs text-muted">Day</dt><dd className="font-semibold tabular-nums">{money(p.daily, p.currency)}</dd></div>
              <div><dt className="text-xs text-muted">Week</dt><dd className="font-semibold tabular-nums">{money(p.weekly, p.currency)}</dd></div>
              <div><dt className="text-xs text-muted">Deposit</dt><dd className="tabular-nums">{money(p.deposit, p.currency)}</dd></div>
              <div className="col-span-2"><dt className="text-xs text-muted">Late fee</dt><dd className="tabular-nums">{money(p.late_fee_per_hour, p.currency)}/h</dd></div>
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}
