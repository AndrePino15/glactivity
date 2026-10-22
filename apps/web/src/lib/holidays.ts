import type { ISODate } from "./dates";
import type { Country } from "./db/types";

export type Holiday = { country: Country; date: ISODate; name: string };

/** gov.uk/bank-holidays.json → England and Wales bank holidays. */
export function parseGovUk(json: unknown): Holiday[] {
  const events = (json as { "england-and-wales"?: { events?: { title: string; date: string }[] } })?.[
    "england-and-wales"
  ]?.events;
  return (events ?? []).map((e) => ({ country: "GB", date: e.date, name: e.title }));
}

/** date.nager.at → national Portuguese holidays (regional ones skipped), in Portuguese. */
export function parseNager(json: unknown): Holiday[] {
  const days = json as { date: string; localName: string; global: boolean }[];
  return (Array.isArray(days) ? days : [])
    .filter((d) => d.global)
    .map((d) => ({ country: "PT", date: d.date, name: d.localName }));
}
