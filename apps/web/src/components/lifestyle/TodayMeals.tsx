"use client";

import { List, Row, Section } from "@/components/ui";
import type { ISODate } from "@/lib/dates";
import { useMealPlan } from "@/lib/db/hooks";
import styles from "./lifestyle.module.css";

/** What's planned to eat today. Hidden when nothing is planned. */
export function TodayMeals({ today }: { today: ISODate }) {
  const { data } = useMealPlan(today, today);
  if (data.length === 0) return null;
  const sorted = [...data].sort((a, b) => (a.slot === "lunch" ? -1 : 1) - (b.slot === "lunch" ? -1 : 1));
  return (
    <Section title="Meals">
      <List>
        {sorted.map((entry) => (
          <Row
            key={entry.id}
            leading={<span className={styles.slotLabel}>{entry.slot === "lunch" ? "Lunch" : "Dinner"}</span>}
            title={entry.title}
            href="/lifestyle/meals"
          />
        ))}
      </List>
    </Section>
  );
}
