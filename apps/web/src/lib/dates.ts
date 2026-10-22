/**
 * Calendar-date helpers. A "date" here is a local calendar day written as
 * YYYY-MM-DD, which is also how Postgres `date` columns come back.
 */

export type ISODate = string;

const pad = (n: number) => String(n).padStart(2, "0");

export function toISODate(date: Date): ISODate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Midnight local time on that day. */
export function fromISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: ISODate, days: number): ISODate {
  const date = fromISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/** Whole days from a to b (b later = positive). */
export function daysBetween(a: ISODate, b: ISODate): number {
  const ms = fromISODate(b).getTime() - fromISODate(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** The Monday of the week containing this day. */
export function startOfWeek(iso: ISODate): ISODate {
  const weekday = (fromISODate(iso).getDay() + 6) % 7; // Monday = 0
  return addDays(iso, -weekday);
}

/** Adds months, keeping the day of the month where it can (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso: ISODate, months: number, dayOfMonth?: number): ISODate {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(dayOfMonth ?? d, lastDay));
  return toISODate(target);
}

const formatter = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", options);
const shortDay = formatter({ weekday: "short", day: "numeric", month: "short" });
const time = formatter({ hour: "2-digit", minute: "2-digit", hour12: false });

/** "Mon 3 Nov" */
export function formatShortDay(iso: ISODate): string {
  return shortDay.format(fromISODate(iso)).replace(",", "");
}

/** "09:00" in the viewer's time zone. */
export function formatTime(timestamp: string | Date): string {
  return time.format(typeof timestamp === "string" ? new Date(timestamp) : timestamp);
}

/** "today", "tomorrow", "in 3 days", "2 days ago" */
export function relativeDay(from: ISODate, to: ISODate): string {
  const days = daysBetween(from, to);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}
