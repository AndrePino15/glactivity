import { describe, expect, it } from "vitest";
import type { ListItem } from "./db/types";
import { watchNext } from "./suggest";

const film = (id: string, status: ListItem["status"] = "open", position = 0): ListItem => ({
  id,
  list: "movies",
  title: id,
  subtitle: null,
  notes: null,
  meta: {},
  status,
  position,
  created_at: "",
  completed_at: null,
});

describe("watchNext", () => {
  it("keeps showing what you're already watching", () => {
    expect(watchNext([film("a"), film("b", "active")], "2026-10-26")).toEqual({ item: film("b", "active"), watching: true });
  });

  it("picks the same film all week, and can change the next week", () => {
    const films = [film("a", "open", 1), film("b", "open", 2), film("c", "open", 3)];
    const thisWeek = watchNext(films, "2026-10-26")?.item.id;
    expect(watchNext([...films].reverse(), "2026-10-26")?.item.id).toBe(thisWeek);
    const weeks = ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"].map((w) => watchNext(films, w)?.item.id);
    expect(new Set([thisWeek, ...weeks]).size).toBeGreaterThan(1);
  });

  it("skips watched films and handles an empty list", () => {
    expect(watchNext([film("done", "done")], "2026-10-26")).toBeNull();
  });
});
