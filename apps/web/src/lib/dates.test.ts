import { describe, expect, it } from "vitest";
import { addDays, addMonths, daysBetween, relativeDay, startOfWeek } from "./dates";

describe("dates", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts days across the clocks changing", () => {
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("finds the Monday of the week", () => {
    expect(startOfWeek("2026-10-22")).toBe("2026-10-19"); // Thursday
    expect(startOfWeek("2026-10-19")).toBe("2026-10-19"); // Monday
    expect(startOfWeek("2026-10-25")).toBe("2026-10-19"); // Sunday
  });

  it("adds months without spilling into the next month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-02-28", 1, 31)).toBe("2026-03-31");
    expect(addMonths("2026-11-15", 2)).toBe("2027-01-15");
  });

  it("describes nearby days in words", () => {
    expect(relativeDay("2026-10-22", "2026-10-22")).toBe("today");
    expect(relativeDay("2026-10-22", "2026-10-23")).toBe("tomorrow");
    expect(relativeDay("2026-10-22", "2026-10-27")).toBe("in 5 days");
    expect(relativeDay("2026-10-22", "2026-10-20")).toBe("2 days ago");
  });
});
