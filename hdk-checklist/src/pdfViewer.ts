import type { PdfFile } from "./pdfExport";

// Tiny bridge so any component can open the app-wide PDF viewer
type Listener = (file: Promise<PdfFile | undefined>) => void;
let listener: Listener | null = null;

export function showPdf(file: Promise<PdfFile | undefined>) {
  listener?.(file);
}

export function onShowPdf(l: Listener) {
  listener = l;
  return () => { if (listener === l) listener = null; };
}
