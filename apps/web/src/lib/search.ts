import type { ListKind } from "./db/types";

export type SearchKind = Exclude<ListKind, "shopping">;

export type SearchResult = {
  title: string;
  subtitle: string | null;
  artwork: string | null;
  url: string | null;
  year: string | null;
};

type ItunesItem = {
  collectionName?: string;
  trackName?: string;
  artistName?: string;
  artworkUrl100?: string;
  collectionViewUrl?: string;
  trackViewUrl?: string;
  releaseDate?: string;
};

/** Apple's 100px artwork URLs can be asked for at any size. */
const largeArtwork = (url?: string) => (url ? url.replace(/\/\d+x\d+bb\./, "/600x600bb.") : null);

export function mapItunes(json: unknown, kind: "albums" | "movies"): SearchResult[] {
  const results = (json as { results?: ItunesItem[] })?.results ?? [];
  return results.map((r) => ({
    title: (kind === "albums" ? r.collectionName : r.trackName) ?? "Untitled",
    subtitle: r.artistName ?? null,
    artwork: largeArtwork(r.artworkUrl100),
    url: (kind === "albums" ? r.collectionViewUrl : r.trackViewUrl) ?? null,
    year: r.releaseDate?.slice(0, 4) ?? null,
  }));
}

type OpenLibraryDoc = { key?: string; title?: string; author_name?: string[]; cover_i?: number; first_publish_year?: number };

export function mapOpenLibrary(json: unknown): SearchResult[] {
  const docs = (json as { docs?: OpenLibraryDoc[] })?.docs ?? [];
  return docs.map((d) => ({
    title: d.title ?? "Untitled",
    subtitle: d.author_name?.slice(0, 2).join(", ") ?? null,
    artwork: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null,
    url: d.key ? `https://openlibrary.org${d.key}` : null,
    year: d.first_publish_year ? String(d.first_publish_year) : null,
  }));
}

export function searchUrl(kind: SearchKind, query: string): string {
  const q = encodeURIComponent(query);
  switch (kind) {
    case "albums":
      return `https://itunes.apple.com/search?term=${q}&media=music&entity=album&country=GB&limit=12`;
    case "movies":
      return `https://itunes.apple.com/search?term=${q}&media=movie&entity=movie&country=GB&limit=12`;
    case "books":
      return `https://openlibrary.org/search.json?q=${q}&limit=12&fields=key,title,author_name,cover_i,first_publish_year`;
  }
}
