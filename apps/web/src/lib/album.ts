"use client";

import { useEffect } from "react";
import { startOfWeek, type ISODate } from "./dates";
import { refresh, write } from "./db/client";
import { useAlbumPicks, useList } from "./db/hooks";
import type { AlbumPick, ListItem } from "./db/types";

/** Picks a random album from the "Up next" list, avoiding the one just skipped. */
export function chooseAlbum(candidates: ListItem[], avoid?: string | null, random = Math.random): ListItem | null {
  const pool = candidates.filter((c) => c.status === "open" && c.id !== avoid);
  return pool.length ? pool[Math.floor(random() * pool.length)] : null;
}

async function makePick(week: ISODate, album: ListItem) {
  await write((db) =>
    db.from("album_picks").upsert(
      {
        week_start: week,
        list_item_id: album.id,
        title: album.title,
        artist: album.subtitle,
        artwork_url: album.meta.artwork ?? null,
        apple_music_url: album.meta.url ?? null,
      },
      { onConflict: "user_id,week_start", ignoreDuplicates: true },
    ),
  );
  await write((db) => db.from("list_items").update({ status: "active" }).eq("id", album.id));
}

const picking = new Set<ISODate>();

/**
 * This week's album. On the first visit of a new week it retires last week's
 * album to "Heard" and picks a new one from the albums list.
 */
export function useAlbumOfTheWeek(today: ISODate | null) {
  const week = today ? startOfWeek(today) : null;
  const picks = useAlbumPicks();
  const albums = useList("albums");
  const current = picks.data.find((p) => p.week_start === week) ?? null;

  useEffect(() => {
    if (!week || !picks.loaded || !albums.loaded || current || picking.has(week)) return;
    const album = chooseAlbum(albums.data);
    if (!album) return;
    picking.add(week);
    void (async () => {
      const finished = albums.data.filter((a) => a.status === "active").map((a) => a.id);
      if (finished.length) {
        await write((db) =>
          db
            .from("list_items")
            .update({ status: "done", completed_at: new Date().toISOString() })
            .in("id", finished),
        );
      }
      await makePick(week, album);
      await refresh("album-picks", "items:albums");
    })();
  }, [week, picks.loaded, albums.loaded, albums.data, current]);

  async function reroll() {
    if (!week || !current) return;
    const next = chooseAlbum(albums.data, current.list_item_id);
    if (!next) return;
    await write((db) => db.from("album_picks").delete().eq("id", current.id));
    if (current.list_item_id) {
      await write((db) => db.from("list_items").update({ status: "open" }).eq("id", current.list_item_id!));
    }
    await makePick(week, next);
    await refresh("album-picks", "items:albums");
  }

  const canReroll = albums.data.some((a) => a.status === "open" && a.id !== current?.list_item_id);
  const history: AlbumPick[] = picks.data.filter((p) => p.week_start !== week);
  return {
    current,
    history,
    reroll,
    canReroll,
    loaded: picks.loaded && albums.loaded,
    hasAlbums: albums.data.some((a) => a.status !== "done"),
  };
}
