"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/** Open the signed rental agreement PDF from the stored file. */
export async function openAgreement(path: string, download = false) {
  // Open the tab during the tap (phones block tabs opened after a wait), then point it at the PDF.
  const tab = download ? null : window.open("", "_blank");
  if (tab) tab.opener = null;
  const { data, error } = await supabaseBrowser().storage.from("contracts").createSignedUrl(path, 600, download ? { download: true } : undefined);
  if (error || !data) { tab?.close(); throw new Error("Couldn't open the agreement."); }
  if (tab) tab.location.href = data.signedUrl; else window.location.href = data.signedUrl;
}

/** The signed rental agreement: open, download, or make again (e.g. after the company details are filled in). */
export function AgreementCard({ bookingId, reference, path, signedAt, version }: {
  bookingId: string; reference: string; path: string | null; signedAt: string | null; version: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remake() {
    setBusy(true); setError(null);
    const { data, error } = await supabaseBrowser().functions.invoke<{ path: string }>("rental-agreement", { body: { bookingId } });
    setBusy(false);
    if (error || !data) return setError("Couldn't make the agreement. Try again.");
    router.refresh();
  }
  const open = (download: boolean) => path && openAgreement(path, download).catch((e: Error) => setError(e.message));

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-panel p-4">
      <div>
        <h2 className="font-semibold">Rental agreement {reference}</h2>
        <p className="text-sm text-muted">
          {path
            ? `Signed by the rider and staff at handover${signedAt ? ` on ${new Date(signedAt).toLocaleString("en-GB", { timeZone: "Indian/Maldives", dateStyle: "medium", timeStyle: "short" })}` : ""}. Terms version ${version ?? "-"}.`
            : "No PDF yet. Make it from the handover record and signatures."}
        </p>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="grid gap-2 sm:flex sm:flex-wrap">
        {path && <button type="button" onClick={() => open(false)} className="btn btn-primary">Open PDF</button>}
        {path && <button type="button" onClick={() => open(true)} className="btn btn-secondary">Download</button>}
        <button type="button" disabled={busy} onClick={remake} className="btn btn-ghost">{busy ? "Making…" : path ? "Make again" : "Make agreement PDF"}</button>
      </div>
    </section>
  );
}
