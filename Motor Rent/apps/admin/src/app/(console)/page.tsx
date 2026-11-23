import Link from "next/link";
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import { dt, money, parseRange } from "@/lib/format";
import { StatusBadge } from "./status-badge";

export const metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Today</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Today />
      </Suspense>
    </div>
  );
}

async function Today() {
  const { db } = await requireStaff();
  // "Today" is the Maldives day (UTC+5); the server runs in UTC.
  const MV = 5 * 3_600_000;
  const dayStart = new Date(Math.floor((Date.now() + MV) / 86_400_000) * 86_400_000 - MV);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const today = `[${dayStart.toISOString()},${dayEnd.toISOString()})`;

  const [live, payments, toCall] = await Promise.all([
    db.from("bookings")
      .select("id, reference, status, period, guest_name, guest_phone, handover, vehicles(plate, model), profiles(full_name, phone)")
      .in("status", ["held", "confirmed", "active", "overdue"])
      .overlaps("period", today)
      .order("period"),
    db.from("payments").select("amount, currency, kind").eq("status", "succeeded").gte("created_at", dayStart.toISOString()),
    // Unpaid bookings made without an account: the office calls to confirm and take payment.
    db.from("bookings")
      .select("id, reference, status, period, guest_name, guest_phone, handover, vehicles(plate, model), profiles(full_name, phone)")
      .eq("status", "held").is("rider_id", null).order("held_until"),
  ]);

  type Row = { id: string; reference: string; status: string; period: string; guest_name: string | null; guest_phone: string | null; handover: string;
    vehicles: { plate: string; model: string } | null; profiles: { full_name: string | null; phone: string | null } | null };
  const rows = (live.data ?? []) as unknown as Row[];
  const inDay = (d: Date | undefined) => !!d && d >= dayStart && d < dayEnd;
  const pickups = rows.filter((r) => r.status === "confirmed" && inDay(parseRange(r.period)?.start));
  const returns = rows.filter((r) => (r.status === "active" || r.status === "overdue") && inDay(parseRange(r.period)?.end));
  const overdue = rows.filter((r) => r.status === "overdue");
  const revenue = (payments.data ?? []).reduce((s, p) => s + (p.kind === "refund" ? -p.amount : p.amount), 0);

  const stats = [
    { label: "Pickups today", value: pickups.length },
    { label: "Returns today", value: returns.length },
    { label: "Overdue now", value: overdue.length, alert: overdue.length > 0 },
    { label: "Taken today (net)", value: money(revenue) },
  ];

  return (
    <>
      {(live.error || payments.error) && <p role="alert" className="text-red-600">Some data failed to load. Refresh to retry.</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.alert ? "border-red-400" : "border-line"}`}>
            <div className="text-sm text-muted">{s.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>
      {!!toCall.data?.length && <BookingList title="Booked without an account: call to confirm and take payment" rows={toCall.data as unknown as Row[]} empty="" />}
      <BookingList title="Overdue: call these riders" rows={overdue} empty="Nothing overdue." />
      <BookingList title="Pickups" rows={pickups} empty="No pickups scheduled today." />
      <BookingList title="Returns" rows={returns} empty="No returns due today." />
    </>
  );

  function BookingList({ title, rows, empty }: { title: string; rows: Row[]; empty: string }) {
    return (
      <section className="space-y-2">
        <h2 className="font-medium">{title}</h2>
        {rows.length === 0 ? <p className="text-sm text-muted">{empty}</p> : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {rows.map((r) => {
              const p = parseRange(r.period);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                  <Link href={`/bookings/${r.id}#handover`} className="plate text-xs">{r.reference}</Link>
                  <span>{r.vehicles?.plate} {r.vehicles?.model}</span>
                  <span className="text-muted">{r.profiles?.full_name ?? r.guest_name ?? "—"}{!r.profiles && r.guest_name && <span className="ml-1 text-xs text-amber-700">no account</span>}</span>
                  {(r.profiles?.phone ?? r.guest_phone) && <a href={`tel:${(r.profiles?.phone ?? r.guest_phone)!.replace(/\s/g, "")}`} className="font-medium text-accent">{r.profiles?.phone ?? r.guest_phone}</a>}
                  {r.handover === "delivery" && <span className="rounded bg-sky-500/15 px-1.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">Delivery</span>}
                  {p && <span className="tabular-nums text-muted">{dt(p.start)} to {dt(p.end)}</span>}
                  <span className="ml-auto flex items-center gap-3">
                    <StatusBadge status={r.status} />
                    {(r.status === "confirmed" || r.status === "active" || r.status === "overdue") && (
                      <Link href={`/bookings/${r.id}#handover`} className="btn btn-primary btn-sm">
                        {r.status === "confirmed" ? "Hand over" : "Collect"}</Link>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }
}
