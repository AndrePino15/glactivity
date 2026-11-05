import { addDays, fromISODate, type ISODate } from "./dates";
import type { CalendarEvent, WorkoutKind, WorkoutPlanDay } from "./db/types";

export const KIND_LABELS: Record<WorkoutKind, string> = {
  gym: "Gym",
  home: "Home workout",
  run: "Run",
  sport: "Sport",
  rest: "Rest",
};

type TemplateDay = Pick<WorkoutPlanDay, "title" | "kind" | "details">;
export type Template = { name: string; summary: string; days: Record<number, TemplateDay> };

const rest: TemplateDay = { title: "Rest", kind: "rest", details: null };
const lines = (...items: string[]) => items.join("\n");

/** Starter weeks to pick from; every day can be changed afterwards. */
export const TEMPLATES: Template[] = [
  {
    name: "Push · Pull · Legs + runs",
    summary: "3 gym days, 2 runs",
    days: {
      1: { title: "Push", kind: "gym", details: lines("Bench press 4×8", "Overhead press 3×10", "Incline dumbbell press 3×10", "Lateral raises 3×15", "Triceps pushdowns 3×12") },
      2: { title: "Easy run", kind: "run", details: "30 minutes, conversational pace" },
      3: { title: "Pull", kind: "gym", details: lines("Deadlift 3×5", "Pull-ups 4×max", "Barbell row 3×8", "Face pulls 3×15", "Biceps curls 3×12") },
      4: rest,
      5: { title: "Legs", kind: "gym", details: lines("Squat 4×6", "Romanian deadlift 3×10", "Lunges 3×12", "Leg curls 3×12", "Calf raises 4×15") },
      6: { title: "Long run", kind: "run", details: "45–60 minutes, easy" },
      0: rest,
    },
  },
  {
    name: "Upper · Lower × 2",
    summary: "4 gym days",
    days: {
      1: { title: "Upper", kind: "gym", details: lines("Bench press 4×6", "Barbell row 4×8", "Overhead press 3×10", "Pull-ups 3×max") },
      2: { title: "Lower", kind: "gym", details: lines("Squat 4×6", "Romanian deadlift 3×8", "Leg press 3×12", "Calf raises 4×15") },
      3: rest,
      4: { title: "Upper", kind: "gym", details: lines("Incline press 4×8", "Lat pulldown 4×10", "Dips 3×max", "Curls + pushdowns 3×12") },
      5: { title: "Lower", kind: "gym", details: lines("Deadlift 3×5", "Front squat 3×8", "Lunges 3×12", "Hanging leg raises 3×12") },
      6: { title: "Walk or sport", kind: "sport", details: null },
      0: rest,
    },
  },
  {
    name: "Full body × 3",
    summary: "3 short gym days",
    days: {
      1: { title: "Full body A", kind: "gym", details: lines("Squat 3×8", "Bench press 3×8", "Barbell row 3×8", "Plank 3×45s") },
      3: { title: "Full body B", kind: "gym", details: lines("Deadlift 3×5", "Overhead press 3×8", "Pull-ups 3×max", "Lunges 3×10") },
      5: { title: "Full body A", kind: "gym", details: lines("Squat 3×8", "Bench press 3×8", "Barbell row 3×8", "Plank 3×45s") },
      2: rest,
      4: rest,
      6: { title: "Walk or sport", kind: "sport", details: null },
      0: rest,
    },
  },
  {
    name: "Start empty",
    summary: "Fill in each day yourself",
    days: { 0: rest, 1: rest, 2: rest, 3: rest, 4: rest, 5: rest, 6: rest },
  },
];

export function planFor(day: ISODate, plan: WorkoutPlanDay[]): WorkoutPlanDay | null {
  const weekday = fromISODate(day).getDay();
  return plan.find((p) => p.weekday === weekday) ?? null;
}

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Minutes since local midnight for a timestamp on that day (clamped to the day). */
function minutesOn(day: ISODate, timestamp: string) {
  const start = fromISODate(day).getTime();
  const end = fromISODate(addDays(day, 1)).getTime();
  const t = Math.min(Math.max(new Date(timestamp).getTime(), start), end);
  return Math.round((t - start) / 60_000);
}

/**
 * A start time for a workout that fits between the day's events, as close as
 * possible to the preferred time. Null when the day is full.
 */
export function suggestSlot(
  day: ISODate,
  events: CalendarEvent[],
  preferred = "17:30",
  duration = 75,
  { from = "07:00", to = "21:30" }: { from?: string; to?: string } = {},
): string | null {
  const busy = events
    .filter((e) => !e.all_day)
    .map((e) => [minutesOn(day, e.starts_at), minutesOn(day, e.ends_at)] as const)
    .sort((a, b) => a[0] - b[0]);

  // Free gaps within the day's window.
  const gaps: [number, number][] = [];
  let cursor = toMinutes(from);
  for (const [start, end] of busy) {
    if (start > cursor) gaps.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (toMinutes(to) > cursor) gaps.push([cursor, toMinutes(to)]);

  const want = toMinutes(preferred);
  let best: number | null = null;
  for (const [start, end] of gaps) {
    if (end - start < duration) continue;
    // The closest start to the preferred time inside this gap, on a quarter hour if it fits.
    const closest = Math.min(Math.max(want, start), end - duration);
    const rounded = Math.ceil(closest / 15) * 15;
    const candidate = rounded + duration <= end ? rounded : closest;
    if (best === null || Math.abs(candidate - want) < Math.abs(best - want)) best = candidate;
  }
  return best === null ? null : toTime(best);
}
