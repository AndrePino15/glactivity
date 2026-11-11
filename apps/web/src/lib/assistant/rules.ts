import { addDays, daysBetween, type ISODate } from "../dates";
import type { CalendarEvent, Country, ListItem, MealPlanEntry, MealSlot, Period, WorkoutKind, WorkoutLog, WorkoutPlanDay } from "../db/types";
import { modeOn } from "../modes";
import { suggestionsFor } from "../suggestions";
import { planFor } from "../workouts";

/** The parts of public.agent_context() the free rules need. */
export type AgentContext = {
  today: ISODate;
  now: string;
  timezone: string;
  profile: { current_country: Country; shopping_day: string } | null;
  events: { id: string; title: string; starts_at: string; ends_at: string; all_day: boolean; category: CalendarEvent["category"]; location: string | null }[];
  periods: (Omit<Period, "source"> & { source?: Period["source"] })[];
  training_plan: { weekday_number: number; title: string; kind: WorkoutKind; preferred_time: string | null; details: string | null }[];
  training_log: { day: string; title: string; kind: WorkoutKind; status: "done" | "skipped"; notes: string | null }[];
  meal_plan: { day: string; slot: MealSlot; title: string }[];
  media: { list: string; title: string; by: string | null; status: string }[];
  rule_suggestion_feedback: { day: string; key: string; response: string }[];
  [key: string]: unknown;
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Minutes the zone is ahead of UTC at this instant. */
function zoneOffset(instant: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instant)
      .map((p) => [p.type, Number(p.value)]),
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((asUtc - instant) / 60_000);
}

/**
 * The rules read clock times in the process's own time zone (the phone's, in
 * the app). On the server that's UTC, so shift each instant until its local
 * reading here is the owner's wall-clock time.
 */
export function wallClock(instant: string | number, timeZone: string): Date {
  const t = typeof instant === "number" ? instant : new Date(instant).getTime();
  const local = -new Date(t).getTimezoneOffset();
  return new Date(t + (zoneOffset(t, timeZone) - local) * 60_000);
}

/** Today's free "For today" suggestions, worked out the same way the app does. */
export function ruleSuggestions(ctx: AgentContext) {
  const tz = ctx.timezone || "Europe/London";
  const events: CalendarEvent[] = ctx.events.map((e) => ({
    id: e.id,
    source_id: null,
    external_uid: null,
    notes: null,
    title: e.title,
    location: e.location,
    category: e.category,
    all_day: e.all_day,
    // All-day events are stored as UTC dates and read as such; only timed ones shift.
    starts_at: e.all_day ? e.starts_at : wallClock(e.starts_at, tz).toISOString(),
    ends_at: e.all_day ? e.ends_at : wallClock(e.ends_at, tz).toISOString(),
  }));
  const periods: Period[] = ctx.periods.map((p) => ({ source: "manual" as const, ...p }));
  const home = ctx.profile?.current_country ?? "GB";
  const plan: WorkoutPlanDay[] = ctx.training_plan.map((w, i) => ({
    id: String(i),
    weekday: w.weekday_number,
    title: w.title,
    kind: w.kind,
    preferred_time: w.preferred_time,
    details: w.details,
  }));
  const logs: WorkoutLog[] = ctx.training_log.map((l, i) => ({ id: String(i), ...l }));
  const meals: MealPlanEntry[] = ctx.meal_plan
    .filter((m) => m.day >= ctx.today && m.day <= addDays(ctx.today, 3))
    .map((m, i) => ({ id: String(i), meal_id: null, ...m }));
  const reading = ctx.media.find((m) => m.list === "books" && m.status === "active");
  const shoppingDay = WEEKDAYS.indexOf(ctx.profile?.shopping_day ?? "");
  const todayWeekday = new Date(`${ctx.today}T12:00:00Z`).getUTCDay();

  return suggestionsFor({
    today: ctx.today,
    now: wallClock(ctx.now, tz),
    events,
    mode: modeOn(ctx.today, events, periods, home),
    workoutLogs: logs.filter((l) => daysBetween(l.day, ctx.today) <= 7),
    planToday: plan.length ? planFor(ctx.today, plan) : null,
    meals,
    daysToShopping: shoppingDay < 0 ? null : (shoppingDay - todayWeekday + 7) % 7,
    reading: reading ? ({ title: reading.title } as ListItem) : null,
    handled: new Set(ctx.rule_suggestion_feedback.filter((f) => f.day === ctx.today).map((f) => f.key)),
  }).map(({ title, detail }) => ({ title, detail }));
}
