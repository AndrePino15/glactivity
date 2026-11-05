"use client";

import type { ISODate } from "./dates";
import { refresh, write } from "./db/client";
import type { WorkoutKind, WorkoutPlanDay } from "./db/types";
import type { Template } from "./workouts";

export async function applyTemplate(template: Template) {
  const rows = Object.entries(template.days).map(([weekday, day]) => ({ weekday: Number(weekday), ...day }));
  await write((db) => db.from("workout_plan").upsert(rows, { onConflict: "user_id,weekday" }));
  await refresh("workout-plan");
}

export async function savePlanDay(day: Omit<WorkoutPlanDay, "id">) {
  await write((db) => db.from("workout_plan").upsert(day, { onConflict: "user_id,weekday" }));
  await refresh("workout-plan");
}

export async function logWorkout(day: ISODate, title: string, kind: WorkoutKind, status: "done" | "skipped") {
  await write((db) => db.from("workout_logs").upsert({ day, title, kind, status }, { onConflict: "user_id,day" }));
  await refresh("workout-logs");
}

export async function undoWorkout(day: ISODate) {
  await write((db) => db.from("workout_logs").delete().eq("day", day));
  await refresh("workout-logs");
}
