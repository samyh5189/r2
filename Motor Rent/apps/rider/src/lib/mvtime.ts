/**
 * All rental times are Maldives local time (UTC+5, no daylight saving), whatever time zone the
 * rider's phone is set to. Visitors often keep their home time zone, so never use device-local dates.
 */
export const TZ = 'Indian/Maldives';
const OFFSET = 5 * 3_600_000;
const DAY = 86_400_000;

/** 00:00 Maldives time on the day of `d`. */
export const mvDayStart = (d: Date) => new Date(Math.floor((d.getTime() + OFFSET) / DAY) * DAY - OFFSET);
/** Minutes since Maldives midnight. */
export const mvMinutes = (d: Date) => Math.round((((d.getTime() + OFFSET) % DAY) + DAY) % DAY / 60_000);
export const sameMvDay = (a: Date, b: Date) => mvDayStart(a).getTime() === mvDayStart(b).getTime();
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

export const fmtTime = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
export const fmtWeekday = (d: Date, style: 'short' | 'long' = 'short') => d.toLocaleDateString('en-GB', { weekday: style, timeZone: TZ });
export const fmtDayMonth = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: TZ });
export const fmtLongDate = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
