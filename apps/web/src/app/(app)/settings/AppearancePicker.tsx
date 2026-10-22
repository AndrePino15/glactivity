"use client";

import { useSyncExternalStore } from "react";
import { Note, Segmented } from "@/components/ui";
import { applyTheme, readThemePreference, subscribeToTheme, type ThemePreference } from "@/lib/theme";
import styles from "./settings.module.css";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Day" },
  { value: "dark", label: "Night" },
];

export function AppearancePicker() {
  const preference = useSyncExternalStore(subscribeToTheme, readThemePreference, () => "system" as const);
  return (
    <div className={styles.stack}>
      <Segmented label="Appearance" value={preference} options={OPTIONS} onChange={applyTheme} />
      <Note>Auto follows your phone: day theme when it’s light, the starry night theme when it’s dark.</Note>
    </div>
  );
}
