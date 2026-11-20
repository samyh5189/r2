/**
 * Reads OCR text from a bank-transfer slip and checks it against the booking.
 * Advisory only: staff approve every slip. Amounts are minor units (laari / cents).
 */
export type SlipCheck = {
  amounts: number[];          // every money amount found, minor units, largest first
  amountMatches: boolean;     // an amount ≥ expected total was found
  referenceFound: boolean;    // booking reference appears in the remark
  accountFound: boolean;      // one of our account numbers (last 6 digits) appears
  date: string | null;        // first date-looking string
  score: number;              // 0–3 checks passed
};

const AMOUNT = /(?:MVR|USD|Rf\.?|\$)?\s*(\d{1,3}(?:[,\s]\d{3})+|\d+)[.,](\d{2})\b/gi;
const DATE = /\b(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{2,4})\b/i;

export function parseAmounts(text: string): number[] {
  const out = new Set<number>();
  for (const m of text.matchAll(AMOUNT)) {
    const whole = Number(m[1].replace(/[,\s]/g, ""));
    if (Number.isFinite(whole) && whole < 10_000_000) out.add(whole * 100 + Number(m[2]));
  }
  return [...out].sort((a, b) => b - a);
}

export function analyzeSlip(
  text: string,
  expected: { total: number; reference: string; accountNumbers: string[] },
): SlipCheck {
  const flat = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const digits = text.replace(/\D/g, "");
  const amounts = parseAmounts(text);
  const amountMatches = amounts.some((a) => a >= expected.total);
  const referenceFound = expected.reference.length >= 4 && flat.includes(expected.reference.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  const accountFound = expected.accountNumbers.some((n) => {
    const d = n.replace(/\D/g, "");
    return d.length >= 6 && digits.includes(d.slice(-6));
  });
  const date = text.match(DATE)?.[0] ?? null;
  return { amounts, amountMatches, referenceFound, accountFound, date, score: +amountMatches + +referenceFound + +accountFound };
}
