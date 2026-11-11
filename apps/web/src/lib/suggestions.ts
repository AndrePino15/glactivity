import { addDays, daysBetween, fromISODate, relativeDay, toISODate, type ISODate } from "./dates";
import type { CalendarEvent, ListItem, MealPlanEntry, WorkoutLog, WorkoutPlanDay } from "./db/types";
import type { Mode } from "./modes";

export type Suggestion = {
  /** Stable for the day, so feedback can hide it. */
  key: string;
  title: string;
  detail: string;
  action?: { label: string; href: string };
};

export type SuggestionContext = {
  today: ISODate;
  /** The current time, so gaps that have already passed aren't suggested. */
  now: Date;
  /** Events from a week before to a week after today. */
  events: CalendarEvent[];
  mode: Mode;
  workoutLogs: WorkoutLog[];
  planToday: WorkoutPlanDay | null;
  /** Meals planned from today to three days ahead. */
  meals: MealPlanEntry[];
  /** Days until shopping day (0 = today), or null if unknown. */
  daysToShopping: number | null;
  reading: ListItem | null;
  /** Suggestion keys already done or dismissed today. */
  handled: Set<string>;
};

const MAX = 3;

const minutesOf = (date: Date) => date.getHours() * 60 + date.getMinutes();
const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Timed events on a local day as [start, end] minutes, sorted. */
function busyOn(day: ISODate, events: CalendarEvent[]) {
  const start = fromISODate(day).getTime();
  const end = fromISODate(addDays(day, 1)).getTime();
  return events
    .filter((e) => !e.all_day && new Date(e.starts_at).getTime() < end && new Date(e.ends_at).getTime() > start)
    .map((e) => ({
      event: e,
      from: Math.max(0, Math.round((new Date(e.starts_at).getTime() - start) / 60_000)),
      to: Math.min(24 * 60, Math.round((new Date(e.ends_at).getTime() - start) / 60_000)),
    }))
    .sort((a, b) => a.from - b.from);
}

/** Free stretches between `from` and `to` (minutes) around the day's events. */
function freeGaps(busy: { from: number; to: number }[], from: number, to: number) {
  const gaps: { from: number; to: number }[] = [];
  let cursor = from;
  for (const b of busy) {
    if (b.from > cursor) gaps.push({ from: cursor, to: Math.min(b.from, to) });
    cursor = Math.max(cursor, b.to);
    if (cursor >= to) break;
  }
  if (cursor < to) gaps.push({ from: cursor, to });
  return gaps.filter((g) => g.to > g.from);
}

const shortTitle = (title: string) => title.replace(/\s*[-–:(].*$/, "").trim() || title;

/**
 * A few gentle ideas for the day, from what Glactivity already knows. They're
 * suggestions, never tasks: each can be waved away, and at most three show.
 */
export function suggestionsFor(ctx: SuggestionContext): Suggestion[] {
  const { today, now, events, mode } = ctx;
  const busy = busyOn(today, events);
  const nowMinutes = toISODate(now) === today ? minutesOf(now) : 0;
  const out: Suggestion[] = [];

  // 1. An exam is coming: find a proper block of free time today to revise.
  const nextExam = mode.exams.find((e) => toISODate(new Date(e.starts_at)) > today);
  if (nextExam) {
    const window = freeGaps(busy, Math.max(nowMinutes, 9 * 60), 21 * 60).filter((g) => g.to - g.from >= 90);
    const longest = window.sort((a, b) => b.to - b.from - (a.to - a.from))[0];
    if (longest) {
      const end = Math.min(longest.to, longest.from + 180);
      out.push({
        key: `revise:${nextExam.id}`,
        title: `Revise for ${shortTitle(nextExam.title)}`,
        detail: `Exam ${relativeDay(today, toISODate(new Date(nextExam.starts_at)))}. You’re free ${clock(longest.from)}–${clock(end)}.`,
      });
    }
  }

  // 2. Shopping soon, but hardly any meals planned to shop for.
  if (ctx.daysToShopping !== null && ctx.daysToShopping <= 1 && !mode.inPortugal) {
    const planned = ctx.meals.filter((m) => m.day >= today && daysBetween(today, m.day) <= 3).length;
    if (planned < 2) {
      out.push({
        key: "plan-meals",
        title: "Plan a few meals before shopping",
        detail: `Shopping is ${ctx.daysToShopping === 0 ? "today" : "tomorrow"}. A plan means the list has what you need.`,
        action: { label: "Plan meals", href: "/lifestyle/meals" },
      });
    }
  }

  // 3. A free evening, and nothing social lately or soon.
  const eveningBusy = busy.some((b) => b.from < 22 * 60 && b.to > 18 * 60);
  const recentSocial = events.some(
    (e) => e.category === "social" && Math.abs(daysBetween(today, toISODate(new Date(e.starts_at)))) <= 6,
  );
  if (!eveningBusy && !recentSocial && mode.kind !== "exams" && nowMinutes < 20 * 60) {
    out.push({
      key: "social",
      title: "Free evening",
      detail: "Nothing on tonight. Maybe see friends?",
      action: { label: "Add plans", href: "/timetable" },
    });
  }

  // 4. A long gap between lectures that hasn't started yet.
  const teaching = busy.filter((b) => b.event.category === "lecture" || b.event.category === "exam");
  for (let i = 0; i < teaching.length - 1; i++) {
    const from = teaching[i].to;
    const to = teaching[i + 1].from;
    if (to - from >= 120 && from >= nowMinutes && !busy.some((b) => b.from < to && b.to > from)) {
      out.push({
        key: "gap",
        title: `${Math.floor((to - from) / 60)} free hours between lectures`,
        detail: ctx.reading
          ? `${clock(from)}–${clock(to)}. Good for a chapter of ${ctx.reading.title}, or a walk.`
          : `${clock(from)}–${clock(to)}. Good for getting ahead, or a walk outside.`,
      });
      break;
    }
  }

  // 5. No exercise logged for days, on a day without a planned session.
  const trainingToday = ctx.planToday && ctx.planToday.kind !== "rest";
  const lastActive = ctx.workoutLogs
    .filter((l) => l.status === "done")
    .map((l) => l.day)
    .sort()
    .pop();
  const quietDays = lastActive ? daysBetween(lastActive, today) : Infinity;
  if (!trainingToday && quietDays >= 4 && ctx.planToday !== null) {
    out.push({ key: "move", title: "It’s been a few days since you moved", detail: "A 20-minute walk counts." });
  }

  // 6. Thursday or Friday, and the weekend is empty.
  const weekday = fromISODate(today).getDay();
  if (weekday === 4 || weekday === 5) {
    const saturday = addDays(today, 6 - weekday);
    const weekend = [saturday, addDays(saturday, 1)];
    const anything = events.some((e) => weekend.includes(e.all_day ? e.starts_at.slice(0, 10) : toISODate(new Date(e.starts_at))));
    if (!anything) {
      out.push({
        key: "weekend",
        title: "Nothing planned this weekend yet",
        detail: "Anything you’d like to do? It might be worth sorting before the week runs out.",
        action: { label: "Add plans", href: "/timetable" },
      });
    }
  }

  return out.filter((s) => !ctx.handled.has(s.key)).slice(0, MAX);
}
