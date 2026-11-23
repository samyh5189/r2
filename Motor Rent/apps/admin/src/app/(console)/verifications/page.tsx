import Link from "next/link";
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import { dt } from "@/lib/format";
import { KycReview, type PendingKyc } from "./kyc-review";

export const metadata = { title: "Verifications" };

export default function VerificationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Identity verifications</h1>
        <p className="text-sm text-muted">Compare the selfie with the ID and licence photos, and check names, dates and the licence class before approving.</p>
      </div>
      <Suspense fallback={<p className="animate-pulse text-muted">Loading…</p>}>
        <List />
      </Suspense>
    </div>
  );
}

type Row = {
  id: string; profile_id: string; full_name: string; date_of_birth: string; id_type: string; id_number: string;
  licence_number: string; licence_expires_on: string; status: "pending" | "approved" | "rejected"; note: string | null;
  created_at: string; reviewed_at: string | null;
  kyc_documents: { doc_type: string; file_path: string }[];
  phone: string | null;
  profile: { phone: string | null } | null;
};

async function List() {
  const { db } = await requireStaff();
  const { data, error } = await db.from("kyc_submissions")
    .select("id, profile_id, full_name, date_of_birth, id_type, id_number, licence_number, licence_expires_on, status, note, created_at, reviewed_at, phone, kyc_documents(doc_type, file_path), profile:profiles!kyc_submissions_profile_id_fkey(phone)")
    .order("created_at", { ascending: false }).limit(80);
  if (error) return <p role="alert" className="text-red-600">Could not load verifications.</p>;
  const rows = (data ?? []) as unknown as Row[];
  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status !== "pending");

  const paths = pending.flatMap((r) => r.kyc_documents.map((d) => d.file_path));
  const { data: signed } = paths.length ? await db.storage.from("kyc").createSignedUrls(paths, 60 * 20) : { data: [] };
  const urlOf = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  // Bookings made without an account on the same mobile number: they join the account on approval.
  const phones = [...new Set(pending.map((r) => r.phone).filter((p): p is string => !!p))];
  const { data: guestRows } = phones.length
    ? await db.from("bookings").select("id, reference, guest_name, guest_phone, status, period").is("rider_id", null).in("guest_phone", phones).order("created_at")
    : { data: [] };
  const guestsOf = (p: string | null) => (guestRows ?? []).filter((g) => p && g.guest_phone === p)
    .map((g) => ({ id: g.id, reference: g.reference, name: g.guest_name ?? "", status: g.status }));

  return (
    <>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Waiting for review <span className="text-muted">({pending.length})</span></h2>
        {!pending.length && <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">Nothing to review.</p>}
        <ul className="space-y-4">
          {pending.map((r) => (
            <li key={r.id} className="space-y-1">
              <Link href={`/riders/${r.profile_id}`} className="text-xs font-semibold text-accent hover:underline">Rider history ›</Link>
              <KycReview sub={{
                id: r.id, fullName: r.full_name, dob: r.date_of_birth, idType: r.id_type, idNumber: r.id_number,
                licenceNumber: r.licence_number, licenceExpires: r.licence_expires_on, createdAt: r.created_at, phone: r.phone ?? r.profile?.phone ?? null, guestBookings: guestsOf(r.phone),
                docs: r.kyc_documents.map((d) => ({ type: d.doc_type, url: urlOf.get(d.file_path) ?? null })),
              } satisfies PendingKyc} />
            </li>
          ))}
        </ul>
      </section>
      {!!done.length && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Recently reviewed</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
            {done.map((r) => (
              <li key={r.id}><Link href={`/riders/${r.profile_id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-line/40">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === "approved" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-red-500/15 text-red-700 dark:text-red-400"}`}>{r.status}</span>
                <span className="font-medium">{r.full_name}</span>
                <span className="text-muted">licence {r.licence_number} · until {r.licence_expires_on}</span>
                {r.note && <span className="text-muted">“{r.note}”</span>}
                <span className="ml-auto text-muted">{r.reviewed_at ? dt(new Date(r.reviewed_at)) : ""} ›</span>
              </Link></li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
