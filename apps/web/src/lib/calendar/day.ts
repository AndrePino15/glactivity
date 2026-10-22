import { addDays, fromISODate, type ISODate } from "../dates";
import type { CalendarEvent, Country, Period } from "../db/types";
import type { Holiday } from "../holidays";
import { countryOn } from "./breaks";

/** All-day events are stored as UTC dates with an exclusive end date. */
function allDayCovers(event: CalendarEvent, day: ISODate) {
  const first = event.starts_at.slice(0, 10);
  const last = event.ends_at.slice(0, 10);
  return first <= day && day < (last > first ? last : addDays(first, 1));
}

/** Events happening on a local day, all-day ones first. */
export function eventsOn(day: ISODate, events: CalendarEvent[]): CalendarEvent[] {
  const start = fromISODate(day).getTime();
  const end = fromISODate(addDays(day, 1)).getTime();
  return events
    .filter((e) =>
      e.all_day
        ? allDayCovers(e, day)
        : new Date(e.starts_at).getTime() < end && new Date(e.ends_at).getTime() > start,
    )
    .sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.starts_at.localeCompare(b.starts_at));
}

/** Holidays on a day for wherever you are that day. */
export function holidaysOn(day: ISODate, holidays: Holiday[], periods: Period[], home: Country): Holiday[] {
  const country = countryOn(day, periods, home);
  return holidays.filter((h) => h.date === day && h.country === country);
}

/** A confirmed or detected break covering the day, if any. */
export function breakOn(day: ISODate, periods: Period[]): Period | null {
  return periods.find((p) => p.kind === "break" && p.starts_on <= day && day <= p.ends_on) ?? null;
}
