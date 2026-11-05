import { describe, expect, it } from "vitest";
import { missingIngredients, parseIngredients } from "./meals";

describe("parseIngredients", () => {
  it("splits on lines and commas, dropping blanks and repeats", () => {
    expect(parseIngredients("chicken, rice\n\nbroccoli\nRice")).toEqual(["chicken", "rice", "broccoli"]);
  });
});

describe("missingIngredients", () => {
  it("skips what's already on the list, ignoring case and plurals", () => {
    expect(missingIngredients(["Eggs", "oat milk"], ["egg", "Oat Milk", "spinach", "tomatoes", "tomato"])).toEqual([
      "spinach",
      "tomatoes",
    ]);
  });
});
