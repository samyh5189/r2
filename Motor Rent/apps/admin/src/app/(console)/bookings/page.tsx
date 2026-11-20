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
    .select("id, reference, status, period, total, currency, created_at, vehicles(plate, model), profiles(full_name, phone)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return <p role="alert" className="text-red-600">Could not load bookings.</p>;
  type Row = { id: string; reference: string; status: string; period: string; total: number; currency: string; vehicles: { plate: string; model: string } | null; profiles: { full_name: string | null; phone: string | null } | null };
  const rows = (data ?? []) as unknown as Row[];
  if (!rows.length) return <p className="text-muted">No bookings yet.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-left text-sm">
        <thead className="bg-panel text-muted">
          <tr>{["Ref", "Rider", "Bike", "Period", "Total", "Status", ""].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const p = parseRange(r.period);
            return (
              <tr key={r.id}>
                <td className="px-3 py-2 font-mono">{r.reference}</td>
                <td className="px-3 py-2">{r.profiles?.full_name ?? "—"}<div className="text-muted">{r.profiles?.phone}</div></td>
                <td className="px-3 py-2">{r.vehicles?.plate}<div className="text-muted">{r.vehicles?.model}</div></td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{p ? `${dt(p.start)} → ${dt(p.end)}` : "—"}</td>
                <td className="px-3 py-2 tabular-nums">{money(r.total, r.currency)}</td>
                <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                <td className="px-3 py-2">{(r.status === "held" || r.status === "confirmed") && <CancelBooking id={r.id} reference={r.reference} paid={r.status === "confirmed"} />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
