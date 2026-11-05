import { NextResponse, type NextRequest } from "next/server";
import { sendPush } from "@/lib/push.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** POST /api/push/test — sends "notifications are on" to your devices. */
export async function POST(request: NextRequest) {
  const db = await createSupabaseServerClient();
  const { data: auth } = await db.auth.getClaims();
  if (!auth?.claims) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const [{ data: keys }, { data: devices }] = await Promise.all([
    db.rpc("my_push_keys"),
    db.from("push_subscriptions").select("endpoint, p256dh, auth"),
  ]);
  if (!keys?.public || !keys?.private) return NextResponse.json({ error: "Turn notifications on first" }, { status: 409 });

  let sent = 0;
  for (const device of devices ?? []) {
    const status = await sendPush(
      device,
      { title: "Glactivity", body: "Notifications are on. Reminders will show up here.", url: "/" },
      keys,
      request.nextUrl.origin,
    );
    if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("endpoint", device.endpoint);
    else if (status < 300) sent++;
  }
  return NextResponse.json({ sent });
}
