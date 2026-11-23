import Link from "next/link";
import { Suspense } from "react";
import { MessageComposer } from "@/components/message-composer";
import { avatarPublicUrl, Timeline, type TimelineEntry } from "@/components/timeline";
import { requireStaff } from "@/lib/auth";
import { dt, money, parseRange } from "@/lib/format";
import { StatusBadge } from "../../status-badge";
import { CancelBooking } from "../cancel-booking";
import { baseRental, billableHours, LICENCE_CATEGORIES, lateFee, licenceCategoryFor, licenceCovers } from "@motor-rent/shared";
import { CloseRental } from "./close-rental";
import { CAR_CHECKS } from "./checks";
import { Handover } from "./handover";
import { type Claim, DamageClaimCard, DepositCard, type Extension, ExtensionRequest, ReportDamage } from "./rental-ops";

export const metadata = { title: "Booking" };

const STAGE: Record<string, string> = {
  held: "Awaiting payment", confirmed: "Confirmed", active: "On the road", overdue: "Overdue", returned: "Returned",
  damage_claim: "Damage review", closed: "Completed", expired: "Expired", cancelled: "Cancelled",
};
const PAY: Record<string, string> = {
  charge: "Charge", deposit_hold: "Deposit taken", deposit_capture: "Deposit kept", deposit_release: "Deposit returned",
  refund: "Refund", cash: "Cash payment", bank_transfer: "Bank transfer",
};
function checklistSummary(c: Record<string, string> | null) {
  if (!c) return null;
  const issues = CAR_CHECKS.filter((x) => c[x.key] === "issue").map((x) => x.label.toLowerCase());
  return issues.length ? `Checklist issues: ${issues.join(", ")}` : "Car checklist all OK";
}
function payLabel(kind: string, key: string | null) {
  if (kind !== "charge" || !key) return PAY[kind] ?? kind;
  if (key.endsWith(":late-fee")) return "Late return fee";
  if (key.endsWith(":damage")) return "Damage charge";
  if (key.includes(":ext:")) return "Extra time";
  return PAY.charge;
}

export default function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="animate-pulse text-muted">Loading…</p>}>
      <Booking params={params} />
    </Suspense>
  );
}

type B = {
  id: string; reference: string; status: string; period: string; total: number; deposit: number; currency: string; created_at: string; rider_id: string;
  vehicles: { id: string; kind: string; plate: string; make: string; model: string; odometer_km: number; engine_hours: number | null;
    price_plans: { late_fee_per_hour: number; late_grace_minutes: number; hourly: number; daily: number; weekly: number } | null } | null;
  branches: { name: string } | null;
  rider: { full_name: string | null; phone: string | null; avatar_path: string | null; kyc_status: string; licence_categories: string[] | null } | null;
};

