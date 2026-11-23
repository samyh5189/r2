"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/** After the return inspection: close the rental (optionally with a note for the history). */
export function CloseRental({ id, outstanding }: { id: string; outstanding: string | null }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true); setError(null);
    const { error } = await supabaseBrowser().rpc("close_booking", { b: id, p_note: note || null });
    setBusy(false);
    if (error) return setError(error.message.replace(/^.*?ERROR:\s*/i, ""));
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-panel p-5">
      <h2 className="text-lg font-semibold">Close the rental</h2>
      <p className="text-sm text-muted">The bike is back and inspected. Close the rental once nothing else is owed.</p>
      {outstanding && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">Still to collect: {outstanding}. Mark it collected under Accounting.</p>}
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Note for the history (optional)"
        className="w-full rounded-xl border-[1.5px] border-line bg-panel px-3 py-2 text-sm outline-none transition focus:border-accent" />
      <button type="button" disabled={busy} onClick={run} className="btn btn-primary">{busy ? "Closing…" : "Close rental"}</button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
