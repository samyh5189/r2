import { Platform } from 'react-native';

// Web only: Tesseract.js (WASM) reads the slip in the rider's browser for instant feedback.
// On iOS/Android we skip it; staff run OCR again when reviewing either way.
const SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
type Tesseract = { recognize: (img: string | Blob, lang: string) => Promise<{ data: { text: string } }> };
let loading: Promise<Tesseract> | null = null;

export const ocrAvailable = Platform.OS === 'web';

export async function ocrImage(img: Blob): Promise<string> {
  if (!ocrAvailable) throw new Error('OCR not available');
  const w = window as unknown as { Tesseract?: Tesseract };
  loading ??= w.Tesseract ? Promise.resolve(w.Tesseract) : new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = () => (w.Tesseract ? resolve(w.Tesseract) : reject(new Error('OCR failed to load')));
    s.onerror = () => { loading = null; reject(new Error('OCR failed to load')); };
    document.head.appendChild(s);
  });
  const t = await loading;
  const { data } = await t.recognize(img, 'eng');
  return data.text;
}
