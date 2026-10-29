import { describe, expect, it } from "vitest";
import { clearTickedBefore } from "./shopping";

const SATURDAY = 6;

describe("clearTickedBefore", () => {
  it("keeps this week's ticks until shopping day is over", () => {
    // Thursday 29 Oct: last Sunday was the 25th.
    expect(clearTickedBefore("2026-10-29", SATURDAY)).toBe("2026-10-25");
  });

  it("keeps everything on shopping day itself", () => {
    expect(clearTickedBefore("2026-10-31", SATURDAY)).toBe("2026-10-25");
  });

  it("clears the morning after shopping day", () => {
    expect(clearTickedBefore("2026-11-01", SATURDAY)).toBe("2026-11-01");
  });

  it("works for a Sunday shopping day", () => {
    expect(clearTickedBefore("2026-11-02", 0)).toBe("2026-11-02"); // Monday after
    expect(clearTickedBefore("2026-11-01", 0)).toBe("2026-10-26"); // Sunday itself
  });
});
