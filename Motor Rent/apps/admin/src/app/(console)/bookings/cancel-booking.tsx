"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/** Staff cancel for held / confirmed bookings (a reason is required and logged in the booking history). */
export function CancelBooking({ id, reference, paid }: { id: string; reference: string; paid: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true); setError(null);
    const { error } = await supabaseBrowser().rpc("cancel_booking", { b: id, p_reason: reason });
    setBusy(false);
    if (error) return setError(error.message);
    setOpen(false);
    router.refresh();
  }

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-red-600 hover:underline">Cancel</button>;
  return (
    <div className="flex min-w-60 flex-col gap-1">
      <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder={`Why cancel ${reference}?`}
        className="rounded-lg border border-line bg-panel px-2 py-1 text-xs outline-none focus:border-accent" />
      {paid && <span className="text-xs text-amber-700">Paid booking: refund the rider separately.</span>}
      <div className="flex gap-2">
        <button type="button" disabled={busy || reason.trim().length < 3} onClick={run} className="btn btn-primary btn-sm">Confirm</button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">Keep</button>
      </div>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
