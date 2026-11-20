import Link from "next/link";
import { Suspense } from "react";
import { avatarPublicUrl, diff, Timeline, type TimelineEntry } from "@/components/timeline";
import { requireStaff } from "@/lib/auth";
import { dt, money, parseRange } from "@/lib/format";
import { StatusBadge } from "../../status-badge";

export const metadata = { title: "Rider" };

const DOC: Record<string, string> = { licence_front: "Licence front", licence_back: "Licence back", national_id: "ID card", passport: "Passport", selfie: "Selfie" };
const PROFILE_FIELDS = { full_name: "Name", phone: "Phone", date_of_birth: "Date of birth", kyc_status: "Verification", licence_expires_on: "Licence expiry", role: "Role", avatar_path: "Photo" };

export default function RiderPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="animate-pulse text-muted">Loading…</p>}>
      <Rider params={params} />
    </Suspense>
  );
}

async function Rider({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await requireStaff();
  const { data: p } = await db.from("profiles")
    .select("id, full_name, phone, role, date_of_birth, kyc_status, licence_expires_on, avatar_path, created_at").eq("id", id).maybeSingle();
  if (!p) return <p role="alert" className="text-red-600">Rider not found.</p>;

  const [subs, bookings, audit, blocks] = await Promise.all([
    db.from("kyc_submissions").select("id, status, note, id_type, id_number, licence_number, licence_expires_on, created_at, reviewed_at, reviewed_by, kyc_documents(doc_type, file_path)").eq("profile_id", id),
    db.from("bookings").select("id, reference, status, period, total, currency, created_at, vehicles(plate, model)").eq("rider_id", id).order("created_at", { ascending: false }),
    db.from("audit_log").select("id, actor, action, before, after, at").eq("entity", "profiles").eq("entity_id", id), // managers/owners only (RLS)
    db.from("rider_blocks").select("id, reason, amount_owed, currency, active, created_at, created_by").eq("profile_id", id),
  ]);

  const ids = new Set<string>();
  subs.data?.forEach((s) => s.reviewed_by && ids.add(s.reviewed_by));
  audit.data?.forEach((a) => a.actor && ids.add(a.actor));
  blocks.data?.forEach((b) => b.created_by && ids.add(b.created_by));
  const { data: people } = ids.size ? await db.from("profiles").select("id, full_name, avatar_path").in("id", [...ids]) : { data: [] };
  const person = new Map((people ?? []).map((x) => [x.id, x]));
  const name = p.full_name ?? "Rider";
  const who = (uid: string | null): TimelineEntry["who"] =>
    !uid ? { name: "System", tag: "System" }
      : uid === id ? { name, tag: "Rider", avatarUrl: avatarPublicUrl(p.avatar_path) }
        : { name: person.get(uid)?.full_name ?? "Staff", tag: "Office", avatarUrl: avatarPublicUrl(person.get(uid)?.avatar_path) };

  const docPaths = (subs.data ?? []).flatMap((s) => (s.kyc_documents as { doc_type: string; file_path: string }[]).map((d) => d.file_path));
  const { data: signed } = docPaths.length ? await db.storage.from("kyc").createSignedUrls(docPaths, 1800) : { data: [] };
  const url = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  const entries: TimelineEntry[] = [];
  entries.push({ key: "joined", at: new Date(p.created_at), who: who(id), kind: "log", title: "Created an account" });
  for (const s of subs.data ?? []) {
    entries.push({ key: `k${s.id}`, at: new Date(s.created_at), who: who(id), kind: "log", title: "Submitted identity documents",
      href: s.status === "pending" ? "/verifications" : undefined,
      changes: [
        { field: s.id_type === "passport" ? "Passport" : "ID card", from: "", to: s.id_number },
        { field: "Licence", from: "", to: `${s.licence_number} · until ${s.licence_expires_on}` },
      ],
      images: (s.kyc_documents as { doc_type: string; file_path: string }[]).flatMap((d) => (url.get(d.file_path) ? [{ url: url.get(d.file_path)!, label: DOC[d.doc_type] ?? d.doc_type }] : [])) });
    if (s.reviewed_at) entries.push({ key: `k${s.id}r`, at: new Date(s.reviewed_at), who: who(s.reviewed_by), kind: "log",
      tone: s.status === "approved" ? "success" : "danger", title: s.status === "approved" ? "Approved identity verification" : "Rejected identity verification", note: s.note });
  }
  for (const a of audit.data ?? []) {
    const changes = diff(a.before as Record<string, unknown> | null, a.after as Record<string, unknown> | null, PROFILE_FIELDS,
      (f, v) => (v == null ? "" : f === "avatar_path" ? "photo" : String(v)));
    if (changes.length) entries.push({ key: `a${a.id}`, at: new Date(a.at), who: who(a.actor), kind: "log", title: "Updated profile", changes });
  }
  for (const b of (bookings.data ?? []) as unknown as { id: string; reference: string; status: string; total: number; currency: string; created_at: string; vehicles: { plate: string; model: string } | null }[]) {
    entries.push({ key: `b${b.id}`, at: new Date(b.created_at), who: who(id), kind: "log", href: `/bookings/${b.id}`,
      title: `Booked ${b.vehicles?.model ?? "a vehicle"} (${b.vehicles?.plate ?? "—"}) · ${b.reference} · ${money(b.total, b.currency)}` });
  }
  for (const bl of blocks.data ?? []) {
    entries.push({ key: `x${bl.id}`, at: new Date(bl.created_at), who: who(bl.created_by), kind: "log", tone: "danger", href: "/blocklist",
      title: `Added to the blocklist${bl.amount_owed ? ` · owes ${money(bl.amount_owed, bl.currency)}` : ""}${bl.active ? "" : " (lifted)"}`, note: bl.reason });
  }

  const av = avatarPublicUrl(p.avatar_path);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <section className="space-y-4">
        <Link href="/verifications" className="text-sm text-muted hover:underline">← Verifications</Link>
        <div className="space-y-3 rounded-2xl border border-line bg-panel p-5">
          <div className="flex items-center gap-3">
            {av ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={av} alt="" className="size-14 rounded-full object-cover" />
            ) : <span className="flex size-14 items-center justify-center rounded-full bg-sky-600 text-lg font-bold text-white">{name.slice(0, 1)}</span>}
            <div>
              <h1 className="text-xl font-semibold">{name}</h1>
              <p className="text-sm text-muted">{p.phone ?? "no phone"} · {p.role}</p>
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Verification</dt><dd><StatusBadge status={p.kyc_status} /></dd>
            <dt className="text-muted">Date of birth</dt><dd>{p.date_of_birth ?? "—"}</dd>
            <dt className="text-muted">Licence until</dt><dd>{p.licence_expires_on ?? "—"}</dd>
            <dt className="text-muted">Joined</dt><dd>{dt(new Date(p.created_at))}</dd>
          </dl>
        </div>
        {!!bookings.data?.length && (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel text-sm">
            {(bookings.data as unknown as { id: string; reference: string; status: string; period: string; vehicles: { plate: string } | null }[]).map((b) => {
              const r = parseRange(b.period);
              return (
                <li key={b.id}><Link href={`/bookings/${b.id}`} className="flex items-center gap-3 px-4 py-2 hover:bg-line/40">
                  <span className="font-mono">{b.reference}</span><span className="text-muted">{b.vehicles?.plate}</span>
                  <span className="text-muted tabular-nums">{r ? dt(r.start) : ""}</span><span className="ml-auto"><StatusBadge status={b.status} /></span>
                </Link></li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">History</h2>
        <Timeline entries={entries} />
      </section>
    </div>
  );
}
