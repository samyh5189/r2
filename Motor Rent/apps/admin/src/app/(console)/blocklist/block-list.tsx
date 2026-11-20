"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ImageCropper } from "@/components/image-cropper";
import { money } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";

export type Block = {
  id: string; full_name: string; phone: string | null; email: string | null; id_number: string | null; reason: string;
  amount_owed: number; currency: "MVR" | "USD"; photo_path: string | null; photoUrl: string | null; active: boolean; created_at: string;
};

const field = "w-full rounded-xl border-[1.5px] border-line bg-panel px-3 py-2 outline-none transition focus:border-accent";
const REASONS = ["Unpaid balance", "Vehicle damage not paid", "Late return / no return", "Reckless riding", "Abusive behaviour", "Fake documents"];

function BlockForm({ block, userId, onClose }: { block?: Block; userId: string; onClose: () => void }) {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const input = useRef<HTMLInputElement>(null);
  const [f, setF] = useState({
    full_name: block?.full_name ?? "", phone: block?.phone ?? "", email: block?.email ?? "", id_number: block?.id_number ?? "",
    reason: block?.reason ?? "", owed: block ? (block.amount_owed / 100).toFixed(2) : "", currency: block?.currency ?? "MVR",
  });
  const [file, setFile] = useState<File | null>(null);
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    let photo_path = block?.photo_path ?? null;
    if (photo) {
      photo_path = `${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from("blocklist").upload(photo_path, photo.blob, { contentType: "image/jpeg" });
      if (error) { setBusy(false); return setError(error.message); }
    }
    const row = {
      full_name: f.full_name.trim(), phone: f.phone.trim() || null, email: f.email.trim().toLowerCase() || null,
      id_number: f.id_number.trim() || null, reason: f.reason.trim(), currency: f.currency,
      amount_owed: Math.round(Number(f.owed.replace(/[^\d.]/g, "") || 0) * 100), photo_path,
    };
    const { error } = block
      ? await supabase.from("rider_blocks").update(row).eq("id", block.id)
      : await supabase.from("rider_blocks").insert({ ...row, created_by: userId });
    if (error) {
      if (photo && photo_path) await supabase.storage.from("blocklist").remove([photo_path]);
      setBusy(false);
      return setError(/check constraint/.test(error.message) ? "Check the phone (digits only) and email." : error.message);
    }
    if (photo && block?.photo_path) await supabase.storage.from("blocklist").remove([block.photo_path]);
    setBusy(false);
    router.refresh();
    onClose();
  }

  const preview = photo?.preview ?? block?.photoUrl ?? null;
  return (
    <form onSubmit={save} className="rise grid gap-4 rounded-2xl border border-accent/40 bg-panel p-4 sm:grid-cols-[140px_1fr]">
      {file && <ImageCropper file={file} aspect={1} outWidth={600} round title="Crop face photo"
        onDone={(blob) => { setFile(null); setPhoto({ blob, preview: URL.createObjectURL(blob) }); }} onCancel={() => setFile(null)} />}
      <div className="space-y-2">
        <button type="button" onClick={() => input.current?.click()}
          className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-line text-sm text-muted hover:border-accent">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : "＋ Photo"}
        </button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const x = e.target.files?.[0]; if (x) setFile(x); e.target.value = ""; }} />
        <p className="text-center text-xs text-muted">For identifying at the counter</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 space-y-1"><span className="text-xs font-medium text-muted">Full name</span>
          <input className={field} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} required maxLength={100} /></label>
        <label className="space-y-1"><span className="text-xs font-medium text-muted">Phone</span>
          <input className={field} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+960 7xx xxxx" inputMode="tel" /></label>
        <label className="space-y-1"><span className="text-xs font-medium text-muted">Email</span>
          <input className={field} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label className="space-y-1"><span className="text-xs font-medium text-muted">ID card / passport no.</span>
          <input className={field} value={f.id_number} onChange={(e) => setF({ ...f, id_number: e.target.value })} maxLength={40} /></label>
        <label className="space-y-1"><span className="text-xs font-medium text-muted">Amount owed</span>
          <div className="flex gap-1">
            <select className={`${field} w-20`} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as "MVR" | "USD" })}><option>MVR</option><option>USD</option></select>
            <input className={`${field} tabular-nums`} inputMode="decimal" value={f.owed} onChange={(e) => setF({ ...f, owed: e.target.value })} placeholder="0.00" />
          </div></label>
        <label className="col-span-2 space-y-1"><span className="text-xs font-medium text-muted">What happened</span>
          <textarea className={`${field} min-h-20`} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} required minLength={3} maxLength={1000}
            placeholder="Facts only: dates, booking reference, what was damaged or unpaid." />
          <div className="flex flex-wrap gap-1">{REASONS.map((r) => (
            <button key={r} type="button" onClick={() => setF({ ...f, reason: f.reason ? `${f.reason}; ${r}` : r })}
              className="rounded-full border border-line px-2 py-0.5 text-xs hover:border-accent">{r}</button>))}</div></label>
        {error && <p role="alert" className="col-span-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div className="col-span-2 flex gap-2">
          <button disabled={busy || !!file} className="rounded-xl bg-accent px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : block ? "Save" : "Add to blocklist"}</button>
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-muted">Cancel</button>
        </div>
      </div>
    </form>
  );
}

export function BlockList({ blocks, canEdit, userId }: { blocks: Block[]; canEdit: boolean; userId: string }) {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function setActive(b: Block, active: boolean) {
    const { error } = await supabase.from("rider_blocks").update({ active }).eq("id", b.id);
    setError(error?.message ?? null);
    router.refresh();
  }
  async function remove(b: Block) {
    const { error } = await supabase.from("rider_blocks").delete().eq("id", b.id);
    if (!error && b.photo_path) await supabase.storage.from("blocklist").remove([b.photo_path]);
    setError(error?.message ?? null);
    router.refresh();
  }

  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const shown = blocks.filter((b) => !needle
    || b.full_name.toLowerCase().includes(needle) || (b.email ?? "").includes(needle) || (b.id_number ?? "").toLowerCase().includes(needle)
    || (digits.length >= 3 && (b.phone ?? "").replace(/\D/g, "").includes(digits)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input className={`${field} max-w-sm flex-1`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, email, ID…" aria-label="Search blocklist" />
        {canEdit && editing !== "new" && <button type="button" onClick={() => setEditing("new")} className="rounded-xl bg-accent px-4 py-2 font-semibold text-white">＋ Add person</button>}
      </div>
      {editing === "new" && <BlockForm userId={userId} onClose={() => setEditing(null)} />}
      {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
      {!shown.length && <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">{blocks.length ? "No match." : "Nobody is blocked."}</p>}
      <ul className="grid gap-3 md:grid-cols-2">
        {shown.map((b) => editing === b.id ? (
          <li key={b.id} className="md:col-span-2"><BlockForm block={b} userId={userId} onClose={() => setEditing(null)} /></li>
        ) : (
          <li key={b.id} className={`flex gap-4 rounded-2xl border bg-panel p-4 ${b.active ? "border-red-500/30" : "border-line opacity-60"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {b.photoUrl ? <img src={b.photoUrl} alt="" className="h-20 w-20 flex-none rounded-full object-cover" />
              : <div className="flex h-20 w-20 flex-none items-center justify-center rounded-full bg-line text-2xl font-bold text-muted">{b.full_name.slice(0, 1)}</div>}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{b.full_name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${b.active ? "bg-red-500/15 text-red-700 dark:text-red-400" : "bg-background"}`}>{b.active ? "Blocked" : "Lifted"}</span>
              </div>
              <p className="text-xs text-muted">{[b.phone, b.email, b.id_number].filter(Boolean).join(" · ")}</p>
              <p className="text-sm">{b.reason}</p>
              {b.amount_owed > 0 && <p className="text-sm font-semibold text-red-600">Owes {money(b.amount_owed, b.currency)}</p>}
              {canEdit && (
                <div className="flex flex-wrap gap-2 pt-1 text-sm">
                  <button type="button" onClick={() => setEditing(b.id)} className="font-semibold text-accent">Edit</button>
                  <button type="button" onClick={() => setActive(b, !b.active)} className="text-muted hover:text-foreground">{b.active ? "Lift block" : "Block again"}</button>
                  <button type="button" onClick={() => remove(b)} className="text-red-600">Delete</button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
