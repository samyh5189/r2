"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ImageCropper } from "@/components/image-cropper";
import { supabaseBrowser } from "@/lib/supabase/client";

const BUCKET = "site-assets";

/** Home-page hero photo. Upload → crop (wide) → publish via update_site_settings. */
export function HeroSettings({ url, credit, note, canEdit }: { url: string | null; credit: string | null; note: string; canEdit: boolean }) {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [current, setCurrent] = useState(url);
  const [creditText, setCreditText] = useState(credit ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function publish(nextUrl: string | null, nextCredit: string) {
    const { error } = await supabase.rpc("update_site_settings", { p_hero_image_url: nextUrl, p_hero_credit: nextCredit, p_bank_transfer_note: note });
    if (error) throw new Error(error.message);
    setCurrent(nextUrl);
    setSaved(true);
    router.refresh();
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label); setError(null); setSaved(false);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); } finally { setBusy(null); }
  }

  function uploadCropped(blob: Blob) {
    setFile(null);
    run("Uploading…", async () => {
      const path = `hero/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (error) throw new Error(error.message);
      const previous = current;
      await publish(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, creditText);
      const old = previous?.split(`/public/${BUCKET}/`)[1];
      if (old) await supabase.storage.from(BUCKET).remove([decodeURIComponent(old)]);
    });
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Home page photo</h2>
      {file && <ImageCropper file={file} aspect={16 / 9} outWidth={1920} title="Crop home page photo" onDone={uploadCropped} onCancel={() => setFile(null)} />}
      <div className="overflow-hidden rounded-2xl border border-line bg-panel">
        <div className="relative aspect-[16/7] bg-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current ?? "/stock/hero.jpg"} alt="Current home page photo" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
          <div className="absolute left-4 top-4 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/80">EasyRide · Kulhudhuffushi MotoRentals</p>
            <p className="text-2xl font-bold">Ride Kulhudhuffushi.</p>
          </div>
          <span className="absolute bottom-3 right-3 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">{current ? "Custom photo" : "Default: Sinamalé Bridge"}</span>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap items-end gap-3 p-4">
            <button type="button" disabled={!!busy} onClick={() => input.current?.click()}
              className="btn btn-primary">{busy ?? "Change photo"}</button>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = ""; }} />
            <label className="min-w-56 flex-1 space-y-1"><span className="text-xs font-medium text-muted">Photo credit (shown small on the photo)</span>
              <input className="w-full rounded-xl border border-line bg-panel px-3 py-2 outline-none focus:border-accent" value={creditText}
                maxLength={120} placeholder="Photo: your name" onChange={(e) => { setCreditText(e.target.value); setSaved(false); }} /></label>
            <button type="button" disabled={!!busy} onClick={() => run("Saving…", () => publish(current, creditText))}
              className="btn btn-secondary disabled:opacity-50">Save credit</button>
            {current && (
              <button type="button" disabled={!!busy} onClick={() => run("Resetting…", () => publish(null, ""))}
                className="rounded-xl px-3 py-2 text-sm text-muted hover:text-foreground">Use default photo</button>
            )}
            {saved && <span className="rise text-sm text-emerald-600">Published ✓ riders see it on next load</span>}
          </div>
        ) : <p className="p-4 text-sm text-muted">Only managers and owners can change this.</p>}
        {error && <p role="alert" className="mx-4 mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
      </div>
    </section>
  );
}
