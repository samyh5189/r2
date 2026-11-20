import Link from "next/link";
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import { dt } from "@/lib/format";
import { SendByHand } from "./send-by-hand";

export const metadata = { title: "WhatsApp" };

const STATUS: Record<string, [string, string]> = {
  queued: ["Waiting", "bg-amber-500/15 text-amber-700 dark:text-amber-400"],
  sent: ["Sent", "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"],
  manual: ["Sent by hand", "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"],
  failed: ["Failed", "bg-red-500/15 text-red-600"],
  expired: ["Not sent", "bg-line text-muted"],
};

export default function WhatsAppPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">WhatsApp</h1>
        <p className="text-sm text-muted">Every booking update, reminder and alert the system writes. Once WhatsApp is connected in Settings, messages to confirmed numbers go out on their own; the rest wait here for you to send.</p>
      </div>
      <Suspense fallback={<p className="animate-pulse text-muted">Loading…</p>}>
        <Outbox />
      </Suspense>
    </div>
  );
}

async function Outbox() {
  const { db } = await requireStaff();
  const [{ data, error }, { data: site }] = await Promise.all([
    db.from("whatsapp_outbox").select("id, to_phone, to_name, audience, to_verified, body, status, error, booking_id, created_at, sent_at, bookings(reference)")
      .order("created_at", { ascending: false }).limit(150),
    db.from("site_settings").select("whatsapp_ready").single(),
  ]);
  if (error) return <p role="alert" className="text-red-600">Could not load messages.</p>;
  const ready = !!site?.whatsapp_ready;
  type Row = { id: number; to_phone: string; to_name: string | null; audience: "rider" | "staff"; to_verified: boolean; body: string; status: string; error: string | null; booking_id: string | null; created_at: string; sent_at: string | null; bookings: { reference: string } | null };
  const rows = (data ?? []) as unknown as Row[];
  const handSend = (r: Row) => (r.status === "queued" || r.status === "failed" || r.status === "expired") && (!ready || !r.to_verified || r.status !== "queued");

  return (
    <>
      {!ready && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          WhatsApp isn&apos;t connected, so nothing is sent automatically. Tap <b>Send</b> to open WhatsApp with the message ready, then <b>Mark sent</b>. To send automatically, connect WhatsApp in <Link href="/settings#whatsapp" className="font-semibold underline">Settings</Link>.
        </p>
      )}
      {!rows.length ? <p className="text-muted">No messages yet. They appear here as riders book, pay, message and return.</p> : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const [label, cls] = STATUS[r.status] ?? [r.status, ""];
            return (
              <li key={r.id} className="space-y-2 rounded-xl border border-line bg-panel p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{r.to_name ?? r.to_phone}</span>
                  <span className="text-muted">{r.to_phone}</span>
                  <span className="rounded bg-line/60 px-1.5 text-xs">{r.audience === "rider" ? "Rider" : "Office alert"}</span>
                  {!r.to_verified && <span className="text-xs text-muted">number not confirmed</span>}
                  {r.booking_id && r.bookings && <Link href={`/bookings/${r.booking_id}`} className="plate text-[11px]">{r.bookings.reference}</Link>}
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{r.body}</p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                  <span className="tabular-nums">{dt(new Date(r.created_at))}</span>
                  {r.sent_at && <span className="tabular-nums">sent {dt(new Date(r.sent_at))}</span>}
                  {r.error && r.status !== "manual" && <span className="text-red-600">{r.error}</span>}
                  {handSend(r) && <span className="ml-auto"><SendByHand id={r.id} phone={r.to_phone} body={r.body} /></span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