async function Booking({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await requireStaff();
  const { data: b } = await db.from("bookings")
    .select("id, reference, status, period, total, deposit, currency, created_at, rider_id, vehicles(id, kind, plate, make, model, odometer_km, engine_hours, price_plans(late_fee_per_hour, late_grace_minutes, hourly, daily, weekly)), branches(name), rider:profiles!bookings_rider_id_fkey(full_name, phone, avatar_path, kyc_status, licence_categories)")
    .eq("id", id).maybeSingle<B>();
  if (!b) return <p role="alert" className="text-red-600">Booking not found (or not at your branch).</p>;

  const [ev, msgs, slips, insp, pays, claimRes, extRes] = await Promise.all([
    db.from("booking_events").select("id, from_status, to_status, actor, note, at").eq("booking_id", id),
    db.from("booking_messages").select("id, author, from_staff, author_name, author_avatar, body, created_at").eq("booking_id", id),
    db.from("transfer_slips").select("id, path, status, amount, reject_reason, created_at, reviewed_at, reviewed_by").eq("booking_id", id),
    db.from("inspections").select("id, phase, odometer_km, engine_hours, fuel_level, notes, staff_id, created_at, photo_paths, checklist").eq("booking_id", id),
    db.from("payments").select("id, kind, provider, amount, currency, status, recorded_by, created_at, idempotency_key, raw").eq("booking_id", id),
    db.from("damage_claims").select("items, amount, status, rider_note").eq("booking_id", id).maybeSingle<Claim>(),
    db.from("booking_extensions").select("id, new_end, status, amount, created_at").eq("booking_id", id).order("created_at"),
  ]);

  // Names for everyone who acted on this booking.
  const ids = new Set<string>();
  ev.data?.forEach((e) => e.actor && ids.add(e.actor));
  slips.data?.forEach((s) => s.reviewed_by && ids.add(s.reviewed_by));
  insp.data?.forEach((i) => ids.add(i.staff_id));
  pays.data?.forEach((p) => p.recorded_by && ids.add(p.recorded_by));
  const { data: people } = ids.size ? await db.from("profiles").select("id, full_name, role, avatar_path").in("id", [...ids]) : { data: [] };
  const person = new Map((people ?? []).map((p) => [p.id, p]));
  const riderName = b.rider?.full_name ?? "Rider";
  const who = (uid: string | null): TimelineEntry["who"] => {
    if (!uid) return { name: "System", tag: "System" };
    if (uid === b.rider_id) return { name: riderName, tag: "Rider", avatarUrl: avatarPublicUrl(b.rider?.avatar_path) };
    const p = person.get(uid);
    return { name: p?.full_name ?? "Staff", tag: "Office", avatarUrl: avatarPublicUrl(p?.avatar_path) };
  };

  const slipPaths = (slips.data ?? []).map((s) => s.path);
  const photoPaths = (insp.data ?? []).flatMap((i) => (i.photo_paths as string[]).slice(0, 4));
  const [slipUrls, photoUrls] = await Promise.all([
    slipPaths.length ? db.storage.from("payment-slips").createSignedUrls(slipPaths, 1800) : { data: [] },
    photoPaths.length ? db.storage.from("inspections").createSignedUrls(photoPaths, 1800) : { data: [] },
  ]);
  const signed = new Map([...(slipUrls.data ?? []), ...(photoUrls.data ?? [])].map((s) => [s.path, s.signedUrl]));

  const entries: TimelineEntry[] = [];
  for (const e of ev.data ?? []) {
    entries.push({ key: `e${e.id}`, at: new Date(e.at), who: who(e.actor), kind: "status", from: e.from_status ? STAGE[e.from_status] ?? e.from_status : null,
      to: STAGE[e.to_status] ?? e.to_status, note: e.note });
  }
  for (const m of msgs.data ?? []) {
    entries.push({ key: `m${m.id}`, at: new Date(m.created_at), kind: "message", body: m.body,
      who: { name: m.author_name ?? "—", tag: m.from_staff ? "Office" : "Rider", avatarUrl: avatarPublicUrl(m.author_avatar) } });
  }
  for (const s of slips.data ?? []) {
    const url = signed.get(s.path);
    entries.push({ key: `s${s.id}`, at: new Date(s.created_at), who: who(b.rider_id), kind: "log", title: "Uploaded a bank transfer slip",
      href: s.status === "pending" ? "/transfers" : undefined, images: url ? [{ url, label: "Transfer slip" }] : undefined });
    if (s.reviewed_at) entries.push({ key: `s${s.id}r`, at: new Date(s.reviewed_at), who: who(s.reviewed_by), kind: "log",
      tone: s.status === "approved" ? "success" : "danger",
      title: s.status === "approved" ? `Approved transfer slip${s.amount != null ? ` · ${money(s.amount, b.currency)}` : ""}` : "Rejected transfer slip",
      note: s.reject_reason });
  }
  for (const i of insp.data ?? []) {
    entries.push({ key: `i${i.id}`, at: new Date(i.created_at), who: who(i.staff_id), kind: "log", tone: "neutral",
      title: i.phase === "pickup" ? "Handed over the vehicle (pickup inspection)" : "Collected the vehicle (return inspection)",
      changes: [
        { field: "Odometer", from: "", to: `${i.odometer_km} km` },
        ...(i.engine_hours != null ? [{ field: "Engine hours", from: "", to: `${i.engine_hours} h` }] : []),
        { field: "Fuel", from: "", to: `${i.fuel_level}/8` },
      ],
      note: [i.notes, checklistSummary(i.checklist as Record<string, string> | null)].filter(Boolean).join(" · ") || null,
      images: (i.photo_paths as string[]).slice(0, 4).flatMap((p) => (signed.get(p) ? [{ url: signed.get(p)!, label: `${i.phase} photo` }] : [])) });
  }
  for (const p of pays.data ?? []) {
    entries.push({ key: `p${p.id}`, at: new Date(p.created_at), who: who(p.recorded_by), kind: "log",
      tone: p.status === "succeeded" ? "success" : p.status === "failed" ? "danger" : "warning",
      title: `${payLabel(p.kind, p.idempotency_key)} · ${money(p.amount, p.currency)} · ${(p.raw as { paid_from?: string } | null)?.paid_from === "deposit" ? "paid from deposit" : p.status}${p.provider === "manual" && p.status === "pending" ? (p.kind === "refund" ? " (pay back to the rider)" : " (collect in person)") : ""}` });
  }

  const r = parseRange(b.period);
  const now = Date.now();
  // The rider's licence must cover this vehicle (A two-wheelers, B cars), set at the ID check.
  const need = b.vehicles ? licenceCategoryFor(b.vehicles.kind) : null;
  const licenceProblem = need && b.rider?.kyc_status === "approved" && !licenceCovers(b.rider.licence_categories, b.vehicles!.kind)
    ? `${riderName}'s licence is verified for ${(b.rider.licence_categories ?? []).join(", ") || "no categories"}; this vehicle needs category ${LICENCE_CATEGORIES[need].label}. If their licence has it, add it on their rider page.`
    : null;
  const plan = b.vehicles?.price_plans;
  // Live warnings: missed pickup, and how late an overdue bike is (with the fee so far and who is waiting for it).
  const pickupMissed = b.status === "confirmed" && r && now > r.start.getTime() + 60 * 60_000;
  const overdueFee = b.status === "overdue" && r && plan
    ? lateFee(r.end, new Date(now), { graceMinutes: plan.late_grace_minutes, perStartedHour: plan.late_fee_per_hour, cap: plan.daily }) : 0;
  const lateHours = r ? Math.max(0, Math.floor((now - r.end.getTime()) / 3_600_000)) : 0;
  const { data: nextUp } = b.status === "overdue" && b.vehicles && r
    ? await db.from("bookings").select("id, reference, period").eq("vehicle_id", b.vehicles.id).in("status", ["held", "confirmed"])
        .rangeGte("period", `[${r.end.toISOString()},${r.end.toISOString()}]`).order("period").limit(1).maybeSingle<{ id: string; reference: string; period: string }>()
    : { data: null };
  const nextRange = nextUp ? parseRange(nextUp.period) : null;
  const pending = (pays.data ?? []).filter((p) => p.status === "pending" && p.kind === "charge");
  const outstanding = pending.length ? pending.map((p) => money(p.amount, p.currency)).join(" + ") : null;
  const owed = pending.reduce((s, p) => s + p.amount, 0);
  const claim = claimRes.data;
  const exts = (extRes.data ?? []) as Extension[];
  const ask = exts.find((e) => e.status === "pending");
  // Price for the extra time: the whole rental at the new length, less what the current length costs.
  const askPrice = ask && r && plan
    ? Math.max(0, baseRental(billableHours(r.start, new Date(ask.new_end)), plan) - baseRental(billableHours(r.start, r.end), plan)) : 0;
  const payKey = (k: string) => (pays.data ?? []).find((p) => p.idempotency_key === `${b.id}:${k}` && p.status === "succeeded");
  const depHeld = payKey("deposit");
  const depBack = payKey("deposit-back"); const depKept = payKey("deposit-kept");
  const depSettled = depBack || depKept
    ? `Returned ${money(depBack?.amount ?? 0, b.currency)}${depKept ? `, kept ${money(depKept.amount, b.currency)}` : ""}.` : null;
  const back = ["returned", "damage_claim", "closed", "cancelled"].includes(b.status);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <section className="space-y-4">
        <Link href="/bookings" className="text-sm text-muted hover:underline">← Bookings</Link>
        <div className="space-y-3 rounded-2xl border border-line bg-panel p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="plate text-2xl">{b.reference}</h1>
            <StatusBadge status={b.status} />
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Rider</dt>
            <dd><Link href={`/riders/${b.rider_id}`} className="font-medium hover:underline">{riderName}</Link> <span className="text-muted">{b.rider?.phone}</span>
              {b.rider?.kyc_status !== "approved" && <span className="ml-2 text-xs text-amber-700">not verified</span>}</dd>
            <dt className="text-muted">Vehicle</dt>
            <dd>{b.vehicles ? <Link href={`/fleet/${b.vehicles.id}`} className="hover:underline">{b.vehicles.plate} · {b.vehicles.make} {b.vehicles.model}</Link> : "—"}</dd>
            <dt className="text-muted">Pickup</dt><dd className="tabular-nums">{r ? dt(r.start) : "—"}</dd>
            <dt className="text-muted">Return by</dt><dd className="tabular-nums">{r ? dt(r.end) : "—"}</dd>
            <dt className="text-muted">Branch</dt><dd>{b.branches?.name ?? "—"}</dd>
            <dt className="text-muted">Total</dt><dd className="font-semibold tabular-nums">{money(b.total, b.currency)} <span className="font-normal text-muted">· deposit {money(b.deposit, b.currency)}</span></dd>
            <dt className="text-muted">Booked</dt><dd className="tabular-nums">{dt(new Date(b.created_at))}</dd>
          </dl>
          {(b.status === "held" || b.status === "confirmed") && (
            <div className="border-t border-line pt-3"><CancelBooking id={b.id} reference={b.reference} paid={b.status === "confirmed"} total={b.total} currency={b.currency} start={r?.start.toISOString()} /></div>
          )}
        </div>
      </section>
      <section className="space-y-4">
        {pickupMissed && (
          <div role="status" className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            <p className="font-semibold">Pickup missed</p>
            <p className="text-muted">The rider was due at {dt(r!.start)}. Contact them; if they aren’t coming, cancel as a no-show so the bike is free again. The refund follows the policy (nothing after pickup time); raise it if the delay was ours.</p>
            <div className="mt-2"><CancelBooking id={b.id} reference={b.reference} paid total={b.total} currency={b.currency} start={r!.start.toISOString()} defaultReason="No-show" label="Cancel as no-show" /></div>
          </div>
        )}
        {b.status === "overdue" && (
          <div role="status" className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm">
            <p className="font-semibold">Overdue by {lateHours} h{overdueFee ? ` · late fee so far ${money(overdueFee, b.currency)}` : ""}</p>
            <p className="text-muted">Due back {r ? dt(r.end) : "—"}. The rider has been sent a WhatsApp reminder.</p>
            {nextUp && <p className="mt-1">Next rental on this bike: <Link href={`/bookings/${nextUp.id}`} className="font-semibold underline">{nextUp.reference}</Link>{nextRange ? `, pickup ${dt(nextRange.start)}` : ""}. Warn that rider or move them to another bike.</p>}
          </div>
        )}
        {ask && r && <ExtensionRequest ext={ask} currentEnd={r.end.toISOString()} quoted={askPrice} currency={b.currency} />}
        {claim && <DamageClaimCard id={b.id} claim={claim} currency={b.currency} />}
        {(b.status === "returned" || (b.status === "damage_claim" && claim && claim.status !== "open" && claim.status !== "disputed")) && <CloseRental id={b.id} outstanding={outstanding} />}
        {b.status === "returned" && !claim && <ReportDamage id={b.id} currency={b.currency} />}
        {b.deposit > 0 && b.status !== "held" && b.status !== "expired" && (b.status !== "cancelled" || depHeld) && (
          <DepositCard id={b.id} deposit={b.deposit} currency={b.currency} held={depHeld ? { provider: depHeld.provider } : null}
            settled={depSettled} canReturn={back} owed={owed} />
        )}
        {(b.status === "confirmed" || b.status === "active" || b.status === "overdue") && (
          <Handover bookingId={b.id} phase={b.status === "confirmed" ? "pickup" : "return"} currency={b.currency} riderName={riderName}
            lastOdometer={b.vehicles?.odometer_km ?? null} lastEngineHours={b.vehicles?.engine_hours != null ? Number(b.vehicles.engine_hours) : null}
            isCar={b.vehicles?.kind === "car"} licenceProblem={licenceProblem} />
        )}
        <h2 className="text-lg font-semibold">History &amp; messages</h2>
        <MessageComposer bookingId={b.id} />
        <Timeline entries={entries} />
      </section>
    </div>
  );
}
