import { describe, expect, it } from "vitest";
import type { CalendarEvent, ListItem, WorkoutPlanDay } from "./db/types";
import type { Mode } from "./modes";
import { suggestionsFor, type SuggestionContext } from "./suggestions";

const THURSDAY = "2026-11-12";

const event = (day: string, from: string, to: string, over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: `${day}-${from}`,
  source_id: null,
  external_uid: null,
  title: "COMP1215 Lecture",
  location: null,
  notes: null,
  starts_at: new Date(`${day}T${from}:00`).toISOString(),
  ends_at: new Date(`${day}T${to}:00`).toISOString(),
  all_day: false,
  category: "lecture",
  ...over,
});

const term: Mode = { kind: "term", inPortugal: false, exams: [] };
const rest: WorkoutPlanDay = { id: "p", weekday: 4, title: "Rest", kind: "rest", preferred_time: null, details: null };
const gym: WorkoutPlanDay = { ...rest, title: "Upper", kind: "gym" };

const ctx = (over: Partial<SuggestionContext> = {}): SuggestionContext => ({
  today: THURSDAY,
  now: new Date(`${THURSDAY}T08:00:00`),
  events: [],
  mode: term,
  workoutLogs: [],
  planToday: gym,
  meals: [],
  daysToShopping: null,
  reading: null,
  handled: new Set(),
  ...over,
});

const keys = (c: SuggestionContext) => suggestionsFor(c).map((s) => s.key);

describe("suggestionsFor", () => {
  it("finds revision time before an exam", () => {
    const exam = event("2026-11-15", "09:30", "11:30", { id: "exam", title: "COMP1215 Exam", category: "exam" });
    const [first] = suggestionsFor(
      ctx({ events: [event(THURSDAY, "09:00", "12:00"), exam], mode: { ...term, kind: "exams", exams: [exam] } }),
    );
    expect(first).toMatchObject({ key: "revise:exam", title: "Revise for COMP1215 Exam" });
    expect(first.detail).toBe("Exam in 3 days. You’re free 12:00–15:00.");
  });

  it("nudges to plan meals before shopping, but not while in Portugal", () => {
    expect(keys(ctx({ daysToShopping: 1 }))).toContain("plan-meals");
    expect(keys(ctx({ daysToShopping: 1, mode: { ...term, inPortugal: true } }))).not.toContain("plan-meals");
    const planned = [
      { id: "a", day: THURSDAY, slot: "dinner" as const, title: "Pasta", meal_id: null },
      { id: "b", day: "2026-11-13", slot: "dinner" as const, title: "Curry", meal_id: null },
    ];
    expect(keys(ctx({ daysToShopping: 1, meals: planned }))).not.toContain("plan-meals");
  });

  it("suggests seeing friends on a free evening, unless there's been something social", () => {
    expect(keys(ctx())).toContain("social");
    expect(keys(ctx({ events: [event(THURSDAY, "19:00", "21:00")] }))).not.toContain("social");
    expect(keys(ctx({ events: [event("2026-11-09", "19:00", "22:00", { category: "social" })] }))).not.toContain("social");
    expect(keys(ctx({ now: new Date(`${THURSDAY}T21:00:00`) }))).not.toContain("social");
  });

  it("spots a long gap between lectures and mentions the current book", () => {
    const book = { title: "Piranesi" } as ListItem;
    const [gap] = suggestionsFor(
      ctx({ events: [event(THURSDAY, "09:00", "10:00"), event(THURSDAY, "13:00", "14:00")], reading: book }),
    ).filter((s) => s.key === "gap");
    expect(gap).toMatchObject({ title: "3 free hours between lectures" });
    expect(gap.detail).toContain("Piranesi");
  });

  it("ignores a gap that has already passed", () => {
    const events = [event(THURSDAY, "09:00", "10:00"), event(THURSDAY, "13:00", "14:00")];
    expect(keys(ctx({ events, now: new Date(`${THURSDAY}T11:00:00`) }))).not.toContain("gap");
  });

  it("nudges to move after a quiet few days, only on a rest day", () => {
    expect(keys(ctx({ planToday: rest }))).toContain("move");
    expect(keys(ctx({ planToday: gym }))).not.toContain("move");
    const recent = [{ id: "l", day: "2026-11-10", title: "Run", kind: "run" as const, status: "done" as const, notes: null }];
    expect(keys(ctx({ planToday: rest, workoutLogs: recent }))).not.toContain("move");
  });

  it("asks about an empty weekend on Thursday or Friday only", () => {
    expect(keys(ctx())).toContain("weekend");
    expect(keys(ctx({ events: [event("2026-11-14", "12:00", "14:00", { category: "personal" })] }))).not.toContain("weekend");
    expect(keys(ctx({ today: "2026-11-10", now: new Date("2026-11-10T08:00:00") }))).not.toContain("weekend");
  });

  it("hides what was done or dismissed today and shows at most three", () => {
    const all = ctx({ daysToShopping: 0, planToday: rest });
    expect(suggestionsFor(all)).toHaveLength(3);
    expect(keys({ ...all, handled: new Set(["plan-meals", "social"]) })).toEqual(["move", "weekend"]);
  });
});
