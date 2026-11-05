import { daysBetween, formatShortDay, type ISODate } from "./dates";
import type { Reminder } from "./db/types";
import { nextDue } from "./reminders";

export type ReminderNotice = { reminder: Reminder; title: string; body: string };

function describe(days: number, due: ISODate): string {
  if (days < 0) return `Overdue since ${formatShortDay(due)}`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days · ${formatShortDay(due)}`;
}

/**
 * Which reminders to announce today: once when they come into view (their
 * "show on Today" window), again on the day, and once if overdue and not yet
 * announced. Never twice in a day.
 */
export function remindersToNotify(reminders: Reminder[], today: ISODate): ReminderNotice[] {
  const notices: ReminderNotice[] = [];
  for (const reminder of reminders) {
    if (reminder.archived || reminder.last_notified_on === today) continue;
    const due = nextDue(reminder, today);
    if (!due) continue;
    const days = daysBetween(today, due);
    const last = reminder.last_notified_on ?? "";
    const comingUp = days > 0 && days === reminder.notify_days_before;
    const dueToday = days === 0;
    const overdue = days < 0 && last < due;
    if (comingUp || dueToday || overdue) {
      notices.push({ reminder, title: reminder.title, body: describe(days, due) });
    }
  }
  return notices;
}
