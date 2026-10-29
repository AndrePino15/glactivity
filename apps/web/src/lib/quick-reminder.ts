import { addDays, addMonths, fromISODate, type ISODate } from "./dates";
import type { Recurrence } from "./db/types";

export type QuickReminder = { title: string; due_on: ISODate; recurrence: Recurrence };

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*";
const ORDINAL = "(\\d{1,2})(?:st|nd|rd|th)?";

const pad = (n: number) => String(n).padStart(2, "0");

/** The next date (today or later) with this day and month. */
function nextDayMonth(today: ISODate, month: number, day: number): ISODate {
  const year = Number(today.slice(0, 4));
  const candidate = `${year}-${pad(month)}-${pad(day)}`;
  return candidate >= today ? candidate : `${year + 1}-${pad(month)}-${pad(day)}`;
}

/** The next date (today or later) on this day of the month, clamped to short months. */
function nextDayOfMonth(today: ISODate, day: number): ISODate {
  const thisMonth = addMonths(`${today.slice(0, 8)}01`, 0, day);
  return thisMonth >= today ? thisMonth : addMonths(`${today.slice(0, 8)}01`, 1, day);
}

/**
 * Reads a one-line reminder like "Pay rent on the 1st every month" or
 * "Call the landlord tomorrow". Anything without a date is due today.
 */
export function parseQuickReminder(input: string, today: ISODate): QuickReminder {
  let text = ` ${input.trim()} `;
  let recurrence: Recurrence = "none";
  let due: ISODate | null = null;

  const take = (pattern: RegExp, handle: (m: RegExpMatchArray) => void) => {
    const match = text.match(pattern);
    if (!match) return false;
    handle(match);
    text = text.replace(match[0], " ");
    return true;
  };

  type Rule = [RegExp, (m: RegExpMatchArray) => void];
  const firstMatch = (rules: Rule[]) => rules.some(([pattern, handle]) => take(pattern, handle));

  firstMatch([
    [/\s(?:every|each)\s+(week|month|year)\b/i, (m) => (recurrence = (m[1].toLowerCase() + "ly") as Recurrence)],
    [
      /\s(weekly|monthly|yearly|annually)\b/i,
      (m) => (recurrence = m[1].toLowerCase() === "annually" ? "yearly" : (m[1].toLowerCase() as Recurrence)),
    ],
  ]);

  const on = "(?:\\s(?:on|by|due|for))?";
  firstMatch([
    [new RegExp(`${on}\\s(today|tonight)\\b`, "i"), () => (due = today)],
    [new RegExp(`${on}\\s(tomorrow)\\b`, "i"), () => (due = addDays(today, 1))],
    [
      new RegExp(`${on}\\sin\\s(\\d+)\\s(day|week)s?\\b`, "i"),
      (m) => (due = addDays(today, Number(m[1]) * (m[2].toLowerCase() === "week" ? 7 : 1))),
    ],
    [
      new RegExp(`${on}\\s(?:the\\s)?${ORDINAL}\\s(?:of\\s)?${MONTH}\\b`, "i"),
      (m) => (due = nextDayMonth(today, MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, Number(m[1]))),
    ],
    [
      new RegExp(`${on}\\s${MONTH}\\s${ORDINAL}\\b`, "i"),
      (m) => (due = nextDayMonth(today, MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, Number(m[2]))),
    ],
    [
      new RegExp(`${on}\\s(\\d{1,2})/(\\d{1,2})\\b`),
      (m) => (due = nextDayMonth(today, Number(m[2]), Number(m[1]))),
    ],
    [
      new RegExp(`${on}\\s(?:next\\s)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*\\b`, "i"),
      (m) => {
        const ahead = (WEEKDAYS.indexOf(m[1].toLowerCase()) - fromISODate(today).getDay() + 7) % 7;
        due = addDays(today, ahead === 0 ? 7 : ahead);
      },
    ],
    [new RegExp(`${on}\\s(?:the\\s)${ORDINAL}\\b`, "i"), (m) => (due = nextDayOfMonth(today, Number(m[1])))],
  ]);

  const title = text.replace(/\s{2,}/g, " ").trim().replace(/[,;]$/, "");
  return { title: title || input.trim(), due_on: due ?? today, recurrence };
}
