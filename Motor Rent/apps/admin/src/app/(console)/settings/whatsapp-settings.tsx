"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

const field = "w-full rounded-xl border-[1.5px] border-line bg-panel px-3 py-2 outline-none transition focus:border-accent";
const btn = "btn btn-primary";

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

export type WaTemplate = { name: string; audience: string; body: string; status: string | null; rejected_reason: string | null };

const TONE: Record<string, string> = {
  APPROVED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  PENDING: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  REJECTED: "bg-red-500/15 text-red-600",
};

/** Owner: connect WhatsApp's official Business Platform (Cloud API). The token is kept in the database vault. */
export function ConnectWhatsApp({ ready, isOwner, templates }: { ready: boolean; isOwner: boolean; templates: WaTemplate[] }) {
  const router = useRouter();
  const [id, setId] = useState("");
  const [waba, setWaba] = useState("");
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const db = supabaseBrowser();

  async function connect(ev: React.FormEvent) {
    ev.preventDefault();
    const { error } = await db.rpc("set_whatsapp_config", { p_phone_number_id: id, p_token: token, p_waba_id: waba });
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Connected. Next, submit the message templates to Meta." });
    if (!error) { setToken(""); router.refresh(); }
  }
  async function disconnect() {
    const { error } = await db.rpc("clear_whatsapp_config");
    if (!error) router.refresh();
  }
  async function submitTemplates() {
    setBusy(true); setMsg(null);
    const { data, error } = await db.functions.invoke<{ errors: Record<string, string> }>("whatsapp-templates", { body: {} });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: await fnError(error) });
    const failed = Object.keys(data?.errors ?? {}).length;
    setMsg(failed ? { ok: false, text: `${failed} template(s) were refused; see the reasons below.` } : { ok: true, text: "Submitted. Meta usually reviews them within minutes to a few hours." });
    router.refresh();
  }

  const approved = templates.filter((t) => t.status === "APPROVED").length;
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">Automatic sending</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ready ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-line text-muted"}`}>{ready ? "Connected" : "Not connected"}</span>
        {ready && <span className="text-xs text-muted">{approved} of {templates.length} templates approved</span>}
      </div>
      <p className="text-sm text-muted">
        Without this, every message waits on the WhatsApp page for staff to send from the office phone. Connected, the system sends them itself and riders can sign in with a WhatsApp code. Each kind of message only goes out automatically once Meta has approved its template.
      </p>
      {isOwner && !ready && (
        <>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">How to connect</summary>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted">
              <li>In developers.facebook.com, open your app, then WhatsApp, then API Setup. Copy the Phone number ID and the WhatsApp Business account ID.</li>
              <li>For testing, click Generate token there (it lasts 24 hours). For real use, create a System User in business.facebook.com with a permanent token that has whatsapp_business_messaging and whatsapp_business_management.</li>
              <li>Paste all three below, press Connect, then press Submit templates to Meta.</li>
            </ol>
          </details>
          <form onSubmit={connect} className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1"><span className="text-xs font-medium text-muted">Phone number ID</span>
              <input className={field} inputMode="numeric" value={id} onChange={(e) => setId(e.target.value.trim())} /></label>
            <label className="space-y-1"><span className="text-xs font-medium text-muted">WhatsApp Business account ID</span>
              <input className={field} inputMode="numeric" value={waba} onChange={(e) => setWaba(e.target.value.trim())} /></label>
            <label className="space-y-1 sm:col-span-2"><span className="text-xs font-medium text-muted">Access token</span>
              <input className={field} type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} /></label>
            <button className={`${btn} sm:col-span-2 sm:justify-self-start`} disabled={!id || !waba || token.length < 20}>Connect</button>
          </form>
        </>
      )}
      {ready && (
        <>
          {isOwner && (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={btn} disabled={busy} onClick={submitTemplates}>{busy ? "Submitting…" : "Submit templates to Meta"}</button>
              <button type="button" onClick={disconnect} className="btn btn-ghost btn-sm">Disconnect WhatsApp</button>
            </div>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Templates</summary>
            <ul className="mt-2 divide-y divide-line">
              {templates.map((t) => (
                <li key={t.name} className="space-y-1 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-xs">{t.name}</code>
                    <span className="text-xs text-muted">{t.audience === "staff" ? "office alert" : t.audience === "code" ? "sign-in code" : "rider"}</span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[t.status ?? ""] ?? "bg-line text-muted"}`}>{t.status?.toLowerCase().replace(/_/g, " ") ?? "not submitted"}</span>
                  </div>
                  <p className="text-muted">{t.body}</p>
                  {t.rejected_reason && t.rejected_reason !== "NONE" && <p className="text-xs text-red-600">{t.rejected_reason}</p>}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
      {!isOwner && !ready && <p className="text-sm text-muted">Only the owner can connect WhatsApp.</p>}
      {msg && <p role="status" className={`text-sm ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>}
    </div>
  );
}
