import { useEffect, useRef, useState } from "react";
import type { PdfFile } from "../pdfExport";
import { onShowPdf } from "../pdfViewer";

// Phones can't reliably show PDFs in an iframe, so pages are drawn with pdf.js (loaded on first use)
async function renderPages(blob: Blob, container: HTMLDivElement, isCancelled: () => boolean) {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = container.clientWidth;
  container.replaceChildren();
  for (let n = 1; n <= pdf.numPages; n++) {
    if (isCancelled()) return;
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (width * dpr) / base.width });
    const canvas = document.createElement("canvas");
    canvas.className = "pdf-page";
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    container.appendChild(canvas);
    await page.render({ canvas, viewport }).promise;
  }
}

const isTouchDevice = () => window.matchMedia("(pointer: coarse)").matches;

export default function PdfViewer() {
  const [file, setFile] = useState<PdfFile | null>(null);
  const [state, setState] = useState<"closed" | "loading" | "ready" | "error">("closed");
  const [error, setError] = useState("");
  const pagesRef = useRef<HTMLDivElement>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => onShowPdf((pending) => {
    setFile(null);
    setState("loading");
    pending
      .then((f) => {
        if (!f) { setError("No inspections in that week."); setState("error"); return; }
        setFile(f);
      })
      .catch((e) => { setError(e instanceof Error ? e.message : "Could not create the PDF."); setState("error"); });
  }), []);

  useEffect(() => {
    if (!file || !pagesRef.current) return;
    let cancelled = false;
    urlRef.current = URL.createObjectURL(file.blob);
    renderPages(file.blob, pagesRef.current, () => cancelled)
      .then(() => { if (!cancelled) setState("ready"); })
      .catch(() => { if (!cancelled) { setError("Could not display the PDF — use Download instead."); setState("error"); } });
    return () => {
      cancelled = true;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, [file]);

  if (state === "closed") return null;

  function close() {
    setState("closed");
    setFile(null);
  }

  function download() {
    if (!file || !urlRef.current) return;
    const a = document.createElement("a");
    a.href = urlRef.current;
    a.download = file.filename;
    a.click();
  }

  const shareFile = file ? new File([file.blob], file.filename, { type: "application/pdf" }) : null;
  const canShare = !!shareFile && typeof navigator.canShare === "function" && navigator.canShare({ files: [shareFile] });

  async function share() {
    if (!shareFile) return;
    try { await navigator.share({ files: [shareFile], title: file!.filename }); }
    catch { /* user cancelled */ }
  }

  function print() {
    if (!urlRef.current) return;
    // Mobile browsers can't print a hidden frame; their own PDF viewer has print
    if (isTouchDevice()) { window.open(urlRef.current, "_blank"); return; }
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
    frame.src = urlRef.current;
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 60_000);
    };
    document.body.appendChild(frame);
  }

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        <button className="pdf-close" onClick={close} aria-label="Close">×</button>
        <span className="pdf-name">{file?.filename ?? "Preparing PDF…"}</span>
        <div className="pdf-actions">
          <button onClick={download} disabled={!file}>Download</button>
          {canShare && <button onClick={share}>Share</button>}
          <button onClick={print} disabled={!file}>Print</button>
        </div>
      </div>
      <div className="pdf-scroll">
        {state === "loading" && <div className="spinner-wrap"><div className="spinner" /><span className="spinner-text">Preparing PDF…</span></div>}
        {state === "error" && <p className="pdf-error">{error}</p>}
        <div ref={pagesRef} className="pdf-pages" />
      </div>
    </div>
  );
}
