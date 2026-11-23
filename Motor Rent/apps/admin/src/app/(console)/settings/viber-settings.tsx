"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/** Connect the EasyRide Viber bot: Viber sends its events to our function, riders see "Get the details on Viber". */
export function ViberSettings({ ready, uri, canEdit }: { ready: boolean; uri: string | null; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function connect() {
    setBusy(true); setMsg(null);
    const { data, error } = await supabaseBrowser().functions.invoke("viber-bot", { body: { action: "setup" } });
    let text = data?.error?.message as string | undefined;
    if (error) text = (await (error as { context?: Response }).context?.json().catch(() => null))?.error?.message ?? error.message;
    setBusy(false);
    if (text) return setMsg({ ok: false, text });
    setMsg({ ok: true, text: `Connected to ${data.name}${data.subscribers != null ? ` (${data.subscribers} subscribers)` : ""}.` });
    router.refresh();
  }
  return (
    <section id="viber" className="space-y-3 rounded-2xl border border-line bg-panel p-5">
      <div>
        <h2 className="text-lg font-semibold">Viber</h2>
        <p className="text-sm text-muted">
          After booking, riders can open our Viber bot and get the booking details there, plus updates: confirmed, pickup and return
          reminders, overdue, cancelled. Viber only lets the bot message people who open the chat, so it works from the button on the booking.
        </p>
      </div>
      <p className="text-sm">{ready ? <>Connected{uri ? <> · <a className="text-accent hover:underline" href={`viber://pa?chatURI=${uri}`}>open the bot</a></> : null}</> : "Not connected."}</p>
      {canEdit && (
        <>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>Create the bot at partners.viber.com and copy its token.</li>
            <li>Save the token as the function secret VIBER_AUTH_TOKEN (supabase secrets set VIBER_AUTH_TOKEN=…).</li>
            <li>Press Connect. Press it again if you change the token.</li>
          </ol>
          <button type="button" onClick={connect} disabled={busy} className="btn btn-primary">{busy ? "Connecting…" : ready ? "Reconnect" : "Connect Viber bot"}</button>
        </>
      )}
      {msg && <p role="status" className={`text-sm ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"}`}>{msg.text}</p>}
    </section>
  );
}
