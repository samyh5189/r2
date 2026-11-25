"use client";

import { analyzeSlip, type SlipCheck } from "@motor-rent/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { dt, money } from "@/lib/format";
import { ocrImage } from "@/lib/ocr";
import { supabaseBrowser } from "@/lib/supabase/client";

export type PendingSlip = {
  id: string; imageUrl: string | null; createdAt: string; riderName: string; riderOcr: unknown;
  booking: { id: string; reference: string; total: number; currency: string; status: string; held_until: string | null };
};

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-800 dark:text-amber-300"}`}>
      <span aria-hidden>{ok ? "✓" : "!"}</span>{label}
    </li>
  );
}

export function SlipReview({ slip, accountNumbers }: { slip: PendingSlip; accountNumbers: string[] }) {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const b = slip.booking;
  const [ocr, setOcr] = useState<{ text: string; check: SlipCheck } | null>(null);
  const [ocrState, setOcrState] = useState<"idle" | "running" | "failed">("idle");
  const [amount, setAmount] = useState((b.total / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (!slip.imageUrl) return;
    let cancelled = false;
    setOcrState("running");
    ocrImage(slip.imageUrl)
      .then((text) => {
        if (cancelled) return;
        const check = analyzeSlip(text, { total: b.total, reference: b.reference, accountNumbers });
        setOcr({ text, check });
        setOcrState("idle");
        const best = check.amounts.find((a) => a >= b.total) ?? check.amounts[0];
        if (best) setAmount((best / 100).toFixed(2));
      })
      .catch(() => !cancelled && setOcrState("failed"));
    return () => { cancelled = true; };
  }, [slip.imageUrl, b.total, b.reference, accountNumbers]);

  async function decide(approve: boolean) {
    setBusy(true); setError(null);
    const review = ocr ? { text: ocr.text.slice(0, 4000), check: ocr.check } : null;
    const { error } = await supabase.rpc("review_transfer_slip", {
      p_slip: slip.id, p_approve: approve, p_amount: Math.round(Number(amount.replace(/[^\d.]/g, "")) * 100),
      p_reason: approve ? null : reason, p_review_ocr: review,
    });
    setBusy(false);
    if (error) return setError(error.message);
    router.refresh();
  }

  const expired = b.status !== "held";
  return (
    <article className="grid gap-4 rounded-2xl border border-line bg-panel p-4 md:grid-cols-[minmax(0,280px)_1fr]">
      <button type="button" onClick={() => setZoomed(true)} className="group relative overflow-hidden rounded-xl bg-line" aria-label="Enlarge slip">
        {slip.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={slip.imageUrl} alt={`Transfer slip for ${b.reference}`} className="max-h-96 w-full object-contain transition group-hover:scale-[1.02]" />
        ) : <p className="p-6 text-sm text-muted">Image unavailable</p>}
        <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">Click to enlarge</span>
      </button>
      {zoomed && slip.imageUrl && (
        <div role="dialog" aria-modal="true" onClick={() => setZoomed(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={slip.imageUrl} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="plate text-lg">{b.reference}</span>
          <span>{slip.riderName}</span>
          <span className="ml-auto text-sm text-muted">sent {dt(new Date(slip.createdAt))}</span>
        </div>
        <p className="text-sm">Booking total <b className="tabular-nums">{money(b.total, b.currency)}</b>
          {b.held_until && !expired && <span className="text-muted"> · held until {dt(new Date(b.held_until))}</span>}
          {expired && <span className="font-semibold text-red-600"> · booking is {b.status}: refund instead of approving</span>}</p>

        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">OCR check {ocrState === "running" && <span className="animate-pulse normal-case text-accent">reading slip…</span>}</p>
          {ocrState === "failed" && <p className="text-sm text-amber-700">Could not read the slip automatically. Check it by eye.</p>}
          {ocr && (
            <>
              <ul className="grid gap-1 sm:grid-cols-3">
                <Check ok={ocr.check.amountMatches} label={ocr.check.amounts.length ? `Amount ${money(ocr.check.amounts[0], b.currency)}` : "No amount found"} />
                <Check ok={ocr.check.referenceFound} label={ocr.check.referenceFound ? "Reference in remark" : "Reference not found"} />
                <Check ok={ocr.check.accountFound} label={ocr.check.accountFound ? "Paid to our account" : "Our account not found"} />
              </ul>
              <details className="text-sm"><summary className="cursor-pointer text-muted">Text read from slip{ocr.check.date ? ` · date ${ocr.check.date}` : ""}</summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-background p-3 text-xs">{ocr.text}</pre></details>
            </>
          )}
          <p className="text-xs text-muted">Always confirm the money arrived in your bank app. Slips can be edited.</p>
        </div>

        {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}

        {!rejecting ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1"><span className="text-xs font-medium text-muted">Amount received</span>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal"
                className="w-36 rounded-xl border border-line bg-panel px-3 py-2 tabular-nums outline-none focus:border-accent" /></label>
            <button type="button" disabled={busy || expired} onClick={() => decide(true)}
              className="btn btn-primary">{busy ? "…" : "Approve & confirm booking"}</button>
            <button type="button" disabled={busy} onClick={() => setRejecting(true)}
              className="btn btn-secondary">Reject</button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-64 flex-1 space-y-1"><span className="text-xs font-medium text-muted">Reason (the rider sees this)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus placeholder="e.g. Amount does not match / money not received"
                className="w-full rounded-xl border border-line bg-panel px-3 py-2 outline-none focus:border-accent" /></label>
            <button type="button" disabled={busy || !reason.trim()} onClick={() => decide(false)}
              className="btn btn-primary">Reject slip</button>
            <button type="button" onClick={() => setRejecting(false)} className="btn btn-ghost">Cancel</button>
          </div>
        )}
      </div>
    </article>
  );
}
