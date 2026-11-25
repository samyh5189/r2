import Link from "next/link";
import { Suspense } from "react";
import { avatarPublicUrl, diff, Timeline, type TimelineEntry } from "@/components/timeline";
import { Icon, type IconName } from "@/components/icons";
import { requireStaff } from "@/lib/auth";
import { dt, money, parseRange } from "@/lib/format";
import { StatusBadge } from "../../status-badge";
import { DeleteRider, EditRider } from "./edit-rider";
import { LicenceCategories } from "./licence-categories";

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
  const { db, user } = await requireStaff();
  const canEdit = user.role === "manager" || user.role === "owner";
  const { data: p } = await db.from("profiles")
    .select("id, full_name, phone, whatsapp, whatsapp_verified, role, date_of_birth, kyc_status, licence_expires_on, licence_categories, avatar_path, created_at").eq("id", id).maybeSingle();
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
  const paidBookings = ((bookings.data ?? []) as { status: string; total: number }[]).filter((b) => !["held", "cancelled", "expired"].includes(b.status));
  const spent = paidBookings.reduce((a, b) => a + b.total, 0);
  const blocked = blocks.data?.some((b) => b.active);
  const row = (icon: IconName, label: string, value: React.ReactNode) => (
    <div className="flex items-center gap-3 py-3">
      <Icon name={icon} className="size-5 flex-none text-muted" />
      <dt className="w-28 flex-none text-sm text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm font-medium">{value}</dd>
    </div>
  );
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <section className="space-y-4">
        <Link href="/riders" className="inline-flex size-10 items-center justify-center rounded-full border border-line bg-panel" aria-label="Back to riders"><Icon name="back" className="size-5" /></Link>
        <div className="flex items-center gap-4">
          {av ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={av} alt="" className="size-24 flex-none rounded-full object-cover ring-4 ring-panel shadow-[var(--shadow)]" />
          ) : <span className="flex size-24 flex-none items-center justify-center rounded-full bg-accent-soft text-3xl font-extrabold text-accent ring-4 ring-panel">{name.slice(0, 1)}</span>}
          <div className="min-w-0 space-y-1.5">
            <h1 className="text-2xl tracking-tight">{name}</h1>
            <StatusBadge status={p.kyc_status} />
            <p className="flex items-center gap-1.5 text-sm text-muted">
              <span className={`size-2 rounded-full ${blocked ? "bg-rose-500" : "bg-emerald-500"}`} />
              {blocked ? <Link href="/blocklist" className="font-semibold text-rose-600 hover:underline">Blocked</Link> : "Can book"}
            </p>
          </div>
        </div>
        <dl className="card divide-y divide-line px-4">
          {row("phone", "Phone", p.phone ? <a className="text-accent hover:underline" href={`tel:${p.phone.replace(/\s/g, "")}`}>{p.phone}</a> : "—")}
          {row("chat", "WhatsApp", <>{p.whatsapp ? <a className="text-accent hover:underline" href={`https://wa.me/${p.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">{p.whatsapp}</a> : "—"}{p.whatsapp && !p.whatsapp_verified ? <span className="text-muted"> (not confirmed)</span> : null}</>)}
          {row("cake", "Date of birth", p.date_of_birth ?? "—")}
          {row("id", "Licence until", p.licence_expires_on ?? "—")}
          {row("bike", "May ride", p.kyc_status === "approved"
            ? <LicenceCategories rider={p.id} current={(p.licence_categories as string[] | null) ?? []} />
            : <span className="text-muted">set when the ID check is approved</span>)}
        </dl>
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4">
            <div className="text-sm font-semibold">Rider since</div>
            <div className="mt-2 flex items-center gap-2 font-bold"><Icon name="calendar" className="size-5 text-muted" />{new Date(p.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Indian/Maldives" })}</div>
          </div>
          <div className="card p-4">
            <div className="text-sm font-semibold">Total spent</div>
            <div className="mt-2 text-xl font-extrabold tabular-nums text-accent">{money(spent)}</div>
            <div className="text-xs text-muted">{paidBookings.length} rental{paidBookings.length === 1 ? "" : "s"}</div>
          </div>
        </div>
        {canEdit && p.role === "rider" && (
          <>
            <EditRider rider={{ id: p.id, full_name: p.full_name, phone: p.phone, whatsapp: p.whatsapp, date_of_birth: p.date_of_birth, licence_expires_on: p.licence_expires_on }} />
            <DeleteRider id={p.id} name={name} />
          </>
        )}
        {!!bookings.data?.length && (
          <ul className="card divide-y divide-line overflow-hidden text-sm">
            {(bookings.data as unknown as { id: string; reference: string; status: string; period: string; vehicles: { plate: string } | null }[]).map((b) => {
              const r = parseRange(b.period);
              return (
                <li key={b.id}><Link href={`/bookings/${b.id}`} className="flex items-center gap-3 px-4 py-2 hover:bg-line/40">
                  <span className="plate text-xs">{b.reference}</span><span className="text-muted">{b.vehicles?.plate}</span>
                  <span className="text-muted tabular-nums">{r ? dt(r.start) : ""}</span><span className="ml-auto"><StatusBadge status={b.status} /></span>
                </Link></li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="space-y-4">
        <h2 className="text-lg">Activity timeline</h2>
        <Timeline entries={entries} />
      </section>
    </div>
  );
}
