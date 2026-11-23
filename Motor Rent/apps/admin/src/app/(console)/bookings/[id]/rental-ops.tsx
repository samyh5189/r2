"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { dt, money } from "@/lib/format";

const field = "w-full rounded-xl border-[1.5px] border-line bg-panel px-3 py-2 text-sm outline-none transition focus:border-accent";
const toMinor = (s: string) => Math.round((parseFloat(s) || 0) * 100);
const major = (n: number) => String(n / 100);
const clean = (m: string) => m.replace(/^.*?ERROR:\s*/i, "");

function useRpc() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: string, args: Record<string, unknown>) {
    setBusy(true); setError(null);
    const { error } = await supabaseBrowser().rpc(fn, args);
    setBusy(false);
    if (error) { setError(clean(error.message)); return false; }
    router.refresh();
    return true;
  }
  return { busy, error, run };
}

function Card({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "warn" }) {
  return (
    <div className={`space-y-3 rounded-2xl border p-5 ${tone === "warn" ? "border-amber-500/40 bg-amber-500/5" : "border-line bg-panel"}`}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}

const Err = ({ e }: { e: string | null }) => (e ? <p role="alert" className="text-sm text-red-600">{e}</p> : null);

// ── Damage ──────────────────────────────────────────────────────────────────────────────────────────

export type Claim = { items: { what: string; amount: number }[]; amount: number; status: "open" | "disputed" | "settled" | "waived"; rider_note: string | null };

/** Returned rental: report damage found at the return inspection. */
export function ReportDamage({ id, currency }: { id: string; currency: string }) {
  const { busy, error, run } = useRpc();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([{ what: "", amount: "" }]);
  const items = rows.filter((r) => r.what.trim() && toMinor(r.amount) > 0).map((r) => ({ what: r.what.trim(), amount: toMinor(r.amount) }));
  const total = items.reduce((s, r) => s + r.amount, 0);
  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-red-600 hover:underline">Found damage? Raise a claim</button>;
  }
  return (
    <Card title="Raise a damage claim">
      <p className="text-sm text-muted">List each new damage and its repair cost. The rider sees the claim with the return photos and can reply before you settle it.</p>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_8rem] gap-2">
          <input className={field} value={r.what} placeholder="e.g. Scratched left mirror" maxLength={120}
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, what: e.target.value } : x)))} />
          <input className={field} value={r.amount} placeholder={`Cost (${currency})`} inputMode="decimal"
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
        </div>
      ))}
      <button type="button" onClick={() => setRows([...rows, { what: "", amount: "" }])} className="text-sm text-muted hover:underline">+ Add another</button>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy || !items.length} onClick={() => run("open_damage_claim", { b: id, p_items: items, p_amount: total })} className="btn btn-primary">
          {busy ? "Saving…" : `Raise claim for ${money(total, currency)}`}</button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted">Cancel</button>
      </div>
      <Err e={error} />
    </Card>
  );
}

/** Open / disputed claim: settle at an agreed amount or waive it. */
export function DamageClaimCard({ id, claim, currency }: { id: string; claim: Claim; currency: string }) {
  const { busy, error, run } = useRpc();
  const [amount, setAmount] = useState(major(claim.amount));
  const live = claim.status === "open" || claim.status === "disputed";
  return (
    <Card title={live ? "Damage claim" : `Damage claim · ${claim.status}`} tone={live ? "warn" : undefined}>
      <ul className="divide-y divide-line text-sm">
        {claim.items.map((it, i) => <li key={i} className="flex justify-between py-1.5"><span>{it.what}</span><span className="tabular-nums">{money(it.amount, currency)}</span></li>)}
      </ul>
      {claim.status === "disputed" && claim.rider_note && (
        <blockquote className="rounded-lg border-l-4 border-amber-500 bg-amber-500/10 px-3 py-2 text-sm"><span className="font-semibold">Rider disputes:</span> {claim.rider_note}</blockquote>
      )}
      {claim.status === "open" && <p className="text-sm text-muted">Waiting for the rider; they can accept or dispute it from their rental page.</p>}
      {live && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1"><span className="text-xs font-medium text-muted">Agreed amount ({currency})</span>
            <input className={`${field} w-32`} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></label>
          <button type="button" disabled={busy || toMinor(amount) <= 0} onClick={() => run("resolve_damage_claim", { b: id, p_outcome: "settled", p_amount: toMinor(amount) })} className="btn btn-primary">Settle and charge</button>
          <button type="button" disabled={busy} onClick={() => run("resolve_damage_claim", { b: id, p_outcome: "waived" })} className="btn">Waive</button>
        </div>
      )}
      <Err e={error} />
    </Card>
  );
}

