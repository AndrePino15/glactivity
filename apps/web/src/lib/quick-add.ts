"use client";

import { write } from "./db/client";
import type { ISODate } from "./dates";
import { parseQuickReminder } from "./quick-reminder";
import { bestMatch, type SearchKind, type SearchResult } from "./search";

export async function addShoppingItem(title: string) {
  await write((db) => db.from("list_items").insert({ list: "shopping", title }));
}

export async function addQuickReminder(text: string, today: ISODate) {
  const reminder = parseQuickReminder(text, today);
  await write((db) => db.from("reminders").insert({ ...reminder, notify_days_before: 3 }));
  return reminder;
}

/** Adds a film, book or album, with its cover when the search finds that exact title. */
export async function addMediaItem(kind: SearchKind, title: string) {
  let match: SearchResult | null = null;
  try {
    const response = await fetch(`/api/search?kind=${kind}&q=${encodeURIComponent(title)}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (response.ok) match = bestMatch(await response.json(), title);
  } catch {
    // No cover then; the item is still added.
  }
  const meta = Object.fromEntries(
    Object.entries({ artwork: match?.artwork, url: match?.url, year: match?.year }).filter(([, v]) => v),
  );
  await write((db) =>
    db.from("list_items").insert({
      list: kind,
      title: match?.title ?? title,
      subtitle: match?.subtitle ?? null,
      meta,
    }),
  );
}
