import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import { dt, money } from "@/lib/format";
import { SlipReview, type PendingSlip } from "./slip-review";

export const metadata = { title: "Transfers" };

export default function TransfersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Bank transfers</h1>
        <p className="text-sm text-muted">Check each slip against your bank app before approving. OCR helps, but you make the decision.</p>
      </div>
      <Suspense fallback={<p className="animate-pulse text-muted">Loading…</p>}>
        <Transfers />
      </Suspense>
    </div>
  );
}

type Row = {
  id: string; path: string; status: "pending" | "approved" | "rejected"; ocr: unknown; amount: number | null;
  reject_reason: string | null; created_at: string; reviewed_at: string | null;
  bookings: { id: string; reference: string; total: number; currency: string; status: string; held_until: string | null } | null;
  rider: { full_name: string | null } | null;
};

async function Transfers() {
  const { db } = await requireStaff();
  const [slips, accounts] = await Promise.all([
    db.from("transfer_slips")
      .select("id, path, status, ocr, amount, reject_reason, created_at, reviewed_at, bookings(id, reference, total, currency, status, held_until), rider:profiles!transfer_slips_rider_id_fkey(full_name)")
      .order("created_at", { ascending: false }).limit(60),
    db.from("bank_accounts").select("account_number"),
  ]);
  if (slips.error) return <p role="alert" className="text-red-600">Could not load transfers.</p>;
  const rows = (slips.data ?? []) as unknown as Row[];
  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status !== "pending");

  const { data: signed } = pending.length
    ? await db.storage.from("payment-slips").createSignedUrls(pending.map((r) => r.path), 60 * 30)
    : { data: [] };
  const urlOf = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const accountNumbers = (accounts.data ?? []).map((a) => a.account_number as string);

  return (
    <>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Waiting for review <span className="text-muted">({pending.length})</span></h2>
        {!pending.length && <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">No slips waiting. 🎉</p>}
        <ul className="space-y-4">
          {pending.map((r) => r.bookings && (
            <li key={r.id}>
              <SlipReview accountNumbers={accountNumbers} slip={{
                id: r.id, imageUrl: urlOf.get(r.path) ?? null, createdAt: r.created_at, riderName: r.rider?.full_name ?? "Rider",
                riderOcr: r.ocr, booking: r.bookings,
              } satisfies PendingSlip} />
            </li>
          ))}
        </ul>
      </section>

      {!!done.length && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Recently reviewed</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
            {done.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === "approved" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-red-500/15 text-red-700 dark:text-red-400"}`}>{r.status}</span>
                <span className="font-mono">{r.bookings?.reference}</span>
                <span>{r.rider?.full_name ?? "Rider"}</span>
                <span className="tabular-nums">{r.amount != null ? money(r.amount, r.bookings?.currency) : r.bookings ? money(r.bookings.total, r.bookings.currency) : ""}</span>
                {r.reject_reason && <span className="text-muted">“{r.reject_reason}”</span>}
                <span className="ml-auto text-muted">{r.reviewed_at ? dt(new Date(r.reviewed_at)) : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
