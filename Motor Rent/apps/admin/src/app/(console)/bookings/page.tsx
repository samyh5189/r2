import Link from "next/link";
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import { dt, money, parseRange } from "@/lib/format";
import { StatusBadge } from "../status-badge";
import { CancelBooking } from "./cancel-booking";

export const metadata = { title: "Bookings" };

export default function BookingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Bookings</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <BookingsTable />
      </Suspense>
    </div>
  );
}

async function BookingsTable() {
  const { db } = await requireStaff();
  const { data, error } = await db
    .from("bookings")
    .select("id, reference, status, period, total, currency, created_at, rider_id, guest_name, guest_phone, handover, vehicles(id, plate, model), profiles!bookings_rider_id_fkey(full_name, phone), booking_messages(from_staff, created_at)")
    .order("created_at", { ascending: false })
    .order("created_at", { referencedTable: "booking_messages", ascending: false })
    .limit(1, { referencedTable: "booking_messages" })
    .limit(200);
  if (error) return <p role="alert" className="text-red-600">Could not load bookings.</p>;
  type Row = { id: string; reference: string; status: string; period: string; total: number; currency: string; rider_id: string | null; guest_name: string | null; guest_phone: string | null; handover: string; booking_messages: { from_staff: boolean }[]; vehicles: { id: string; plate: string; model: string } | null; profiles: { full_name: string | null; phone: string | null } | null };
  const rows = (data ?? []) as unknown as Row[];
  if (!rows.length) return <p className="text-muted">No bookings yet.</p>;
  const action = (r: Row) => r.status === "confirmed" ? "Hand over" : r.status === "active" || r.status === "overdue" ? "Collect" : null;
  return (
    <>
    {/* Phones: one card per booking, whole card opens it. */}
    <ul className="space-y-2 sm:hidden">
      {rows.map((r) => {
        const p = parseRange(r.period);
        const unread = r.booking_messages?.[0] && !r.booking_messages[0].from_staff;
        const act = action(r);
        return (
          <li key={r.id}>
            <Link href={`/bookings/${r.id}${act ? "#handover" : ""}`} className="block space-y-1.5 rounded-xl border border-line bg-panel p-3 active:bg-line/40">
              <div className="flex items-center gap-2">
                <span className="plate text-xs">{r.reference}</span>
                <StatusBadge status={r.status} />
                {unread && <span className="rounded bg-sky-500/15 px-1.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">New message</span>}
                <span className="ml-auto text-sm font-semibold tabular-nums">{money(r.total, r.currency)}</span>
              </div>
              <div className="text-sm"><span className="font-medium">{r.profiles?.full_name ?? r.guest_name ?? "—"}</span>{!r.rider_id && <span className="ml-1 text-xs text-amber-700">no account</span>}{r.handover === "delivery" && <span className="ml-1 text-xs text-sky-700">delivery</span>} <span className="text-muted">{r.vehicles?.plate} {r.vehicles?.model}</span></div>
              {p && <div className="text-sm tabular-nums text-muted">{dt(p.start)} to {dt(p.end)}</div>}
              {act && <div className="pt-1 text-sm font-semibold text-accent">{act}</div>}
            </Link>
          </li>
        );
      })}
    </ul>
    <div className="hidden overflow-x-auto rounded-xl border border-line sm:block">
      <table className="w-full text-left text-sm">
        <thead className="bg-panel text-muted">
          <tr>{["Ref", "Rider", "Bike", "Period", "Total", "Status", ""].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const p = parseRange(r.period);
            return (
              <tr key={r.id}>
                <td className="px-3 py-2">
                  <Link href={`/bookings/${r.id}`} className="plate text-xs hover:opacity-80">{r.reference}</Link>
                  {r.booking_messages?.[0] && !r.booking_messages[0].from_staff && <div className="mt-0.5 w-fit rounded bg-sky-500/15 px-1.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">New message</div>}
                </td>
                <td className="px-3 py-2">{r.rider_id ? <Link href={`/riders/${r.rider_id}`} className="hover:underline">{r.profiles?.full_name ?? "—"}</Link> : <span>{r.guest_name} <span className="text-xs text-amber-700">no account</span></span>}<div className="text-muted">{r.profiles?.phone ?? r.guest_phone}{r.handover === "delivery" ? " · delivery" : ""}</div></td>
                <td className="px-3 py-2">{r.vehicles ? <Link href={`/fleet/${r.vehicles.id}`} className="hover:underline">{r.vehicles.plate}</Link> : null}<div className="text-muted">{r.vehicles?.model}</div></td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{p ? `${dt(p.start)} → ${dt(p.end)}` : "—"}</td>
                <td className="px-3 py-2 tabular-nums">{money(r.total, r.currency)}</td>
                <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                <td className="space-y-1 px-3 py-2">
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
