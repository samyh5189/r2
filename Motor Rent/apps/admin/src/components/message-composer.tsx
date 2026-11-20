"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/** Reply box for a booking conversation. Also refreshes the page live when the rider writes. */
export function MessageComposer({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const db = supabaseBrowser();
    const ch = db.channel(`admin-booking-${bookingId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "booking_messages", filter: `booking_id=eq.${bookingId}` }, () => router.refresh())
      .subscribe();
    return () => { db.removeChannel(ch); };
  }, [bookingId, router]);

  async function send() {
    if (!body.trim()) return;
    setBusy(true); setError(null);
    const { error } = await supabaseBrowser().from("booking_messages").insert({ booking_id: bookingId, body });
    setBusy(false);
    if (error) return setError(/too many/.test(error.message) ? "Too many messages, wait a minute." : error.message);
    setBody("");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={3}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
        placeholder="Message the rider… (they see this in their app)"
        className="w-full rounded-xl border-[1.5px] border-line bg-panel px-3 py-2 outline-none focus:border-accent" />
      <div className="flex items-center gap-3">
        <button type="button" onClick={send} disabled={busy || !body.trim()} className="rounded-xl bg-accent px-4 py-2 font-semibold text-white disabled:opacity-50">
          {busy ? "Sending…" : "Send message"}</button>
        <span className="text-xs text-muted">Ctrl/⌘ + Enter to send</span>
        {error && <span role="alert" className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
