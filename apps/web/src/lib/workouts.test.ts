import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "./db/types";
import { planFor, suggestSlot, TEMPLATES } from "./workouts";

const at = (day: string, from: string, to: string): CalendarEvent => ({
  id: from,
  source_id: null,
  external_uid: null,
  title: "Lecture",
  location: null,
  notes: null,
  starts_at: new Date(`${day}T${from}:00`).toISOString(),
  ends_at: new Date(`${day}T${to}:00`).toISOString(),
  all_day: false,
  category: "lecture",
});

const DAY = "2026-11-05";

describe("suggestSlot", () => {
  it("uses the preferred time when it's free", () => {
    expect(suggestSlot(DAY, [at(DAY, "09:00", "11:00")], "17:30")).toBe("17:30");
  });

  it("moves around a clash to the nearest free time", () => {
    expect(suggestSlot(DAY, [at(DAY, "16:00", "18:00")], "17:30")).toBe("18:00");
  });

  it("finds a gap between lectures when the evening is busy", () => {
    const events = [at(DAY, "09:00", "12:00"), at(DAY, "14:00", "16:00"), at(DAY, "16:00", "21:30")];
    expect(suggestSlot(DAY, events, "17:30")).toBe("12:45");
  });

  it("gives up when nothing is long enough", () => {
    const events = [at(DAY, "07:00", "12:00"), at(DAY, "12:30", "21:30")];
    expect(suggestSlot(DAY, events, "17:30")).toBeNull();
  });

  it("ignores all-day events", () => {
    expect(suggestSlot(DAY, [{ ...at(DAY, "00:00", "23:59"), all_day: true }], "17:30")).toBe("17:30");
  });
});

describe("templates", () => {
  it("cover all seven days", () => {
    for (const template of TEMPLATES) expect(Object.keys(template.days).sort()).toEqual(["0", "1", "2", "3", "4", "5", "6"]);
  });

  it("finds the plan for a date by weekday", () => {
    const plan = [{ id: "a", weekday: 4, title: "Rest", kind: "rest" as const, preferred_time: null, details: null }];
    expect(planFor("2026-11-05", plan)?.id).toBe("a"); // a Thursday
  });
});
