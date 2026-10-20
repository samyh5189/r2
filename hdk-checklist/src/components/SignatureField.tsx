import { useEffect, useRef } from "react";
import SignaturePad from "signature_pad";

interface Props {
  /** Called with a transparent PNG data URL, or "" when cleared */
  onChange: (dataUrl: string) => void;
  height?: number;
}

export default function SignatureField({ onChange, height = 120 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = height * ratio;
    canvas.getContext("2d")!.scale(ratio, ratio);
    const pad = new SignaturePad(canvas, { backgroundColor: "rgba(0,0,0,0)", penColor: "#0B2A4A" });
    pad.addEventListener("endStroke", () => onChangeRef.current(pad.isEmpty() ? "" : pad.toDataURL()));
    padRef.current = pad;
    return () => pad.off();
  }, [height]);

  return (
    <div className="sig-wrap">
      <canvas ref={canvasRef} className="sig-canvas" style={{ width: "100%", height }} />
      <div className="sig-actions">
        <span className="sig-hint">Sign above</span>
        <button type="button" className="btn-clear" onClick={() => { padRef.current?.clear(); onChange(""); }}>Clear</button>
      </div>
    </div>
  );
}
