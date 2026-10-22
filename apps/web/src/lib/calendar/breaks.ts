import { addDays, daysBetween, type ISODate } from "../dates";
import type { Country, Period } from "../db/types";

export type Gap = { starts_on: ISODate; ends_on: ISODate };

/**
 * Gaps of at least `minDays` free days between teaching days, e.g. Christmas
 * or Easter. A normal weekend is 2 free days; a reading week is 9.
 */
export function detectBreaks(teachingDays: ISODate[], minDays = 9): Gap[] {
  const days = [...new Set(teachingDays)].sort();
  const gaps: Gap[] = [];
  for (let i = 0; i < days.length - 1; i++) {
    if (daysBetween(days[i], days[i + 1]) - 1 >= minDays) {
      gaps.push({ starts_on: addDays(days[i], 1), ends_on: addDays(days[i + 1], -1) });
    }
  }
  return gaps;
}

const covers = (period: Period, day: ISODate) => period.starts_on <= day && day <= period.ends_on;

/** Where you are on a given day: a confirmed trip wins over the Settings choice. */
export function countryOn(day: ISODate, periods: Period[], fallback: Country): Country {
  const trip = periods.find((p) => p.confirmed && p.country && covers(p, day));
  return trip?.country ?? fallback;
}

/** A detected break worth asking about: happening now or starting within three weeks. */
export function breakToAskAbout(periods: Period[], today: ISODate): Period | null {
  return (
    periods
      .filter((p) => p.kind === "break" && !p.confirmed && p.ends_on >= today)
      .filter((p) => daysBetween(today, p.starts_on) <= 21)
      .sort((a, b) => a.starts_on.localeCompare(b.starts_on))[0] ?? null
  );
}
