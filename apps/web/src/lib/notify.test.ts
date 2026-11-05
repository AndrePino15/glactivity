import { describe, expect, it } from "vitest";
import type { Reminder } from "./db/types";
import { remindersToNotify } from "./notify";

const reminder = (r: Partial<Reminder>): Reminder => ({
  id: r.title ?? "r",
  title: "Pay rent",
  notes: null,
  due_on: "2026-12-01",
  recurrence: "monthly",
  notify_days_before: 3,
  last_done_on: null,
  last_notified_on: null,
  archived: false,
  ...r,
});

const bodies = (list: Reminder[], today: string) => remindersToNotify(list, today).map((n) => n.body);

describe("remindersToNotify", () => {
  it("announces when a reminder comes into view and on the day", () => {
    expect(bodies([reminder({})], "2026-11-28")).toEqual(["Due in 3 days · Tue 1 Dec"]);
    expect(bodies([reminder({})], "2026-11-29")).toEqual([]);
    expect(bodies([reminder({})], "2026-12-01")).toEqual(["Due today"]);
  });

  it("says tomorrow for a one-day notice", () => {
    expect(bodies([reminder({ notify_days_before: 1 })], "2026-11-30")).toEqual(["Due tomorrow"]);
  });

  it("never repeats on the same day", () => {
    expect(bodies([reminder({ last_notified_on: "2026-12-01" })], "2026-12-01")).toEqual([]);
  });

  it("nudges once about something overdue that wasn't announced", () => {
    const missed = reminder({ due_on: "2026-11-20", recurrence: "none", last_notified_on: null });
    expect(bodies([missed], "2026-11-22")).toEqual(["Overdue since Fri 20 Nov"]);
    expect(bodies([{ ...missed, last_notified_on: "2026-11-22" }], "2026-11-23")).toEqual([]);
  });

  it("skips archived and finished reminders", () => {
    expect(bodies([reminder({ archived: true })], "2026-12-01")).toEqual([]);
    expect(bodies([reminder({ recurrence: "none", last_done_on: "2026-12-01" })], "2026-12-01")).toEqual([]);
  });
});
