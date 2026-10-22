/** Wall-clock time in a named zone → UTC instant, using the platform's tz rules. */

const WINDOWS_ZONES: Record<string, string> = {
  "GMT Standard Time": "Europe/London",
  "Greenwich Standard Time": "Atlantic/Reykjavik",
  "W. Europe Standard Time": "Europe/Berlin",
  "Romance Standard Time": "Europe/Paris",
  "Central Europe Standard Time": "Europe/Budapest",
  "UTC": "UTC",
};

export const DEFAULT_ZONE = "Europe/London";

function isValidZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Turns a TZID (IANA or Windows name, possibly with a vendor prefix) into an IANA zone. */
export function resolveZone(tzid: string | null | undefined): string {
  if (!tzid) return DEFAULT_ZONE;
  const cleaned = tzid.replace(/^\/[^/]+\/[^/]+\//, "").replace(/^"|"$/g, "").trim();
  if (WINDOWS_ZONES[cleaned]) return WINDOWS_ZONES[cleaned];
  return isValidZone(cleaned) ? cleaned : DEFAULT_ZONE;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Offset of `zone` from UTC at a given instant, in milliseconds. */
function offsetAt(instant: number, zone: string): number {
  let format = formatters.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(zone, format);
  }
  const parts = Object.fromEntries(format.formatToParts(instant).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

export type WallTime = { year: number; month: number; day: number; hour: number; minute: number; second: number };

export function wallTimeToUtc(t: WallTime, zone: string): Date {
  const guess = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
  const first = offsetAt(guess, zone);
  let utc = guess - first;
  const second = offsetAt(utc, zone);
  if (second !== first) utc = guess - second;
  return new Date(utc);
}
