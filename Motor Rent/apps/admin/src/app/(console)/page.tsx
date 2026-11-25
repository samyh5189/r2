import Link from "next/link";
import { Suspense } from "react";
import { Icon, type IconName } from "@/components/icons";
import { requireStaff } from "@/lib/auth";
import { dt, money, parseRange } from "@/lib/format";
import { StatusBadge } from "./status-badge";

export const metadata = { title: "Today" };

const MV = 5 * 3_600_000; // Maldives is UTC+5; the server runs in UTC.
const DAY = 86_400_000;

export default function TodayPage() {
  return (
    <Suspense fallback={<p className="animate-pulse text-muted">Loading…</p>}>
      <Today />
    </Suspense>
  );
}

async function Today() {
  const { db, user } = await requireStaff();
  const now = Date.now();
  const dayStart = new Date(Math.floor((now + MV) / DAY) * DAY - MV);
  const dayEnd = new Date(dayStart.getTime() + DAY);
  const weekStart = new Date(dayStart.getTime() - 6 * DAY);
  const today = `[${dayStart.toISOString()},${dayEnd.toISOString()})`;
  const hour = new Date(now + MV).getUTCHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const [live, payments, toCall, onRoad] = await Promise.all([
    db.from("bookings")
      .select("id, reference, status, period, guest_name, guest_phone, handover, vehicles(plate, model), profiles!bookings_rider_id_fkey(full_name, phone, avatar_path)")
      .in("status", ["held", "confirmed", "active", "overdue"])
      .overlaps("period", today)
      .order("period"),
    // Last 7 Maldives days, for the chart; today's slice is the headline figure.
    db.from("payments").select("amount, kind, created_at").eq("status", "succeeded").gte("created_at", weekStart.toISOString()),
    // Unpaid bookings made without an account: the office calls to confirm and take payment.
    db.from("bookings")
      .select("id, reference, status, period, guest_name, guest_phone, handover, vehicles(plate, model), profiles!bookings_rider_id_fkey(full_name, phone, avatar_path)")
      .eq("status", "held").is("rider_id", null).order("held_until"),
    db.from("bookings").select("id", { count: "exact", head: true }).in("status", ["active", "overdue"]),
  ]);

  type Row = { id: string; reference: string; status: string; period: string; guest_name: string | null; guest_phone: string | null; handover: string;
    vehicles: { plate: string; model: string } | null; profiles: { full_name: string | null; phone: string | null } | null };
  const rows = (live.data ?? []) as unknown as Row[];
  const inDay = (d: Date | undefined) => !!d && d >= dayStart && d < dayEnd;
  const pickups = rows.filter((r) => r.status === "confirmed" && inDay(parseRange(r.period)?.start));
  const returns = rows.filter((r) => (r.status === "active" || r.status === "overdue") && inDay(parseRange(r.period)?.end));
  const overdue = rows.filter((r) => r.status === "overdue");

  const net = (p: { amount: number; kind: string }) => (p.kind === "refund" ? -p.amount : p.amount);
  const days = Array.from({ length: 7 }, (_, i) => ({ start: weekStart.getTime() + i * DAY, total: 0 }));
  for (const p of payments.data ?? []) {
    const i = Math.floor((new Date(p.created_at).getTime() - weekStart.getTime()) / DAY);
    if (days[i]) days[i].total += net(p);
  }
  const revenue = days[6]!.total;
  const week = days.reduce((a, d) => a + d.total, 0);

  const stats: { label: string; value: string | number; icon: IconName; tone: string; alert?: boolean }[] = [
    { label: "Pickups today", value: pickups.length, icon: "pickup", tone: "bg-blue-500/12 text-blue-600 dark:text-blue-300" },
    { label: "Returns today", value: returns.length, icon: "return", tone: "bg-violet-500/12 text-violet-600 dark:text-violet-300" },
    { label: "Overdue now", value: overdue.length, icon: "alert", tone: "bg-rose-500/12 text-rose-600 dark:text-rose-300", alert: overdue.length > 0 },
    { label: "On the road", value: onRoad.count ?? 0, icon: "bike", tone: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300" },
  ];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-muted">{greeting}, {(user.name ?? "there").split(" ")[0]} 👋</p>
        <h1 className="text-3xl tracking-tight">Today</h1>
      </header>

      {(live.error || payments.error) && <p role="alert" className="text-red-600">Some data failed to load. Refresh to retry.</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="hero-card p-5 sm:p-6">
          <HeroArt />
          <div className="relative max-w-[60%] space-y-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-white/85"><Icon name="wallet" className="size-4" />Taken today (net)</p>
            <p className="text-4xl font-extrabold tracking-tight tabular-nums">{money(revenue)}</p>
            <p className="text-sm text-white/80">{money(week)} over the last 7 days</p>
          </div>
          <div className="relative mt-5 flex flex-wrap gap-2">
            <Link href="/accounting" className="btn btn-sm btn-light">Accounting <Icon name="arrow" className="size-4" /></Link>
            <Link href="/bookings" className="btn btn-sm border-white/40 bg-white/10 text-white hover:bg-white/20">Bookings</Link>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3">
          {stats.map((s) => (
            <div key={s.label} className={`card flex flex-col items-center p-4 text-center ${s.alert ? "ring-2 ring-rose-400/70" : ""}`}>
              <span className={`icon-chip ${s.tone}`}><Icon name={s.icon} /></span>
              <div className="mt-2 text-xs font-medium text-muted">{s.label}</div>
              <div className="text-2xl font-extrabold tabular-nums">{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      <WeekChart days={days} />

      {!!toCall.data?.length && <BookingList title="Booked without an account" hint="Call to confirm and take payment" rows={toCall.data as unknown as Row[]} empty="" />}
      <BookingList title="Overdue" hint="Call these riders" rows={overdue} empty="Nothing overdue." />
      <BookingList title="Pickups" rows={pickups} empty="No pickups scheduled today." />
      <BookingList title="Returns" rows={returns} empty="No returns due today." />
    </div>
  );

  function BookingList({ title, hint, rows, empty }: { title: string; hint?: string; rows: Row[]; empty: string }) {
    return (
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg">{title} <span className="ml-1 text-sm font-semibold text-muted">{rows.length}</span></h2>
          {hint ? <span className="text-sm text-muted">{hint}</span> : <Link href="/bookings" className="text-sm font-semibold text-accent">View all</Link>}
        </div>
        {rows.length === 0 ? <p className="card px-4 py-5 text-sm text-muted">{empty}</p> : (
          <ul className="grid gap-3 md:grid-cols-2">
            {rows.map((r) => {
              const p = parseRange(r.period);
              const name = r.profiles?.full_name ?? r.guest_name ?? "—";
              const phone = r.profiles?.phone ?? r.guest_phone;
              const act = r.status === "confirmed" ? "Hand over" : r.status === "active" || r.status === "overdue" ? "Collect" : null;
              return (
                <li key={r.id} className="card space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid size-11 flex-none place-items-center rounded-full bg-accent-soft text-base font-bold text-accent">{name.slice(0, 1)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold">{name}</div>
                      <div className="truncate text-sm text-muted">{r.vehicles?.model} · {r.vehicles?.plate}</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={r.status} />
                        {!r.profiles && r.guest_name && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">No account</span>}
                        {r.handover === "delivery" && <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:text-sky-300">Delivery</span>}
                      </div>
                    </div>
                    <Link href={`/bookings/${r.id}#handover`} className="plate text-xs">{r.reference}</Link>
                  </div>
                  {p && (
                    <dl className="grid grid-cols-2 divide-x divide-line rounded-xl bg-background px-1 py-2 text-sm">
                      <div className="px-3"><dt className="text-xs text-muted">From</dt><dd className="font-semibold tabular-nums">{dt(p.start)}</dd></div>
                      <div className="px-3"><dt className="text-xs text-muted">To</dt><dd className="font-semibold tabular-nums">{dt(p.end)}</dd></div>
                    </dl>
                  )}
                  <div className="flex gap-2">
                    {phone && <a href={`tel:${phone.replace(/\s/g, "")}`} className="btn btn-secondary btn-sm flex-1"><Icon name="phone" className="size-4" />Call</a>}
                    <Link href={`/bookings/${r.id}${act ? "#handover" : ""}`} className="btn btn-primary btn-sm flex-1">{act ?? "Details"}<Icon name="arrow" className="size-4" /></Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }
}

/** Last 7 days of net takings as a soft area line, today highlighted. */
function WeekChart({ days }: { days: { start: number; total: number }[] }) {
  const W = 640, H = 180, P = { l: 8, r: 8, t: 28, b: 26 };
  const max = Math.max(1, ...days.map((d) => d.total));
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / (days.length - 1);
  const y = (v: number) => P.t + (1 - Math.max(0, v) / max) * (H - P.t - P.b);
  const pts = days.map((d, i) => [x(i), y(d.total)] as const);
  const line = pts.map(([a, b], i) => {
    if (!i) return `M${a},${b}`;
    const [pa, pb] = pts[i - 1]!; const cx = (pa + a) / 2;
    return `C${cx},${pb} ${cx},${b} ${a},${b}`;
  }).join(" ");
  const area = `${line} L${x(days.length - 1)},${H - P.b} L${x(0)},${H - P.b} Z`;
  const label = (t: number) => new Date(t + MV).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  const last = pts[pts.length - 1]!;
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base">Takings this week</h2>
        <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted">Last 7 days</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-auto w-full" role="img" aria-label={`Net takings per day: ${days.map((d) => `${label(d.start)} ${money(d.total)}`).join(", ")}`}>
        <defs>
          <linearGradient id="wk" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".22" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient>
        </defs>
        {[0, 0.5, 1].map((f) => <line key={f} x1={P.l} x2={W - P.r} y1={P.t + f * (H - P.t - P.b)} y2={P.t + f * (H - P.t - P.b)} stroke="var(--line)" strokeDasharray="3 4" />)}
        <path d={area} fill="url(#wk)" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
        {pts.map(([a, b], i) => <circle key={i} cx={a} cy={b} r={i === pts.length - 1 ? 5 : 3.5} fill="var(--panel)" stroke="var(--accent)" strokeWidth="2" />)}
        <line x1={last[0]} x2={last[0]} y1={last[1]} y2={H - P.b} stroke="var(--accent)" strokeOpacity=".35" />
        <g transform={`translate(${Math.min(last[0], W - 60)},${Math.max(14, last[1] - 14)})`}>
          <rect x="-56" y="-13" width="112" height="22" rx="11" fill="var(--panel)" stroke="var(--line)" />
          <text textAnchor="middle" y="2.5" fontSize="11" fontWeight="700" fill="var(--foreground)">{money(days[days.length - 1]!.total)}</text>
        </g>
        {days.map((d, i) => <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"} fontSize="11" fill="var(--muted)">{label(d.start)}</text>)}
      </svg>
    </section>
  );
}

/** Scooter line-drawing for the hero card (decorative). */
function HeroArt() {
  return (
    <svg viewBox="0 0 200 140" aria-hidden className="pointer-events-none absolute -bottom-4 -right-4 w-48 opacity-95 sm:w-56">
      <circle cx="150" cy="40" r="44" fill="#fff" fillOpacity=".08" />
      <circle cx="40" cy="120" r="30" fill="#fff" fillOpacity=".06" />
      <g fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="52" cy="104" r="18" strokeOpacity=".9" />
        <circle cx="152" cy="104" r="18" strokeOpacity=".9" />
        <path d="M52 104h44l18-34h22l16 34" strokeOpacity=".9" />
        <path d="M136 70l-8-26h-14M128 44h16" strokeOpacity=".9" />
        <path d="M70 86h40c6 0 10-4 10-10" strokeOpacity=".7" />
      </g>
      <rect x="64" y="70" width="40" height="12" rx="6" fill="#fff" fillOpacity=".85" />
    </svg>
  );
}
