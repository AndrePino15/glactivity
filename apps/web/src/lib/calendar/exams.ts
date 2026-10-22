import type { ISODate } from "../dates";

export type ParsedExam = {
  title: string;
  date: ISODate;
  start: string; // HH:MM, UK time
  end: string;
  /** False when no time was found and 09:00 was assumed. */
  timeKnown: boolean;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";
const WEEKDAY = "\\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\\.?,?\\s*";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Exams are upcoming, so a date without a year means the next one from about now. */
function withYear(month: number, day: number, year: number | null, today: ISODate): ISODate {
  if (year) return iso(year < 100 ? 2000 + year : year, month, day);
  const thisYear = Number(today.slice(0, 4));
  const candidate = iso(thisYear, month, day);
  return candidate >= iso(thisYear, Number(today.slice(5, 7)) - 1 || 1, 1) ? candidate : iso(thisYear + 1, month, day);
}

function takeDate(line: string, today: ISODate): { date: ISODate; rest: string } | null {
  const patterns: [RegExp, (m: RegExpMatchArray) => ISODate][] = [
    [/\b(\d{4})-(\d{2})-(\d{2})\b/, (m) => iso(+m[1], +m[2], +m[3])],
    [/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/, (m) => withYear(+m[2], +m[1], +m[3], today)],
    [
      new RegExp(`(?:${WEEKDAY})?\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}(?:,?\\s+(\\d{4}))?`, "i"),
      (m) => withYear(MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[1], m[3] ? +m[3] : null, today),
    ],
    [
      new RegExp(`(?:${WEEKDAY})?\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`, "i"),
      (m) => withYear(MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2], m[3] ? +m[3] : null, today),
    ],
  ];
  for (const [pattern, toDate] of patterns) {
    const match = line.match(pattern);
    if (match) return { date: toDate(match), rest: line.replace(match[0], " ") };
  }
  return null;
}

function takeTimes(line: string): { times: string[]; rest: string } {
  const times: string[] = [];
  const rest = line.replace(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b/gi, (whole, h, m, meridiem) => {
    if (!m && !meridiem) return whole; // a bare number, not a time
    let hour = Number(h);
    if (hour > 23 || Number(m ?? 0) > 59) return whole;
    if (meridiem?.toLowerCase() === "pm" && hour < 12) hour += 12;
    if (meridiem?.toLowerCase() === "am" && hour === 12) hour = 0;
    times.push(`${pad(hour)}:${m ?? "00"}`);
    return " ";
  });
  return { times, rest };
}

function takeDuration(line: string): { minutes: number | null; rest: string } {
  const hours = line.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
  if (hours) return { minutes: Math.round(Number(hours[1]) * 60), rest: line.replace(hours[0], " ") };
  const mins = line.match(/(\d+)\s*(?:minutes?|mins?)\b/i);
  if (mins) return { minutes: Number(mins[1]), rest: line.replace(mins[0], " ") };
  return { minutes: null, rest: line };
}

function addMinutes(time: string, minutes: number) {
  const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + minutes;
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
}

/**
 * Reads exams out of text copied from an exam timetable page. Each line with
 * a module code (like COMP1215) becomes an exam; a date on its own line
 * applies to the lines below it.
 */
export function parseExamText(text: string, today: ISODate): ParsedExam[] {
  const exams: ParsedExam[] = [];
  let carriedDate: ISODate | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\t+/g, "  ").trim();
    if (!line) continue;
    const dated = takeDate(line, today);
    if (dated) carriedDate = dated.date;
    const code = line.match(/\b[A-Z]{4}\d{4}\b/);
    if (!code || !carriedDate) continue;

    const { times, rest: afterTimes } = takeTimes(dated?.rest ?? line);
    const { minutes, rest } = takeDuration(afterTimes);
    const start = times[0] ?? "09:00";
    const end = times[1] ?? addMinutes(start, minutes ?? 120);
    const title = rest
      .replace(/\s*[|,;–-]\s*(?=[|,;–-]|$)/g, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s|,;–-]+|[\s|,;–-]+$/g, "");

    exams.push({ title: title || code[0], date: carriedDate, start, end, timeKnown: times.length > 0 });
  }
  return exams;
}
