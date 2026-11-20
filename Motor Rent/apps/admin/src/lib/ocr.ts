"use client";

// Tesseract.js runs entirely in the browser (WASM); the slip image never goes to a third party.
const SRC = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

type Tesseract = { recognize: (img: string | Blob, lang: string) => Promise<{ data: { text: string } }> };
let loading: Promise<Tesseract> | null = null;

function load(): Promise<Tesseract> {
  const w = window as unknown as { Tesseract?: Tesseract };
  if (w.Tesseract) return Promise.resolve(w.Tesseract);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.onload = () => (w.Tesseract ? resolve(w.Tesseract) : reject(new Error("OCR failed to load")));
    s.onerror = () => { loading = null; reject(new Error("OCR failed to load")); };
    document.head.appendChild(s);
  });
  return loading;
}

export async function ocrImage(img: string | Blob): Promise<string> {
  const t = await load();
  const { data } = await t.recognize(img, "eng");
  return data.text;
}
