"use client";

import useSWR, { mutate as globalMutate } from "swr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";

type QueryResult<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;

/**
 * Reads from Supabase with SWR caching (instant on revisit, refreshed when the
 * app comes back into focus). A null key skips the query. In preview mode,
 * or while loading, `data` is the fallback.
 */
export function useDb<T>(
  key: string | null,
  query: (db: SupabaseClient) => QueryResult<T>,
  fallback: T,
) {
  const db = getSupabase();
  const swr = useSWR(db && key ? key : null, async () => {
    const { data, error } = await query(db!);
    if (error) throw new Error(error.message);
    return data ?? fallback;
  });
  return {
    data: swr.data ?? fallback,
    loaded: swr.data !== undefined,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}

/** Runs a write and throws if Supabase reports an error. */
export async function write<T>(run: (db: SupabaseClient) => QueryResult<T>): Promise<T | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data, error } = await run(db);
  if (error) throw new Error(error.message);
  return data;
}

/** Refetches every cached query whose key starts with one of these prefixes. */
export function refresh(...prefixes: string[]) {
  return globalMutate(
    (key) => typeof key === "string" && prefixes.some((prefix) => key.startsWith(prefix)),
  );
}
