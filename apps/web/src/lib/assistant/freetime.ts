import { addDays, type ISODate } from "../dates";
import { zoneOffset } from "./rules";

/**
 * Where study blocks can go: free stretches inside the study day, clear of
 * timed events, training, meals and blocks already placed. The planner (Claude)
 * picks from these; the database still refuses anything that clashes.
 */

export const STUDY_DAY = {
  weekday: { from: "08:30", to: "21:30", capMinutes: 300 },
  weekend: { from: "10:00", to: "18:00", capMinutes: 180 },
  /** Kept free for meals. */
  meals: [
    ["12:30", "13:30"],
    ["19:00", "20:00"],
  ] as [string, string][],
  /** Breathing room around anything already on. */
  bufferMinutes: 10,
  trainingMinutes: 75,
  minSlotMinutes: 30,
};

type Busy = { starts_at: string; ends_at: string };
export type FreeTimeInput = {
  days: ISODate[];
  timeZone: string;
  now: Date;
  events: (Busy & { all_day: boolean; title: string })[];
  blocks: (Busy & { status: string })[];
  training: { weekday_number: number; kind: string; preferred_time: string | null; title: string }[];
};

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** The instant of a wall-clock time on a day in a time zone. */
export function zonedInstant(day: ISODate, minutes: number, timeZone: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, minutes);
  let t = naive - zoneOffset(naive, timeZone) * 60_000;
  t = naive - zoneOffset(t, timeZone) * 60_000; // settle across a clock change
  return t;
}

const label = new Map<string, Intl.DateTimeFormat>();
function fmt(timeZone: string) {
  if (!label.has(timeZone)) {
    label.set(
      timeZone,
      new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
    );
  }
  return label.get(timeZone)!;
}
const clock = (t: number, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(t);

export function freeTime(input: FreeTimeInput) {
  const { timeZone } = input;
  const nowMs = Math.ceil(input.now.getTime() / (15 * 60_000)) * 15 * 60_000;
  const buffer = STUDY_DAY.bufferMinutes * 60_000;

  return input.days.map((day) => {
    const weekdayNumber = new Date(`${day}T12:00:00Z`).getUTCDay();
    const weekend = weekdayNumber === 0 || weekdayNumber === 6;
    const rules = weekend ? STUDY_DAY.weekend : STUDY_DAY.weekday;
    const start = zonedInstant(day, toMinutes(rules.from), timeZone);
    const end = zonedInstant(day, toMinutes(rules.to), timeZone);
    const dayStart = zonedInstant(day, 0, timeZone);
    const dayEnd = zonedInstant(addDays(day, 1), 0, timeZone);

    const busy: [number, number][] = [];
    for (const e of input.events) {
      if (e.all_day) continue;
      busy.push([new Date(e.starts_at).getTime() - buffer, new Date(e.ends_at).getTime() + buffer]);
    }
    let plannedMinutes = 0;
    for (const b of input.blocks) {
      if (b.status !== "planned" && b.status !== "tentative") continue;
      const s = new Date(b.starts_at).getTime();
      const e = new Date(b.ends_at).getTime();
      busy.push([s, e + buffer]);
      if (s >= dayStart && s < dayEnd) plannedMinutes += Math.round((e - s) / 60_000);
    }
    for (const [from, to] of STUDY_DAY.meals) {
      busy.push([zonedInstant(day, toMinutes(from), timeZone), zonedInstant(day, toMinutes(to), timeZone)]);
    }
    const session = input.training.find((t) => t.weekday_number === weekdayNumber && t.kind !== "rest" && t.preferred_time);
    if (session) {
      const s = zonedInstant(day, toMinutes(session.preferred_time!), timeZone);
      busy.push([s - buffer, s + STUDY_DAY.trainingMinutes * 60_000 + buffer]);
    }

    busy.sort((a, b) => a[0] - b[0]);
    const free: { starts_at: string; ends_at: string; minutes: number; local: string }[] = [];
    let cursor = Math.max(start, nowMs);
    for (const [s, e] of busy) {
      if (s > cursor) push(cursor, Math.min(s, end));
      cursor = Math.max(cursor, e);
      if (cursor >= end) break;
    }
    if (cursor < end) push(cursor, end);

    function push(s: number, e: number) {
      const minutes = Math.round((e - s) / 60_000);
      if (minutes < STUDY_DAY.minSlotMinutes) return;
      free.push({
        starts_at: new Date(s).toISOString(),
        ends_at: new Date(e).toISOString(),
        minutes,
        local: `${fmt(timeZone).format(s).replace(",", "")}–${clock(e, timeZone)}`,
      });
    }

    const freeMinutes = free.reduce((sum, f) => sum + f.minutes, 0);
    return {
      day,
      free,
      free_minutes: freeMinutes,
      already_planned_minutes: plannedMinutes,
      // How much more study fits comfortably that day.
      room_minutes: Math.max(0, Math.min(freeMinutes, rules.capMinutes - plannedMinutes)),
      training: session ? `${session.title} around ${session.preferred_time!.slice(0, 5)}` : null,
      all_day: input.events
        .filter((e) => e.all_day && e.starts_at.slice(0, 10) <= day && e.ends_at.slice(0, 10) > day)
        .map((e) => e.title),
    };
  });
}
