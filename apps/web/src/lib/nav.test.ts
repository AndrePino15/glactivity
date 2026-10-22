import { describe, expect, it } from "vitest";
import { isActive } from "./nav";

describe("isActive", () => {
  it("matches Today only on the root", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/lists", "/")).toBe(false);
  });

  it("matches a tab and its sub-pages", () => {
    expect(isActive("/lists", "/lists")).toBe(true);
    expect(isActive("/lists/shopping", "/lists")).toBe(true);
    expect(isActive("/listsy", "/lists")).toBe(false);
  });
});