// ── Extensions ──────────────────────────────────────────────────────────────────────────────────────

export type Extension = { id: string; new_end: string; status: string; amount: number | null; created_at: string };

/** The rider asked for more time: approve at the quoted price (editable) or decline. */
export function ExtensionRequest({ ext, currentEnd, quoted, currency }: { ext: Extension; currentEnd: string; quoted: number; currency: string }) {
  const { busy, error, run } = useRpc();
  const [amount, setAmount] = useState(major(quoted));
  const [reason, setReason] = useState("");
  return (
    <Card title="Rider asks for more time" tone="warn">
      <p className="text-sm">Return by <span className="font-semibold tabular-nums">{dt(new Date(ext.new_end))}</span> instead of <span className="tabular-nums">{dt(new Date(currentEnd))}</span>. The bike is free for that time.</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1"><span className="text-xs font-medium text-muted">Price for the extra time ({currency})</span>
          <input className={`${field} w-36`} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></label>
        <button type="button" disabled={busy} onClick={() => run("decide_extension", { x: ext.id, p_approve: true, p_amount: toMinor(amount) })} className="btn btn-primary">Approve</button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <input className={`${field} max-w-xs`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, if declining (rider sees it)" maxLength={300} />
        <button type="button" disabled={busy} onClick={() => run("decide_extension", { x: ext.id, p_approve: false, p_reason: reason })} className="btn">Decline</button>
      </div>
      <p className="text-xs text-muted">Approving moves the return time and adds the price as a fee to collect.</p>
      <Err e={error} />
    </Card>
  );
}

// ── Deposit ─────────────────────────────────────────────────────────────────────────────────────────

/** Deposit taken at the counter and returned (in full or part) after the bike is back. */
export function DepositCard({ id, deposit, currency, held, settled, canReturn, owed }: {
  id: string; deposit: number; currency: string; held: { provider: string } | null; settled: string | null; canReturn: boolean; owed: number;
}) {
  const { busy, error, run } = useRpc();
  const [method, setMethod] = useState("cash");
  const [keep, setKeep] = useState(major(Math.min(owed, deposit)));
  return (
    <Card title={`Deposit · ${money(deposit, currency)}`}>
      {settled ? <p className="text-sm text-muted">{settled}</p>
        : !held ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">Not taken yet.</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Taken by" className="rounded-lg border border-line bg-panel px-2 py-1.5 text-sm">
              <option value="cash">Cash</option><option value="bank">Bank transfer</option><option value="card">Card</option>
            </select>
            <button type="button" disabled={busy} onClick={() => run("record_deposit", { b: id, p_method: method })} className="btn btn-primary btn-sm">Deposit taken</button>
          </div>
        ) : !canReturn ? <p className="text-sm text-muted">Held ({held.provider}). Return it once the bike is back.</p>
        : (
          <div className="space-y-2">
            <p className="text-sm text-muted">Held ({held.provider}).{owed > 0 && ` The rider still owes ${money(owed, currency)}; keeping it from the deposit marks those fees paid.`}</p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1"><span className="text-xs font-medium text-muted">Keep ({currency})</span>
                <input className={`${field} w-28`} value={keep} onChange={(e) => setKeep(e.target.value)} inputMode="decimal" /></label>
              <button type="button" disabled={busy} onClick={() => run("return_deposit", { b: id, p_keep: toMinor(keep) })} className="btn btn-primary">
                Return {money(Math.max(0, deposit - toMinor(keep)), currency)}</button>
            </div>
          </div>
        )}
      <Err e={error} />
    </Card>
  );
}
