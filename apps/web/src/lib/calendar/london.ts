import type { ISODate } from "../dates";

const londonDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The UK calendar day an instant falls on (the server runs in UTC). */
export function toLondonDate(instant: Date | string): ISODate {
  return londonDate.format(typeof instant === "string" ? new Date(instant) : instant);
}
