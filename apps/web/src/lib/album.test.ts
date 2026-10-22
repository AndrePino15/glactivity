import { describe, expect, it } from "vitest";
import type { ListItem } from "./db/types";
import { chooseAlbum } from "./album";

const album = (id: string, status: ListItem["status"] = "open"): ListItem => ({
  id,
  list: "albums",
  title: id,
  subtitle: null,
  notes: null,
  meta: {},
  status,
  position: 0,
  created_at: "",
  completed_at: null,
});

describe("chooseAlbum", () => {
  it("picks only from albums still up next", () => {
    const pick = chooseAlbum([album("heard", "done"), album("now", "active"), album("next")], null, () => 0.99);
    expect(pick?.id).toBe("next");
  });

  it("avoids the album being skipped", () => {
    expect(chooseAlbum([album("a"), album("b")], "a", () => 0)?.id).toBe("b");
  });

  it("returns nothing when the list is empty", () => {
    expect(chooseAlbum([album("a")], "a")).toBeNull();
  });
});
