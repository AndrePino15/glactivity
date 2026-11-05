import { breakOn } from "./calendar/day";
import { countryOn } from "./calendar/breaks";
import { addDays, toISODate, type ISODate } from "./dates";
import type { CalendarEvent, Country, Period, WorkoutKind, WorkoutPlanDay } from "./db/types";

export type Mode = {
  kind: "term" | "break" | "exams";
  inPortugal: boolean;
  /** Exams today or in the next week, soonest first. */
  exams: CalendarEvent[];
};

/** What kind of day it is: exam season, a break (maybe at home), or normal term. */
export function modeOn(day: ISODate, events: CalendarEvent[], periods: Period[], home: Country): Mode {
  const weekAhead = addDays(day, 7);
  const exams = events
    .filter((e) => e.category === "exam")
    .filter((e) => {
      const date = toISODate(new Date(e.starts_at));
      return date >= day && date <= weekAhead;
    })
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const inPortugal = countryOn(day, periods, home) === "PT";
  if (exams.length) return { kind: "exams", inPortugal, exams };
  return { kind: breakOn(day, periods) ? "break" : "term", inPortugal, exams };
}

export type WorkoutAdvice = {
  /** What to do instead of the plan's kind, if anything. */
  instead: WorkoutKind | null;
  note: string | null;
};

/** Gentle changes to the plan for the kind of day it is. Never forbids anything. */
export function adviseWorkout(plan: Pick<WorkoutPlanDay, "kind"> | null, mode: Mode): WorkoutAdvice {
  if (!plan || plan.kind === "rest") return { instead: null, note: null };
  if (mode.inPortugal && plan.kind === "gym") {
    return { instead: "home", note: "You’re in Portugal: a home workout or a run instead of the gym." };
  }
  if (mode.kind === "exams") {
    return { instead: null, note: "Exam week: keep it short and easy, 30–40 minutes is plenty." };
  }
  return { instead: null, note: null };
}
