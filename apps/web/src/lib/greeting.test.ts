import { describe, expect, it } from "vitest";
import { formatDayHeading, greetingFor } from "./greeting";

const at = (hour: number) => new Date(2026, 9, 21, hour, 30);

describe("greetingFor", () => {
  it.each([
    [0, "Still up?"],
    [4, "Still up?"],
    [5, "Good morning"],
    [11, "Good morning"],
    [12, "Good afternoon"],
    [17, "Good afternoon"],
    [18, "Good evening"],
    [21, "Good evening"],
    [22, "Good night"],
    [23, "Good night"],
  ])("at %i:30 says %s", (hour, expected) => {
    expect(greetingFor(at(hour))).toBe(expected);
  });
});

describe("formatDayHeading", () => {
  it("formats weekday, day and month in British order", () => {
    expect(formatDayHeading(new Date(2026, 9, 21))).toBe("Wednesday 21 October");
  });
});
