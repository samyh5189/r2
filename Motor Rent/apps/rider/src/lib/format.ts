import { formatMoney, type Currency } from '@motor-rent/shared';

export const money = (minor: number, currency: Currency = 'MVR') => formatMoney(minor, currency);

export const dateTime = (d: Date | string) =>
  new Date(d).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Maldives' });

/** Parses a Postgres tstzrange string into dates. */
export function parseRange(value: string) {
  const m = /^[[(]"?([^",]+)"?,"?([^",)\]]+)"?[)\]]$/.exec(value.trim());
  if (!m) return null;
  const d = (s: string) => new Date(s.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
  return { start: d(m[1]!), end: d(m[2]!) };
}
