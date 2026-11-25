import Link from "next/link";
import { Suspense } from "react";
import { avatarPublicUrl } from "@/components/timeline";
import { requireStaff } from "@/lib/auth";
import { dt, money } from "@/lib/format";
import { StatusBadge } from "../status-badge";

export const metadata = { title: "Riders" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "approved", label: "Verified" },
  { key: "unverified", label: "Not verified" },
  { key: "blocked", label: "Blocked" },
] as const;

export default function RidersPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  return (
    <div className="space-y-5">
      <header><p className="text-sm font-medium text-muted">Everyone with an account</p><h1 className="text-3xl tracking-tight">Riders</h1></header>
      <Suspense fallback={<p className="animate-pulse text-muted">Loading…</p>}>
        <Riders searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Riders({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const { q = "", f = "all" } = await searchParams;
  const { db } = await requireStaff();
  let query = db.from("profiles")
    .select("id, full_name, phone, whatsapp, kyc_status, avatar_path, created_at, licence_expires_on, bookings!bookings_rider_id_fkey(status, total), rider_blocks!rider_blocks_profile_id_fkey(active)")
    .eq("role", "rider").order("created_at", { ascending: false }).limit(300);
  const term = q.trim().replace(/[%,()]/g, "");
  if (term) query = query.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%,whatsapp.ilike.%${term}%`);
  if (f === "approved") query = query.eq("kyc_status", "approved");
  if (f === "unverified") query = query.neq("kyc_status", "approved");
  const { data, error } = await query;
  if (error) return <p role="alert" className="text-red-600">Could not load riders. {error.message}</p>;
  type Row = { id: string; full_name: string | null; phone: string | null; whatsapp: string | null; kyc_status: string; avatar_path: string | null; created_at: string; licence_expires_on: string | null; bookings: { status: string; total: number }[]; rider_blocks: { active: boolean }[] };
  let rows = (data ?? []) as unknown as Row[];
  if (f === "blocked") rows = rows.filter((r) => r.rider_blocks?.some((b) => b.active));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <form className="flex gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Search name or phone" aria-label="Search riders"
          className="min-w-0 flex-1 rounded-full border border-line bg-panel px-4 py-2.5 shadow-[var(--shadow)] outline-none focus:border-accent" />
        <input type="hidden" name="f" value={f} />
        <button className="btn btn-primary">Search</button>
      </form>
      <nav aria-label="Filter" className="-mx-4 flex overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <div className="flex gap-1 rounded-full border border-line bg-panel p-1 shadow-[var(--shadow)]">
          {FILTERS.map((x) => (
            <Link key={x.key} href={`/riders?f=${x.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`} aria-current={x.key === f ? "page" : undefined}
              className="seg border-0">{x.label}</Link>
          ))}
        </div>
      </nav>
      <p className="text-sm text-muted">{rows.length} rider{rows.length === 1 ? "" : "s"}</p>
      {!rows.length ? <p className="text-muted">No riders match.</p> : (
        <ul className="card divide-y divide-line overflow-hidden">
          {rows.map((r) => {
            const paid = r.bookings.filter((b) => !["held", "cancelled", "expired"].includes(b.status));
            const spent = paid.reduce((a, b) => a + b.total, 0);
            const blocked = r.rider_blocks?.some((b) => b.active);
            const av = avatarPublicUrl(r.avatar_path);
            const expired = r.licence_expires_on && r.licence_expires_on < today;
            return (
              <li key={r.id}>
                <Link href={`/riders/${r.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-background/70">
                  {av ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={av} alt="" className="size-12 flex-none rounded-full object-cover" />
                  ) : <span className="flex size-12 flex-none items-center justify-center rounded-full bg-accent-soft text-lg font-bold text-accent">{(r.full_name ?? "R").slice(0, 1)}</span>}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{r.full_name ?? "No name"}</span>
                      <StatusBadge status={r.kyc_status} />
                      {blocked && <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-600">Blocked</span>}
                      {expired && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">Licence expired</span>}
                    </div>
                    <div className="truncate text-sm text-muted">{r.phone ?? r.whatsapp ?? "no phone"}, joined {dt(new Date(r.created_at))}</div>
                  </div>
                  <div className="hidden text-right text-sm sm:block">
                    <div className="font-bold tabular-nums">{money(spent)}</div>
                    <div className="text-muted">{paid.length} rental{paid.length === 1 ? "" : "s"}</div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
