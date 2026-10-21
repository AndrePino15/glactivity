"use client";

import { useEffect } from "react";
import { applyTheme, readThemePreference } from "@/lib/theme";

/** Re-applies a saved Day/Night choice to the status-bar colour after load. */
export function ThemeSync() {
  useEffect(() => {
    applyTheme(readThemePreference());
  }, []);
  return null;
}
