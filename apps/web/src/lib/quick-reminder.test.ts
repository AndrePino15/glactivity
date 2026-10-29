import { describe, expect, it } from "vitest";
import { parseQuickReminder } from "./quick-reminder";

const today = "2026-10-29"; // a Thursday

describe("parseQuickReminder", () => {
  it.each([
    ["Pay rent on the 1st every month", { title: "Pay rent", due_on: "2026-11-01", recurrence: "monthly" }],
    ["Rent the 1st every month", { title: "Rent", due_on: "2026-11-01", recurrence: "monthly" }],
    ["Call the landlord tomorrow", { title: "Call the landlord", due_on: "2026-10-30", recurrence: "none" }],
    ["Bins every week on Monday", { title: "Bins", due_on: "2026-11-02", recurrence: "weekly" }],
    ["Renew railcard 14 March yearly", { title: "Renew railcard", due_on: "2027-03-14", recurrence: "yearly" }],
    ["Dentist on Nov 5th", { title: "Dentist", due_on: "2026-11-05", recurrence: "none" }],
    ["Return library book in 2 weeks", { title: "Return library book", due_on: "2026-11-12", recurrence: "none" }],
    ["Council tax by 15/11", { title: "Council tax", due_on: "2026-11-15", recurrence: "none" }],
    ["Phone bill the 31st monthly", { title: "Phone bill", due_on: "2026-10-31", recurrence: "monthly" }],
    ["Buy a birthday card", { title: "Buy a birthday card", due_on: "2026-10-29", recurrence: "none" }],
    ["Gym kit today", { title: "Gym kit", due_on: "2026-10-29", recurrence: "none" }],
  ])("%s", (input, expected) => {
    expect(parseQuickReminder(input, today)).toEqual(expected);
  });

  it("rolls past dates into next year and short months to their last day", () => {
    expect(parseQuickReminder("Thing on 3 Jan", today).due_on).toBe("2027-01-03");
    expect(parseQuickReminder("Rent the 31st every month", "2026-11-05").due_on).toBe("2026-11-30");
  });

  it("asks for next week when the weekday is today", () => {
    expect(parseQuickReminder("Laundry Thursday", today).due_on).toBe("2026-11-05");
  });
});
