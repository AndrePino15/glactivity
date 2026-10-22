"use client";

import { useSyncExternalStore } from "react";

const MINUTE = 60_000;

function subscribe(onChange: () => void) {
  const id = setInterval(onChange, MINUTE);
  return () => clearInterval(id);
}

// Rounded to the minute so the snapshot stays stable between ticks.
const getSnapshot = () => Math.floor(Date.now() / MINUTE) * MINUTE;
const getServerSnapshot = () => null;

/**
 * The current time, updated every minute. Null during prerender, because the
 * static shell can't know the visitor's clock.
 */
export function useNow(): Date | null {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return now === null ? null : new Date(now);
}
