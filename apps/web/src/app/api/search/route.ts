import { NextResponse, type NextRequest } from "next/server";
import { mapItunes, mapOpenLibrary, searchUrl, type SearchKind } from "@/lib/search";

const KINDS: SearchKind[] = ["albums", "movies", "books"];

/** GET /api/search?kind=albums&q=in+rainbows → covers and links for the lists. */
export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind") as SearchKind;
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!KINDS.includes(kind) || q.length < 2 || q.length > 100) {
    return NextResponse.json({ error: "kind must be albums, movies or books; q 2–100 chars" }, { status: 400 });
  }
  try {
    const response = await fetch(searchUrl(kind, q), { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`search answered ${response.status}`);
    const json = await response.json();
    return NextResponse.json(kind === "books" ? mapOpenLibrary(json) : mapItunes(json, kind));
  } catch {
    return NextResponse.json({ error: "Search is unavailable right now" }, { status: 502 });
  }
}
