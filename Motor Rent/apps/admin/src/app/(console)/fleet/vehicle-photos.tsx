"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export type Kind = "scooter" | "motorbike" | "car";
const KINDS: Kind[] = ["scooter", "motorbike", "car"];
const MAX_PHOTOS = 8;
const MAX_EDGE = 1600;
const BUCKET = "vehicle-photos";

/**
 * Resize to ≤1600px and re-encode as JPEG in the browser. Re-encoding also strips EXIF
 * (GPS location, device serials) from phone photos before they become public.
 */
async function prepare(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error(`${file.name}: use a JPEG, PNG or WebP image.`);
  if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name}: file is larger than 25 MB.`);
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
  if (!blob) throw new Error(`${file.name}: could not process this image.`);
  return blob;
}

/** Storage path (`<vehicle>/<file>`) from a public URL in our bucket. */
function pathOf(url: string) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i >= 0 ? decodeURIComponent(url.slice(i + marker.length)) : null;
}

export function VehiclePhotos({
  vehicleId, label, kind: initialKind, photos: initialPhotos, canEdit,
}: { vehicleId: string; label: string; kind: Kind; photos: string[]; canEdit: boolean }) {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>(initialKind);
  const [photos, setPhotos] = useState<string[]>(initialPhotos);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function save(nextKind: Kind, nextPhotos: string[]) {
    const { error } = await supabase.rpc("update_vehicle_listing", { v: vehicleId, p_kind: nextKind, p_photos: nextPhotos });
    if (error) throw new Error(error.message);
    setKind(nextKind);
    setPhotos(nextPhotos);
    router.refresh();
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); } finally { setBusy(null); }
  }

  function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    run("Uploading…", async () => {
      if (photos.length + list.length > MAX_PHOTOS) throw new Error(`A vehicle can have at most ${MAX_PHOTOS} photos.`);
      const uploaded: string[] = [];
      try {
        for (const file of list) {
          const blob = await prepare(file);
          const path = `${vehicleId}/${crypto.randomUUID()}.jpg`;
          const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
          if (error) throw new Error(error.message);
          uploaded.push(path);
        }
        const urls = uploaded.map((p) => supabase.storage.from(BUCKET).getPublicUrl(p).data.publicUrl);
        await save(kind, [...photos, ...urls]);
      } catch (e) {
        // Publishing failed: don't leave orphaned files behind.
        if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
        throw e;
      }
    });
  }

  function remove(url: string) {
    run("Removing…", async () => {
      await save(kind, photos.filter((p) => p !== url));
      const path = pathOf(url);
      if (path) await supabase.storage.from(BUCKET).remove([path]); // best effort; listing is already updated
    });
  }

  function makeCover(url: string) {
    run("Saving…", () => save(kind, [url, ...photos.filter((p) => p !== url)]));
  }

  function changeKind(next: Kind) {
    run("Saving…", () => save(next, photos));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Type</span>
          <select value={kind} disabled={!canEdit || !!busy} onChange={(e) => changeKind(e.target.value as Kind)}
            className="rounded-lg border border-line bg-panel px-2 py-1.5 capitalize disabled:opacity-60">
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <span className="text-sm text-muted">{photos.length}/{MAX_PHOTOS} photos · first photo is the cover</span>
        {busy && <span className="animate-pulse text-sm font-medium text-accent">{busy}</span>}
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {photos.map((url, i) => (
          <li key={url} className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-line bg-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`${label} photo ${i + 1}`} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
            {i === 0 && <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">Cover</span>}
            {canEdit && (
              <div className="absolute inset-x-2 bottom-2 flex gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                {i > 0 && (
                  <button type="button" disabled={!!busy} onClick={() => makeCover(url)}
                    className="flex-1 rounded-lg bg-white/90 px-2 py-1 text-xs font-semibold text-black hover:bg-white disabled:opacity-50">Make cover</button>
                )}
                <button type="button" disabled={!!busy} onClick={() => remove(url)} aria-label={`Remove photo ${i + 1}`}
                  className="rounded-lg bg-red-600/90 px-2 py-1 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50">Remove</button>
              </div>
            )}
          </li>
        ))}

        {canEdit && photos.length < MAX_PHOTOS && (
          <li>
            <button type="button" disabled={!!busy}
              onClick={() => input.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files); }}
              className={`flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-sm transition disabled:opacity-50 ${dragOver ? "border-accent bg-accent/10 text-accent" : "border-line text-muted hover:border-accent hover:text-accent"}`}>
              <span className="text-2xl leading-none">＋</span>
              <span className="font-semibold">Add photos</span>
              <span className="text-xs">Drop or click · JPEG, PNG, WebP</span>
            </button>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
              onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ""; }} />
          </li>
        )}
      </ul>

      {!photos.length && (
        <p className="text-sm text-muted">No photos yet — riders see a representative stock photo for this vehicle type until you add real ones.</p>
      )}
      {!canEdit && <p className="text-sm text-muted">Only managers and owners can change listing photos.</p>}
    </div>
  );
}
