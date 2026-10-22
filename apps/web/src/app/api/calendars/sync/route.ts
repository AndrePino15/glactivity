import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { detectBreaks } from "@/lib/calendar/breaks";
import { parseIcs } from "@/lib/calendar/ics";
import { toLondonDate } from "@/lib/calendar/london";
import type { CalendarSource, Period } from "@/lib/db/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DAY = 86_400_000;
const MAX_FEED_BYTES = 10 * 1024 * 1024;
const CHUNK = 500;

type SyncResult = { id: string; name: string; events: number; error: string | null };

/**
 * POST /api/calendars/sync — refreshes every enabled calendar feed for the
 * signed-in user, then re-detects term breaks. Runs as that user, so RLS
 * keeps it to their own rows.
 */
export async function POST() {
  const db = await createSupabaseServerClient();
  const { data: auth } = await db.auth.getClaims();
  if (!auth?.claims) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: sources, error } = await db
    .from("calendar_sources")
    .select("*")
    .eq("kind", "ics")
    .eq("enabled", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: SyncResult[] = [];
  for (const source of (sources ?? []) as CalendarSource[]) {
    results.push(await syncSource(db, source));
  }
  await refreshBreaks(db);
  return NextResponse.json(results);
}

async function fetchFeed(url: string): Promise<string> {
  const target = new URL(url.trim().replace(/^webcals?:\/\//i, "https://"));
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    throw new Error("Calendar links must start with https:// or webcal://");
  }
  const response = await fetch(target, {
    headers: { Accept: "text/calendar, */*" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`The calendar link answered ${response.status}`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_FEED_BYTES) throw new Error("That calendar is too large");
  const text = await response.text();
  if (text.length > MAX_FEED_BYTES) throw new Error("That calendar is too large");
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("That link didn’t return a calendar");
  return text;
}

async function syncSource(db: SupabaseClient, source: CalendarSource): Promise<SyncResult> {
  const result: SyncResult = { id: source.id, name: source.name, events: 0, error: null };
  try {
    const now = Date.now();
    const from = new Date(now - 30 * DAY);
    const to = new Date(now + 240 * DAY);
    const parsed = parseIcs(await fetchFeed(source.url ?? ""), from, to);

    // Feeds occasionally repeat an occurrence; upsert can't touch a row twice.
    const rows = new Map<string, Record<string, unknown>>();
    for (const event of parsed) {
      rows.set(`${event.uid}|${event.start.getTime()}`, {
        source_id: source.id,
        external_uid: event.uid,
        title: event.title,
        location: event.location,
        notes: event.notes,
        starts_at: event.start.toISOString(),
        ends_at: event.end.toISOString(),
        all_day: event.allDay,
        category: /\bexam/i.test(event.title) ? "exam" : source.default_category,
      });
    }
    const batch = [...rows.values()];
    for (let i = 0; i < batch.length; i += CHUNK) {
      const { error } = await db
        .from("events")
        .upsert(batch.slice(i, i + CHUNK), { onConflict: "source_id,external_uid,starts_at" });
      if (error) throw new Error(error.message);
    }

    // Anything in the window that's no longer in the feed was cancelled or moved.
    const { data: existing, error: listError } = await db
      .from("events")
      .select("id, external_uid, starts_at")
      .eq("source_id", source.id)
      .gte("starts_at", from.toISOString())
      .lt("starts_at", to.toISOString());
    if (listError) throw new Error(listError.message);
    const stale = (existing ?? [])
      .filter((e) => !rows.has(`${e.external_uid}|${new Date(e.starts_at).getTime()}`))
      .map((e) => e.id as string);
    for (let i = 0; i < stale.length; i += CHUNK) {
      const { error } = await db.from("events").delete().in("id", stale.slice(i, i + CHUNK));
      if (error) throw new Error(error.message);
    }

    result.events = batch.length;
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Couldn’t update this calendar";
  }
  await db
    .from("calendar_sources")
    .update(
      result.error
        ? { last_error: result.error }
        : { last_error: null, last_synced_at: new Date().toISOString() },
    )
    .eq("id", source.id);
  return result;
}

/** Replaces unconfirmed detected breaks with a fresh detection from lecture days. */
async function refreshBreaks(db: SupabaseClient) {
  const today = toLondonDate(new Date());
  const { data: lectures } = await db
    .from("events")
    .select("starts_at")
    .eq("category", "lecture")
    .gte("starts_at", new Date(Date.now() - 120 * DAY).toISOString());
  const days = (lectures ?? []).map((e) => toLondonDate(e.starts_at as string));

  const { data: periods } = await db.from("periods").select("*").eq("kind", "break");
  const confirmed = ((periods ?? []) as Period[]).filter((p) => p.confirmed);
  await db.from("periods").delete().eq("source", "auto").eq("confirmed", false);

  const fresh = detectBreaks(days)
    .filter((gap) => gap.ends_on >= today)
    .filter((gap) => !confirmed.some((p) => p.starts_on <= gap.ends_on && gap.starts_on <= p.ends_on))
    .map((gap) => ({ ...gap, kind: "break", source: "auto", confirmed: false }));
  if (fresh.length) await db.from("periods").insert(fresh);
}
