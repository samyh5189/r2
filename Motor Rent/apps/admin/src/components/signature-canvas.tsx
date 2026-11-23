"use client";

import { useEffect, useRef, useState } from "react";

const W = 600;
const H = 200;
const INK = "#111827";
const r = (n: number) => Math.round(n * 10) / 10;

/** Same SVG format as the staff app; submit-inspection validates it strictly. */
function toSvg(strokes: string[]) {
  const paths = strokes.map((d) =>
    `<path d="${d}" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${paths}</svg>`;
}

/** Finger / mouse / pen signature box. Reports an SVG string, or null when empty. */
export function SignatureCanvas({ label, onChange }: { label: string; onChange: (svg: string | null) => void }) {
  const [strokes, setStrokes] = useState<string[]>([]);
  const current = useRef<string | null>(null);
  const [, force] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const [big, setBig] = useState(false);
  useEffect(() => {
    if (!big) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setBig(false);
    window.addEventListener("keydown", esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", esc); };
  }, [big]);

  const point = (e: React.PointerEvent) => {
    const box = svgRef.current!.getBoundingClientRect();
    return [r(((e.clientX - box.left) / box.width) * W), r(((e.clientY - box.top) / box.height) * H)] as const;
  };
  const down = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = point(e);
    current.current = `M${x} ${y}`;
    force((n) => n + 1);
  };
  const move = (e: React.PointerEvent) => {
    if (!current.current) return;
    const [x, y] = point(e);
    current.current += ` L${x} ${y}`;
    force((n) => n + 1);
  };
  const up = () => {
    const d = current.current;
    current.current = null;
    if (!d || !d.includes("L")) return force((n) => n + 1);
    const next = [...strokes, d];
    setStrokes(next);
    onChange(toSvg(next));
  };
  const clear = () => { setStrokes([]); onChange(null); };

  return (
    <div className={big ? "fixed inset-0 z-50 flex flex-col justify-center gap-3 bg-white p-4 text-neutral-900" : "space-y-1"}
      role={big ? "dialog" : undefined} aria-modal={big || undefined} aria-label={big ? `${label} signature` : undefined}>
      <div className="flex items-center justify-between gap-2">
        <span className={big ? "text-base font-semibold" : "text-sm font-medium"}>{label}</span>
        <span className="flex items-center gap-1">
          <button type="button" onClick={clear} className="min-h-9 px-2 text-xs text-muted hover:underline">Clear</button>
          {big ? <button type="button" onClick={() => setBig(false)} className="btn btn-primary">Done</button>
            : <button type="button" onClick={() => setBig(true)} className="min-h-9 px-2 text-xs font-semibold text-accent">Bigger pad</button>}
        </span>
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} pad`}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        className={`aspect-[3/1] w-full touch-none select-none rounded-xl border-[1.5px] border-dashed border-line bg-white ${big ? "mx-auto max-h-[75vh] max-w-[225vh]" : ""}`}>
        <line x1="24" y1={H - 40} x2={W - 24} y2={H - 40} stroke="#d9e2df" strokeWidth="1.5" />
        {[...strokes, ...(current.current ? [current.current] : [])].map((d, i) => (
          <path key={i} d={d} fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {!strokes.length && !current.current && <text x={W / 2} y={H / 2} textAnchor="middle" fill="#8da7a6" fontSize="18">Sign here</text>}
      </svg>
      {big && <p className="text-center text-xs text-neutral-500">Turn the phone sideways for more room.</p>}
    </div>
  );
}
