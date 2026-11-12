import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const FIRE_URL = /^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/[A-Za-z0-9_-]+\/fire$/;

const londonTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/**
 * POST /api/assistant/run {"reason"?: "task"}: starts the assistant's check now
 * by firing the API trigger of the owner's Claude scheduled task. The trigger
 * URL and token live in the database (private.run_now), so they never reach
 * the browser or Vercel's settings; the run uses the owner's subscription.
 */
export async function POST(request: Request) {
  const db = await createSupabaseServerClient();
  const { data: auth } = await db.auth.getClaims();
  if (!auth?.claims) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { reason } = (await request.json().catch(() => ({}))) as { reason?: string };
  const { data: claim, error } = await db.rpc("claim_run_now");
  if (error) return NextResponse.json({ error: "Couldn’t check Run now" }, { status: 500 });
  if (!claim) return NextResponse.json({ error: "Run now isn’t set up" }, { status: 409 });
  if ("wait_seconds" in claim) {
    return NextResponse.json({ error: "Started a moment ago", wait_seconds: claim.wait_seconds }, { status: 429 });
  }
  const { fire_url: url, token } = claim as { fire_url: string; token: string };
  if (!FIRE_URL.test(url)) return NextResponse.json({ error: "Run now isn’t set up" }, { status: 409 });

  // The check reads this as information, not instructions.
  const text =
    `Run now, from the Glactivity app at ${londonTime.format(new Date())} UK time.` +
    (reason === "task"
      ? " The owner has just described a new task in the app."
      : reason === "goal"
        ? " The owner has just described a goal, or answered questions about one, in the app."
        : "");

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "experimental-cc-routine-2026-04-01",
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      await db.rpc("release_run_now", { reason: `Claude answered ${response.status}` });
      return NextResponse.json({ error: `Claude answered ${response.status}`, status: response.status }, { status: 502 });
    }
    const body = (await response.json().catch(() => ({}))) as { claude_code_session_url?: string };
    return NextResponse.json({ started: true, session_url: body.claude_code_session_url ?? null });
  } catch {
    await db.rpc("release_run_now", { reason: "couldn’t reach Claude" });
    return NextResponse.json({ error: "Couldn’t reach Claude" }, { status: 502 });
  }
}
