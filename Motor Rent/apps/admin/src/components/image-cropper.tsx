"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Crop + zoom before upload. Drag to move, wheel / slider / ± to zoom.
 * The output is a JPEG at `outWidth` × outWidth/aspect; re-encoding strips EXIF (GPS etc.).
 */
export function ImageCropper({
  file, aspect, outWidth = 1600, title = "Crop photo", round = false, onDone, onCancel,
}: {
  file: File; aspect: number; outWidth?: number; title?: string; round?: boolean;
  onDone: (blob: Blob) => void; onCancel: () => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [url, setUrl] = useState<string>("");
  const [frameW, setFrameW] = useState(560);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    const el = new Image();
    el.onload = () => setImg(el);
    el.onerror = () => setError("This image could not be opened. Try a JPEG or PNG.");
    el.src = u;
    return () => URL.revokeObjectURL(u);
  }, [file]);

  useEffect(() => {
    const measure = () => setFrameW(Math.min(560, (frameRef.current?.parentElement?.clientWidth ?? 560)));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const frameH = frameW / aspect;
  const cover = img ? Math.max(frameW / img.naturalWidth, frameH / img.naturalHeight) : 1;
  const scale = cover * zoom;
  const dw = img ? img.naturalWidth * scale : 0;
  const dh = img ? img.naturalHeight * scale : 0;

  function clamp(p: { x: number; y: number }, w = dw, h = dh) {
    const mx = Math.max(0, (w - frameW) / 2);
    const my = Math.max(0, (h - frameH) / 2);
    return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) };
  }

  function setZoomClamped(z: number) {
    const nz = Math.min(5, Math.max(1, z));
    if (!img) return setZoom(nz);
    const ns = cover * nz;
    setZoom(nz);
    setPos((p) => clamp({ x: (p.x * nz) / zoom, y: (p.y * nz) / zoom }, img.naturalWidth * ns, img.naturalHeight * ns));
  }

  // Wheel zoom must be non-passive to prevent page scroll.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); setZoomClamped(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  async function confirm() {
    if (!img) return;
    const outH = Math.round(outWidth / aspect);
    const k = outWidth / frameW;
    const canvas = document.createElement("canvas");
    canvas.width = outWidth;
    canvas.height = outH;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    const left = (frameW - dw) / 2 + pos.x;
    const top = (frameH - dh) / 2 + pos.y;
    ctx.drawImage(img, left * k, top * k, dw * k, dh * k);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob) return setError("Could not process this image.");
    onDone(blob);
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onKeyDown={(e) => e.key === "Escape" && onCancel()}>
      <div className="rise w-full max-w-[600px] space-y-4 rounded-2xl bg-panel p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onCancel} className="rounded-lg px-2 py-1 text-muted hover:bg-background" aria-label="Close">✕</button>
        </div>

        <div className="flex justify-center">
          <div ref={frameRef}
            className={`relative cursor-grab touch-none select-none overflow-hidden bg-black active:cursor-grabbing ${round ? "rounded-full" : "rounded-xl"}`}
            style={{ width: frameW, height: frameH }}
            onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, ...pos }; }}
            onPointerMove={(e) => { const d = drag.current; if (d) setPos(clamp({ x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py })); }}
            onPointerUp={() => { drag.current = null; }}>
            {img && url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="" draggable={false} className="pointer-events-none absolute max-w-none"
                style={{ width: dw, height: dh, left: (frameW - dw) / 2 + pos.x, top: (frameH - dh) / 2 + pos.y }} />
            )}
            {!img && !error && <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">Loading…</p>}
            {/* rule-of-thirds guide */}
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-30">
              {Array.from({ length: 9 }).map((_, i) => <span key={i} className="border border-white/40" />)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setZoomClamped(zoom / 1.2)} aria-label="Zoom out"
            className="h-9 w-9 rounded-lg border border-line text-lg font-semibold hover:border-accent">−</button>
          <input type="range" min={1} max={5} step={0.01} value={zoom} aria-label="Zoom"
            onChange={(e) => setZoomClamped(Number(e.target.value))} className="flex-1 accent-[var(--accent)]" />
          <button type="button" onClick={() => setZoomClamped(zoom * 1.2)} aria-label="Zoom in"
            className="h-9 w-9 rounded-lg border border-line text-lg font-semibold hover:border-accent">+</button>
          <span className="w-12 text-right text-sm tabular-nums text-muted">{Math.round(zoom * 100)}%</span>
        </div>
        <p className="text-xs text-muted">Drag the photo to position it. Scroll or use the slider to zoom.</p>

        {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => { setZoom(1); setPos({ x: 0, y: 0 }); }} className="btn btn-ghost btn-sm mr-auto">Reset</button>
          <button type="button" onClick={onCancel} className="btn btn-secondary">Cancel</button>
          <button type="button" onClick={confirm} disabled={!img}
            className="btn btn-primary">Use photo</button>
        </div>
      </div>
    </div>
  );
}
