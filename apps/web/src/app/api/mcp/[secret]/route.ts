import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { handleBody } from "@/lib/assistant/mcp";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";

const SECRET = /^[0-9a-f]{64}$/;

/**
 * POST /api/mcp/<secret>: the Glactivity connector for Claude.
 *
 * The secret is the only key: it lives in the database (private.agent_links)
 * and every database function this calls checks it and acts for its owner.
 * Nothing secret is stored in Vercel or the repository.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/mcp/[secret]">) {
  const { secret } = await ctx.params;
  if (!SECRET.test(secret)) return new NextResponse(null, { status: 404 });

  const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  // A wrong link is turned away before anything runs, so adding it to Claude fails at once.
  const { data: known } = await db.rpc("agent_link_ok", { secret });
  if (known !== true) return new NextResponse(null, { status: 404 });

  const body = await request.json().catch(() => undefined);

  const reply = await handleBody(body, async (fn, args) => {
    const { data, error } = await db.rpc(fn, { secret, ...args });
    if (error) throw new Error(error.message);
    return data;
  });
  if (reply === null) return new NextResponse(null, { status: 202 });
  return NextResponse.json(reply);
}

// No server-to-client stream and no sessions: the spec allows answering 405.
export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
