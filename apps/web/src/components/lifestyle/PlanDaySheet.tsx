"use client";

import { useState, type FormEvent } from "react";
import { Button, Label, Select, Sheet, TextButton, TextField } from "@/components/ui";
import type { WorkoutKind, WorkoutPlanDay } from "@/lib/db/types";
import { savePlanDay } from "@/lib/workout-actions";
import { KIND_LABELS } from "@/lib/workouts";
import styles from "./lifestyle.module.css";

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Edit what a weekday in the plan is. */
export function PlanDaySheet({
  weekday,
  current,
  onClose,
}: {
  weekday: number | null;
  current: WorkoutPlanDay | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={weekday !== null} onClose={onClose} title={weekday === null ? "" : WEEKDAY_NAMES[weekday]}>
      {weekday !== null && <PlanDayForm key={weekday} weekday={weekday} current={current} onDone={onClose} />}
    </Sheet>
  );
}

function PlanDayForm({ weekday, current, onDone }: { weekday: number; current: WorkoutPlanDay | null; onDone: () => void }) {
  const [title, setTitle] = useState(current?.title ?? "");
  const [kind, setKind] = useState<WorkoutKind>(current?.kind ?? "gym");
  const [time, setTime] = useState(current?.preferred_time?.slice(0, 5) ?? "");
  const [details, setDetails] = useState(current?.details ?? "");

  async function save(event: FormEvent) {
    event.preventDefault();
    await savePlanDay({
      weekday,
      kind,
      title: title.trim() || KIND_LABELS[kind],
      preferred_time: kind === "rest" || !time ? null : time,
      details: kind === "rest" ? null : details.trim() || null,
    });
    onDone();
  }

  async function makeRest() {
    await savePlanDay({ weekday, kind: "rest", title: "Rest", preferred_time: null, details: null });
    onDone();
  }

  return (
    <form className={styles.form} onSubmit={save}>
      <Label text="Type">
        <Select value={kind} onChange={(e) => setKind(e.target.value as WorkoutKind)}>
          {(Object.keys(KIND_LABELS) as WorkoutKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </Select>
      </Label>
      {kind !== "rest" && (
        <>
          <Label text="Name">
            <TextField value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Push, Legs, 5k…" />
          </Label>
          <Label text="Usual time (optional)">
            <TextField type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Label>
          <Label text="Exercises or notes, one per line">
            <textarea
              className={styles.textarea}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={5}
              placeholder={"Bench press 4×8\nPull-ups 3×max"}
            />
          </Label>
        </>
      )}
      <div className={styles.actions}>
        {current && current.kind !== "rest" ? (
          <TextButton onClick={makeRest}>Make it a rest day</TextButton>
        ) : (
          <span />
        )}
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}
