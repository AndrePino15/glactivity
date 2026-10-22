import { describe, expect, it } from "vitest";
import { parseIcs } from "./ics";

const feed = (events: string) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Test//EN", events.trim(), "END:VCALENDAR"].join("\r\n");

const from = new Date("2026-10-01T00:00:00Z");
const to = new Date("2027-01-01T00:00:00Z");

describe("parseIcs", () => {
  it("reads UK wall-clock times either side of the clocks going back", () => {
    const events = parseIcs(
      feed(`
BEGIN:VEVENT
UID:a@soton
SUMMARY:COMP1215 Lecture
LOCATION:Building 32 / Room 1015
DTSTART;TZID=Europe/London:20261023T090000
DTEND;TZID=Europe/London:20261023T100000
END:VEVENT
BEGIN:VEVENT
UID:b@soton
SUMMARY:COMP1215 Lecture
DTSTART;TZID=Europe/London:20261030T090000
DTEND;TZID=Europe/London:20261030T100000
END:VEVENT`),
      from,
      to,
    );
    expect(events.map((e) => e.start.toISOString())).toEqual([
      "2026-10-23T08:00:00.000Z", // BST
      "2026-10-30T09:00:00.000Z", // GMT
    ]);
    expect(events[0]).toMatchObject({ title: "COMP1215 Lecture", location: "Building 32 / Room 1015", allDay: false });
  });

  it("treats Windows zone names and missing zones as UK time", () => {
    const [windows, floating] = parseIcs(
      feed(`
BEGIN:VEVENT
UID:w
SUMMARY:Windows zone
DTSTART;TZID=GMT Standard Time:20261020T140000
DTEND;TZID=GMT Standard Time:20261020T150000
END:VEVENT
BEGIN:VEVENT
UID:f
SUMMARY:Floating
DTSTART:20261021T140000
DTEND:20261021T150000
END:VEVENT`),
      from,
      to,
    );
    expect(windows.start.toISOString()).toBe("2026-10-20T13:00:00.000Z");
    expect(floating.start.toISOString()).toBe("2026-10-21T13:00:00.000Z");
  });

  it("keeps UTC times as they are", () => {
    const [event] = parseIcs(
      feed(`
BEGIN:VEVENT
UID:u
SUMMARY:UTC
DTSTART:20261020T140000Z
DTEND:20261020T150000Z
END:VEVENT`),
      from,
      to,
    );
    expect(event.start.toISOString()).toBe("2026-10-20T14:00:00.000Z");
  });

  it("expands weekly repeats, skipping excluded weeks and applying moved ones", () => {
    const events = parseIcs(
      feed(`
BEGIN:VEVENT
UID:weekly
SUMMARY:Lab
DTSTART;TZID=Europe/London:20261005T110000
DTEND;TZID=Europe/London:20261005T130000
RRULE:FREQ=WEEKLY;COUNT=5
EXDATE;TZID=Europe/London:20261012T110000
END:VEVENT
BEGIN:VEVENT
UID:weekly
RECURRENCE-ID;TZID=Europe/London:20261019T110000
SUMMARY:Lab (moved room)
DTSTART;TZID=Europe/London:20261019T150000
DTEND;TZID=Europe/London:20261019T170000
END:VEVENT`),
      from,
      to,
    );
    expect(events.map((e) => [e.title, e.start.toISOString()])).toEqual([
      ["Lab", "2026-10-05T10:00:00.000Z"],
      ["Lab (moved room)", "2026-10-19T14:00:00.000Z"],
      ["Lab", "2026-10-26T11:00:00.000Z"], // clocks went back on the 25th
      ["Lab", "2026-11-02T11:00:00.000Z"],
    ]);
  });

  it("drops cancelled events and anything outside the window", () => {
    const events = parseIcs(
      feed(`
BEGIN:VEVENT
UID:c
SUMMARY:Cancelled
STATUS:CANCELLED
DTSTART:20261020T140000Z
DTEND:20261020T150000Z
END:VEVENT
BEGIN:VEVENT
UID:old
SUMMARY:Last year
DTSTART:20250920T140000Z
DTEND:20250920T150000Z
END:VEVENT`),
      from,
      to,
    );
    expect(events).toEqual([]);
  });

  it("reads all-day events as dates", () => {
    const [event] = parseIcs(
      feed(`
BEGIN:VEVENT
UID:d
SUMMARY:Reading week
DTSTART;VALUE=DATE:20261109
DTEND;VALUE=DATE:20261114
END:VEVENT`),
      from,
      to,
    );
    expect(event).toMatchObject({ allDay: true, title: "Reading week" });
    expect(event.start.toISOString()).toBe("2026-11-09T00:00:00.000Z");
    expect(event.end.toISOString()).toBe("2026-11-14T00:00:00.000Z");
  });
});
