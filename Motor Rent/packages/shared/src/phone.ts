/**
 * Mobile numbers as stored: Maldives numbers become +960XXXXXXX (7 digits starting 3–9), others need their
 * country code. Mirrors `public.norm_phone` in the database. Returns null when it isn't a usable number.
 */
export function normPhone(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/[\s().-]/g, "");
  if (/^(00960|\+960|960)?[3-9]\d{6}$/.test(d)) return `+960${d.slice(-7)}`;
  if (/^\+[1-9]\d{7,14}$/.test(d)) return d;
  if (/^00[1-9]\d{7,14}$/.test(d)) return `+${d.slice(2)}`;
  return null;
}

/** +9607771234 → "777 1234"; other numbers are shown as stored. */
export function phoneLabel(p: string | null | undefined): string {
  if (!p) return "";
  return p.startsWith("+960") && p.length === 11 ? `${p.slice(4, 7)} ${p.slice(7)}` : p;
}
