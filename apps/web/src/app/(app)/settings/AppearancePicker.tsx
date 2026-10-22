"use client";

import { useSyncExternalStore } from "react";
import { Card } from "@/components/ui";
import {
  applyTheme,
  readThemePreference,
  subscribeToTheme,
  type ThemePreference,
} from "@/lib/theme";
import styles from "./settings.module.css";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Day" },
  { value: "dark", label: "Night" },
];

export function AppearancePicker() {
  const preference = useSyncExternalStore(
    subscribeToTheme,
    readThemePreference,
    () => "system" as const,
  );

  return (
    <Card className={styles.padded}>
      <div className={styles.segmented} role="radiogroup" aria-label="Appearance">
        {OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            role="radio"
            aria-checked={preference === value}
            className={styles.segment}
            onClick={() => applyTheme(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className={styles.hint}>
        Auto follows your phone: day theme when it’s light, the starry night theme when it’s dark.
      </p>
    </Card>
  );
}
