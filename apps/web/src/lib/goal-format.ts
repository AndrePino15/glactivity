import { daysBetween, fromISODate, type ISODate } from "./dates";

const dayMonthYear = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/** "30 Sep 2027", or "30 Sep" within the next ten months. */
export function formatTarget(date: ISODate, today: ISODate): string {
  const near = date >= today && daysBetween(today, date) < 300;
  return (near ? dayMonth : dayMonthYear).format(fromISODate(date));
}

/** "in 3 weeks", "in 9 months", "today", "2 days ago" */
export function timeUntil(date: ISODate, today: ISODate): string {
  const days = daysBetween(today, date);
  if (days === 0) return "today";
  if (days < 0) return days === -1 ? "yesterday" : `${-days} days ago`;
  if (days === 1) return "tomorrow";
  if (days < 21) return `in ${days} days`;
  if (days < 70) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30.4)} months`;
}

export const hours = (minutes: number) => {
  const h = Math.round((minutes / 60) * 2) / 2;
  return `${h % 1 === 0 ? h.toFixed(0) : h.toFixed(1)} h`;
};
