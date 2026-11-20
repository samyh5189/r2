"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

const field = "w-full rounded-xl border-[1.5px] border-line bg-panel px-3 py-2 outline-none transition focus:border-accent";
const btn = "rounded-xl bg-black px-4 py-2 font-semibold text-white ring-1 ring-inset ring-white/60 disabled:opacity-40";

function toE164(raw: string) {
  const s = raw.replace(/[\s()-]/g, "");
  const e = /^\d{7}$/.test(s) ? `+960${s}` : s.startsWith("00") ? `+${s.slice(2)}` : s;
  return /^\+[1-9]\d{6,14}$/.test(e) ? e : null;
}
async function fnError(error: unknown) {
  const ctx = (error as { context?: Response }).context;
  const body = ctx ? await ctx.json().catch(() => null) : null;
  return body?.error?.message ?? "Something went wrong.";
}

/** Each staff member's own number for office alerts (new bookings, slips, documents, rider messages, overdue). */
export function MyWhatsApp({ userId, number, verified, alerts, ready }: { userId: string; number: string | null; verified: boolean; alerts: boolean; ready: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(number ?? "");
  const [on, setOn] = useState(alerts);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const e164 = toE164(value);
  const db = supabaseBrowser();

  async function save(ev: React.FormEvent) {
    ev.preventDefault(); setBusy(true); setMsg(null);
    const changed = e164 !== number;
    if (ready && changed && e164) {
      const { error } = await db.functions.invoke("whatsapp-otp", { body: { action: "send", phone: e164, purpose: "link" } });
      if (error) setMsg({ ok: false, text: await fnError(error) }); else setSentTo(e164);
      if (on !== alerts) await db.from("profiles").update({ whatsapp_alerts: on }).eq("id", userId);
    } else {
      const { error } = await db.from("profiles").update({ whatsapp: e164, whatsapp_alerts: on }).eq("id", userId);
      setMsg(error ? { ok: false, text: "Could not save." } : { ok: true, text: "Saved" });
      if (!error) router.refresh();
    }
    setBusy(false);
  }
  async function confirm() {
    setBusy(true); setMsg(null);
    const { error } = await db.functions.invoke("whatsapp-otp", { body: { action: "verify", phone: sentTo, code, purpose: "link" } });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: await fnError(error) });
    setSentTo(null); setMsg({ ok: true, text: "Number confirmed" }); router.refresh();
  }

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-panel p-4">
      <div>
        <h3 className="font-semibold">Your alerts</h3>
        <p className="text-sm text-muted">New reservations, transfer slips, documents to check, rider messages and overdue rentals for your branch.{number && ` Now: ${number}${verified ? " (confirmed)" : ready ? " (not confirmed, so alerts wait in the WhatsApp page)" : ""}.`}</p>
      </div>
      {sentTo ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="space-y-1"><span className="text-xs font-medium text-muted">Code sent to {sentTo} on WhatsApp</span>
            <input className={`${field} tracking-[0.5em]`} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
          <button type="button" className={btn} disabled={code.length !== 6 || busy} onClick={confirm}>Confirm</button>
        </div>
      ) : (
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <label className="space-y-1"><span className="text-xs font-medium text-muted">Your WhatsApp number</span>
            <input className={field} value={value} onChange={(e) => setValue(e.target.value)} placeholder="7771234" inputMode="tel" /></label>
          <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> Send me alerts</label>
          <button className={btn} disabled={busy || (!!value && !e164)}>{ready && e164 && e164 !== number ? "Send code" : "Save"}</button>
        </form>
      )}
      {msg && <p role="status" className={`text-sm ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>}
    </div>
  );
}

/** Owner: connect WhatsApp's official Business Platform (Cloud API). The token is kept in the database vault. */
export function ConnectWhatsApp({ ready, isOwner }: { ready: boolean; isOwner: boolean }) {
  const router = useRouter();
  const [id, setId] = useState("");
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const db = supabaseBrowser();

  async function connect(ev: React.FormEvent) {
    ev.preventDefault();
    const { error } = await db.rpc("set_whatsapp_config", { p_phone_number_id: id, p_token: token });
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Connected. Messages to confirmed numbers now send automatically." });
    if (!error) { setToken(""); router.refresh(); }
  }
  async function disconnect() {
    const { error } = await db.rpc("clear_whatsapp_config");
    if (!error) router.refresh();
  }

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">Automatic sending</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ready ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-line text-muted"}`}>{ready ? "Connected" : "Not connected"}</span>
      </div>
      <p className="text-sm text-muted">
        Without this, every message waits on the WhatsApp page for staff to send from the office phone. Connected, the system sends them itself and riders can sign in with a WhatsApp code.
      </p>
      {isOwner ? (ready ? (
        <button type="button" onClick={disconnect} className="text-sm font-semibold text-red-600">Disconnect WhatsApp</button>
      ) : (
        <>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">How to connect (about 30 minutes, once)</summary>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted">
              <li>At business.facebook.com, create a Meta Business account and verify the business.</li>
              <li>In developers.facebook.com, create an app, add WhatsApp, and add your business number. Use a number that isn&apos;t already on the WhatsApp app.</li>
              <li>In WhatsApp Manager, create three message templates in English:
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  <li><b>rm_rider_update</b>, category Utility: <i>Rent a Motor: {"{{1}}"} Message us in the app if you need anything.</i></li>
                  <li><b>rm_staff_alert</b>, category Utility: <i>Rent a Motor office: {"{{1}}"} Open the admin console for details.</i></li>
                  <li><b>rm_login_code</b>, category Authentication, with a Copy code button.</li>
                </ul></li>
              <li>Create a System User with a permanent token that has whatsapp_business_messaging permission, then paste its token and the Phone number ID below.</li>
            </ol>
          </details>
          <form onSubmit={connect} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
            <label className="space-y-1"><span className="text-xs font-medium text-muted">Phone number ID</span>
              <input className={field} inputMode="numeric" value={id} onChange={(e) => setId(e.target.value.trim())} /></label>
            <label className="space-y-1"><span className="text-xs font-medium text-muted">Permanent access token</span>
              <input className={field} type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} /></label>
            <button className={btn} disabled={!id || token.length < 20}>Connect</button>
          </form>
        </>
      )) : <p className="text-sm text-muted">Only the owner can connect WhatsApp.</p>}
      {msg && <p role="status" className={`text-sm ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>}
    </div>
  );
}
