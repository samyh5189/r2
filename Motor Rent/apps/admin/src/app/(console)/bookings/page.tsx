import Link from "next/link";
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import { dt, money, parseRange } from "@/lib/format";
import { Icon } from "@/components/icons";
import { StatusBadge } from "../status-badge";
import { CancelBooking } from "./cancel-booking";

export const metadata = { title: "Bookings" };

const TABS = [
  { key: "all", label: "All" },
  { key: "held", label: "Unpaid", statuses: ["held"] },
  { key: "confirmed", label: "Confirmed", statuses: ["confirmed"] },
  { key: "out", label: "On the road", statuses: ["active", "overdue"] },
  { key: "done", label: "Done", statuses: ["returned", "damage_claim", "closed"] },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled", "expired"] },
] as const;

export default function BookingsPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div><p className="text-sm font-medium text-muted">Every booking, newest first</p><h1 className="text-3xl tracking-tight">Bookings</h1></div>
      </header>
      <Suspense fallback={<p className="animate-pulse text-muted">Loading…</p>}>
        <BookingsTable searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function BookingsTable({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s = "all" } = await searchParams;
  const tab = TABS.find((t) => t.key === s) ?? TABS[0];
  const { db } = await requireStaff();
  let q = db
    .from("bookings")
    .select("id, reference, status, period, total, currency, created_at, rider_id, guest_name, guest_phone, handover, vehicles(id, plate, model), profiles!bookings_rider_id_fkey(full_name, phone), booking_messages(from_staff, created_at)")
    .order("created_at", { ascending: false })
    .order("created_at", { referencedTable: "booking_messages", ascending: false })
    .limit(1, { referencedTable: "booking_messages" })
    .limit(200);
  if ("statuses" in tab) q = q.in("status", [...tab.statuses]);
  const { data, error } = await q;
  if (error) return <p role="alert" className="text-red-600">Could not load bookings.</p>;
  type Row = { id: string; reference: string; status: string; period: string; total: number; currency: string; rider_id: string | null; guest_name: string | null; guest_phone: string | null; handover: string; booking_messages: { from_staff: boolean }[]; vehicles: { id: string; plate: string; model: string } | null; profiles: { full_name: string | null; phone: string | null } | null };
  const rows = (data ?? []) as unknown as Row[];
  const tabs = (
    <nav aria-label="Filter by status" className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:w-fit sm:px-0">
      <div className="flex gap-1 rounded-full border border-line bg-panel p-1 shadow-[var(--shadow)]">
        {TABS.map((t) => <Link key={t.key} href={t.key === "all" ? "/bookings" : `/bookings?s=${t.key}`} aria-current={t.key === tab.key ? "page" : undefined} className="seg border-0">{t.label}</Link>)}
      </div>
    </nav>
  );
  if (!rows.length) return <>{tabs}<p className="card px-4 py-6 text-muted">{tab.key === "all" ? "No bookings yet." : "No bookings in this list."}</p></>;
  const action = (r: Row) => r.status === "confirmed" ? "Hand over" : r.status === "active" || r.status === "overdue" ? "Collect" : null;
  return (
    <>
    {tabs}
    {/* Phones: one card per booking. */}
    <ul className="space-y-3 sm:hidden">
      {rows.map((r) => {
        const p = parseRange(r.period);
        const unread = r.booking_messages?.[0] && !r.booking_messages[0].from_staff;
        const act = action(r);
        const name = r.profiles?.full_name ?? r.guest_name ?? "—";
        const phone = r.profiles?.phone ?? r.guest_phone;
        return (
          <li key={r.id} className="card space-y-3 p-4">
            <Link href={`/bookings/${r.id}${act ? "#handover" : ""}`} className="flex items-start gap-3">
              <span className="grid size-12 flex-none place-items-center rounded-full bg-accent-soft text-lg font-bold text-accent">{name.slice(0, 1)}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-bold">{name}</div>
                <div className="truncate text-sm text-muted">{r.vehicles?.model} · {r.vehicles?.plate}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={r.status} />
                  {!r.rider_id && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">No account</span>}
                  {r.handover === "delivery" && <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:text-sky-300">Delivery</span>}
                  {unread && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white">New message</span>}
                </div>
              </div>
              <span className="plate flex-none text-xs">{r.reference}</span>
            </Link>
            <dl className="grid grid-cols-3 divide-x divide-line text-sm">
              <div className="pr-2"><dt className="text-xs text-muted">Total</dt><dd className="font-semibold tabular-nums">{money(r.total, r.currency)}</dd></div>
              <div className="px-2"><dt className="text-xs text-muted">From</dt><dd className="font-semibold tabular-nums">{p ? dt(p.start) : "—"}</dd></div>
              <div className="pl-2"><dt className="text-xs text-muted">To</dt><dd className="font-semibold tabular-nums">{p ? dt(p.end) : "—"}</dd></div>
            </dl>
            <div className="flex gap-2">
              {phone && <a href={`tel:${phone.replace(/\s/g, "")}`} className="btn btn-secondary btn-sm flex-1"><Icon name="phone" className="size-4" />Call</a>}
              <Link href={`/bookings/${r.id}${act ? "#handover" : ""}`} className="btn btn-primary btn-sm flex-[1.4]">{act ?? "Details"}<Icon name="arrow" className="size-4" /></Link>
            </div>
            {(r.status === "held" || r.status === "confirmed") && <div className="text-right"><CancelBooking id={r.id} reference={r.reference} paid={r.status === "confirmed"} total={r.total} currency={r.currency} start={p?.start.toISOString()} /></div>}
          </li>
        );
      })}
    </ul>
    <div className="card hidden overflow-x-auto sm:block">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-xs text-muted">
          <tr>{["Ref", "Rider", "Bike", "Period", "Total", "Status", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const p = parseRange(r.period);
            return (
              <tr key={r.id} className="hover:bg-background/60">
                <td className="px-4 py-3">
                  <Link href={`/bookings/${r.id}`} className="plate text-xs hover:opacity-80">{r.reference}</Link>
                  {r.booking_messages?.[0] && !r.booking_messages[0].from_staff && <div className="mt-0.5 w-fit rounded bg-sky-500/15 px-1.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">New message</div>}
                </td>
                <td className="px-4 py-3">{r.rider_id ? <Link href={`/riders/${r.rider_id}`} className="hover:underline">{r.profiles?.full_name ?? "—"}</Link> : <span>{r.guest_name} <span className="text-xs text-amber-700">no account</span></span>}<div className="text-muted">{r.profiles?.phone ?? r.guest_phone}{r.handover === "delivery" ? " · delivery" : ""}</div></td>
                <td className="px-4 py-3">{r.vehicles ? <Link href={`/fleet/${r.vehicles.id}`} className="hover:underline">{r.vehicles.plate}</Link> : null}<div className="text-muted">{r.vehicles?.model}</div></td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums">{p ? `${dt(p.start)} → ${dt(p.end)}` : "—"}</td>
                <td className="px-4 py-3 tabular-nums">{money(r.total, r.currency)}</td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                <td className="space-y-1 px-4 py-3">
                  {r.status === "confirmed" && <Link href={`/bookings/${r.id}#handover`} className="block whitespace-nowrap text-xs font-semibold text-accent hover:underline">Hand over</Link>}
                  {(r.status === "active" || r.status === "overdue") && <Link href={`/bookings/${r.id}#handover`} className="block whitespace-nowrap text-xs font-semibold text-accent hover:underline">Collect</Link>}
                  {(r.status === "held" || r.status === "confirmed") && <CancelBooking id={r.id} reference={r.reference} paid={r.status === "confirmed"} total={r.total} currency={r.currency} start={parseRange(r.period)?.start.toISOString()} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}
