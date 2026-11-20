"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export type BankAccount = {
  id: string; bank_name: string; account_name: string; account_number: string; currency: "MVR" | "USD";
  swift: string | null; note: string | null; active: boolean; sort: number;
};

const field = "w-full rounded-xl border-[1.5px] border-line bg-panel px-3 py-2 outline-none transition focus:border-accent";
const EMPTY = { bank_name: "Bank of Maldives", account_name: "", account_number: "", currency: "MVR" as const, swift: "", note: "", active: true };

function AccountForm({ account, onClose }: { account?: BankAccount; onClose: () => void }) {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [a, setA] = useState({ ...EMPTY, ...account, swift: account?.swift ?? "", note: account?.note ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const row = {
      bank_name: a.bank_name.trim(), account_name: a.account_name.trim(), account_number: a.account_number.trim(), currency: a.currency,
      swift: a.swift.trim().toUpperCase() || null, note: a.note.trim() || null, active: a.active,
    };
    const { error } = account
      ? await supabase.from("bank_accounts").update(row).eq("id", account.id)
      : await supabase.from("bank_accounts").insert(row);
    setBusy(false);
    if (error) return setError(/check constraint/.test(error.message) ? "Check the account number (4–34 letters/digits) and SWIFT code (8–11 characters)." : error.message);
    router.refresh();
    onClose();
  }

  return (
    <form onSubmit={save} className="rise grid grid-cols-2 gap-3 rounded-2xl border border-accent/40 bg-panel p-4 sm:grid-cols-4">
      <label className="space-y-1"><span className="text-xs font-medium text-muted">Bank</span>
        <input className={field} list="banks" value={a.bank_name} onChange={(e) => setA({ ...a, bank_name: e.target.value })} required maxLength={60} />
        <datalist id="banks"><option value="Bank of Maldives" /><option value="Maldives Islamic Bank" /><option value="State Bank of India" /><option value="Commercial Bank of Maldives" /></datalist></label>
      <label className="space-y-1"><span className="text-xs font-medium text-muted">Currency</span>
        <select className={field} value={a.currency} onChange={(e) => setA({ ...a, currency: e.target.value as "MVR" | "USD" })}>
          <option value="MVR">MVR</option><option value="USD">USD</option></select></label>
      <label className="col-span-2 space-y-1"><span className="text-xs font-medium text-muted">Account name</span>
        <input className={field} value={a.account_name} onChange={(e) => setA({ ...a, account_name: e.target.value })} placeholder="Rent a Motor" required maxLength={80} /></label>
      <label className="col-span-2 space-y-1"><span className="text-xs font-medium text-muted">Account number</span>
        <input className={`${field} font-mono`} value={a.account_number} onChange={(e) => setA({ ...a, account_number: e.target.value })} placeholder="7730000123456" required maxLength={34} /></label>
      <label className="space-y-1"><span className="text-xs font-medium text-muted">SWIFT (optional)</span>
        <input className={`${field} font-mono uppercase`} value={a.swift} onChange={(e) => setA({ ...a, swift: e.target.value })} placeholder="MALBMVMV" maxLength={11} /></label>
      <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={a.active} onChange={(e) => setA({ ...a, active: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" /> Show to riders</label>
      <label className="col-span-full space-y-1"><span className="text-xs font-medium text-muted">Note (optional)</span>
        <input className={field} value={a.note} onChange={(e) => setA({ ...a, note: e.target.value })} placeholder="e.g. Use for MVR payments only" maxLength={200} /></label>
      {error && <p role="alert" className="col-span-full rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
      <div className="col-span-full flex gap-2">
        <button disabled={busy} className="rounded-xl bg-accent px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : account ? "Save account" : "Add account"}</button>
        <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-muted">Cancel</button>
      </div>
    </form>
  );
}

export function BankAccounts({ accounts, note, hero, canEdit }: {
  accounts: BankAccount[]; note: string; hero: { url: string | null; credit: string | null }; canEdit: boolean;
}) {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [noteText, setNoteText] = useState(note);
  const [msg, setMsg] = useState<string | null>(null);

  async function remove(id: string) {
    const { error } = await supabase.from("bank_accounts").delete().eq("id", id);
    setMsg(error ? error.message : null);
    router.refresh();
  }
  async function saveNote() {
    const { error } = await supabase.rpc("update_site_settings", { p_hero_image_url: hero.url, p_hero_credit: hero.credit, p_bank_transfer_note: noteText });
    setMsg(error ? error.message : "Instructions saved ✓");
    router.refresh();
  }

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Bank transfer accounts</h2>
          <p className="text-sm text-muted">Riders see active accounts after booking, can copy the number, and upload their transfer slip.</p>
        </div>
        {canEdit && editing !== "new" && <button type="button" onClick={() => setEditing("new")} className="rounded-xl border border-line px-3 py-2 text-sm font-semibold hover:border-accent">＋ Add account</button>}
      </div>
      {editing === "new" && <AccountForm onClose={() => setEditing(null)} />}
      {!accounts.length && editing !== "new" && (
        <p className="rounded-2xl border border-dashed border-amber-500/50 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
          No bank account yet: riders cannot pay by transfer until you add one.
        </p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {accounts.map((a) => editing === a.id ? (
          <li key={a.id} className="sm:col-span-2"><AccountForm account={a} onClose={() => setEditing(null)} /></li>
        ) : (
          <li key={a.id} className={`rounded-2xl border border-line bg-panel p-4 ${a.active ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted">{a.bank_name} · {a.currency}{a.active ? "" : " · hidden"}</p>
                <p className="font-semibold">{a.account_name}</p>
                <p className="font-mono text-lg tracking-wider">{a.account_number}</p>
                {a.swift && <p className="text-xs text-muted">SWIFT {a.swift}</p>}
                {a.note && <p className="mt-1 text-sm text-muted">{a.note}</p>}
              </div>
              {canEdit && (
                <div className="flex flex-col gap-1">
                  <button type="button" onClick={() => setEditing(a.id)} className="rounded-lg px-2 py-1 text-sm font-semibold text-accent hover:bg-accent/10">Edit</button>
                  <button type="button" onClick={() => remove(a.id)} className="rounded-lg px-2 py-1 text-sm text-red-600 hover:bg-red-500/10">Remove</button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      <label className="block space-y-1"><span className="text-xs font-medium text-muted">Instructions shown to riders</span>
        <textarea className={`${field} min-h-20`} value={noteText} maxLength={300} disabled={!canEdit} onChange={(e) => setNoteText(e.target.value)} /></label>
      {canEdit && <button type="button" onClick={saveNote} className="rounded-xl border border-line px-3 py-2 text-sm font-semibold hover:border-accent">Save instructions</button>}
      {msg && <p role="status" className="text-sm text-muted">{msg}</p>}
    </section>
  );
}
