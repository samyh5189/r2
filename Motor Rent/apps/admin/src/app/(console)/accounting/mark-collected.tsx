"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/** Record that an unpaid fee was paid at the counter. */
export function MarkCollected({ id }: { id: string }) {
  const router = useRouter();
  const [method, setMethod] = useState("cash");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    setBusy(true); setErr(null);
    const { error } = await supabaseBrowser().rpc("mark_payment_collected", { p_id: id, p_method: method });
    setBusy(false);
    if (error) setErr(error.message); else router.refresh();
  }
  return (
    <span className="flex items-center gap-1.5">
      <select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Paid by" className="rounded-lg border border-line bg-panel px-2 py-1 text-xs">
        <option value="cash">Cash</option><option value="bank">Bank transfer</option><option value="card">Card</option>
      </select>
      <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-black px-2.5 py-1 text-xs font-semibold text-white">{busy ? "Saving…" : "Mark paid"}</button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </span>
  );
}
