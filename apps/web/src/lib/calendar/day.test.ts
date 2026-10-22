import { describe, expect, it } from "vitest";
import type { CalendarEvent, Period } from "../db/types";
import { eventsOn, holidaysOn } from "./day";

const event = (e: Partial<CalendarEvent>): CalendarEvent => ({
  id: e.title ?? "e",
  source_id: null,
  external_uid: null,
  title: "Lecture",
  location: null,
  notes: null,
  starts_at: "2026-10-22T09:00:00Z",
  ends_at: "2026-10-22T10:00:00Z",
  all_day: false,
  category: "lecture",
  ...e,
});

describe("eventsOn", () => {
  it("lists all-day events first, then by start time", () => {
    const list = eventsOn("2026-10-22", [
      event({ title: "Late", starts_at: "2026-10-22T15:00:00Z", ends_at: "2026-10-22T16:00:00Z" }),
      event({ title: "Early" }),
      event({ title: "Open day", all_day: true, starts_at: "2026-10-22T00:00:00Z", ends_at: "2026-10-23T00:00:00Z" }),
      event({ title: "Tomorrow", starts_at: "2026-10-23T09:00:00Z", ends_at: "2026-10-23T10:00:00Z" }),
    ]);
    expect(list.map((e) => e.title)).toEqual(["Open day", "Early", "Late"]);
  });

  it("spreads multi-day all-day events over each day (end date is exclusive)", () => {
    const week = event({ title: "Reading week", all_day: true, starts_at: "2026-11-09T00:00:00Z", ends_at: "2026-11-14T00:00:00Z" });
    expect(eventsOn("2026-11-13", [week])).toHaveLength(1);
    expect(eventsOn("2026-11-14", [week])).toHaveLength(0);
  });
});

describe("holidaysOn", () => {
  const holidays = [
    { country: "GB" as const, date: "2026-12-25", name: "Christmas Day" },
    { country: "PT" as const, date: "2026-12-25", name: "Natal" },
  ];
  const trip: Period = {
    id: "t",
    kind: "break",
    label: null,
    country: "PT",
    starts_on: "2026-12-12",
    ends_on: "2027-01-10",
    source: "auto",
    confirmed: true,
  };

  it("shows the holiday for where you are", () => {
    expect(holidaysOn("2026-12-25", holidays, [], "GB").map((h) => h.name)).toEqual(["Christmas Day"]);
    expect(holidaysOn("2026-12-25", holidays, [trip], "GB").map((h) => h.name)).toEqual(["Natal"]);
  });
});
