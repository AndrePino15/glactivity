import { describe, expect, it } from "vitest";
import { bestMatch, mapItunes, mapOpenLibrary, searchUrl } from "./search";

describe("search mapping", () => {
  it("turns iTunes albums into title, artist, large artwork and Apple Music link", () => {
    const json = {
      results: [
        {
          collectionName: "In Rainbows",
          artistName: "Radiohead",
          artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/Music/x/100x100bb.jpg",
          collectionViewUrl: "https://music.apple.com/gb/album/in-rainbows/1109714933",
          releaseDate: "2007-10-10T07:00:00Z",
        },
      ],
    };
    expect(mapItunes(json, "albums")).toEqual([
      {
        title: "In Rainbows",
        subtitle: "Radiohead",
        artwork: "https://is1-ssl.mzstatic.com/image/thumb/Music/x/600x600bb.jpg",
        url: "https://music.apple.com/gb/album/in-rainbows/1109714933",
        year: "2007",
      },
    ]);
  });

  it("uses the track name for films", () => {
    const [film] = mapItunes({ results: [{ trackName: "Paddington 2", artistName: "Paul King" }] }, "movies");
    expect(film).toMatchObject({ title: "Paddington 2", subtitle: "Paul King", artwork: null });
  });

  it("builds Open Library covers and links", () => {
    const json = { docs: [{ key: "/works/OL1W", title: "Piranesi", author_name: ["Susanna Clarke"], cover_i: 42, first_publish_year: 2020 }] };
    expect(mapOpenLibrary(json)).toEqual([
      {
        title: "Piranesi",
        subtitle: "Susanna Clarke",
        artwork: "https://covers.openlibrary.org/b/id/42-L.jpg",
        url: "https://openlibrary.org/works/OL1W",
        year: "2020",
      },
    ]);
  });

  it("searches the UK store", () => {
    expect(searchUrl("albums", "in rainbows")).toContain("term=in%20rainbows&media=music&entity=album&country=GB");
  });
});

describe("bestMatch", () => {
  const result = (title: string) => ({ title, subtitle: null, artwork: null, url: null, year: null });

  it("prefers an exact title, then an edition of it", () => {
    expect(bestMatch([result("In Rainbows (Deluxe Edition)"), result("In Rainbows")], "in rainbows")?.title).toBe(
      "In Rainbows",
    );
    expect(bestMatch([result("In Rainbows (Deluxe Edition)")], "In Rainbows")?.title).toBe(
      "In Rainbows (Deluxe Edition)",
    );
  });

  it("ignores accents and punctuation", () => {
    expect(bestMatch([result("Amélie")], "amelie")?.title).toBe("Amélie");
  });

  it("returns nothing rather than a different title", () => {
    expect(bestMatch([result("Rainbows End")], "In Rainbows")).toBeNull();
  });
});
