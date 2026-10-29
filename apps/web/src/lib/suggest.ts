import type { ISODate } from "./dates";
import type { ListItem } from "./db/types";

/** A small stable hash, so a week always maps to the same pick. */
function hash(text: string): number {
  let h = 0;
  for (const char of text) h = (h * 31 + char.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * What to watch next: whatever you're already watching, otherwise one film
 * from the list that stays the same all week (so it doesn't jump around
 * every time you open the app).
 */
export function watchNext(movies: ListItem[], weekStart: ISODate): { item: ListItem; watching: boolean } | null {
  const watching = movies.find((m) => m.status === "active");
  if (watching) return { item: watching, watching: true };
  const queue = movies.filter((m) => m.status === "open").sort((a, b) => a.position - b.position);
  if (!queue.length) return null;
  return { item: queue[hash(weekStart) % queue.length], watching: false };
}
