import { addDays, addMonths, daysBetween, type ISODate } from "./dates";
import type { Reminder } from "./db/types";

/** A never-completed repeating reminder stays "overdue" this long before rolling on. */
const GRACE_DAYS = 7;

function step(reminder: Pick<Reminder, "due_on" | "recurrence">, from: ISODate, n: number): ISODate {
  const day = Number(reminder.due_on.slice(8, 10));
  switch (reminder.recurrence) {
    case "weekly":
      return addDays(from, 7 * n);
    case "monthly":
      return addMonths(reminder.due_on, n, day);
    case "yearly":
      return addMonths(reminder.due_on, 12 * n, day);
    default:
      return from;
  }
}

/**
 * The occurrence that's currently due: the first one after the last time it
 * was done. Null when a one-off reminder is finished.
 */
export function nextDue(
  reminder: Pick<Reminder, "due_on" | "recurrence" | "last_done_on">,
  today: ISODate,
): ISODate | null {
  if (reminder.recurrence === "none") {
    return reminder.last_done_on && reminder.last_done_on >= reminder.due_on ? null : reminder.due_on;
  }
  const after = reminder.last_done_on ?? addDays(today, -GRACE_DAYS - 1);
  for (let n = 0; n < 5000; n++) {
    const occurrence = step(reminder, reminder.due_on, n);
    if (occurrence > after) return occurrence;
  }
  return null;
}

export type DueReminder = { reminder: Reminder; due: ISODate; days: number };

/** Reminders due within `withinDays` (or overdue), soonest first. */
export function upcomingReminders(
  reminders: Reminder[],
  today: ISODate,
  withinDays: number,
): DueReminder[] {
  return reminders
    .filter((r) => !r.archived)
    .map((reminder) => {
      const due = nextDue(reminder, today);
      return due ? { reminder, due, days: daysBetween(today, due) } : null;
    })
    .filter((r): r is DueReminder => r !== null && r.days <= withinDays)
    .sort((a, b) => a.due.localeCompare(b.due));
}
