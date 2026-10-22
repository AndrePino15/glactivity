import { NextResponse, type NextRequest } from "next/server";
import { getHolidays } from "@/lib/holidays.server";

/** GET /api/holidays?from=2026-10-01&to=2027-01-31 → UK and Portuguese holidays in range. */
export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from") ?? "";
  const to = request.nextUrl.searchParams.get("to") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return NextResponse.json({ error: "from and to must be dates, from ≤ to" }, { status: 400 });
  }
  const years = new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))]);
  const lists = await Promise.allSettled(
    [...years].flatMap((year) => [getHolidays("GB", year), getHolidays("PT", year)]),
  );
  const holidays = lists
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .filter((h) => h.date >= from && h.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
  return NextResponse.json(holidays);
}
