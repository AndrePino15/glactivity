import { addDays, fromISODate, type ISODate } from "./dates";

/**
 * Ticked items stay "in the basket" until shopping day is over. This returns
 * the start of the day after the most recent shopping day: anything ticked
 * before it has been bought and can be cleared.
 */
export function clearTickedBefore(today: ISODate, shoppingDay: number): ISODate {
  const dayAfterShopping = (shoppingDay + 1) % 7;
  const weekday = fromISODate(today).getDay();
  return addDays(today, -((weekday - dayAfterShopping + 7) % 7));
}
