import ICAL from "ical.js";
import { resolveZone, wallTimeToUtc } from "./zones";

export type ParsedEvent = {
  uid: string;
  title: string;
  location: string | null;
  notes: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
};

type ICALTime = InstanceType<typeof ICAL.Time>;
type ICALComponent = InstanceType<typeof ICAL.Component>;

const MAX_OCCURRENCES = 2000;

/**
 * Converts a parsed time to a UTC instant. Times marked UTC are used as they
 * are; anything else is treated as wall-clock time in its TZID (or UK time
 * when none is given), which keeps lectures right across clock changes even
 * when a feed's time zone data is missing or uses Windows zone names.
 */
function toInstant(time: ICALTime, tzid: string | null): Date {
  if (time.isDate) return new Date(Date.UTC(time.year, time.month - 1, time.day));
  if (time.zone?.tzid === "UTC" || time.zone === ICAL.Timezone.utcTimezone) {
    return new Date(Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second));
  }
  return wallTimeToUtc(time, resolveZone(tzid));
}

function tzidOf(component: ICALComponent, property: "dtstart" | "dtend"): string | null {
  const value = component.getFirstProperty(property)?.getParameter("tzid");
  return typeof value === "string" ? value : null;
}

function text(component: ICALComponent, property: string): string | null {
  const value = component.getFirstPropertyValue(property);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Every event occurrence overlapping [from, to), with repeats expanded. */
export function parseIcs(source: string, from: Date, to: Date): ParsedEvent[] {
  const calendar = new ICAL.Component(ICAL.parse(source));
  const masters = new Map<string, InstanceType<typeof ICAL.Event>>();
  const exceptions: InstanceType<typeof ICAL.Event>[] = [];

  for (const vevent of calendar.getAllSubcomponents("vevent")) {
    const event = new ICAL.Event(vevent);
    if (!event.uid || !event.startDate) continue;
    if (event.isRecurrenceException()) exceptions.push(event);
    else masters.set(event.uid, event);
  }
  for (const exception of exceptions) masters.get(exception.uid)?.relateException(exception);

  const results: ParsedEvent[] = [];
  const add = (item: InstanceType<typeof ICAL.Event>, start: ICALTime, end: ICALTime | null) => {
    if (text(item.component, "status")?.toUpperCase() === "CANCELLED") return;
    const allDay = start.isDate;
    const startAt = toInstant(start, tzidOf(item.component, "dtstart"));
    let endAt = end ? toInstant(end, tzidOf(item.component, "dtend") ?? tzidOf(item.component, "dtstart")) : null;
    if (!endAt || endAt < startAt) {
      endAt = new Date(startAt.getTime() + (allDay ? 86_400_000 : 0));
    }
    if (endAt <= from && !(endAt.getTime() === startAt.getTime() && startAt >= from)) return;
    if (startAt >= to) return;
    results.push({
      uid: item.uid,
      title: item.summary?.trim() || "Untitled event",
      location: text(item.component, "location"),
      notes: text(item.component, "description"),
      start: startAt,
      end: endAt,
      allDay,
    });
  };

  for (const event of masters.values()) {
    if (!event.isRecurring()) {
      add(event, event.startDate, event.endDate);
      continue;
    }
    const iterator = event.iterator();
    for (let i = 0, next = iterator.next(); next && i < MAX_OCCURRENCES; i++, next = iterator.next()) {
      const details = event.getOccurrenceDetails(next);
      if (toInstant(details.startDate, tzidOf(details.item.component, "dtstart")) >= to) break;
      add(details.item, details.startDate, details.endDate);
    }
  }

  return results.sort((a, b) => a.start.getTime() - b.start.getTime());
}
