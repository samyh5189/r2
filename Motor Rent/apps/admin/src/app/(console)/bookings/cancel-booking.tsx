"use client";

import { cancellationRefund } from "@motor-rent/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { money } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Staff cancel for held / confirmed bookings (a reason is required and logged in the booking history).
 * Paid bookings record the refund owed: the policy amount by default (full ≥ 24 h before, half until pickup,
 * nothing after), editable when the office is at fault. Refunds to pay are listed under Accounting.
 */
export function CancelBooking({ id, reference, paid, total = 0, currency = "MVR", start, defaultReason = "", label = "Cancel" }: {
  id: string; reference: string; paid: boolean; total?: number; currency?: string; start?: string; defaultReason?: string; label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(defaultReason);
  const [policy] = useState(() => (paid && start ? cancellationRefund(total, new Date(start), new Date()) : 0));
  const [refund, setRefund] = useState(String(policy / 100));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true); setError(null);
    const amount = Math.round((parseFloat(refund) || 0) * 100);
    const { error } = await supabaseBrowser().rpc("cancel_booking", { b: id, p_reason: reason, ...(paid ? { p_refund: amount } : {}) });
    setBusy(false);
    if (error) return setError(error.message);
    setOpen(false);
    router.refresh();
  }

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-red-600 hover:underline">{label}</button>;
  return (
    <div className="flex min-w-60 flex-col gap-1.5">
      <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder={`Why cancel ${reference}?`}
        className="rounded-lg border border-line bg-panel px-2 py-1 text-xs outline-none focus:border-accent" />
      {paid && (
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted">Refund ({currency})</span>
          <input value={refund} onChange={(e) => setRefund(e.target.value)} inputMode="decimal" className="w-24 rounded-lg border border-line bg-panel px-2 py-1 tabular-nums outline-none focus:border-accent" />
          <span className="text-muted">policy: {money(policy, currency)} of {money(total, currency)}</span>
        </label>
      )}
      <div className="flex gap-2">
        <button type="button" disabled={busy || reason.trim().length < 3} onClick={run} className="btn btn-primary btn-sm">Confirm</button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">Keep</button>
      </div>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
