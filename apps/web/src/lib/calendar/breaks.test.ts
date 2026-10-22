import { describe, expect, it } from "vitest";
import type { Period } from "../db/types";
import { breakToAskAbout, countryOn, detectBreaks } from "./breaks";

const period = (p: Partial<Period>): Period => ({
  id: "p",
  kind: "break",
  label: null,
  country: null,
  starts_on: "2026-12-12",
  ends_on: "2027-01-10",
  source: "auto",
  confirmed: false,
  ...p,
});

describe("detectBreaks", () => {
  it("finds Christmas and ignores weekends", () => {
    const days = ["2026-12-03", "2026-12-04", "2026-12-07", "2026-12-11", "2027-01-11", "2027-01-12"];
    expect(detectBreaks(days)).toEqual([{ starts_on: "2026-12-12", ends_on: "2027-01-10" }]);
  });

  it("counts a reading week as a break", () => {
    expect(detectBreaks(["2026-11-06", "2026-11-16"])).toEqual([
      { starts_on: "2026-11-07", ends_on: "2026-11-15" },
    ]);
  });
});

describe("countryOn", () => {
  it("uses a confirmed trip, otherwise the Settings choice", () => {
    const trip = period({ confirmed: true, country: "PT" });
    expect(countryOn("2026-12-25", [trip], "GB")).toBe("PT");
    expect(countryOn("2027-01-11", [trip], "GB")).toBe("GB");
    expect(countryOn("2026-12-25", [period({ country: "PT" })], "GB")).toBe("GB");
  });
});

describe("breakToAskAbout", () => {
  it("asks about an unconfirmed break that's close or under way", () => {
    expect(breakToAskAbout([period({})], "2026-11-25")?.starts_on).toBe("2026-12-12");
    expect(breakToAskAbout([period({})], "2026-12-20")?.starts_on).toBe("2026-12-12");
    expect(breakToAskAbout([period({})], "2026-11-01")).toBeNull();
    expect(breakToAskAbout([period({ confirmed: true })], "2026-12-01")).toBeNull();
  });
});
