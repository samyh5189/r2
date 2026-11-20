/** Parses a Postgres tstzrange literal such as ["2027-01-01 03:00:00+00","2027-01-01 13:00:00+00"). */
export function parseTstzRange(value: string): { start: Date; end: Date } {
  const m = /^[[(]"?([^",]+)"?,"?([^",)\]]+)"?[)\]]$/.exec(value.trim());
  if (!m) throw new Error(`Unparseable range: ${value}`);
  const toDate = (s: string) => new Date(s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  const start = toDate(m[1]!), end = toDate(m[2]!);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error(`Bad range dates: ${value}`);
  return { start, end };
}
