"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { addDays, fromISODate, toISODate, type ISODate } from "@/lib/dates";
import type { Holiday } from "@/lib/holidays";
import { useNow } from "@/lib/use-now";
import { refresh, useDb } from "./client";
import type {
  AlbumPick,
  CalendarEvent,
  CalendarSource,
  Game,
  GamePlay,
  ListItem,
  ListKind,
  Period,
  Profile,
  Reminder,
} from "./types";

/** Today's date on this device, or null while prerendering. */
export function useToday(): ISODate | null {
  const now = useNow();
  return now ? toISODate(now) : null;
}

export function useProfile() {
  return useDb<Profile | null>(
    "profile",
    (db) => db.from("profiles").select("*").maybeSingle(),
    null,
  );
}

export function useSources() {
  return useDb<CalendarSource[]>(
    "sources",
    (db) => db.from("calendar_sources").select("*").order("created_at"),
    [],
  );
}

/** Events overlapping the local days [from, to], inclusive. */
export function useEvents(from: ISODate | null, to: ISODate | null) {
  return useDb<CalendarEvent[]>(
    from && to ? `events:${from}:${to}` : null,
    (db) =>
      db
        .from("events")
        .select("*")
        .lt("starts_at", fromISODate(addDays(to!, 1)).toISOString())
        .gt("ends_at", fromISODate(from!).toISOString())
        .order("starts_at"),
    [],
  );
}

export function usePeriods() {
  return useDb<Period[]>("periods", (db) => db.from("periods").select("*").order("starts_on"), []);
}

const fetchJson = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
};

/** UK and Portuguese public holidays in range (both; callers pick by location). */
export function useHolidays(from: ISODate | null, to: ISODate | null) {
  const { data } = useSWR<Holiday[]>(
    from && to ? `/api/holidays?from=${from}&to=${to}` : null,
    fetchJson,
    { revalidateOnFocus: false },
  );
  return data ?? [];
}

export function useList(list: ListKind) {
  return useDb<ListItem[]>(
    `items:${list}`,
    (db) => db.from("list_items").select("*").eq("list", list).order("position"),
    [],
  );
}

export function useReminders() {
  return useDb<Reminder[]>(
    "reminders",
    (db) => db.from("reminders").select("*").eq("archived", false).order("due_on"),
    [],
  );
}

export function useGames() {
  return useDb<Game[]>(
    "games",
    (db) => db.from("games").select("*").eq("enabled", true).order("position"),
    [],
  );
}

export function usePlays(day: ISODate | null) {
  return useDb<GamePlay[]>(
    day ? `plays:${day}` : null,
    (db) => db.from("game_plays").select("game_id, played_on").eq("played_on", day!),
    [],
  );
}

export function useAlbumPicks() {
  return useDb<AlbumPick[]>(
    "album-picks",
    (db) => db.from("album_picks").select("*").order("week_start", { ascending: false }).limit(12),
    [],
  );
}

const SYNC_EVERY_MS = 3 * 60 * 60 * 1000;
// A feed that keeps failing stays "stale"; don't retry it on every render.
const RETRY_AFTER_MS = 10 * 60 * 1000;
let syncing: Promise<void> | null = null;
let lastAttempt = 0;

/** Refreshes calendar feeds in the background when they're more than 3 hours old. */
export function useCalendarAutoSync() {
  const { data: sources, loaded } = useSources();
  useEffect(() => {
    if (!loaded || syncing || Date.now() - lastAttempt < RETRY_AFTER_MS) return;
    const stale = sources.some(
      (s) =>
        s.kind === "ics" &&
        s.enabled &&
        (!s.last_synced_at || Date.now() - new Date(s.last_synced_at).getTime() > SYNC_EVERY_MS),
    );
    if (stale) void syncCalendars();
  }, [loaded, sources]);
}

export function syncCalendars(): Promise<void> {
  lastAttempt = Date.now();
  syncing ??= fetch("/api/calendars/sync", { method: "POST" })
    .then(() => refresh("events", "sources", "periods"))
    .then(() => undefined)
    .finally(() => {
      syncing = null;
    });
  return syncing;
}
