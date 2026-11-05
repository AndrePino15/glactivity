"use client";

import { useState } from "react";
import { Button, List, Note, Row, Section, Sheet, TextButton, TextLink } from "@/components/ui";
import type { ISODate } from "@/lib/dates";
import { useWorkoutLogs, useWorkoutPlan } from "@/lib/db/hooks";
import type { CalendarEvent, WorkoutKind } from "@/lib/db/types";
import { adviseWorkout, type Mode } from "@/lib/modes";
import { logWorkout, undoWorkout } from "@/lib/workout-actions";
import { KIND_LABELS, planFor, suggestSlot } from "@/lib/workouts";
import styles from "./lifestyle.module.css";

const MINUTES: Record<WorkoutKind, number> = { gym: 75, home: 40, run: 45, sport: 90, rest: 0 };
const ALTERNATIVES: WorkoutKind[] = ["gym", "home", "run", "sport"];

/** Today's workout: what's planned, when it fits, and one tap to say how it went. */
export function TodayWorkout({ today, events, mode }: { today: ISODate; events: CalendarEvent[]; mode: Mode }) {
  const plan = useWorkoutPlan();
  const logs = useWorkoutLogs(today, today);
  const [choosing, setChoosing] = useState(false);

  if (!plan.loaded || !logs.loaded) return null;
  if (plan.data.length === 0) {
    return (
      <Section title="Workout">
        <Note>
          No training plan yet. <TextLink href="/lifestyle">Set up your week</TextLink>
        </Note>
      </Section>
    );
  }

  const day = planFor(today, plan.data);
  const log = logs.data[0];

  if (log) {
    return (
      <Section title="Workout">
        <List>
          <Row
            title={log.status === "done" ? `${log.title} · done` : "Skipped today"}
            detail={log.status === "done" ? KIND_LABELS[log.kind] : "That’s fine. Tomorrow’s another day."}
            trailing={<TextButton onClick={() => undoWorkout(today)}>Undo</TextButton>}
          />
        </List>
      </Section>
    );
  }

  if (!day || day.kind === "rest") {
    return (
      <Section title="Workout">
        <Note>
          Rest day. <TextButton onClick={() => setChoosing(true)}>Did something anyway?</TextButton>
        </Note>
        <Alternatives open={choosing} onClose={() => setChoosing(false)} today={today} title="Bonus session" />
      </Section>
    );
  }

  const advice = adviseWorkout(day, mode);
  const kind = advice.instead ?? day.kind;
  const slot = suggestSlot(today, events, day.preferred_time?.slice(0, 5) ?? "17:30", MINUTES[kind]);
  const exercises = kind === "gym" && day.details ? day.details.split("\n").filter(Boolean).slice(0, 6) : [];

  return (
    <Section title="Workout">
      <div className={styles.workout}>
        <p className={styles.workoutTitle}>{day.title}</p>
        <p className={styles.workoutMeta}>
          {KIND_LABELS[kind]} · {slot ? `free at ${slot}` : "busy day, fit in what you can"}
        </p>
        {advice.note && <p className={styles.advice}>{advice.note}</p>}
        {exercises.length > 0 && (
          <ul className={styles.exercises}>
            {exercises.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        <div className={styles.workoutActions}>
          <Button onClick={() => logWorkout(today, day.title, kind, "done")}>Done</Button>
          <TextButton onClick={() => setChoosing(true)}>Did something else</TextButton>
          <TextButton onClick={() => logWorkout(today, day.title, kind, "skipped")}>Skip</TextButton>
        </div>
      </div>
      <Alternatives open={choosing} onClose={() => setChoosing(false)} today={today} title={day.title} />
    </Section>
  );
}

function Alternatives({ open, onClose, today, title }: { open: boolean; onClose: () => void; today: ISODate; title: string }) {
  return (
    <Sheet open={open} onClose={onClose} title="What did you do?">
      <List>
        {ALTERNATIVES.map((kind) => (
          <Row
            key={kind}
            title={KIND_LABELS[kind]}
            onClick={async () => {
              await logWorkout(today, kind === "gym" ? title : KIND_LABELS[kind], kind, "done");
              onClose();
            }}
          />
        ))}
      </List>
    </Sheet>
  );
}
