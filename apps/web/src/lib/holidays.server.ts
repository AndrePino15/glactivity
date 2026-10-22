import "server-only";
import { cacheLife } from "next/cache";
import type { Country } from "./db/types";
import { parseGovUk, parseNager, type Holiday } from "./holidays";

async function fetchJson(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

/** Public holidays for one country and year, cached for a day. */
export async function getHolidays(country: Country, year: number): Promise<Holiday[]> {
  "use cache";
  cacheLife("days");
  if (country === "GB") {
    const all = parseGovUk(await fetchJson("https://www.gov.uk/bank-holidays.json"));
    return all.filter((h) => h.date.startsWith(String(year)));
  }
  return parseNager(await fetchJson(`https://date.nager.at/api/v3/PublicHolidays/${year}/PT`));
}
