import { describe, expect, it } from "vitest";
import type { Reminder } from "./db/types";
import { nextDue, upcomingReminders } from "./reminders";

const reminder = (r: Partial<Reminder>): Reminder => ({
  id: r.title ?? "x",
  title: "Rent",
  notes: null,
  due_on: "2026-01-01",
  recurrence: "monthly",
  notify_days_before: 1,
  last_done_on: null,
  archived: false,
  ...r,
});

describe("nextDue", () => {
  it("rolls a monthly reminder forward to the coming occurrence", () => {
    expect(nextDue(reminder({}), "2026-10-22")).toBe("2026-11-01");
  });

  it("keeps a recently missed occurrence as overdue for a week", () => {
    expect(nextDue(reminder({}), "2026-10-05")).toBe("2026-10-01");
    expect(nextDue(reminder({}), "2026-10-09")).toBe("2026-11-01");
  });

  it("moves on once marked done", () => {
    expect(nextDue(reminder({ last_done_on: "2026-11-01" }), "2026-10-30")).toBe("2026-12-01");
  });

  it("keeps the 31st at the end of shorter months", () => {
    const r = reminder({ due_on: "2026-01-31", last_done_on: "2026-01-31" });
    expect(nextDue(r, "2026-02-10")).toBe("2026-02-28");
    expect(nextDue({ ...r, last_done_on: "2026-02-28" }, "2026-03-10")).toBe("2026-03-31");
  });

  it("handles weekly and yearly repeats", () => {
    const weekly = reminder({ due_on: "2026-10-05", recurrence: "weekly" });
    expect(nextDue(weekly, "2026-10-22")).toBe("2026-10-19");
    expect(nextDue({ ...weekly, last_done_on: "2026-10-19" }, "2026-10-22")).toBe("2026-10-26");
    expect(nextDue(reminder({ due_on: "2025-03-14", recurrence: "yearly" }), "2026-10-22")).toBe("2027-03-14");
  });

  it("finishes a one-off reminder once done", () => {
    const once = reminder({ due_on: "2026-11-03", recurrence: "none" });
    expect(nextDue(once, "2026-10-22")).toBe("2026-11-03");
    expect(nextDue({ ...once, last_done_on: "2026-11-03" }, "2026-10-22")).toBeNull();
  });
});

describe("upcomingReminders", () => {
  it("lists overdue and soon-due reminders, soonest first, skipping archived and later ones", () => {
    const list = upcomingReminders(
      [
        reminder({ title: "Rent", due_on: "2026-01-01" }),
        reminder({ title: "Phone", due_on: "2026-01-24" }),
        reminder({ title: "Gym", due_on: "2026-01-20", archived: true }),
        reminder({ title: "Missed", due_on: "2026-01-15" }),
        reminder({ title: "Later", due_on: "2026-01-12", last_done_on: "2026-10-12" }),
      ],
      "2026-10-22",
      10,
    );
    expect(list.map((r) => [r.reminder.title, r.due, r.days])).toEqual([
      ["Missed", "2026-10-15", -7],
      ["Phone", "2026-10-24", 2],
      ["Rent", "2026-11-01", 10],
    ]);
  });
});
