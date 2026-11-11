"use client";

import { X } from "lucide-react";
import { List, Row, Section } from "@/components/ui";
import { addDays, type ISODate } from "@/lib/dates";
import { write } from "@/lib/db/client";
import { useList, useMealPlan, useSuggestionFeedback, useWorkoutLogs, useWorkoutPlan } from "@/lib/db/hooks";
import type { CalendarEvent } from "@/lib/db/types";
import type { Mode } from "@/lib/modes";
import { suggestionsFor } from "@/lib/suggestions";
import { useNow } from "@/lib/use-now";
import { planFor } from "@/lib/workouts";
import styles from "./TodaySuggestions.module.css";

/** "For today": a few ideas from the rules in lib/suggestions. Hidden when there are none. */
export function TodaySuggestions({
  today,
  events,
  mode,
  daysToShopping,
}: {
  today: ISODate;
  events: CalendarEvent[];
  mode: Mode;
  daysToShopping: number | null;
}) {
  const now = useNow();
  const plan = useWorkoutPlan();
  const logs = useWorkoutLogs(addDays(today, -7), today);
  const meals = useMealPlan(today, addDays(today, 3));
  const books = useList("books");
  const feedback = useSuggestionFeedback(today);

  if (!now || !plan.loaded || !feedback.loaded) return null;

  const suggestions = suggestionsFor({
    today,
    now,
    events,
    mode,
    workoutLogs: logs.data,
    planToday: plan.data.length ? planFor(today, plan.data) : null,
    meals: meals.data,
    daysToShopping,
    reading: books.data.find((b) => b.status === "active") ?? null,
    handled: new Set(feedback.data.map((f) => f.key)),
  });
  if (suggestions.length === 0) return null;

  async function respond(key: string, response: "done" | "dismissed") {
    const next = [...feedback.data, { key, response }];
    await feedback.mutate(
      async () => {
        await write((db) =>
          db.from("suggestion_feedback").upsert({ day: today, key, response }, { onConflict: "user_id,day,key" }),
        );
        return undefined;
      },
      { optimisticData: next, populateCache: false, revalidate: true },
    );
  }

  return (
    <Section title="For today">
      <List>
        {suggestions.map((s) => (
          <Row
            key={s.key}
            title={s.title}
            detail={s.detail}
            href={s.action?.href}
            onClick={s.action ? () => void respond(s.key, "done") : undefined}
            trailing={
              <button
                type="button"
                className={styles.dismiss}
                aria-label={`Not today: ${s.title}`}
                onClick={() => respond(s.key, "dismissed")}
              >
                <X size={16} strokeWidth={2} />
              </button>
            }
          />
        ))}
      </List>
    </Section>
  );
}
