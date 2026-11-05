import { describe, expect, it } from "vitest";
import type { CalendarEvent, Period } from "./db/types";
import { adviseWorkout, modeOn } from "./modes";

const exam = (iso: string): CalendarEvent => ({
  id: iso,
  source_id: null,
  external_uid: null,
  title: "COMP1215 exam",
  location: null,
  notes: null,
  starts_at: `${iso}T09:30:00Z`,
  ends_at: `${iso}T11:30:00Z`,
  all_day: false,
  category: "exam",
});

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

describe("modeOn", () => {
  it("is exam season when an exam is within a week", () => {
    expect(modeOn("2027-01-08", [exam("2027-01-12")], [], "GB").kind).toBe("exams");
    expect(modeOn("2027-01-01", [exam("2027-01-12")], [], "GB").kind).toBe("term");
  });

  it("knows when you're home for a break", () => {
    expect(modeOn("2026-12-20", [], [trip], "GB")).toEqual({ kind: "break", inPortugal: true, exams: [] });
    expect(modeOn("2026-11-20", [], [trip], "GB")).toEqual({ kind: "term", inPortugal: false, exams: [] });
  });
});

describe("adviseWorkout", () => {
  const gym = { kind: "gym" as const };

  it("swaps the gym for home or a run in Portugal", () => {
    expect(adviseWorkout(gym, modeOn("2026-12-20", [], [trip], "GB")).instead).toBe("home");
  });

  it("suggests keeping it light in exam week", () => {
    const advice = adviseWorkout(gym, modeOn("2027-01-08", [exam("2027-01-12")], [], "GB"));
    expect(advice).toMatchObject({ instead: null });
    expect(advice.note).toMatch(/Exam week/);
  });

  it("leaves rest days and normal days alone", () => {
    expect(adviseWorkout({ kind: "rest" }, modeOn("2026-12-20", [], [trip], "GB"))).toEqual({ instead: null, note: null });
    expect(adviseWorkout(gym, modeOn("2026-11-20", [], [], "GB"))).toEqual({ instead: null, note: null });
  });
});
