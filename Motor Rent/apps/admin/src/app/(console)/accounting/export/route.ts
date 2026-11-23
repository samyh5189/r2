import { requireStaff } from "@/lib/auth";
import { periodFor } from "../period";

/** Payments ledger for the chosen period as CSV (managers and owners). */
export async function GET(req: Request) {
  const { db, user } = await requireStaff();
  if (user.role === "staff") return new Response("Forbidden", { status: 403 });
  const period = periodFor(new URL(req.url).searchParams.get("p") ?? "month");
  const { data } = await db.from("payments")
    .select("created_at, updated_at, kind, provider, status, amount, currency, bookings(reference, guest_name, profiles(full_name), vehicles(plate))")
    .gte("updated_at", period.from.toISOString()).lt("updated_at", period.to.toISOString()).order("updated_at");
  const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const mv = (iso: string) => new Date(new Date(iso).getTime() + 5 * 3_600_000).toISOString().replace("T", " ").slice(0, 16);
  type Row = { created_at: string; updated_at: string; kind: string; provider: string | null; status: string; amount: number; currency: string; bookings: { reference: string; guest_name: string | null; profiles: { full_name: string | null } | null; vehicles: { plate: string } | null } | null };
  const lines = [["Date (Maldives)", "Booking", "Rider", "Vehicle", "Type", "Method", "Status", "Amount", "Currency"].join(",")];
  for (const r of (data ?? []) as unknown as Row[]) {
    const amount = (r.kind === "refund" ? -r.amount : r.amount) / 100;
    lines.push([mv(r.updated_at), r.bookings?.reference, r.bookings?.profiles?.full_name ?? r.bookings?.guest_name, r.bookings?.vehicles?.plate, r.kind, r.provider, r.status, amount.toFixed(2), r.currency].map(esc).join(","));
  }
  const name = `rent-a-motor-payments-${period.from.toISOString().slice(0, 10)}.csv`;
  return new Response(lines.join("\n") + "\n", { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
}
