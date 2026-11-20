"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/** Opens the office's own WhatsApp with the message typed in; then staff confirm it went. */
export function SendByHand({ id, phone, body }: { id: number; phone: string; body: string }) {
  const router = useRouter();
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const href = `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(body)}`;
  async function mark() {
    setBusy(true);
    const { error } = await supabaseBrowser().rpc("mark_whatsapp_sent", { p_id: id });
    setBusy(false);
    if (!error) router.refresh();
  }
  return (
    <span className="flex items-center gap-2">
      <a href={href} target="_blank" rel="noreferrer" onClick={() => setOpened(true)}
        className="rounded-lg bg-[#1f8a4c] px-3 py-1.5 text-xs font-semibold text-white">Send</a>
      <button type="button" onClick={mark} disabled={busy}
        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${opened ? "border-accent text-accent" : "border-line text-muted"}`}>
        {busy ? "Saving…" : "Mark sent"}</button>
    </span>
  );
}
