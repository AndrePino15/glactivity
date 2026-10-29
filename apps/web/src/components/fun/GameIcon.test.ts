import { describe, expect, it } from "vitest";
import { gameIconKey } from "./GameIcon";

describe("gameIconKey", () => {
  it.each([
    ["Wordle", "https://www.nytimes.com/games/wordle/index.html", "wordle"],
    ["Worldle", "https://worldle.teuteuf.fr", "worldle"],
    ["The Mini", "https://www.nytimes.com/crosswords/game/mini", "mini"],
    ["Krillion", "https://krillion.io", "krillion"],
    ["My word game", "https://www.nytimes.com/games/wordle/index.html", "wordle"],
    ["Bandle", "https://bandle.app", null],
  ])("%s → %s", (name, url, key) => {
    expect(gameIconKey({ name, url })).toBe(key);
  });
});
