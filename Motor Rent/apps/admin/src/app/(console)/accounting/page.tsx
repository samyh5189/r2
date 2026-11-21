import Link from "next/link";
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import { dt, money } from "@/lib/format";
import { MarkCollected } from "./mark-collected";
import { PRESETS, periodFor } from "./period";

export const metadata = { title: "Accounting" };

type Report = {
  collected: Record<string, number>; refunds: number; booked: Record<string, number>; bookings: number;
  bookings_by_status: Record<string, number>; cancel_rate: number; avg_booking: number;
  daily: { day: string; amount: number }[]; by_method: { method: string; amount: number }[];
  by_vehicle: { id: string; plate: string; model: string; amount: number; hours: number }[]; period_hours: number;
  top_riders: { id: string; name: string; amount: number; rentals: number }[];
  unpaid_charges: number; awaiting_payment: number; blocklist_owed: number; deposits_held: number;
};

export default function AccountingPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Accounting</h1>
      <Suspense fallback={<p className="animate-pulse text-muted">Loading…</p>}>
        <Accounting searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
const METHOD_COLOUR: Record<string, string> = { "bank transfer": "bg-teal-600", cash: "bg-emerald-500", card: "bg-sky-500", refund: "bg-red-500" };

async function Accounting({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const { db, user } = await requireStaff();
  if (user.role === "staff") return <p className="text-muted">Accounting is for managers and owners.</p>;
  const period = periodFor(p ?? "month");
  const [{ data, error }, unpaid] = await Promise.all([
    db.rpc("finance_report", { p_from: period.from.toISOString(), p_to: period.to.toISOString() }),
    db.from("payments").select("id, amount, currency, created_at, bookings(id, reference, profiles(full_name))")
      .eq("status", "pending").eq("kind", "charge").neq("provider", "stripe").order("created_at", { ascending: false }).limit(50),
  ]);
  if (error || !data) return <p role="alert" className="text-red-600">Could not load the report.</p>;
  const r = data as Report;
  const collected = sum(r.collected);
  const maxDay = Math.max(1, ...r.daily.map((d) => d.amount));
  const methodTotal = r.by_method.filter((m) => m.amount > 0).reduce((a, m) => a + m.amount, 0) || 1;
  const maxVehicle = Math.max(1, ...r.by_vehicle.map((v) => v.amount));
  const outstanding = r.unpaid_charges + r.awaiting_payment + r.blocklist_owed;
  const qs = (k: string) => `/accounting?p=${k}`;
  type Unpaid = { id: string; amount: number; currency: string; created_at: string; bookings: { id: string; reference: string; profiles: { full_name: string | null } | null } | null };

  return (
    <>
      <nav aria-label="Period" className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {PRESETS.map((x) => (
          <Link key={x.key} href={qs(x.key)} aria-current={x.key === period.key ? "page" : undefined}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${x.key === period.key ? "bg-black text-white" : "border border-line hover:bg-panel"}`}>{x.label}</Link>
        ))}
        <a href={`/accounting/export?p=${period.key}`} className="ml-auto shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-panel">Download CSV</a>
      </nav>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={`Collected, ${period.label.toLowerCase()}`} value={money(collected)} strong />
        <Tile label="Booked value" value={money(sum(r.booked))} note={`${r.bookings} bookings, average ${money(r.avg_booking)}`} />
        <Tile label="Owed to you now" value={money(outstanding)} note="unpaid fees, unpaid reservations, blocklist" tone={outstanding ? "warn" : undefined} />
        <Tile label="Cancelled or expired" value={`${r.cancel_rate}%`} note={r.refunds ? `${money(r.refunds)} refunded` : "of bookings made"} />
      </section>

      <section className="space-y-2 rounded-2xl border border-line bg-panel p-4">
        <h2 className="font-semibold">Money in by day</h2>
        {collected === 0 ? <p className="text-sm text-muted">No payments received in this period.</p> : (
          <div className="flex h-40 items-end gap-[2px]" role="img" aria-label="Daily collected amounts">
            {r.daily.map((d) => (
              <div key={d.day} className="group relative flex h-full flex-1 items-end">
                <div className={`w-full rounded-t ${d.amount < 0 ? "bg-red-500" : "bg-teal-600"}`} style={{ height: `${Math.max(d.amount ? 3 : 0, (Math.abs(d.amount) / maxDay) * 100)}%` }} />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black px-2 py-1 text-xs text-white group-hover:block">
                  {new Date(d.day).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}: {money(d.amount)}</span>
              </div>
            ))}
          </div>
        )}
        {r.daily.length > 1 && <div className="flex justify-between text-xs text-muted"><span>{fmtDay(r.daily[0].day)}</span><span>{fmtDay(r.daily[r.daily.length - 1].day)}</span></div>}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3 rounded-2xl border border-line bg-panel p-4">
          <h2 className="font-semibold">How riders paid</h2>
          {!r.by_method.length ? <p className="text-sm text-muted">Nothing yet.</p> : (
            <>
              <div className="flex h-4 overflow-hidden rounded-full bg-line">
                {r.by_method.filter((m) => m.amount > 0).map((m) => <div key={m.method} className={METHOD_COLOUR[m.method] ?? "bg-slate-500"} style={{ width: `${(m.amount / methodTotal) * 100}%` }} />)}
              </div>
              <ul className="space-y-1 text-sm">
                {r.by_method.map((m) => (
                  <li key={m.method} className="flex items-center gap-2">
                    <span className={`size-2.5 rounded-full ${METHOD_COLOUR[m.method] ?? "bg-slate-500"}`} />
                    <span className="capitalize">{m.method}</span>
                    <span className="ml-auto tabular-nums">{money(m.amount)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="space-y-3 rounded-2xl border border-line bg-panel p-4">
          <h2 className="font-semibold">Bookings made</h2>
          {!r.bookings ? <p className="text-sm text-muted">No bookings in this period.</p> : (
            <ul className="space-y-1.5 text-sm">
              {Object.entries(r.bookings_by_status).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
                <li key={s} className="flex items-center gap-3">
                  <span className="w-24 capitalize">{s.replace("_", " ")}</span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-teal-600" style={{ width: `${(n / r.bookings) * 100}%` }} /></span>
                  <span className="w-8 text-right tabular-nums">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="space-y-3 rounded-2xl border border-line bg-panel p-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="font-semibold">By vehicle</h2>
          <span className="text-xs text-muted">money collected, and how much of the period each vehicle was rented</span>
        </div>
        <ul className="space-y-2.5">
          {r.by_vehicle.map((v) => {
            const use = r.period_hours ? Math.min(100, Math.round((v.hours / r.period_hours) * 100)) : 0;
            return (
              <li key={v.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 text-sm">
                <Link href={`/fleet/${v.id}`} className="plate text-xs">{v.plate}</Link>
                <span className="h-2.5 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-teal-600" style={{ width: `${(v.amount / maxVehicle) * 100}%` }} /></span>
                <span className="tabular-nums">{money(v.amount)}</span>
                <span />
                <span className="text-xs text-muted">{v.model}, rented {use}% of the time ({v.hours} h)</span>
                <span />
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3 rounded-2xl border border-line bg-panel p-4">
          <h2 className="font-semibold">Owed to you now</h2>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
            <dt>Unpaid fees (late returns, charges)</dt><dd className="tabular-nums">{money(r.unpaid_charges)}</dd>
            <dt>Reservations waiting for payment</dt><dd className="tabular-nums">{money(r.awaiting_payment)}</dd>
            <dt><Link href="/blocklist" className="hover:underline">Blocklist debts</Link></dt><dd className="tabular-nums">{money(r.blocklist_owed)}</dd>
            {r.deposits_held > 0 && <><dt className="text-muted">Deposits currently held (riders&apos; money)</dt><dd className="tabular-nums text-muted">{money(r.deposits_held)}</dd></>}
          </dl>
          {!!unpaid.data?.length && (
            <ul className="divide-y divide-line border-t border-line text-sm">
              {(unpaid.data as unknown as Unpaid[]).map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-2 py-2">
                  {u.bookings && <Link href={`/bookings/${u.bookings.id}`} className="plate text-xs">{u.bookings.reference}</Link>}
                  <span>{u.bookings?.profiles?.full_name ?? "Rider"}</span>
                  <span className="text-muted">{dt(new Date(u.created_at))}</span>
                  <span className="ml-auto font-semibold tabular-nums">{money(u.amount, u.currency)}</span>
                  <MarkCollected id={u.id} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3 rounded-2xl border border-line bg-panel p-4">
          <h2 className="font-semibold">Top riders</h2>
          {!r.top_riders.length ? <p className="text-sm text-muted">No payments in this period.</p> : (
            <ol className="space-y-1.5 text-sm">
              {r.top_riders.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <Link href={`/riders/${t.id}`} className="hover:underline">{t.name}</Link>
                  <span className="text-muted">{t.rentals} rental{t.rentals === 1 ? "" : "s"}</span>
                  <span className="ml-auto tabular-nums">{money(t.amount)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}

const fmtDay = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function Tile({ label, value, note, strong, tone }: { label: string; value: string; note?: string; strong?: boolean; tone?: "warn" }) {
  return (
    <div className={`space-y-1 rounded-2xl border p-4 ${strong ? "border-transparent bg-black text-white" : tone === "warn" ? "border-amber-500/40 bg-amber-500/10" : "border-line bg-panel"}`}>
      <div className={`text-xs ${strong ? "text-white/70" : "text-muted"}`}>{label}</div>
      <div className="font-display text-2xl font-extrabold tabular-nums">{value}</div>
      {note && <div className={`text-xs ${strong ? "text-white/70" : "text-muted"}`}>{note}</div>}
    </div>
  );
}
