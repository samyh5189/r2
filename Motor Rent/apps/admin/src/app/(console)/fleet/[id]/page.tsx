import Link from "next/link";
import { Suspense } from "react";
import { avatarPublicUrl, diff, Timeline, type TimelineEntry } from "@/components/timeline";
import { requireStaff } from "@/lib/auth";
import { dt, money } from "@/lib/format";
import { StatusBadge } from "../../status-badge";

export const metadata = { title: "Vehicle" };

const FIELDS = {
  plate: "Plate", make: "Make", model: "Model", kind: "Type", engine_cc: "Engine cc", year: "Year", status: "Status",
  odometer_km: "Odometer (km)", engine_hours: "Engine hours", price_plan_id: "Price plan", branch_id: "Branch", photos: "Photos",
};

export default function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="animate-pulse text-muted">Loading…</p>}>
      <Vehicle params={params} />
    </Suspense>
  );
}

async function Vehicle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await requireStaff();
  const { data: v } = await db.from("vehicles")
    .select("id, plate, make, model, kind, status, odometer_km, engine_hours, created_at, price_plans(hourly, daily, currency), branches(name)").eq("id", id).maybeSingle();
  if (!v) return <p role="alert" className="text-red-600">Vehicle not found.</p>;

  const [audit, bookings] = await Promise.all([
    db.from("audit_log").select("id, actor, action, before, after, at").eq("entity", "vehicles").eq("entity_id", id), // managers/owners (RLS)
    db.from("bookings").select("id, reference, status, total, currency, created_at, rider:profiles!bookings_rider_id_fkey(full_name)").eq("vehicle_id", id).order("created_at", { ascending: false }).limit(100),
  ]);
  const ids = [...new Set((audit.data ?? []).flatMap((a) => (a.actor ? [a.actor] : [])))];
  const { data: people } = ids.length ? await db.from("profiles").select("id, full_name, avatar_path").in("id", ids) : { data: [] };
  const person = new Map((people ?? []).map((x) => [x.id, x]));
  const who = (uid: string | null): TimelineEntry["who"] => !uid ? { name: "System", tag: "System" }
    : { name: person.get(uid)?.full_name ?? "Staff", tag: "Office", avatarUrl: avatarPublicUrl(person.get(uid)?.avatar_path) };

  const entries: TimelineEntry[] = [];
  for (const a of audit.data ?? []) {
    const before = a.before as Record<string, unknown> | null;
    const after = a.after as Record<string, unknown> | null;
    if (a.action === "insert") { entries.push({ key: `a${a.id}`, at: new Date(a.at), who: who(a.actor), kind: "log", tone: "success", title: "Added to the fleet" }); continue; }
    if (a.action === "delete") { entries.push({ key: `a${a.id}`, at: new Date(a.at), who: who(a.actor), kind: "log", tone: "danger", title: "Removed from the fleet" }); continue; }
    const changes = diff(before, after, FIELDS, (f, x) => (x == null ? "" : f === "photos" ? `${(x as unknown[]).length} photo(s)` : f.endsWith("_id") ? "changed" : String(x)));
    if (changes.length) entries.push({ key: `a${a.id}`, at: new Date(a.at), who: who(a.actor), kind: "log", title: "Updated vehicle", changes });
  }
  for (const b of (bookings.data ?? []) as unknown as { id: string; reference: string; status: string; total: number; currency: string; created_at: string; rider: { full_name: string | null } | null }[]) {
    entries.push({ key: `b${b.id}`, at: new Date(b.created_at), who: { name: b.rider?.full_name ?? "Rider", tag: "Rider" }, kind: "log", href: `/bookings/${b.id}`,
      title: `Booking ${b.reference} · ${money(b.total, b.currency)} · ${b.status}` });
  }
  if (!audit.data?.length) entries.push({ key: "created", at: new Date(v.created_at), who: { name: "System", tag: "System" }, kind: "log", title: "Added to the fleet" });

  const plan = v.price_plans as unknown as { hourly: number; daily: number; currency: string } | null;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <section className="space-y-4">
        <Link href="/fleet" className="text-sm text-muted hover:underline">← Fleet</Link>
        <div className="space-y-3 rounded-2xl border border-line bg-panel p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="plate text-2xl">{v.plate}</h1><StatusBadge status={v.status} />
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Vehicle</dt><dd>{v.make} {v.model} · {v.kind}</dd>
            <dt className="text-muted">Branch</dt><dd>{(v.branches as unknown as { name: string } | null)?.name ?? "—"}</dd>
            <dt className="text-muted">Odometer</dt><dd className="tabular-nums">{v.odometer_km} km</dd>
            <dt className="text-muted">Engine hours</dt><dd className="tabular-nums">{v.engine_hours ?? "—"}</dd>
            <dt className="text-muted">Price</dt><dd>{plan ? `${money(plan.hourly, plan.currency)}/h · ${money(plan.daily, plan.currency)}/day` : "—"}</dd>
            <dt className="text-muted">Added</dt><dd>{dt(new Date(v.created_at))}</dd>
          </dl>
        </div>
      </section>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">History</h2>
        <Timeline entries={entries} />
      </section>
    </div>
  );
}
