import { NextResponse } from "next/server";
import { generateKeys } from "@/lib/push.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** POST /api/push/keys — the public push key, created on first use. */
export async function POST() {
  const db = await createSupabaseServerClient();
  const { data: auth } = await db.auth.getClaims();
  if (!auth?.claims) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: existing, error } = await db.rpc("vapid_public_key");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (existing) return NextResponse.json({ publicKey: existing });

  const keys = generateKeys();
  // If two devices race, the database keeps the first pair and returns it.
  const { data: stored, error: initError } = await db.rpc("init_vapid", {
    public_key: keys.public,
    private_key: keys.private,
  });
  if (initError) return NextResponse.json({ error: initError.message }, { status: 500 });
  return NextResponse.json({ publicKey: stored });
}
