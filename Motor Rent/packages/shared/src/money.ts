/**
 * All money is integer minor units (laari / cents). Never use floats for money.
 */
export type Minor = number;

export const CURRENCIES = ["MVR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export function assertMinor(value: number, label = "amount"): asserts value is Minor {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer in minor units, got ${value}`);
  }
}

export function formatMoney(amount: Minor, currency: Currency, locale = "en-MV"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount / 100);
}

/** Percentage of an amount, rounded half-up to the nearest minor unit. */
export function percentOf(amount: Minor, percent: number): Minor {
  return Math.round((amount * percent) / 100);
}
