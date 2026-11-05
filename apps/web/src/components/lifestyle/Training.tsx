"use client";

import { useState } from "react";
import { List, Note, Row, Section } from "@/components/ui";
import { addDays, formatShortDay, fromISODate, startOfWeek, type ISODate } from "@/lib/dates";
import { useWorkoutLogs, useWorkoutPlan } from "@/lib/db/hooks";
import { applyTemplate } from "@/lib/workout-actions";
import { KIND_LABELS, TEMPLATES } from "@/lib/workouts";
import { PlanDaySheet, WEEKDAY_NAMES } from "./PlanDaySheet";
import styles from "./lifestyle.module.css";

const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];

export function Training({ today }: { today: ISODate }) {
  const { data: plan, loaded } = useWorkoutPlan();
  const week = startOfWeek(today);
  const thisWeek = useWorkoutLogs(week, addDays(week, 6));
  const recent = useWorkoutLogs(addDays(today, -42), today);
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  if (loaded && plan.length === 0) {
    return (
      <Section title="Set up your week">
        <Note>Pick a starting point. You can change any day afterwards, and swap things on the day.</Note>
        <div className={styles.spaced}>
          <List>
            {TEMPLATES.map((template) => (
              <Row
                key={template.name}
                title={template.name}
                detail={template.summary}
                onClick={async () => {
                  if (busy) return;
                  setBusy(true);
                  await applyTemplate(template);
                  setBusy(false);
                }}
              />
            ))}
          </List>
        </div>
      </Section>
    );
  }

  const logFor = (weekday: number) => {
    const offset = MONDAY_FIRST.indexOf(weekday);
    return thisWeek.data.find((l) => l.day === addDays(week, offset));
  };
  const done = thisWeek.data.filter((l) => l.status === "done").length;
  const planned = plan.filter((p) => p.kind !== "rest").length;

  return (
    <>
      <Section
        title="This week"
        action={planned > 0 ? <span className={styles.count}>{done} of {planned} done</span> : undefined}
      >
        <List>
          {MONDAY_FIRST.map((weekday) => {
            const day = plan.find((p) => p.weekday === weekday);
            const log = logFor(weekday);
            const isToday = fromISODate(today).getDay() === weekday;
            return (
              <Row
                key={weekday}
                leading={<span className={styles.weekday} data-today={isToday || undefined}>{WEEKDAY_NAMES[weekday].slice(0, 3)}</span>}
                title={day?.kind === "rest" || !day ? "Rest" : day.title}
                detail={
                  day && day.kind !== "rest"
                    ? [KIND_LABELS[day.kind], day.preferred_time?.slice(0, 5)].filter(Boolean).join(" · ")
                    : undefined
                }
                trailing={log ? (log.status === "done" ? "Done" : "Skipped") : undefined}
                onClick={() => setEditing(weekday)}
              />
            );
          })}
        </List>
      </Section>

      {recent.data.length > 0 && (
        <Section title="Recent">
          <List>
            {recent.data.slice(0, 10).map((log) => (
              <Row
                key={log.id}
                title={log.title}
                detail={`${formatShortDay(log.day)} · ${KIND_LABELS[log.kind]}`}
                trailing={log.status === "done" ? "Done" : "Skipped"}
              />
            ))}
          </List>
        </Section>
      )}

      <PlanDaySheet
        weekday={editing}
        current={editing === null ? null : (plan.find((p) => p.weekday === editing) ?? null)}
        onClose={() => setEditing(null)}
      />
    </>
  );
}
