"use client";

import { useRouter } from "next/navigation";
import { LICENCE_CATEGORIES, type LicenceCategory } from "@motor-rent/shared";
import { useState } from "react";
import { dt } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";

export type PendingKyc = {
  id: string; fullName: string; dob: string; idType: string; idNumber: string; licenceNumber: string; licenceExpires: string;
  createdAt: string; phone: string | null; docs: { type: string; url: string | null }[];
  /** Bookings made without an account on the same mobile number. */
  guestBookings: { id: string; reference: string; name: string; status: string }[];
};

const LABEL: Record<string, string> = {
  licence_front: "Licence — front", licence_back: "Licence — back", national_id: "ID card", passport: "Passport", selfie: "Selfie",
};
const ORDER = ["selfie", "national_id", "passport", "licence_front", "licence_back"];
const field = "rounded-xl border border-line bg-panel px-3 py-2 outline-none focus:border-accent";

function age(dob: string) {
  const d = new Date(dob);
  const n = new Date();
  return n.getFullYear() - d.getFullYear() - (n < new Date(n.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0);
}

export function KycReview({ sub }: { sub: PendingKyc }) {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [expires, setExpires] = useState(sub.licenceExpires);
  const [dob, setDob] = useState(sub.dob);
  const [reason, setReason] = useState("");
  const [cats, setCats] = useState<LicenceCategory[]>([]);
  const [rejecting, setRejecting] = useState(false);
  const [link, setLink] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true); setError(null);
    const { error } = await supabase.rpc("review_kyc", {
      p_submission: sub.id, p_approve: approve, p_licence_expires_on: approve ? expires : null, p_date_of_birth: approve ? dob : null,
      p_note: approve ? null : reason, p_categories: approve ? cats : null, p_link_guest: link,
    });
    setBusy(false);
    if (error) return setError(error.message);
    router.refresh();
  }

  const docs = [...sub.docs].sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
  return (
    <article className="space-y-4 rounded-2xl border border-line bg-panel p-4">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="text-lg font-semibold">{sub.fullName}</span>
        {sub.phone ? <a href={`tel:${sub.phone}`} className="text-sm font-medium text-accent">{sub.phone}</a> : <span className="text-sm text-amber-700">no mobile number (sent before it was required)</span>}
        <span className="ml-auto text-sm text-muted">sent {dt(new Date(sub.createdAt))}</span>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {docs.map((d) => (
          <li key={d.type}>
            <button type="button" onClick={() => d.url && setZoom(d.url)} className="group block w-full overflow-hidden rounded-xl border border-line bg-line text-left">
              {d.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.url} alt={LABEL[d.type] ?? d.type} className="aspect-[4/3] w-full object-cover transition group-hover:scale-105" />
              ) : <div className="flex aspect-[4/3] items-center justify-center text-sm text-muted">Unavailable</div>}
            </button>
            <p className="mt-1 text-xs font-medium text-muted">{LABEL[d.type] ?? d.type}</p>
          </li>
        ))}
      </ul>
      {zoom && (
        <div role="dialog" aria-modal="true" onClick={() => setZoom(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-muted">{sub.idType === "passport" ? "Passport no." : "ID card no."}</dt><dd className="font-mono">{sub.idNumber}</dd></div>
        <div><dt className="text-xs text-muted">Licence no.</dt><dd className="font-mono">{sub.licenceNumber}</dd></div>
        <div>
          <dt className="text-xs text-muted">Date of birth · age {age(dob)}</dt>
          <dd><input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={`${field} w-full py-1`} /></dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Licence expires</dt>
          <dd><input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={`${field} w-full py-1`} /></dd>
        </div>
      </dl>
      <p className="text-xs text-muted">Correct the dates if they differ from the documents. The rider is approved with what you enter.</p>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Licence categories on the licence</legend>
        <p className="text-xs text-muted">Tick every category printed on the licence. The rider can only book vehicles their categories cover.</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(LICENCE_CATEGORIES) as LicenceCategory[]).map((c) => {
            const on = cats.includes(c);
            return (
              <label key={c} className={`flex cursor-pointer items-center gap-2 rounded-xl border-[1.5px] px-3 py-2 text-sm transition ${on ? "border-accent bg-accent/10 font-semibold" : "border-line"}`}>
                <input type="checkbox" checked={on} onChange={() => setCats(on ? cats.filter((x) => x !== c) : [...cats, c])} className="accent-[var(--accent)]" />
                {LICENCE_CATEGORIES[c].label}
              </label>
            );
          })}
        </div>
      </fieldset>

      {sub.guestBookings.length > 0 && (
        <div className="space-y-2 rounded-xl border border-line bg-panel p-3 text-sm">
          <p className="font-semibold">{sub.guestBookings.length} booking{sub.guestBookings.length === 1 ? "" : "s"} made without an account on {sub.phone}</p>
          <ul className="flex flex-wrap gap-2">
            {sub.guestBookings.map((g) => (
              <li key={g.id}><a href={`/bookings/${g.id}`} target="_blank" rel="noreferrer" className="plate text-xs hover:opacity-80">{g.reference}</a> <span className="text-muted">{g.name} · {g.status}</span></li>
            ))}
          </ul>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={link} onChange={(e) => setLink(e.target.checked)} />
            Add them to this rider’s account when I approve (check the names match)
          </label>
        </div>
      )}
      {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
      {!rejecting ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || cats.length === 0} onClick={() => decide(true)} className="btn btn-primary"
            title={cats.length === 0 ? "Tick the licence categories first" : undefined}>
            {busy ? "…" : "Approve rider"}</button>
          <button type="button" disabled={busy} onClick={() => setRejecting(true)} className="btn btn-secondary">Reject</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-64 flex-1 space-y-1"><span className="text-xs font-medium text-muted">What should the rider fix? (they see this)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus className={`${field} w-full`}
              placeholder="e.g. Licence photo is blurry — please retake in good light" /></label>
          <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => decide(false)} className="btn btn-primary">Reject</button>
          <button type="button" onClick={() => setRejecting(false)} className="btn btn-ghost">Cancel</button>
        </div>
      )}
    </article>
  );
}
